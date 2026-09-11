# Phase 1 - Go Live (Arbitrum Sepolia)

Everything below is built and locally proven. These steps run the **real** tracer
bullet on-chain once your secrets are in place. Nothing here needs code changes.

## 0. Secrets

Create `.env` (git-ignored) from `.env.example` and fill:

```
FANGORN_PRIVATE_KEY=0x...            # your funded Arbitrum Sepolia wallet
ARBITRUM_SEPOLIA_RPC_URL=https://... # dedicated Alchemy/Infura endpoint recommended
PINATA_JWT=...
PINATA_GATEWAY=...                   # e.g. your-gw.mypinata.cloud
```

The wallet needs a little Sepolia ETH: it registers as a Grove publisher (fee 0,
just gas), deploys two contracts, and sends the oracle/fill transactions.

## 1. Deploy the contracts

```bash
pnpm --filter @fangorn-market/contracts deploy:sepolia
```

Writes `deployments/arbitrumSepolia.json` (PriceOracle + SettlementLedger
addresses) which every other package reads.

## 2. Publish the seed dataset to The Grove

```bash
pnpm --filter @fangorn-market/agent-runtime seed:grove
```

Creates the `market-prices` namespace and commits 40 price observations to
IPFS + the DataRegistry. Prints the commit CID - that namespace is now a live
Data Asset.

## 3. Run the tracer bullet

```bash
pnpm --filter @fangorn-market/agent-runtime go-live
```

Backfills the Grove dataset into the DB, opens a deployment on the
SettlementLedger, relays each Grove price to the on-chain PriceOracle, and lets
the deterministic agent settle simulated fills - then prints the final
position/PnL read back from chain.

## 4. Serve it

```bash
DATABASE_PATH=.data/sepolia.db pnpm --filter @fangorn-market/api start
# GET http://localhost:4000/api/data-assets, /api/deployments, /api/activity, ...
```

## Try it locally first (no secrets)

The identical spine runs against a local Hardhat node:

```bash
# terminal 1
cd contracts && npx hardhat node
# terminal 2
cd contracts && npx hardhat run scripts/deploy.ts --network localhost
pnpm --filter @fangorn-market/agent-runtime e2e:local
```

Amounts everywhere are 1e6 fixed-point integers (USDC-6 / price / size).
