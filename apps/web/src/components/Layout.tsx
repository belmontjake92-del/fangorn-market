import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ConnectWallet } from "./ConnectWallet";
import { ChainMark } from "./ChainLogos";
import { NETWORKS, usePrefs, type Network } from "../lib/prefs";

const nav = [
  { to: "/", label: "Overview", end: true },
  { to: "/marketplace", label: "Marketplace" },
  { to: "/trade", label: "Trade" },
  { to: "/studio", label: "Agent Studio" },
  { to: "/lab", label: "Agent Lab" },
  { to: "/grove", label: "The Grove" },
  { to: "/leaderboards", label: "Leaderboards" },
  { to: "/earnings", label: "Earnings" },
  { to: "/activity", label: "Activity" },
  { to: "/trust", label: "Trust Center" },
  { to: "/settings", label: "Settings" },
];

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-white/5" title="Back to Overview">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 21V9M12 9l-4-4M12 9l4-4M12 14l-3.2-3M12 14l3.2-3" stroke="#c6f24e" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="12" cy="7.5" r="1.6" fill="#c6f24e" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight text-fg">
        Fangorn <span className="text-accent">Market</span>
      </span>
    </Link>
  );
}

/** Live network chooser: Robinhood (direct) or Arbitrum Sepolia (stealth). */
function NetworkSwitcher() {
  const { network, setNetwork } = usePrefs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const meta = NETWORKS[network];
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-fg hover:border-accent/40"
        title="Switch network"
      >
        <ChainMark network={network} size={16} className="shrink-0" />
        <span className="font-mono">{meta.short}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-elevated shadow-xl">
          {(Object.keys(NETWORKS) as Network[]).map((k) => {
            const n = NETWORKS[k];
            const active = k === network;
            return (
              <button
                key={k}
                onClick={() => {
                  setNetwork(k);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 ${active ? "bg-white/5" : ""}`}
              >
                <ChainMark network={k} size={26} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-fg">{n.label}</span>
                  <span className="block text-[11px] text-dim">
                    chain {n.chainId} · {n.mode.label} settlement
                  </span>
                </span>
                {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
              </button>
            );
          })}
          <div className="border-t border-border-soft px-3 py-2 text-[10px] leading-relaxed text-dim">
            Arbitrum is the privacy (stealth) network - buyers stay unlinkable. Robinhood settles directly.
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = usePrefs();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-fg hover:border-accent/40"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
    >
      {dark ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}

export function Layout() {
  const meta = NETWORKS[usePrefs().network];
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border-soft bg-surface p-3 md:flex">
        <Logo />
        <nav className="mt-6 flex flex-col gap-0.5">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive ? "bg-white/5 text-fg" : "text-muted hover:bg-white/5 hover:text-fg"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-3 py-2 text-[10px] leading-relaxed text-dim">
          Simulated data on {meta.label}. Independent app for Robinhood Chain.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border-soft bg-bg/80 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-2 text-xs text-muted">
            <ChainMark network={usePrefs().network} size={16} className="shrink-0" />
            <span className="font-mono">{meta.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <NetworkSwitcher />
            <ThemeToggle />
            <ConnectWallet />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
