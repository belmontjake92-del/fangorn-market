/**
 * Alert / monitoring agent — a NON-TRADING, read-only agent. Watches Grove
 * observations and raises alerts (abnormal moves, new highs/lows, stale data)
 * into the activity feed. No capital, no secrets — pure DB read.
 *
 * Run: pnpm --filter @fangorn-market/agent-runtime run:alert-agent
 */
import { resolve } from "node:path";
import type { Address } from "viem";
import { Repo } from "@fangorn-market/db";
import { deploymentId, findRepoRoot, marketId, type DeploymentConfig } from "@fangorn-market/shared";
import { AlertAgent } from "../alert-agent.js";

const SYMBOL = process.env.SEED_SYMBOL ?? "RH:ACME";
const AGENT_NAME = "Canopy Sentinel";
const OWNER = (process.env.ALERT_OWNER ?? "0xA6F07F90Fb1dEfe9a3847870e5860D6C9017Bb6d") as Address;

function main() {
  const repo = Repo.open(resolve(findRepoRoot(), ".data", "sepolia.db"));

  const id = deploymentId(`alert-agent-${SYMBOL}`);
  const cfg: DeploymentConfig = {
    id,
    key: `alert-agent-${SYMBOL}`,
    agentName: AGENT_NAME,
    owner: OWNER,
    operator: OWNER,
    openingCash: 0n,
    limits: { maxPositionNotional: 0n, dailyLossLimit: 0n },
    market: { symbol: SYMBOL, marketId: marketId(SYMBOL), label: SYMBOL, assetClass: "tokenized" },
    strategy: { kind: "threshold-momentum", lookback: 5, band: 0.02, clipSize: 0 },
  };
  repo.upsertDeployment(cfg, "live", "alert");

  const agent = new AlertAgent({
    repo,
    symbol: SYMBOL,
    agentName: AGENT_NAME,
    deploymentId: id,
    movePctThreshold: Number(process.env.ALERT_MOVE_PCT ?? 0.02),
    stalenessSecs: Number(process.env.ALERT_STALENESS_SECS ?? 3600),
  });
  const alerts = agent.run();

  console.log(`${AGENT_NAME}: scanned ${SYMBOL} — ${alerts.length} alert(s) raised.`);
  for (const a of alerts) console.log(`  [${a.level}] ${a.message}`);
  if (alerts.length === 0) console.log("  (nothing abnormal right now)");
}

main();
