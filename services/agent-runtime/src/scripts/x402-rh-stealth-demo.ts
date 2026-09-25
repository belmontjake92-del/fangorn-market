/**
 * Stealth mode on Robinhood Chain, end to end. The seller publishes an encrypted
 * signal on the StealthAccessRegistry; the buyer pays gaslessly (joining the
 * resource's Semaphore group), then proves membership with a real zero-knowledge
 * proof to get the key. The worker verifies the proof on-chain and never learns
 * which paying member is decrypting.
 *
 * Prereqs: deploy:stealth:robinhood done, rh-access-worker running with
 * RH_STEALTH_REGISTRY set, FANGORN_PRIVATE_KEY + BUYER_PRIVATE_KEY in .env.
 * Run: pnpm --filter @fangorn-market/agent-runtime x402:rh:stealth
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, stringToBytes, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Repo } from "@fangorn-market/db";
import { findRepoRoot } from "@fangorn-market/shared";
import { sellResourceRH, payAndFetchStealth, rhResourceIdFromName, type RhStealthConfig } from "@fangorn-market/x402pay";
import { robinhoodChain } from "../chain.js";

const RPC = process.env.RH_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com";
const WORKER_URL = (process.env.RH_WORKER_URL ?? "http://localhost:4030").replace(/\/$/, "");
const PRICE = BigInt(process.env.RESOURCE_PRICE ?? "1000"); // 0.001 USDC
const SYMBOL = "RH:ACME";

const USDC_ABI = [
  { inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], name: "mint", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "a", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

async function main() {
  const ownerKey = process.env.FANGORN_PRIVATE_KEY as Hex | undefined;
  const buyerKey = process.env.BUYER_PRIVATE_KEY as Hex | undefined;
  if (!ownerKey || !buyerKey) throw new Error("FANGORN_PRIVATE_KEY and BUYER_PRIVATE_KEY required in .env");

  const depFile = resolve(findRepoRoot(), "deployments", "robinhoodTestnet.json");
  if (!existsSync(depFile)) throw new Error("deployments/robinhoodTestnet.json missing");
  const dep = JSON.parse(readFileSync(depFile, "utf8")) as { usdc?: Address; stealthAccessRegistry?: Address; semaphore?: Address; stealthFromBlock?: string };
  if (!dep.usdc || !dep.stealthAccessRegistry || !dep.semaphore) throw new Error("stealth contracts not deployed - run deploy:stealth:robinhood");

  const chain = robinhoodChain();
  const owner = privateKeyToAccount(ownerKey);
  const buyer = privateKeyToAccount(buyerKey);
  const publicClient = createPublicClient({ chain, transport: http(RPC) }) as PublicClient;
  const ownerWallet = createWalletClient({ account: owner, chain, transport: http(RPC) });
  const buyerWallet = createWalletClient({ account: buyer, chain, transport: http(RPC) });

  const config: RhStealthConfig = {
    usdc: dep.usdc,
    registry: dep.stealthAccessRegistry,
    semaphore: dep.semaphore,
    fromBlock: BigInt(dep.stealthFromBlock ?? "0"),
    workerUrl: WORKER_URL,
    usdcDomainName: "USD Coin",
    usdcDomainVersion: "2",
  };

  console.log(`Seller/relayer  : ${owner.address}`);
  console.log(`Buyer           : ${buyer.address}`);
  console.log(`Stealth registry: ${dep.stealthAccessRegistry}`);
  console.log(`Semaphore       : ${dep.semaphore}\n`);

  const bal = (await publicClient.readContract({ address: dep.usdc, abi: USDC_ABI, functionName: "balanceOf", args: [buyer.address] })) as bigint;
  if (bal < PRICE) {
    const mintTx = await ownerWallet.writeContract({ address: dep.usdc, abi: USDC_ABI, functionName: "mint", args: [buyer.address, PRICE * 100n], account: owner, chain });
    await publicClient.waitForTransactionReceipt({ hash: mintTx });
    console.log(`Minted ${Number(PRICE * 100n) / 1e6} USDC to the buyer.`);
  }

  const signal = {
    schema: "fangorn-market.premium-confidence/v1",
    symbol: SYMBOL,
    bias: "long",
    confidence: 0.79,
    note: "Premium signal - Stealth mode: access proven with a Semaphore ZK proof on Robinhood Chain.",
    issuedAt: new Date().toISOString(),
  };
  const name = `rh-stealth-${SYMBOL}-${Date.now()}`;
  // createResource has the same signature on both registries, so the RH seller flow is reused.
  const sold = await sellResourceRH({ config, ownerWallet, publicClient, name, plaintext: stringToBytes(JSON.stringify(signal)), price: PRICE });
  console.log(`Published encrypted resource "${name}"  (createResource ${sold.txHash})`);

  console.log("\nBuyer paying (joins the Semaphore group) + generating a zero-knowledge proof…\n");
  const t0 = Date.now();
  const result = await payAndFetchStealth({ config, buyerWallet, relayerWallet: ownerWallet, publicClient, owner: owner.address, name, price: PRICE });
  console.log(`Proof generated + verified on-chain in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const repo = Repo.open(resolve(findRepoRoot(), ".data", "robinhoodTestnet.db"));
  const now = Math.floor(Date.now() / 1000);
  repo.upsertResource({ resourceId: sold.resourceId, name, owner: owner.address, price: PRICE, workerUrl: WORKER_URL, plaintextHash: rhResourceIdFromName(name), symbol: SYMBOL, accessMode: "stealth", createTx: sold.txHash, createdAt: now });
  if (result.paidNow) {
    // The buyer is recorded by identity commitment, not wallet address.
    repo.insertPurchase({ resourceId: sold.resourceId, owner: owner.address, buyerStealth: null, amount: PRICE, nullifier: result.nullifier, deploymentId: null, ts: now });
    repo.addActivity({ ts: now, kind: "access-payment", message: `Agent paid ${Number(PRICE) / 1e6} USDC on Robinhood Chain for "${name}" and decrypted it with a zero-knowledge proof (Stealth)` });
  }

  console.log(`\n${result.paidNow ? "Paid + decrypted" : "Already a member - decrypted"} ✓ Stealth mode on Robinhood Chain`);
  console.log(`  identity commitment: ${result.identityCommitment.toString().slice(0, 18)}…`);
  console.log(`  proof nullifier    : ${result.nullifier.slice(0, 18)}…`);
  console.log(`\n── Decrypted premium signal ──`);
  console.log(result.text);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
