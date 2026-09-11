import { scaled } from "@fangorn-market/shared";
import { gaussian, mulberry32 } from "./prng.js";

export interface PricePoint {
  symbol: string;
  priceScaled: bigint; // 1e6 fixed point
  ts: number; // unix seconds
  seq: number; // monotonic per feed
}

export interface PriceFeed {
  next(): PricePoint;
}

export interface SyntheticConfig {
  symbol: string;
  /** Starting price (human units). */
  start: number;
  /** Log-drift per step (e.g. 0.0002). Default 0. */
  driftPerStep?: number;
  /** Log-volatility per step (e.g. 0.01). Default 0.01. */
  volPerStep?: number;
  /** PRNG seed - same seed ⇒ same series. Default 1. */
  seed?: number;
  /** Timestamp of the first point (unix seconds). Default now. */
  startTs?: number;
  /** Seconds between points. Default 60. */
  stepSeconds?: number;
  /** Price floor (human units) so a run can't cross zero. Default start/100. */
  floor?: number;
}

/**
 * A geometric random walk: `p_{t+1} = p_t * exp(drift + vol * z)`, z ~ N(0,1).
 * Deterministic given the seed - the backbone of the reproducible tracer bullet.
 */
export class SyntheticPriceFeed implements PriceFeed {
  private readonly rng: () => number;
  private readonly drift: number;
  private readonly vol: number;
  private readonly stepSeconds: number;
  private readonly floor: number;
  private readonly symbol: string;
  private last: number;
  private ts: number;
  private seq = 0;

  constructor(cfg: SyntheticConfig) {
    this.symbol = cfg.symbol;
    this.last = cfg.start;
    this.drift = cfg.driftPerStep ?? 0;
    this.vol = cfg.volPerStep ?? 0.01;
    this.rng = mulberry32(cfg.seed ?? 1);
    this.stepSeconds = cfg.stepSeconds ?? 60;
    this.floor = cfg.floor ?? cfg.start / 100;
    this.ts = cfg.startTs ?? Math.floor(Date.now() / 1000);
  }

  next(): PricePoint {
    const z = gaussian(this.rng);
    this.last = Math.max(this.floor, this.last * Math.exp(this.drift + this.vol * z));
    this.seq += 1;
    const point: PricePoint = {
      symbol: this.symbol,
      priceScaled: scaled(this.last),
      ts: this.ts,
      seq: this.seq,
    };
    this.ts += this.stepSeconds;
    return point;
  }
}
