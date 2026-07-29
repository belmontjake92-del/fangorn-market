// Self-contained envelope crypto for the Robinhood-Chain paid-data flow. Because
// we control BOTH the seller-side seal and the worker-side unseal, we use our own
// clean scheme (no need to match Fangorn's byte formats):
//
//   data  : AES-256-GCM(dek, plaintext)                       → nonce ‖ ct
//   dek   : sealed to the worker's X25519 pubkey (ECIES)      → ephPub ‖ nonce ‖ ct
//
// The worker holds the X25519 private key; it unseals the DEK only after checking
// on-chain settlement.
import { x25519 } from "@noble/curves/ed25519";
import { gcm } from "@noble/ciphers/aes";
import { bytesToHex, hexToBytes, sha256 as viemSha256, type Hex } from "viem";

const NONCE = 12;
const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));
const sha256 = (bytes: Uint8Array): Uint8Array => hexToBytes(viemSha256(bytes));

export interface WorkerKeypair {
  privateKey: Hex; // 32-byte X25519 scalar
  publicKey: Hex; // 32-byte X25519 point
}

export function generateWorkerKeypair(): WorkerKeypair {
  const priv = x25519.utils.randomPrivateKey();
  return { privateKey: bytesToHex(priv), publicKey: bytesToHex(x25519.getPublicKey(priv)) };
}

/** AES-256-GCM encrypt → nonce ‖ ciphertext. */
export function encryptData(plaintext: Uint8Array, dek: Uint8Array): Uint8Array {
  const nonce = randomBytes(NONCE);
  const ct = gcm(dek, nonce).encrypt(plaintext);
  return concat(nonce, ct);
}

export function decryptData(blob: Uint8Array, dek: Uint8Array): Uint8Array {
  return gcm(dek, blob.slice(0, NONCE)).decrypt(blob.slice(NONCE));
}

/** Seal a 32-byte DEK to `workerPub` → ephPub(32) ‖ nonce(12) ‖ ct. */
export function sealDek(dek: Uint8Array, workerPub: Uint8Array): Uint8Array {
  const eph = x25519.utils.randomPrivateKey();
  const ephPub = x25519.getPublicKey(eph);
  const shared = x25519.getSharedSecret(eph, workerPub);
  const key = sha256(shared);
  const nonce = randomBytes(NONCE);
  const ct = gcm(key, nonce).encrypt(dek);
  return concat(ephPub, nonce, ct);
}

/** Unseal a DEK with the worker's private key. */
export function unsealDek(sealed: Uint8Array, workerPriv: Uint8Array): Uint8Array {
  const ephPub = sealed.slice(0, 32);
  const nonce = sealed.slice(32, 32 + NONCE);
  const ct = sealed.slice(32 + NONCE);
  const shared = x25519.getSharedSecret(workerPriv, ephPub);
  const key = sha256(shared);
  return gcm(key, nonce).decrypt(ct);
}

export const toHex = bytesToHex;
export const fromHex = hexToBytes;
export const randomDek = (): Uint8Array => randomBytes(32);

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}
