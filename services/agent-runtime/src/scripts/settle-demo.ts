/**
 * Settlement demo on any live network (default: Robinhood Chain testnet).
 *
 * Runs the pure settlement layer — deterministic agent settling simulated fills
 * against our PriceOracle + SettlementLedger — with a synthetic price feed, so
 * it needs NO Grove/x402f (those still live on Arbitrum Sepolia). This is the
 * execution/settlement layer running on Robinhood Chain.
 *
 * Prereqs: contracts deployed to the target network
 * (`deploy:robinhood`) and FANGORN_PRIVATE_KEY funded with that chain's gas.
 * Run: pnpm --filter @fangorn-market/agent-runtime settle:demo
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
import { ChainContext, RH_TESTNET_RPC } from "../chain.js";
import { DeterministicAgent } from "../agent.js";
import { LocalPriceService } from "../price-service.js";

// network name → resolveChain key + deployment file name.
const NETWORK = process.env.NETWORK ?? "robinhood";
const DEPLOY_FILE = NETWORK === "robinhood" ? "robinhoodTestnet" : NETWORK;
const TICKS = Number(process.env.TICKS ?? 12);
const SYMBOL = "RH:ACME";

function rpcFor(network: string): string {
  if (network === "robinhood") return process.env.RH_RPC_URL ?? RH_TESTNET_RPC;
  if (network === "arbitrumSepolia") return process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";
  return "http://127.0.0.1:8545";
}

async function main() {
  const key = process.env.FANGORN_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("FANGORN_PRIVATE_KEY required in .env");
  const dep = loadDeployment(DEPLOY_FILE);
  if (!dep) throw new Error(`No deployments/${DEPLOY_FILE}.json — run deploy:robinhood first.`);

  const chain = new ChainContext({ network: NETWORK, rpcUrl: rpcFor(NETWORK), privateKey: key, oracle: dep.priceOracle, ledger: dep.settlementLedger });
  const dataDir = resolve(findRepoRoot(), ".data");
  mkdirSync(dataDir, { recursive: true });
  const repo = Repo.open(resolve(dataDir, `${DEPLOY_FILE}.db`));

  const market: MarketSpec = { symbol: SYMBOL, marketId: marketId(SYMBOL), label: "Acme Corp (tokenized)", assetClass: "tokenized" };
  const config: DeploymentConfig = {
    id: deploymentId(`${NETWORK}-atlas`),
    key: `${NETWORK}-atlas`,
    agentName: "Atlas Momentum",
    owner: chain.address,
    operator: chain.address,
    openingCash: usd(1000),
    limits: { maxPositionNotional: usd(5000), dailyLossLimit: usd(200) },
    market,
    strategy: { kind: "threshold-momentum", lookback: 5, band: 0.005, clipSize: 1 },
  };

  console.log(`Network        : ${NETWORK} (chain ${chain.chainId})`);
  console.log(`PriceOracle    : ${dep.priceOracle}`);
  console.log(`SettlementLedger: ${dep.settlementLedger}`);
  console.log(`Operator       : ${chain.address}\n`);

  try {
    await chain.openDeployment({ id: config.id, owner: config.owner, operator: config.operator, openingCash: config.openingCash, limits: config.limits, markets: [market.marketId] });
    console.log(`Opened deployment on ${NETWORK}.`);
  } catch (err) {
    if (!/DeploymentExists/.test(err instanceof Error ? err.message : String(err))) throw err;
    console.log("Deployment already open — reusing.");
  }
  repo.upsertDeployment(config, "live");

  const feed = new SyntheticPriceFeed({ symbol: SYMBOL, start: 100, volPerStep: 0.02, seed: 7 });
  const priceService = new LocalPriceService({ chain, repo, publisher: chain.address, namespace: "market-prices" });
  const agent = new DeterministicAgent({ chain, repo, config });

  let fills = 0;
  console.log(`\nSettling ${TICKS} ticks on ${NETWORK}…\n`);
  for (let i = 0; i < TICKS; i++) {
    const p = feed.next();
    await priceService.push({ symbol: p.symbol, marketId: market.marketId, priceScaled: p.priceScaled, ts: p.ts, seq: p.seq, source: "synthetic" });
    const r = await agent.tick(p.priceScaled, p.ts);
    if (r.action === "fill") {
      fills++;
      console.log(`  t${i} $${unscaled(p.priceScaled).toFixed(2)}  FILL ${r.delta > 0n ? "+" : ""}${unscaled(r.delta)}  realized ${formatUsd(r.realizedPnl ?? 0n)}  tx ${r.txHash}`);
    }
  }

  const acct = await chain.getAccount(config.id);
  const equity = await chain.equity(config.id, market.marketId);
  console.log(`\n── Final state on Robinhood Chain (${NETWORK}) ──`);
  console.log(`  fills settled : ${fills}`);
  console.log(`  cash          : ${formatUsd(acct.cash)}`);
  console.log(`  equity        : ${formatUsd(equity)}`);
  console.log(`\n  The execution/settlement layer is live on Robinhood Chain.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
