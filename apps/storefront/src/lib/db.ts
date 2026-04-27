/**
 * Shared database query helper.
 *
 * Backed by a persistent postgres.js connection via @cambridge-tcg/db.
 * This replaces the old per-query pg.Pool creation pattern — every call
 * now reuses the same connection pool instead of opening a new TCP+TLS
 * handshake to RDS.
 *
 * The `query(sql, params)` interface is unchanged from the old pg-based
 * version — existing call sites don't need modification.
 */

import { createCompatDb } from "@cambridge-tcg/db/compat";

const { query, transaction, db, close } = createCompatDb();

export { query, transaction, db, close };
