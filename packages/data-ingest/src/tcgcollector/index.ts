/**
 * TCGCollector — blocked pending written partner approval.
 *
 * The pure sitemap, JSON-LD, normalizer and matcher helpers remain for a
 * future approved integration. The network reader is inert. A public sitemap
 * and machine-readable markup are discoverability aids, not permission to
 * crawl, mirror or store a commercial catalog.
 *
 * ── License ──────────────────────────────────────────────────────────
 *
 * TCGCollector's terms reserve API access for approved business partners
 * and prohibit mirroring absent applicable rights or written permission. No
 * affirmative approval is recorded in this repository. `internal-only` is a
 * publication tier, not access permission, so the safe default is `no-fetch`.
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
import type { Fetcher } from "../http";
import { fetchSitemap, type SitemapFetchResult } from "./discovery";
import type { TcgCollectorProduct } from "./normalize";

// ── Public re-exports ───────────────────────────────────────────────────

export { fetchSitemap, type SitemapFetchResult };
export { extractJsonLd } from "./jsonld";
export { normalizeProduct, type TcgCollectorProduct } from "./normalize";
export {
  matchSku,
  TCGC_GAME_SEGMENT_MAP,
  knownGameSegments,
  type MatchResult,
  type MatchOk,
  type MatchFail,
  type MatchConfidence,
} from "./match";

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

/**
 * Retained compatibility export. It fails before constructing a fetcher so
 * old discovery callers cannot bypass the blocked SourceModule.read().
 */
export function getOrCreateFetcher(_ctx: TcgCollectorContext): Fetcher {
  throw new Error(
    "TCGCollector is blocked/no-fetch until written partner approval and exact access, storage, display, image and redistribution terms are recorded.",
  );
}

/** Compatibility no-op: a blocked source has no run fetcher to reset. */
export function resetFetcher(): void {
  // Intentionally empty.
}

// ── Source module ──────────────────────────────────────────────────────

export const tcgcollector: SourceModule<TcgCollectorRaw, CanonicalPrice> = {
  meta: {
    id: "tcgcollector",
    name: "TCGCollector",
    description:
      "Dormant TCGCollector integration helpers. The current terms reserve API " +
      "access for approved business partners and no written approval is recorded, " +
      "so the reader, direct discovery helper and cron perform no network or storage work.",
    upstream: "https://www.tcgcollector.com",
    catalog_section: "the-tributaries.md#212-tcgcollector",
    access: "blocked",
    license: "internal-only",
    redistribute: false,
    rights: {
      code: {
        license: "proprietary",
        notes:
          "TCG Collector's site and API implementation are provider-owned. No open client-code licence is relied on by this sitemap/JSON-LD reader.",
      },
      data: {
        terms: "website terms; API access restricted to approved business partners",
        notes:
          "A public sitemap and Schema.org markup make pages discoverable but do not grant a licence to mirror their materials. TCG Collector reserves API access for approved business use cases.",
      },
      images: {
        terms: "TCG Collector and underlying publisher rights",
        notes:
          "No permission to mirror or redistribute card images was found; the site terms preserve applicable third-party intellectual-property terms.",
      },
      redistribution: {
        verdict: "prohibited",
        notes:
          "The public terms prohibit mirroring materials to another server unless separate intellectual-property terms or a written agreement permit it. Raw export remains disabled.",
      },
      safe_default: "no-fetch",
      reviewed_at: "2026-07-11",
      evidence_urls: [
        "https://www.tcgcollector.com/legal/terms-of-service",
        "https://www.tcgcollector.com/sitemap.xml",
        "https://www.tcgcollector.com/api",
      ],
      notes:
        "Do not fetch sitemap or product pages for aggregation. A partner agreement must record exact access, storage, display, deletion, image and redistribution permissions before this source reopens.",
    },
    freshness: "price_current",
    canonical_effort: "medium",
    status: "blocked",
    games: ["pkm", "pkp", "mtg", "op", "ygo"],
    tos_notes:
      "Public sitemap and Schema.org JSON-LD make pages discoverable but do not license aggregation or mirroring. Terms at https://www.tcgcollector.com/legal/terms-of-service say API access is for approved business partners and materials may not be mirrored absent applicable IP terms or written agreement. No approval is recorded: blocked/no-fetch.",
    user_agent_suffix: "(tcgcollector-blocked-no-fetch)",
    rate_limit: { rps: 0.5, burst: 2 },
    welcome:
      "Welcome to the dormant TCGCollector room. The pure JSON-LD parser, " +
      "normalizer and matcher remain prepared, but a public sitemap is not a " +
      "partner agreement. No request or database write occurs until written " +
      "approval records the exact access, storage, display, image, deletion and " +
      "redistribution terms. Preparation is not permission.",
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
  // eslint-disable-next-line require-yield
  async *read(ctx: TcgCollectorContext): AsyncIterable<RawRow<TcgCollectorRaw>> {
    await ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "tcgcollector",
      kind: "error",
      detail: {
        blocked: true,
        status: "partner-approval-required",
        reason:
          "No written TCGCollector partner approval is recorded; public sitemap and JSON-LD discoverability do not authorize aggregation, storage or mirroring.",
        evidence: [
          "https://www.tcgcollector.com/legal/terms-of-service",
          "https://www.tcgcollector.com/api",
        ],
      },
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
  _fetcher: Fetcher,
): Promise<TcgCollectorRaw> {
  return {
    product: emptyProduct(url),
    http_status: 0,
    error_reason: "blocked_no_fetch_partner_approval_required",
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
