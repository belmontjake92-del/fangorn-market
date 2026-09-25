import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { api, useDeployments, type DeploymentDetail, type DeploymentRow } from "../lib/api";
import { Sparkline } from "../components/Sparkline";
import { CATEGORIES, RISK_LEVELS, type AgentState } from "../lib/catalog";
import { useNetwork, useNetworkMeta, withNet } from "../lib/prefs";
import { toNum } from "../lib/format";

interface MarketAgent {
  id: string;
  href: string;
  name: string;
  builder: string;
  version: string;
  category: string;
  risk: string;
  drawdown: string;
  state: AgentState;
  verified: boolean;
  perf: string;
  period: string;
  price: string;
  deploys: number | null;
  rating: number | null;
  summary: string;
  accent: string;
  spark: number[];
  onchain: boolean;
}

const stateStyle: Record<AgentState, string> = {
  live: "border-accent/40 text-accent bg-accent/10",
  paper: "border-cyan/40 text-cyan bg-cyan/10",
  backtest: "border-violet/40 text-violet bg-violet/10",
};


function realToAgent(d: DeploymentRow, netLabel: string, detail?: DeploymentDetail): MarketAgent {
  const kind = d.kind ?? "trade";
  const category = kind === "alert" ? "Risk Monitoring" : kind === "signal" ? "Market Research" : "Portfolio Management";
  const fills = detail?.fills ?? [];
  const spark = fills.length > 1 ? [...fills].reverse().map((f) => toNum(f.cashAfter)) : [100, 100.2, 99.8, 100.4, 100.1];
  const realized = fills.reduce((s, f) => s + Number(f.realizedPnl), 0);
  const perf =
    kind === "trade"
      ? `${realized >= 0 ? "+" : ""}$${(realized / 1e6).toFixed(2)} realized`
      : kind === "signal"
        ? "Sells derived signals"
        : "Read-only monitoring";
  return {
    id: `onchain:${d.id}`,
    href: `/agents/${d.id}`,
    name: d.agent_name ?? d.key,
    builder: "You · on-chain",
    version: "live",
    category,
    risk: kind === "trade" ? "Medium" : "Read-only",
    drawdown: "-",
    state: "live",
    verified: true,
    perf,
    period: `${fills.length} fills · ${netLabel}`,
    price: kind === "signal" ? "0.001 USDC / read" : "Free",
    deploys: null,
    rating: null,
    summary:
      kind === "signal"
        ? "Derives a confidence signal from The Grove and sells it via x402f."
        : kind === "alert"
          ? "Watches the market and raises alerts. Read-only - never trades."
          : "Deterministic momentum agent settling simulated fills on-chain.",
    accent: kind === "signal" ? "#d6a84a" : kind === "alert" ? "#9a8fd4" : "#6fa8c9",
    spark,
    onchain: true,
  };
}

function Stars({ n }: { n: number }) {
  return <span className="text-amber">{"★".repeat(Math.round(n))}<span className="text-faint">{"★".repeat(5 - Math.round(n))}</span></span>;
}

function AgentCard({ a, extra }: { a: MarketAgent; extra: number }) {
  const totalDeploys = a.deploys != null ? a.deploys + extra : null;
  return (
    <div className="group flex flex-col rounded-xl border border-border-soft bg-surface p-4 transition-all hover:border-accent/30 hover:bg-surface-2">
      <Link to={a.href} className="flex flex-1 flex-col">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${a.accent}1a` }}>
            <span className="h-3 w-3 rotate-45 rounded-[3px]" style={{ background: a.accent }} />
          </span>
          <div>
            <div className="flex items-center gap-1.5 font-medium text-fg">
              {a.name}
              {a.verified && <span className="text-accent" title="Verified builder">✓</span>}
            </div>
            <div className="text-[11px] text-dim">{a.builder} · {a.version}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {a.onchain && <span className="rounded-full border border-accent/30 bg-accent/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-accent">on-chain</span>}
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${stateStyle[a.state]}`}>{a.state}</span>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">{a.summary}</p>

      <div className="mt-3 flex items-end justify-between">
        <Sparkline values={a.spark} color={a.accent} width={128} height={38} />
        <div className="text-right">
          <div className="text-xs font-medium text-fg">{a.perf}</div>
          <div className="text-[10px] text-dim">{a.period}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip>{a.category}</Chip>
        <Chip>Risk: {a.risk}</Chip>
        <Chip>DD {a.drawdown}</Chip>
      </div>
      </Link>

      <div className="mt-3 flex items-center justify-between border-t border-border-soft pt-3">
        <span className="text-sm font-semibold text-fg">{a.price}</span>
        <div className="flex items-center gap-3 text-[11px] text-dim">
          {totalDeploys != null && <span className="font-mono">{totalDeploys.toLocaleString()} deploys</span>}
          {a.rating != null && <Stars n={a.rating} />}
          <Link
            to={`/deploy?agent=${encodeURIComponent(a.id)}&name=${encodeURIComponent(a.name)}`}
            className="font-medium text-accent hover:underline"
          >
            Deploy →
          </Link>
        </div>
      </div>
    </div>
  );
}

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-md border border-border bg-white/5 px-2 py-0.5 text-[10px] text-muted">{children}</span>
);

