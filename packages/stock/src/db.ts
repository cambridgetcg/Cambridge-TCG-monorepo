/**
 * @module @cambridge-tcg/stock/db
 *
 * Database type abstraction. The stock package doesn't create its own
 * database connection — the consuming app passes one in.
 *
 * Re-exports DbClient from @cambridge-tcg/db so there's a single source
 * of truth for the database client type across the monorepo.
 */

export type { DbClient } from "@cambridge-tcg/db";
