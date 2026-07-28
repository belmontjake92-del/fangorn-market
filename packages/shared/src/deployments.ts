import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Hex } from "viem";

/** Contract addresses written by the Hardhat deploy script. */
export interface DeploymentRecord {
  network: string;
  chainId: number;
  priceOracle: Hex;
  settlementLedger: Hex;
  owner: Hex;
  maxStaleness: string;
  deployedAt: string;
}

/** Walk up from `start` to the monorepo root (identified by pnpm-workspace.yaml). */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start); // fell off the top; give up gracefully
    dir = parent;
  }
}

/**
 * Load the deployed contract addresses for `network` from
 * `<repo>/deployments/<network>.json`. Returns null if not deployed yet.
 */
export function loadDeployment(
  network: string,
  opts: { dir?: string } = {},
): DeploymentRecord | null {
  const dir = opts.dir ?? process.env.DEPLOYMENTS_DIR ?? resolve(findRepoRoot(), "deployments");
  const file = resolve(dir, `${network}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as DeploymentRecord;
}

/** Like {@link loadDeployment} but throws a clear error when missing. */
export function requireDeployment(network: string, opts: { dir?: string } = {}): DeploymentRecord {
  const rec = loadDeployment(network, opts);
  if (!rec) {
    throw new Error(
      `No deployment found for network "${network}". Run \`pnpm --filter @fangorn-market/contracts deploy:sepolia\` first.`,
    );
  }
  return rec;
}
