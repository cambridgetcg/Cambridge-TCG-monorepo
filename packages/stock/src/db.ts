/**
 * @module @cambridge-tcg/stock/db
 *
 * Database type abstraction. The stock package doesn't create its own
 * database connection — the consuming app passes one in.
 *
 * This supports both the full Drizzle db instance and a transaction.
 * Both expose .select(), .insert(), .update(), .delete(), .execute().
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Any Drizzle client that can execute queries — either the root db
 * instance or a transaction. This is the type stock operations accept.
 *
 * Uses `any` for the schema generic to accept both schema-typed and
 * untyped Drizzle clients. The consuming app's `db.transaction()` produces
 * a PgTransaction with the app's full schema type — that must be assignable here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = PostgresJsDatabase<any>;
