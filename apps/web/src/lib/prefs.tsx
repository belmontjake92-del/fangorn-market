import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Network = "arbitrum" | "robinhood";
export type Theme = "dark" | "light";

export interface NetworkMeta {
  key: Network;
  label: string; // full label, e.g. used in disclaimers
  short: string; // compact label for the switcher chip
  chainId: number;
  mode: { label: string; detail: string }; // paid-data settlement mode
}

/** The two networks the app can operate on, chosen live in the header. */
export const NETWORKS: Record<Network, NetworkMeta> = {
  robinhood: {
    key: "robinhood",
    label: "Robinhood Chain",
    short: "Robinhood",
    chainId: 46630,
    mode: { label: "Direct + Stealth", detail: "Robinhood-native · public pay, or Semaphore ZK stealth access" },
  },
  arbitrum: {
    key: "arbitrum",
    label: "Arbitrum Sepolia (Stealth)",
    short: "Arbitrum · Stealth",
    chainId: 421614,
    mode: { label: "Stealth", detail: "x402f + Semaphore ZK · unlinkable buyer" },
  },
};

const envDefault: Network = ((import.meta.env.VITE_NETWORK_LABEL as string | undefined) ?? "")
  .toLowerCase()
  .includes("robinhood")
  ? "robinhood"
  : "arbitrum";

interface Prefs {
  network: Network;
  meta: NetworkMeta;
  setNetwork: (n: Network) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const Ctx = createContext<Prefs | null>(null);

function read<T extends string>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  return (localStorage.getItem(key) as T) ?? fallback;
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<Network>(() => read<Network>("fm.network", envDefault));
  const [theme, setTheme] = useState<Theme>(() => read<Theme>("fm.theme", "dark"));

  useEffect(() => {
    localStorage.setItem("fm.network", network);
  }, [network]);

  useEffect(() => {
    localStorage.setItem("fm.theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const value: Prefs = {
    network,
    meta: NETWORKS[network],
    setNetwork,
    theme,
    setTheme,
    toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): Prefs {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePrefs must be used within PrefsProvider");
  return c;
}

/** The active network key - used by data hooks to select the backend DB. */
export const useNetwork = (): Network => usePrefs().network;
/** The active network's display metadata. */
export const useNetworkMeta = (): NetworkMeta => usePrefs().meta;

/** Append `network=<key>` to an API path, preserving existing query params. */
export const withNet = (path: string, network: string): string =>
  `${path}${path.includes("?") ? "&" : "?"}network=${network}`;
