import { Fangorn, type StorageConfig } from "@fangorn-network/sdk";
import { generatePrivateKey } from "viem/accounts";
import type { Hex } from "viem";
import { resolveConfig } from "./config.js";

/**
 * Create a Grove client (a configured {@link Fangorn} instance).
 *
 * The SDK requires *some* wallet even for read paths, so when no private key is
 * supplied we mint a throwaway one: it can read the DataRegistry and IPFS but
 * cannot push commits. Provide `privateKey` (+ Pinata `storage`) for the write
 * path used from Phase 1 onward.
 */
export async function createGroveClient(opts?: {
  privateKey?: Hex;
  storage?: StorageConfig;
  env?: NodeJS.ProcessEnv;
}): Promise<Fangorn> {
  const env = opts?.env ?? process.env;
  const privateKey = opts?.privateKey ?? (env.FANGORN_PRIVATE_KEY as Hex | undefined);

  const storage: StorageConfig | undefined =
    opts?.storage ??
    (env.PINATA_JWT && env.PINATA_GATEWAY
      ? { pinata: { jwt: env.PINATA_JWT, gateway: env.PINATA_GATEWAY } }
      : undefined);

  return Fangorn.create({
    privateKey: privateKey ?? generatePrivateKey(),
    config: resolveConfig(env),
    ...(storage ? { storage } : {}),
  });
}

/**
 * A read-only Grove client backed by a throwaway key - safe for querying the
 * registry and reading namespaces without touching any funded wallet.
 */
export function createReadOnlyGroveClient(env: NodeJS.ProcessEnv = process.env) {
  return createGroveClient({ privateKey: generatePrivateKey(), env });
}
