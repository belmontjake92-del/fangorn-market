import type { Fangorn } from "@fangorn-network/sdk";
import { buildPriceObservation } from "@fangorn-market/shared";

export interface ObservationInput {
  symbol: string;
  priceScaled: bigint;
  ts: number;
  seq: number;
  source: string;
}

/**
 * Register this wallet as a Grove publisher on the DataRegistry if it isn't
 * already. Required once per publisher before any commit can settle on-chain
 * (the SDK's commit/push path does not auto-register). Returns the tx hash if a
 * registration was sent, or null if already registered.
 */
export async function ensureRegistered(fangorn: Fangorn): Promise<string | null> {
  const registry = fangorn.getDataRegistry();
  const address = fangorn.getAddress();
  if (await registry.isRegistered(address)) return null;
  const txHash = await registry.register();
  return String(txHash);
}

/**
 * Ensure a namespace exists for this publisher. `initRepo` throws if it already
 * exists, which we treat as success (idempotent setup).
 */
export async function ensureRepo(fangorn: Fangorn, namespace: string): Promise<void> {
  try {
    await fangorn.initRepo(namespace);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/exist/i.test(msg)) throw err;
  }
}

/**
 * Publish a batch of price observations to a Grove namespace as vertices tagged
 * with the price-observation schema - one CAR upload + one commit + one push.
 * Returns the settled commit CID.
 */
export async function publishObservations(
  fangorn: Fangorn,
  namespace: string,
  observations: ObservationInput[],
): Promise<{ commitCid: string; txHash: string; count: number }> {
  const vertices = observations.map((o) => {
    const { schemaId, payload } = buildPriceObservation(o);
    return { id: `${o.symbol}-${o.seq}`, tag: schemaId, payload };
  });

  const result = await fangorn.uploadBatch(namespace, vertices, []);
  return {
    commitCid: String(result.commitCid),
    txHash: String(result.txHash),
    count: vertices.length,
  };
}
