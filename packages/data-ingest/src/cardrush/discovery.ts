/**
 * CardRush discovery layer — closes the kingdom-064 anticipate-then-confirm
 * pattern's inertness.
 *
 * Where the existing read()/scrape() functions in this module operate
 * *on-demand* (taking a watch-list of URLs and scraping them), this layer
 * operates *bulk* — fetching the well-known /sitemap.xml on a confirmed
 * cardrush subdomain, extracting every /product/[ID] URL, and (per
 * caller) optionally fetching each product page to parse metadata
 * (set_code, card_number, rarity, image_url, display name).
 *
 * The output feeds the wholesale-side discovery runner, which:
 *   1. Diffs the sitemap's product URLs against cards.cardrush_url
 *   2. Fetches new products to enrich set_code + card_number + rarity
 *   3. INSERTs into cards with ON CONFLICT (sku) DO UPDATE so cards
 *      seeded by other paths get their cardrush_url filled in
 *
 * Kingdom-087 — the cardrush self-discovering source.
 *
 * ── Substrate-honest design choices ─────────────────────────────────
 *
 * - Pure functions where possible. parseSitemapProductUrls and
 *   parseCardMetadata take strings, return data; the fetcher dependency
 *   lives in fetchSitemap which takes the createFetcher result.
 *
 * - Same User-Agent + rate-limit budget as the existing scraper. The
 *   discovery runner shares one fetcher across the whole subdomain walk
 *   so the 0.5 rps token bucket holds across discovery + scrape.
 *
 * - Title parsing is best-effort. When the regex doesn't match, we
 *   return null rather than fabricating fields. The caller decides
 *   whether to quarantine or skip.
 *
 * - No DB knowledge. This module produces data; the wholesale runner
 *   writes to the cards table.
 */

import type { IngestContext } from "../types";
import { createFetcher, type Fetcher } from "../http";
import {
  CARDRUSH_ACQUISITION_ENABLED,
  cardrush,
  getOrCreateFetcher,
  CARDRUSH_BROWSER_HEADERS,
  type CardRushContext,
  type CardRushFetcherCache,
  type SubdomainAccessMode,
} from "./index";

// ── Sitemap fetch + parse ───────────────────────────────────────────

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export interface SitemapFetchResult {
  ok: boolean;
  /** When ok=true, every /product/[N] URL discovered on this host. */
  product_urls: string[];
  /** Every URL in the sitemap, regardless of shape (for diagnostics). */
  total_urls: number;
  /** Substrate-honest error reason when ok=false. */
  error_reason?: string;
  /** When the fetch happened (ISO). */
  fetched_at: string;
}

/**
 * Fetch and parse the well-known /sitemap.xml for a CardRush subdomain.
 * Substrate-honest: returns ok=false with a specific error_reason rather
 * than throwing. The runner decides how to react (skip subdomain, quarantine,
 * etc.).
 *
 * The fetcher must be a `createFetcher(ctx, cardrush.meta)` result so the
 * rate-limit bucket is shared with the rest of the cardrush traffic on this
 * run.
 */
