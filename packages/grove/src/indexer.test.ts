import { test } from "node:test";
import assert from "node:assert/strict";
import type { Hex } from "viem";
import { Repo } from "@fangorn-market/db";
import {
  PRICE_OBSERVATION_SCHEMA,
  buildPriceObservation,
  marketId,
  scaled,
} from "@fangorn-market/shared";
import { recordChange } from "./indexer.js";

const OWNER = "0x1111111111111111111111111111111111111111" as Hex;

// Minimal NamespaceChange stand-in carrying only what recordChange reads.
function changeWith(vertices: { schemaId: string; payload: unknown }[]) {
  return {
    namespace: "market-prices",
    owner: OWNER,
    commitCid: "bafycommit000000000000",
    addedVertices: vertices.map((v) => ({ cid: "bafyv", ...v })),
    addedEdges: [],
    removedVertexCids: [],
    removedEdges: [],
    oldRoot: "0x0" as Hex,
    newRoot: "0x1" as Hex,
    blockNumber: 100n,
  } as unknown as Parameters<typeof recordChange>[1];
}

test("recordChange mirrors price observations into the DB and skips foreign schemas", () => {
  const repo = Repo.open();
  const v1 = buildPriceObservation({ symbol: "RH:ACME", priceScaled: scaled(100), ts: 1, seq: 1, source: "synthetic" });
  const v2 = buildPriceObservation({ symbol: "RH:ACME", priceScaled: scaled(101), ts: 2, seq: 2, source: "synthetic" });
  const foreign = { schemaId: "some.other/v1", payload: { hello: "world" } };

  const n = recordChange(repo, changeWith([v1, v2, foreign]));
  assert.equal(n, 2);

  const assets = repo.listDataAssets();
  assert.equal(assets.length, 1);
  assert.equal(assets[0]!.recordCount, 2);
  assert.equal(assets[0]!.symbol, "RH:ACME");

  const latest = repo.latestObservation("RH:ACME");
  assert.equal(latest!.seq, 2);
  assert.equal(latest!.marketId, marketId("RH:ACME"));
  assert.equal(latest!.price, scaled(101));
});
