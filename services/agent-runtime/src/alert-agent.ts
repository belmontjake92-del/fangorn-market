import type { Hex } from "viem";
import type { Repo } from "@fangorn-market/db";
import { formatUsd } from "@fangorn-market/shared";

export type AlertLevel = "info" | "warning" | "critical";
export interface Alert {
  level: AlertLevel;
  message: string;
}

/**
 * A non-trading, read-only monitoring agent. It watches Grove observations for a
 * market and raises alerts - abnormal moves, new highs/lows, stale data - into
 * the activity feed. No capital, no risk gate: it observes and reports.
 */
export class AlertAgent {
  constructor(
    private readonly deps: {
      repo: Repo;
      symbol: string;
      agentName: string;
      deploymentId?: Hex;
      movePctThreshold?: number; // e.g. 0.02 = 2%
      stalenessSecs?: number;
    },
  ) {}

  /** Compute alerts from current Grove state (pure read). */
  scan(): Alert[] {
    const rows = this.deps.repo.listObservations(this.deps.symbol, 100);
    if (rows.length === 0) return [{ level: "warning", message: `No Grove data for ${this.deps.symbol}` }];

    const asc = rows.slice().reverse();
    const last = asc[asc.length - 1]!;
    const prev = asc[asc.length - 2];
    const prices = asc.map((o) => o.price);
    const alerts: Alert[] = [];

    if (prev && prev.price > 0n) {
      const move = Number(last.price - prev.price) / Number(prev.price);
      if (Math.abs(move) >= (this.deps.movePctThreshold ?? 0.02)) {
        alerts.push({
          level: "warning",
          message: `${this.deps.symbol} moved ${(move * 100).toFixed(1)}% to ${formatUsd(last.price)}`,
        });
      }
    }

    if (prices.length > 5) {
      const max = prices.reduce((a, b) => (b > a ? b : a));
      const min = prices.reduce((a, b) => (b < a ? b : a));
      if (last.price === max) alerts.push({ level: "info", message: `${this.deps.symbol} new high ${formatUsd(last.price)}` });
      else if (last.price === min) alerts.push({ level: "info", message: `${this.deps.symbol} new low ${formatUsd(last.price)}` });
    }

    const age = Math.floor(Date.now() / 1000) - last.ts;
    if (this.deps.stalenessSecs && age > this.deps.stalenessSecs) {
      alerts.push({ level: "critical", message: `${this.deps.symbol} data is stale (${age}s since last observation)` });
    }

    return alerts;
  }

  /** Scan and record alerts to the activity feed. Returns what was raised. */
  run(): Alert[] {
    const alerts = this.scan();
    const now = Math.floor(Date.now() / 1000);
    for (const a of alerts) {
      this.deps.repo.addActivity({
        ts: now,
        kind: "alert",
        deploymentId: this.deps.deploymentId,
        message: `[${a.level}] ${this.deps.agentName}: ${a.message}`,
      });
    }
    return alerts;
  }
}
