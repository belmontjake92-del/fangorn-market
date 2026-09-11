import { keccak256, toBytes, type Hex } from "viem";

/**
 * The whole system uses one 1e6 fixed-point scale for USDC amounts, prices
 * (quote-per-base), and position sizes - matching the on-chain contracts. Keep
 * every value as `bigint` at this scale; only convert to `number` for display.
 */
export const SCALE = 1_000_000n;
export const SCALE_NUMBER = 1_000_000;

/** Human number → 1e6 fixed-point bigint (e.g. `scaled(100)` → `100_000000n`). */
export function scaled(n: number): bigint {
  return BigInt(Math.round(n * SCALE_NUMBER));
}

/** 1e6 fixed-point bigint → human number (lossy for display only). */
export function unscaled(n: bigint): number {
  return Number(n) / SCALE_NUMBER;
}

// Semantic aliases - same scale, clearer call sites.
export const usd = scaled;
export const price = scaled;
export const size = scaled;

/** Format a USDC-6 bigint as a currency string, e.g. `-1234500n` → `-$1.23`. */
export function formatUsd(n: bigint, fractionDigits = 2): string {
  const v = unscaled(n);
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toFixed(fractionDigits)}`;
}

/**
 * Deterministic bytes32 market id from a ticker/symbol - the same value the
 * contracts and Grove observations key on. `marketId("RH:ACME")`.
 */
export function marketId(symbol: string): Hex {
  return keccak256(toBytes(symbol));
}

/** Deterministic bytes32 deployment id from a stable string key. */
export function deploymentId(key: string): Hex {
  return keccak256(toBytes(key));
}
