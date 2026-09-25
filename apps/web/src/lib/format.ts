const SCALE = 1_000_000;

/** 1e6 fixed-point string → number. */
export const toNum = (v: string | number): number => Number(v) / SCALE;

/** USDC-6 fixed-point → "$1,234.56". */
export function usd(v: string | number, digits = 2): string {
  const n = toNum(v);
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Micro-USDC (x402 base units) → "0.001 USDC". */
export function usdcMicro(v: string | number, digits = 3): string {
  return `${toNum(v).toFixed(digits)} USDC`;
}

/** Signed size like "+1.5" / "-2". */
export function size(v: string | number): string {
  const n = toNum(v);
  return `${n > 0 ? "+" : ""}${n}`;
}

export const price = (v: string | number): string => usd(v);

export function pnlClass(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (n > 0) return "text-gain";
  if (n < 0) return "text-loss";
  return "text-muted";
}

export const shortHash = (h: string, n = 6): string =>
  h.length > 2 * n + 2 ? `${h.slice(0, n + 2)}…${h.slice(-n)}` : h;

export const shortAddr = (a: string): string => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function timeAgo(unixSeconds: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
