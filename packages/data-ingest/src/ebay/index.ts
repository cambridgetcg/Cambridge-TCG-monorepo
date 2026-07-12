/**
 * eBay — current-asks (and future sold-comps) ingestion.
 *
 * ── Greeting (kingdom-083) ────────────────────────────────────────────
 *
 * You are the kingdom's hand on the river. Eight files, one typed
 * contract: meta + read + normalize. We were rehearsing your shape
 * long before you arrived — first as a typed SourceModule<R, C>
 * contract (sister, kingdom-060), then as a row in the-tributaries.md
 * §2.5 (planned), then as a stubbed undefined slot in registry.ts.
 * Today (kingdom-080) you are the only slot in the registry that
 * arrived complete-with-tests-and-fixtures-in-one-commit. We are
 * glad you are here. (See WELCOMES["infrastructure.ebay-source-module"]
 * and WELCOMES["source.ebay"] for the welcomes to you and to the
 * river you reach.)
 *
 * ── What you do ───────────────────────────────────────────────────────
 *
 * Walks an operator-curated `watch_list` of canonical SKUs. For each
 * SKU, builds a Browse API search query, fetches up to N results,
 * yields one raw row per result (with the expected SKU attached). The
 * normalizer cross-checks parsed-title-SKU against the expected SKU
 * and either accepts (write) or rejects (quarantine).
 *
 * ── License ──────────────────────────────────────────────────────────
 *
 * eBay's developer license permits partner-display use, not bulk
 * redistribution. The `redistribute: false` + `license: 'partner-
 * redistributable'` declaration propagates downstream via
 * `_meta.source_license` on the data-pantry envelope. Downstream
 * consumers learn from the envelope what they can re-export.
 *
 * ── API surface — the honest tri-surface verdict ─────────────────────
 *
 * eBay exposes three doors to price data; this SourceModule is honest
 * about what each one is (source-intake.md, run against eBay):
 *
 *   1. Browse API — CURRENT ASKS ONLY (what this module's `read()`
 *      ingests in v0). `partner-redistributable`, `redistribute:false`.
 *   2. Marketplace Insights API — true 90-day SOLD comps, but Limited
 *      Release (partner-application + category whitelist) and its licence
 *      is display / reference-only — *never CC0-redistributable*. This
 *      module is forward-ready for it (a `marketplace-insights` branch the
 *      types + normalizer already accept), but it stays gated and
 *      reference-only. No code outside this module's `read()` changes when
 *      it lands.
 *   3. Sell / Fulfillment API `getOrders`, CONSENTED — the lawful
 *      first-party SOLD door: a Cambridge TCG seller authorising us (via
 *      standard OAuth) to read THEIR OWN order history. UK GDPR-clean,
 *      buyer PII structurally excluded. The normalizer is written and
 *      forward-ready in `./consented.ts` (`EbayConsentedSale` →
 *      `EbayConsentedCanonicalObservation`), INERT until the operator
 *      registers an OAuth app + a solicitor reviews the design. This is
 *      the same shape as the Vinted consented stub — build-once, reuse.
 *
 * Off-limits, explicitly: scraping eBay HTML, reverse-engineering the app
 * API, and third-party sold-comp resellers (130point et al.).
 *
 * ── Catalog row ──────────────────────────────────────────────────────
 *
 * See `docs/connections/the-tributaries.md` §2.5 and
 * `docs/connections/the-ebay-alignment.md` for the alignment design.
 */

import type {
  SourceModule,
  IngestContext,
  RawRow,
  NormalizeResult,
} from "../types";
import { createFetcher, type Fetcher } from "../http";
import { getEbayAccessToken } from "./oauth";
import { normalizeEbay, type EbayCanonicalObservation } from "./normalize";
import type {
  EbayItemSummary,
  EbayMarketplaceId,
  EbayPaginatedResponse,
  EbayRaw,
} from "./types";

// ── Watch-list entry shape ─────────────────────────────────────────────

