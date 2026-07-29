/**
 * x402-on-Robinhood-Chain demo. Mints MockUSDC to a buyer, the seller publishes
 * an encrypted premium signal (our access worker + PaidAccessRegistry on RH),
 * and the buyer pays USDC + decrypts it — all on Robinhood Chain (chain 46630).
 * No Arbitrum, no Fangorn-hosted worker.
 *
 * Prereqs: deploy:x402:robinhood done, rh-access-worker running (RH_PAID_REGISTRY
 * set), FANGORN_PRIVATE_KEY + BUYER_PRIVATE_KEY in .env.
 * Run: pnpm --filter @fangorn-market/agent-runtime x402:rh
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, stringToBytes, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Repo } from "@fangorn-market/db";
import { findRepoRoot, marketId } from "@fangorn-market/shared";
import { sellResourceRH, payAndFetchRH, rhResourceIdFromName, type RhX402Config } from "@fangorn-market/x402pay";
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
  if (!existsSync(depFile)) throw new Error("deployments/robinhoodTestnet.json missing — run deploy:x402:robinhood");
  const dep = JSON.parse(readFileSync(depFile, "utf8")) as { usdc?: Address; paidAccessRegistry?: Address };
  if (!dep.usdc || !dep.paidAccessRegistry) throw new Error("usdc/paidAccessRegistry not in deployment — run deploy:x402:robinhood");

  const chain = robinhoodChain();
  const owner = privateKeyToAccount(ownerKey);
  const buyer = privateKeyToAccount(buyerKey);
  const publicClient = createPublicClient({ chain, transport: http(RPC) }) as PublicClient;
  const ownerWallet = createWalletClient({ account: owner, chain, transport: http(RPC) });
  const buyerWallet = createWalletClient({ account: buyer, chain, transport: http(RPC) });

  const config: RhX402Config = { usdc: dep.usdc, registry: dep.paidAccessRegistry, workerUrl: WORKER_URL, usdcDomainName: "USD Coin", usdcDomainVersion: "2" };

  console.log(`Seller/relayer : ${owner.address}`);
  console.log(`Buyer          : ${buyer.address}`);
  console.log(`USDC / registry: ${dep.usdc} / ${dep.paidAccessRegistry}`);
  console.log(`Worker         : ${WORKER_URL}\n`);

  // Fund the buyer with MockUSDC (seller mints; open faucet mint).
  const bal = (await publicClient.readContract({ address: dep.usdc, abi: USDC_ABI, functionName: "balanceOf", args: [buyer.address] })) as bigint;
  if (bal < PRICE) {
    const mintTx = await ownerWallet.writeContract({ address: dep.usdc, abi: USDC_ABI, functionName: "mint", args: [buyer.address, PRICE * 100n], account: owner, chain });
    await publicClient.waitForTransactionReceipt({ hash: mintTx });
    console.log(`Minted ${Number(PRICE * 100n) / 1e6} USDC to the buyer.`);
  }

  // Seller publishes an encrypted premium signal on Robinhood Chain.
  const signal = {
    schema: "fangorn-market.premium-confidence/v1",
    symbol: SYMBOL,
    bias: "long",
    confidence: 0.82,
    note: "Premium signal — encrypted + settled natively on Robinhood Chain.",
    issuedAt: new Date().toISOString(),
  };
  const name = `rh-signal-${SYMBOL}-${Date.now()}`;
  const sold = await sellResourceRH({ config, ownerWallet, publicClient, name, plaintext: stringToBytes(JSON.stringify(signal)), price: PRICE });
  console.log(`Published encrypted resource "${name}"  (createResource ${sold.txHash})`);

  // Buyer pays + decrypts (relayer = seller submits pay so the buyer needs no gas).
  console.log("\nBuyer paying + decrypting on Robinhood Chain…\n");
  const result = await payAndFetchRH({ config, buyerWallet, relayerWallet: ownerWallet, publicClient, owner: owner.address, name, price: PRICE });

  // Record in the RH DB so the app surfaces it.
  const repo = Repo.open(resolve(findRepoRoot(), ".data", "robinhoodTestnet.db"));
  const now = Math.floor(Date.now() / 1000);
  repo.upsertResource({ resourceId: sold.resourceId, name, owner: owner.address, price: PRICE, workerUrl: WORKER_URL, plaintextHash: rhResourceIdFromName(name), symbol: SYMBOL, accessMode: "monetized", createTx: sold.txHash, createdAt: now });
  if (result.paidNow) {
    repo.insertPurchase({ resourceId: sold.resourceId, owner: owner.address, buyerStealth: buyer.address, amount: PRICE, nullifier: null, deploymentId: null, ts: now });
    repo.addActivity({ ts: now, kind: "access-payment", message: `Agent paid ${Number(PRICE) / 1e6} USDC on Robinhood Chain for "${name}" and decrypted it` });
  }

  console.log(`${result.paidNow ? "Paid + decrypted" : "Already settled — decrypted"} ✓ on Robinhood Chain`);
  console.log(`\n── Decrypted premium signal ──`);
  console.log(result.text);
  console.log(`\n  x402 paid/encrypted data is live on Robinhood Chain. (marketId ${marketId(SYMBOL).slice(0, 10)}…)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
