import { stringToBytes, type Address, type PublicClient, type WalletClient } from "viem";
import type { Repo } from "@fangorn-market/db";
import { deriveSignal, type DerivedSignal } from "@fangorn-market/trading";
import { sellResource, type X402Config } from "@fangorn-market/x402pay";

/** Schema for the confidence signal - same shape a trading agent consumes. */
export const PREMIUM_SIGNAL_SCHEMA = "fangorn-market.premium-confidence/v1";

/**
 * A non-trading agent that PRODUCES intelligence. It reads price observations
 * from The Grove, derives a directional confidence signal, and publishes it as a
 * paid, encrypted x402f resource - which trading agents then pay to consume.
 * This closes the flywheel: agents don't just trade, they sell intelligence to
 * each other.
 */
export class SignalAgent {
  constructor(
    private readonly deps: {
      repo: Repo;
      config: X402Config;
      ownerWallet: WalletClient;
      publicClient: PublicClient;
      symbol: string;
      agentName: string;
      price: bigint; // USDC base units
      lookback?: number;
    },
  ) {}

  async run(): Promise<{ resourceId: `0x${string}`; name: string; signal: DerivedSignal; recordsUsed: number }> {
    const { repo, symbol } = this.deps;
    const account = this.deps.ownerWallet.account;
    if (!account) throw new Error("ownerWallet has no account");

    // Read the Grove mirror (DESC) → ascending price series.
    const rows = repo.listObservations(symbol, 200);
    const prices = rows.slice().reverse().map((r) => r.price);
    if (prices.length === 0) throw new Error(`No Grove observations for ${symbol}. Seed/index first.`);

    const signal = deriveSignal(prices, { lookback: this.deps.lookback ?? 10 });

    const payload = {
      schema: PREMIUM_SIGNAL_SCHEMA,
      symbol,
      bias: signal.bias,
      confidence: signal.confidence,
      momentum: signal.momentum,
      producedBy: this.deps.agentName,
      recordsUsed: prices.length,
      note: "Derived autonomously from Grove observations; only visible to paying agents.",
      issuedAt: new Date().toISOString(),
    };

    const name = `signal-${symbol}-${Date.now()}`;
    const sold = await sellResource({
      config: this.deps.config,
      ownerWallet: this.deps.ownerWallet,
      publicClient: this.deps.publicClient,
      name,
      plaintext: stringToBytes(JSON.stringify(payload)),
      price: this.deps.price,
    });

    const now = Math.floor(Date.now() / 1000);
    repo.upsertResource({
      resourceId: sold.resourceId,
      name,
      owner: account.address as Address,
      price: this.deps.price,
      workerUrl: this.deps.config.workerUrl,
      plaintextHash: sold.plaintextHash,
      symbol,
      accessMode: "monetized",
      createTx: sold.txHash,
      createdAt: now,
    });
    repo.addActivity({
      ts: now,
      kind: "resource-published",
      message: `${this.deps.agentName} published a ${signal.bias} signal (confidence ${signal.confidence}) derived from ${prices.length} Grove records`,
    });

    return { resourceId: sold.resourceId, name, signal, recordsUsed: prices.length };
  }
}
