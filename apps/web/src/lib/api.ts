import { useQuery } from "@tanstack/react-query";
import { useNetwork, withNet } from "./prefs";

// All monetary/price/size fields arrive as decimal strings of 1e6 fixed-point
// integers (the backend serializes bigint as string).

export interface DataAsset {
  publisher: string;
  namespace: string;
  schemaId: string;
  symbol: string | null;
  recordCount: number;
  latestCommit: string;
  latestSeq: number | null;
  lastUpdated: number;
}

export interface Observation {
  publisher: string;
  namespace: string;
  symbol: string;
  marketId: string;
  price: string;
  ts: number;
  seq: number;
  source: string;
  commitCid: string | null;
}

export interface DeploymentRow {
  id: string;
  key: string;
  agent_name: string | null;
  owner: string;
  operator: string;
  opening_cash: string;
  max_position_notional: string;
  daily_loss_limit: string;
  market_symbol: string;
  market_id: string;
  strategy_json: string;
  status: string;
  kind: string;
  created_at: number;
}

export interface Position {
  deploymentId: string;
  marketId: string;
  symbol: string;
  size: string;
  entryPrice: string;
  markPrice: string;
  unrealizedPnl: string;
  notional: string;
}

export interface Fill {
  deploymentId: string;
  marketId: string;
  symbol: string;
  sizeDelta: string;
  price: string;
  newSize: string;
  newEntryPrice: string;
  realizedPnl: string;
  cashAfter: string;
  txHash: string;
  ts: number;
}

export interface ActivityEvent {
  ts: number;
  kind: string;
  deploymentId?: string;
  message: string;
}

export interface Resource {
  resourceId: string;
  name: string;
  owner: string;
  price: string;
  workerUrl: string;
  plaintextHash: string;
  symbol: string | null;
  accessMode: string;
  createTx: string | null;
  createdAt: number;
}

export interface Purchase {
  resourceId: string;
  owner: string;
  buyerStealth: string | null;
  amount: string;
  nullifier: string | null;
  deploymentId: string | null;
  ts: number;
}

export interface Earnings {
  owner: string;
  grossUsdcBaseUnits: string;
  purchases: number;
  recent: Purchase[];
}

export async function api<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export type DeploymentDetail = { deployment: DeploymentRow; positions: Position[]; fills: Fill[] };

const opts = { staleTime: 5_000, refetchInterval: 15_000 } as const;

export const useDataAssets = () => {
  const net = useNetwork();
  return useQuery({ queryKey: ["data-assets", net], queryFn: () => api<DataAsset[]>(withNet("/api/data-assets", net)), ...opts });
};

export const useObservations = (symbol: string | undefined) => {
  const net = useNetwork();
  return useQuery({
    queryKey: ["observations", net, symbol],
    queryFn: () => api<Observation[]>(withNet(`/api/observations/${encodeURIComponent(symbol!)}?limit=200`, net)),
    enabled: !!symbol,
    ...opts,
  });
};

export const useDeployments = () => {
  const net = useNetwork();
  return useQuery({ queryKey: ["deployments", net], queryFn: () => api<DeploymentRow[]>(withNet("/api/deployments", net)), ...opts });
};

export const useDeployment = (id: string | undefined) => {
  const net = useNetwork();
  return useQuery({
    queryKey: ["deployment", net, id],
    queryFn: () => api<DeploymentDetail>(withNet(`/api/deployments/${id}`, net)),
    enabled: !!id,
    ...opts,
  });
};

export const useActivity = () => {
  const net = useNetwork();
  return useQuery({ queryKey: ["activity", net], queryFn: () => api<ActivityEvent[]>(withNet("/api/activity?limit=100", net)), ...opts });
};

export const useResources = () => {
  const net = useNetwork();
  return useQuery({ queryKey: ["resources", net], queryFn: () => api<Resource[]>(withNet("/api/resources", net)), ...opts });
};

export interface BacktestResult {
  params: Record<string, number>;
  curve: { seq: number; price: number; equity: number; size: number }[];
  metrics: {
    finalEquity: number;
    realizedReturnPct: number;
    maxDrawdownPct: number;
    fills: number;
    endPosition: number;
  };
}

export const useBacktest = (params: Record<string, number>) =>
  useQuery({
    queryKey: ["backtest", params],
    queryFn: () => api<BacktestResult>(`/api/backtest?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`),
    staleTime: 60_000,
  });

// Catalog deploy tally - global (not network-scoped). Seeded low in the UI; this
// endpoint returns the real user-deploy count added on top, per agent id.
export const useCatalogDeploys = () =>
  useQuery({
    queryKey: ["catalog-deploys"],
    queryFn: () => api<Record<string, number>>("/api/catalog-deploys"),
    staleTime: 5_000,
    refetchInterval: 20_000,
  });

export async function incrementCatalogDeploy(id: string): Promise<{ id: string; count: number }> {
  const res = await fetch(`/api/catalog-deploys/${encodeURIComponent(id)}`, { method: "POST" });
  if (!res.ok) throw new Error(`increment ${id} → ${res.status}`);
  return res.json() as Promise<{ id: string; count: number }>;
}

export const useEarnings = (owner: string | undefined) => {
  const net = useNetwork();
  return useQuery({
    queryKey: ["earnings", net, owner],
    queryFn: () => api<Earnings>(withNet(`/api/earnings/${owner}`, net)),
    enabled: !!owner,
    ...opts,
  });
};
