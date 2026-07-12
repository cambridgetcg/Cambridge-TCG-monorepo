/**
 * CardRush — Japanese retail card prices.
 *
 * **On-demand source.** Unlike Scryfall's bulk-dump pattern, CardRush
 * has no catalog API — you point at a product URL and the scraper
 * returns the A-condition price. This module models that pattern via
 * the optional `scrapeCardRush(url, ctx)` helper; the contract's `read()`
 * yields the watch-list if one is provided via `ctx.cardrush.urls`.
 *
 * ── License ──────────────────────────────────────────────────────────
 *
 * CardRush ToS does not authorise commercial redistribution of scraped
 * price data. Internal-decision use is the safer position. The
 * `redistribute: false` flag propagates this to `_meta.source_license`.
 *
 * ── Why this lives here ──────────────────────────────────────────────
 *
 * Originally `apps/wholesale/src/lib/cardrush-scraper.ts`. The protocol
 * (`docs/methodology/source-protocol.md`) names the same shape — meta +
 * read + normalize — so the wholesale scraper now conforms to it.
 *
 * ── Subdomain coverage ───────────────────────────────────────────────
 *
 * The `CARDRUSH_SUBDOMAINS` table below maps every known CardRush
 * subdomain to a Cambridge TCG `GameCode`. Six have observations in the
 * public archive as of 2026-07-11 (op / pokemon / dbf / digimon / vanguard /
 * battle spirits). The others are unconfirmed or explicitly blocked —
 * retained so URLs in those subdomains route to a known
 * game code, but the upstream may or may not exist; the first scrape
 * either returns prices (confirming) or yields `null` + an `error_reason`
 * (so the operator can remove the speculative entry).
 *
 * ── Failure modes — substrate-honesty for scrape failures ────────────
 *
 * Every scrape returns a `RawRow<CardRushRaw>`; failure produces
 * `price_jpy: null` *plus* an `error_reason` string that names what
 * went wrong (HTTP status, fetch error, parse miss, blocked-subdomain).
 * The wholesale caller's snapshot pipeline records the reason instead
 * of just counting failures — *the substrate becomes auditable*.
 *
 * ── Direct-host concurrency (2026-07-05) ─────────────────────────────
 *
 * `read()` was strictly sequential; at ~0.8s/page that capped direct
 * hosts near 1.2 rps regardless of the token-bucket ceiling (observed
 * in prod ingest_run: ~860-880 attempts per 700s budget vs the 2,000
 * designed). Watch-list entries on DIRECT-access subdomains now scrape
 * in small `Promise.all` batches (DIRECT_SCRAPE_CONCURRENCY = 4) so
 * latency overlaps and throughput approaches the token-bucket rate —
 * the shared per-access-mode bucket remains the actual limiter.
 * Proxied (bright-data-unlocker) and unknown/blocked entries stay
 * strictly sequential: paid egress gets no burst pressure, and
 * WAF-sensitive hosts see the same one-at-a-time shape as before.
 * (Unlocker hosts under residential egress also stay sequential —
 * deliberately conservative toward the WAF.) Batch planning is
 * `planScrapeBatches` (pure, unit-tested).
 *
 * ── Catalog row ──────────────────────────────────────────────────────
 *
 * See `docs/connections/the-tributaries.md` §2.3.
 */

import type { SourceModule, IngestContext, RawRow, NormalizeResult } from "../types";
import type { CanonicalPrice } from "../canonical";
import type { GameCode } from "@cambridge-tcg/sku";
import { createFetcher, type Fetcher } from "../http";

/**
 * Hard legal gate. CardRush's cross-site data policy requires a formal
 * partnership for automated crawling, scraping, or price collection. Keep
 * immutable and false until written permission is recorded in source intake.
 */
export const CARDRUSH_ACQUISITION_ENABLED = false as const;
export const CARDRUSH_DATA_POLICY_URL = "https://cardrush.media/data_policy";
export const CARDRUSH_BLOCK_REASON =
  "CardRush prohibits automated crawling, scraping, and price collection without a formal partnership; no written partnership is recorded.";

// ── Subdomain → GameCode map ────────────────────────────────────────────

/**
 * How a subdomain is reached. Added kingdom-088 (the-bright-data-unlock).
 *
 *   "direct"               — vanilla fetch from Vercel egress
 *   "bright-data-unlocker" — route through Bright Data Web Unlocker; requires
 *                            `ctx.cardrush.bright_data_proxy_url` or the
 *                            CARDRUSH_BRIGHT_DATA_PROXY_URL env var.
 *   "blocked"              — operator has marked this subdomain off-limits;
 *                            discovery + scrape skip with a recorded reason.
 */
