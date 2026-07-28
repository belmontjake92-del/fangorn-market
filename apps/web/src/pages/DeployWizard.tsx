import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card } from "../components/ui";

const steps = ["Environment", "Limits", "Review", "Confirm"];

export default function DeployWizard() {
  const [step, setStep] = useState(0);
  const [env, setEnv] = useState("sandbox");
  const [maxCapital, setMaxCapital] = useState(1000);
  const [dailyLoss, setDailyLoss] = useState(200);
  const [approved, setApproved] = useState(false);

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/studio" className="text-xs text-dim hover:text-muted">← Studio</Link>
      <h1 className="mt-2 font-display text-3xl text-fg">Deploy Agent</h1>
      <p className="mt-1 text-sm text-muted">A safe, explicit deployment. Sandbox by default; you approve every permission.</p>

      <div className="mt-6 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${i <= step ? "bg-accent text-bg" : "bg-surface-2 text-dim"}`}>{i + 1}</div>
            <span className={`text-xs ${i === step ? "text-fg" : "text-dim"}`}>{s}</span>
            {i < steps.length - 1 && <div className="h-px flex-1 bg-border" />}
          </div>
        ))}
      </div>

      <Card className="mt-5 p-5">
        {step === 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">Choose environment</h3>
            {[
              { id: "sandbox", label: "Sandbox", desc: "No capital. Safe to explore." },
              { id: "paper", label: "Paper trading", desc: "Live prices, simulated fills settled on-chain." },
              { id: "live", label: "Live deployment", desc: "Real execution within your limits.", disabled: true },
            ].map((o) => (
              <button
                key={o.id}
                disabled={o.disabled}
                onClick={() => setEnv(o.id)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left ${
                  env === o.id ? "border-accent/50 bg-accent/10" : "border-border hover:border-border"
                } ${o.disabled ? "opacity-40" : ""}`}
              >
                <div>
                  <div className="text-sm text-fg">{o.label}</div>
                  <div className="text-[11px] text-dim">{o.desc}</div>
                </div>
                {o.disabled && <Badge tone="neutral">soon</Badge>}
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-fg">Configure limits</h3>
            <Range label="Max capital (USDC)" value={maxCapital} set={setMaxCapital} min={100} max={10000} step={100} />
            <Range label="Daily loss cap (USDC)" value={dailyLoss} set={setDailyLoss} min={20} max={2000} step={20} />
            <p className="text-[11px] text-dim">These become on-chain risk gates enforced on every fill.</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2 text-sm">
            <h3 className="mb-2 text-sm font-semibold text-fg">Review permissions</h3>
            <Perm can>This agent can read Grove price observations</Perm>
            <Perm can>This agent can submit simulated fills within limits</Perm>
            <Perm can={false}>This agent cannot exceed {maxCapital} USDC exposure</Perm>
            <Perm can={false}>This agent cannot trade after −{dailyLoss} USDC in a day</Perm>
            <Perm can={false}>This agent cannot touch assets outside its allowlist</Perm>
            <div className="mt-3 rounded-lg border border-cyan/25 bg-cyan/5 px-3 py-2 text-xs text-cyan">
              Environment: {env}. Deployment stops when a limit trips or you pause it.
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-fg">Confirm deployment</h3>
            <label className="flex items-start gap-2 text-sm text-muted">
              <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} className="mt-0.5 accent-[#c6f24e]" />
              I understand this is {env}, and approve the permissions and on-chain risk limits above.
            </label>
            <button
              disabled={!approved}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg hover:bg-accent-bright disabled:opacity-40"
            >
              Deploy to {env}
            </button>
            <p className="text-center text-[11px] text-dim">
              In this prototype, deployments are opened by the platform operator via the SettlementLedger.
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="rounded-lg border border-border px-4 py-1.5 text-xs text-muted disabled:opacity-30">
            Back
          </button>
          {step < steps.length - 1 && (
            <button onClick={() => setStep((s) => s + 1)} className="rounded-lg bg-white/10 px-4 py-1.5 text-xs text-fg hover:bg-white/15">
              Next →
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

function Range({ label, value, set, min, max, step }: { label: string; value: number; set: (v: number) => void; min: number; max: number; step: number }) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-[11px] text-dim"><span>{label}</span><span className="font-mono text-muted">{value}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="w-full accent-[#c6f24e]" />
    </label>
  );
}

function Perm({ can, children }: { can: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className={can ? "text-accent" : "text-loss"}>{can ? "✓" : "✕"}</span>
      <span className="text-muted">{children}</span>
    </div>
  );
}
