/**
 * @module @cambridge-tcg/db/compat
 *
 * Compatibility layer for migrating from node-postgres (pg) to postgres.js.
 *
 * The storefront app uses `pool.query(sql, params)` returning `{ rows, rowCount }`.
 * This module provides a drop-in `query()` function with the same signature,
 * backed by a persistent postgres.js connection instead of per-query Pool creation.
 *
 * Usage:
 *
 *   import { createCompatDb } from "@cambridge-tcg/db/compat";
 *   const { query, transaction, close } = createCompatDb();
 *
 *   // Drop-in for the old `query(sql, params)` pattern:
 *   const result = await query("SELECT * FROM users WHERE id = $1", [id]);
 *   console.log(result.rows);
 *
 *   // Drop-in for the old BEGIN/COMMIT pattern:
 *   const result = await transaction(async (txQuery) => {
 *     const user = await txQuery("SELECT * FROM users WHERE id = $1 FOR UPDATE", [id]);
 *     await txQuery("UPDATE users SET name = $1 WHERE id = $2", [name, id]);
 *     return user.rows[0];
 *   });
 *
 * Migration path:
 *   1. Replace `import { query } from "@/lib/db"` with the compat layer
 *   2. Replace manual `new pg.Pool()` transaction blocks with `transaction()`
 *   3. Gradually convert to Drizzle query builder (future)
 */

import type postgres from "postgres";
import { createDb, type CreateDbOptions } from "./index";

// ── Types ───────────────────────────────────────────────────────────────

/** Matches pg's QueryResult shape — what storefront code expects. */
export interface CompatQueryResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
  rowCount: number;
}

/** A query function with the same signature as pg's pool.query. */
export type CompatQueryFn = (
  sql: string,
  params?: unknown[],
) => Promise<CompatQueryResult>;

export interface CompatDbInstance {
  /**
   * Execute a query using positional parameters ($1, $2, ...).
   * Returns { rows, rowCount } matching pg's interface.
   */
  query: CompatQueryFn;

  /**
   * Execute a function within a transaction. The callback receives a
   * `txQuery` function with the same signature as `query`.
   *
   * BEGIN/COMMIT/ROLLBACK are handled automatically.
   */
  transaction: <T>(fn: (txQuery: CompatQueryFn) => Promise<T>) => Promise<T>;

  /** The underlying postgres.js client, for escape hatches. */
  client: postgres.Sql;

  /** The Drizzle db instance, for gradual migration to query builder. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;

  /** Gracefully close all connections. */
  close: () => Promise<void>;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Convert a postgres.js RowList to pg-compatible { rows, rowCount }.
 */
function toCompatResult(rows: postgres.RowList<postgres.Row[]>): CompatQueryResult {
  return {
    rows: Array.from(rows),
    rowCount: rows.count ?? rows.length,
  };
}

/**
 * Create a compat query function from any postgres.js sql-callable
 * (the root client or a transaction handle).
 */
function makeQueryFn(sql: postgres.Sql | postgres.TransactionSql): CompatQueryFn {
  return async (sqlStr: string, params: unknown[] = []) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await sql.unsafe(sqlStr, params as any[]);
    return toCompatResult(rows);
  };
}

// ── Factory ─────────────────────────────────────────────────────────────

/**
 * Create a pg-compatible database interface backed by postgres.js.
 *
 * This is a transitional layer. Each app should call this once at module
 * scope. The persistent connection pool eliminates the per-query Pool
 * creation anti-pattern.
 */
export function createCompatDb(opts?: CreateDbOptions): CompatDbInstance {
  const { db, client, close } = createDb(opts);

  const query = makeQueryFn(client);

  async function transaction<T>(
    fn: (txQuery: CompatQueryFn) => Promise<T>,
  ): Promise<T> {
    // postgres.js begin() wraps the return in UnwrapPromiseArray, but
    // we know our callback returns T directly. The cast is safe.
    return client.begin(async (tx) => {
      const txQuery = makeQueryFn(tx);
      return fn(txQuery);
    }) as Promise<T>;
  }

  return { query, transaction, client, db, close };
}
