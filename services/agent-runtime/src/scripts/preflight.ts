/**
 * Preflight - verify the environment is ready for the live run without printing
 * any secrets: RPC is on Arbitrum Sepolia, the wallet has gas, and the Pinata
 * JWT authenticates.
 *
 * Run: pnpm --filter @fangorn-market/agent-runtime preflight
 */
import { createPublicClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { resolveConfig } from "@fangorn-market/grove";

const EXPECTED_CHAIN_ID = 421614;

async function checkPinata(jwt: string): Promise<string> {
  const res = await fetch("https://api.pinata.cloud/data/testAuthentication", {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (res.ok) return "OK - JWT authenticates";
  return `FAIL - HTTP ${res.status} (check PINATA_JWT)`;
}

async function main() {
  let ok = true;
  const problems: string[] = [];
  const cfg = resolveConfig();

  console.log("Fangorn Market - preflight\n");
  console.log(`  RPC              : ${cfg.rpcUrl.replace(/\/v2\/.*/, "/v2/***")}`);

  // 1. Chain reachable and correct.
  const publicClient = createPublicClient({ transport: http(cfg.rpcUrl) });
  try {
    const chainId = await publicClient.getChainId();
    const good = chainId === EXPECTED_CHAIN_ID;
    console.log(`  chainId          : ${chainId} ${good ? "✓" : `✗ (expected ${EXPECTED_CHAIN_ID})`}`);
    if (!good) {
      ok = false;
      problems.push(`RPC is on chain ${chainId}, not Arbitrum Sepolia (${EXPECTED_CHAIN_ID}).`);
    }
  } catch (e) {
    ok = false;
    console.log(`  chainId          : ✗ unreachable`);
    problems.push(`RPC unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. Wallet present + funded.
  const key = process.env.FANGORN_PRIVATE_KEY as Hex | undefined;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    ok = false;
    console.log(`  wallet           : ✗ FANGORN_PRIVATE_KEY missing/invalid`);
    problems.push("FANGORN_PRIVATE_KEY is missing or not a 32-byte hex key.");
  } else {
    const account = privateKeyToAccount(key);
    try {
      const bal = await publicClient.getBalance({ address: account.address });
      const funded = bal > 0n;
      console.log(`  wallet           : ${account.address}`);
      console.log(`  balance          : ${formatEther(bal)} ETH ${funded ? "✓" : "✗ (needs Arbitrum Sepolia ETH)"}`);
      if (!funded) {
        ok = false;
        problems.push("Wallet has 0 ETH on Arbitrum Sepolia - fund it before deploying.");
      }
    } catch (e) {
      problems.push(`Could not read balance: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 3. Pinata auth.
  const jwt = process.env.PINATA_JWT;
  const gw = process.env.PINATA_GATEWAY;
  if (!jwt) {
    ok = false;
    console.log(`  pinata           : ✗ PINATA_JWT missing`);
    problems.push("PINATA_JWT is missing.");
  } else {
    const result = await checkPinata(jwt);
    console.log(`  pinata           : ${result}`);
    if (!result.startsWith("OK")) {
      ok = false;
      problems.push("Pinata JWT did not authenticate.");
    }
  }
  console.log(`  pinata gateway   : ${gw ? gw : "✗ PINATA_GATEWAY missing"}`);
  if (!gw) {
    ok = false;
    problems.push("PINATA_GATEWAY is missing.");
  }

  console.log("");
  if (ok) {
    console.log("  ✅ Ready. Next: deploy:sepolia → seed:grove → go-live.");
  } else {
    console.log("  ❌ Not ready:");
    for (const p of problems) console.log(`     - ${p}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