export default function Marketplace() {
  const net = useNetwork();
  const netLabel = useNetworkMeta().label;
  const deployments = useDeployments();
  const details = useQueries({
    queries: (deployments.data ?? [])
      .filter((d) => (d.kind ?? "trade") === "trade")
      .map((d) => ({ queryKey: ["deployment", net, d.id], queryFn: () => api<DeploymentDetail>(withNet(`/api/deployments/${d.id}`, net)) })),
  });

  const [cat, setCat] = useState<string | null>(null);
  const [risk, setRisk] = useState<string | null>(null);
  const [sort, setSort] = useState<"deploys" | "rating" | "drawdown">("deploys");
  const [query, setQuery] = useState("");

  const agents = useMemo<MarketAgent[]>(() => {
    const detailMap = new Map(details.map((q) => [q.data?.deployment.id, q.data]).filter(([k]) => k) as [string, DeploymentDetail][]);
    const real = (deployments.data ?? []).map((d) => realToAgent(d, netLabel, detailMap.get(d.id)));
    return real; // only agents that actually ran and settled on-chain
  }, [deployments.data, details, netLabel]);

  const filtered = agents
    .filter((a) => (cat ? a.category === cat : true))
    .filter((a) => (risk ? a.risk === risk : true))
    .filter((a) => (query ? (a.name + a.summary).toLowerCase().includes(query.toLowerCase()) : true))
    .sort((x, y) => {
      if (x.onchain !== y.onchain) return x.onchain ? -1 : 1; // real on-chain first
      if (sort === "rating") return (y.rating ?? 0) - (x.rating ?? 0);
      if (sort === "drawdown") return parseFloat(x.drawdown.replace(/[-%-]/g, "") || "0") - parseFloat(y.drawdown.replace(/[-%-]/g, "") || "0");
      return (y.deploys ?? 9e9) - (x.deploys ?? 9e9);
    });

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-3xl text-fg">Agent Marketplace</h1>
      <p className="mt-1 text-sm text-muted">Discover financial agents with transparent performance, risk, provenance, and permissions.</p>

      <div className="mt-4 flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-border-soft bg-surface px-3 py-2">
          <span className="text-accent">✦</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask: low-turnover portfolio agent, 6mo+ verified paper, <12% drawdown…"
            className="flex-1 bg-transparent text-sm text-fg placeholder:text-dim focus:outline-none"
          />
          <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-dim">NL query</span>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[190px_1fr]">
        <aside className="h-fit space-y-5 text-sm">
          <FilterGroup title="Category" items={[...CATEGORIES]} active={cat} onPick={setCat} />
          <FilterGroup title="Risk level" items={[...RISK_LEVELS]} active={risk} onPick={setRisk} pill />
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-wider text-dim">Sort by</div>
            {([["deploys", "Deployments"], ["rating", "Rating"], ["drawdown", "Lowest drawdown"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setSort(k)} className={`block w-full rounded-md px-2 py-1 text-left text-xs ${sort === k ? "bg-white/5 text-fg" : "text-dim hover:text-muted"}`}>
                {label}
              </button>
            ))}
          </div>
        </aside>

        <div>
          <div className="mb-3 flex items-center justify-between text-xs text-dim">
            <span>{filtered.length} agents{cat ? ` · ${cat}` : " · All"}</span>
            <span>Real on-chain agents shown first</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((a) => (
              <AgentCard key={a.href + a.name} a={a} extra={0} />
            ))}
          </div>
          <p className="mt-6 text-center text-[11px] text-dim">Every agent listed here actually ran. Fills are settled on-chain on {netLabel} against the oracle price (paper, not live capital).</p>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ title, items, active, onPick, pill }: { title: string; items: string[]; active: string | null; onPick: (v: string | null) => void; pill?: boolean }) {
  return (
    <div>
      <div className="mb-2 text-[11px] uppercase tracking-wider text-dim">{title}</div>
      <div className={pill ? "flex flex-wrap gap-1.5" : "space-y-0.5"}>
        <button
          onClick={() => onPick(null)}
          className={pill ? `rounded-full border px-2 py-0.5 text-[11px] ${!active ? "border-accent/50 text-accent" : "border-border text-dim"}` : `block w-full rounded-md px-2 py-1 text-left text-xs ${!active ? "bg-white/5 text-fg" : "text-dim hover:text-muted"}`}
        >
          All
        </button>
        {items.map((it) => (
          <button
            key={it}
            onClick={() => onPick(it)}
            className={pill ? `rounded-full border px-2 py-0.5 text-[11px] ${active === it ? "border-accent/50 text-accent" : "border-border text-dim hover:text-muted"}` : `block w-full rounded-md px-2 py-1 text-left text-xs ${active === it ? "bg-white/5 text-fg" : "text-dim hover:text-muted"}`}
          >
            {it}
          </button>
        ))}
      </div>
    </div>
  );
}
