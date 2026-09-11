import { toHex, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { X402Config } from "./config.js";
import { encryptAndUpload, downloadAndDecrypt } from "./crypto.js";
import { deriveBuyer, signTransferAuth, buildSettleProof } from "./buyer.js";
import { createResource, packUri, resourceIdFromName } from "./resource.js";
import { verifyRegister, settleClaim } from "./facilitator-client.js";

export interface SoldResource {
  resourceId: Hex;
  name: string;
  plaintextHash: Hex;
  uri: string;
  price: bigint;
  txHash: Hex;
}

/**
 * Seller: envelope-encrypt `plaintext`, upload it to the access worker, and
 * register a paid resource on the SettlementRegistry.
 */
export async function sellResource(opts: {
  config: X402Config;
  ownerWallet: WalletClient;
  publicClient: PublicClient;
  name: string;
  plaintext: Uint8Array;
  price: bigint;
}): Promise<SoldResource> {
  const { config } = opts;
  const resourceId = resourceIdFromName(opts.name);
  const { plaintextHash } = await encryptAndUpload({
    plaintext: opts.plaintext,
    resourceId,
    workerUrl: config.workerUrl,
  });
  const uri = packUri(config.workerUrl, plaintextHash);
  const txHash = await createResource({
    ownerWallet: opts.ownerWallet,
    publicClient: opts.publicClient,
    registry: config.settlementRegistry,
    resourceId,
    price: opts.price,
    uri,
  });
  return { resourceId, name: opts.name, plaintextHash, uri, price: opts.price, txHash };
}

export interface FetchedResource {
  plaintext: Uint8Array;
  text: string;
  nullifier: string;
  stealthAddress: Address;
  paidNow: boolean;
}

/**
 * Buyer: pay for and decrypt a resource. Registers (idempotent) + settles the
 * first time; on a repeat access the settle is skipped (the nullifier is
 * already used) and it decrypts directly. The buyer's main wallet never appears
 * in the settlement - the stealth address does.
 */
export async function payAndFetch(opts: {
  config: X402Config;
  buyerWallet: WalletClient;
  publicClient: PublicClient;
  owner: Address;
  name: string;
  price: bigint;
  expectedPlaintextHash?: Hex;
}): Promise<FetchedResource> {
  const { config } = opts;
  const resourceId = resourceIdFromName(opts.name);
  const { identity, stealthKey, stealthAddress } = await deriveBuyer(opts.buyerWallet);

  const payment = await signTransferAuth(opts.buyerWallet, {
    to: opts.owner,
    amount: opts.price,
    usdcAddress: config.usdc,
    usdcDomainName: config.usdcDomainName,
    usdcDomainVersion: config.usdcDomainVersion,
  });

  // register() bundles the ERC-3009 payment atomically, so whether a real
  // payment happened this call is exactly whether it was a fresh registration.
  const { alreadyRegistered } = await verifyRegister(config.facilitatorUrl, {
    resourceId,
    identityCommitment: identity.commitment.toString(),
    payment,
  });
  const paidNow = !alreadyRegistered;

  const proof = await buildSettleProof({
    publicClient: opts.publicClient,
    registry: config.settlementRegistry,
    identity,
    resourceId,
    stealthAddress,
  });

  try {
    await settleClaim(config.facilitatorUrl, {
      resourceId,
      stealthAddress,
      merkleTreeDepth: proof.merkleTreeDepth,
      merkleTreeRoot: proof.merkleTreeRoot,
      nullifier: proof.nullifier,
      message: proof.message,
      points: proof.points,
      hookData: proof.hookData,
    });
  } catch {
    // Nullifier already used → already settled for this (resource, identity).
    // Fall through to /access, which the recorded settlement still satisfies.
  }

  const stealthAccount = privateKeyToAccount(stealthKey);
  const plaintext = await downloadAndDecrypt({
    resourceId,
    workerUrl: config.workerUrl,
    signer: stealthAccount,
    nullifier: toHex(BigInt(proof.nullifier)),
    expectedPlaintextHash: opts.expectedPlaintextHash,
  });

  return { plaintext, text: new TextDecoder().decode(plaintext), nullifier: proof.nullifier, stealthAddress, paidNow };
}
