// Stealth mode for Robinhood Chain paid data. Same pay-to-decrypt flow as rh.ts,
// but access is proven with a Semaphore zero-knowledge proof of membership in
// the resource's paid group, so the access worker never learns which paying
// member is decrypting. Payment (joining the group) is public; access is not.
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import { keccak256, parseAbiItem, parseSignature, toBytes, toHex, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { decryptData, fromHex } from "./rh-crypto.js";
import { resourceIdFromName, type RhX402Config } from "./rh.js";

const RH_CHAIN_ID = 46630;

export interface RhStealthConfig extends RhX402Config {
  semaphore: Address;
  /** Block the Semaphore contract was deployed at, to bound log scans. */
  fromBlock: bigint;
}

const STEALTH_ABI = [
  {
    inputs: [
      { name: "resourceId", type: "bytes32" }, { name: "identityCommitment", type: "uint256" }, { name: "from", type: "address" },
      { name: "amount", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" }, { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" },
    ],
    name: "pay", outputs: [], stateMutability: "nonpayable", type: "function",
  },
  { inputs: [{ name: "resourceId", type: "bytes32" }, { name: "identityCommitment", type: "uint256" }], name: "isMember", outputs: [{ name: "", type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "resourceId", type: "bytes32" }], name: "getResource", outputs: [{ name: "owner", type: "address" }, { name: "price", type: "uint256" }, { name: "groupId", type: "uint256" }, { name: "uri", type: "string" }], stateMutability: "view", type: "function" },
] as const;

const MEMBER_ADDED = parseAbiItem("event MemberAdded(uint256 indexed groupId, uint256 index, uint256 identityCommitment, uint256 merkleTreeRoot)");

/** Deterministic Semaphore identity for a wallet (recoverable, never leaves the device). */
export async function deriveStealthIdentity(wallet: WalletClient): Promise<Identity> {
  const account = wallet.account;
  if (!account) throw new Error("wallet has no account");
  const sig = await wallet.signMessage({ account, message: "fangorn:identity:rh-stealth:v1" });
  return new Identity(keccak256(toBytes(sig)));
}

async function loadGroup(publicClient: PublicClient, config: RhStealthConfig, groupId: bigint): Promise<Group> {
  const logs = await publicClient.getLogs({ address: config.semaphore, event: MEMBER_ADDED, args: { groupId }, fromBlock: config.fromBlock });
  const members = logs
    .map((l) => ({ index: l.args.index!, commitment: l.args.identityCommitment! }))
    .sort((a, b) => Number(a.index - b.index))
    .map((m) => m.commitment);
  return new Group(members);
}

export interface RhStealthFetched {
  plaintext: Uint8Array;
  text: string;
  paidNow: boolean;
  identityCommitment: bigint;
  nullifier: string;
}

/**
 * Buyer: join the resource's paid group (gasless EIP-3009 payment, relayed), then
 * prove membership in zero knowledge to the worker to receive the decryption key.
 */
export async function payAndFetchStealth(opts: {
  config: RhStealthConfig;
  buyerWallet: WalletClient;
  relayerWallet: WalletClient;
  publicClient: PublicClient;
  owner: Address;
  name: string;
  price: bigint;
}): Promise<RhStealthFetched> {
  const { config } = opts;
  const resourceId = resourceIdFromName(opts.name);
  const buyer = opts.buyerWallet.account;
  const relayer = opts.relayerWallet.account;
  if (!buyer || !relayer) throw new Error("buyer/relayer wallet missing account");

  const identity = await deriveStealthIdentity(opts.buyerWallet);
  const commitment = identity.commitment;

  const member = (await opts.publicClient.readContract({
    address: config.registry, abi: STEALTH_ABI, functionName: "isMember", args: [resourceId, commitment],
  })) as boolean;

  let paidNow = false;
  if (!member) {
    const validAfter = 0n;
    const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const signature = await opts.buyerWallet.signTypedData({
      account: buyer,
      domain: { name: config.usdcDomainName, version: config.usdcDomainVersion, chainId: RH_CHAIN_ID, verifyingContract: config.usdc },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: { from: buyer.address, to: opts.owner, value: opts.price, validAfter, validBefore, nonce },
    });
    const sig = parseSignature(signature);
    const v = Number(sig.v ?? BigInt(27 + (sig.yParity ?? 0)));
    const payTx = await opts.relayerWallet.writeContract({
      address: config.registry,
      abi: STEALTH_ABI,
      functionName: "pay",
      args: [resourceId, commitment, buyer.address, opts.price, validAfter, validBefore, nonce, v, sig.r, sig.s],
      account: relayer,
      chain: opts.relayerWallet.chain,
    });
    await opts.publicClient.waitForTransactionReceipt({ hash: payTx });
    paidNow = true;
  }

  // Rebuild the group from chain and prove membership. message = timestamp (freshness),
  // scope = resourceId (proof only works for this resource).
  const [, , groupId] = (await opts.publicClient.readContract({
    address: config.registry, abi: STEALTH_ABI, functionName: "getResource", args: [resourceId],
  })) as readonly [Address, bigint, bigint, string];
  const group = await loadGroup(opts.publicClient, config, groupId);
  const proof = await generateProof(identity, group, BigInt(Math.floor(Date.now() / 1000)), BigInt(resourceId));

  const accessRes = await fetch(`${config.workerUrl}/access-stealth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resourceId, proof }),
  });
  if (!accessRes.ok) throw new Error(`worker /access-stealth failed: ${accessRes.status} ${await accessRes.text()}`);
  const dek = fromHex(((await accessRes.json()) as { dek: Hex }).dek);

  const ctRes = await fetch(`${config.workerUrl}/ct/${resourceId}`);
  if (!ctRes.ok) throw new Error(`worker /ct failed: ${ctRes.status}`);
  const plaintext = decryptData(new Uint8Array(await ctRes.arrayBuffer()), dek);
  return { plaintext, text: new TextDecoder().decode(plaintext), paidNow, identityCommitment: commitment, nullifier: String(proof.nullifier) };
}