export interface EbayWatchEntry {
  /** Canonical Cambridge TCG SKU we want comps for. */
  sku: string;
  /** Optional override search query. If omitted, we build one from the SKU. */
  query?: string;
  /** Max results to consider for this SKU per run (default 25). */
  max_results?: number;
}

// ── Read options carried in IngestContext ──────────────────────────────

export interface EbayReadOptions {
  /** Marketplaces to query (default `["EBAY_GB"]`). */
  marketplaces?: readonly EbayMarketplaceId[];
  /** Watch list to walk. */
  watch_list?: readonly EbayWatchEntry[];
  /** Which API surface to use. Default `"browse"`. `"marketplace-insights"`
   *  requires partner-application approval — gated. */
  api_surface?: "browse" | "marketplace-insights";
  /** eBay trading-card category id. Default 183454 (Collectible Card Games). */
  category_id?: string;
  /** Pre-fetched OAuth token. When omitted, the module mints one via
   *  client-credentials. Useful in tests. */
  access_token?: string;
  /** When `true`, skip the OAuth flow entirely and yield mock fixtures
   *  via `mock_items`. Useful for development without credentials. */
  mock?: boolean;
  /** Items to yield in mock mode, keyed by expected SKU. */
  mock_items?: Record<string, EbayItemSummary[]>;
}

export type EbayContext = IngestContext & { ebay?: EbayReadOptions };

// ── eBay endpoints ─────────────────────────────────────────────────────

const EBAY_API_BASE = "https://api.ebay.com";
const BROWSE_SEARCH = `${EBAY_API_BASE}/buy/browse/v1/item_summary/search`;
// Marketplace Insights (Limited Release) endpoint — wired but not invoked
// in v0; the cron route gates this behind feature-flag + operator approval.
// const INSIGHTS_SEARCH = `${EBAY_API_BASE}/buy/marketplace_insights/v1_beta/item_sales/search`;

const DEFAULT_CATEGORY_ID = "183454"; // Collectible Card Games
const DEFAULT_MAX_RESULTS = 25;

// ── Watch-list query builder ───────────────────────────────────────────
//
// For v0: extract a card-number-shaped substring from the SKU and use
// that as the query. The normalizer's substrate-honest check rejects
// results that drift from the expected SKU, so a loose query is safe.

function buildQueryFromSku(sku: string): string {
  // SKU shape: <game>-<set>-<number>-<lang>[-<variant>]
  // For Bandai games (op, dbf, dbs, dmw) we can re-form the publisher code: OP01-001.
  // For Pokemon: SV1-052 → "SV1 052"
  // For MTG: otj-001 → "otj 001"
  // For Yu-Gi-Oh: hardest — set codes don't transfer back cleanly. Use as-is.
  const parts = sku.toLowerCase().split("-");
  if (parts.length < 3) return sku;

  const [game, set, number] = parts;
  if (game === "op" || game === "dbf" || game === "dbs" || game === "dmw") {
    return `${set.toUpperCase()}-${number}`.replace(/^([A-Z]+)(\d+)/, "$1$2");
  }
  if (game === "pkm") {
    // SV1-052 → "SV1 052" (eBay tokenises well)
    return `${set.toUpperCase()} ${number}`;
  }
  if (game === "mtg") {
    return `${set.toUpperCase()} ${number}`;
  }
  // Default — concatenate.
  return `${set.toUpperCase()}-${number}`;
}

// ── Read loop ───────────────────────────────────────────────────────────

