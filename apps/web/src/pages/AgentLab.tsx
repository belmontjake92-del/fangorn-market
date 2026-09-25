import { useState } from "react";
import { useBacktest } from "../lib/api";
import { Card, Loading, SectionTitle, Stat } from "../components/ui";
import { LineChart } from "../components/LineChart";

const dollars = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

function Field({ label, value, onChange, min, max, step }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-[11px] text-dim">
        <span className="uppercase tracking-wide">{label}</span>
        <span className="font-mono text-muted">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#c6f24e]"
      />
    </label>
  );
}

export default function AgentLab() {
  const [p, setP] = useState({ seed: 7, ticks: 200, lookback: 5, band: 0.005, clip: 1, vol: 0.02, openingCash: 1000 });
  const set = (k: keyof typeof p) => (v: number) => setP((s) => ({ ...s, [k]: v }));
  const q = useBacktest(p);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-3xl text-fg">Agent Lab</h1>
      <p className="mt-1 text-sm text-muted">
        Backtest strategies against a deterministic synthetic market. The engine uses the exact position math the
        contract settles with, so a backtest and a live run of the same seed agree.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit space-y-4 p-4">
          <SectionTitle>Parameters</SectionTitle>
          <Field label="Ticks" value={p.ticks} onChange={set("ticks")} min={40} max={500} step={10} />
          <Field label="Seed" value={p.seed} onChange={set("seed")} min={1} max={50} step={1} />
          <Field label="Lookback" value={p.lookback} onChange={set("lookback")} min={2} max={30} step={1} />
          <Field label="Band" value={p.band} onChange={set("band")} min={0} max={0.03} step={0.001} />
          <Field label="Clip size" value={p.clip} onChange={set("clip")} min={0.5} max={5} step={0.5} />
          <Field label="Volatility" value={p.vol} onChange={set("vol")} min={0.005} max={0.06} step={0.005} />
        </Card>

        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Final equity" value={q.data ? dollars(q.data.metrics.finalEquity) : "-"} accent />
            <Stat
              label="Return"
              value={q.data ? pct(q.data.metrics.realizedReturnPct) : "-"}
              sub={<span className={q.data && q.data.metrics.realizedReturnPct < 0 ? "text-loss" : "text-gain"}>simulated</span>}
            />
            <Stat label="Max drawdown" value={q.data ? `-${q.data.metrics.maxDrawdownPct.toFixed(2)}%` : "-"} />
            <Stat label="Fills" value={q.data?.metrics.fills ?? "-"} />
          </div>

          <Card className="mt-4 p-4">
            <div className="mb-3 flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3 rounded-sm bg-accent" /> Equity</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3 rounded-sm bg-dim" /> Price</span>
              <span className="ml-auto text-dim">{p.ticks} ticks · seed {p.seed}</span>
            </div>
            {q.isLoading || !q.data ? (
              <Loading />
            ) : (
              <LineChart
                height={220}
                series={[
                  { label: "Price", values: q.data.curve.map((c) => c.price), color: "#3a3a41" },
                  { label: "Equity", values: q.data.curve.map((c) => c.equity), color: "#c6f24e" },
                ]}
              />
            )}
          </Card>

          <div className="mt-3 rounded-lg border border-amber/25 bg-amber/5 px-3 py-2 text-xs text-amber">
            Historical simulation is not live performance. Review assumptions before deploying.
          </div>
        </div>
      </div>
    </div>
  );
}
