import type { Repo } from "@fangorn-market/db";
import { ThresholdMomentum, applyFill, notional, unrealizedPnl } from "@fangorn-market/trading";
import { SCALE } from "@fangorn-market/shared";
import type { RepoFor } from "./server.js";

// Always-on paper worker. Every tick it advances a synthetic price for each
// market with an active agent, records the observation into the Grove tables,
// runs each agent's real strategy, and writes the resulting paper fills. It
// writes to the same databases the API serves, so the site keeps moving even
// when nobody is running scripts locally. No real funds and no chain writes.

const PUBLISHER = "0xA6F07F90Fb1dEfe9a3847870e5860D6C9017Bb6d";
const NAMESPACE = "market-prices";
const NETWORKS = ["arbitrum", "robinhood"] as const;

type Hex = `0x${string}`;
const hex = (v: unknown): Hex => String(v) as Hex;
const now = () => Math.floor(Date.now() / 1000);
const fmt = (v: bigint) => (Number(v) / 1e6).toFixed(4);
const randomTx = (): Hex =>
  ("0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")) as Hex;

// In-memory last price per network+market (reseeded from the DB on restart).
const lastPrice = new Map<string, bigint>();

function tickNetwork(repo: Repo, network: string): void {
  const deployments = repo
    .listDeployments()
    .filter((d) => (String(d.kind ?? "trade") === "trade") && String(d.status) !== "paused");
  if (deployments.length === 0) return;

  // 1) advance and record a price for each distinct market
  const markets = new Map<string, string>(); // marketId -> symbol
  for (const d of deployments) markets.set(String(d.market_id), String(d.market_symbol));

  for (const [marketId, symbol] of markets) {
    const key = `${network}:${marketId}`;
    let price = lastPrice.get(key);
    if (price === undefined) {
      const latest = repo.latestObservation(symbol);
      price = latest ? latest.price : 100n * SCALE;
    }
    const pct = (Math.random() - 0.5) * 0.012; // +/- 0.6% random walk
    price = price + BigInt(Math.round(Number(price) * pct));
    if (price < SCALE) price = SCALE;
    lastPrice.set(key, price);

    const prev = repo.latestObservation(symbol);
    const seq = (prev?.seq ?? 0) + 1;
    repo.recordObservation({
      publisher: hex(PUBLISHER),
      namespace: NAMESPACE,
      schemaId: "price/v1",
      symbol,
      marketId: hex(marketId),
      priceScaled: price,
      ts: now(),
      seq,
      source: "worker",
    });
  }

  // 2) each agent decides on the fresh price and records a paper fill
  for (const d of deployments) {
    try {
      const symbol = String(d.market_symbol);
      const marketId = String(d.market_id);
      const price = lastPrice.get(`${network}:${marketId}`);
      if (price === undefined) continue;

      const cfg = safeParse(String(d.strategy_json ?? "{}"));
      const lookback = Number(cfg.lookback ?? 5);
      const strat = new ThresholdMomentum({
        kind: "threshold-momentum",
        lookback,
        band: Number(cfg.band ?? 0.005),
        clipSize: Number(cfg.clipSize ?? cfg.clip ?? 1),
      });
      const obs = repo.listObservations(symbol, lookback + 2); // newest first
      for (const o of [...obs].reverse()) strat.observe(o.price);

      const positions = repo.getPositions(String(d.id));
      const pos = positions[0]
        ? { size: positions[0].size, entry: positions[0].entryPrice }
        : { size: 0n, entry: 0n };
      const lastFill = repo.listFills(String(d.id), 1)[0];
      const cash = lastFill ? lastFill.cashAfter : BigInt(String(d.opening_cash));

      const delta = strat.decide(price, pos.size);
      if (delta === 0n) continue;

      const projected = pos.size + delta;
      const maxNotional = BigInt(String(d.max_position_notional ?? "0"));
      if (maxNotional > 0n && notional(projected, price) > maxNotional) {
        repo.addActivity({ ts: now(), kind: "risk-rejected", deploymentId: hex(d.id), message: `${d.agent_name}: exposure cap held the trade` });
        continue;
      }

      const res = applyFill(pos, delta, price);
      const cashAfter = cash + res.realized; // perp-margin: only realized PnL hits cash
      const ts = now();
      repo.insertFill({
        deploymentId: hex(d.id),
        marketId: hex(marketId),
        symbol,
        sizeDelta: delta,
        price,
        newSize: res.newSize,
        newEntryPrice: res.newEntry,
        realizedPnl: res.realized,
        cashAfter,
        txHash: randomTx(),
        ts,
      });
      repo.upsertPosition({
        deploymentId: hex(d.id),
        marketId: hex(marketId),
        symbol,
        size: res.newSize,
        entryPrice: res.newEntry,
        markPrice: price,
        unrealizedPnl: unrealizedPnl({ size: res.newSize, entry: res.newEntry }, price),
        notional: notional(res.newSize, price),
      });
      const side = delta > 0n ? "bought" : "sold";
      const qty = delta > 0n ? delta : -delta;
      repo.addActivity({
        ts,
        kind: "fill",
        deploymentId: hex(d.id),
        message: `${d.agent_name} ${side} ${(Number(qty) / 1e6).toFixed(2)} ${symbol} @ ${fmt(price)} (paper)`,
      });
    } catch {
      // one bad deployment should never stop the worker
    }
  }
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Start the always-on paper worker. Ticks every WORKER_INTERVAL_MS (default 3 min). */
export function startWorker(repoFor: RepoFor): void {
  const intervalMs = Math.max(30_000, Number(process.env.WORKER_INTERVAL_MS ?? 180_000));
  const run = () => {
    for (const net of NETWORKS) {
      try {
        tickNetwork(repoFor(net), net);
      } catch {
        /* keep the loop alive */
      }
    }
  };
  run();
  setInterval(run, intervalMs);
  console.log(`agent worker: paper loop running every ${Math.round(intervalMs / 1000)}s`);
}
