import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { useActivity, useDataAssets, useDeployments, useEarnings, useResources } from "../lib/api";
import { Badge, Card, Loading, SectionTitle, Stat } from "../components/ui";
import { PLATFORM_OWNER, kindLabel } from "../lib/constants";
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
      <h1 className="font-display text-3xl text-fg">Overview</h1>
      <p className="mt-1 text-sm text-muted">
        Live state of your agents, the Grove, and earnings — read from Arbitrum Sepolia.
      </p>

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
                      <Badge tone={d.status as never}>{d.status}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted">{d.market_symbol} · threshold-momentum</div>
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
