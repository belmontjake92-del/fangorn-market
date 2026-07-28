import { useState } from "react";
import { Link } from "react-router-dom";
import { useBacktest } from "../lib/api";
import { Badge, Card, SectionTitle } from "../components/ui";
import { LineChart } from "../components/LineChart";

const contributionOptions = [
  "Keep all observations private",
  "Share anonymized aggregate observations",
  "Share derived signals only",
  "Publish after a delay",
  "Sell access to selected fields",
  "Prohibit training use",
];

function TextRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-dim">{label}</div>
      {children}
    </label>
  );
}

const input = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent/50";

export default function Studio() {
  const [name, setName] = useState("Atlas Momentum");
  const [market, setMarket] = useState("RH:ACME");
  const [lookback, setLookback] = useState(5);
  const [band, setBand] = useState(0.005);
  const [clip, setClip] = useState(1);
  const [maxPos, setMaxPos] = useState(5000);
  const [dailyLoss, setDailyLoss] = useState(200);
  const [contrib, setContrib] = useState<Record<string, boolean>>({ "Share derived signals only": true });

  const bt = useBacktest({ seed: 7, ticks: 160, lookback, band, clip, vol: 0.02, openingCash: 1000 });

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-3xl text-fg">Agent Studio</h1>
      <p className="mt-1 text-sm text-muted">
        Your first agent should not start from zero. Describe a strategy, connect intelligence, set risk, and preview a
        backtest — before you deploy.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="space-y-4 p-4">
            <SectionTitle>1 · Define</SectionTitle>
            <TextRow label="Agent name"><input className={input} value={name} onChange={(e) => setName(e.target.value)} /></TextRow>
            <TextRow label="Market"><input className={input} value={market} onChange={(e) => setMarket(e.target.value)} /></TextRow>
            <TextRow label="Strategy">
              <textarea
                className={`${input} h-20 resize-none`}
                defaultValue="Momentum on tokenized equity: go long above a band around the moving average, short below, flat inside. Simulated fills settled on-chain."
              />
            </TextRow>
          </Card>

          <Card className="space-y-4 p-4">
            <SectionTitle right={<Badge tone="neutral">threshold-momentum</Badge>}>2 · Strategy</SectionTitle>
            <div className="grid grid-cols-3 gap-3">
              <Num label="Lookback" value={lookback} set={setLookback} step={1} />
              <Num label="Band" value={band} set={setBand} step={0.001} />
              <Num label="Clip size" value={clip} set={setClip} step={0.5} />
            </div>
          </Card>

          <Card className="space-y-4 p-4">
            <SectionTitle>3 · Risk & wallet</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Num label="Max position (USDC)" value={maxPos} set={setMaxPos} step={500} />
              <Num label="Daily loss cap (USDC)" value={dailyLoss} set={setDailyLoss} step={50} />
            </div>
            <p className="text-[11px] text-dim">Enforced on-chain by the SettlementLedger on every fill.</p>
          </Card>

          <Card className="space-y-3 p-4">
            <SectionTitle>4 · Contribution policy</SectionTitle>
            <p className="text-[11px] text-dim">Nothing is contributed to The Grove until you approve it.</p>
            <div className="space-y-2">
              {contributionOptions.map((o) => (
                <label key={o} className="flex cursor-pointer items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={!!contrib[o]}
                    onChange={(e) => setContrib((s) => ({ ...s, [o]: e.target.checked }))}
                    className="accent-[#c6f24e]"
                  />
                  {o}
                </label>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <SectionTitle>Live backtest</SectionTitle>
            {bt.data && (
              <>
                <div className="mb-2 flex items-baseline justify-between">
                  <div className="text-2xl font-semibold text-accent">${bt.data.metrics.finalEquity.toFixed(2)}</div>
                  <div className={`text-xs ${bt.data.metrics.realizedReturnPct < 0 ? "text-loss" : "text-gain"}`}>
                    {bt.data.metrics.realizedReturnPct >= 0 ? "+" : ""}
                    {bt.data.metrics.realizedReturnPct.toFixed(2)}%
                  </div>
                </div>
                <LineChart
                  height={120}
                  series={[
                    { label: "Price", values: bt.data.curve.map((c) => c.price), color: "#3a3a41" },
                    { label: "Equity", values: bt.data.curve.map((c) => c.equity), color: "#c6f24e" },
                  ]}
                />
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-dim">
                  <div>Max DD: −{bt.data.metrics.maxDrawdownPct.toFixed(2)}%</div>
                  <div>Fills: {bt.data.metrics.fills}</div>
                </div>
              </>
            )}
          </Card>

          <Link
            to="/deploy"
            className="block rounded-xl bg-accent px-4 py-3 text-center text-sm font-semibold text-bg hover:bg-accent-bright"
          >
            Review & Deploy →
          </Link>
          <p className="text-center text-[11px] text-dim">Deploys to sandbox first. You approve every permission.</p>
        </div>
      </div>
    </div>
  );
}

function Num({ label, value, set, step }: { label: string; value: number; set: (v: number) => void; step: number }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-dim">{label}</div>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-fg outline-none focus:border-accent/50"
      />
    </label>
  );
}
