/**
 * TCGCollector discovery — sitemap walk + product URL extraction.
 *
 * TCGCollector publishes a public sitemap-index at
 * `https://www.tcgcollector.com/sitemap.xml`. The index points at
 * per-category sitemaps (cards, sets, products, articles); each
 * per-category sitemap is a flat list of `<loc>` URLs.
 *
 * This module fetches the index, walks each child sitemap, and
 * returns every product/card URL filtered by host + path shape.
 * The output feeds the wholesale-side discovery runner, which fetches
 * each product page individually and parses the Schema.org JSON-LD
 * via @/lib/tcgcollector/jsonld.
 *
 * ── Substrate-honest design choices ─────────────────────────────────
 *
 * - Pure functions where possible. `parseSitemapUrls` and
 *   `parseSitemapIndex` take strings, return data; the fetcher
 *   dependency lives in `fetchSitemap` which takes the createFetcher
 *   result.
 *
 * - Same User-Agent budget as the rest of TCGCollector traffic. The
 *   discovery runner shares one fetcher across the whole walk so the
 *   rate-limit holds across sitemap fetches.
 *
 * - URL filtering is regex-based. When the regex doesn't match, the
 *   URL is excluded rather than wrong-classified. The total_urls
 *   counter reports the raw input so the caller can detect "fetched
 *   but nothing matched our shape".
 *
 * - No DB knowledge. This module produces URL lists; the wholesale
 *   runner writes to the cards table.
 *
 * Mirrors the cardrush/discovery.ts pattern. When a third sitemap
 * vendor lands, the shared parts (regex sitemap parsing, locked
 * fetcher) can be extracted to a shared discovery/ module.
 */

import type { createFetcher } from "../http";
import { TCGCOLLECTOR_ACQUISITION_ENABLED } from "./policy";

// ── Sitemap fetch result types ──────────────────────────────────────────

export interface SitemapFetchResult {
  ok: boolean;
  /** When ok=true, every product/card URL discovered across all child
   *  sitemaps (sitemap-index recursion already resolved). */
  product_urls: string[];
  /** Every URL seen during the walk, regardless of shape (diagnostics). */
  total_urls: number;
  /** Number of child sitemaps walked when the entrypoint was an index. */
  child_sitemaps: number;
  /** Substrate-honest error reason when ok=false. */
  error_reason?: string;
  /** ISO timestamp of when the walk started. */
  fetched_at: string;
}

const TCGC_HOST = "www.tcgcollector.com";
const SITEMAP_ENTRYPOINT = `https://${TCGC_HOST}/sitemap.xml`;

/** Max child sitemaps to walk in one run. Substrate-honest budget: if
 *  the index ever exceeds this, the walk reports `child_sitemaps_truncated`
 *  in the error_reason and the caller can split into multiple runs. */
const MAX_CHILD_SITEMAPS = 50;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; cambridge-tcg-ingest/1.0; +https://cambridgetcg.com/api/v1/feedback)",
  Accept: "application/xml, text/xml, */*;q=0.8",
  "Accept-Language": "en",
} as const;

/**
 * Fetch the TCGCollector sitemap-index, walk each child sitemap, and
 * return every product/card URL. Substrate-honest: returns
 * `ok: false` with `error_reason` rather than throwing.
 *
 * The fetcher must be a `createFetcher(ctx, tcgcollector.meta)` result
 * so the rate-limit bucket is shared with the rest of the tcgcollector
 * traffic on this run.
 */
