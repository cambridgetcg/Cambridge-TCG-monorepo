/**
 * Dual-database connections for the admin dashboard.
 *
 * The admin app needs visibility into both products:
 *   - storefront: consumer platform (users, orders, auctions, market, trust, …)
 *   - wholesale: B2B platform (stock, procurement, clients, channels, pricing, …)
 *
 * Both are isolated Postgres instances — no shared tables, no foreign keys
 * across apps. The admin dashboard is the only place that queries both.
 *
 * Environment variables:
 *   STOREFRONT_DATABASE_URL  — storefront RDS connection string
 *   WHOLESALE_DATABASE_URL   — wholesale RDS connection string
 *
 * For local development you can alias your existing DATABASE_URL:
 *   STOREFRONT_DATABASE_URL=$DATABASE_URL
 *   WHOLESALE_DATABASE_URL=$WHOLESALE_DATABASE_URL
 */

import { createDb } from "@cambridge-tcg/db";

// ── Storefront DB ────────────────────────────────────────────────────────
// Used for: users/sessions (auth), orders, auctions, trade-ins, market,
//           trust, bounty, chargebacks, payouts, rewards, membership, KYC.
let _storefrontDb: ReturnType<typeof createDb> | null = null;

export function storefrontDb() {
  if (!_storefrontDb) {
    _storefrontDb = createDb({
      url: process.env.STOREFRONT_DATABASE_URL,
    });
  }
  return _storefrontDb;
}

/** Raw SQL helper — storefront. Drop-in for pg's pool.query pattern. */
export async function sfQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[] }> {
  const { client } = storefrontDb();
  const result = await client.unsafe(sql, params as never[]);
  return { rows: result as unknown as T[] };
}

// ── Wholesale DB ─────────────────────────────────────────────────────────
// Used for: stock ledger, B2B orders, procurement, clients, channels,
//           pricing, Shopify/eBay sync.
let _wholesaleDb: ReturnType<typeof createDb> | null = null;

export function wholesaleDb() {
  if (!_wholesaleDb) {
    _wholesaleDb = createDb({
      url: process.env.WHOLESALE_DATABASE_URL,
    });
  }
  return _wholesaleDb;
}

/** Raw SQL helper — wholesale. */
export async function wsQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[] }> {
  const { client } = wholesaleDb();
  const result = await client.unsafe(sql, params as never[]);
  return { rows: result as unknown as T[] };
}
