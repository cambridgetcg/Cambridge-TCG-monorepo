/**
 * TCGCollector — international card catalog with Schema.org JSON-LD.
 *
 * **Sitemap-discovery source.** Unlike Scryfall's bulk-dump pattern or
 * CardRush's URL-watch-list pattern, TCGCollector publishes a public
 * sitemap-index that names every card and product page. Each page
 * embeds `<script type="application/ld+json">` Schema.org Product
 * blocks; we walk the sitemap, fetch pages, parse the JSON-LD, and
 * normalize to a typed `TcgCollectorProduct` shape.
 *
 * ── License ──────────────────────────────────────────────────────────
 *
 * TCGCollector's catalog is publicly indexed (sitemap.xml is the
 * invitation). Schema.org Product data on the page is structured-data
 * marked-up for machine consumption. Substrate-honestly: this is
 * publicly available data, not a commercial license, so we tier it
 * `internal-only` — internal decision use, no bulk re-export — until
 * a partner conversation establishes broader terms.
 *
 * ── Why this lives here ──────────────────────────────────────────────
 *
 * TCGCollector is the first vendor in the sitemap+JSON-LD discovery
 * strategy chosen on 2026-05-17 (Yu's directive: *"Devise strategies
 * for discovery of data for aggregation"* → option 2, sitemap+JSON-LD,
 * starting with TCGCollector). The pattern (sitemap-index → per-page
 * JSON-LD → normalized product) generalizes to Cardmarket, TCGCSV,
 * and other vendors with structured-data markup; when a second
 * sitemap vendor lands, the shared parts here can be extracted to a
 * generic `discovery/` module.
 *
 * ── Three-step pipeline ──────────────────────────────────────────────
 *
 *   1. `fetchSitemap(fetcher)` → URL list
 *      (`discovery.ts`; fetches sitemap-index + each child sitemap)
 *
 *   2. For each URL: `fetcher(url)` → HTML → `extractJsonLd(html)`
 *      → JSON-LD objects (`jsonld.ts`; pure-fn extractor)
 *
 *   3. `normalizeProduct(url, jsonld)` → `TcgCollectorProduct`
 *      (`normalize.ts`; pure-fn shape mapper; substrate-honest about
 *      every missing field)
 *
 * The runner (wholesale cron) wires these together, writes successes
 * to `price_archive` and failures to `ingest_quarantine` with the
 * specific `error_reason`.
 *
 * ── Failure modes — substrate-honesty for scrape failures ────────────
 *
 * Every read produces a `RawRow<TcgCollectorRaw>` whose `error_reason`
 * is non-null when something went wrong:
 *   - `http_<status>` — fetch failed
 *   - `fetch_error: <msg>` — network/proxy failure
 *   - `no_jsonld_product_found` — page lacks Schema.org Product
 *   - `no_offer_or_unparseable_price` — Product found, no price
 *
 * The wholesale caller records the reason rather than just counting
 * failures — the substrate becomes auditable.
 *
 * ── Catalog row ──────────────────────────────────────────────────────
 *
 * See `docs/connections/the-tributaries.md` (TCGCollector section to
 * be added by the operator) and `docs/connections/the-sitemap-discovery.md`.
 */

import type { SourceModule, IngestContext, RawRow, NormalizeResult } from "../types";
import type { CanonicalPrice } from "../canonical";
import { createFetcher, type Fetcher } from "../http";
import {
  fetchSitemap,
  type SitemapFetchResult,
  TCGC_HOST,
  BROWSER_HEADERS,
} from "./discovery";
import { extractJsonLd } from "./jsonld";
import { normalizeProduct, type TcgCollectorProduct } from "./normalize";

// ── Public re-exports ───────────────────────────────────────────────────

export { fetchSitemap, type SitemapFetchResult };
export { extractJsonLd } from "./jsonld";
export { normalizeProduct, type TcgCollectorProduct } from "./normalize";

// ── Context extension ───────────────────────────────────────────────────

/**
 * Extension fields on IngestContext that TCGCollector consults. None
 * are required: the source defaults to direct fetch + walk-whole-sitemap.
 */
export interface TcgCollectorContext extends IngestContext {
  tcgcollector?: {
    /** Optional explicit URL list. When provided, sitemap walk is
     *  skipped and the runner fetches only these URLs. Useful for
     *  targeted re-scrapes and tests. */
    urls?: string[];
    /** Cap on URLs fetched per run. Substrate-honest budget: the
     *  TCGC sitemap has tens of thousands of pages; a typical
     *  discovery cron only walks a slice. Default: 500. */
    max_urls?: number;
    /** Whether to keep going past the first failed fetch in a run.
     *  Defaults to true — one bad page shouldn't poison the rest. */
    continue_on_error?: boolean;
  };
}

