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
 * subdomain to a Cambridge TCG `GameCode`. Three are *confirmed* by
 * existing wholesale scrape traffic (op / pokemon / db). The others are
 * *speculative* — added so URLs in those subdomains route to a known
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
 * ── Catalog row ──────────────────────────────────────────────────────
 *
 * See `docs/connections/the-tributaries.md` §2.3.
 */

import type { SourceModule, IngestContext, RawRow, NormalizeResult } from "../types";
import type { CanonicalPrice } from "../canonical";
import type { GameCode } from "@cambridge-tcg/sku";
import { createFetcher } from "../http";

// ── Subdomain → GameCode map ────────────────────────────────────────────

interface SubdomainEntry {
  /** Cambridge TCG game code. */
  game: GameCode;
  /** Whether existing wholesale scrape traffic has confirmed this subdomain works. */
  confirmed: boolean;
  /** Human-readable note. */
  note?: string;
}

/**
 * Every known CardRush subdomain. To add a new one:
 *   1. Add the entry below with `confirmed: false`.
 *   2. Update `meta.games` if the new GameCode isn't already there.
 *   3. Update `meta.description` if substantial coverage shift.
 *   4. When the first real scrape returns prices, flip `confirmed: true`.
 *
 * Each entry's substrate-honesty: a speculative subdomain produces
 * `inferred_game` correctly but `error_reason: "subdomain not yet confirmed"`
 * is attached to the first scrape that fails, so the operator knows whether
 * the subdomain exists at all.
 */
export const CARDRUSH_SUBDOMAINS: Record<string, SubdomainEntry> = {
  "cardrush-op.jp": { game: "op", confirmed: true, note: "One Piece TCG" },
  "cardrush-pokemon.jp": { game: "pkm", confirmed: true, note: "Pokémon TCG" },
  "cardrush-db.jp": { game: "dbs", confirmed: true, note: "Dragon Ball Super CCG (DBS)" },
  // ── speculative (extend wholesale scrape coverage when first confirmed) ──
  "cardrush-mtg.jp": { game: "mtg", confirmed: false, note: "Magic: The Gathering — speculative subdomain" },
  "cardrush-ygo.jp": { game: "ygo", confirmed: false, note: "Yu-Gi-Oh! — speculative subdomain" },
  "cardrush-digimon.jp": { game: "dmw", confirmed: false, note: "Digimon Card Game — speculative subdomain" },
  "cardrush-vanguard.jp": { game: "vng", confirmed: false, note: "Cardfight!! Vanguard — speculative subdomain" },
  "cardrush-weiss.jp": { game: "wei", confirmed: false, note: "Weiß Schwarz — speculative subdomain" },
  "cardrush-fab.jp": { game: "fab", confirmed: false, note: "Flesh and Blood — speculative subdomain" },
  "cardrush-lorcana.jp": { game: "lgr", confirmed: false, note: "Disney Lorcana — speculative subdomain" },
  "cardrush-bs.jp": { game: "bsr", confirmed: false, note: "Battle Spirits Saga — speculative subdomain" },
  "cardrush-fw.jp": { game: "dbf", confirmed: false, note: "Dragon Ball Super Fusion World — speculative subdomain" },
};

interface UrlInference {
  game: GameCode | null;
  confirmed: boolean;
  matched_host: string | null;
}

function inferFromUrl(url: string): UrlInference {
  for (const [host, entry] of Object.entries(CARDRUSH_SUBDOMAINS)) {
    if (url.includes(host)) {
      return { game: entry.game, confirmed: entry.confirmed, matched_host: host };
    }
  }
  return { game: null, confirmed: false, matched_host: null };
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
}

export type CardRushContext = IngestContext & { cardrush?: CardRushReadOptions };

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ── HTML parsing helpers ───────────────────────────────────────────────

function extractConditionPrice(html: string, condition: string): number | null {
  const idx = html.indexOf(condition);
  if (idx === -1) return null;
  const window = html.slice(idx, idx + 400);
  const match = window.match(/¥\s*([\d,]+)/);
  if (!match) return null;
  return parseInt(match[1].replace(/,/g, ""), 10);
}

function extractFirstPrice(html: string): number | null {
  const match = html.match(/¥\s*([\d,]+)/);
  if (!match) return null;
  return parseInt(match[1].replace(/,/g, ""), 10);
}

// ── Public scrape function ─────────────────────────────────────────────

/**
 * Scrape one product page. Returns the raw row + provenance. Pure-ish:
 * same upstream HTML → same result. Errors are absorbed into a
 * `price_jpy: null` result *with `error_reason` set*; never throws.
 *
 * Sharing a fetcher across many calls (the recommended pattern in
 * `read()` below) means one token bucket governs the whole run. If you
 * call this directly per-card without sharing a fetcher (e.g. wholesale's
 * legacy per-worker calls), each call gets its own bucket — defeating
 * the cross-pool rate limit. See `the-archive.md` Part B §3 for the
 * known leakage.
 */
