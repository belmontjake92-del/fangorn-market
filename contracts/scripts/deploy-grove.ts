import hre from "hardhat";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Deploy the Solidity DataRegistry (The Grove's on-chain anchor) to the selected
 * network and merge its address into deployments/<network>.json.
 * Run: pnpm --filter @fangorn-market/contracts deploy:grove:robinhood
 */
async function main() {
  const [deployer] = await hre.viem.getWalletClients();
  const chainId = hre.network.config.chainId ?? 0;
  console.log(`Deploying DataRegistry to ${hre.network.name} (chainId ${chainId}) as ${deployer.account.address}`);

  const registry = await hre.viem.deployContract("DataRegistry", []);
  console.log(`  DataRegistry  ${registry.address}`);

  const dir = resolve(__dirname, "../../deployments");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${hre.network.name}.json`);
  const record = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>)
    : { network: hre.network.name, chainId };
  record.dataRegistry = registry.address;
  record.dataRegistryDeployedAt = new Date().toISOString();
  writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  console.log(`\nWrote ${file}`);
  console.log(`\nPoint the Grove at it: NETWORK=robinhood DATA_REGISTRY_ADDRESS=${registry.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