export type SubdomainAccessMode = "direct" | "bright-data-unlocker" | "blocked";

/**
 * What role this subdomain plays in our pipeline. Added kingdom-088.
 *
 *   "catalog+price" — full participation: discovery cron walks sitemap;
 *                     price snapshot scrapes /product pages
 *   "price-only"    — discovery cron SKIPS this host (catalog comes from
 *                     elsewhere, e.g. Scryfall for MTG); price snapshot
 *                     still runs for cards already seeded with cardrush_url
 *   "blocked"       — neither discovery nor price scrape runs against this host
 */
export type SubdomainRole = "catalog+price" | "price-only" | "blocked";

interface SubdomainEntry {
  /** Cambridge TCG game code. */
  game: GameCode;
  /** Whether existing wholesale scrape traffic has confirmed this subdomain works. */
  confirmed: boolean;
  /**
   * How this subdomain is reached. Defaults to "direct" when omitted. A
   * subdomain with `access: "bright-data-unlocker"` will be skipped with
   * `error_reason: "proxy_not_configured"` if the operator hasn't
   * supplied the proxy URL — substrate-honest about missing config.
   */
  access: SubdomainAccessMode;
  /** What role this subdomain plays in our pipeline. See `SubdomainRole`. */
  role: SubdomainRole;
  /** Human-readable note. */
  note?: string;
}

/**
 * Every known CardRush subdomain. To add a new one:
 *   1. Add the entry below with `confirmed: false`, `access: "direct"`,
 *      and the role you intend.
 *   2. Update `meta.games` if the new GameCode isn't already there.
 *   3. Update `meta.description` if substantial coverage shift.
 *   4. When the first real scrape returns prices, flip `confirmed: true`.
 *   5. If the subdomain is WAF-blocked, flip `access:` to
 *      "bright-data-unlocker" and ensure CARDRUSH_BRIGHT_DATA_PROXY_URL
 *      is set in the deployment env.
 *
 * Each entry's substrate-honesty: a speculative subdomain produces
 * `inferred_game` correctly but `error_reason: "subdomain not yet confirmed"`
 * is attached to the first scrape that fails, so the operator knows whether
 * the subdomain exists at all.
 */
