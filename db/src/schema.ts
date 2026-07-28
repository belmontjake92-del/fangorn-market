/**
 * Schema for the Fangorn Market data layer.
 *
 * Two concerns share one store:
 *  - the Grove indexer mirror (data_assets, observations, indexer_state), a fast
 *    read model over what the on-chain/Grove source of truth already contains;
 *  - marketplace/runtime state (agents, deployments, positions, fills, activity).
 *
 * Monetary/price/size values are 1e6 fixed-point bigints stored as TEXT to keep
 * full precision and stay portable to Postgres NUMERIC later. Standard SQL only.
 */
export const SCHEMA_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS data_assets (
  publisher     TEXT NOT NULL,
  namespace     TEXT NOT NULL,
  schema_id     TEXT NOT NULL,
  symbol        TEXT,
  record_count  INTEGER NOT NULL DEFAULT 0,
  latest_commit TEXT,
  latest_seq    INTEGER,
  last_updated  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (publisher, namespace, schema_id)
);

CREATE TABLE IF NOT EXISTS observations (
  publisher   TEXT NOT NULL,
  namespace   TEXT NOT NULL,
  symbol      TEXT NOT NULL,
  market_id   TEXT NOT NULL,
  price       TEXT NOT NULL,       -- 1e6 fixed point, decimal string
  ts          INTEGER NOT NULL,    -- unix seconds
  seq         INTEGER NOT NULL,    -- monotonic per market
  source      TEXT NOT NULL,
  commit_cid  TEXT,
  PRIMARY KEY (publisher, namespace, symbol, seq)
);
CREATE INDEX IF NOT EXISTS idx_observations_symbol_seq ON observations (symbol, seq);

CREATE TABLE IF NOT EXISTS agents (
  name        TEXT PRIMARY KEY,
  builder     TEXT,
  category    TEXT,
  summary     TEXT,
  created_at  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS deployments (
  id                    TEXT PRIMARY KEY,   -- bytes32
  key                   TEXT NOT NULL,
  agent_name            TEXT,
  owner                 TEXT NOT NULL,
  operator              TEXT NOT NULL,
  opening_cash          TEXT NOT NULL,      -- USDC-6 string
  max_position_notional TEXT NOT NULL,
  daily_loss_limit      TEXT NOT NULL,
  market_symbol         TEXT NOT NULL,
  market_id             TEXT NOT NULL,
  strategy_json         TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'sandbox',
  created_at            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS positions (
  deployment_id  TEXT NOT NULL,
  market_id      TEXT NOT NULL,
  symbol         TEXT NOT NULL,
  size           TEXT NOT NULL,   -- signed 1e6 string
  entry_price    TEXT NOT NULL,
  mark_price     TEXT NOT NULL,
  unrealized_pnl TEXT NOT NULL,
  notional       TEXT NOT NULL,
  updated_at     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (deployment_id, market_id)
);

CREATE TABLE IF NOT EXISTS fills (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_id   TEXT NOT NULL,
  market_id       TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  size_delta      TEXT NOT NULL,
  price           TEXT NOT NULL,
  new_size        TEXT NOT NULL,
  new_entry_price TEXT NOT NULL,
  realized_pnl    TEXT NOT NULL,
  cash_after      TEXT NOT NULL,
  tx_hash         TEXT,
  ts              INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fills_deployment ON fills (deployment_id, id);

CREATE TABLE IF NOT EXISTS activity (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             INTEGER NOT NULL,
  kind           TEXT NOT NULL,
  deployment_id  TEXT,
  message        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity (id DESC);

CREATE TABLE IF NOT EXISTS indexer_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- x402f paid/encrypted resources (Phase 2). A Data Asset with gated fields.
CREATE TABLE IF NOT EXISTS resources (
  resource_id    TEXT PRIMARY KEY,   -- bytes32
  name           TEXT NOT NULL,
  owner          TEXT NOT NULL,
  price          TEXT NOT NULL,       -- USDC base units (6dp) as string
  worker_url     TEXT NOT NULL,
  plaintext_hash TEXT NOT NULL,
  symbol         TEXT,
  access_mode    TEXT NOT NULL DEFAULT 'monetized',
  create_tx      TEXT,
  created_at     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id   TEXT NOT NULL,
  owner         TEXT NOT NULL,       -- seller who earns
  buyer_stealth TEXT,                -- unlinkable stealth address
  amount        TEXT NOT NULL,       -- USDC base units
  nullifier     TEXT,
  deployment_id TEXT,
  ts            INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchases_owner ON purchases (owner, id);
`;
