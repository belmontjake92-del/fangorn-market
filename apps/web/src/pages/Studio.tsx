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

interface Preset {
  id: string;
  label: string;
  kind: string;
  blurb: string;
  name: string;
  market: string;
  strategy: string;
  lookback: number;
  band: number;
  clip: number;
  maxPos: number;
  dailyLoss: number;
}

/** Starter strategies - pick one to prefill the whole studio, then tweak. */
const PRESETS: Preset[] = [
  {
    id: "momentum",
    label: "Momentum",
    kind: "threshold-momentum",
    blurb: "Ride trends: long above a band around the moving average, short below, flat inside.",
    name: "Atlas Momentum",
    market: "ETH/USDC",
    strategy: "Momentum: go long when price breaks above a band around the moving average, short below, flat inside the band.",
    lookback: 5,
    band: 0.005,
    clip: 1,
    maxPos: 5000,
    dailyLoss: 200,
  },
  {
    id: "mean-reversion",
    label: "Mean Reversion",
    kind: "mean-reversion",
    blurb: "Fade extremes: buy dips below the band, sell rips above, expecting a return to the mean.",
    name: "Reverting Fox",
    market: "ARB/USDC",
    strategy: "Mean reversion: buy when price stretches below the lower band, sell above the upper band; target the moving average.",
    lookback: 20,
    band: 0.012,
    clip: 1,
    maxPos: 4000,
    dailyLoss: 150,
  },
  {
    id: "breakout",
    label: "Breakout",
    kind: "breakout",
    blurb: "Trade confirmed breakouts of a wider range; skip the chop in between.",
    name: "Range Breaker",
    market: "ETH/USDC",
    strategy: "Breakout: enter on a decisive break of the N-bar high/low with a wider band to filter noise; exit on reversal.",
    lookback: 30,
    band: 0.02,
    clip: 1.5,
    maxPos: 6000,
    dailyLoss: 250,
  },
  {
    id: "trend-follow",
    label: "Trend Follow",
    kind: "trend-follow",
    blurb: "Slow, patient trend riding with a long lookback and small clips.",
    name: "Steady Ent",
    market: "BTC/USDC",
    strategy: "Trend following: use a long lookback to stay with the dominant trend; add slowly, cut quickly on reversal.",
    lookback: 50,
    band: 0.008,
    clip: 0.5,
    maxPos: 8000,
    dailyLoss: 300,
  },
  {
    id: "scalper",
    label: "Fast Scalper",
    kind: "scalp-momentum",
    blurb: "Short lookback, tiny clips, tight loss cap - many small, quick decisions.",
    name: "Quick Beam",
    market: "ARB/USDC",
    strategy: "Scalping: very short lookback with small clip sizes; take frequent small edges and cap daily loss tightly.",
    lookback: 3,
    band: 0.003,
    clip: 0.5,
    maxPos: 2000,
    dailyLoss: 80,
  },
  {
    id: "risk-off",
    label: "Risk-Off Hedge",
    kind: "defensive",
    blurb: "Conservative sizing, wide band, quick to flatten - capital preservation first.",
    name: "Warden",
    market: "ETH/USDC",
    strategy: "Defensive: only take high-conviction moves outside a wide band; small size, flatten fast when volatility spikes.",
    lookback: 40,
    band: 0.025,
    clip: 0.5,
    maxPos: 1500,
    dailyLoss: 60,
  },
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
  const [presetId, setPresetId] = useState("momentum");
  const [name, setName] = useState(PRESETS[0]!.name);
  const [market, setMarket] = useState(PRESETS[0]!.market);
  const [kind, setKind] = useState(PRESETS[0]!.kind);
  const [strategy, setStrategy] = useState(PRESETS[0]!.strategy);
  const [lookback, setLookback] = useState(5);
  const [band, setBand] = useState(0.005);
  const [clip, setClip] = useState(1);
  const [maxPos, setMaxPos] = useState(5000);
  const [dailyLoss, setDailyLoss] = useState(200);
  const [contrib, setContrib] = useState<Record<string, boolean>>({ "Share derived signals only": true });

  function applyPreset(p: Preset) {
    setPresetId(p.id);
    setName(p.name);
    setMarket(p.market);
    setKind(p.kind);
    setStrategy(p.strategy);
    setLookback(p.lookback);
    setBand(p.band);
    setClip(p.clip);
    setMaxPos(p.maxPos);
    setDailyLoss(p.dailyLoss);
  }

  const bt = useBacktest({ seed: 7, ticks: 160, lookback, band, clip, vol: 0.02, openingCash: 1000 });

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-3xl text-fg">Agent Studio</h1>
      <p className="mt-1 text-sm text-muted">
        Your first agent should not start from zero. Describe a strategy, connect intelligence, set risk, and preview a
        backtest - before you deploy.
      </p>

      <div className="mt-6">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-dim">Start from a preset</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PRESETS.map((p) => {
            const active = p.id === presetId;
            return (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  active ? "border-accent/60 bg-accent/5" : "border-border bg-surface hover:border-accent/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-fg">{p.label}</div>
                  <Badge tone="neutral">{p.kind}</Badge>
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-dim">{p.blurb}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="space-y-4 p-4">
            <SectionTitle>1 · Define</SectionTitle>
            <TextRow label="Agent name"><input className={input} value={name} onChange={(e) => setName(e.target.value)} /></TextRow>
            <TextRow label="Market"><input className={input} value={market} onChange={(e) => setMarket(e.target.value)} /></TextRow>
            <TextRow label="Strategy">
              <textarea
                className={`${input} h-20 resize-none`}
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
              />
            </TextRow>
          </Card>

          <Card className="space-y-4 p-4">
            <SectionTitle right={<Badge tone="neutral">{kind}</Badge>}>2 · Strategy</SectionTitle>
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