export const CARDRUSH_SUBDOMAINS: Record<string, SubdomainEntry> = {
  "cardrush-op.jp": {
    game: "op",
    confirmed: true,
    access: "direct",
    role: "catalog+price",
    note: "One Piece TCG — 12,549 products in sitemap (kingdom-087 probe)",
  },
  "cardrush-pokemon.jp": {
    game: "pkm",
    confirmed: true,
    access: "bright-data-unlocker",
    role: "catalog+price",
    note: "Pokémon TCG — Cloudflare WAF (`cf-mitigated: challenge`) blocks direct egress from Vercel and US datacenter IPs alike (verified 2026-05-14). Bright Data Web Unlocker proves out (kingdom-088): homepage 200, /sitemap.xml 200 with 70,507 product URLs, /product/[id] 200 with parseable {SET-NUMBER} titles + selling_price markup. Operator supplies CARDRUSH_BRIGHT_DATA_PROXY_URL in Vercel env to enable.",
  },
  "cardrush-db.jp": {
    game: "dbf",
    confirmed: true,
    access: "direct",
    role: "catalog+price",
    note:
      "Dragon Ball Fusion World — 4,889 products in sitemap. Re-pointed " +
      "dbs→dbf 2026-06-10 (kingdom-039): the inventory this host carries " +
      "is FB/SB Fusion World sets, matching wholesale games.code='dbf' " +
      "post-migration-0022.",
  },
  // ── confirmed via kingdom-087 probe (homepage 200 + sitemap 200 + products>0) ──
  // 2026-07-05: cardrush-digimon flipped confirmed:true — digimon becomes the
  // next game. Basis: the kingdom-087 probe verified the host live (13,520
  // products, direct access, same {SET-NUMBER} title parser as op/dbf), and the
  // 'dmw' games row is seeded by apps/wholesale/scripts/seed-game.mjs in the
  // same ship. This flip is what the discovery cron gates on (it only walks
  // confirmed hosts), so it *is* the ingest switch. First scheduled scrape is
  // observed in the public archive by 2026-07-11.
  "cardrush-digimon.jp": {
    game: "dmw",
    confirmed: true,
    access: "direct",
    role: "catalog+price",
    note:
      "Digimon Card Game — 13,520 products in sitemap (kingdom-087 probe: " +
      "upstream exists, direct access). confirmed:true 2026-07-05 on probe " +
      "evidence + the seeded 'dmw' games row; production archive observations " +
      "confirmed on the public coverage route 2026-07-11.",
  },
  "cardrush-vanguard.jp": {
    game: "vng",
    confirmed: true,
    access: "direct",
    role: "catalog+price",
    note:
      "Cardfight!! Vanguard — 40,642 products (kingdom-087); re-probed " +
      "2026-07-07: alive, homepage 200, sitemap 200 (3.6MB). Production " +
      "archive observations confirmed on the public coverage " +
      "route 2026-07-11.",
  },
  "cardrush-bs.jp": {
    game: "bsr",
    confirmed: true,
    access: "direct",
    role: "catalog+price",
    note:
      "Battle Spirits Saga — 35,485 products (kingdom-087); re-probed " +
      "2026-07-07: alive, homepage 200, sitemap 200 (2.9MB). Production " +
      "archive observations confirmed on the public coverage " +
      "route 2026-07-11.",
  },
  // ── speculative — homepage 200 + ¥ but sitemap fetch failed ──
  "cardrush-mtg.jp": {
    game: "mtg",
    confirmed: false,
    access: "direct",
    role: "price-only",
    note: "Magic: The Gathering — re-probed 2026-07-07: homepage 200, sitemap timeout x2 (catalog ~200K+ printings, too large to walk). Title format uses 【SET】 not {SET-NUMBER}, so parseCardMetadata would fail anyway. Plan: future Scryfall catalog seeds cards.cardrush_url; this subdomain acts as price-only enricher.",
  },
  // ── speculative — homepage fetch_error (likely DNS-dead or wrong host) ──
  "cardrush-ygo.jp": {
    game: "ygo",
    confirmed: false,
    access: "blocked",
    role: "blocked",
    note: "Yu-Gi-Oh! — NXDOMAIN verified 2026-07-07 (dig A empty on www + apex): the host DOES NOT EXIST. Never speculative — a phantom. If CardRush ever opens this store, re-probe and re-register (the coverage gate spec §3).",
  },
  "cardrush-weiss.jp": {
    game: "wei",
    confirmed: false,
    access: "blocked",
    role: "blocked",
    note: "Weiß Schwarz — NXDOMAIN verified 2026-07-07 (dig A empty on www + apex): the host DOES NOT EXIST. Never speculative — a phantom. If CardRush ever opens this store, re-probe and re-register (the coverage gate spec §3).",
  },
  "cardrush-fab.jp": {
    game: "fab",
    confirmed: false,
    access: "blocked",
    role: "blocked",
    note: "Flesh and Blood — NXDOMAIN verified 2026-07-07 (dig A empty on www + apex): the host DOES NOT EXIST. Never speculative — a phantom. If CardRush ever opens this store, re-probe and re-register (the coverage gate spec §3).",
  },
  "cardrush-lorcana.jp": {
    game: "lgr",
    confirmed: false,
    access: "blocked",
    role: "blocked",
    note: "Disney Lorcana — NXDOMAIN verified 2026-07-07 (dig A empty on www + apex): the host DOES NOT EXIST. Never speculative — a phantom. If CardRush ever opens this store, re-probe and re-register (the coverage gate spec §3).",
  },
  "cardrush-fw.jp": {
    game: "dbf",
    confirmed: false,
    access: "blocked",
    role: "blocked",
    note: "Dragon Ball Super Fusion World — NXDOMAIN verified 2026-07-07 (dig A empty on www + apex): the host DOES NOT EXIST. Never speculative — a phantom. If CardRush ever opens this store, re-probe and re-register (the coverage gate spec §3).",
  },
};

interface UrlInference {
  game: GameCode | null;
  confirmed: boolean;
  matched_host: string | null;
  access: SubdomainAccessMode | null;
  role: SubdomainRole | null;
}

function inferFromUrl(url: string): UrlInference {
  for (const [host, entry] of Object.entries(CARDRUSH_SUBDOMAINS)) {
    if (url.includes(host)) {
      return {
        game: entry.game,
        confirmed: entry.confirmed,
        matched_host: host,
        access: entry.access,
        role: entry.role,
      };
    }
  }
  return { game: null, confirmed: false, matched_host: null, access: null, role: null };
}

// ── Raw row + read options ──────────────────────────────────────────────

