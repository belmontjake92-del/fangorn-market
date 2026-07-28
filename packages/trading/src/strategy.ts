import { scaled, type StrategyConfig } from "@fangorn-market/shared";

/**
 * Threshold-momentum: a deterministic, no-LLM strategy. It keeps a rolling
 * window of prices, and when the latest price breaks a band around the moving
 * average it targets a long (above) or short (below) clip; inside the band it
 * targets flat. `decide` returns the signed size delta needed to move the
 * current position to that target (0 to hold).
 */
export class ThresholdMomentum {
  private readonly lookback: number;
  private readonly bandBps: bigint; // band as basis points
  private readonly clip: bigint; // target clip size, 1e6
  private readonly window: bigint[] = [];

  constructor(cfg: StrategyConfig) {
    this.lookback = Math.max(1, cfg.lookback);
    this.bandBps = BigInt(Math.round(cfg.band * 10_000));
    this.clip = scaled(cfg.clipSize);
  }

  /** Feed a new price into the rolling window. */
  observe(price: bigint): void {
    this.window.push(price);
    if (this.window.length > this.lookback) this.window.shift();
  }

  /** True once enough observations exist to produce a signal. */
  get ready(): boolean {
    return this.window.length >= this.lookback;
  }

  private movingAverage(): bigint {
    const sum = this.window.reduce((acc, p) => acc + p, 0n);
    return sum / BigInt(this.window.length);
  }

  /** Target position size (signed, 1e6) given the latest price. */
  targetSize(price: bigint): bigint {
    if (!this.ready) return 0n;
    const ma = this.movingAverage();
    const upper = ma + (ma * this.bandBps) / 10_000n;
    const lower = ma - (ma * this.bandBps) / 10_000n;
    if (price > upper) return this.clip;
    if (price < lower) return -this.clip;
    return 0n;
  }

  /**
   * Size delta to move from `currentSize` to the target. `observe(price)` should
   * be called first. Returns 0n to hold.
   */
  decide(price: bigint, currentSize: bigint): bigint {
    return this.targetSize(price) - currentSize;
  }
}
