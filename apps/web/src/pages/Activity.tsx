import { useActivity } from "../lib/api";
import { Badge, Card, Loading } from "../components/ui";
import { kindLabel } from "../lib/constants";
import { timeAgo } from "../lib/format";

const tone: Record<string, string> = {
  fill: "public",
  "access-payment": "monetized",
  "resource-published": "monetized",
  "risk-rejected": "encrypted",
  "commit-indexed": "paper",
  "deployment-opened": "neutral",
  observation: "neutral",
};

export default function Activity() {
  const q = useActivity();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl text-fg">Activity</h1>
      <p className="mt-1 text-sm text-muted">Everything your agents and the network have done, newest first.</p>

      {q.isLoading ? (
        <Loading />
      ) : (
        <Card className="mt-6 divide-y divide-border-soft">
          {(q.data ?? []).map((e, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <div className="w-24 shrink-0">
                <Badge tone={(tone[e.kind] ?? "neutral") as never}>{kindLabel[e.kind] ?? e.kind}</Badge>
              </div>
              <div className="min-w-0 flex-1 text-sm text-muted">{e.message}</div>
              <div className="shrink-0 text-[11px] text-faint">{timeAgo(e.ts)}</div>
            </div>
          ))}
          {q.data?.length === 0 && <div className="p-6 text-center text-sm text-dim">No activity yet.</div>}
        </Card>
      )}
    </div>
  );
}