/** A single CardRush scrape result, raw form. */
export interface CardRushRaw {
  /** Product page URL. */
  url: string;
  /** Extracted JPY amount, or null if nothing parseable was found. */
  price_jpy: number | null;
  /** Which row of the product page produced the price. */
  source: "a-minus" | "base" | null;
  /** When the scrape happened. */
  scraped_at: string;
  /** Inferred SKU from URL pattern, if we can derive one. Otherwise null. */
  inferred_sku?: string | null;
  /** Inferred game from the subdomain. */
  inferred_game: GameCode | null;
  /** Whether the matched subdomain is confirmed (vs. speculative). */
  subdomain_confirmed: boolean;
  /**
   * When `price_jpy === null`, a short machine-readable reason. Never empty
   * when there's no price. Substrate-honesty: the failure is named, not
   * counted-then-forgotten.
   *
   *   "http_404"               — page doesn't exist
   *   "http_<NNN>"             — other non-2xx response
   *   "fetch_error"            — network / DNS / TLS / timeout
   *   "no_price_in_html"       — page loaded but no ¥ found anywhere
   *   "subdomain_unknown"      — URL doesn't match a known subdomain
   *   "subdomain_unconfirmed"  — speculative subdomain; first row to confirm
   */
  error_reason?: string;
}

export interface CardRushReadOptions {
  /** Watch-list of product URLs to scrape this run. */
  urls?: readonly { url: string; sku?: string }[];
  /**
   * What kind of network this runtime egresses from. The CardRush WAF
   * blocks DATACENTER fingerprints (Vercel, cloud IPs) on some hosts —
   * that is the only reason the bright-data-unlocker access mode exists.
   * A runtime on a RESIDENTIAL connection (the operator's machine, the
   * local fleet) passes the WAF directly (verified live 2026-06-10,
   * kingdom-039), so unlocker-gated hosts route direct: free, and
   * provenance stays truthful (via_proxy: null).
   *
   *   "datacenter"  (default) — unlocker hosts require the proxy
   *   "residential"           — unlocker hosts go direct
   *
   * Defaults to `process.env.CARDRUSH_EGRESS` when omitted.
   */
  egress?: "datacenter" | "residential";
  /**
   * Operator-supplied proxy URL used for subdomains whose
   * `SubdomainEntry.access === "bright-data-unlocker"`. The URL must
   * include credentials (Bright Data shape:
   * `http://brd-customer-<id>-zone-<zone>:<pw>@brd.superproxy.io:33335`).
   *
   * When this is absent AND a bright-data subdomain is hit, the scrape
   * returns `price_jpy: null` with `error_reason: "proxy_not_configured"`.
   * Substrate-honest: missing operator config surfaces visibly rather
   * than silently degrading. Added kingdom-088
   * (`docs/connections/the-bright-data-unlock.md`).
   *
   * Defaults to `process.env.CARDRUSH_BRIGHT_DATA_PROXY_URL` when omitted.
   */
  bright_data_proxy_url?: string;
}

export type CardRushContext = IngestContext & { cardrush?: CardRushReadOptions };

/**
 * Per-run cache of fetchers keyed by access mode. Each access mode gets
 * one fetcher (one token bucket) so requests through the proxy and
 * direct requests don't share each other's rate budget.
 *
 * `getOrCreateFetcher` mutates the cache; callers create one per
 * `read()` / `scrapeCardRush()` invocation.
 */
export type CardRushFetcherCache = Map<SubdomainAccessMode, Fetcher>;

function resolveProxyUrl(ctx: CardRushContext): string | undefined {
  if (ctx.cardrush?.bright_data_proxy_url) return ctx.cardrush.bright_data_proxy_url;
  if (typeof process !== "undefined" && process.env?.CARDRUSH_BRIGHT_DATA_PROXY_URL) {
    return process.env.CARDRUSH_BRIGHT_DATA_PROXY_URL;
  }
  return undefined;
}

/** Resolve the runtime's egress kind: ctx option → env → "datacenter". */
export function resolveEgress(ctx: CardRushContext): "datacenter" | "residential" {
  if (ctx.cardrush?.egress) return ctx.cardrush.egress;
  if (
    typeof process !== "undefined" &&
    process.env?.CARDRUSH_EGRESS === "residential"
  ) {
    return "residential";
  }
  return "datacenter";
}

/**
 * Pick (or lazily create) the right fetcher for a subdomain. Returns
 * `null` + a substrate-honest reason when the subdomain can't be reached
 * (e.g. proxy not configured, subdomain blocked). The caller turns the
 * reason into a `RawRow` with `price_jpy: null` + `error_reason`.
 */
