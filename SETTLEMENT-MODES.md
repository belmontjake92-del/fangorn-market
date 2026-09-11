# Two settlement modes - deployed on both chains

Fangorn Market's paid/encrypted-data layer runs on **both** chains. Users choose
by which network they operate on; the pay-to-decrypt behavior is identical, only
the privacy guarantee differs.

| | Robinhood Chain (46630) | Arbitrum Sepolia (421614) |
|---|---|---|
| Mode | **Direct** | **Stealth** |
| Privacy | Public buyer address is settled | Unlinkable stealth address (Semaphore ZK) |
| Contracts | `PaidAccessRegistry` + `MockUSDC` (ours) | x402f `SettlementRegistry` (Stylus) + USDC |
| Access worker | our `rh-access-worker` | Fangorn's hosted worker |
| Buyer gas | none (relayer submits `pay`) | none (facilitator relays) |
| Client | `x402pay/rh.ts` (`payAndFetchRH`) | `x402pay` (`payAndFetch`, facilitator) |

Both are live and verified end-to-end (a buyer paid USDC and decrypted on each).

## Run either
- **Robinhood (direct):** `rh-access-worker` + `api` (`DATABASE_PATH=.data/robinhoodTestnet.db`) + `web` (`VITE_NETWORK_LABEL="Robinhood Chain · 46630"`). Demo: `x402:rh`.
- **Arbitrum (stealth):** `facilitator-runner` + `api` (`.data/sepolia.db`) + `web`. Demo: `publish:premium` then `buy:premium`.

The wallet supports both chains; the app's **Settings → Paid-data mode** shows which is active.

Full x402f stealth on Robinhood Chain is possible later (Stylus is enabled there,
v3) - deploy the native Stylus `SettlementRegistry` or add a Solidity Semaphore
verifier. The direct mode is the pragmatic, RH-native default.