export async function fetchSitemap(
  fetcher: ReturnType<typeof createFetcher>,
  opts?: { max_urls?: number },
): Promise<SitemapFetchResult> {
  const fetched_at = new Date().toISOString();
  const max_urls = opts?.max_urls ?? Infinity;

  if (!TCGCOLLECTOR_ACQUISITION_ENABLED) {
    return {
      ok: false,
      product_urls: [],
      total_urls: 0,
      child_sitemaps: 0,
      error_reason: "acquisition_blocked_pending_partner_approval",
      fetched_at,
    };
  }

  // Step 1 — fetch the entrypoint.
  let entryXml: string;
  try {
    const res = await fetcher(SITEMAP_ENTRYPOINT, { headers: BROWSER_HEADERS });
    if (!res.ok) {
      return {
        ok: false,
        product_urls: [],
        total_urls: 0,
        child_sitemaps: 0,
        error_reason: `entrypoint_http_${res.status}`,
        fetched_at,
      };
    }
    entryXml = await res.text();
  } catch (err) {
    return {
      ok: false,
      product_urls: [],
      total_urls: 0,
      child_sitemaps: 0,
      error_reason: `entrypoint_fetch_error: ${err instanceof Error ? err.message : String(err)}`,
      fetched_at,
    };
  }

  // Step 2 — sitemap-index or flat sitemap?
  const index_children = parseSitemapIndex(entryXml);
  if (index_children.length === 0) {
    // Treat the entrypoint as a flat sitemap.
    const { product_urls, total_urls } = parseSitemapUrls(entryXml);
    return {
      ok: total_urls > 0,
      product_urls: product_urls.slice(0, max_urls),
      total_urls,
      child_sitemaps: 0,
      error_reason: total_urls === 0 ? "sitemap_empty_or_unparseable" : undefined,
      fetched_at,
    };
  }

  // Step 3 — sitemap-index: walk each child.
  const truncated = index_children.length > MAX_CHILD_SITEMAPS;
  const children = index_children.slice(0, MAX_CHILD_SITEMAPS);

  const all_product_urls: string[] = [];
  let total_urls = 0;
  for (const child_url of children) {
    if (all_product_urls.length >= max_urls) break;
    try {
      const res = await fetcher(child_url, { headers: BROWSER_HEADERS });
      if (!res.ok) continue;
      const xml = await res.text();
      const { product_urls, total_urls: child_total } = parseSitemapUrls(xml);
      total_urls += child_total;
      for (const u of product_urls) {
        if (all_product_urls.length >= max_urls) break;
        all_product_urls.push(u);
      }
    } catch {
      // Substrate-honest: one bad child shouldn't fail the whole walk.
      // The caller sees child_sitemaps count vs successful URL count.
      continue;
    }
  }

  return {
    ok: all_product_urls.length > 0,
    product_urls: all_product_urls,
    total_urls,
    child_sitemaps: children.length,
    error_reason:
      all_product_urls.length === 0
        ? "all_children_empty"
        : truncated
        ? `child_sitemaps_truncated_at_${MAX_CHILD_SITEMAPS}`
        : undefined,
    fetched_at,
  };
}

// ── Pure-function parsers ───────────────────────────────────────────────

/**
 * Extract `<sitemap><loc>URL</loc></sitemap>` entries from a sitemap-index
 * XML body. Returns an empty array when the document is a flat sitemap
 * (no `<sitemap>` wrappers) — caller distinguishes by the empty return.
 *
 * Pure: same input → same output. Tolerant of namespace declarations and
 * whitespace.
 */
export function parseSitemapIndex(xml: string): string[] {
  // A sitemap-index uses <sitemapindex> root with <sitemap><loc>…</loc></sitemap>.
  // A flat sitemap uses <urlset> root with <url><loc>…</loc></url>.
  // We detect by the wrapper around <loc> tags.
  if (!/<sitemapindex\b/i.test(xml)) return [];
  const matches = Array.from(
    xml.matchAll(/<sitemap>\s*<loc>\s*([^<\s]+)\s*<\/loc>\s*<\/sitemap>/gi),
  );
  return matches.map((m) => m[1]);
}

/**
 * Extract every product/card URL from a flat sitemap XML body. The TCGC
 * URL shapes we ingest:
 *   - `/cards/<game>/<set>/<card-slug>`     (per-card pages)
 *   - `/expansions/<game>/<set>/cards`      (set's-card-list pages — skipped)
 *   - `/products/<slug>`                    (singles + sealed products)
 *
 * Returns total_urls so the caller can detect "sitemap exists but no
 * products" (e.g., a sitemap that only lists categories).
 */
export function parseSitemapUrls(
  xml: string,
): { product_urls: string[]; total_urls: number } {
  const locMatches = Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g));
  const total_urls = locMatches.length;

  // The two URL shapes we treat as ingestable. `/cards/<game>/<set>/<slug>`
  // is the canonical per-card page; `/products/<slug>` covers sealed +
  // marketplace listings. Other paths (set-lists, articles, user pages)
  // are excluded — substrate-honestly returned via total_urls so the
  // caller knows the sitemap had content.
  const cardRe = new RegExp(
    `^https?://(?:www\\.)?${escapeRegex(TCGC_HOST)}/cards/[^/]+/[^/]+/[^/?#]+/?$`,
  );
  const productRe = new RegExp(
    `^https?://(?:www\\.)?${escapeRegex(TCGC_HOST)}/products/[^/?#]+/?$`,
  );

  const product_urls: string[] = [];
  for (const m of locMatches) {
    const url = m[1];
    if (cardRe.test(url) || productRe.test(url)) {
      // Normalize: strip trailing slash so dedup downstream is stable.
      product_urls.push(url.replace(/\/$/, ""));
    }
  }

  return { product_urls, total_urls };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Exports for consumers ───────────────────────────────────────────────

export { SITEMAP_ENTRYPOINT, TCGC_HOST, BROWSER_HEADERS };