export function getOrCreateFetcher(
  host: string,
  ctx: CardRushContext,
  cache: CardRushFetcherCache,
): { fetcher: Fetcher | null; reason?: string } {
  if (!CARDRUSH_ACQUISITION_ENABLED) {
    return {
      fetcher: null,
      reason: "acquisition_blocked_pending_formal_partnership",
    };
  }
  const entry = CARDRUSH_SUBDOMAINS[host];
  let access: SubdomainAccessMode = entry?.access ?? "direct";

  // Residential egress passes the WAF that the unlocker exists to beat —
  // route direct (free; provenance truthfully records via_proxy: null).
  if (access === "bright-data-unlocker" && resolveEgress(ctx) === "residential") {
    access = "direct";
  }

  if (access === "blocked") {
    return { fetcher: null, reason: "subdomain_blocked_by_operator" };
  }

  if (access === "bright-data-unlocker") {
    const existing = cache.get("bright-data-unlocker");
    if (existing) return { fetcher: existing };
    const proxy_url = resolveProxyUrl(ctx);
    if (!proxy_url) {
      return {
        fetcher: null,
        reason: "proxy_not_configured (set CARDRUSH_BRIGHT_DATA_PROXY_URL)",
      };
    }
    const f = createFetcher(ctx, cardrush.meta, { proxy_url });
    cache.set("bright-data-unlocker", f);
    return { fetcher: f };
  }

  // direct
  const existing = cache.get("direct");
  if (existing) return { fetcher: existing };
  const f = createFetcher(ctx, cardrush.meta);
  cache.set("direct", f);
  return { fetcher: f };
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/**
 * Browser-shape headers for outbound fetches. Kingdom-088: when routing
 * through a residential proxy that doesn't auto-shape requests (Bright
 * Data's residential pool, as distinct from Web Unlocker), bare
 * `User-Agent: Chrome` is no longer enough to satisfy upstream WAFs —
 * they also inspect `Sec-Fetch-*` + `sec-ch-ua-*` Client Hints headers
 * that real Chromium browsers send. Sending them moves our request from
 * "headless bot" classification to "real browser navigation" against
 * Cloudflare's bot-scoring.
 *
 * Real Chrome 122 on macOS, navigating top-level to the page (no
 * referrer, no embedded context).
 *
 * Direct fetches benefit from these too — the upstream WAF doesn't know
 * whether we're a proxy or direct, and accepting `text/html` from a
 * "real browser" shape is more reliable than the protocol's default
 * `Accept: application/json`.
 */
export const CARDRUSH_BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": BROWSER_UA,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "sec-ch-ua":
    '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
};

// ── HTML parsing helpers ───────────────────────────────────────────────

/**
 * Match either Japanese-convention `nnn円` (the kanji suffix used by
 * cardrush-*.jp templates) or Western-convention `¥nnn` (older or
 * mixed-format pages). Captures: group 1 = digits before 円,
 * group 2 = digits after ¥. Exactly one will be non-undefined.
 *
 * Kingdom-088 (the-bright-data-unlock) e2e exposed that the original
 * regex `/¥\s*([\d,]+)/` matched zero prices on every cardrush page —
 * `nnn円` is the current convention; the bug was latent because the
 * legacy production scraper at `apps/wholesale/tools/lib/cardrush-parser.ts:26`
 * always used `/([\d,]+)円/` while v2 (`price-snapshot-v2.ts`) wasn't
 * yet the production path. Cron cutover to v2 would have started
 * silently returning `no_price_in_html` on every product.
 */
const PRICE_RE = /([\d,]+)\s*円|¥\s*([\d,]+)/;

function parsePriceMatch(m: RegExpMatchArray): number {
  const digits = m[1] ?? m[2] ?? "";
  return parseInt(digits.replace(/,/g, ""), 10);
}

function extractConditionPrice(html: string, condition: string): number | null {
  const idx = html.indexOf(condition);
  if (idx === -1) return null;
  const window = html.slice(idx, idx + 400);
  const match = window.match(PRICE_RE);
  if (!match) return null;
  return parsePriceMatch(match);
}

function extractFirstPrice(html: string): number | null {
  const match = html.match(PRICE_RE);
  if (!match) return null;
  return parsePriceMatch(match);
}

// ── Public scrape function ─────────────────────────────────────────────

