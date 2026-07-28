/**
 * Phase 0 connectivity smoke test.
 *
 * Verifies, with no funded wallet and no secrets, that:
 *   1. `@fangorn-network/sdk` imports and `Fangorn.create()` initializes.
 *   2. We can reach Arbitrum Sepolia over RPC.
 *   3. The Fangorn DataRegistry (The Grove's on-chain root) answers read calls.
 *
 * Run: `pnpm check:sepolia`
 */
import { resolveConfig } from "../config.js";
import { createReadOnlyGroveClient } from "../client.js";

async function main() {
  const cfg = resolveConfig();
  console.log("Fangorn Market — Phase 0 connectivity check\n");
  console.log(`  chain            : ${cfg.chain.name} (id ${cfg.chain.id})`);
  console.log(`  rpc              : ${cfg.rpcUrl}`);
  console.log(`  data registry    : ${cfg.dataRegistryContractAddress}`);
  console.log(`  ipfs gateway     : ${cfg.ipfsGateway}\n`);

  const t0 = Date.now();
  const grove = await createReadOnlyGroveClient();
  const registry = grove.getDataRegistry();

  const [block, publisherCount, fee, admin] = await Promise.all([
    registry.currentBlock(),
    registry.publisherCount(),
    registry.registrationFee(),
    registry.admin(),
  ]);
  const ms = Date.now() - t0;

  console.log("  DataRegistry reads:");
  console.log(`    currentBlock     : ${block}`);
  console.log(`    publisherCount   : ${publisherCount}`);
  console.log(`    registrationFee  : ${fee} wei`);
  console.log(`    admin            : ${admin}`);
  console.log(`\n  OK — reachable in ${ms}ms. The Grove's on-chain root is live.`);
}

main().catch((err) => {
  console.error("\n  FAILED — connectivity check did not pass:\n");
  console.error(err);
  process.exit(1);
});
