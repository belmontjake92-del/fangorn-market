import { test } from "node:test";
import assert from "node:assert/strict";
import { marketId, usd, scaled, PRICE_OBSERVATION_SCHEMA } from "@fangorn-market/shared";
import type { Hex } from "viem";
import { Repo } from "./repo.js";

const PUB = "0x1111111111111111111111111111111111111111" as Hex;
const OWNER = "0x2222222222222222222222222222222222222222" as Hex;
const OP = "0x3333333333333333333333333333333333333333" as Hex;
const SYMBOL = "RH:ACME";

function obs(seq: number, price: number) {
  return {
    publisher: PUB,
    namespace: "market-prices",
    schemaId: PRICE_OBSERVATION_SCHEMA,
    symbol: SYMBOL,
    marketId: marketId(SYMBOL),
    priceScaled: scaled(price),
    ts: 1000 + seq,
    seq,
    source: "synthetic",
    commitCid: `cid-${seq}`,
  };
}

test("records observations idempotently and rolls up the data asset", () => {
  const repo = Repo.open();
  assert.equal(repo.recordObservation(obs(1, 100)), true);
  assert.equal(repo.recordObservation(obs(2, 101)), true);
  assert.equal(repo.recordObservation(obs(2, 101)), false); // duplicate seq ignored

  const assets = repo.listDataAssets();
  assert.equal(assets.length, 1);
  assert.equal(assets[0]!.recordCount, 2);
  assert.equal(assets[0]!.symbol, SYMBOL);
  assert.equal(assets[0]!.latestSeq, 2);

  const latest = repo.latestObservation(SYMBOL);
  assert.equal(latest!.seq, 2);
  assert.equal(latest!.price, scaled(101));

  assert.equal(repo.listObservations(SYMBOL).length, 2);
});

test("stores deployments, positions, fills and activity", () => {
  const repo = Repo.open();
  const cfg = {
    id: "0xabc" as Hex,
    key: "dep-1",
    agentName: "Atlas",
    owner: OWNER,
    operator: OP,
    openingCash: usd(1000),
    limits: { maxPositionNotional: usd(500), dailyLossLimit: usd(50) },
    market: { symbol: SYMBOL, marketId: marketId(SYMBOL), label: "Acme", assetClass: "equity" as const },
    strategy: { kind: "threshold-momentum" as const, lookback: 3, band: 0.01, clipSize: 1 },
  };
  repo.upsertDeployment(cfg);
  assert.equal(repo.listDeployments().length, 1);
  assert.equal(repo.getDeployment("0xabc")!.agent_name, "Atlas");

  repo.upsertPosition({
    deploymentId: cfg.id,
    marketId: cfg.market.marketId,
    symbol: SYMBOL,
    size: scaled(1),
    entryPrice: scaled(100),
    markPrice: scaled(110),
    unrealizedPnl: usd(10),
    notional: usd(110),
  });
  const positions = repo.getPositions("0xabc");
  assert.equal(positions.length, 1);
  assert.equal(positions[0]!.unrealizedPnl, usd(10));

  repo.insertFill({
    deploymentId: cfg.id,
    marketId: cfg.market.marketId,
    symbol: SYMBOL,
    sizeDelta: scaled(1),
    price: scaled(100),
    newSize: scaled(1),
    newEntryPrice: scaled(100),
    realizedPnl: 0n,
    cashAfter: usd(1000),
    txHash: "0xdead" as Hex,
    ts: 1234,
  });
  assert.equal(repo.listFills("0xabc").length, 1);

  repo.addActivity({ ts: 1, kind: "fill", deploymentId: cfg.id, message: "filled +1" });
  assert.equal(repo.listActivity()[0]!.message, "filled +1");

  repo.setState("lastBlock", "42");
  assert.equal(repo.getState("lastBlock"), "42");
});
