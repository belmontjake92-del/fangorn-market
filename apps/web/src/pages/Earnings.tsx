import { useAccount } from "wagmi";
import { useEarnings } from "../lib/api";
import { Card, Loading, Mono, SectionTitle, Stat } from "../components/ui";
import { PLATFORM_OWNER } from "../lib/constants";
import { shortAddr, timeAgo, usdcMicro } from "../lib/format";

export default function Earnings() {
  const { address } = useAccount();
  const owner = address ?? PLATFORM_OWNER;
  const q = useEarnings(owner);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl text-fg">Earnings</h1>
      <p className="mt-1 text-sm text-muted">
        Revenue from selling access to your intelligence. Buyers pay through unlinkable stealth identities - you see the
        sale, not who they are.
      </p>
      <div className="mt-2 font-mono text-[11px] text-dim">owner {shortAddr(owner)}{!address && " (platform default - connect wallet for yours)"}</div>

      {q.isLoading ? (
        <Loading />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Gross earnings" value={q.data ? usdcMicro(q.data.grossUsdcBaseUnits) : "-"} accent />
            <Stat label="Purchases" value={q.data?.purchases ?? 0} />
            <Stat label="Platform fee" value="0%" sub="configurable" />
          </div>

          <div className="mt-8">
            <SectionTitle>Recent purchases</SectionTitle>
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-dim">
                  <tr className="border-b border-border-soft">
                    <th className="px-4 py-2 text-left font-medium">When</th>
                    <th className="px-4 py-2 text-left font-medium">Buyer (stealth)</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    <th className="px-4 py-2 text-left font-medium">Nullifier</th>
                  </tr>
                </thead>
                <tbody>
                  {(q.data?.recent ?? []).map((p, i) => (
                    <tr key={i} className="border-b border-border-soft/60 last:border-0">
                      <td className="px-4 py-2.5 text-dim">{timeAgo(p.ts)}</td>
                      <td className="px-4 py-2.5">
                        <Mono className="text-violet">{p.buyerStealth ? shortAddr(p.buyerStealth) : "-"}</Mono>
                      </td>
                      <td className="px-4 py-2.5 text-right text-accent">{usdcMicro(p.amount)}</td>
                      <td className="px-4 py-2.5">
                        <Mono className="text-faint">{p.nullifier ? `${p.nullifier.slice(0, 10)}…` : "-"}</Mono>
                      </td>
                    </tr>
                  ))}
                  {q.data?.recent?.length === 0 && (
                    <tr><td colSpan={4} className="p-4 text-center text-dim">No purchases yet.</td></tr>
                  )}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
