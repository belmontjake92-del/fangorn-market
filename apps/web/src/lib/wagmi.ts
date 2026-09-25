import { http, createConfig } from "wagmi";
import { arbitrum, arbitrumSepolia } from "wagmi/chains";
import { defineChain } from "viem";
import { injected } from "wagmi/connectors";

/** Robinhood Chain testnet - direct (no-stealth) settlement. */
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  testnet: true,
});

/**
 * Supported chains:
 * - Robinhood Chain testnet - direct settlement (intelligence layer).
 * - Arbitrum Sepolia - stealth/Semaphore (intelligence layer).
 * - Arbitrum One - real non-custodial spot execution (Uniswap v3). Users sign
 *   their own swaps against audited liquidity; the platform never holds funds.
 */
export const SUPPORTED_CHAIN_IDS: number[] = [robinhoodTestnet.id, arbitrumSepolia.id, arbitrum.id];

/** Chain where real trades execute (deep audited DEX liquidity). */
export const EXECUTION_CHAIN_ID = arbitrum.id;

export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet, arbitrumSepolia, arbitrum],
  connectors: [injected()],
  transports: {
    [robinhoodTestnet.id]: http(),
    [arbitrumSepolia.id]: http(),
    [arbitrum.id]: http(),
  },
});
