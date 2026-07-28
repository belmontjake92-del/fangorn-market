import { Card, SectionTitle } from "../components/ui";

const levels = [
  { n: 1, name: "Unverified", desc: "No checks performed." },
  { n: 2, name: "Builder Verified", desc: "Builder identity confirmed." },
  { n: 3, name: "Reproducible Backtest", desc: "Backtest reproduces from disclosed assumptions." },
  { n: 4, name: "Verified Paper Record", desc: "Paper results verified by the platform." },
  { n: 5, name: "Verified Live Record", desc: "Results from an actual deployed agent." },
  { n: 6, name: "Independently Audited", desc: "Third-party audit on file." },
];

const quality = ["Freshness", "Completeness", "Consistency", "Provenance", "Schema validity", "Publisher reputation", "Revision frequency", "Dispute history", "License clarity"];
const claimRules = ["Time period", "Result type", "Benchmark", "Fees", "Slippage", "Drawdown", "Asset universe", "Version", "Data period"];

export default function Trust() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl text-fg">Trust Center</h1>
      <p className="mt-1 text-sm text-muted">
        Performance should be inspectable, not advertised. These are the layers behind every marketplace claim.
      </p>

      <div className="mt-8">
        <SectionTitle>Agent verification levels</SectionTitle>
        <Card className="divide-y divide-border-soft">
          {levels.map((l) => (
            <div key={l.n} className="flex items-center gap-4 p-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 font-mono text-xs text-accent">{l.n}</div>
              <div className="w-48 text-sm text-fg">{l.name}</div>
              <div className="flex-1 text-xs text-muted">{l.desc}</div>
            </div>
          ))}
        </Card>
        <p className="mt-2 text-[11px] text-dim">These are separate badges and do not imply investment quality.</p>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <SectionTitle>Data quality indicators</SectionTitle>
          <Card className="flex flex-wrap gap-2 p-4">
            {quality.map((q) => (
              <span key={q} className="rounded-full border border-border bg-white/5 px-2.5 py-1 text-xs text-muted">{q}</span>
            ))}
          </Card>
        </div>
        <div>
          <SectionTitle>Marketplace claim rules</SectionTitle>
          <Card className="p-4">
            <p className="mb-2 text-xs text-dim">Performance may not be advertised without disclosing:</p>
            <div className="flex flex-wrap gap-2">
              {claimRules.map((c) => (
                <span key={c} className="rounded-full border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs text-accent">{c}</span>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-border-soft bg-surface p-4 text-xs leading-relaxed text-dim">
        Fangorn Market is an independent application designed for Robinhood Chain. References to Robinhood Chain do not
        imply endorsement by or affiliation with Robinhood Markets unless expressly stated. All performance shown is
        simulated on Arbitrum Sepolia.
      </div>
    </div>
  );
}
