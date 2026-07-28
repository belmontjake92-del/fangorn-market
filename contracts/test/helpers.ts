import { keccak256, toBytes, type Hex } from "viem";

/** USDC-6 / price / size fixed-point are all 1e6 in this system. */
export const SCALE = 1_000_000n;

/** USDC-6 amount from a human number (e.g. usd(100) === 100_000000n). */
export const usd = (n: number): bigint => BigInt(Math.round(n * 1e6));
/** Price in PRICE_SCALE (1e6) from a human quote (e.g. price(100) === 100_000000n). */
export const price = (n: number): bigint => BigInt(Math.round(n * 1e6));
/** Position size in SIZE_SCALE (1e6), signed (size(-1.5) === -1_500000n). */
export const size = (n: number): bigint => BigInt(Math.round(n * 1e6));

/** bytes32 market id from a ticker string. */
export const market = (name: string): Hex => keccak256(toBytes(name));

/** bytes32 deployment id from a string. */
export const deployment = (name: string): Hex => keccak256(toBytes(name));

/**
 * Assert that a contract call reverts. If `reason` is given, the decoded error
 * (viem includes custom-error names in the message) must contain it.
 */
export async function expectRevert(p: Promise<unknown>, reason?: string): Promise<void> {
  try {
    await p;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (reason && !msg.includes(reason)) {
      throw new Error(`Expected revert "${reason}" but got a different error:\n${msg}`);
    }
    return;
  }
  throw new Error(`Expected revert${reason ? ` "${reason}"` : ""} but the call succeeded`);
}
