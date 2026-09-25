import hre from "hardhat";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { proxy, PoseidonT3 } = require("poseidon-solidity");

/**
 * Deploy Stealth mode for Robinhood Chain: Semaphore V4 (PoseidonT3 via the
 * standard CREATE2 proxy, SemaphoreVerifier, Semaphore) plus our
 * StealthAccessRegistry, wired to the existing MockUSDC. Merges addresses into
 * deployments/<network>.json.
 * Run: pnpm --filter @fangorn-market/contracts deploy:stealth:robinhood
 */
async function main() {
  const publicClient = await hre.viem.getPublicClient();
  const [deployer] = await hre.viem.getWalletClients();
  const file = resolve(__dirname, "../../deployments", `${hre.network.name}.json`);
  if (!existsSync(file)) throw new Error(`${file} missing - deploy the base contracts first`);
  const record = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  if (!record.usdc) throw new Error("usdc missing - run deploy:x402:robinhood first");

  console.log(`Deploying Stealth mode to ${hre.network.name} as ${deployer.account.address}`);
  const startBlock = await publicClient.getBlockNumber();

  // 1) PoseidonT3 at its canonical address through the deterministic proxy.
  if ((await publicClient.getCode({ address: proxy.address })) === undefined) {
    throw new Error("CREATE2 proxy not present on this chain");
  }
  if (!(await publicClient.getCode({ address: PoseidonT3.address }))) {
    const hash = await deployer.sendTransaction({ to: proxy.address, data: PoseidonT3.data });
    await publicClient.waitForTransactionReceipt({ hash });
  }
  console.log(`  PoseidonT3            ${PoseidonT3.address}`);

  // 2) Semaphore verifier + Semaphore (linked to PoseidonT3).
  const verifier = await hre.viem.deployContract("SemaphoreVerifier", []);
  console.log(`  SemaphoreVerifier     ${verifier.address}`);
  const semaphore = await hre.viem.deployContract("Semaphore", [verifier.address], {
    libraries: { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": PoseidonT3.address },
  });
  console.log(`  Semaphore             ${semaphore.address}`);

  // 3) Our stealth registry.
  const registry = await hre.viem.deployContract("StealthAccessRegistry", [record.usdc as `0x${string}`, semaphore.address]);
  console.log(`  StealthAccessRegistry ${registry.address}`);

  record.poseidonT3 = PoseidonT3.address;
  record.semaphoreVerifier = verifier.address;
  record.semaphore = semaphore.address;
  record.stealthAccessRegistry = registry.address;
  record.stealthFromBlock = startBlock.toString();
  record.stealthDeployedAt = new Date().toISOString();
  writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  console.log(`\nWrote ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
