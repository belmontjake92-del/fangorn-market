// Robinhood-Chain-native paid data (pragmatic x402). Uses our PaidAccessRegistry
// + MockUSDC + our own access worker, with the self-contained envelope crypto.
// No Semaphore/facilitator - the buyer's address is settled directly (no ZK
// stealth privacy), but the paid-decrypt behavior is the same.
import {
  keccak256,
  parseSignature,
  stringToBytes,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { encryptData, decryptData, randomDek, sealDek, fromHex } from "./rh-crypto.js";

const RH_CHAIN_ID = 46630;

export interface RhX402Config {
  usdc: Address;
  registry: Address; // PaidAccessRegistry
  workerUrl: string;
  usdcDomainName: string;
  usdcDomainVersion: string;
}

export function resolveRhX402Config(env: NodeJS.ProcessEnv = process.env): RhX402Config {
  return {
    usdc: (env.RH_USDC ?? "") as Address,
    registry: (env.RH_PAID_REGISTRY ?? "") as Address,
    workerUrl: (env.RH_WORKER_URL ?? "http://localhost:4030").replace(/\/$/, ""),
    usdcDomainName: "USD Coin",
    usdcDomainVersion: "2",
  };
}

const REGISTRY_ABI = [
  { inputs: [{ name: "resourceId", type: "bytes32" }, { name: "price", type: "uint256" }, { name: "uri", type: "string" }], name: "createResource", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [
      { name: "resourceId", type: "bytes32" }, { name: "from", type: "address" }, { name: "amount", type: "uint256" },
      { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" },
    ],
    name: "pay", outputs: [], stateMutability: "nonpayable", type: "function",
  },
  { inputs: [{ name: "resourceId", type: "bytes32" }, { name: "buyer", type: "address" }], name: "isSettled", outputs: [{ name: "", type: "bool" }], stateMutability: "view", type: "function" },
] as const;

export const resourceIdFromName = (name: string): Hex => keccak256(stringToBytes(name));

async function getWorkerPubkey(workerUrl: string): Promise<Uint8Array> {
  const res = await fetch(`${workerUrl}/pubkey`);
  if (!res.ok) throw new Error(`worker /pubkey failed: ${res.status}`);
  return fromHex(((await res.json()) as { pubkey: Hex }).pubkey);
}

export interface RhSoldResource {
  resourceId: Hex;
  name: string;
  txHash: Hex;
}

/** Seller: encrypt, upload to our worker, register on the RH PaidAccessRegistry. */
export async function sellResourceRH(opts: {
  config: RhX402Config;
  ownerWallet: WalletClient;
  publicClient: PublicClient;
  name: string;
  plaintext: Uint8Array;
  price: bigint;
}): Promise<RhSoldResource> {
  const { config } = opts;
  const resourceId = resourceIdFromName(opts.name);
  const dek = randomDek();
  const ciphertext = encryptData(opts.plaintext, dek);
  const sealed = sealDek(dek, await getWorkerPubkey(config.workerUrl));

  const up = await fetch(`${config.workerUrl}/upload/${resourceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "X-Sealed-Dek": toHex(sealed) },
    body: ciphertext as unknown as BodyInit,
  });
  if (!up.ok) throw new Error(`worker /upload failed: ${up.status}`);

  const account = opts.ownerWallet.account;
  if (!account) throw new Error("ownerWallet has no account");
  const txHash = await opts.ownerWallet.writeContract({
    address: config.registry,
    abi: REGISTRY_ABI,
    functionName: "createResource",
    args: [resourceId, opts.price, config.workerUrl],
    account,
    chain: opts.ownerWallet.chain,
  });
  await opts.publicClient.waitForTransactionReceipt({ hash: txHash });
  return { resourceId, name: opts.name, txHash };
}

export interface RhFetched {
  plaintext: Uint8Array;
  text: string;
  paidNow: boolean;
}

/**
 * Buyer: pay for + decrypt a resource on Robinhood Chain. The buyer signs an
 * EIP-3009 authorization (no gas) which the RELAYER submits via
 * PaidAccessRegistry.pay; then the buyer proves address ownership to the worker,
 * which releases the DEK if settlement is recorded.
 */
export async function payAndFetchRH(opts: {
  config: RhX402Config;
  buyerWallet: WalletClient;
  relayerWallet: WalletClient;
  publicClient: PublicClient;
  owner: Address;
  name: string;
  price: bigint;
}): Promise<RhFetched> {
  const { config } = opts;
  const resourceId = resourceIdFromName(opts.name);
  const buyer = opts.buyerWallet.account;
  const relayer = opts.relayerWallet.account;
  if (!buyer || !relayer) throw new Error("buyer/relayer wallet missing account");

  const alreadySettled = (await opts.publicClient.readContract({
    address: config.registry,
    abi: REGISTRY_ABI,
    functionName: "isSettled",
    args: [resourceId, buyer.address],
  })) as boolean;

  let paidNow = false;
  if (!alreadySettled) {
    // Buyer signs an EIP-3009 transferWithAuthorization paying the owner.
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

    // Relayer submits pay() so the buyer needs no gas.
    const payTx = await opts.relayerWallet.writeContract({
      address: config.registry,
      abi: REGISTRY_ABI,
      functionName: "pay",
      args: [resourceId, buyer.address, opts.price, validAfter, validBefore, nonce, v, sig.r, sig.s],
      account: relayer,
      chain: opts.relayerWallet.chain,
    });
    await opts.publicClient.waitForTransactionReceipt({ hash: payTx });
    paidNow = true;
  }

  // Buyer proves address ownership to the worker; worker checks settlement + unseals.
  const ts = Math.floor(Date.now() / 1000);
  const message = `fangorn:access:${resourceId}:${ts}`;
  const accessSig = await opts.buyerWallet.signMessage({ account: buyer, message });
  const accessRes = await fetch(`${config.workerUrl}/access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resourceId, buyer: buyer.address, timestamp: ts, signature: accessSig }),
  });
  if (!accessRes.ok) throw new Error(`worker /access failed: ${accessRes.status} ${await accessRes.text()}`);
  const dek = fromHex(((await accessRes.json()) as { dek: Hex }).dek);

  const ctRes = await fetch(`${config.workerUrl}/ct/${resourceId}`);
  if (!ctRes.ok) throw new Error(`worker /ct failed: ${ctRes.status}`);
  const ciphertext = new Uint8Array(await ctRes.arrayBuffer());
  const plaintext = decryptData(ciphertext, dek);
  return { plaintext, text: new TextDecoder().decode(plaintext), paidNow };
}
