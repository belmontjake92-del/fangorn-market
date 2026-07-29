import { Link } from "react-router-dom";
import { useDeployment, useDeployments, type DeploymentRow } from "../lib/api";
import { Badge, Card, Loading } from "../components/ui";
import { agentKind } from "../lib/constants";
import { pnlClass, size, usd } from "../lib/format";

const roleLine: Record<string, string> = {
  signal: "Derives signals from the Grove · sold via x402f",
  alert: "Monitors the market · read-only alerts",
};

function AgentCard({ d }: { d: DeploymentRow }) {
  const isTrade = (d.kind ?? "trade") === "trade";
  const detail = useDeployment(isTrade ? d.id : undefined);
  const pos = detail.data?.positions?.[0];
  const fills = detail.data?.fills ?? [];
  const strat = safeStrategy(d.strategy_json);
  const k = agentKind[d.kind ?? "trade"] ?? { label: "Trading", tone: "public" };

  return (
    <Link to={`/agents/${d.id}`}>
      <Card className="p-4 transition-colors hover:border-accent/30">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-medium text-fg">{d.agent_name ?? d.key}</div>
            <div className="mt-0.5 text-xs text-muted">{d.market_symbol} · {isTrade ? strat : k.label}</div>
          </div>
          <Badge tone={k.tone as never}>{k.label}</Badge>
        </div>

        {isTrade ? (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Metric label="Position" value={pos ? `${size(pos.size)}` : "—"} />
            <Metric label="Unrealized" value={pos ? usd(pos.unrealizedPnl) : "—"} className={pos ? pnlClass(pos.unrealizedPnl) : ""} />
            <Metric label="Fills" value={fills.length || "0"} />
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-border-soft bg-surface-2 px-3 py-3 text-xs text-muted">
            {roleLine[d.kind] ?? "Non-trading agent"}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between border-t border-border-soft pt-3 text-[11px] text-dim">
          <span>{isTrade ? `Daily loss cap ${usd(d.daily_loss_limit, 0)}` : "No capital · no risk gate"}</span>
          <span className="text-accent">View Agent →</span>
        </div>
      </Card>
    </Link>
  );
}

function Metric({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-dim">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${className || "text-fg"}`}>{value}</div>
    </div>
  );
}

function safeStrategy(json: string): string {
  try {
    return JSON.parse(json).kind ?? "strategy";
  } catch {
    return "strategy";
  }
}

export default function Marketplace() {
  const deployments = useDeployments();
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-3xl text-fg">Agent Marketplace</h1>
      <p className="mt-1 text-sm text-muted">
        Discover agents with transparent performance, risk, and provenance. Position and PnL read live from the
        SettlementLedger.
      </p>
      <div className="mt-3">
        <Badge tone="paper">All results are simulated fills settled on-chain</Badge>
      </div>

      {deployments.isLoading ? (
        <Loading />
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(deployments.data ?? []).map((d) => (
            <AgentCard key={d.id} d={d} />
          ))}
          {deployments.data?.length === 0 && <div className="text-sm text-dim">No agents deployed yet.</div>}
        </div>
      )}
    </div>
  );
}
