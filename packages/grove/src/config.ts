import { FangornConfig, type AppConfig } from "@fangorn-network/sdk";

/**
 * Resolve the Fangorn {@link AppConfig} from the environment, falling back to
 * the SDK's built-in defaults (Arbitrum Sepolia + public RPC + ipfs.io).
 *
 * Only the RPC URL and the DataRegistry address are overridable today; the
 * chain stays Arbitrum Sepolia until a Robinhood Chain network exists, at which
 * point this is the single place that changes.
 */
export function resolveConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    ...FangornConfig,
    rpcUrl: env.ARBITRUM_SEPOLIA_RPC_URL ?? FangornConfig.rpcUrl,
    dataRegistryContractAddress:
      (env.DATA_REGISTRY_ADDRESS as AppConfig["dataRegistryContractAddress"]) ??
      FangornConfig.dataRegistryContractAddress,
  };
}
