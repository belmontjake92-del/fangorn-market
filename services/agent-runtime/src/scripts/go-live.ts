/**
 * Go-live step 2 — the full Phase 1 tracer bullet on Arbitrum Sepolia.
 *
 *   Grove (real, published by seed:grove)
 *     → indexer backfill mirrors observations into the DB
 *       → deterministic agent reads each price, relays it to the on-chain
 *         PriceOracle, and settles a simulated fill on the SettlementLedger
 *         → final position / PnL read back from chain.
 *
 * Prereqs: contracts deployed (`deploy:sepolia`), dataset published
 * (`seed:grove`), and .env with FANGORN_PRIVATE_KEY, PINATA_JWT, PINATA_GATEWAY,
 * ARBITRUM_SEPOLIA_RPC_URL.
 *
 * Run: pnpm --filter @fangorn-market/agent-runtime go-live
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Hex } from "viem";
import { Repo } from "@fangorn-market/db";
import { backfill, createGroveClient } from "@fangorn-market/grove";
import {
  deploymentId,
  findRepoRoot,
  formatUsd,
  groveNamespace,
  marketId,
  requireDeployment,
  unscaled,
  usd,
  type DeploymentConfig,
  type MarketSpec,
} from "@fangorn-market/shared";
import { unrealizedPnl } from "@fangorn-market/trading";
import { ChainContext } from "../chain.js";
import { DeterministicAgent } from "../agent.js";

const NETWORK = "arbitrumSepolia";
const SYMBOL = process.env.SEED_SYMBOL ?? "RH:ACME";
const DEPLOYMENT_KEY = process.env.DEPLOYMENT_KEY ?? "sepolia-atlas-momentum";

async function main() {
  const key = process.env.FANGORN_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("FANGORN_PRIVATE_KEY is required in .env");
  const dep = requireDeployment(NETWORK);
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";

  const chain = new ChainContext({
    network: NETWORK,
    rpcUrl,
    privateKey: key,
    oracle: dep.priceOracle,
    ledger: dep.settlementLedger,
  });

  const dataDir = resolve(findRepoRoot(), ".data");
  mkdirSync(dataDir, { recursive: true });
  const repo = Repo.open(resolve(dataDir, "sepolia.db"));

  // 1. Mirror the published Grove dataset into the DB.
  const fangorn = await createGroveClient();
  const namespace = groveNamespace();
  const indexed = await backfill(repo, fangorn, namespace, chain.address);
  console.log(`Backfilled ${indexed} observations from Grove namespace "${namespace}".`);

  const observations = repo.listObservations(SYMBOL).slice().reverse(); // ascending by seq
  if (observations.length === 0) {
    throw new Error(`No ${SYMBOL} observations in Grove. Run seed:grove first.`);
  }

  // 2. Open the deployment on-chain.
  const market: MarketSpec = {
    symbol: SYMBOL,
    marketId: marketId(SYMBOL),
    label: "Acme Corp (tokenized)",
    assetClass: "tokenized",
  };
  const config: DeploymentConfig = {
    id: deploymentId(DEPLOYMENT_KEY),
    key: DEPLOYMENT_KEY,
    agentName: "Atlas Momentum",
    owner: chain.address,
    operator: chain.address,
    openingCash: usd(1000),
    limits: { maxPositionNotional: usd(5000), dailyLossLimit: usd(200) },
    market,
    strategy: { kind: "threshold-momentum", lookback: 5, band: 0.005, clipSize: 1 },
  };
  try {
    await chain.openDeployment({
      id: config.id,
      owner: config.owner,
      operator: config.operator,
      openingCash: config.openingCash,
      limits: config.limits,
      markets: [market.marketId],
    });
    console.log("Opened deployment on Arbitrum Sepolia.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/DeploymentExists/.test(msg)) throw err;
    console.log("Deployment already open — reusing.");
  }
  repo.upsertDeployment(config, "live");

  // 3. Relay each Grove price to the oracle and let the agent settle on-chain.
  const agent = new DeterministicAgent({ chain, repo, config });
  let fills = 0;
  console.log(`\nReplaying ${observations.length} observations through the live oracle + ledger…\n`);
  for (const o of observations) {
    await chain.setPrice(o.marketId, o.price);
    const r = await agent.tick(o.price, o.ts);
    if (r.action === "fill") {
      fills++;
      console.log(`  seq ${o.seq} $${unscaled(o.price).toFixed(2)}  FILL ${r.delta > 0n ? "+" : ""}${unscaled(r.delta)}  realized ${formatUsd(r.realizedPnl ?? 0n)}  tx ${r.txHash}`);
    } else if (r.action === "rejected") {
      console.log(`  seq ${o.seq} $${unscaled(o.price).toFixed(2)}  REJECTED (${r.reason})`);
    }
  }

  // Read cash + position + mark together so the reported cash and equity are
  // internally consistent (a separate equity() call can land on a lagging block).
  const acct = await chain.getAccount(config.id);
  const pos = await chain.getPosition(config.id, market.marketId);
  const { price: mark } = await chain.getPrice(market.marketId);
  const equity = acct.cash + unrealizedPnl({ size: pos.size, entry: pos.entry }, mark);
  console.log(`\n── Final state (Arbitrum Sepolia) ──`);
  console.log(`  fills settled  : ${fills}`);
  console.log(`  position size  : ${unscaled(pos.size)} ${SYMBOL} @ ${formatUsd(pos.entry)}`);
  console.log(`  cash           : ${formatUsd(acct.cash)}`);
  console.log(`  equity         : ${formatUsd(equity)}`);
  console.log(`\n  Tracer bullet complete on Robinhood Chain's stand-in (Arbitrum Sepolia).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
