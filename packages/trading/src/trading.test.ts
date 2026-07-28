import { describe, it, expect } from "vitest";
import { scaled as s, usd } from "@fangorn-market/shared";
import { SyntheticPriceFeed } from "./feed.js";
import { applyFill, notional, unrealizedPnl, type Position } from "./position.js";
import { checkFill, type RiskContext } from "./risk.js";
import { ThresholdMomentum } from "./strategy.js";

const noLimits = { maxPositionNotional: 0n, dailyLossLimit: 0n };
const baseCtx: RiskContext = {
  limits: noLimits,
  marketAllowed: true,
  paused: false,
  stopped: false,
  priceFresh: true,
  dayRealizedPnl: 0n,
};

describe("SyntheticPriceFeed", () => {
  it("is deterministic for a given seed", () => {
    const a = new SyntheticPriceFeed({ symbol: "X", start: 100, seed: 42 });
    const b = new SyntheticPriceFeed({ symbol: "X", start: 100, seed: 42 });
    const seqA = Array.from({ length: 20 }, () => a.next().priceScaled);
    const seqB = Array.from({ length: 20 }, () => b.next().priceScaled);
    expect(seqA).to.deep.equal(seqB);
  });

  it("diverges for different seeds", () => {
    const a = new SyntheticPriceFeed({ symbol: "X", start: 100, seed: 1 });
    const b = new SyntheticPriceFeed({ symbol: "X", start: 100, seed: 2 });
    const seqA = Array.from({ length: 20 }, () => a.next().priceScaled);
    const seqB = Array.from({ length: 20 }, () => b.next().priceScaled);
    expect(seqA).not.to.deep.equal(seqB);
  });

  it("advances timestamp and sequence monotonically", () => {
    const f = new SyntheticPriceFeed({ symbol: "X", start: 100, startTs: 1000, stepSeconds: 60 });
    const p1 = f.next();
    const p2 = f.next();
    expect(p1.seq).to.equal(1);
    expect(p2.seq).to.equal(2);
    expect(p2.ts - p1.ts).to.equal(60);
  });
});

describe("applyFill — parity with SettlementLedger", () => {
  const flat: Position = { size: 0n, entry: 0n };

  it("opens a long at the fill price, no realized PnL", () => {
    const r = applyFill(flat, s(1), s(100));
    expect(r).to.deep.equal({ newSize: s(1), newEntry: s(100), realized: 0n });
  });

  it("blends entry when adding", () => {
    const r = applyFill({ size: s(1), entry: s(100) }, s(1), s(120));
    expect(r.newSize).to.equal(s(2));
    expect(r.newEntry).to.equal(s(110));
    expect(r.realized).to.equal(0n);
  });

  it("realizes on a partial close, entry unchanged", () => {
    const r = applyFill({ size: s(2), entry: s(100) }, s(-1), s(110));
    expect(r.newSize).to.equal(s(1));
    expect(r.newEntry).to.equal(s(100));
    expect(r.realized).to.equal(usd(10));
  });

  it("closes fully to zero", () => {
    const r = applyFill({ size: s(1), entry: s(100) }, s(-1), s(110));
    expect(r).to.deep.equal({ newSize: 0n, newEntry: 0n, realized: usd(10) });
  });

  it("flips long→short, re-entering at the fill price", () => {
    const r = applyFill({ size: s(1), entry: s(100) }, s(-3), s(120));
    expect(r.newSize).to.equal(s(-2));
    expect(r.newEntry).to.equal(s(120));
    expect(r.realized).to.equal(usd(20));
  });

  it("realizes a short gain when price falls", () => {
    const r = applyFill({ size: s(-1), entry: s(100) }, s(1), s(90));
    expect(r.newSize).to.equal(0n);
    expect(r.realized).to.equal(usd(10));
  });

  it("marks notional and unrealized PnL", () => {
    const pos = { size: s(1), entry: s(100) };
    expect(notional(pos.size, s(115))).to.equal(usd(115));
    expect(unrealizedPnl(pos, s(115))).to.equal(usd(15));
  });
});

describe("checkFill — risk gate", () => {
  const flat: Position = { size: 0n, entry: 0n };

  it("passes a clean fill", () => {
    expect(checkFill(baseCtx, flat, s(1), s(100)).ok).to.equal(true);
  });

  it("blocks under emergency stop / pause / zero size", () => {
    expect(checkFill({ ...baseCtx, stopped: true }, flat, s(1), s(100)).reason).to.equal("emergency-stop");
    expect(checkFill({ ...baseCtx, paused: true }, flat, s(1), s(100)).reason).to.equal("paused");
    expect(checkFill(baseCtx, flat, 0n, s(100)).reason).to.equal("zero-size");
  });

  it("blocks disallowed market and stale price", () => {
    expect(checkFill({ ...baseCtx, marketAllowed: false }, flat, s(1), s(100)).reason).to.equal("market-not-allowed");
    expect(checkFill({ ...baseCtx, priceFresh: false }, flat, s(1), s(100)).reason).to.equal("stale-price");
  });

  it("enforces the position-notional cap", () => {
    const ctx = { ...baseCtx, limits: { maxPositionNotional: usd(150), dailyLossLimit: 0n } };
    expect(checkFill(ctx, { size: s(1), entry: s(100) }, s(1), s(100)).reason).to.equal("position-limit");
  });

  it("enforces the daily-loss cap", () => {
    const ctx = { ...baseCtx, limits: { maxPositionNotional: 0n, dailyLossLimit: usd(5) } };
    expect(checkFill(ctx, { size: s(1), entry: s(100) }, s(-1), s(90)).reason).to.equal("daily-loss-limit");
  });
});

describe("ThresholdMomentum", () => {
  it("holds until ready, then signals on breakouts", () => {
    const strat = new ThresholdMomentum({ kind: "threshold-momentum", lookback: 3, band: 0.01, clipSize: 1 });
    strat.observe(s(100));
    strat.observe(s(100));
    expect(strat.ready).to.equal(false);
    strat.observe(s(100));
    expect(strat.ready).to.equal(true);
    expect(strat.decide(s(100), 0n)).to.equal(0n); // inside band → hold

    strat.observe(s(105));
    expect(strat.decide(s(105), 0n)).to.equal(s(1)); // breakout up → go long

    strat.observe(s(90));
    expect(strat.decide(s(90), s(1))).to.equal(s(-2)); // breakout down → flip to short
  });
});
