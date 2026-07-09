/**
 * @module @cambridge-tcg/db
 *
 * Shared database connection factory for the Cambridge-TCG monorepo.
 *
 * Both apps (wholesale, storefront) and all packages consume their DB
 * connection through this module. No app-local Pool or client creation.
 *
 * Usage (Drizzle query builder — wholesale, stock package):
 *
 *   import { createDb } from "@cambridge-tcg/db";
 *   import * as schema from "./schema";
 *   export const { db } = createDb({ schema });
 *
 * Usage (raw SQL compatibility — storefront migration path):
 *
 *   import { createDb } from "@cambridge-tcg/db";
 *   const { client } = createDb();
 *   const rows = await client.unsafe("SELECT * FROM users WHERE id = $1", [id]);
 *
 * The `client` is the raw postgres.js client. Use `client.unsafe(sql, params)`
 * for positional-parameter queries (drop-in for pg's pool.query pattern).
 * Use `client.begin(tx => ...)` for transactions.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// ── Re-exports ──────────────────────────────────────────────────────────

export { sql } from "drizzle-orm";
export type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Any Drizzle client that can execute queries — root db instance or a
 * transaction. This is what packages/stock and other shared packages accept.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = PostgresJsDatabase<any>;

// ── Factory ─────────────────────────────────────────────────────────────

export interface CreateDbOptions {
  /** Connection string. Defaults to process.env.DATABASE_URL. */
  url?: string;

  /**
   * Max connections in the pool. When omitted, resolves from `DB_POOL_MAX`
   * or the per-env default (1 in production for Vercel serverless, 10
   * elsewhere so a stray nested query can't wedge the whole dev site).
   */
  max?: number;

  /**
   * SSL mode. Defaults to "require" for RDS.
   * Set to false for local development without SSL.
   */
  ssl?: boolean | "require" | "prefer" | "allow";

  /**
   * Drizzle schema object. Pass this to enable `db.query.*` relational
   * queries. Omit for raw-SQL-only usage.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema?: Record<string, any>;
}

export interface DbInstance<T extends Record<string, unknown> = Record<string, never>> {
  /**
   * Drizzle ORM instance. Use for query builder, relational queries,
   * transactions, and `db.execute(sql`...`)`.
   */
  db: PostgresJsDatabase<T>;

  /**
   * Raw postgres.js client. Use `client.unsafe(sql, params)` for
   * positional-parameter queries, `client.begin(tx => ...)` for
   * transactions, or tagged templates for new code.
   */
  client: postgres.Sql;

  /** Gracefully close all connections. Call on process shutdown. */
  close: () => Promise<void>;
}

/**
 * Create a database connection.
 *
 * Each app should call this exactly once at module scope and export the
 * result. The underlying postgres.js client manages its own connection
 * pool — no per-query Pool creation needed.
 */
export function createDb<T extends Record<string, unknown> = Record<string, never>>(
  opts?: CreateDbOptions,
): DbInstance<T> {
  const url = opts?.url ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "@cambridge-tcg/db: DATABASE_URL environment variable is required " +
      "(or pass `url` in options)",
    );
  }

  const client = postgres(url, {
    max: resolvePoolMax(opts?.max),
    ssl: opts?.ssl ?? "require",
    // Reclaim idle connections. In dev, Turbopack HMR re-evaluates this
    // module on edits and creates a fresh pool WITHOUT closing the old
    // one; with no idle timeout those orphaned pools pin connections open
    // until the server restarts and can exhaust Postgres' max_connections
    // (especially with several agents sharing one local DB). An idle
    // timeout lets orphaned + normal connections return to the server.
    // Default 0 in production (keep the warm serverless connection);
    // env-overridable via DB_IDLE_TIMEOUT_S.
    ...(resolveIdleTimeoutSeconds() > 0 ? { idle_timeout: resolveIdleTimeoutSeconds() } : {}),
    // Per-connection guardrails. A single stuck query — or an accidental
    // nested-pool acquisition inside a transaction — must never hang a
    // request (and, at max:1, the whole process) forever. Both are set as
    // startup GUCs (postgres.js sends every `connection` entry in the
    // startup packet) and are env-overridable in every environment.
    connection: buildConnectionParams(),
  });

  const db = drizzle(client, opts?.schema ? { schema: opts.schema } : {});

  return {
    db: db as PostgresJsDatabase<T>,
    client,
    close: () => client.end(),
  };
}

/**
 * Resolve the pool size.
 *
 * Vercel serverless historically pinned this to 1 (one connection per
 * lambda so a burst of concurrent lambdas can't exhaust RDS). The cost:
 * a single connection turns any accidental root-pool `query()` awaited
 * *inside* a `transaction()` into a self-deadlock that also strangles
 * every other request in the process — the crossing-order fill deadlock
 * the persona walkers proved. The correct fix is to never nest a pooled
 * read inside a held transaction, but a size above 1 in development means
 * one such mistake degrades one request instead of wedging the whole
 * site. Precedence: explicit option → `DB_POOL_MAX` env → env default
 * (1 in production, 10 elsewhere).
 */
function resolvePoolMax(explicit?: number): number {
  if (explicit != null) return explicit;
  const fromEnv = Number(process.env.DB_POOL_MAX);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
  // Dev keeps this small on purpose: it only needs to be >1 so one
  // accidental nested query can't self-deadlock the process, while
  // staying low enough that HMR-orphaned pools (see idle_timeout) don't
  // exhaust a shared local Postgres. Production stays at 1 (serverless).
  return process.env.NODE_ENV === "production" ? 1 : 3;
}

/**
 * Idle-connection timeout in seconds. 0 disables (persistent connection).
 * Env override: DB_IDLE_TIMEOUT_S. Dev defaults to a short timeout so
 * orphaned HMR pools release their connections; production defaults to 0.
 */
function resolveIdleTimeoutSeconds(): number {
  const fromEnv = Number(process.env.DB_IDLE_TIMEOUT_S);
  if (Number.isFinite(fromEnv) && fromEnv >= 0 && process.env.DB_IDLE_TIMEOUT_S != null) {
    return Math.floor(fromEnv);
  }
  return process.env.NODE_ENV === "production" ? 0 : 20;
}

/**
 * Startup GUCs applied to every connection so a stuck statement or a
 * stalled-open transaction self-heals instead of silently starving the
 * pool. Values are milliseconds; `"0"` disables a timeout (Postgres
 * semantics). Both are env-overridable so a legitimately long analytics
 * query can raise (or disable) the bound without a code change.
 */
function buildConnectionParams(): Record<string, string> {
  const params: Record<string, string> = {};
  const statementTimeout = (process.env.DB_STATEMENT_TIMEOUT_MS ?? "30000").trim();
  if (statementTimeout && statementTimeout !== "0") {
    params.statement_timeout = statementTimeout;
  }
  const idleInTxTimeout = (process.env.DB_IDLE_IN_TX_TIMEOUT_MS ?? "15000").trim();
  if (idleInTxTimeout && idleInTxTimeout !== "0") {
    params.idle_in_transaction_session_timeout = idleInTxTimeout;
  }
  return params;
}