export async function fetchSitemap(
  host: string,
  fetcher: ReturnType<typeof createFetcher>,
): Promise<SitemapFetchResult> {
  const url = `https://${host}/sitemap.xml`;
  const fetched_at = new Date().toISOString();

  if (!CARDRUSH_ACQUISITION_ENABLED) {
    return {
      ok: false,
      product_urls: [],
      total_urls: 0,
      error_reason: "acquisition_blocked_pending_formal_partnership",
      fetched_at,
    };
  }

  let xml: string;
  try {
    // Send full browser-shape headers (Sec-Fetch-* + sec-ch-ua-*) so
    // residential-proxy upstreams accept the request — kingdom-088. Accept
    // override for XML preference; Accept-Encoding deliberately unset so
    // the createFetcher wrapper can choose identity for proxied paths.
    const res = await fetcher(url, {
      headers: {
        ...CARDRUSH_BROWSER_HEADERS,
        Accept: "application/xml, text/xml, */*;q=0.8",
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        product_urls: [],
        total_urls: 0,
        error_reason: `http_${res.status}`,
        fetched_at,
      };
    }
    xml = await res.text();
  } catch (err) {
    return {
      ok: false,
      product_urls: [],
      total_urls: 0,
      error_reason: `fetch_error: ${err instanceof Error ? err.message : String(err)}`,
      fetched_at,
    };
  }

  const { product_urls, total_urls } = parseSitemapProductUrls(xml, host);
  if (total_urls === 0) {
    return {
      ok: false,
      product_urls: [],
      total_urls: 0,
      error_reason: "sitemap_empty_or_unparseable",
      fetched_at,
    };
  }

  return { ok: true, product_urls, total_urls, fetched_at };
}

/**
 * Extract every /product/[N] URL from a CardRush sitemap.xml body.
 * Pure: same input → same output. Robust to whitespace + namespace
 * declarations. Returns total_urls so the caller can detect "sitemap
 * exists but no products" (e.g., a sitemap that only lists categories).
 *
 * Filter rules:
 *   - Must be on the same host as `host`
 *   - Must match `/product/[digits]` (no trailing path)
 *   - Excludes `/product-group/N` and `/product-list/N` (category pages)
 */
export function parseSitemapProductUrls(
  xml: string,
  host: string,
): { product_urls: string[]; total_urls: number } {
  // Match <loc>...</loc> tags. Tolerant of XML namespaces and whitespace.
  const locMatches = Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g));
  const total_urls = locMatches.length;

  // Tolerate optional `www.` prefix — cardrush sitemaps emit
  // `https://www.<host>/product/<N>` but our registry stores the bare
  // host. Without `(?:www\.)?` we under-count products and the probe
  // misreads sitemaps as empty. Verified against cardrush-op.jp +
  // cardrush-digimon.jp (kingdom-087 post-deploy fix).
  const productRe = new RegExp(
    `^https?://(?:www\\.)?${escapeRegex(host)}/product/(\\d+)/?$`,
  );
  const product_urls: string[] = [];
  for (const m of locMatches) {
    const url = m[1];
    if (productRe.test(url)) {
      // Normalize: strip trailing slash + force-canonical host so dedup
      // against cards.cardrush_url works whether the existing row has
      // www. or not. We keep the URL with www. (the canonical form) for
      // storage; the probe + diff are unaffected because both sides
      // pass through this normalization.
      product_urls.push(url.replace(/\/$/, ""));
    }
  }

  return { product_urls, total_urls };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Per-product metadata parser ─────────────────────────────────────

/**
 * Metadata extracted from a CardRush product page HTML.
 * Substrate-honest about absence: every field can be null if the
 * parser couldn't ground it from the page.
 */
export interface CardMetadata {
  /** Product page URL, echoed for downstream correlation. */
  url: string;
  /** CardRush product id (digits from the URL path). */
  product_id: number;
  /** e.g. "OP01", "EB04", "BT10" — uppercase. Null without an explicit set/card token. */
  set_code: string | null;
  /** e.g. "001", "061" — zero-padded as it appears in the title. Null if no match. */
  card_number: string | null;
  /** e.g. "SR", "L", "SEC", "C". Null if not detected. */
  rarity: string | null;
  /** Card display name (best-effort; from page title up to the rarity/set token). */
  name: string | null;
  /** First image URL on the page matching the cardrush image path. Null if not found. */
  image_url: string | null;
  /** Stock status — "in_stock" | "out_of_stock" | null when undetermined. */
  stock_status: "in_stock" | "out_of_stock" | null;
}

const SET_NUMBER_RE = /\{([A-Z0-9]+)-(\d+)\}/;
// Some Digimon titles omit CardRush's usual braces but still print an explicit
// publisher card id, e.g. "BT10-112 ...". Accept only that grounded token on
// the Digimon host. A listing marker such as "(01)" is not a card identity.
const DIGIMON_BARE_SET_NUMBER_RE =
  /(?:^|[\s(\[【])([A-Z]{2,4}\d{2})-(\d{3,4})(?=$|[\s)\]】])/i;
// Known CardRush rarity tokens (One Piece taxonomy; works for DBS/Pokémon too).
// Ordered so longer tokens match first (e.g., SEC before SE, SCR before SR).
const RARITY_TOKENS = [
  "SECR", "SEC", "SCR", "SP", "SR", "SSR", "RR", "L", "P", "C",
  "UC", "R",
];
// Digimon rarity codes as they appear in the trailing 【X】 bracket of
// cardrush-digimon titles (packages/sku/src/rarities.ts, Digimon block).
// Note "U" (not "UC") is Digimon's Uncommon.
const DIGIMON_BRACKET_RARITIES = ["C", "U", "R", "SR", "SEC", "P"];

function isDigimonProductUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "cardrush-digimon.jp" || host === "www.cardrush-digimon.jp";
  } catch {
    return false;
  }
}

/**
 * Parse metadata from a CardRush product page HTML body.
 * Pure: same input → same output. Returns null only when the URL
 * can't yield a product_id — every other field gracefully degrades to null.
 */
export function parseCardMetadata(
  html: string,
  url: string,
): CardMetadata | null {
  const idMatch = url.match(/\/product\/(\d+)/);
  if (!idMatch) return null;
  const product_id = parseInt(idMatch[1], 10);
  const isDigimonProduct = isDigimonProductUrl(url);

  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1].trim() : null;

  let set_code: string | null = null;
  let card_number: string | null = null;
  let bareIdentityToken: string | null = null;
  if (title) {
    const m = title.match(SET_NUMBER_RE);
    if (m) {
      set_code = m[1].toUpperCase();
      card_number = m[2];
    } else if (isDigimonProduct) {
      const bare = title.match(DIGIMON_BARE_SET_NUMBER_RE);
      if (bare) {
        set_code = bare[1].toUpperCase();
        card_number = bare[2];
        bareIdentityToken = `${bare[1]}-${bare[2]}`;
      }
    }
  }

  let rarity: string | null = null;
  if (title) {
    // Look for rarity token immediately before the {SET-NUM} brace.
    // Pattern: "... <RARITY> {SET-NUM}"
    const beforeBrace = title.split("{")[0]?.trim() ?? "";
    const tokens = beforeBrace.split(/\s+/);
    const lastTokens = tokens.slice(-3); // last few tokens
    for (const r of RARITY_TOKENS) {
      if (lastTokens.includes(r)) {
        rarity = r;
        break;
      }
    }
  }

  // Digimon alone carries rarity in a trailing full-width bracket. Require the
  // exact host and the end of the title: other CardRush games use similar
  // brackets for conditions/promos, and an earlier bracket is not the trailing
  // rarity witness. Titles such as "(01)...【U】" still have no identity; the
  // listing marker is deliberately not promoted to set/card fields.
  let digimonTrailingRarity: string | null = null;
  if (!rarity && title && isDigimonProduct) {
    const bracket = title.match(/【([^】]+)】\s*$/);
    const code = bracket?.[1]?.trim().toUpperCase();
    if (code && DIGIMON_BRACKET_RARITIES.includes(code)) {
      rarity = code;
      digimonTrailingRarity = code;
    }
  }

  let name: string | null = null;
  if (title) {
    // Name is everything before the rarity/set token. Strip the rarity if matched.
    const braceIdx = title.indexOf("{");
    let prefix = braceIdx > 0 ? title.slice(0, braceIdx).trim() : title;
    if (digimonTrailingRarity) {
      prefix = prefix.replace(/\s*【[^】]+】\s*$/, "");
    }
    if (bareIdentityToken) {
      prefix = prefix.replace(bareIdentityToken, "").trim();
    }
    if (rarity) {
      // Strip trailing rarity token
      const ts = prefix.split(/\s+/);
      while (ts.length > 0 && ts[ts.length - 1] === rarity) ts.pop();
      prefix = ts.join(" ");
    }
    // Strip trailing separators (｜| etc.) and store-name suffix if any
    name = prefix.replace(/[\s\-|｜]+$/, "").trim() || null;
  }

  // Image URL: first match on /data/cardrush-*/product/ image pattern.
  // Defensive: also accept og:image meta tag.
  let image_url: string | null = null;
  const ogImage = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  );
  if (ogImage) {
    image_url = ogImage[1];
  } else {
    const inlineImg = html.match(
      /(https?:[^"'\s]*\/data\/cardrush-[^"'\s]+\.(?:jpg|jpeg|png|webp))/i,
    );
    if (inlineImg) image_url = inlineImg[1];
  }

  // Stock status: 在庫なし vs 在庫あり / カートに入れる button.
  // Simple heuristic; the runner doesn't make stocking decisions from this.
  let stock_status: CardMetadata["stock_status"] = null;
  if (html.includes("在庫なし") || html.includes("SOLD OUT")) {
    stock_status = "out_of_stock";
  } else if (html.includes("カートに入れる") || html.includes("在庫あり")) {
    stock_status = "in_stock";
  }

  return {
    url,
    product_id,
    set_code,
    card_number,
    rarity,
    name,
    image_url,
    stock_status,
  };
}

/**
 * Fetch a single product page and parse its metadata. Bundles fetch +
 * parse so the runner doesn't have to manage HTML strings.
 *
 * Substrate-honest: returns null when the fetch failed; returns
 * a CardMetadata with mostly-null fields when the page loaded but
 * parsing didn't find what we wanted. The runner can tell apart
 * "couldn't fetch" from "fetched but couldn't parse".
 */
export interface FetchAndParseResult {
  ok: boolean;
  metadata: CardMetadata | null;
  /** http_<status> | fetch_error | parse_no_product_id | <null when ok=true>. */
  error_reason?: string;
  fetched_at: string;
}

export async function fetchAndParseProduct(
  url: string,
  fetcher: ReturnType<typeof createFetcher>,
): Promise<FetchAndParseResult> {
  const fetched_at = new Date().toISOString();
  if (!CARDRUSH_ACQUISITION_ENABLED) {
    return {
      ok: false,
      metadata: null,
      error_reason: "acquisition_blocked_pending_formal_partnership",
      fetched_at,
    };
  }
  let html: string;
  try {
    const res = await fetcher(url, {
      headers: CARDRUSH_BROWSER_HEADERS,
    });
    if (!res.ok) {
      return {
        ok: false,
        metadata: null,
        error_reason: `http_${res.status}`,
        fetched_at,
      };
    }
    html = await res.text();
  } catch (err) {
    return {
      ok: false,
      metadata: null,
      error_reason: `fetch_error: ${err instanceof Error ? err.message : String(err)}`,
      fetched_at,
    };
  }

  const metadata = parseCardMetadata(html, url);
  if (!metadata) {
    return {
      ok: false,
      metadata: null,
      error_reason: "parse_no_product_id",
      fetched_at,
    };
  }

  return { ok: true, metadata, fetched_at };
}

// ── Re-export the shared User-Agent for the runner's convenience ─────

export { BROWSER_UA };

// ── Convenience: create a discovery fetcher pre-bound to cardrush meta ──

/**
 * Build a fetcher that walks the cardrush meta's rate-limit budget. For
 * runs that touch a single subdomain whose access mode is "direct" this
 * is the simplest helper. For multi-subdomain runs where some
 * subdomains need the Bright Data unlocker (kingdom-088), use
 * `createDiscoveryCache()` + `pickDiscoveryFetcher(host, ctx, cache)`
 * instead — those route per-host without breaking the per-mode token
 * buckets.
 */
export function createDiscoveryFetcher(ctx: IngestContext = {}): Fetcher {
  if (!CARDRUSH_ACQUISITION_ENABLED) {
    throw new Error("CardRush acquisition is blocked pending a formal partnership.");
  }
  return createFetcher(ctx, cardrush.meta);
}

/**
 * Per-run cache the discovery runner uses to share fetchers across
 * subdomains. Add an entry per access mode (one direct, one proxied)
 * so the orchestrator doesn't burn token buckets per host.
 */
export function createDiscoveryCache(): CardRushFetcherCache {
  return new Map<SubdomainAccessMode, Fetcher>();
}

/**
 * Pick (or lazily create) the right fetcher for a given subdomain.
 * Returns `null` + a reason when the subdomain can't be reached
 * (e.g. proxy not configured). The orchestrator should log the reason
 * and skip the subdomain. Re-exports the cardrush module's
 * `getOrCreateFetcher` under a discovery-flavoured name.
 *
 * Pattern in the wholesale discovery runner:
 *   const cache = createDiscoveryCache();
 *   for (const [host, entry] of subdomains) {
 *     const { fetcher, reason } = pickDiscoveryFetcher(host, ctx, cache);
 *     if (!fetcher) { event("subdomain_skipped", { host, reason }); continue; }
 *     const sm = await fetchSitemap(host, fetcher);
 *     // ... per-product fetches use the SAME fetcher (so token bucket
 *     // applies to discovery + product pages of the same host)
 *   }
 */
export function pickDiscoveryFetcher(
  host: string,
  ctx: CardRushContext,
  cache: CardRushFetcherCache,
): { fetcher: Fetcher | null; reason?: string } {
  return getOrCreateFetcher(host, ctx, cache);
}
