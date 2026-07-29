import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";

// Load the monorepo-root .env (secrets live one level up, git-ignored).
// This package is CommonJS (Hardhat requirement), so __dirname is available.
loadEnv({ path: resolve(__dirname, "../.env") });

const RPC_URL =
  process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";
const RH_RPC_URL = process.env.RH_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com";
const RH_CHAIN_ID = Number(process.env.RH_CHAIN_ID ?? 46630);
const PRIVATE_KEY = process.env.FANGORN_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true, // avoids "stack too deep" in submitFill's rich event emit
    },
  },
  networks: {
    hardhat: {},
    arbitrumSepolia: {
      url: RPC_URL,
      chainId: 421614,
      // Only attach an account when a key is present so local/compile flows work
      // without secrets.
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    robinhoodTestnet: {
      url: RH_RPC_URL,
      chainId: RH_CHAIN_ID,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};

export default config;