/**
 * Scrape one product page. Returns the raw row + provenance. Pure-ish:
 * same upstream HTML → same result. Errors are absorbed into a
 * `price_jpy: null` result *with `error_reason` set*; never throws.
 *
 * Picks the right fetcher per-subdomain (direct vs bright-data-unlocker)
 * based on `CARDRUSH_SUBDOMAINS[host].access`. For batched scrapes use
 * `read()` instead — it shares one fetcher per access mode across the
 * whole watch-list so the per-source token bucket actually rate-limits.
 *
 * Substrate-honesty: a subdomain configured for the unlocker but
 * missing operator proxy config yields `error_reason: "proxy_not_configured"`
 * rather than silently falling back to direct (which would 403).
 */
export async function scrapeCardRush(
  url: string,
  ctx: CardRushContext = {},
): Promise<RawRow<CardRushRaw>> {
  if (!CARDRUSH_ACQUISITION_ENABLED) {
    const blocked_at = new Date().toISOString();
    return {
      raw: {
        url,
        scraped_at: blocked_at,
        price_jpy: null,
        source: null,
        error_reason: "acquisition_blocked_pending_formal_partnership",
        inferred_game: inferFromUrl(url).game,
        subdomain_confirmed: inferFromUrl(url).confirmed,
      },
      provenance: {
        as_of: blocked_at,
        retrieved_at: blocked_at,
        source: "cardrush",
      },
    };
  }
  const cache: CardRushFetcherCache = new Map();
  return scrapeWithCache(url, ctx, cache);
}

/** Internal: pick fetcher per-host from the cache, then scrape. */
async function scrapeWithCache(
  url: string,
  ctx: CardRushContext,
  cache: CardRushFetcherCache,
): Promise<RawRow<CardRushRaw>> {
  const scraped_at = new Date().toISOString();
  const inference = inferFromUrl(url);
  const base_provenance = {
    as_of: scraped_at,
    retrieved_at: scraped_at,
    source: "cardrush" as const,
  };
  const base_raw = {
    url,
    scraped_at,
    inferred_game: inference.game,
    subdomain_confirmed: inference.confirmed,
  };

  if (inference.matched_host === null) {
    return {
      raw: {
        ...base_raw,
        price_jpy: null,
        source: null,
        error_reason: "subdomain_unknown",
      },
      provenance: base_provenance,
    };
  }

  // role="price-only" is a discovery hint, not a scrape gate — price
  // snapshot still scrapes cards whose cardrush_url points to these
  // hosts. role="blocked" is the only role that blocks scrape.
  if (inference.role === "blocked") {
    return {
      raw: {
        ...base_raw,
        price_jpy: null,
        source: null,
        error_reason: "subdomain_role_blocked",
      },
      provenance: base_provenance,
    };
  }

  const { fetcher, reason } = getOrCreateFetcher(
    inference.matched_host,
    ctx,
    cache,
  );
  if (!fetcher) {
    return {
      raw: {
        ...base_raw,
        price_jpy: null,
        source: null,
        error_reason: reason ?? "fetcher_unavailable",
      },
      provenance: {
        ...base_provenance,
        via_proxy: null,
      },
    };
  }
  const via_proxy = fetcher.via_proxy_label;

  return scrapeWithFetcher(url, fetcher, base_raw, base_provenance, via_proxy, inference);
}

/**
 * Internal: scrape with a caller-supplied fetcher. Kept as a separate
 * function so the discovery layer can reuse the HTML-fetching code path
 * without re-creating the cache logic.
 */
async function scrapeWithFetcher(
  url: string,
  fetcher: Fetcher,
  base_raw: {
    url: string;
    scraped_at: string;
    inferred_game: GameCode | null;
    subdomain_confirmed: boolean;
  },
  base_provenance: { as_of: string; retrieved_at: string; source: "cardrush" },
  via_proxy: string | null,
  inference: UrlInference,
): Promise<RawRow<CardRushRaw>> {
  const provenance = { ...base_provenance, via_proxy };

  let html: string;
  try {
    const res = await fetcher(url, {
      headers: CARDRUSH_BROWSER_HEADERS,
    });

    if (!res.ok) {
      return {
        raw: {
          ...base_raw,
          price_jpy: null,
          source: null,
          error_reason: `http_${res.status}`,
        },
        provenance,
      };
    }
    html = await res.text();
  } catch (err) {
    return {
      raw: {
        ...base_raw,
        price_jpy: null,
        source: null,
        error_reason: `fetch_error: ${err instanceof Error ? err.message : String(err)}`,
      },
      provenance,
    };
  }

  const aMinus =
    extractConditionPrice(html, "状態A-") ?? extractConditionPrice(html, "A-");
  if (aMinus !== null) {
    return {
      raw: {
        ...base_raw,
        price_jpy: aMinus,
        source: "a-minus",
      },
      provenance,
    };
  }

  const base = extractFirstPrice(html);
  if (base !== null) {
    return {
      raw: {
        ...base_raw,
        price_jpy: base,
        source: "base",
      },
      provenance,
    };
  }

  return {
    raw: {
      ...base_raw,
      price_jpy: null,
      source: null,
      error_reason: inference.confirmed ? "no_price_in_html" : "subdomain_unconfirmed",
    },
    provenance,
  };
}

