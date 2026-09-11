/**
 * Phase 2 - seller side. Encrypt a premium signal, upload the ciphertext to the
 * access worker, and register it as a paid resource on the SettlementRegistry.
 * Records it as a monetized Data Asset in the DB. Needs only ETH (gas).
 *
 * Run: pnpm --filter @fangorn-market/agent-runtime publish:premium
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, stringToBytes, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { Repo } from "@fangorn-market/db";
import { findRepoRoot } from "@fangorn-market/shared";
import { resolveX402Config, sellResource } from "@fangorn-market/x402pay";

const SYMBOL = process.env.SEED_SYMBOL ?? "RH:ACME";
const PRICE = BigInt(process.env.RESOURCE_PRICE ?? "1000"); // 0.001 USDC (6dp)

async function main() {
  const key = process.env.FANGORN_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("FANGORN_PRIVATE_KEY is required in .env");
  const config = resolveX402Config();
  const account = privateKeyToAccount(key);
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(config.rpcUrl) }) as PublicClient;
  const ownerWallet = createWalletClient({ account, chain: arbitrumSepolia, transport: http(config.rpcUrl) });

  const name = `premium-confidence-${SYMBOL}-${Date.now()}`;
  const signal = {
    schema: "fangorn-market.premium-confidence/v1",
    symbol: SYMBOL,
    confidence: 0.82,
    bias: "long",
    horizon: "intraday",
    note: "Elevated momentum conviction; only visible to paying agents.",
    issuedAt: new Date().toISOString(),
  };
  const plaintext = stringToBytes(JSON.stringify(signal));

  console.log(`Seller/owner : ${account.address}`);
  console.log(`Resource     : ${name}`);
  console.log(`Price        : ${PRICE} USDC base units (${Number(PRICE) / 1e6} USDC)\n`);

  const sold = await sellResource({ config, ownerWallet, publicClient, name, plaintext, price: PRICE });

  const dataDir = resolve(findRepoRoot(), ".data");
  mkdirSync(dataDir, { recursive: true });
  const repo = Repo.open(resolve(dataDir, "sepolia.db"));
  const now = Math.floor(Date.now() / 1000);
  repo.upsertResource({
    resourceId: sold.resourceId,
    name,
    owner: account.address,
    price: PRICE,
    workerUrl: config.workerUrl,
    plaintextHash: sold.plaintextHash,
    symbol: SYMBOL,
    accessMode: "monetized",
    createTx: sold.txHash,
    createdAt: now,
  });
  repo.addActivity({
    ts: now,
    kind: "resource-published",
    message: `Published encrypted premium signal "${name}" (${Number(PRICE) / 1e6} USDC/read)`,
  });

  console.log(`Encrypted + uploaded to access worker.`);
  console.log(`  resourceId    : ${sold.resourceId}`);
  console.log(`  plaintextHash : ${sold.plaintextHash}`);
  console.log(`  createResource: ${sold.txHash}`);
  console.log(`\nMonetized Data Asset recorded. Fund the buyer with USDC, then run buy:premium.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
