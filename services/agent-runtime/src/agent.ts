import type { Hex } from "viem";
import type { Repo } from "@fangorn-market/db";
import type { DeploymentConfig, RiskLimits } from "@fangorn-market/shared";
import { formatUsd } from "@fangorn-market/shared";
import { ThresholdMomentum, checkFill, notional, unrealizedPnl } from "@fangorn-market/trading";
import type { ChainContext } from "./chain.js";

export type TickAction = "hold" | "fill" | "rejected";

/** A paid premium signal that biases the agent's decisions (x402f). */
export interface PremiumBias {
  bias: "long" | "short" | "flat";
  confidence: number;
}

/** Suppress strategy targets that fight a paid directional bias. */
function gateTarget(target: bigint, premium?: PremiumBias): bigint {
  if (!premium || premium.bias === "flat") return target;
  if (premium.bias === "long" && target < 0n) return 0n;
  if (premium.bias === "short" && target > 0n) return 0n;
  return target;
}

export interface TickResult {
  action: TickAction;
  price: bigint;
  delta: bigint;
  reason?: string;
  txHash?: Hex;
  realizedPnl?: bigint;
  newSize?: bigint;
}

/**
 * A single deterministic deployment.
 *
 * The agent is authoritative about its OWN position, cash and daily PnL: it
 * seeds them once from chain in {@link init}, then advances them from each
 * fill's FillSettled event. It never re-reads its own just-written position via
 * RPC - that read-after-write dependency is non-deterministic under a
 * load-balanced provider (a replica can lag a block). Only external state it
 * doesn't write itself (emergency stop, pause) is read live each tick.
 */
export class DeterministicAgent {
  private readonly strategy: ThresholdMomentum;
  private readonly id: Hex;
  private readonly marketId: Hex;
  private readonly symbol: string;

  private size = 0n;
  private entry = 0n;
  private cash = 0n;
  private dayRealized = 0n;
  private limits: RiskLimits = { maxPositionNotional: 0n, dailyLossLimit: 0n };
  private marketAllowed = false;
  private initialized = false;

  private readonly premium?: PremiumBias;

  constructor(
    private readonly deps: { chain: ChainContext; repo: Repo; config: DeploymentConfig; premium?: PremiumBias },
  ) {
    this.strategy = new ThresholdMomentum(deps.config.strategy);
    this.id = deps.config.id;
    this.marketId = deps.config.market.marketId;
    this.symbol = deps.config.market.symbol;
    this.premium = deps.premium;
  }

  /** Seed in-memory state from chain once (safe: no fill is pending yet). */
  async init(): Promise<void> {
    const [acct, pos, marketAllowed] = await Promise.all([
      this.deps.chain.getAccount(this.id),
      this.deps.chain.getPosition(this.id, this.marketId),
      this.deps.chain.marketAllowed(this.id, this.marketId),
    ]);
    this.cash = acct.cash;
    this.limits = acct.limits;
    this.dayRealized = acct.dayRealizedPnl;
    this.size = pos.size;
    this.entry = pos.entry;
    this.marketAllowed = marketAllowed;
    this.initialized = true;
  }

  async tick(priceScaled: bigint, ts: number): Promise<TickResult> {
    if (!this.initialized) await this.init();
    const { chain, repo } = this.deps;
    this.strategy.observe(priceScaled);

    // Factor in paid premium intelligence: don't fight its directional bias.
    const target = gateTarget(this.strategy.targetSize(priceScaled), this.premium);
    const delta = target - this.size;
    if (delta === 0n) {
      this.snapshot(priceScaled);
      return { action: "hold", price: priceScaled, delta: 0n };
    }

    // External state (not written by our fills) is read live.
    const stopped = await chain.emergencyStopped();
    const acct = await chain.getAccount(this.id);

    const decision = checkFill(
      {
        limits: this.limits,
        marketAllowed: this.marketAllowed,
        paused: acct.paused,
        stopped,
        priceFresh: true, // the contract re-checks staleness authoritatively
        dayRealizedPnl: this.dayRealized,
      },
      { size: this.size, entry: this.entry },
      delta,
      priceScaled,
    );

    if (!decision.ok) {
      repo.addActivity({
        ts,
        kind: "risk-rejected",
        deploymentId: this.id,
        message: `Risk gate rejected ${this.fmtDelta(delta)} ${this.symbol}: ${decision.reason}`,
      });
      this.snapshot(priceScaled);
      return { action: "rejected", price: priceScaled, delta, reason: decision.reason };
    }

    const { txHash, fill } = await chain.submitFill(this.id, this.marketId, delta);
    // Advance in-memory state from the authoritative event.
    this.size = fill.newSize;
    this.entry = fill.newEntryPrice;
    this.cash = fill.cashAfter;
    this.dayRealized += fill.realizedPnl;

    repo.insertFill({
      deploymentId: this.id,
      marketId: this.marketId,
      symbol: this.symbol,
      sizeDelta: delta,
      price: fill.price,
      newSize: fill.newSize,
      newEntryPrice: fill.newEntryPrice,
      realizedPnl: fill.realizedPnl,
      cashAfter: fill.cashAfter,
      txHash,
      ts,
    });
    this.snapshot(priceScaled);
    repo.addActivity({
      ts,
      kind: "fill",
      deploymentId: this.id,
      message: `Filled ${this.fmtDelta(delta)} ${this.symbol} @ ${formatUsd(fill.price)} (realized ${formatUsd(fill.realizedPnl)})`,
    });

    return { action: "fill", price: priceScaled, delta, txHash, realizedPnl: fill.realizedPnl, newSize: fill.newSize };
  }

  /** Persist a position snapshot from in-memory state, marked to `mark`. */
  private snapshot(mark: bigint): void {
    this.deps.repo.upsertPosition({
      deploymentId: this.id,
      marketId: this.marketId,
      symbol: this.symbol,
      size: this.size,
      entryPrice: this.entry,
      markPrice: mark,
      unrealizedPnl: unrealizedPnl({ size: this.size, entry: this.entry }, mark),
      notional: notional(this.size, mark),
    });
  }

  private fmtDelta(delta: bigint): string {
    const sign = delta > 0n ? "+" : "";
    return `${sign}${Number(delta) / 1_000_000}`;
  }
}
