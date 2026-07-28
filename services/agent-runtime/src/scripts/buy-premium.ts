/**
 * Phase 2 tracer bullet — buyer side. The agent pays for and decrypts the
 * premium signal via x402f (register → settle → unlock DEK → decrypt), using a
 * stealth identity so its wallet never appears in the settlement. Records the
 * purchase (earnings) in the DB.
 *
 * Prereqs: facilitator running (`facilitator-runner start`), a resource
 * published (`publish:premium`), and the buyer wallet funded with USDC.
 * Run: pnpm --filter @fangorn-market/agent-runtime buy:premium
 */
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { Repo } from "@fangorn-market/db";
import { findRepoRoot } from "@fangorn-market/shared";

const usdc = (baseUnits: bigint): string => `${(Number(baseUnits) / 1e6).toFixed(6)} USDC`;
import { resolveX402Config, payAndFetch } from "@fangorn-market/x402pay";

const SYMBOL = process.env.SEED_SYMBOL ?? "RH:ACME";
const ERC20_ABI = [
  { inputs: [{ name: "a", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

async function main() {
  const buyerKey = process.env.BUYER_PRIVATE_KEY as Hex | undefined;
  if (!buyerKey) throw new Error("BUYER_PRIVATE_KEY is required in .env (a fresh wallet funded with USDC)");
  const config = resolveX402Config();
  const buyer = privateKeyToAccount(buyerKey);
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(config.rpcUrl) }) as PublicClient;
  const buyerWallet = createWalletClient({ account: buyer, chain: arbitrumSepolia, transport: http(config.rpcUrl) });

  const repo = Repo.open(resolve(findRepoRoot(), ".data", "sepolia.db"));
  const resource = repo.latestResource(SYMBOL);
  if (!resource) throw new Error(`No premium resource for ${SYMBOL}. Run publish:premium first.`);

  // USDC balance pre-check.
  const usdcBal = (await publicClient.readContract({
    address: config.usdc,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [buyer.address],
  })) as bigint;

  console.log(`Buyer (agent) : ${buyer.address}`);
  console.log(`USDC balance  : ${Number(usdcBal) / 1e6} USDC`);
  console.log(`Resource      : ${resource.name}`);
  console.log(`Owner (seller): ${resource.owner}`);
  console.log(`Price         : ${Number(resource.price) / 1e6} USDC\n`);

  if (usdcBal < resource.price) {
    throw new Error(
      `Buyer has insufficient USDC (${Number(usdcBal) / 1e6} < ${Number(resource.price) / 1e6}). ` +
        `Send testnet USDC to ${buyer.address} (faucet.circle.com → Arbitrum Sepolia).`,
    );
  }

  console.log("Paying + decrypting via x402f (register → settle → unlock)…\n");
  const result = await payAndFetch({
    config,
    buyerWallet,
    publicClient,
    owner: resource.owner as Address,
    name: resource.name,
    price: resource.price,
    expectedPlaintextHash: resource.plaintextHash,
  });

  const now = Math.floor(Date.now() / 1000);
  if (result.paidNow) {
    repo.insertPurchase({
      resourceId: resource.resourceId,
      owner: resource.owner,
      buyerStealth: result.stealthAddress,
      amount: resource.price,
      nullifier: result.nullifier,
      deploymentId: null,
      ts: now,
    });
    repo.addActivity({
      ts: now,
      kind: "access-payment",
      message: `Agent paid ${Number(resource.price) / 1e6} USDC for "${resource.name}" and decrypted it`,
    });
  }

  const earnings = repo.earningsForOwner(resource.owner);
  console.log(`${result.paidNow ? "Paid + decrypted" : "Already settled — decrypted"} ✓`);
  console.log(`  stealth addr : ${result.stealthAddress} (buyer wallet stayed unlinked)`);
  console.log(`  nullifier    : ${result.nullifier}`);
  console.log(`\n── Decrypted premium signal ──`);
  console.log(result.text);
  console.log(`\nSeller earnings: ${usdc(earnings.gross)} across ${earnings.count} purchase(s).`);
}

// Semaphore's snarkjs proof worker keeps the event loop alive after we're done.
// Force exit, but defer a tick so libuv can finish closing the worker handle
// (an immediate process.exit races it and asserts on Windows).
function exit(code: number): void {
  setTimeout(() => process.exit(code), 300);
}

main()
  .then(() => exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    exit(1);
  });