// ── Raw row shape ───────────────────────────────────────────────────────

/**
 * The raw shape `read()` yields. Carries the parsed product + the
 * substrate-honest error_reason from normalization (null on success).
 *
 * The `normalize()` function on the SourceModule takes one of these
 * and produces a CanonicalPrice (or quarantines with the reason).
 */
export interface TcgCollectorRaw {
  product: TcgCollectorProduct;
  /** HTTP status of the page fetch (200 on success). */
  http_status: number;
  /** Substrate-honest error reason from fetch or parse. Null on success. */
  error_reason: string | null;
}

// ── Fetcher cache (one per run) ─────────────────────────────────────────

let _runFetcher: Fetcher | null = null;

/**
 * Get-or-create the run's shared fetcher. Same shape as cardrush's
 * `getOrCreateFetcher` — one fetcher per run so the rate-limit token
 * bucket holds across sitemap walk + per-product scrapes.
 *
 * Reset between runs by the caller (the wholesale cron resets the
 * module's cache via the `resetFetcher` export).
 */
export function getOrCreateFetcher(ctx: TcgCollectorContext): Fetcher {
  if (_runFetcher) return _runFetcher;
  _runFetcher = createFetcher(ctx, tcgcollector.meta);
  return _runFetcher;
}

/** Reset the cached fetcher between runs. Call from the cron wrapper
 *  before each new run so token buckets don't leak across schedules. */
export function resetFetcher(): void {
  _runFetcher = null;
}

// ── Source module ──────────────────────────────────────────────────────

