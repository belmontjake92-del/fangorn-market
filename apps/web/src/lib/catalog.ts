export type AgentState = "live" | "paper" | "backtest";

export interface CatalogAgent {
  id: string;
  name: string;
  builder: string;
  version: string;
  category: string;
  risk: string;
  drawdown: string;
  state: AgentState;
  verified: boolean;
  perf: string;
  period: string;
  price: string;
  deploys: number;
  rating: number;
  summary: string;
  accent: string; // icon/spark color
  spark: number[];
  onchain?: boolean;
}

// Deterministic sparkline series from a seed - a seeded random walk with drift.
function spark(seed: number, drift = 0, n = 28): number[] {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let v = 100;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    v = v * (1 + drift + (rand() - 0.5) * 0.05);
    out.push(v);
  }
  return out;
}

export const CATEGORIES = [
  "Portfolio Management",
  "Market Research",
  "Risk Monitoring",
  "Yield & Treasury",
  "Crypto",
  "Data Collection",
  "Execution",
  "Alerts",
] as const;

export const RISK_LEVELS = ["Read-only", "Conservative", "Low", "Low-Medium", "Medium", "Medium-High"] as const;

/** The showcase catalog - mirrors the prototype's agents (simulated). */
export const CATALOG: CatalogAgent[] = [
  {
    id: "cat-atlas",
    name: "Atlas Momentum",
    builder: "Meridian Labs",
    version: "v2.4",
    category: "Portfolio Management",
    risk: "Medium",
    drawdown: "-9.2%",
    state: "paper",
    verified: true,
    perf: "+8.4% sim",
    period: "214-day paper record",
    price: "$49 / mo",
    deploys: 34,
    rating: 4.6,
    summary: "Cross-asset trend agent scoring momentum across equities, ETFs and tokenized assets.",
    accent: "#6fa8c9",
    spark: spark(11, 0.004),
  },
  {
    id: "cat-cedar",
    name: "Cedar Yield",
    builder: "Rootstock",
    version: "v3.1",
    category: "Yield & Treasury",
    risk: "Conservative",
    drawdown: "-2.1%",
    state: "live",
    verified: true,
    perf: "+4.1% live",
    period: "11-mo verified live",
    price: "$29 / mo",
    deploys: 41,
    rating: 4.8,
    summary: "Treasury and RWA allocation agent tuned for low turnover and capital preservation.",
    accent: "#c6f24e",
    spark: spark(22, 0.003),
  },
  {
    id: "cat-nightwatch",
    name: "Nightwatch Volatility",
    builder: "Umbra Systems",
    version: "v1.2",
    category: "Risk Monitoring",
    risk: "Medium-High",
    drawdown: "-18.4%",
    state: "backtest",
    verified: false,
    perf: "+22.7% bt",
    period: "Backtest 2021-2026",
    price: "Pay per run",
    deploys: 12,
    rating: 4.2,
    summary: "Volatility monitoring and downside-protection agent; high complexity, disclosed assumptions.",
    accent: "#9a8fd4",
    spark: spark(33, 0.006),
  },
  {
    id: "cat-eventide",
    name: "Eventide Earnings",
    builder: "Halcyon Research",
    version: "v1.7",
    category: "Market Research",
    risk: "Low",
    drawdown: "-",
    state: "paper",
    verified: true,
    perf: "Alert prec 0.71",
    period: "92-day paper record",
    price: "$19 / mo",
    deploys: 23,
    rating: 4.5,
    summary: "Earnings-event research agent. Produces ranked alerts. No autonomous execution by default.",
    accent: "#6fa8c9",
    spark: spark(44, 0.002),
  },
  {
    id: "cat-rootline",
    name: "Rootline Rebalance",
    builder: "Meridian Labs",
    version: "v2.0",
    category: "Portfolio Management",
    risk: "Low-Medium",
    drawdown: "-5.6%",
    state: "live",
    verified: true,
    perf: "+3.8% live",
    period: "7-mo verified live",
    price: "$39 / mo",
    deploys: 29,
    rating: 4.7,
    summary: "Rules-based portfolio rebalancing with disclosed drift bands and tax-aware ordering.",
    accent: "#c6f24e",
    spark: spark(55, 0.0035),
  },
  {
    id: "cat-canopy",
    name: "Canopy Sentinel",
    builder: "Umbra Systems",
    version: "v1.4",
    category: "Risk Monitoring",
    risk: "Read-only",
    drawdown: "-",
    state: "paper",
    verified: false,
    perf: "Anomaly recall 0.88",
    period: "148-day paper record",
    price: "Free",
    deploys: 18,
    rating: 4.4,
    summary: "Portfolio risk and anomaly detection. Read-only permissions - monitors, never trades.",
    accent: "#d6a84a",
    spark: spark(66, 0.0015),
  },
];
