import { NavLink, Outlet } from "react-router-dom";
import { ConnectWallet } from "./ConnectWallet";

const nav = [
  { to: "/", label: "Overview", end: true },
  { to: "/marketplace", label: "Marketplace" },
  { to: "/grove", label: "The Grove" },
  { to: "/earnings", label: "Earnings" },
  { to: "/activity", label: "Activity" },
];

function Logo() {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 21V9M12 9l-4-4M12 9l4-4M12 14l-3.2-3M12 14l3.2-3" stroke="#c6f24e" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="12" cy="7.5" r="1.6" fill="#c6f24e" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">
        Fangorn <span className="text-accent">Market</span>
      </span>
    </div>
  );
}

export function Layout() {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border-soft bg-[#0a0a0b] p-3 md:flex">
        <Logo />
        <nav className="mt-6 flex flex-col gap-0.5">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive ? "bg-white/5 text-fg" : "text-dim hover:bg-white/5 hover:text-muted"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-3 py-2 text-[10px] leading-relaxed text-faint">
          Simulated data on Arbitrum Sepolia. Independent app for Robinhood Chain.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border-soft bg-bg/80 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-2 text-xs text-dim">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            <span className="font-mono">Arbitrum Sepolia</span>
          </div>
          <ConnectWallet />
        </header>
        <main className="min-w-0 flex-1 px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
