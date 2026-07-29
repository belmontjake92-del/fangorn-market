import { DatabaseSync } from "node:sqlite";
import type { Hex } from "viem";
import type {
  ActivityEvent,
  DataAsset,
  DeploymentConfig,
  FillRecord,
  PositionSnapshot,
  PremiumResource,
  Purchase,
} from "@fangorn-market/shared";
import { SCHEMA_SQL } from "./schema.js";

/** Open (or create) the database and apply the schema. `:memory:` for tests. */
export function openDb(path = ":memory:"): DatabaseSync {
  const db = new DatabaseSync(path);
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
  // Lightweight migration for DBs created before `kind` existed.
  try {
    db.exec("ALTER TABLE deployments ADD COLUMN kind TEXT NOT NULL DEFAULT 'trade'");
  } catch {
    /* column already exists */
  }
  return db;
}

export interface ObservationInput {
  publisher: Hex;
  namespace: string;
  schemaId: string;
  symbol: string;
  marketId: Hex;
  priceScaled: bigint;
  ts: number;
  seq: number;
  source: string;
  commitCid?: string;
}

export interface ObservationRow {
  publisher: Hex;
  namespace: string;
  symbol: string;
  marketId: Hex;
  price: bigint;
  ts: number;
  seq: number;
  source: string;
  commitCid: string | null;
}

const b = (v: bigint): string => v.toString();

/**
 * Typed repository over the SQLite data layer. All monetary/size/price values
 * cross this boundary as `bigint` (1e6 fixed point); TEXT storage is an
 * implementation detail hidden here.
 */
export class Repo {
  constructor(private readonly db: DatabaseSync) {}

  static open(path?: string): Repo {
    return new Repo(openDb(path));
  }

  // ───────────────────────── indexer: grove mirror ─────────────────────────

  /**
   * Record a price observation and roll it up into its Data Asset. Idempotent on
   * (publisher, namespace, symbol, seq). Returns true if newly inserted.
   */
  recordObservation(o: ObservationInput): boolean {
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO observations
         (publisher, namespace, symbol, market_id, price, ts, seq, source, commit_cid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        o.publisher,
        o.namespace,
        o.symbol,
        o.marketId,
        b(o.priceScaled),
        o.ts,
        o.seq,
        o.source,
        o.commitCid ?? null,
      );
    if (res.changes === 0) return false;

    this.db
      .prepare(
        `INSERT INTO data_assets
           (publisher, namespace, schema_id, symbol, record_count, latest_commit, latest_seq, last_updated)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT (publisher, namespace, schema_id) DO UPDATE SET
           record_count = record_count + 1,
           symbol       = COALESCE(data_assets.symbol, excluded.symbol),
           latest_commit = excluded.latest_commit,
           latest_seq    = MAX(COALESCE(data_assets.latest_seq, 0), excluded.latest_seq),
           last_updated  = MAX(data_assets.last_updated, excluded.last_updated)`,
      )
      .run(o.publisher, o.namespace, o.schemaId, o.symbol, o.commitCid ?? null, o.seq, o.ts);
    return true;
  }

  listDataAssets(): DataAsset[] {
    const rows = this.db
      .prepare(
        `SELECT publisher, namespace, schema_id, symbol, record_count, latest_commit, latest_seq, last_updated
         FROM data_assets ORDER BY last_updated DESC`,
      )
      .all() as Record<string, unknown>[];
    return rows.map(rowToDataAsset);
  }

  getDataAsset(publisher: string, namespace: string, schemaId: string): DataAsset | null {
    const row = this.db
      .prepare(
        `SELECT publisher, namespace, schema_id, symbol, record_count, latest_commit, latest_seq, last_updated
         FROM data_assets WHERE publisher = ? AND namespace = ? AND schema_id = ?`,
      )
      .get(publisher, namespace, schemaId) as Record<string, unknown> | undefined;
    return row ? rowToDataAsset(row) : null;
  }

  listObservations(symbol: string, limit = 500): ObservationRow[] {
    const rows = this.db
      .prepare(
        `SELECT publisher, namespace, symbol, market_id, price, ts, seq, source, commit_cid
         FROM observations WHERE symbol = ? ORDER BY seq DESC LIMIT ?`,
      )
      .all(symbol, limit) as Record<string, unknown>[];
    return rows.map(rowToObservation);
  }

  latestObservation(symbol: string): ObservationRow | null {
    const row = this.db
      .prepare(
        `SELECT publisher, namespace, symbol, market_id, price, ts, seq, source, commit_cid
         FROM observations WHERE symbol = ? ORDER BY seq DESC LIMIT 1`,
      )
      .get(symbol) as Record<string, unknown> | undefined;
    return row ? rowToObservation(row) : null;
  }

  // ───────────────────────── deployments & runtime ─────────────────────────

