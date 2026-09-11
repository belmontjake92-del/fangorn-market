import { scaled, unscaled } from "@fangorn-market/shared";
import { SyntheticPriceFeed, ThresholdMomentum, applyFill, unrealizedPnl, type Position } from "@fangorn-market/trading";

export interface BacktestParams {
  seed: number;
  ticks: number;
  start: number;
  vol: number;
  lookback: number;
  band: number;
  clip: number;
  openingCash: number;
}

export interface BacktestPoint {
  seq: number;
  price: number;
  equity: number;
  size: number;
}

export interface BacktestResult {
  params: BacktestParams;
  curve: BacktestPoint[];
  metrics: {
    finalEquity: number;
    realizedReturnPct: number;
    maxDrawdownPct: number;
    fills: number;
    endPosition: number;
  };
}

const clampInt = (v: unknown, def: number, min: number, max: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};
const clampNum = (v: unknown, def: number, min: number, max: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export function parseBacktestParams(q: Record<string, unknown>): BacktestParams {
  return {
    seed: clampInt(q.seed, 7, 0, 1_000_000),
    ticks: clampInt(q.ticks, 120, 10, 1000),
    start: clampNum(q.start, 100, 1, 100_000),
    vol: clampNum(q.vol, 0.02, 0.001, 0.2),
    lookback: clampInt(q.lookback, 5, 1, 100),
    band: clampNum(q.band, 0.005, 0, 0.1),
    clip: clampNum(q.clip, 1, 0.01, 100),
    openingCash: clampNum(q.openingCash, 1000, 1, 10_000_000),
  };
}

/**
 * Deterministic backtest over a synthetic price series using the exact same
 * position math the contract settles with - so a backtest and a live run of the
 * same seed agree. Pure; no chain.
 */
export function runBacktest(params: BacktestParams): BacktestResult {
  const feed = new SyntheticPriceFeed({ symbol: "SIM", start: params.start, volPerStep: params.vol, seed: params.seed });
  const strat = new ThresholdMomentum({ kind: "threshold-momentum", lookback: params.lookback, band: params.band, clipSize: params.clip });

  let pos: Position = { size: 0n, entry: 0n };
  let cash = scaled(params.openingCash);
  const opening = cash;
  let realized = 0n;
  let fills = 0;
  let peakEquity = cash;
  let maxDrawdown = 0;
  const curve: BacktestPoint[] = [];

  for (let i = 0; i < params.ticks; i++) {
    const p = feed.next();
    strat.observe(p.priceScaled);
    const delta = strat.targetSize(p.priceScaled) - pos.size;
    if (delta !== 0n) {
      const r = applyFill(pos, delta, p.priceScaled);
      cash += r.realized;
      realized += r.realized;
      pos = { size: r.newSize, entry: r.newEntry };
      fills++;
    }
    const equity = cash + unrealizedPnl(pos, p.priceScaled);
    if (equity > peakEquity) peakEquity = equity;
    const dd = peakEquity > 0n ? Number(peakEquity - equity) / Number(peakEquity) : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
    curve.push({ seq: p.seq, price: unscaled(p.priceScaled), equity: unscaled(equity), size: unscaled(pos.size) });
  }

  const finalEquity = cash + unrealizedPnl(pos, scaled(params.start)); // marked at last price approx
  const last = curve[curve.length - 1];
  return {
    params,
    curve,
    metrics: {
      finalEquity: last ? last.equity : unscaled(finalEquity),
      realizedReturnPct: (Number(realized) / Number(opening)) * 100,
      maxDrawdownPct: maxDrawdown * 100,
      fills,
      endPosition: unscaled(pos.size),
    },
  };
}
