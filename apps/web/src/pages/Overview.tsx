import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { useActivity, useDataAssets, useDeployments, useEarnings, useResources } from "../lib/api";
import { Badge, Card, Loading, SectionTitle, Stat } from "../components/ui";
import { PLATFORM_OWNER, agentKind, kindLabel } from "../lib/constants";
import { timeAgo, usdcMicro } from "../lib/format";

export default function Overview() {
  const { address } = useAccount();
  const deployments = useDeployments();
  const assets = useDataAssets();
  const resources = useResources();
  const activity = useActivity();
  const earnings = useEarnings(address ?? PLATFORM_OWNER);

  const observationCount = (assets.data ?? []).reduce((n, a) => n + a.recordCount, 0);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border-soft bg-gradient-to-br from-[#0c0d0a] via-surface to-[#0b0d10] p-8">
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <svg width="100%" height="100%" viewBox="0 0 600 240" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <g stroke="#c6f24e" strokeWidth="0.6" opacity="0.5" fill="none">
              <path d="M40,200 C160,180 220,120 340,120 C440,120 500,70 560,60" />
              <path d="M40,200 C160,210 240,180 360,180 C450,180 520,150 560,140" />
              <path d="M340,120 L420,60 M340,120 L420,180" />
            </g>
            {[[40, 200], [200, 150], [340, 120], [420, 60], [420, 180], [560, 60]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i === 2 ? 4 : 2.5} fill="#c6f24e" opacity={i === 2 ? 0.9 : 0.5} />
            ))}
          </svg>
        </div>
        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-black/30 px-3 py-1 font-mono text-[11px] text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Built for Robinhood Chain · Powered by Fangorn
          </span>
          <h1 className="mt-4 font-display text-4xl leading-tight text-fg">
            Build smarter agents. <span className="text-accent">Trade proven intelligence.</span>
          </h1>
          <p className="mt-3 text-sm text-muted">
            Create, test, deploy, and monetize financial agents on shared, verifiable market intelligence — or discover
            agents already optimized by the community.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/marketplace" className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bg hover:bg-accent-bright">Explore Agents</Link>
            <Link to="/studio" className="rounded-full border border-border px-5 py-2 text-sm font-medium text-fg hover:border-accent/40 hover:text-accent">Open Agent Studio</Link>
          </div>
          <p className="mt-4 font-mono text-[11px] text-dim">All performance shown is simulated on Arbitrum Sepolia.</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Active Agents" value={deployments.data?.length ?? "—"} />
        <Stat label="Data Assets" value={assets.data?.length ?? "—"} />
        <Stat label="Grove Records" value={observationCount || "—"} />
        <Stat label="Monetized Signals" value={resources.data?.length ?? "—"} />
        <Stat
          label="Earnings"
          value={earnings.data ? usdcMicro(earnings.data.grossUsdcBaseUnits) : "—"}
          sub={earnings.data ? `${earnings.data.purchases} purchase(s)` : undefined}
          accent
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionTitle right={<Link to="/marketplace" className="text-xs text-accent hover:underline">View all →</Link>}>
            Your Agents
          </SectionTitle>
          {deployments.isLoading ? (
            <Loading />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {(deployments.data ?? []).map((d) => (
                <Link key={d.id} to={`/agents/${d.id}`}>
                  <Card className="p-4 transition-colors hover:border-accent/30">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-fg">{d.agent_name ?? d.key}</div>
                      <Badge tone={(agentKind[d.kind ?? "trade"]?.tone ?? "public") as never}>
                        {agentKind[d.kind ?? "trade"]?.label ?? "Trading"}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted">{d.market_symbol}</div>
                    <div className="mt-3 font-mono text-[11px] text-dim">{d.id.slice(0, 14)}…</div>
                  </Card>
                </Link>
              ))}
              {deployments.data?.length === 0 && (
                <div className="text-sm text-dim">No deployments yet.</div>
              )}
            </div>
          )}
        </div>

        <div>
          <SectionTitle right={<Link to="/activity" className="text-xs text-accent hover:underline">All →</Link>}>
            Activity
          </SectionTitle>
          <Card className="divide-y divide-border-soft">
            {(activity.data ?? []).slice(0, 9).map((e, i) => (
              <div key={i} className="flex items-start gap-3 p-3">
                <span className="mt-0.5 text-[10px] uppercase tracking-wide text-dim">{kindLabel[e.kind] ?? e.kind}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-muted">{e.message}</div>
                  <div className="text-[10px] text-faint">{timeAgo(e.ts)}</div>
                </div>
              </div>
            ))}
            {activity.data?.length === 0 && <div className="p-4 text-sm text-dim">No activity yet.</div>}
          </Card>
        </div>
      </div>
    </div>
  );
}
