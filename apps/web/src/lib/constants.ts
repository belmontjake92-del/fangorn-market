// The platform/seller wallet (Phase 1/2 publisher + resource owner). Used as the
// default Earnings owner when no wallet is connected.
export const PLATFORM_OWNER = "0xA6F07F90Fb1dEfe9a3847870e5860D6C9017Bb6d";

// The chain the backend is currently pointed at (set via VITE_NETWORK_LABEL).
export const NETWORK_LABEL = (import.meta.env.VITE_NETWORK_LABEL as string | undefined) ?? "Arbitrum Sepolia";

// Paid-data settlement mode differs by chain: Robinhood = direct (public buyer),
// Arbitrum Sepolia = stealth (x402f + Semaphore ZK, unlinkable buyer).
export const SETTLEMENT_MODE = NETWORK_LABEL.toLowerCase().includes("robinhood")
  ? { label: "Direct", detail: "Robinhood-native · public buyer address" }
  : { label: "Stealth", detail: "x402f + Semaphore ZK · unlinkable buyer" };

export const kindLabel: Record<string, string> = {
  observation: "Observation",
  fill: "Fill",
  "risk-rejected": "Risk gate",
  "deployment-opened": "Deployment",
  paused: "Paused",
  resumed: "Resumed",
  "commit-indexed": "Grove commit",
  "resource-published": "Published",
  "access-payment": "Access paid",
  alert: "Alert",
};

/** Agent kind → label + badge tone. */
export const agentKind: Record<string, { label: string; tone: string }> = {
  trade: { label: "Trading", tone: "public" },
  signal: { label: "Signal", tone: "monetized" },
  alert: { label: "Monitor", tone: "encrypted" },
};
