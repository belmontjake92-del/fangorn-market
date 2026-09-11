/**
 * Go-live step 2 - the full Phase 1 tracer bullet on Arbitrum Sepolia.
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
import { createPublicClient, createWalletClient, http, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { Repo } from "@fangorn-market/db";
import { backfill, createGroveClient } from "@fangorn-market/grove";
import { payAndFetch, resolveX402Config } from "@fangorn-market/x402pay";
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
import { DeterministicAgent, type PremiumBias } from "../agent.js";

const NETWORK = process.env.NETWORK ?? "arbitrumSepolia";
const DEPLOY_FILE = NETWORK === "robinhood" ? "robinhoodTestnet" : NETWORK;
const SYMBOL = process.env.SEED_SYMBOL ?? "RH:ACME";
const DEPLOYMENT_KEY = process.env.DEPLOYMENT_KEY ?? "sepolia-atlas-momentum";
const USE_PREMIUM = process.env.USE_PREMIUM === "1";
const LIMIT = process.env.GO_LIVE_LIMIT ? Number(process.env.GO_LIVE_LIMIT) : Infinity;

/**
 * Pay for + decrypt the latest premium confidence signal (x402f) via the buyer
 * wallet, and turn it into a directional bias the agent won't fight. Requires
 * the facilitator running and BUYER_PRIVATE_KEY funded with USDC.
 */
async function buyPremiumBias(repo: Repo): Promise<PremiumBias | undefined> {
  const buyerKey = process.env.BUYER_PRIVATE_KEY as Hex | undefined;
  if (!buyerKey) throw new Error("USE_PREMIUM=1 requires BUYER_PRIVATE_KEY (funded with USDC) in .env");
  const resource = repo.latestResource(SYMBOL);
  if (!resource) throw new Error(`No premium resource for ${SYMBOL}. Run publish:premium first.`);

  const x402 = resolveX402Config();
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(x402.rpcUrl) }) as PublicClient;
  const buyerWallet = createWalletClient({
    account: privateKeyToAccount(buyerKey),
    chain: arbitrumSepolia,
    transport: http(x402.rpcUrl),
  });

  console.log(`Buying premium signal "${resource.name}" for ${Number(resource.price) / 1e6} USDC…`);
  const result = await payAndFetch({
    config: x402,
    buyerWallet,
    publicClient,
    owner: resource.owner as Address,
    name: resource.name,
    price: resource.price,
    expectedPlaintextHash: resource.plaintextHash,
  });
  const signal = JSON.parse(result.text) as { bias?: string; confidence?: number };
  const now = Math.floor(Date.now() / 1000);
  if (result.paidNow) {
    repo.insertPurchase({
      resourceId: resource.resourceId,
      owner: resource.owner,
      buyerStealth: result.stealthAddress,
      amount: resource.price,
      nullifier: result.nullifier,
      deploymentId: deploymentId(DEPLOYMENT_KEY),
      ts: now,
    });
  }
  repo.addActivity({
    ts: now,
    kind: "access-payment",
    message: `Agent ${result.paidNow ? "paid for" : "read"} premium signal: bias=${signal.bias}, confidence=${signal.confidence}`,
  });
  const bias = (signal.bias === "long" || signal.bias === "short" ? signal.bias : "flat") as PremiumBias["bias"];
  console.log(`  → bias=${bias}, confidence=${signal.confidence} (${result.paidNow ? "paid" : "already settled"})\n`);
  return { bias, confidence: Number(signal.confidence ?? 0) };
}

async function main() {
  const key = process.env.FANGORN_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("FANGORN_PRIVATE_KEY is required in .env");
  const dep = requireDeployment(DEPLOY_FILE);
  const rpcUrl =
    NETWORK === "robinhood"
      ? (process.env.RH_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com")
      : (process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc");

  const chain = new ChainContext({
    network: NETWORK,
    rpcUrl,
    privateKey: key,
    oracle: dep.priceOracle,
    ledger: dep.settlementLedger,
  });

  const dataDir = resolve(findRepoRoot(), ".data");
  mkdirSync(dataDir, { recursive: true });
  const repo = Repo.open(resolve(dataDir, `${DEPLOY_FILE}.db`));

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
    console.log(`Opened deployment on ${NETWORK}.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/DeploymentExists/.test(msg)) throw err;
    console.log("Deployment already open - reusing.");
  }
  repo.upsertDeployment(config, "live");

  // 3. Optionally buy premium intelligence and factor it into decisions.
  const premium = USE_PREMIUM ? await buyPremiumBias(repo) : undefined;

  // 4. Relay each Grove price to the oracle and let the agent settle on-chain.
  const agent = new DeterministicAgent({ chain, repo, config, premium });
  const ticks = Number.isFinite(LIMIT) ? observations.slice(0, LIMIT) : observations;
  let fills = 0;
  console.log(
    `Replaying ${ticks.length} observations through the live oracle + ledger${premium ? ` (premium bias: ${premium.bias})` : ""}…\n`,
  );
  for (const o of ticks) {
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
  console.log(`\n── Final state (${NETWORK}, chain ${chain.chainId}) ──`);
  console.log(`  fills settled  : ${fills}`);
  console.log(`  position size  : ${unscaled(pos.size)} ${SYMBOL} @ ${formatUsd(pos.entry)}`);
  console.log(`  cash           : ${formatUsd(acct.cash)}`);
  console.log(`  equity         : ${formatUsd(equity)}`);
  console.log(`\n  Full loop complete on ${NETWORK} (chain ${chain.chainId}).`);
}

// USE_PREMIUM spawns Semaphore's proof worker, which keeps the loop alive; defer
// the exit a tick so libuv can close the worker handle cleanly on Windows.
function exit(code: number): void {
  setTimeout(() => process.exit(code), 300);
}
main()
  .then(() => exit(0))
  .catch((err) => {
    console.error(err);
    exit(1);
  });
