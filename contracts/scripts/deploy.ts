import hre from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Deploy PriceOracle + SettlementLedger to the selected network and record the
 * addresses in `<repo>/deployments/<network>.json` for the API and agent-runtime
 * to consume. Run: `pnpm deploy:sepolia` (needs FANGORN_PRIVATE_KEY + RPC in .env).
 */
async function main() {
  const [deployer] = await hre.viem.getWalletClients();
  const owner = deployer.account.address;
  const chainId = hre.network.config.chainId ?? 0;
  const maxStaleness = BigInt(process.env.MAX_STALENESS ?? "3600");

  console.log(`Deploying to ${hre.network.name} (chainId ${chainId}) as ${owner}`);

  const oracle = await hre.viem.deployContract("PriceOracle", [owner]);
  console.log(`  PriceOracle       ${oracle.address}`);

  const ledger = await hre.viem.deployContract("SettlementLedger", [
    owner,
    oracle.address,
    maxStaleness,
  ]);
  console.log(`  SettlementLedger  ${ledger.address}`);

  const record = {
    network: hre.network.name,
    chainId,
    priceOracle: oracle.address,
    settlementLedger: ledger.address,
    owner,
    maxStaleness: maxStaleness.toString(),
    deployedAt: new Date().toISOString(),
  };

  const dir = resolve(__dirname, "../../deployments");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${hre.network.name}.json`);
  writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  console.log(`\nWrote ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
