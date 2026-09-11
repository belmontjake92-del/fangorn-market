import { useMemo, useState } from "react";
import { useAccount, useChainId, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { Card } from "../components/ui";
import {
  ARBITRUM_ONE_ID,
  TOKENS,
  UNISWAP,
  buildSwap,
  erc20Abi,
  minOut,
  tokenBySymbol,
  useSwapQuote,
  type Token,
} from "../lib/dex";

/** An agent's proposed spot order - the user chooses whether to execute it. */
interface Proposal {
  agent: string;
  rationale: string;
  fromSymbol: string;
  toSymbol: string;
  amount: string;
}

// Example agent proposals (signal → proposed order). Real signal wiring plugs in
// here later; the user always executes from their own wallet.
const PROPOSALS: Proposal[] = [
  { agent: "Momentum-ETH", rationale: "Trend up on 4h; rotate USDC → ETH.", fromSymbol: "USDC", toSymbol: "ETH", amount: "100" },
  { agent: "ARB-MeanRevert", rationale: "ARB stretched below band; accumulate.", fromSymbol: "USDC", toSymbol: "ARB", amount: "50" },
  { agent: "Risk-Off", rationale: "Volatility spike; de-risk ETH → USDC.", fromSymbol: "ETH", toSymbol: "USDC", amount: "0.05" },
];

const SLIPPAGE_OPTIONS = [50, 100, 300]; // bps

export default function Trade() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const onArbitrum = chainId === ARBITRUM_ONE_ID;

  // Cautious-by-default: new users start in practice (testnet) and opt into live.
  const [mode, setMode] = useState<"testnet" | "mainnet">("testnet");
  const [practice, setPractice] = useState<{ inAmt: string; out: string; from: string; to: string } | null>(null);
  const [fromSym, setFromSym] = useState("USDC");
  const [toSym, setToSym] = useState("ETH");
  const [amount, setAmount] = useState("100");
  const [slippageBps, setSlippageBps] = useState(100);
  const live = mode === "mainnet";

  const tokenIn = tokenBySymbol(fromSym);
  const tokenOut = tokenBySymbol(toSym);
  const sameToken = tokenIn.address === tokenOut.address;

  const quote = useSwapQuote(tokenIn, tokenOut, amount);

  const amountInWei = useMemo(() => {
    try {
      return amount && Number(amount) > 0 ? parseUnits(amount, tokenIn.decimals) : 0n;
    } catch {
      return 0n;
    }
  }, [amount, tokenIn.decimals]);

  // Allowance (ERC-20 inputs only; native ETH needs none).
  const allowance = useReadContract({
    address: tokenIn.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, UNISWAP.swapRouter02] : undefined,
    chainId: ARBITRUM_ONE_ID,
    query: { enabled: !!address && !tokenIn.native && onArbitrum },
  });

  const needsApproval = !tokenIn.native && amountInWei > 0n && (allowance.data ?? 0n) < amountInWei;

  const approve = useWriteContract();
  const swap = useWriteContract();
  const approveRcpt = useWaitForTransactionReceipt({ hash: approve.data });
  const swapRcpt = useWaitForTransactionReceipt({ hash: swap.data });

  const outText = quote.data ? formatUnits(quote.data.amountOut, tokenOut.decimals) : "-";
  const minText = quote.data ? formatUnits(minOut(quote.data.amountOut, slippageBps), tokenOut.decimals) : "-";

  const doApprove = () =>
    approve.writeContract({
      address: tokenIn.address,
      abi: erc20Abi,
      functionName: "approve",
      args: [UNISWAP.swapRouter02, amountInWei],
    });

  const doSwap = () => {
    if (!address || !quote.data || amountInWei === 0n) return;
    swap.writeContract(
      buildSwap({
        tokenIn,
        tokenOut,
        fee: quote.data.fee,
        amountIn: amountInWei,
        amountOutMinimum: minOut(quote.data.amountOut, slippageBps),
        recipient: address,
      }),
    );
  };

  const canApproveOrSwap = isConnected && onArbitrum && !sameToken && amountInWei > 0n && !!quote.data;
  const approving = approve.isPending || approveRcpt.isLoading;
  const swapping = swap.isPending || swapRcpt.isLoading;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl text-fg">Trade</h1>
      <p className="mt-1 text-sm text-muted">
        Real spot swaps on Arbitrum One via Uniswap v3. You sign every trade in your own wallet - Fangorn never holds your
        funds and never sets the price. Quotes are live from on-chain liquidity.
      </p>

      {/* Environment toggle: practice (no real money) vs live mainnet. */}
      <div className="mt-4 inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs">
        <button
          onClick={() => setMode("testnet")}
          className={`rounded-md px-3 py-1.5 font-medium ${!live ? "bg-accent/15 text-accent" : "text-dim hover:text-fg"}`}
        >
          Testnet · Practice
        </button>
        <button
          onClick={() => {
            setMode("mainnet");
            setPractice(null);
          }}
          className={`rounded-md px-3 py-1.5 font-medium ${live ? "bg-accent/15 text-accent" : "text-dim hover:text-fg"}`}
        >
          Mainnet · Live
        </button>
      </div>

      {live ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3 text-[11px] text-muted">
          <span className="text-accent">●</span>
          <span>
            <span className="text-fg">Live - real funds.</span> Non-custodial: executed by your wallet against Uniswap's
            audited router (<span className="font-mono">{UNISWAP.swapRouter02.slice(0, 10)}…</span>). No custody.
          </span>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-cyan/40 bg-cyan/10 p-3 text-[11px] text-muted">
          <span className="text-cyan">●</span>
          <span>
            <span className="text-fg">Practice mode - no real funds move.</span> Real live prices, simulated execution.
            Get comfortable with the flow, then switch to Mainnet when you're ready.
          </span>
        </div>
      )}

      {/* Agent proposals */}
      <div className="mt-6">
        <div className="mb-2 text-xs uppercase tracking-wide text-dim">Agent proposals</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {PROPOSALS.map((p) => (
            <button
              key={p.agent}
              onClick={() => {
                setFromSym(p.fromSymbol);
                setToSym(p.toSymbol);
                setAmount(p.amount);
              }}
              className="rounded-xl border border-border bg-surface p-3 text-left hover:border-accent/40"
            >
              <div className="text-sm text-fg">{p.agent}</div>
              <div className="mt-1 text-[11px] text-dim">{p.rationale}</div>
              <div className="mt-2 font-mono text-[11px] text-accent">
                {p.amount} {p.fromSymbol} → {p.toSymbol}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-dim">Proposals are suggestions from agent signals - you decide and sign.</p>
      </div>

      {/* Swap widget */}
      <Card className="mt-6 space-y-4 p-5">
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <div>
            <label className="text-[11px] text-dim">You pay</label>
            <div className="mt-1 flex gap-2">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent/50"
                placeholder="0.0"
              />
              <TokenSelect value={fromSym} onChange={setFromSym} />
            </div>
          </div>
          <button
            onClick={() => {
              setFromSym(toSym);
              setToSym(fromSym);
            }}
            className="mb-1 rounded-lg border border-border px-2 py-2 text-dim hover:text-fg"
            title="Flip"
          >
            ⇅
          </button>
        </div>

        <div>
          <label className="text-[11px] text-dim">You receive (est.)</label>
          <div className="mt-1 flex gap-2">
            <div className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg">
              {quote.isFetching ? "…" : outText}
            </div>
            <TokenSelect value={toSym} onChange={setToSym} />
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-dim">
          <span>Max slippage</span>
          <div className="flex gap-1">
            {SLIPPAGE_OPTIONS.map((bps) => (
              <button
                key={bps}
                onClick={() => setSlippageBps(bps)}
                className={`rounded-md px-2 py-0.5 ${slippageBps === bps ? "bg-accent/15 text-accent" : "text-dim hover:text-fg"}`}
              >
                {bps / 100}%
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-between text-[11px] text-dim">
          <span>Minimum received</span>
          <span className="font-mono text-muted">
            {minText} {toSym}
          </span>
        </div>
        {quote.data && (
          <div className="flex justify-between text-[11px] text-dim">
            <span>Route</span>
            <span className="font-mono text-muted">Uniswap v3 · {quote.data.fee / 10000}% pool</span>
          </div>
        )}

        {/* Action */}
        {!live ? (
          <>
            <button
              onClick={() => (quote.data ? setPractice({ inAmt: amount, out: outText, from: fromSym, to: toSym }) : null)}
              disabled={sameToken || amountInWei === 0n || !quote.data}
              className="w-full rounded-lg bg-cyan/90 py-2.5 text-sm font-semibold text-bg hover:bg-cyan disabled:opacity-50"
            >
              Practice swap
            </button>
            {practice && (
              <div className="rounded-lg border border-cyan/40 bg-cyan/10 p-2 text-center text-[11px] text-muted">
                Practice trade recorded: <span className="font-mono text-fg">{practice.inAmt} {practice.from} → {practice.out} {practice.to}</span>. No
                real funds moved.
              </div>
            )}
          </>
        ) : !isConnected ? (
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-center text-xs text-dim">
            Connect your wallet (top right) to trade.
          </div>
        ) : !onArbitrum ? (
          <button
            onClick={() => switchChain({ chainId: ARBITRUM_ONE_ID })}
            className="w-full rounded-lg border border-amber/50 bg-amber/10 py-2.5 text-sm font-medium text-amber hover:bg-amber/20"
          >
            Switch to Arbitrum One to trade
          </button>
        ) : sameToken ? (
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-center text-xs text-dim">
            Choose two different tokens.
          </div>
        ) : needsApproval ? (
          <button
            onClick={doApprove}
            disabled={!canApproveOrSwap || approving}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-bg hover:bg-accent-bright disabled:opacity-50"
          >
            {approving ? "Approving…" : `Approve ${fromSym}`}
          </button>
        ) : (
          <button
            onClick={doSwap}
            disabled={!canApproveOrSwap || swapping}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-bg hover:bg-accent-bright disabled:opacity-50"
          >
            {swapping ? "Swapping…" : `Swap ${fromSym} → ${toSym}`}
          </button>
        )}

        {swapRcpt.isSuccess && (
          <div className="rounded-lg border border-gain/40 bg-gain/10 p-2 text-center text-[11px] text-gain">
            Swap confirmed.{" "}
            <a className="underline" href={`https://arbiscan.io/tx/${swap.data}`} target="_blank" rel="noreferrer">
              View on Arbiscan
            </a>
          </div>
        )}
        {(approve.error || swap.error) && (
          <div className="rounded-lg border border-loss/40 bg-loss/10 p-2 text-[11px] text-loss">
            {(approve.error || swap.error)?.message?.slice(0, 140)}
          </div>
        )}
      </Card>
    </div>
  );
}

function TokenSelect({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-border bg-bg px-2 py-2 text-sm text-fg outline-none focus:border-accent/50"
    >
      {TOKENS.map((t: Token) => (
        <option key={t.symbol} value={t.symbol}>
          {t.symbol}
        </option>
      ))}
    </select>
  );
}