  upsertDeployment(cfg: DeploymentConfig, status = "sandbox", kind = "trade"): void {
    this.db
      .prepare(
        `INSERT INTO deployments
           (id, key, agent_name, owner, operator, opening_cash, max_position_notional,
            daily_loss_limit, market_symbol, market_id, strategy_json, status, kind, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           agent_name = excluded.agent_name,
           opening_cash = excluded.opening_cash,
           max_position_notional = excluded.max_position_notional,
           daily_loss_limit = excluded.daily_loss_limit,
           strategy_json = excluded.strategy_json,
           status = excluded.status,
           kind = excluded.kind`,
      )
      .run(
        cfg.id,
        cfg.key,
        cfg.agentName,
        cfg.owner,
        cfg.operator,
        b(cfg.openingCash),
        b(cfg.limits.maxPositionNotional),
        b(cfg.limits.dailyLossLimit),
        cfg.market.symbol,
        cfg.market.marketId,
        JSON.stringify(cfg.strategy),
        status,
        kind,
        Math.floor(Date.now() / 1000),
      );
  }

  listDeployments(): Record<string, unknown>[] {
    return this.db
      .prepare(`SELECT * FROM deployments ORDER BY created_at DESC`)
      .all() as Record<string, unknown>[];
  }

  getDeployment(id: string): Record<string, unknown> | null {
    return (
      (this.db.prepare(`SELECT * FROM deployments WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined) ?? null
    );
  }

  upsertPosition(p: PositionSnapshot): void {
    this.db
      .prepare(
        `INSERT INTO positions
           (deployment_id, market_id, symbol, size, entry_price, mark_price, unrealized_pnl, notional, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (deployment_id, market_id) DO UPDATE SET
           size = excluded.size, entry_price = excluded.entry_price, mark_price = excluded.mark_price,
           unrealized_pnl = excluded.unrealized_pnl, notional = excluded.notional, updated_at = excluded.updated_at`,
      )
      .run(
        p.deploymentId,
        p.marketId,
        p.symbol,
        b(p.size),
        b(p.entryPrice),
        b(p.markPrice),
        b(p.unrealizedPnl),
        b(p.notional),
        Math.floor(Date.now() / 1000),
      );
  }

  getPositions(deploymentId: string): PositionSnapshot[] {
    const rows = this.db
      .prepare(`SELECT * FROM positions WHERE deployment_id = ?`)
      .all(deploymentId) as Record<string, unknown>[];
    return rows.map(rowToPosition);
  }

  insertFill(f: FillRecord): void {
    this.db
      .prepare(
        `INSERT INTO fills
           (deployment_id, market_id, symbol, size_delta, price, new_size, new_entry_price, realized_pnl, cash_after, tx_hash, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        f.deploymentId,
        f.marketId,
        f.symbol,
        b(f.sizeDelta),
        b(f.price),
        b(f.newSize),
        b(f.newEntryPrice),
        b(f.realizedPnl),
        b(f.cashAfter),
        f.txHash,
        f.ts,
      );
  }

  listFills(deploymentId: string, limit = 200): FillRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM fills WHERE deployment_id = ? ORDER BY id DESC LIMIT ?`)
      .all(deploymentId, limit) as Record<string, unknown>[];
    return rows.map(rowToFill);
  }

  addActivity(ev: ActivityEvent): void {
    this.db
      .prepare(`INSERT INTO activity (ts, kind, deployment_id, message) VALUES (?, ?, ?, ?)`)
      .run(ev.ts, ev.kind, ev.deploymentId ?? null, ev.message);
  }

  listActivity(limit = 100): ActivityEvent[] {
    const rows = this.db
      .prepare(`SELECT ts, kind, deployment_id, message FROM activity ORDER BY id DESC LIMIT ?`)
      .all(limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      ts: Number(r.ts),
      kind: r.kind as ActivityEvent["kind"],
      deploymentId: (r.deployment_id as Hex) ?? undefined,
      message: String(r.message),
    }));
  }

  // ─────────────────────── premium resources & earnings ────────────────────

  upsertResource(r: PremiumResource): void {
    this.db
      .prepare(
        `INSERT INTO resources
           (resource_id, name, owner, price, worker_url, plaintext_hash, symbol, access_mode, create_tx, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (resource_id) DO UPDATE SET
           price = excluded.price, worker_url = excluded.worker_url,
           plaintext_hash = excluded.plaintext_hash, create_tx = excluded.create_tx`,
      )
      .run(
        r.resourceId,
        r.name,
        r.owner,
        b(r.price),
        r.workerUrl,
        r.plaintextHash,
        r.symbol,
        r.accessMode,
        r.createTx,
        r.createdAt,
      );
  }

  getResource(resourceId: string): PremiumResource | null {
    const row = this.db
      .prepare(`SELECT * FROM resources WHERE resource_id = ?`)
      .get(resourceId) as Record<string, unknown> | undefined;
    return row ? rowToResource(row) : null;
  }

  listResources(): PremiumResource[] {
    const rows = this.db
      .prepare(`SELECT * FROM resources ORDER BY created_at DESC`)
      .all() as Record<string, unknown>[];
    return rows.map(rowToResource);
  }

  latestResource(symbol?: string): PremiumResource | null {
    const row = (
      symbol
        ? this.db.prepare(`SELECT * FROM resources WHERE symbol = ? ORDER BY created_at DESC LIMIT 1`).get(symbol)
        : this.db.prepare(`SELECT * FROM resources ORDER BY created_at DESC LIMIT 1`).get()
    ) as Record<string, unknown> | undefined;
    return row ? rowToResource(row) : null;
  }

  insertPurchase(p: Purchase): void {
    this.db
      .prepare(
        `INSERT INTO purchases (resource_id, owner, buyer_stealth, amount, nullifier, deployment_id, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(p.resourceId, p.owner, p.buyerStealth, b(p.amount), p.nullifier, p.deploymentId, p.ts);
  }

  listPurchases(resourceId?: string): Purchase[] {
    const rows = (
      resourceId
        ? this.db.prepare(`SELECT * FROM purchases WHERE resource_id = ? ORDER BY id DESC`).all(resourceId)
        : this.db.prepare(`SELECT * FROM purchases ORDER BY id DESC`).all()
    ) as Record<string, unknown>[];
    return rows.map(rowToPurchase);
  }

  /** Gross earnings (USDC base units) and purchase count for a seller. */
  earningsForOwner(owner: string): { gross: bigint; count: number } {
    const row = this.db
      .prepare(`SELECT COALESCE(SUM(CAST(amount AS INTEGER)), 0) AS gross, COUNT(*) AS count FROM purchases WHERE owner = ?`)
      .get(owner) as { gross: number | bigint; count: number };
    return { gross: BigInt(row.gross ?? 0), count: Number(row.count) };
  }

  // ───────────────────────────── indexer cursor ────────────────────────────

  setState(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO indexer_state (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  getState(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM indexer_state WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }
}

// ─────────────────────────────── row mappers ───────────────────────────────

function rowToDataAsset(r: Record<string, unknown>): DataAsset {
  return {
    publisher: r.publisher as Hex,
    namespace: String(r.namespace),
    schemaId: String(r.schema_id),
    symbol: (r.symbol as string | null) ?? null,
    recordCount: Number(r.record_count),
    latestCommit: String(r.latest_commit ?? ""),
    latestSeq: r.latest_seq === null ? null : Number(r.latest_seq),
    lastUpdated: Number(r.last_updated),
  };
}

function rowToObservation(r: Record<string, unknown>): ObservationRow {
  return {
    publisher: r.publisher as Hex,
    namespace: String(r.namespace),
    symbol: String(r.symbol),
    marketId: r.market_id as Hex,
    price: BigInt(String(r.price)),
    ts: Number(r.ts),
    seq: Number(r.seq),
    source: String(r.source),
    commitCid: (r.commit_cid as string | null) ?? null,
  };
}

function rowToPosition(r: Record<string, unknown>): PositionSnapshot {
  return {
    deploymentId: r.deployment_id as Hex,
    marketId: r.market_id as Hex,
    symbol: String(r.symbol),
    size: BigInt(String(r.size)),
    entryPrice: BigInt(String(r.entry_price)),
    markPrice: BigInt(String(r.mark_price)),
    unrealizedPnl: BigInt(String(r.unrealized_pnl)),
    notional: BigInt(String(r.notional)),
  };
}

function rowToResource(r: Record<string, unknown>): PremiumResource {
  return {
    resourceId: r.resource_id as Hex,
    name: String(r.name),
    owner: r.owner as Hex,
    price: BigInt(String(r.price)),
    workerUrl: String(r.worker_url),
    plaintextHash: r.plaintext_hash as Hex,
    symbol: (r.symbol as string | null) ?? null,
    accessMode: String(r.access_mode),
    createTx: (r.create_tx as Hex | null) ?? null,
    createdAt: Number(r.created_at),
  };
}

function rowToPurchase(r: Record<string, unknown>): Purchase {
  return {
    resourceId: r.resource_id as Hex,
    owner: r.owner as Hex,
    buyerStealth: (r.buyer_stealth as Hex | null) ?? null,
    amount: BigInt(String(r.amount)),
    nullifier: (r.nullifier as string | null) ?? null,
    deploymentId: (r.deployment_id as Hex | null) ?? null,
    ts: Number(r.ts),
  };
}

function rowToFill(r: Record<string, unknown>): FillRecord {
  return {
    deploymentId: r.deployment_id as Hex,
    marketId: r.market_id as Hex,
    symbol: String(r.symbol),
    sizeDelta: BigInt(String(r.size_delta)),
    price: BigInt(String(r.price)),
    newSize: BigInt(String(r.new_size)),
    newEntryPrice: BigInt(String(r.new_entry_price)),
    realizedPnl: BigInt(String(r.realized_pnl)),
    cashAfter: BigInt(String(r.cash_after)),
    txHash: r.tx_hash as Hex,
    ts: Number(r.ts),
  };
}