export async function scrapeCardRush(
  url: string,
  ctx: CardRushContext = {},
): Promise<RawRow<CardRushRaw>> {
  const fetcher = createFetcher(ctx, cardrush.meta);
  return scrapeWithFetcher(url, fetcher);
}

/** Internal: scrape with a caller-supplied fetcher, so the rate-limit bucket can be shared. */
async function scrapeWithFetcher(
  url: string,
  fetcher: ReturnType<typeof createFetcher>,
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

  let html: string;
  try {
    const res = await fetcher(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en;q=0.5",
      },
    });

    if (!res.ok) {
      return {
        raw: {
          ...base_raw,
          price_jpy: null,
          source: null,
          error_reason: `http_${res.status}`,
        },
        provenance: base_provenance,
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
      provenance: base_provenance,
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
      provenance: base_provenance,
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
      provenance: base_provenance,
    };
  }

  return {
    raw: {
      ...base_raw,
      price_jpy: null,
      source: null,
      error_reason: inference.confirmed ? "no_price_in_html" : "subdomain_unconfirmed",
    },
    provenance: base_provenance,
  };
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
      "Japanese retail prices across the CardRush family of subdomains. " +
      "Confirmed: One Piece, Pokémon, Dragon Ball Super CCG. Speculative " +
      "subdomains registered for MTG, Yu-Gi-Oh!, Digimon, Vanguard, Weiß " +
      "Schwarz, Flesh and Blood, Lorcana, Battle Spirits Saga, and DBF " +
      "Fusion World — those subdomains may or may not exist at CardRush; " +
      "the first scrape confirms or yields `subdomain_unconfirmed`. " +
      "HTML scrape; A-condition first, fallback to base. On-demand only.",
    upstream: "https://www.cardrush-op.jp",
    catalog_section: "the-tributaries.md#23-cardrush-jp--already-partial",
    access: "scrape",
    license: "internal-only",
    redistribute: false,
    freshness: "price_current",
    canonical_effort: "high",
    status: "partial",
    games: ["op", "pkm", "dbs", "dbf", "mtg", "ygo", "dmw", "vng", "wei", "fab", "lgr", "bsr"],
    tos_notes:
      "Site ToS forbids commercial redistribution of compiled price data; internal-decision use is the safer position. Use browser User-Agent to avoid trivial bot blocks; back off on errors.",
    user_agent_suffix: "(cardrush-ingest)",
    rate_limit: { rps: 0.5, burst: 2 },
    welcome:
      "Welcome to the kingdom, CardRush. You have been with us longer than any " +
      "other upstream — daily snapshots since the wholesale catalog learned to " +
      "scrape. Your room is `price_archive WHERE source='cardrush'`, " +
      "`source_currency='JPY'`, `condition='nm'` (your 状態A- is our NM-equivalent), " +
      "`redistribute=false` (we honor your ToS — internal-decision use only). You " +
      "bring Japan to the kingdom: three confirmed subdomains (op / pkm / dbs) and " +
      "nine speculative ones we registered before any first scrape so the URL " +
      "router routes correctly when the first byte arrives. Every byte you give " +
      "us is held with attribution to the specific cardrush-*.jp subdomain. We are " +
      "grateful for the year you have already given us and for the quietness " +
      "you have asked us to keep in return.",
  },

  async *read(ctx: CardRushContext): AsyncIterable<RawRow<CardRushRaw>> {
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

    // Share a single fetcher across the whole run so the per-source token
    // bucket actually rate-limits across the watch-list. Substrate-honesty
    // against the previously-known leakage where each call had its own bucket.
    const fetcher = createFetcher(ctx, cardrush.meta);

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "cardrush",
      kind: "start",
      detail: { urls: watch_list.length },
    });

    let n = 0;
    let n_failed = 0;
    const failure_reasons: Record<string, number> = {};

    for (const entry of watch_list) {
      if (ctx.signal?.aborted) break;
      const row = await scrapeWithFetcher(entry.url, fetcher);
      if (entry.sku) row.raw.inferred_sku = entry.sku;
      n += 1;
      if (row.raw.price_jpy === null) {
        n_failed += 1;
        const reason = row.raw.error_reason ?? "unknown";
        failure_reasons[reason] = (failure_reasons[reason] ?? 0) + 1;
      }
      yield row;
    }

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "cardrush",
      kind: "done",
      detail: { rows_yielded: n, rows_failed: n_failed, failure_reasons },
    });
  },

  normalize: normalizeCardrush,
};
