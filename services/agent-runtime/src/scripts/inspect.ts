/**
 * Ground-truth inspector: read the SettlementLedger's own FillSettled events and
 * final account/position directly from chain, independent of the go-live script's
 * reads. Run: pnpm --filter @fangorn-market/agent-runtime inspect
 */
import { createPublicClient, http, getAddress } from "viem";
import type { Hex } from "viem";
import {
  SettlementLedgerAbi,
  deploymentId,
  formatUsd,
  marketId,
  requireDeployment,
  unscaled,
} from "@fangorn-market/shared";

async function main() {
  const dep = requireDeployment("arbitrumSepolia");
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";
  const client = createPublicClient({ transport: http(rpcUrl) });
  const ledger = getAddress(dep.settlementLedger);
  const id = deploymentId(process.env.DEPLOYMENT_KEY ?? "sepolia-atlas-momentum");
  const mkt = marketId("RH:ACME");

  // Page FillSettled logs in 10-block windows (Alchemy free-tier limit).
  const latest = await client.getBlockNumber();
  const start = latest > 3000n ? latest - 3000n : 0n;
  const logs: { args: Record<string, bigint> }[] = [];
  for (let from = start; from <= latest; from += 10n) {
    const to = from + 9n > latest ? latest : from + 9n;
    const chunk = await client.getContractEvents({
      address: ledger,
      abi: SettlementLedgerAbi,
      eventName: "FillSettled",
      fromBlock: from,
      toBlock: to,
    });
    logs.push(...(chunk as unknown as { args: Record<string, bigint> }[]));
  }

  let sumRealized = 0n;
  console.log(`FillSettled events on ledger ${ledger}: ${logs.length}\n`);
  for (const log of logs) {
    const a = log.args as {
      sizeDelta: bigint;
      price: bigint;
      newSize: bigint;
      realizedPnl: bigint;
      cashAfter: bigint;
    };
    sumRealized += a.realizedPnl;
    console.log(
      `  Δ${a.sizeDelta > 0n ? "+" : ""}${unscaled(a.sizeDelta)} @ $${unscaled(a.price).toFixed(2)}  newSize ${unscaled(a.newSize)}  realized ${formatUsd(a.realizedPnl)}  cash ${formatUsd(a.cashAfter)}`,
    );
  }

  const acct = (await client.readContract({
    address: ledger,
    abi: SettlementLedgerAbi,
    functionName: "getAccount",
    args: [id],
  })) as [Hex, Hex, boolean, boolean, bigint, unknown, bigint, bigint];
  const pos = (await client.readContract({
    address: ledger,
    abi: SettlementLedgerAbi,
    functionName: "getPosition",
    args: [id, mkt],
  })) as [bigint, bigint];

  console.log(`\n  sum(realized events) : ${formatUsd(sumRealized)}`);
  console.log(`  on-chain cash        : ${formatUsd(acct[4])}`);
  console.log(`  on-chain position    : ${unscaled(pos[0])} @ ${formatUsd(pos[1])}`);
  console.log(`  on-chain dayRealized : ${formatUsd(acct[7])}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
