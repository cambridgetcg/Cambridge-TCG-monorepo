/**
 * CardRush scraper — *adapter* over the protocol-aligned scraper.
 *
 * The canonical implementation now lives at `packages/data-ingest/src/cardrush/`
 * (kingdom-060, the source-protocol). This file remains as a thin adapter so
 * existing wholesale callers (`apps/wholesale/src/lib/price-snapshot.ts`)
 * don't need to change in this commit. The eventual goal is for
 * `price-snapshot.ts` to call `scrapeCardRush()` directly from
 * `@cambridge-tcg/data-ingest/cardrush`; this adapter is the migration path.
 *
 * See `docs/connections/the-consolidation.md` for the migration record.
 */

import { cardrush, scrapeCardRush as packageScrape } from "@cambridge-tcg/data-ingest/cardrush";

export interface ScraperResult {
  priceJpy: number | null;
  source: "a-minus" | "base" | null;
  /**
   * Reason a scrape returned `priceJpy: null`. Surfaced by the protocol
   * (`packages/data-ingest/src/cardrush/`) so the wholesale snapshot
   * pipeline can record *why* a failure happened instead of just counting
   * `cardsFailed++`. See `docs/connections/the-archive.md` Part B §1 for
   * the leakage this closes.
   *
   *   "http_404"               — page doesn't exist
   *   "http_<NNN>"             — other non-2xx response
   *   "fetch_error: <msg>"     — network / DNS / TLS / timeout
   *   "no_price_in_html"       — page loaded but no ¥ found
   *   "subdomain_unknown"      — URL doesn't match a known subdomain
   *   "subdomain_unconfirmed"  — speculative subdomain; first row to confirm
   */
  errorReason?: string;
  /** Inferred game from the URL subdomain, when matched. */
  inferredGame?: string | null;
}

/**
 * Adapter — wraps `packages/data-ingest/cardrush`'s `scrapeCardRush()` and
 * unwraps the `RawRow<CardRushRaw>` to the legacy `ScraperResult` shape.
 * The `errorReason` + `inferredGame` fields are additions; existing callers
 * ignore them; new code can use them for substrate-honest reporting.
 */
export async function scrapeCardrushPrice(url: string): Promise<ScraperResult> {
  const row = await packageScrape(url);
  return {
    priceJpy: row.raw.price_jpy,
    source: row.raw.source,
    errorReason: row.raw.error_reason,
    inferredGame: row.raw.inferred_game,
  };
}

/**
 * Decode a CardRush product ID from a SKU suffix.
 * product_id = CONSTANT - parseInt(suffix, 36)
 *
 * Kept here (not in the package) because it's wholesale-internal SKU
 * obfuscation, not part of the upstream protocol.
 */
export const CARDRUSH_CONSTANTS = [
  1495215, 1495247, 1495727, 1495759,
  52116975, 52117007, 52117487, 52117519,
] as const;

export function decodeProductId(skuSuffix: string): number | null {
  const suffix36 = parseInt(skuSuffix, 36);
  if (isNaN(suffix36)) return null;

  for (const c of CARDRUSH_CONSTANTS) {
    const id = c - suffix36;
    if (id > 0) return id;
  }
  return null;
}

// Re-export the SourceModule for callers that want the typed contract.
export { cardrush };
