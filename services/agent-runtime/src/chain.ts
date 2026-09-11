import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEventLogs,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { PriceOracleAbi, SettlementLedgerAbi, type RiskLimits } from "@fangorn-market/shared";

/** Local Hardhat network for the no-secrets end-to-end dry run. */
export const localhostChain = defineChain({
  id: 31337,
  name: "Localhost",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

/**
 * Robinhood Chain - the execution/settlement environment. Defaults to the public
 * testnet (chain 46630, live since 2026-02-10); override RH_CHAIN_ID / RH_RPC_URL
 * for mainnet (live since 2026-07-01) or a dedicated RPC.
 *
 * Our contracts (PriceOracle/SettlementLedger) + trading agent run here. NOTE:
 * the Grove (Fangorn DataRegistry) and x402f (SettlementRegistry/worker/USDC)
 * still live on Arbitrum Sepolia until Fangorn deploys them to RH Chain.
 */
export const RH_TESTNET_ID = 46630;
export const RH_TESTNET_RPC = "https://rpc.testnet.chain.robinhood.com";

export function robinhoodChain(env: NodeJS.ProcessEnv = process.env): Chain {
  return defineChain({
    id: Number(env.RH_CHAIN_ID ?? RH_TESTNET_ID),
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [env.RH_RPC_URL ?? RH_TESTNET_RPC] } },
  });
}

/** Resolve the target chain by network name. `NETWORK=robinhood` when it's live. */
export function resolveChain(network: string): Chain {
  if (network === "arbitrumSepolia") return arbitrumSepolia;
  if (network === "robinhood") return robinhoodChain();
  return localhostChain;
}

export interface ChainConfig {
  network: string;
  rpcUrl: string;
  privateKey: Hex;
  oracle: Address;
  ledger: Address;
}

/** Authoritative fill result, decoded from the FillSettled event. */
export interface FillEvent {
  sizeDelta: bigint;
  price: bigint;
  newSize: bigint;
  newEntryPrice: bigint;
  realizedPnl: bigint;
  cashAfter: bigint;
}

export interface AccountState {
  owner: Address;
  operator: Address;
  exists: boolean;
  paused: boolean;
  cash: bigint;
  limits: RiskLimits;
  dayBucket: bigint;
  dayRealizedPnl: bigint;
}

/**
 * Typed viem client over PriceOracle + SettlementLedger. The same code drives
 * the local Hardhat dry run and Arbitrum Sepolia - only the config differs.
 */
export class ChainContext {
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient;
  readonly account: ReturnType<typeof privateKeyToAccount>;
  private readonly chain: Chain;
  private readonly oracle: Address;
  private readonly ledger: Address;

