import type { Address } from "viem";

/**
 * x402f configuration. Defaults target the already-deployed Arbitrum Sepolia
 * infrastructure: the Stylus SettlementRegistry, Circle's testnet USDC, and the
 * hosted Fangorn access worker.
 *
 * `rpcUrl` defaults to the PUBLIC Arbitrum RPC on purpose: the Semaphore group
 * is rebuilt from `MemberRegistered` logs `fromBlock 0`, which rate-limited
 * providers (Alchemy free tier's 10-block getLogs cap) reject.
 */
export interface X402Config {
  rpcUrl: string;
  settlementRegistry: Address;
  usdc: Address;
  usdcDomainName: string;
  usdcDomainVersion: string;
  workerUrl: string;
  facilitatorUrl: string;
}

const DEFAULTS = {
  rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
  settlementRegistry: "0xc94ed0babff1440a0fc5608ca2943d4cf1a849fb",
  usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  usdcDomainName: "USD Coin",
  usdcDomainVersion: "2",
  workerUrl: "https://fangorn-access-worker.quickbeam.workers.dev",
  facilitatorUrl: "http://localhost:30333",
} as const;

export function resolveX402Config(env: NodeJS.ProcessEnv = process.env): X402Config {
  return {
    rpcUrl: env.X402_RPC_URL ?? DEFAULTS.rpcUrl,
    settlementRegistry: (env.SETTLEMENT_REGISTRY_ADDR ?? DEFAULTS.settlementRegistry) as Address,
    usdc: (env.USDC_CONTRACT_ADDR ?? DEFAULTS.usdc) as Address,
    usdcDomainName: env.USDC_DOMAIN_NAME ?? DEFAULTS.usdcDomainName,
    usdcDomainVersion: env.USDC_DOMAIN_VERSION ?? DEFAULTS.usdcDomainVersion,
    workerUrl: (env.WORKER_URL ?? DEFAULTS.workerUrl).replace(/\/$/, ""),
    facilitatorUrl: (env.FACILITATOR_URL ?? DEFAULTS.facilitatorUrl).replace(/\/$/, ""),
  };
}
