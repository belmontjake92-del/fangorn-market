import { SCALE } from "@fangorn-market/shared";

export interface Position {
  size: bigint; // signed, 1e6
  entry: bigint; // 1e6
}

export interface FillResult {
  newSize: bigint;
  newEntry: bigint;
  realized: bigint; // USDC-6
}

function abs(x: bigint): bigint {
  return x >= 0n ? x : -x;
}

function sign(x: bigint): bigint {
  return x > 0n ? 1n : x < 0n ? -1n : 0n;
}

/**
 * Pure position update — a faithful TS mirror of `SettlementLedger._applyFill`,
 * so off-chain simulation, pre-trade risk checks and backtests agree exactly
 * with what the contract will record. All bigint division truncates toward zero,
 * matching Solidity.
 */
export function applyFill(pos: Position, sizeDelta: bigint, price: bigint): FillResult {
  const newSize = pos.size + sizeDelta;
  const sameOrOpening = pos.size === 0n || pos.size > 0n === sizeDelta > 0n;

  if (sameOrOpening) {
    const absOld = abs(pos.size);
    const absAdd = abs(sizeDelta);
    const newEntry = (absOld * pos.entry + absAdd * price) / (absOld + absAdd);
    return { newSize, newEntry, realized: 0n };
  }

  const absSize = abs(pos.size);
  const absDelta = abs(sizeDelta);
  const closedQty = absDelta < absSize ? absDelta : absSize;
  const dir = pos.size > 0n ? 1n : -1n;
  const realized = (dir * closedQty * (price - pos.entry)) / SCALE;

  let newEntry: bigint;
  if (newSize === 0n) newEntry = 0n;
  else if (sign(newSize) === sign(pos.size)) newEntry = pos.entry; // partial close
  else newEntry = price; // flip

  return { newSize, newEntry, realized };
}

/** Absolute notional (USDC-6) of a position at `price`. */
export function notional(size: bigint, price: bigint): bigint {
  return (abs(size) * price) / SCALE;
}

/** Mark-to-market unrealized PnL (USDC-6). */
export function unrealizedPnl(pos: Position, price: bigint): bigint {
  if (pos.size === 0n) return 0n;
  return (pos.size * (price - pos.entry)) / SCALE;
}
