/**
 * Go-live step 1 — publish a synthetic price dataset to THE REAL GROVE on
 * Arbitrum Sepolia (IPFS/Pinata + DataRegistry). Creates the namespace if
 * needed and commits N price observations as one CAR + commit + push.
 *
 * Requires in .env: FANGORN_PRIVATE_KEY (funded), PINATA_JWT, PINATA_GATEWAY,
 * and optionally ARBITRUM_SEPOLIA_RPC_URL / GROVE_PRICE_NAMESPACE.
 *
 * Run: pnpm --filter @fangorn-market/agent-runtime seed:grove
 */
import { createGroveClient, ensureRegistered, ensureRepo, publishObservations } from "@fangorn-market/grove";
import { groveNamespace } from "@fangorn-market/shared";
import { SyntheticPriceFeed } from "@fangorn-market/trading";

const SYMBOL = process.env.SEED_SYMBOL ?? "RH:ACME";
const COUNT = Number(process.env.SEED_COUNT ?? 40);

async function main() {
  if (!process.env.FANGORN_PRIVATE_KEY) throw new Error("FANGORN_PRIVATE_KEY is required in .env");
  if (!process.env.PINATA_JWT || !process.env.PINATA_GATEWAY) {
    throw new Error("PINATA_JWT and PINATA_GATEWAY are required in .env to publish to IPFS");
  }

  const fangorn = await createGroveClient();
  const namespace = groveNamespace();
  console.log(`Publisher : ${fangorn.getAddress()}`);
  console.log(`Namespace : ${namespace}`);
  console.log(`Dataset   : ${COUNT} observations of ${SYMBOL}\n`);

  const regTx = await ensureRegistered(fangorn);
  console.log(regTx ? `Registered publisher on-chain (tx ${regTx}).` : "Publisher already registered.");

  await ensureRepo(fangorn, namespace);

  const feed = new SyntheticPriceFeed({ symbol: SYMBOL, start: 100, volPerStep: 0.02, seed: 7 });
  const observations = Array.from({ length: COUNT }, () => {
    const p = feed.next();
    return { symbol: p.symbol, priceScaled: p.priceScaled, ts: p.ts, seq: p.seq, source: "synthetic" };
  });

  const result = await publishObservations(fangorn, namespace, observations);
  console.log(`Published ${result.count} observations to The Grove.`);
  console.log(`  commit : ${result.commitCid}`);
  console.log(`  tx     : ${result.txHash}`);
  console.log(`\nThe namespace "${namespace}" is now a live Data Asset. Run go-live next.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
