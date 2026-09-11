import type { Hex } from "viem";
import type { Repo } from "@fangorn-market/db";
import { PRICE_OBSERVATION_SCHEMA, formatUsd } from "@fangorn-market/shared";
import type { ChainContext } from "./chain.js";

export interface PricePush {
  symbol: string;
  marketId: Hex;
  priceScaled: bigint;
  ts: number;
  seq: number;
  source: string;
}

/**
 * Local price service for the no-secrets dry run: push the price to the on-chain
 * oracle (settlement source of truth) and record it in the DB mirror directly -
 * standing in for the Grove publish → indexer path that runs live in Phase 1.
 */
export class LocalPriceService {
  constructor(
    private readonly deps: { chain: ChainContext; repo: Repo; publisher: Hex; namespace: string },
  ) {}

  async push(o: PricePush): Promise<void> {
    await this.deps.chain.setPrice(o.marketId, o.priceScaled);
    this.deps.repo.recordObservation({
      publisher: this.deps.publisher,
      namespace: this.deps.namespace,
      schemaId: PRICE_OBSERVATION_SCHEMA,
      symbol: o.symbol,
      marketId: o.marketId,
      priceScaled: o.priceScaled,
      ts: o.ts,
      seq: o.seq,
      source: o.source,
      commitCid: "local",
    });
    this.deps.repo.addActivity({
      ts: o.ts,
      kind: "observation",
      message: `Observed ${o.symbol} @ ${formatUsd(o.priceScaled)}`,
    });
  }
}
