// Non-custodial spot swaps on Arbitrum One via Uniswap v3.
//
// Design principle: we write NO new trading contracts and never custody funds.
// The user's own wallet calls Uniswap's already-audited SwapRouter02. We only
// read quotes (QuoterV2, read-only) and hand the wallet a transaction to sign.
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { type Address, erc20Abi, parseUnits } from "viem";

export const ARBITRUM_ONE_ID = 42161;

/** Canonical Uniswap v3 deployments on Arbitrum One (audited, same across chains). */
export const UNISWAP = {
  quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" as Address,
  swapRouter02: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" as Address,
} as const;

export interface Token {
  symbol: string;
  name: string;
  /** ERC-20 address used for routing/quoting (wrapped address for native ETH). */
  address: Address;
  decimals: number;
  /** True for native ETH - swapped by sending tx value, no approval needed. */
  native?: boolean;
}

const WETH: Address = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";

/** A small, liquid Arbitrum One token set. Native ETH routes through WETH. */
export const TOKENS: Token[] = [
  { symbol: "ETH", name: "Ether", address: WETH, decimals: 18, native: true },
  { symbol: "WETH", name: "Wrapped Ether", address: WETH, decimals: 18 },
  { symbol: "USDC", name: "USD Coin", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
  { symbol: "ARB", name: "Arbitrum", address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18 },
];

export const tokenBySymbol = (s: string): Token => TOKENS.find((t) => t.symbol === s) ?? TOKENS[0]!;

/** Fee tiers we probe for the best quote (0.05% and 0.3% cover most majors). */
const FEE_TIERS = [500, 3000] as const;

const quoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

export const swapRouterAbi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

export { erc20Abi };

export interface Quote {
  amountOut: bigint;
  fee: number;
}

/**
 * Live best-fee quote from Uniswap's QuoterV2 (read-only eth_call via simulate).
 * Returns the best amountOut across the probed fee tiers.
 */
export function useSwapQuote(tokenIn: Token, tokenOut: Token, amountInText: string) {
  const client = usePublicClient({ chainId: ARBITRUM_ONE_ID });
  const enabled = !!client && !!amountInText && Number(amountInText) > 0 && tokenIn.address !== tokenOut.address;

  return useQuery({
    queryKey: ["swap-quote", tokenIn.address, tokenOut.address, amountInText],
    enabled,
    refetchInterval: 12_000,
    queryFn: async (): Promise<Quote | null> => {
      const amountIn = parseUnits(amountInText, tokenIn.decimals);
      let best: Quote | null = null;
      for (const fee of FEE_TIERS) {
        try {
          const { result } = await client!.simulateContract({
            address: UNISWAP.quoterV2,
            abi: quoterAbi,
            functionName: "quoteExactInputSingle",
            args: [{ tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn, fee, sqrtPriceLimitX96: 0n }],
          });
          const amountOut = result[0] as bigint;
          if (!best || amountOut > best.amountOut) best = { amountOut, fee };
        } catch {
          // no pool at this fee tier - skip
        }
      }
      return best;
    },
  });
}

/** amountOutMinimum from a quote and a slippage tolerance in basis points. */
export const minOut = (amountOut: bigint, slippageBps: number): bigint =>
  (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;

/** Build the exactInputSingle params for the user's wallet to sign. */
export function buildSwap(args: {
  tokenIn: Token;
  tokenOut: Token;
  fee: number;
  amountIn: bigint;
  amountOutMinimum: bigint;
  recipient: Address;
}) {
  const params = {
    tokenIn: args.tokenIn.address,
    tokenOut: args.tokenOut.address,
    fee: args.fee,
    recipient: args.recipient,
    amountIn: args.amountIn,
    amountOutMinimum: args.amountOutMinimum,
    sqrtPriceLimitX96: 0n,
  } as const;
  return {
    address: UNISWAP.swapRouter02,
    abi: swapRouterAbi,
    functionName: "exactInputSingle" as const,
    args: [params] as const,
    // Native ETH input: send value and let the router wrap. ERC-20 input: value 0.
    value: args.tokenIn.native ? args.amountIn : 0n,
  };
}
