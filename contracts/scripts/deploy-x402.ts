import hre from "hardhat";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Deploy the Robinhood-Chain-native paid-data contracts (MockUSDC +
 * PaidAccessRegistry) and merge their addresses into deployments/<network>.json.
 * Run: pnpm --filter @fangorn-market/contracts deploy:x402:robinhood
 */
async function main() {
  const [deployer] = await hre.viem.getWalletClients();
  const chainId = hre.network.config.chainId ?? 0;
  console.log(`Deploying x402 contracts to ${hre.network.name} (chainId ${chainId}) as ${deployer.account.address}`);

  const usdc = await hre.viem.deployContract("MockUSDC", []);
  console.log(`  MockUSDC             ${usdc.address}`);
  const registry = await hre.viem.deployContract("PaidAccessRegistry", [usdc.address]);
  console.log(`  PaidAccessRegistry   ${registry.address}`);

  const dir = resolve(__dirname, "../../deployments");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${hre.network.name}.json`);
  const record = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>)
    : { network: hre.network.name, chainId };
  record.usdc = usdc.address;
  record.paidAccessRegistry = registry.address;
  record.x402DeployedAt = new Date().toISOString();
  writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  console.log(`\nWrote ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
