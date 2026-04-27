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

  /** Max connections in the pool. Defaults to 1 (Vercel serverless). */
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
    max: opts?.max ?? 1,
    ssl: opts?.ssl ?? "require",
  });

  const db = drizzle(client, opts?.schema ? { schema: opts.schema } : {});

  return {
    db: db as PostgresJsDatabase<T>,
    client,
    close: () => client.end(),
  };
}