  constructor(cfg: ChainConfig) {
    this.chain = resolveChain(cfg.network);
    this.account = privateKeyToAccount(cfg.privateKey);
    this.oracle = cfg.oracle;
    this.ledger = cfg.ledger;
    this.publicClient = createPublicClient({ chain: this.chain, transport: http(cfg.rpcUrl) });
    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(cfg.rpcUrl),
    });
  }

  get address(): Address {
    return this.account.address;
  }

  get chainId(): number {
    return this.chain.id;
  }

  private async send(hash: Hex): Promise<Hex> {
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`Transaction reverted on-chain: ${hash}`);
    }
    return hash;
  }

  // ───────────────────────────── oracle ─────────────────────────────

  async setPrice(marketId: Hex, price: bigint): Promise<Hex> {
    // setPrice is idempotent (it just stores a value), and these writes
    // occasionally revert transiently on Arbitrum Sepolia's public/relayed RPC
    // (the identical call replays fine). Retry a few times before giving up.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const hash = await this.walletClient.writeContract({
          address: this.oracle,
          abi: PriceOracleAbi,
          functionName: "setPrice",
          args: [marketId, price],
          account: this.account,
          chain: this.chain,
        });
        return await this.send(hash);
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    throw lastErr;
  }

  async getPrice(marketId: Hex): Promise<{ price: bigint; updatedAt: bigint }> {
    const [price, updatedAt] = (await this.publicClient.readContract({
      address: this.oracle,
      abi: PriceOracleAbi,
      functionName: "getPrice",
      args: [marketId],
    })) as [bigint, bigint];
    return { price, updatedAt };
  }

  // ──────────────────────────── ledger ─────────────────────────────

  async openDeployment(params: {
    id: Hex;
    owner: Address;
    operator: Address;
    openingCash: bigint;
    limits: RiskLimits;
    markets: Hex[];
  }): Promise<Hex> {
    const hash = await this.walletClient.writeContract({
      address: this.ledger,
      abi: SettlementLedgerAbi,
      functionName: "openDeployment",
      args: [
        params.id,
        params.owner,
        params.operator,
        params.openingCash,
        { maxPositionNotional: params.limits.maxPositionNotional, dailyLossLimit: params.limits.dailyLossLimit },
        params.markets,
      ],
      account: this.account,
      chain: this.chain,
    });
    return this.send(hash);
  }

  /**
   * Settle a fill and return the authoritative result decoded from the
   * FillSettled event - the agent's source of truth for its new position/cash,
   * so it never depends on a possibly-stale read-after-write of its own state.
   */
  async submitFill(id: Hex, marketId: Hex, sizeDelta: bigint): Promise<{ txHash: Hex; fill: FillEvent }> {
    const hash = await this.walletClient.writeContract({
      address: this.ledger,
      abi: SettlementLedgerAbi,
      functionName: "submitFill",
      args: [id, marketId, sizeDelta],
      account: this.account,
      chain: this.chain,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`submitFill reverted on-chain: ${hash}`);
    }
    const events = parseEventLogs({
      abi: SettlementLedgerAbi,
      logs: receipt.logs,
      eventName: "FillSettled",
    });
    const ev = events[0];
    if (!ev) throw new Error(`submitFill produced no FillSettled event: ${hash}`);
    const a = ev.args as unknown as FillEvent;
    return {
      txHash: hash,
      fill: {
        sizeDelta: a.sizeDelta,
        price: a.price,
        newSize: a.newSize,
        newEntryPrice: a.newEntryPrice,
        realizedPnl: a.realizedPnl,
        cashAfter: a.cashAfter,
      },
    };
  }

  async getAccount(id: Hex): Promise<AccountState> {
    const r = (await this.publicClient.readContract({
      address: this.ledger,
      abi: SettlementLedgerAbi,
      functionName: "getAccount",
      args: [id],
    })) as [Address, Address, boolean, boolean, bigint, { maxPositionNotional: bigint; dailyLossLimit: bigint }, bigint, bigint];
    return {
      owner: r[0],
      operator: r[1],
      exists: r[2],
      paused: r[3],
      cash: r[4],
      limits: { maxPositionNotional: r[5].maxPositionNotional, dailyLossLimit: r[5].dailyLossLimit },
      dayBucket: r[6],
      dayRealizedPnl: r[7],
    };
  }

  async getPosition(id: Hex, marketId: Hex): Promise<{ size: bigint; entry: bigint }> {
    const [size, entry] = (await this.publicClient.readContract({
      address: this.ledger,
      abi: SettlementLedgerAbi,
      functionName: "getPosition",
      args: [id, marketId],
    })) as [bigint, bigint];
    return { size, entry };
  }

  async unrealizedPnl(id: Hex, marketId: Hex): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.ledger,
      abi: SettlementLedgerAbi,
      functionName: "unrealizedPnl",
      args: [id, marketId],
    })) as bigint;
  }

  async equity(id: Hex, marketId: Hex): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.ledger,
      abi: SettlementLedgerAbi,
      functionName: "equity",
      args: [id, marketId],
    })) as bigint;
  }

  async marketAllowed(id: Hex, marketId: Hex): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: this.ledger,
      abi: SettlementLedgerAbi,
      functionName: "marketAllowed",
      args: [id, marketId],
    })) as boolean;
  }

  async maxStaleness(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.ledger,
      abi: SettlementLedgerAbi,
      functionName: "maxStaleness",
      args: [],
    })) as bigint;
  }

  async emergencyStopped(): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: this.ledger,
      abi: SettlementLedgerAbi,
      functionName: "emergencyStopped",
      args: [],
    })) as boolean;
  }
}