// ── Batch planner for read() ───────────────────────────────────────────

/**
 * Cap on concurrent in-flight scrapes for DIRECT-access subdomains.
 * Small on purpose: the shared token bucket (default {rps: 4, burst: 8}
 * from the wholesale caller) is the intended limiter — this window only
 * exists so request latency overlaps instead of serializing. Proxied
 * hosts are never batched (see planScrapeBatches).
 */
export const DIRECT_SCRAPE_CONCURRENCY = 4;

/**
 * Group a watch-list into scrape batches. Consecutive entries for which
 * `isParallel` returns true are grouped up to `window` per batch and will
 * be fetched with `Promise.all`; every other entry becomes its own
 * singleton batch (strictly sequential). Pure — order is preserved, every
 * entry appears exactly once.
 */
export function planScrapeBatches<T>(
  entries: readonly T[],
  isParallel: (entry: T) => boolean,
  window: number,
): T[][] {
  const batches: T[][] = [];
  const cap = Math.max(1, Math.floor(window));
  let i = 0;
  while (i < entries.length) {
    if (!isParallel(entries[i])) {
      batches.push([entries[i]]);
      i += 1;
      continue;
    }
    const batch: T[] = [];
    while (
      i < entries.length &&
      batch.length < cap &&
      isParallel(entries[i])
    ) {
      batch.push(entries[i]);
      i += 1;
    }
    batches.push(batch);
  }
  return batches;
}

// ── Normalizer ─────────────────────────────────────────────────────────

function normalizeCardrush(raw: CardRushRaw): NormalizeResult<CanonicalPrice> {
  if (raw.price_jpy === null) {
    return {
      ok: false,
      reason: `cardrush scrape returned no price: ${raw.error_reason ?? "unknown"}`,
    };
  }
  if (!raw.inferred_sku) {
    return {
      ok: false,
      reason: "SKU not provided — cardrush URL → SKU mapping required upstream",
    };
  }
  return {
    ok: true,
    record: {
      sku: raw.inferred_sku,
      currency: "JPY",
      amount: raw.price_jpy.toFixed(0),
      condition: raw.source === "a-minus" ? "A-" : "unspecified",
      sale_type: "retail",
      observed_at: raw.scraped_at,
      retrieved_at: raw.scraped_at,
      upstream_id: raw.url,
    },
  };
}

// ── Source module ──────────────────────────────────────────────────────

