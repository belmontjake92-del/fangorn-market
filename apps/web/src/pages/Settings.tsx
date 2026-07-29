import { useState } from "react";
import { useAccount } from "wagmi";
import { Card, SectionTitle } from "../components/ui";
import { NETWORK_LABEL } from "../lib/constants";
import { shortAddr } from "../lib/format";

const policies = [
  { k: "observations", label: "Contribute raw market observations", on: false },
  { k: "signals", label: "Contribute derived signals", on: true },
  { k: "evaluations", label: "Contribute evaluation outcomes", on: true },
  { k: "delay", label: "Publish after a delay", on: false },
  { k: "training", label: "Permit training use", on: false },
];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-accent" : "bg-surface-2"}`}
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-bg transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

export default function Settings() {
  const { address } = useAccount();
  const [state, setState] = useState<Record<string, boolean>>(Object.fromEntries(policies.map((p) => [p.k, p.on])));
  const [stopped, setStopped] = useState(false);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl text-fg">Settings</h1>
      <p className="mt-1 text-sm text-muted">Your agent's intelligence is yours. You decide what compounds into the network.</p>

      <div className="mt-8">
        <SectionTitle>Contribution Policy</SectionTitle>
        <Card className="divide-y divide-border-soft">
          {policies.map((p) => (
            <div key={p.k} className="flex items-center justify-between p-3">
              <span className="text-sm text-muted">{p.label}</span>
              <Toggle on={!!state[p.k]} onClick={() => setState((s) => ({ ...s, [p.k]: !s[p.k] }))} />
            </div>
          ))}
        </Card>
        <p className="mt-2 text-[11px] text-dim">Nothing is contributed to The Grove until explicitly enabled.</p>
      </div>

      <div className="mt-8">
        <SectionTitle>Account</SectionTitle>
        <Card className="space-y-2 p-4 text-sm">
          <Row k="Connected wallet" v={address ? shortAddr(address) : "Not connected"} />
          <Row k="Network" v={NETWORK_LABEL} />
          <Row k="Settlement asset" v="USDC" />
        </Card>
      </div>

      <div className="mt-8">
        <SectionTitle>Emergency</SectionTitle>
        <Card className="flex items-center justify-between p-4">
          <div>
            <div className="text-sm font-medium text-fg">Pause All Agents</div>
            <div className="text-[11px] text-dim">Global stop — no agent can submit new actions.</div>
          </div>
          <button
            onClick={() => setStopped((s) => !s)}
            className={`rounded-lg px-4 py-2 text-xs font-semibold ${stopped ? "bg-loss/20 text-loss" : "border border-loss/50 text-loss hover:bg-loss/10"}`}
          >
            {stopped ? "Paused — Resume" : "Pause All"}
          </button>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-dim">{k}</span>
      <span className="text-muted">{v}</span>
    </div>
  );
}
