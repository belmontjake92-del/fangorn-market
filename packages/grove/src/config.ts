import { FangornConfig, type AppConfig } from "@fangorn-network/sdk";
import { defineChain, type Hex } from "viem";

/** Robinhood Chain testnet (chain 46630) as a viem chain for the SDK. */
const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
});

/**
 * Resolve the Fangorn {@link AppConfig} for the target network.
 *
 * Default: Arbitrum Sepolia + Fangorn's deployed DataRegistry. With
 * `NETWORK=robinhood`, target Robinhood Chain + OUR DataRegistry
 * (`DATA_REGISTRY_ADDRESS`) - The Grove running natively on Robinhood Chain.
 * IPFS storage (Pinata) is chain-agnostic, so only the on-chain anchor moves.
 */
export function resolveConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if ((env.NETWORK ?? "") === "robinhood") {
    const registry = env.DATA_REGISTRY_ADDRESS;
    if (!registry) {
      throw new Error("NETWORK=robinhood needs DATA_REGISTRY_ADDRESS (deploy:grove:robinhood first)");
    }
    return {
      dataRegistryContractAddress: registry as Hex,
      chain: robinhoodTestnet,
      rpcUrl: env.RH_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com",
      caip2: 46630,
      ipfsGateway: FangornConfig.ipfsGateway,
    };
  }

  return {
    ...FangornConfig,
    rpcUrl: env.ARBITRUM_SEPOLIA_RPC_URL ?? FangornConfig.rpcUrl,
    dataRegistryContractAddress:
      (env.DATA_REGISTRY_ADDRESS as AppConfig["dataRegistryContractAddress"]) ??
      FangornConfig.dataRegistryContractAddress,
  };
}
