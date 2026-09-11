# Fangorn Market

The open marketplace, creation studio, optimization layer, and shared
intelligence graph ("The Grove") for autonomous financial agents - built on the
[Fangorn protocol](https://github.com/fangorn-network/fangorn) and targeting
Robinhood Chain (Arbitrum Sepolia today).

This is the **backend + real onchain integration** for the Fangorn Market
prototype. It consumes the three upstream Fangorn repos as published npm
packages:

| Upstream repo | npm package | Role here |
| --- | --- | --- |
| `fangorn` | `@fangorn-network/sdk` | **The Grove** - versioned graph, IPFS + Arbitrum Sepolia (`commit`/`push`/`subscribe`/`inspectNamespace`) |
| `x402f` | `@fangorn-network/fetch`, `@fangorn-network/facilitator` | Pay-gated / encrypted data access (x402 + Semaphore ZK) |
| `agent` | `@fangorn-network/agent`, `-agent-tools`, `-agent-types` | Agent runtime - LangChain "toolbay" plugin system |

> Read-only clones of the three repos live in `_repos/` (git-ignored) purely as
> a source-of-truth reference. Nothing is built from them; all three are pulled
> from npm.

## Layout

```
apps/
  web/              # React/Next rebuild of the prototype (frontend)          [later]
  api/              # Express API gateway + Grove indexer                      [Phase 1+]
services/
  agent-runtime/    # deterministic strategy scheduler over the toolbay        [Phase 1+]
  facilitator/      # x402f facilitator (run/config)                           [Phase 2]
packages/
  grove/            # thin wrapper over @fangorn-network/sdk                    [Phase 0 ✓]
  trading/          # simulated-fill engine + risk gate                        [Phase 1]
  shared/           # shared types                                             [Phase 1]
contracts/          # Solidity: PriceOracle + SettlementLedger + deploy        [Phase 1]
db/                 # Postgres schema + migrations                             [Phase 1]
```

## Prerequisites

- Node.js >= 20.19 (24.x tested)
- pnpm 10.4.0 - `corepack pnpm@10.4.0` or `npm i -g pnpm@10.4.0`

## Setup

```bash
pnpm install
cp .env.example .env   # Phase 0 needs nothing filled in
```

## Roadmap

- **Phase 0 - Scaffold ✓** - monorepo, npm deps, read-only Arbitrum Sepolia
  connectivity to the Fangorn DataRegistry.
- **Phase 1 - Tracer bullet ✓ (built + locally proven; live run awaits secrets)**
  - publisher commits a dataset to a Grove namespace → indexer surfaces it as a
  Data Asset → deterministic agent decides and submits a simulated fill settled
  onchain → position and PnL read back from chain. Contracts, trading engine,
  data layer, Grove indexer, agent-runtime, and API are done and tested (43
  unit tests + a full local integration run). See [GO-LIVE.md](GO-LIVE.md) to
  run it on Arbitrum Sepolia.
- **Phase 2 - Paid data** - x402f facilitator; agents pay for gated fields.
- **Phase 3 - Breadth** - marketplace, agent detail, deploy wizard, dashboards
  (React frontend).
- **Phase 4 (deferred)** - LLM reasoning + Studio natural-language builder.

## Verify locally (no secrets)

```bash
pnpm install
pnpm check:sepolia                                   # read-only Grove connectivity
pnpm -r test                                         # 43 unit tests
# full spine on a local Hardhat chain:
cd contracts && npx hardhat node                     # terminal 1
cd contracts && npx hardhat run scripts/deploy.ts --network localhost   # terminal 2
pnpm --filter @fangorn-market/agent-runtime e2e:local
```

## Phase 0 - verify connectivity

Runs read-only with a throwaway key; no secrets required.

```bash
pnpm check:sepolia
```

Expected: live `currentBlock` / `publisherCount` / `admin` reads from the
DataRegistry at `0x9a3811b365a4aeea1626eaad185b273424ae5e48`.