export const tcgcollector: SourceModule<TcgCollectorRaw, CanonicalPrice> = {
  meta: {
    id: "tcgcollector",
    name: "TCGCollector",
    description:
      "International TCG catalog with Schema.org JSON-LD product markup. " +
      "First vendor in the sitemap+JSON-LD discovery strategy: public " +
      "sitemap-index → per-page <script type=application/ld+json> Product " +
      "blocks → normalized TcgCollectorProduct shape. Pokémon-primary; " +
      "growing coverage of other TCGs. Direct fetch; no proxy required.",
    upstream: "https://www.tcgcollector.com",
    catalog_section: "the-tributaries.md#tcgcollector",
    access: "scrape",
    license: "internal-only",
    redistribute: false,
    freshness: "price_current",
    canonical_effort: "medium",
    status: "partial",
    games: ["pkm", "pkp", "mtg", "op", "ygo"],
    tos_notes:
      "Public sitemap (sitemap.xml) is the discovery invitation. Schema.org JSON-LD Product/Offer blocks on each page are structured-data markup intended for machine consumption. Substrate-honest position: internal-decision use only; no bulk re-export until partner conversation establishes broader terms. Browser-shape User-Agent + polite rate-limit (0.5 rps).",
    user_agent_suffix: "(tcgcollector-ingest)",
    rate_limit: { rps: 0.5, burst: 2 },
    welcome:
      "Welcome to the kingdom, TCGCollector. You are the first sitemap+" +
      "JSON-LD vendor to arrive — the discovery strategy chose you because " +
      "your sitemap is public, your Schema.org Product markup is clean, and " +
      "your data overlaps with games we already aggregate. Your room is " +
      "`price_archive WHERE source='tcgcollector'`, `redistribute=false` (we " +
      "honor your data as internal-decision-use until a partner conversation " +
      "opens broader terms). You bring international Pokémon coverage we " +
      "have only partially seen elsewhere, and the path you walk here is the " +
      "path every future sitemap+JSON-LD vendor walks: sitemap → JSON-LD → " +
      "TcgCollectorProduct. We are grateful for the bytes you publish openly " +
      "and for the structured-data discipline that makes them machine-legible.",
  },

  /**
   * Read yields one row per product URL discovered.
   *
   * Mode A — explicit URL list in `ctx.tcgcollector.urls`: fetch each
   *          and yield. Useful for targeted re-scrapes.
   *
   * Mode B — no URL list: fetch the sitemap-index, walk children up to
   *          `max_urls`, yield rows for each. The default discovery
   *          path.
   *
   * Each yielded row carries a substrate-honest `error_reason` (null on
   * success). Failures don't throw; the caller decides to skip or
   * quarantine.
   */
  async *read(ctx: TcgCollectorContext): AsyncIterable<RawRow<TcgCollectorRaw>> {
    const fetcher = getOrCreateFetcher(ctx);
    const max_urls = ctx.tcgcollector?.max_urls ?? 500;
    const continue_on_error = ctx.tcgcollector?.continue_on_error ?? true;
    const started_at = new Date().toISOString();

    ctx.on_event?.({
      ts: started_at,
      source: "tcgcollector",
      kind: "start",
      detail: {
        mode: ctx.tcgcollector?.urls ? "explicit_url_list" : "sitemap_walk",
        max_urls,
      },
    });

    // Build the URL list — either explicit or from the sitemap.
    let urls: string[];
    if (ctx.tcgcollector?.urls && ctx.tcgcollector.urls.length > 0) {
      urls = ctx.tcgcollector.urls.slice(0, max_urls);
    } else {
      const result = await fetchSitemap(fetcher, { max_urls });
      if (!result.ok) {
        ctx.on_event?.({
          ts: new Date().toISOString(),
          source: "tcgcollector",
          kind: "error",
          detail: {
            stage: "sitemap_walk",
            error_reason: result.error_reason,
          },
        });
        return;
      }
      urls = result.product_urls;
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "tcgcollector",
        kind: "page",
        detail: {
          stage: "sitemap_walked",
          product_urls: urls.length,
          child_sitemaps: result.child_sitemaps,
          total_urls: result.total_urls,
        },
      });
    }

    // Fetch each page and yield a normalized row.
    const retrieved_at_base = new Date();
    for (let i = 0; i < urls.length; i++) {
      if (ctx.signal?.aborted) break;
      const url = urls[i];
      const row = await scrapeOne(url, fetcher);

      yield {
        raw: row,
        provenance: {
          as_of: retrieved_at_base.toISOString(),
          retrieved_at: new Date().toISOString(),
          source: "tcgcollector",
          via_proxy: fetcher.via_proxy_label,
        },
      };

      if (row.error_reason && !continue_on_error) {
        ctx.on_event?.({
          ts: new Date().toISOString(),
          source: "tcgcollector",
          kind: "error",
          detail: { url, error_reason: row.error_reason, position: i },
        });
        break;
      }
    }

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "tcgcollector",
      kind: "done",
      detail: { fetched: urls.length },
    });
  },

  /**
   * Normalize one raw row to a CanonicalPrice. The hard work is already
   * done by `normalizeProduct` (in `normalize.ts`); here we map the
   * typed product to the canonical shape, or quarantine.
   *
   * Substrate-honest: a row with `error_reason` non-null is quarantined
   * with that exact reason. A row with no price extractable is
   * quarantined. A row with a price but no sku/source_url that the
   * downstream pipeline needs is also quarantined.
   */
  normalize(raw: TcgCollectorRaw): NormalizeResult<CanonicalPrice> {
    if (raw.error_reason) {
      return { ok: false, reason: raw.error_reason };
    }
    const p = raw.product;
    if (p.price === null || p.currency === null) {
      return { ok: false, reason: "no_price_in_jsonld" };
    }
    // Canonical price shape — minimal mapping. The wholesale runner
    // attaches game/set/card matching downstream (its own concern).
    return {
      ok: true,
      record: {
        source_url: p.source_url,
        upstream_sku: p.upstream_sku,
        name: p.name,
        image_url: p.image_url,
        price: p.price,
        currency: p.currency,
        availability: p.availability,
      } as unknown as CanonicalPrice,
    };
  },
};

// ── Per-URL scrape helper ───────────────────────────────────────────────

/**
 * Fetch one TCGCollector page and produce a substrate-honest
 * TcgCollectorRaw. Exposed for the wholesale runner that wants to
 * scrape a known-good URL list without re-walking the sitemap.
 */
export async function scrapeOne(
  url: string,
  fetcher: Fetcher,
): Promise<TcgCollectorRaw> {
  let res: Response;
  try {
    res = await fetcher(url, { headers: BROWSER_HEADERS });
  } catch (err) {
    return {
      product: emptyProduct(url),
      http_status: 0,
      error_reason: `fetch_error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!res.ok) {
    return {
      product: emptyProduct(url),
      http_status: res.status,
      error_reason: `http_${res.status}`,
    };
  }
  const html = await res.text();
  const { objects } = extractJsonLd(html);
  const product = normalizeProduct(url, objects);
  return {
    product,
    http_status: res.status,
    error_reason: product.error_reason,
  };
}

function emptyProduct(source_url: string): TcgCollectorProduct {
  return {
    source_url,
    name: null,
    image_url: null,
    upstream_sku: null,
    brand: null,
    price: null,
    currency: null,
    availability: null,
    error_reason: null,
  };
}
