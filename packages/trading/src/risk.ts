import type { RiskLimits } from "@fangorn-market/shared";
import { applyFill, notional, type Position } from "./position.js";

export type RiskReason =
  | "emergency-stop"
  | "paused"
  | "market-not-allowed"
  | "stale-price"
  | "zero-size"
  | "position-limit"
  | "daily-loss-limit";

export interface RiskContext {
  limits: RiskLimits;
  marketAllowed: boolean;
  paused: boolean;
  stopped: boolean;
  priceFresh: boolean;
  /** Realized PnL already booked in the current day window (USDC-6). */
  dayRealizedPnl: bigint;
}

export interface RiskDecision {
  ok: boolean;
  reason?: RiskReason;
}

/**
 * Pre-trade risk gate mirroring the on-chain checks in
 * `SettlementLedger.submitFill`. Running this before sending a tx lets the agent
 * skip fills the contract would revert — saving gas and surfacing a clean reason
 * for the activity feed. The contract remains the source of truth.
 */
export function checkFill(
  ctx: RiskContext,
  pos: Position,
  sizeDelta: bigint,
  price: bigint,
): RiskDecision {
  if (ctx.stopped) return { ok: false, reason: "emergency-stop" };
  if (ctx.paused) return { ok: false, reason: "paused" };
  if (sizeDelta === 0n) return { ok: false, reason: "zero-size" };
  if (!ctx.marketAllowed) return { ok: false, reason: "market-not-allowed" };
  if (!ctx.priceFresh) return { ok: false, reason: "stale-price" };

  const { newSize, realized } = applyFill(pos, sizeDelta, price);

  if (ctx.limits.maxPositionNotional !== 0n) {
    if (notional(newSize, price) > ctx.limits.maxPositionNotional) {
      return { ok: false, reason: "position-limit" };
    }
  }

  if (ctx.limits.dailyLossLimit !== 0n) {
    if (ctx.dayRealizedPnl + realized < -ctx.limits.dailyLossLimit) {
      return { ok: false, reason: "daily-loss-limit" };
    }
  }

  return { ok: true };
}
