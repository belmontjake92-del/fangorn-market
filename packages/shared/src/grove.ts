import type { Hex } from "viem";
import { marketId as toMarketId } from "./units.js";

/**
 * Grove conventions shared by the seed publisher, the indexer, and agents.
 *
 * A price dataset is one Fangorn namespace whose vertices are price
 * observations tagged with {@link PRICE_OBSERVATION_SCHEMA}. Each observation's
 * `price` is the 1e6-scaled integer serialized as a decimal string - dag-cbor
 * round-trips strings exactly, sidestepping float precision and bigint codec
 * limits.
 */
export const PRICE_OBSERVATION_SCHEMA = "fangorn-market.price-observation/v1";

/** Default namespace for the seed price dataset (publisher-controlled; override via env). */
export const DEFAULT_PRICE_NAMESPACE = "market-prices";

export function groveNamespace(env: NodeJS.ProcessEnv = process.env): string {
  return env.GROVE_PRICE_NAMESPACE ?? DEFAULT_PRICE_NAMESPACE;
}

export interface PriceObservationPayload {
  /** bytes32 market id (keccak of the symbol) - the key the contracts use. */
  marketId: Hex;
  /** Human ticker, e.g. "RH:ACME". */
  symbol: string;
  /** 1e6-scaled price as a decimal string. */
  price: string;
  /** Unix seconds when observed. */
  ts: number;
  /** Monotonic sequence per market. */
  seq: number;
  /** Provenance of the datapoint, e.g. "synthetic" or a feed name. */
  source: string;
}

/** Build the `{ schemaId, payload }` for one price observation vertex. */
export function buildPriceObservation(input: {
  symbol: string;
  priceScaled: bigint;
  ts: number;
  seq: number;
  source: string;
}): { schemaId: string; payload: PriceObservationPayload } {
  return {
    schemaId: PRICE_OBSERVATION_SCHEMA,
    payload: {
      marketId: toMarketId(input.symbol),
      symbol: input.symbol,
      price: input.priceScaled.toString(),
      ts: input.ts,
      seq: input.seq,
      source: input.source,
    },
  };
}

/** Narrow an unknown vertex payload to a {@link PriceObservationPayload}. */
export function parsePriceObservation(payload: unknown): PriceObservationPayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (
    typeof p.symbol !== "string" ||
    typeof p.price !== "string" ||
    typeof p.ts !== "number" ||
    typeof p.seq !== "number"
  ) {
    return null;
  }
  return {
    marketId: (p.marketId as Hex) ?? toMarketId(p.symbol),
    symbol: p.symbol,
    price: p.price,
    ts: p.ts,
    seq: p.seq,
    source: typeof p.source === "string" ? p.source : "unknown",
  };
}

/** The 1e6-scaled price of an observation as a bigint. */
export function observationPriceScaled(o: PriceObservationPayload): bigint {
  return BigInt(o.price);
}