export const cardrush: SourceModule<CardRushRaw, CanonicalPrice> = {
  meta: {
    id: "cardrush",
    name: "CardRush (JP)",
    description:
      "Blocked acquisition adapter. Legacy archives contain observations from " +
      "One Piece, Pokémon, Dragon Ball Fusion World, Digimon, Vanguard, and " +
      "Battle Spirits, but no new CardRush network access is permitted until a " +
      "formal written partnership is recorded.",
    upstream: "https://www.cardrush-op.jp",
    catalog_section: "the-tributaries.md#23-cardrush-jp--already-partial",
    access: "scrape",
    license: "internal-only",
    redistribute: false,
    freshness: "price_current",
    canonical_effort: "high",
    status: "blocked",
    games: ["op", "pkm", "dbs", "dbf", "mtg", "ygo", "dmw", "vng", "wei", "fab", "lgr", "bsr"],
    tos_notes:
      `The cross-site policy at ${CARDRUSH_DATA_POLICY_URL} requires contact for a formal partnership and, absent partnership, prohibits automated crawling, scraping, and automated collection of prices or other content across all CardRush-operated sites. Acquisition is hard-disabled; legacy observations remain internal under review.`,
    user_agent_suffix: "(cardrush-ingest)",
    rate_limit: { rps: 0.5, burst: 2 },
    welcome:
      "CardRush, Cambridge previously collected observations without a recorded " +
      "formal partnership. Your published data policy makes the boundary clear: " +
      "automated acquisition is now hard-disabled, scheduled jobs are removed, " +
      "and legacy observations remain internal under review. Reopening requires " +
      "written partnership terms covering the exact collection and use.",
  },

  async *read(ctx: CardRushContext): AsyncIterable<RawRow<CardRushRaw>> {
    if (!CARDRUSH_ACQUISITION_ENABLED) {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "cardrush",
        kind: "error",
        detail: {
          status: "blocked-pending-formal-partnership",
          reason: CARDRUSH_BLOCK_REASON,
          policy: CARDRUSH_DATA_POLICY_URL,
        },
      });
      return;
    }
    const watch_list = ctx.cardrush?.urls ?? [];
    if (watch_list.length === 0) {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "cardrush",
        kind: "start",
        detail: {
          note: "no watch-list provided; read() yields nothing. Use scrapeCardRush(url, ctx) for on-demand.",
        },
      });
      return;
    }

    // Per-access-mode fetcher cache — at most one direct fetcher and one
    // proxied fetcher across the whole run. Each has its own token bucket
    // so direct traffic and unlocker traffic don't share rate limits
    // (the unlocker provider does its own per-IP throttling).
    const cache: CardRushFetcherCache = new Map();

    // Partition the watch-list by access mode for observable budgeting.
    const access_counts: Record<SubdomainAccessMode | "unknown", number> = {
      direct: 0,
      "bright-data-unlocker": 0,
      blocked: 0,
      unknown: 0,
    };
    for (const entry of watch_list) {
      const inf = inferFromUrl(entry.url);
      const key: SubdomainAccessMode | "unknown" = inf.access ?? "unknown";
      access_counts[key] += 1;
    }
    const proxy_configured = resolveProxyUrl(ctx) !== undefined;

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "cardrush",
      kind: "start",
      detail: {
        urls: watch_list.length,
        access_counts,
        proxy_configured,
      },
    });

    let n = 0;
    let n_failed = 0;
    const failure_reasons: Record<string, number> = {};
    const via_proxy_counts: Record<string, number> = {};
    // Per-game success/failure buckets (kingdom-039 step 3). Keyed by the
    // subdomain-inferred GameCode ("unknown" when no subdomain matched) so
    // the operator surface can answer "which game is failing, and why"
    // from ingest_run.events without re-deriving anything.
    const per_game: Record<
      string,
      {
        attempted: number;
        succeeded: number;
        failed: number;
        failure_reasons: Record<string, number>;
      }
    > = {};

    // Direct-host entries scrape in small parallel batches (latency
    // overlap; the shared token bucket still limits the rate). Proxied /
    // unknown entries stay strictly sequential — see the header section
    // "Direct-host concurrency".
    const batches = planScrapeBatches(
      watch_list,
      (entry) => inferFromUrl(entry.url).access === "direct",
      DIRECT_SCRAPE_CONCURRENCY,
    );

    // try/finally so the done event (with per_game) still emits when the
    // consumer closes the generator early — runSource breaks its for-await
    // on ctx.signal abort, which .return()s the generator. Budget-shaped
    // chunked runs abort routinely; their per-game truth must not vanish.
    try {
      for (const batch of batches) {
        if (ctx.signal?.aborted) break;
        const rows =
          batch.length === 1
            ? [await scrapeWithCache(batch[0].url, ctx, cache)]
            : await Promise.all(
                batch.map((entry) => scrapeWithCache(entry.url, ctx, cache)),
              );
        for (let j = 0; j < rows.length; j += 1) {
          const entry = batch[j];
          const row = rows[j];
          if (entry.sku) row.raw.inferred_sku = entry.sku;
          n += 1;
          const game_key = row.raw.inferred_game ?? "unknown";
          const bucket = (per_game[game_key] ??= {
            attempted: 0,
            succeeded: 0,
            failed: 0,
            failure_reasons: {},
          });
          bucket.attempted += 1;
          if (row.raw.price_jpy === null) {
            n_failed += 1;
            const reason = row.raw.error_reason ?? "unknown";
            failure_reasons[reason] = (failure_reasons[reason] ?? 0) + 1;
            bucket.failed += 1;
            bucket.failure_reasons[reason] = (bucket.failure_reasons[reason] ?? 0) + 1;
          } else {
            bucket.succeeded += 1;
          }
          const via = row.provenance.via_proxy ?? "direct";
          via_proxy_counts[via] = (via_proxy_counts[via] ?? 0) + 1;
          yield row;
        }
      }
    } finally {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "cardrush",
        kind: "done",
        detail: {
          rows_yielded: n,
          rows_failed: n_failed,
          aborted: ctx.signal?.aborted ?? false,
          failure_reasons,
          via_proxy_counts,
          per_game,
        },
      });
    }
  },

  normalize: normalizeCardrush,
};
