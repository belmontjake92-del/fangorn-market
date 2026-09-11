/**
 * Local x402f facilitator launcher.
 *
 * The facilitator relays register/settle and pays gas, so its relayer key needs
 * testnet ETH - we reuse the funded main wallet (FANGORN_PRIVATE_KEY) as the
 * relayer. Maps our repo `.env` onto the names the facilitator expects, then
 * imports it (it auto-listens on :FACILITATOR_PORT).
 *
 * Run: pnpm --filter @fangorn-market/facilitator-runner start
 */
process.env.FACILITATOR_EVM_PRIVATE_KEY ??= process.env.FANGORN_PRIVATE_KEY;
process.env.SETTLEMENT_REGISTRY_ADDR ??= "0xc94ed0babff1440a0fc5608ca2943d4cf1a849fb";
process.env.FACILITATOR_PORT ??= "30333";

if (!process.env.FACILITATOR_EVM_PRIVATE_KEY) {
  throw new Error("FACILITATOR_EVM_PRIVATE_KEY (or FANGORN_PRIVATE_KEY) must be set in .env");
}

console.log(`Starting x402f facilitator on :${process.env.FACILITATOR_PORT} …`);
console.log(`  settlement registry: ${process.env.SETTLEMENT_REGISTRY_ADDR}`);

// Run the facilitator from the cloned x402f repo (repo HEAD) rather than the
// published npm package: the published 2026.4.22 is an OLDER protocol version
// (clientPayment→burner + preparedSettle) that doesn't match the x402pay client
// we ported from the repo's reference example (payment→owner + explicit proof
// fields). The clone matches. Its deps are installed via `pnpm i` in _repos/x402f.
const entry = new URL(
  "../../../_repos/x402f/packages/facilitator/src/index.ts",
  import.meta.url,
);
await import(entry.href);
