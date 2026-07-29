import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors";
import { shortAddr } from "../lib/format";
import { SUPPORTED_CHAIN_IDS, robinhoodTestnet } from "../lib/wagmi";

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  if (isConnected && address) {
    const wrongChain = !SUPPORTED_CHAIN_IDS.includes(chainId);
    if (wrongChain) {
      return (
        <button
          onClick={() => switchChain({ chainId: robinhoodTestnet.id as 46630 })}
          className="rounded-full border border-amber/50 bg-amber/10 px-3 py-1.5 text-xs font-medium text-amber hover:bg-amber/20"
        >
          Switch to Robinhood Chain
        </button>
      );
    }
    return (
      <button
        onClick={() => disconnect()}
        className="rounded-full border border-border bg-white/5 px-3 py-1.5 font-mono text-xs text-fg hover:border-accent/40 hover:text-accent"
        title="Disconnect"
      >
        {shortAddr(address)}
      </button>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      disabled={isPending}
      className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-bg hover:bg-accent-bright disabled:opacity-60"
    >
      {isPending ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