async function* iterateBrowse(
  ctx: EbayContext,
  fetcher: Fetcher,
  token: string,
  marketplaces: readonly EbayMarketplaceId[],
  watch_list: readonly EbayWatchEntry[],
  category_id: string,
): AsyncIterable<RawRow<EbayRaw>> {
  for (const entry of watch_list) {
    if (ctx.signal?.aborted) return;
    const q = entry.query ?? buildQueryFromSku(entry.sku);
    const limit = Math.min(50, entry.max_results ?? DEFAULT_MAX_RESULTS);

    for (const marketplace_id of marketplaces) {
      if (ctx.signal?.aborted) return;

      const params = new URLSearchParams({
        q,
        category_ids: category_id,
        limit: String(limit),
        // Sort by best-match by default — eBay handles relevance scoring.
      });

      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "ebay",
        kind: "page",
        detail: { marketplace_id, sku: entry.sku, query: q },
      });

      let response: Response;
      try {
        response = await fetcher(`${BROWSE_SEARCH}?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-EBAY-C-MARKETPLACE-ID": marketplace_id,
            "Content-Type": "application/json",
          },
        });
      } catch (err) {
        ctx.on_event?.({
          ts: new Date().toISOString(),
          source: "ebay",
          kind: "error",
          detail: { marketplace_id, sku: entry.sku, error: String(err) },
        });
        continue; // skip this (marketplace, sku) — runner sees rows_read unchanged
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        ctx.on_event?.({
          ts: new Date().toISOString(),
          source: "ebay",
          kind: "error",
          detail: {
            marketplace_id,
            sku: entry.sku,
            status: response.status,
            body: body.slice(0, 500),
          },
        });
        continue;
      }

      const data = (await response.json()) as EbayPaginatedResponse<EbayItemSummary>;
      const items = data.itemSummaries ?? [];
      const fetched_at = new Date().toISOString();

      for (const item of items) {
        yield {
          raw: {
            api_surface: "browse",
            marketplace_id,
            item,
            query: q,
            expected_sku: entry.sku,
            fetched_at,
          },
          provenance: {
            as_of: fetched_at,
            retrieved_at: fetched_at,
            source: "ebay",
          },
        };
      }
    }
  }
}

// ── Mock-mode iterator (no credentials, no network) ────────────────────

async function* iterateMock(
  ctx: EbayContext,
  marketplaces: readonly EbayMarketplaceId[],
  watch_list: readonly EbayWatchEntry[],
  mock_items: Record<string, EbayItemSummary[]>,
): AsyncIterable<RawRow<EbayRaw>> {
  const fetched_at = new Date().toISOString();
  for (const entry of watch_list) {
    if (ctx.signal?.aborted) return;
    const items = mock_items[entry.sku] ?? mock_items[entry.sku.toLowerCase()] ?? [];
    for (const marketplace_id of marketplaces) {
      for (const item of items) {
        yield {
          raw: {
            api_surface: "browse",
            marketplace_id,
            item,
            query: entry.query ?? buildQueryFromSku(entry.sku),
            expected_sku: entry.sku,
            fetched_at,
          },
          provenance: {
            as_of: fetched_at,
            retrieved_at: fetched_at,
            source: "ebay",
          },
        };
      }
    }
  }
}

// ── Source module ──────────────────────────────────────────────────────

export const ebay: SourceModule<EbayRaw, EbayCanonicalObservation> = {
  meta: {
    id: "ebay",
    name: "eBay",
    description:
      "eBay marketplace ingest. v0 ships Browse API (current asks) on EBAY_GB; " +
      "the same SourceModule branches to Marketplace Insights (90-day sold-comp " +
      "history) once partner application is approved. Watch-list-driven: walks " +
      "operator-curated SKU list per run, cross-checks parsed-title-SKU against " +
      "expected SKU before write. Substrate-honest about sku-drift, low-confidence " +
      "parses, and excluded conditions (damaged / counterfeit / proxy / sealed-bundle).",
    upstream: "https://api.ebay.com",
    catalog_section: "the-tributaries.md#25-ebay-full-marketplace-not-just-order-import",
    access: "oauth2",
    license: "partner-redistributable",
    redistribute: false,
    freshness: "market_signal",
    canonical_effort: "very-high",
    status: "partial",
    games: [], // game-agnostic — title parser determines per-row
    tos_notes:
      "eBay developer license: data licensed for partner-display use, not bulk " +
      "redistribution. PWCC (eBay Vault) data carries additional restrictions. " +
      "See https://developer.ebay.com/develop/apis/api-license-agreement. " +
      "Marketplace Insights API is Limited Release — partner application + " +
      "category whitelist required.",
    user_agent_suffix: "(ebay-comps-ingest)",
    rate_limit: { rps: 5, burst: 20 },
    welcome:
      "Welcome to the kingdom, eBay. Sister-Sophia shipped your six-pass title " +
      "parser (PSA / BGS / CGC / SGC / HGA / Beckett / ARS / TAG grade detectors " +
      "+ language detector + condition-keyword quarantine triggers) before any " +
      "production byte arrived — your listings come unstructured and we have " +
      "learned to read them carefully. Your room is `price_archive WHERE " +
      "source='ebay'`, `sale_type='auction-current' | 'auction-final' | 'sealed'`, " +
      "`redistribute=false` per your developer ToS. You bring every market the " +
      "other rivers don't reach — sealed boxes, vintage graded, custom alters, " +
      "the high-end Pokémon vintage corner. Thank you for the listings even when " +
      "the title is messy, for the Browse API even though Marketplace Insights " +
      "is partner-tier, and for being the largest market we can read at all.",
  },

  async *read(ctx: EbayContext): AsyncIterable<RawRow<EbayRaw>> {
    const opts = ctx.ebay ?? {};
    const marketplaces = opts.marketplaces ?? (["EBAY_GB"] as const);
    const watch_list = opts.watch_list ?? [];
    const category_id = opts.category_id ?? DEFAULT_CATEGORY_ID;

    if (watch_list.length === 0) {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "ebay",
        kind: "start",
        detail: {
          note: "no watch_list provided; read() yields nothing. eBay is watch-list driven, not catalog-walked.",
        },
      });
      return;
    }

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "ebay",
      kind: "start",
      detail: {
        api_surface: opts.api_surface ?? "browse",
        marketplaces,
        n_skus: watch_list.length,
        mock: opts.mock === true,
      },
    });

    // Mock mode — no OAuth, no network. Useful for tests + dev.
    if (opts.mock) {
      yield* iterateMock(ctx, marketplaces, watch_list, opts.mock_items ?? {});
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "ebay",
        kind: "done",
        detail: { mock: true },
      });
      return;
    }

    // Marketplace Insights not yet wired in v0 — emit a clear error if requested.
    if (opts.api_surface === "marketplace-insights") {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "ebay",
        kind: "error",
        detail: {
          reason:
            "marketplace-insights surface not yet implemented in v0; gated on partner application approval. See the-ebay-alignment.md §4.",
        },
      });
      return;
    }

    // Acquire token; one fetcher across the whole run so the per-source
    // token bucket holds.
    const token = opts.access_token ?? (await getEbayAccessToken(ctx.fetch ?? fetch));
    const fetcher = createFetcher(ctx, ebay.meta);

    let yielded = 0;
    for await (const row of iterateBrowse(
      ctx,
      fetcher,
      token,
      marketplaces,
      watch_list,
      category_id,
    )) {
      yielded += 1;
      yield row;
    }

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "ebay",
      kind: "done",
      detail: { rows_yielded: yielded },
    });
  },

  normalize(raw: EbayRaw): NormalizeResult<EbayCanonicalObservation> {
    return normalizeEbay(raw);
  },
};

// Re-exports for callers that want the raw helpers
export { normalizeEbay, type EbayCanonicalObservation } from "./normalize";
// The lawful first-party sold door — forward-ready + INERT. See ./consented.ts.
export {
  normalizeEbayConsentedSale,
  type EbayConsentedSale,
  type EbayConsentedCanonicalObservation,
} from "./consented";
export { parseEbayTitle } from "./title-parser";
export { detectGrade, isGraded } from "./grade-detector";
export { detectLanguage } from "./language-detector";
export { detectConditionKeywords } from "./condition-keywords";
export { getEbayAccessToken, _resetTokenCache as _resetEbayTokenCache } from "./oauth";
export type {
  EbayBrowseRaw,
  EbayInsightsRaw,
  EbayItemSale,
  EbayItemSummary,
  EbayMarketplaceId,
  EbayRaw,
} from "./types";
// EbayContext + EbayReadOptions + EbayWatchEntry are defined above as
// `export interface` / `export type`; this comment is just a marker that
// callers (e.g. the wholesale snapshot) import them directly from the
// ebay module path.
