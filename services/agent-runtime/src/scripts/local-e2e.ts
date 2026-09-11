/**
 * Phase 1 local dry run - the full tracer-bullet spine on a local Hardhat node,
 * no secrets required. It stands in for the real Grove publish/indexer with a
 * LocalPriceService (oracle push + DB mirror), then runs a deterministic agent
 * that settles simulated fills on-chain and reads position/PnL back.
 *
 * Prereqs: a Hardhat node running and contracts deployed to it -
 *   (in contracts/) npx hardhat node            # terminal 1
 *   (in contracts/) npx hardhat run scripts/deploy.ts --network localhost
 * Then: pnpm --filter @fangorn-market/agent-runtime e2e:local
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Hex } from "viem";
import { Repo } from "@fangorn-market/db";
import {
  deploymentId,
  findRepoRoot,
  formatUsd,
  loadDeployment,
  marketId,
  unscaled,
  usd,
  type DeploymentConfig,
  type MarketSpec,
} from "@fangorn-market/shared";
import { SyntheticPriceFeed } from "@fangorn-market/trading";
import { ChainContext } from "../chain.js";
import { DeterministicAgent } from "../agent.js";
import { LocalPriceService } from "../price-service.js";

// Well-known Hardhat account #0 - a public test key, funded on the local node.
const HARDHAT_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const TICKS = 40;

async function main() {
  const dep = loadDeployment("localhost");
  if (!dep) {
    throw new Error(
      "No deployments/localhost.json. Start `npx hardhat node` and run the deploy script against --network localhost first.",
    );
  }

  const chain = new ChainContext({
    network: "localhost",
    rpcUrl: "http://127.0.0.1:8545",
    privateKey: HARDHAT_KEY,
    oracle: dep.priceOracle,
    ledger: dep.settlementLedger,
  });

  const dataDir = resolve(findRepoRoot(), ".data");
  mkdirSync(dataDir, { recursive: true });
  const repo = Repo.open(resolve(dataDir, "local-e2e.db"));

  const market: MarketSpec = {
    symbol: "RH:ACME",
    marketId: marketId("RH:ACME"),
    label: "Acme Corp (tokenized)",
    assetClass: "tokenized",
  };
  const config: DeploymentConfig = {
    id: deploymentId("local-atlas-momentum"),
    key: "local-atlas-momentum",
    agentName: "Atlas Momentum",
    owner: chain.address,
    operator: chain.address,
    openingCash: usd(1000),
    limits: { maxPositionNotional: usd(5000), dailyLossLimit: usd(200) },
    market,
    strategy: { kind: "threshold-momentum", lookback: 5, band: 0.005, clipSize: 1 },
  };

  console.log(`Chain owner/operator : ${chain.address}`);
  console.log(`PriceOracle          : ${dep.priceOracle}`);
  console.log(`SettlementLedger     : ${dep.settlementLedger}`);
  console.log(`Deployment id        : ${config.id}\n`);

  // Open the deployment on-chain (idempotent: ignore "already exists").
  try {
    await chain.openDeployment({
      id: config.id,
      owner: config.owner,
      operator: config.operator,
      openingCash: config.openingCash,
      limits: config.limits,
      markets: [market.marketId],
    });
    console.log("Opened deployment on-chain.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/DeploymentExists/.test(msg)) throw err;
    console.log("Deployment already open on-chain - reusing.");
  }
  repo.upsertDeployment(config);
  repo.addActivity({
    ts: Math.floor(Date.now() / 1000),
    kind: "deployment-opened",
    deploymentId: config.id,
    message: `Opened ${config.agentName} with ${formatUsd(config.openingCash)} on ${market.symbol}`,
  });

  const feed = new SyntheticPriceFeed({ symbol: market.symbol, start: 100, volPerStep: 0.02, seed: 7 });
  const priceService = new LocalPriceService({
    chain,
    repo,
    publisher: chain.address,
    namespace: "market-prices",
  });
  const agent = new DeterministicAgent({ chain, repo, config });

  let fills = 0;
  console.log(`\nRunning ${TICKS} ticks…\n`);
  for (let i = 0; i < TICKS; i++) {
    const point = feed.next();
    await priceService.push({
      symbol: point.symbol,
      marketId: market.marketId,
      priceScaled: point.priceScaled,
      ts: point.ts,
      seq: point.seq,
      source: "synthetic",
    });
    const r = await agent.tick(point.priceScaled, point.ts);
    if (r.action === "fill") {
      fills++;
      console.log(
        `  t${String(i).padStart(2)} $${unscaled(point.priceScaled).toFixed(2).padStart(7)}  FILL ${r.delta > 0n ? "+" : ""}${unscaled(r.delta)}  realized ${formatUsd(r.realizedPnl ?? 0n)}  newSize ${unscaled(r.newSize ?? 0n)}`,
      );
    } else if (r.action === "rejected") {
      console.log(`  t${String(i).padStart(2)} $${unscaled(point.priceScaled).toFixed(2).padStart(7)}  REJECTED (${r.reason})`);
    }
  }

  // Final state, read back from chain.
  const acct = await chain.getAccount(config.id);
  const pos = await chain.getPosition(config.id, market.marketId);
  const unreal = await chain.unrealizedPnl(config.id, market.marketId);
  const equity = await chain.equity(config.id, market.marketId);

  console.log(`\n── Final state (read from chain) ──`);
  console.log(`  fills settled    : ${fills}`);
  console.log(`  position size    : ${unscaled(pos.size)} ${market.symbol}`);
  console.log(`  entry price      : ${formatUsd(pos.entry)}`);
  console.log(`  cash             : ${formatUsd(acct.cash)}`);
  console.log(`  unrealized PnL   : ${formatUsd(unreal)}`);
  console.log(`  equity           : ${formatUsd(equity)}`);
  console.log(`  day realized PnL : ${formatUsd(acct.dayRealizedPnl)}`);
  console.log(`\n  DB mirror: ${repo.listObservations(market.symbol).length} observations, ${repo.listFills(config.id).length} fills, ${repo.listActivity().length} activity events.`);
  console.log("\n  Spine OK - Grove-mirror → deterministic agent → on-chain settlement → read-back.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
