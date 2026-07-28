import type { Fangorn, NamespaceChange } from "@fangorn-network/sdk";
import type { Hex } from "viem";
import type { Repo } from "@fangorn-market/db";
import { PRICE_OBSERVATION_SCHEMA, parsePriceObservation } from "@fangorn-market/shared";

/** Record the price observations in one namespace change into the DB mirror. */
export function recordChange(repo: Repo, change: NamespaceChange): number {
  let inserted = 0;
  for (const v of change.addedVertices) {
    if (v.schemaId !== PRICE_OBSERVATION_SCHEMA) continue;
    const o = parsePriceObservation(v.payload);
    if (!o) continue;
    const isNew = repo.recordObservation({
      publisher: change.owner,
      namespace: change.namespace,
      schemaId: v.schemaId,
      symbol: o.symbol,
      marketId: o.marketId,
      priceScaled: BigInt(o.price),
      ts: o.ts,
      seq: o.seq,
      source: o.source,
      commitCid: change.commitCid,
    });
    if (isNew) inserted++;
  }
  return inserted;
}

/** Seed the DB from the current full contents of a namespace (before going live). */
export async function backfill(
  repo: Repo,
  fangorn: Fangorn,
  namespace: string,
  owner: Hex,
): Promise<number> {
  const contents = await fangorn.inspectNamespace(namespace);
  let inserted = 0;
  for (const v of contents.vertices) {
    if (v.schemaId !== PRICE_OBSERVATION_SCHEMA) continue;
    const o = parsePriceObservation(v.payload);
    if (!o) continue;
    const isNew = repo.recordObservation({
      publisher: owner,
      namespace,
      schemaId: v.schemaId,
      symbol: o.symbol,
      marketId: o.marketId,
      priceScaled: BigInt(o.price),
      ts: o.ts,
      seq: o.seq,
      source: o.source,
      commitCid: v.cid,
    });
    if (isNew) inserted++;
  }
  return inserted;
}

export interface IndexerOptions {
  namespace: string;
  owner: Hex;
  signal?: AbortSignal;
  pollingInterval?: number;
}

/**
 * Backfill, then follow a namespace live: every settled commit's new price
 * observations are mirrored to the DB and the resume cursor (block number) is
 * persisted so a restart continues where it left off.
 */
export async function runIndexer(repo: Repo, fangorn: Fangorn, opts: IndexerOptions): Promise<void> {
  await backfill(repo, fangorn, opts.namespace, opts.owner);

  const cursorKey = `cursor:${opts.owner}:${opts.namespace}`;
  const saved = repo.getState(cursorKey);
  const fromBlock = saved ? BigInt(saved) : undefined;

  for await (const change of fangorn.subscribe({
    namespace: opts.namespace,
    owner: opts.owner,
    fromBlock,
    pollingInterval: opts.pollingInterval,
    signal: opts.signal,
  })) {
    const n = recordChange(repo, change);
    repo.setState(cursorKey, change.blockNumber.toString());
    repo.addActivity({
      ts: Math.floor(Date.now() / 1000),
      kind: "commit-indexed",
      message: `Indexed commit ${change.commitCid.slice(0, 12)}… (+${n} observations)`,
    });
  }
}
