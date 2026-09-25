# Settlement modes for paid data

Fangorn Market's paid, encrypted data runs on both chains. The pay-to-decrypt
behavior is identical everywhere; what differs is the privacy guarantee.

| | Robinhood Direct | Robinhood Stealth | Arbitrum Stealth |
|---|---|---|---|
| Chain | Robinhood testnet (46630) | Robinhood testnet (46630) | Arbitrum Sepolia (421614) |
| How access is proven | Buyer signs with their wallet | Semaphore zero-knowledge proof of membership | Semaphore via x402f |
| What the access worker learns | The buyer's address | Only that some paying member is asking | Only that some paying member is asking |
| Contracts | `PaidAccessRegistry` + `MockUSDC` | `StealthAccessRegistry` + Semaphore V4 + `MockUSDC` | x402f `SettlementRegistry` + USDC |
| Access worker | `rh-access-worker` `/access` | `rh-access-worker` `/access-stealth` | Fangorn's hosted worker |
| Buyer gas | None (relayed) | None (relayed) | None (facilitator) |
| Client | `payAndFetchRH` | `payAndFetchStealth` | `payAndFetch` |
| Demo | `x402:rh` | `x402:rh:stealth` | `publish:premium` then `buy:premium` |

All three are live and verified end to end.

## How Robinhood Stealth works
1. Each resource owns a Semaphore group, administered by `StealthAccessRegistry`.
2. Paying (a gasless EIP-3009 USDC authorization, relayed) adds the buyer's
   Semaphore identity commitment to that group.
3. To decrypt, the buyer generates a zero-knowledge proof of membership, scoped to
   the resource and stamped with the current time.
4. The access worker checks the proof on-chain through `verifyAccess` and only then
   releases the decryption key. It never learns which member is decrypting.

Joining a group (the payment) is public. Access is anonymous within the group,
and gets stronger the more buyers a resource has. This is the same model x402f
uses on Arbitrum.

## Robinhood testnet addresses
See `deployments/robinhoodTestnet.json`: `semaphore`, `semaphoreVerifier`,
`poseidonT3` (canonical address), and `stealthAccessRegistry`.

## Run
- Worker: `RH_PAID_REGISTRY=... RH_STEALTH_REGISTRY=... pnpm --filter @fangorn-market/rh-access-worker start`
- Deploy: `pnpm --filter @fangorn-market/contracts deploy:stealth:robinhood`
