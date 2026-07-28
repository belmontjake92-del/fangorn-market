// Buyer-side x402f helpers, ported from the x402f reference (examples/node/
// paid.ts). Composes viem + Semaphore to produce exactly what the facilitator
// relays: an EIP-3009 authorization + identity commitment (register) and a
// Semaphore membership proof (settle).
import {
  encodePacked,
  keccak256,
  parseSignature,
  toBytes,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";

/** register() adds every member to ONE global group and emits this event. */
export const MEMBER_REGISTERED_EVENT = {
  name: "MemberRegistered",
  type: "event",
  inputs: [
    { name: "resourceId", type: "bytes32", indexed: true },
    { name: "identityCommitment", type: "uint256", indexed: false },
  ],
} as const;

export interface Erc3009Payment {
  from: Address;
  to: Address;
  amount: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
  v: number;
  r: Hex;
  s: Hex;
}

export interface SettleProof {
  resourceId: Hex;
  stealthAddress: Address;
  merkleTreeDepth: string;
  merkleTreeRoot: string;
  nullifier: string;
  message: string;
  points: string[];
  hookData: Hex;
}

/**
 * Deterministic Semaphore identity + stealth key from the buyer's wallet. The
 * identity commitment is registered in the group; the stealth address is what
 * settlement (and the worker's /access gate) is keyed on, so the buyer's main
 * wallet never appears in the settlement.
 */
export async function deriveBuyer(
  walletClient: WalletClient,
): Promise<{ identity: Identity; stealthKey: Hex; stealthAddress: Address }> {
  const account = walletClient.account;
  if (!account) throw new Error("walletClient has no account");
  const signature = await walletClient.signMessage({ account, message: "fangorn:identity:v1" });
  const identity = new Identity(keccak256(toBytes(signature)));
  const stealthKey = keccak256(
    encodePacked(["string", "bytes32"], ["fangorn:stealth:", toHex(identity.secretScalar, { size: 32 })]),
  ) as Hex;
  const stealthAddress = privateKeyToAccount(stealthKey).address;
  return { identity, stealthKey, stealthAddress };
}

/** Sign an EIP-3009 transferWithAuthorization for `amount` USDC, paying `to`. */
export async function signTransferAuth(
  walletClient: WalletClient,
  params: { to: Address; amount: bigint; usdcAddress: Address; usdcDomainName: string; usdcDomainVersion: string },
): Promise<Erc3009Payment> {
  const account = walletClient.account;
  if (!account) throw new Error("walletClient has no account");
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));

  const signature = await walletClient.signTypedData({
    account,
    domain: {
      name: params.usdcDomainName,
      version: params.usdcDomainVersion,
      chainId: arbitrumSepolia.id,
      verifyingContract: params.usdcAddress,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: { from: account.address, to: params.to, value: params.amount, validAfter, validBefore, nonce },
  });

  const sig = parseSignature(signature);
  const v = Number(sig.v ?? BigInt(27 + (sig.yParity ?? 0)));
  return {
    from: account.address,
    to: params.to,
    amount: params.amount.toString(),
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce,
    v,
    r: sig.r,
    s: sig.s,
  };
}

/**
 * Rebuild the global Semaphore group from on-chain events and prove membership
 * for `resourceId`. Must run AFTER register. Uses a public-RPC PublicClient so
 * the `fromBlock 0` getLogs isn't rejected by a rate-limited provider.
 *
 * The register tx (relayed by /verify) may not be mined/indexed the instant
 * /verify returns, so we poll the MemberRegistered logs until the buyer's
 * commitment appears before proving.
 */
export async function buildSettleProof(params: {
  publicClient: PublicClient;
  registry: Address;
  identity: Identity;
  resourceId: Hex;
  stealthAddress: Address;
  maxAttempts?: number;
  intervalMs?: number;
}): Promise<SettleProof> {
  const { publicClient, registry, identity, resourceId, stealthAddress } = params;
  const maxAttempts = params.maxAttempts ?? 20;
  const intervalMs = params.intervalMs ?? 2000;

  const target = identity.commitment.toString();
  let group = new Group();
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const logs = await publicClient.getLogs({ address: registry, event: MEMBER_REGISTERED_EVENT, fromBlock: 0n });
    group = new Group();
    for (const log of logs) group.addMember((log.args as { identityCommitment: bigint }).identityCommitment);
    if (group.members.map(String).includes(target)) break;
    if (attempt === maxAttempts - 1) {
      throw new Error(
        "identity commitment not in group after register — the register tx may have reverted (check the /verify response and USDC EIP-3009 support)",
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  const proof = await generateProof(identity, group, BigInt(stealthAddress), BigInt(resourceId));

  return {
    resourceId,
    stealthAddress,
    merkleTreeDepth: proof.merkleTreeDepth.toString(),
    merkleTreeRoot: proof.merkleTreeRoot.toString(),
    nullifier: proof.nullifier.toString(),
    message: proof.message.toString(),
    points: proof.points.map(String),
    hookData: "0x",
  };
}
