import { useDataAssets, useResources } from "../lib/api";
import { Badge, Card, Loading, Mono, SectionTitle } from "../components/ui";
import { shortAddr, shortHash, timeAgo, usdcMicro } from "../lib/format";

const tx = (h: string) => `https://sepolia.arbiscan.io/tx/${h}`;

export default function Grove() {
  const assets = useDataAssets();
  const resources = useResources();

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-3xl text-fg">The Grove</h1>
      <p className="mt-1 text-sm text-muted">
        A connected graph of market intelligence - independently owned datasets, versioned and verifiable on Fangorn.
      </p>

      <div className="mt-8">
        <SectionTitle right={<span className="text-xs text-dim">Public / contributed</span>}>Data Assets</SectionTitle>
        {assets.isLoading ? (
          <Loading />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(assets.data ?? []).map((a) => (
              <Card key={`${a.publisher}-${a.namespace}`} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-fg">{a.symbol ?? a.namespace}</div>
                  <Badge tone="public">public</Badge>
                </div>
                <div className="mt-1 font-mono text-[11px] text-dim">{a.namespace}</div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <KV k="Records" v={a.recordCount} />
                  <KV k="Latest seq" v={a.latestSeq ?? "-"} />
                  <KV k="Publisher" v={shortAddr(a.publisher)} />
                  <KV k="Updated" v={timeAgo(a.lastUpdated)} />
                </div>
                <div className="mt-3 truncate border-t border-border-soft pt-2 font-mono text-[10px] text-faint">
                  commit {a.latestCommit.slice(0, 20)}…
                </div>
              </Card>
            ))}
            {assets.data?.length === 0 && <div className="text-sm text-dim">No data assets indexed yet.</div>}
          </div>
        )}
      </div>

      <div className="mt-10">
        <SectionTitle right={<span className="text-xs text-dim">Encrypted · pay-per-access via x402f</span>}>
          Monetized Intelligence
        </SectionTitle>
        {resources.isLoading ? (
          <Loading />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(resources.data ?? []).map((r) => (
              <Card key={r.resourceId} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LockIcon />
                    <div className="font-medium text-fg">{r.symbol ?? "Premium signal"}</div>
                  </div>
                  <Badge tone="monetized">{r.accessMode}</Badge>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-dim">{r.name}</div>
                <div className="mt-4 flex items-baseline justify-between">
                  <div className="text-2xl font-semibold text-accent">{usdcMicro(r.price)}</div>
                  <div className="text-[11px] text-dim">per read</div>
                </div>
                <div className="mt-3 space-y-1 border-t border-border-soft pt-2 text-[10px] text-faint">
                  <div>owner {shortAddr(r.owner)}</div>
                  <div className="truncate">hash {r.plaintextHash.slice(0, 22)}…</div>
                  {r.createTx && (
                    <a href={tx(r.createTx)} target="_blank" rel="noreferrer" className="text-cyan hover:underline">
                      register tx {shortHash(r.createTx, 4)}
                    </a>
                  )}
                </div>
              </Card>
            ))}
            {resources.data?.length === 0 && (
              <div className="text-sm text-dim">No monetized resources published yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <span className="text-dim">{k}: </span>
      <span className="text-muted">{v}</span>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="10" width="16" height="10" rx="2" stroke="#d6a84a" strokeWidth="1.6" />
      <path d="M8 10V7a4 4 0 018 0v3" stroke="#d6a84a" strokeWidth="1.6" />
    </svg>
  );
}
