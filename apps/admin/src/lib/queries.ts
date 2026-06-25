/**
 * Shared query helpers for admin pages.
 *
 * The admin app reads from two databases it doesn't own (storefront +
 * wholesale). Schemas can drift, tables can be missing in dev, and we'd
 * rather render the page with placeholders than crash. Helpers here
 * encode that tolerance once.
 *
 * Usage patterns:
 *
 *   // Optional read — if the table is missing or query fails, render "—"
 *   const count = await safeCount(sfQuery, `SELECT count(*) FROM x`);
 *
 *   // Optional read with a fallback value
 *   const rows = await safe(() => sfQuery<T>(`SELECT ... FROM x`), { rows: [] });
 *
 *   // Required read — let it throw, the page errors out
 *   const r = await sfQuery<T>(`SELECT ... FROM essential`);
 *
 *   // Probe a table before issuing a query
 *   if (await tableExists(sfQuery, "market_trades")) { ... }
 */

import type { sfQuery, wsQuery } from "./db";

type QueryFn = typeof sfQuery | typeof wsQuery;

/** Sentinel "data unavailable" marker — render as "—". */
export const UNAVAILABLE = -1;

/**
 * Run an async fn, return `fallback` if it throws.
 * Does not log — DB errors on optional reads are expected (schema drift,
 * dev DB missing tables). For required reads, just call sfQuery directly.
 */
export async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Count helper — runs `SELECT count(*)::int AS n FROM ...` and parses.
 * Returns UNAVAILABLE (-1) on failure. The page should render `—` for -1.
 */
export async function safeCount(query: QueryFn, sql: string, params: unknown[] = []): Promise<number> {
  try {
    const r = await query<{ n: number | string }>(sql, params);
    const v = r.rows[0]?.n;
    if (v == null) return 0;
    const n = typeof v === "number" ? v : parseInt(v, 10);
    return Number.isFinite(n) ? n : UNAVAILABLE;
  } catch {
    return UNAVAILABLE;
  }
}

/**
 * Probe whether a table exists in the public schema.
 * Useful before queries against tables that may not be deployed yet
 * (e.g. market_trades when the P2P market is still being built).
 */
export async function tableExists(query: QueryFn, table: string): Promise<boolean> {
  try {
    const r = await query<{ exists: boolean }>(
      `SELECT to_regclass($1) IS NOT NULL AS exists`,
      [`public.${table}`],
    );
    return Boolean(r.rows[0]?.exists);
  } catch (err) {
    console.warn(`[queries] tableExists check failed for ${table}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/** True if a count came back as the unavailable marker. */
export function isUnavailable(n: number): boolean {
  return n === UNAVAILABLE;
}
