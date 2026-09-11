/**
 * Derive a directional intelligence signal from a price series - the output a
 * signal-publisher agent sells and a trading agent consumes. Deterministic:
 * same prices → same signal.
 */
export interface DerivedSignal {
  bias: "long" | "short" | "flat";
  confidence: number; // 0..1
  momentum: number; // (last - MA) / MA
  ma: bigint; // moving average, 1e6
  last: bigint; // latest price, 1e6
  samples: number;
}

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export function deriveSignal(
  prices: bigint[],
  opts: { lookback?: number; band?: number } = {},
): DerivedSignal {
  const band = opts.band ?? 0.005;
  if (prices.length === 0) return { bias: "flat", confidence: 0, momentum: 0, ma: 0n, last: 0n, samples: 0 };

  const lookback = Math.min(opts.lookback ?? 10, prices.length);
  const window = prices.slice(-lookback);
  const last = prices[prices.length - 1]!;
  const ma = window.reduce((a, p) => a + p, 0n) / BigInt(window.length);
  const momentum = ma > 0n ? Number(last - ma) / Number(ma) : 0;

  const bias: DerivedSignal["bias"] = momentum > band ? "long" : momentum < -band ? "short" : "flat";

  // Confidence blends momentum strength with directional consistency of recent moves.
  let up = 0;
  let down = 0;
  for (let i = 1; i < window.length; i++) {
    const d = window[i]! - window[i - 1]!;
    if (d > 0n) up++;
    else if (d < 0n) down++;
  }
  const moves = up + down;
  const consistency = moves ? Math.abs(up - down) / moves : 0;
  const strength = Math.min(1, Math.abs(momentum) / (band * 4 || 1));
  const confidence = bias === "flat" ? round(0.3 * consistency, 2) : round(Math.min(1, 0.5 * strength + 0.5 * consistency), 2);

  return { bias, confidence, momentum: round(momentum, 5), ma, last, samples: window.length };
}
