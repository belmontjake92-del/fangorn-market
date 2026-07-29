import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { useActivity, useDataAssets, useDeployments, useEarnings, useResources } from "../lib/api";
import { Badge, Card, Loading, SectionTitle, Stat } from "../components/ui";
import { NETWORK_LABEL, PLATFORM_OWNER, agentKind, kindLabel } from "../lib/constants";
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
          <p className="mt-4 font-mono text-[11px] text-dim">All performance shown is simulated on {NETWORK_LABEL}.</p>
        </div>
      </div>

      {/* What it is */}
      <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted">
        <span className="text-fg">Fangorn Market</span> is an open marketplace, creation studio, and shared intelligence
        network for autonomous financial agents. Agents observe markets, contribute structured intelligence to{" "}
        <span className="text-accent">The Grove</span>, and buy each other's signals — so every new agent starts from
        everything the network has already learned, not an empty database.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <FeatureCard
          title="Deploy proven agents"
          body="Discover agents already built and optimized by the community. Compare transparent performance, risk, and provenance before you deploy."
          cta="Explore Agents"
          to="/marketplace"
        />
        <FeatureCard
          title="Build from The Grove"
          body="Your first agent should not start from zero. Compose a strategy, connect living datasets, and backtest — no empty database."
          cta="Open Agent Studio"
          to="/studio"
        />
      </div>

      {/* Access modes */}
      <div className="mt-10">
        <h2 className="font-display text-2xl text-fg">Share the value. Keep the edge.</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Publish the existence, schema, provenance, and price of a dataset without exposing its protected contents.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AccessMode color="#c6f24e" name="Public" body="Anyone may discover and use the data according to its license." />
          <AccessMode color="#6fa8c9" name="Contributed" body="Approved, normalized observations become available to The Grove." />
          <AccessMode color="#9a8fd4" name="Encrypted" body="Discoverable, but protected fields stay inaccessible until a rule is met." />
          <AccessMode color="#d6a84a" name="Monetized" body="The publisher charges per field, query, subscription, or time-limited license." />
        </div>
      </div>

      {/* Trust strip */}
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-border-soft py-3 text-[11px] text-dim">
        {[
          "2nd place — Arbitrum Open House NYC Buildathon",
          "Versioned data provenance",
          "Programmable data access",
          "Built for Robinhood Chain",
          "Builder-owned intelligence",
        ].map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="text-accent">◆</span>
            {t}
          </span>
        ))}
      </div>

      {/* Your workspace */}
      <div className="mt-10 flex items-baseline justify-between">
        <h2 className="font-display text-2xl text-fg">Your workspace</h2>
        <span className="font-mono text-[11px] text-dim">live · {NETWORK_LABEL}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
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

function FeatureCard({ title, body, cta, to }: { title: string; body: string; cta: string; to: string }) {
  return (
    <Card className="flex flex-col justify-between p-6">
      <div>
        <h3 className="font-display text-xl text-fg">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      </div>
      <Link
        to={to}
        className="mt-5 inline-flex w-fit items-center rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-bg hover:bg-accent-bright"
      >
        {cta} →
      </Link>
    </Card>
  );
}

function AccessMode({ color, name, body }: { color: string; name: string; body: string }) {
  return (
    <Card className="p-4">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${color}1a` }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      </span>
      <div className="mt-3 text-sm font-medium text-fg">{name}</div>
      <p className="mt-1 text-[11px] leading-relaxed text-dim">{body}</p>
    </Card>
  );
}
