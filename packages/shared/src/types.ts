import type { Hex } from "viem";

/** On-chain risk caps (0 = unlimited), USDC-6. Mirrors the contract struct. */
export interface RiskLimits {
  maxPositionNotional: bigint;
  dailyLossLimit: bigint;
}

/** A tradable market in the marketplace/agent config. */
export interface MarketSpec {
  symbol: string; // "RH:ACME"
  marketId: Hex; // bytes32 keccak(symbol)
  label: string; // "Acme Corp"
  assetClass: "equity" | "etf" | "crypto" | "tokenized" | "other";
}

/** Deterministic (no-LLM) strategy configuration. Discriminated by `kind`. */
export type StrategyConfig = {
  kind: "threshold-momentum";
  /** Lookback window (observations) for the moving average. */
  lookback: number;
  /** Fractional band around the MA that triggers entry, e.g. 0.01 = 1%. */
  band: number;
  /** Position size (base units, human) taken on a signal. */
  clipSize: number;
};

/** Everything needed to open and run a deployment. */
export interface DeploymentConfig {
  id: Hex; // bytes32 deployment id
  key: string; // human key the id derives from
  agentName: string;
  owner: Hex;
  operator: Hex;
  openingCash: bigint; // USDC-6
  limits: RiskLimits;
  market: MarketSpec;
  strategy: StrategyConfig;
}

/** A position as read back from the SettlementLedger, marked to the oracle. */
export interface PositionSnapshot {
  deploymentId: Hex;
  marketId: Hex;
  symbol: string;
  size: bigint; // signed, 1e6
  entryPrice: bigint; // 1e6
  markPrice: bigint; // current oracle price, 1e6
  unrealizedPnl: bigint; // USDC-6
  notional: bigint; // USDC-6
}

/** Account-level snapshot from the ledger. */
export interface AccountSnapshot {
  deploymentId: Hex;
  cash: bigint; // USDC-6
  equity: bigint; // cash + unrealized, USDC-6
  dayRealizedPnl: bigint; // USDC-6
  paused: boolean;
}

/** A settled fill (decoded from a FillSettled event or an agent action). */
export interface FillRecord {
  deploymentId: Hex;
  marketId: Hex;
  symbol: string;
  sizeDelta: bigint;
  price: bigint;
  newSize: bigint;
  newEntryPrice: bigint;
  realizedPnl: bigint;
  cashAfter: bigint;
  txHash: Hex;
  ts: number;
}

/** A Data Asset as surfaced by the Grove indexer for the marketplace. */
export interface DataAsset {
  namespace: string;
  publisher: Hex;
  schemaId: string;
  symbol: string | null;
  recordCount: number;
  latestCommit: string; // commit CID
  latestSeq: number | null;
  lastUpdated: number; // unix seconds
}

/** An x402f paid/encrypted resource surfaced as a monetized Data Asset. */
export interface PremiumResource {
  resourceId: Hex;
  name: string;
  owner: Hex;
  price: bigint; // USDC base units (6dp)
  workerUrl: string;
  plaintextHash: Hex;
  symbol: string | null;
  accessMode: string;
  createTx: Hex | null;
  createdAt: number;
}

/** A recorded purchase of a premium resource (drives Earnings). */
export interface Purchase {
  resourceId: Hex;
  owner: Hex;
  buyerStealth: Hex | null;
  amount: bigint; // USDC base units
  nullifier: string | null;
  deploymentId: Hex | null;
  ts: number;
}

/** Activity-feed entry. */
export interface ActivityEvent {
  ts: number;
  kind:
    | "observation"
    | "fill"
    | "risk-rejected"
    | "deployment-opened"
    | "paused"
    | "resumed"
    | "commit-indexed"
    | "resource-published"
    | "access-payment"
    | "alert";
  deploymentId?: Hex;
  message: string;
}
