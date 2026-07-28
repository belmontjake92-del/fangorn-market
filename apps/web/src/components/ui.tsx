import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border-soft bg-surface ${className}`}>{children}</div>
  );
}

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wider text-dim">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ? "text-accent" : "text-fg"}`}>{value}</div>
      {sub != null && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

const badgeTones: Record<string, string> = {
  live: "border-accent/40 text-accent bg-accent/10",
  paper: "border-cyan/40 text-cyan bg-cyan/10",
  sandbox: "border-dim/40 text-muted bg-white/5",
  backtest: "border-violet/40 text-violet bg-violet/10",
  monetized: "border-amber/40 text-amber bg-amber/10",
  encrypted: "border-violet/40 text-violet bg-violet/10",
  public: "border-accent/40 text-accent bg-accent/10",
  neutral: "border-border text-muted bg-white/5",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${badgeTones[tone] ?? badgeTones.neutral}`}>
      {children}
    </span>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{children}</h2>
      {right}
    </div>
  );
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-xs ${className}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-dim">{children}</div>;
}

export function Loading() {
  return <div className="p-8 text-center text-sm text-dim">Loading…</div>;
}
