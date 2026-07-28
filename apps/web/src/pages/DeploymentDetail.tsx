import { Link, useParams } from "react-router-dom";
import { useDeployment } from "../lib/api";
import { Badge, Card, Loading, Mono, SectionTitle } from "../components/ui";
import { pnlClass, shortHash, size, timeAgo, usd } from "../lib/format";

const tx = (h: string) => `https://sepolia.arbiscan.io/tx/${h}`;

export default function DeploymentDetail() {
  const { id } = useParams();
  const q = useDeployment(id);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <div className="text-sm text-dim">Deployment not found.</div>;
  const { deployment: d, positions, fills } = q.data;

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/marketplace" className="text-xs text-dim hover:text-muted">
        ← Marketplace
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-fg">{d.agent_name ?? d.key}</h1>
          <div className="mt-1 text-sm text-muted">
            {d.market_symbol} · <Mono className="text-dim">{d.id.slice(0, 18)}…</Mono>
          </div>
        </div>
        <Badge tone={d.status as never}>{d.status}</Badge>
      </div>

      <div className="mt-3 rounded-lg border border-cyan/30 bg-cyan/5 px-3 py-2 text-xs text-cyan">
        Paper / simulated fills, settled on-chain against the oracle price. Not live capital.
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <Info label="Opening capital" value={usd(d.opening_cash)} />
        <Info label="Max position" value={usd(d.max_position_notional, 0)} />
        <Info label="Daily loss cap" value={usd(d.daily_loss_limit, 0)} />
        <Info label="Opened" value={timeAgo(d.created_at)} />
      </div>

      <div className="mt-8">
        <SectionTitle>Positions</SectionTitle>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-dim">
              <tr className="border-b border-border-soft">
                <Th>Market</Th>
                <Th>Size</Th>
                <Th>Entry</Th>
                <Th>Mark</Th>
                <Th right>Unrealized</Th>
                <Th right>Notional</Th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.marketId} className="border-b border-border-soft/60 last:border-0">
                  <Td>{p.symbol}</Td>
                  <Td>{size(p.size)}</Td>
                  <Td>{usd(p.entryPrice)}</Td>
                  <Td>{usd(p.markPrice)}</Td>
                  <Td right className={pnlClass(p.unrealizedPnl)}>{usd(p.unrealizedPnl)}</Td>
                  <Td right>{usd(p.notional)}</Td>
                </tr>
              ))}
              {positions.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-dim">No open position.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="mt-8">
        <SectionTitle right={<span className="text-xs text-dim">{fills.length} settled</span>}>Fills</SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-dim">
              <tr className="border-b border-border-soft">
                <Th>When</Th>
                <Th>Δ Size</Th>
                <Th>Price</Th>
                <Th>New size</Th>
                <Th right>Realized</Th>
                <Th right>Cash after</Th>
                <Th right>Tx</Th>
              </tr>
            </thead>
            <tbody>
              {fills.map((f, i) => (
                <tr key={i} className="border-b border-border-soft/60 last:border-0">
                  <Td className="text-dim">{timeAgo(f.ts)}</Td>
                  <Td>{size(f.sizeDelta)}</Td>
                  <Td>{usd(f.price)}</Td>
                  <Td>{size(f.newSize)}</Td>
                  <Td right className={pnlClass(f.realizedPnl)}>{usd(f.realizedPnl)}</Td>
                  <Td right>{usd(f.cashAfter)}</Td>
                  <Td right>
                    <a href={tx(f.txHash)} target="_blank" rel="noreferrer" className="font-mono text-xs text-cyan hover:underline">
                      {shortHash(f.txHash, 4)}
                    </a>
                  </Td>
                </tr>
              ))}
              {fills.length === 0 && (
                <tr><td colSpan={7} className="p-4 text-center text-dim">No fills yet.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-dim">{label}</div>
      <div className="mt-1 text-lg font-semibold text-fg">{value}</div>
    </Card>
  );
}
const Th = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
  <th className={`px-4 py-2 font-medium ${right ? "text-right" : "text-left"}`}>{children}</th>
);
const Td = ({ children, right, className = "" }: { children?: React.ReactNode; right?: boolean; className?: string }) => (
  <td className={`px-4 py-2.5 ${right ? "text-right" : "text-left"} ${className}`}>{children}</td>
);
