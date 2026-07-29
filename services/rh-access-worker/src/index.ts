/**
 * Robinhood-Chain access worker. Stores ciphertext + a DEK sealed to this
 * worker's X25519 key, and releases the DEK only to a buyer who (a) proves they
 * control the address and (b) has an on-chain settlement recorded in the
 * PaidAccessRegistry. Our own version of x402f's hosted access worker.
 *
 * Run: pnpm --filter @fangorn-market/rh-access-worker start
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import { createPublicClient, http, hexToBytes, recoverMessageAddress, type Address, type Hex, type PublicClient } from "viem";
import { findRepoRoot } from "@fangorn-market/shared";
import { generateWorkerKeypair, unsealDek } from "@fangorn-market/x402pay";

const PORT = Number(process.env.RH_WORKER_PORT ?? 4030);
const RPC = process.env.RH_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com";
const REGISTRY = process.env.RH_PAID_REGISTRY as Address | undefined;
const MAX_AGE = 300; // seconds a signed /access request stays valid

const REGISTRY_ABI = [
  { inputs: [{ name: "resourceId", type: "bytes32" }, { name: "buyer", type: "address" }], name: "isSettled", outputs: [{ name: "", type: "bool" }], stateMutability: "view", type: "function" },
] as const;

const dir = resolve(findRepoRoot(), ".data", "rh-worker");
mkdirSync(dir, { recursive: true });

// Persistent worker keypair.
const keyFile = resolve(dir, "key.json");
const keypair = existsSync(keyFile)
  ? (JSON.parse(readFileSync(keyFile, "utf8")) as { privateKey: Hex; publicKey: Hex })
  : (() => {
      const kp = generateWorkerKeypair();
      writeFileSync(keyFile, JSON.stringify(kp));
      return kp;
    })();

const client = createPublicClient({ transport: http(RPC) }) as PublicClient;
const app = express();
app.use(express.json());
app.use(express.raw({ type: "application/octet-stream", limit: "5mb" }));

app.get("/pubkey", (_req, res) => res.json({ pubkey: keypair.publicKey }));

app.post("/upload/:resourceId", (req, res) => {
  const id = req.params.resourceId;
  const sealed = req.header("X-Sealed-Dek");
  if (!sealed || !Buffer.isBuffer(req.body)) return res.status(400).json({ error: "missing ciphertext or sealed DEK" });
  writeFileSync(resolve(dir, `${id}.ct`), req.body as Buffer);
  writeFileSync(resolve(dir, `${id}.dek`), sealed);
  res.json({ ok: true });
});

app.get("/ct/:resourceId", (req, res) => {
  const file = resolve(dir, `${req.params.resourceId}.ct`);
  if (!existsSync(file)) return res.status(404).json({ error: "not found" });
  res.type("application/octet-stream").send(readFileSync(file));
});

app.post("/access", async (req, res) => {
  try {
    const { resourceId, buyer, timestamp, signature } = req.body as {
      resourceId: Hex;
      buyer: Address;
      timestamp: number;
      signature: Hex;
    };
    if (!REGISTRY) return res.status(500).json({ error: "RH_PAID_REGISTRY not configured" });
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > MAX_AGE) {
      return res.status(401).json({ error: "stale request" });
    }
    // 1. Prove the requester controls `buyer`.
    const recovered = await recoverMessageAddress({ message: `fangorn:access:${resourceId}:${timestamp}`, signature });
    if (recovered.toLowerCase() !== buyer.toLowerCase()) {
      return res.status(401).json({ error: "signature does not match buyer" });
    }
    // 2. Check on-chain settlement.
    const settled = (await client.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "isSettled", args: [resourceId, buyer] })) as boolean;
    if (!settled) return res.status(402).json({ error: "no settlement on-chain for this buyer" });
    // 3. Release the DEK.
    const dekFile = resolve(dir, `${resourceId}.dek`);
    if (!existsSync(dekFile)) return res.status(404).json({ error: "resource not found" });
    const sealed = hexToBytes(readFileSync(dekFile, "utf8") as `0x${string}`);
    const dek = unsealDek(sealed, hexToBytes(keypair.privateKey));
    res.json({ dek: `0x${Buffer.from(dek).toString("hex")}` });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "error" });
  }
});

app.listen(PORT, () => {
  console.log(`RH access worker on http://localhost:${PORT}`);
  console.log(`  registry: ${REGISTRY ?? "(set RH_PAID_REGISTRY)"}  rpc: ${RPC}`);
  console.log(`  pubkey  : ${keypair.publicKey}`);
});
