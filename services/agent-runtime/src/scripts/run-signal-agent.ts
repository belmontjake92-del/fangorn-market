/**
 * Signal-publisher agent — a NON-TRADING agent that produces intelligence.
 * Reads Grove observations, derives a confidence signal, and publishes it as a
 * paid x402f resource that trading agents consume. Needs ETH (gas) + Pinata.
 *
 * Run: pnpm --filter @fangorn-market/agent-runtime run:signal-agent
 */
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { Repo } from "@fangorn-market/db";
import { deploymentId, findRepoRoot, marketId, type DeploymentConfig } from "@fangorn-market/shared";
import { resolveX402Config } from "@fangorn-market/x402pay";
import { SignalAgent } from "../signal-agent.js";

const SYMBOL = process.env.SEED_SYMBOL ?? "RH:ACME";
const AGENT_NAME = "Rootline Signals";
const PRICE = BigInt(process.env.RESOURCE_PRICE ?? "1000"); // 0.001 USDC

async function main() {
  const key = process.env.FANGORN_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("FANGORN_PRIVATE_KEY required in .env");
  const config = resolveX402Config();
  const account = privateKeyToAccount(key);
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(config.rpcUrl) }) as PublicClient;
  const ownerWallet = createWalletClient({ account, chain: arbitrumSepolia, transport: http(config.rpcUrl) });
  const repo = Repo.open(resolve(findRepoRoot(), ".data", "sepolia.db"));

  // Register this producer as a first-class (non-trading) agent.
  const cfg: DeploymentConfig = {
    id: deploymentId(`signal-agent-${SYMBOL}`),
    key: `signal-agent-${SYMBOL}`,
    agentName: AGENT_NAME,
    owner: account.address as Address,
    operator: account.address as Address,
    openingCash: 0n,
    limits: { maxPositionNotional: 0n, dailyLossLimit: 0n },
    market: { symbol: SYMBOL, marketId: marketId(SYMBOL), label: SYMBOL, assetClass: "tokenized" },
    strategy: { kind: "threshold-momentum", lookback: 10, band: 0.005, clipSize: 0 },
  };
  repo.upsertDeployment(cfg, "live", "signal");

  console.log(`${AGENT_NAME}: deriving a signal for ${SYMBOL} from the Grove…`);
  const agent = new SignalAgent({ repo, config, ownerWallet, publicClient, symbol: SYMBOL, agentName: AGENT_NAME, price: PRICE });
  const r = await agent.run();

  console.log(`\nPublished signal "${r.name}"`);
  console.log(`  bias        : ${r.signal.bias}`);
  console.log(`  confidence  : ${r.signal.confidence}`);
  console.log(`  momentum    : ${r.signal.momentum}`);
  console.log(`  from        : ${r.recordsUsed} Grove records`);
  console.log(`  resourceId  : ${r.resourceId}`);
  console.log(`\nA trading agent can now buy it: go-live USE_PREMIUM=1.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
