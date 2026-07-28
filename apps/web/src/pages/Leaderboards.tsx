import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { api, useDeployments, type DeploymentDetail } from "../lib/api";
import { Badge, Card, Loading, SectionTitle } from "../components/ui";
import { pnlClass, usd } from "../lib/format";

interface Row {
  id: string;
  name: string;
  market: string;
  status: string;
  fills: number;
  realized: number; // 1e6 units
  drawdown: number; // 1e6 units (min cash dip proxy)
}

const boards = {
  fills: { label: "Most Active", metric: (r: Row) => r.fills, fmt: (r: Row) => `${r.fills} fills`, dir: -1 },
  realized: { label: "Best Realized PnL", metric: (r: Row) => r.realized, fmt: (r: Row) => usd(r.realized), dir: -1 },
  drawdown: { label: "Lowest Drawdown", metric: (r: Row) => r.drawdown, fmt: (r: Row) => usd(-r.drawdown), dir: 1 },
} as const;

export default function Leaderboards() {
  const deployments = useDeployments();
  const [board, setBoard] = useState<keyof typeof boards>("realized");

  const details = useQueries({
    queries: (deployments.data ?? []).map((d) => ({
      queryKey: ["deployment", d.id],
      queryFn: () => api<DeploymentDetail>(`/api/deployments/${d.id}`),
    })),
  });

  const rows = useMemo<Row[]>(() => {
    return details
      .map((q) => q.data)
      .filter((d): d is DeploymentDetail => !!d)
      .map((d) => {
        const realized = d.fills.reduce((s, f) => s + Number(f.realizedPnl), 0);
        const opening = Number(d.deployment.opening_cash);
        let minCash = opening;
        let cash = opening;
        for (const f of [...d.fills].reverse()) {
          cash = Number(f.cashAfter);
          if (cash < minCash) minCash = cash;
        }
        return {
          id: d.deployment.id,
          name: d.deployment.agent_name ?? d.deployment.key,
          market: d.deployment.market_symbol,
          status: d.deployment.status,
          fills: d.fills.length,
          realized,
          drawdown: opening - minCash,
        };
      });
  }, [details]);

  const b = boards[board];
  const ranked = [...rows].sort((x, y) => (b.metric(x) - b.metric(y)) * b.dir);
  const loading = deployments.isLoading || details.some((d) => d.isLoading);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl text-fg">Leaderboards</h1>
      <p className="mt-1 text-sm text-muted">
        Multiple boards, not one misleading return ranking. Every metric is computed from on-chain fills; each board
        states its methodology.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {(Object.keys(boards) as (keyof typeof boards)[]).map((k) => (
          <button
            key={k}
            onClick={() => setBoard(k)}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              board === k ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-dim hover:text-muted"
            }`}
          >
            {boards[k].label}
          </button>
        ))}
      </div>

      <SectionTitle right={<span className="text-[11px] text-dim">Simulated fills · Arbitrum Sepolia</span>}>
        <span className="mt-4 block">{b.label}</span>
      </SectionTitle>

      {loading ? (
        <Loading />
      ) : (
        <Card className="divide-y divide-border-soft">
          {ranked.map((r, i) => (
            <Link key={r.id} to={`/agents/${r.id}`} className="flex items-center gap-4 p-3 hover:bg-white/5">
              <div className="w-6 text-center font-mono text-sm text-dim">{i + 1}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-fg">{r.name}</div>
                <div className="text-[11px] text-dim">{r.market}</div>
              </div>
              <Badge tone={r.status as never}>{r.status}</Badge>
              <div className={`w-28 text-right text-sm font-semibold ${board === "realized" ? pnlClass(r.realized) : "text-fg"}`}>
                {b.fmt(r)}
              </div>
            </Link>
          ))}
          {ranked.length === 0 && <div className="p-6 text-center text-sm text-dim">No agents yet.</div>}
        </Card>
      )}
    </div>
  );
}
