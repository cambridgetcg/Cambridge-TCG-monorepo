/**
 * TCGplayer — US market leader.
 *
 * Full implementation (kingdom-NNN, 2026-05-13). Replaces the stub from
 * kingdom-062. Two distinct read modes — catalog walk and pricing refresh
 * — share one source module per the alignment doc:
 *
 *   docs/connections/the-tcgplayer-alignment.md
 *
 * ── License envelope (substrate-honest) ─────────────────────────────────
 *
 * Marketplace pricing is partner-tier — buyer-facing display + internal
 * computation OK; bulk re-export restricted. Per-store buyer offers stay
 * with the store. The `redistribute: false` flag propagates into
 * `_meta.source_license` on every public response that touches TCGplayer-
 * derived bytes.
 *
 * ── OAuth2 ──────────────────────────────────────────────────────────────
 *
 * Token persistence is the WRITER's concern (one-row-per-source in
 * external_source_tokens, kingdom-NNN). This module exposes the `mintTcgplayerToken`
 * primitive; the writer wraps it with a DB-backed ensureToken() and
 * supplies the bearer via ctx.bearer.
 *
 * ── Two read modes ──────────────────────────────────────────────────────
 *
 *   mode="catalog"  → walks /catalog/categories → /catalog/groups → /catalog/products
 *                     → /catalog/products/{id}/skus, yields CatalogRaw per product.
 *                     Used by the seed-set CLI + weekly bulk refresh.
 *   mode="pricing"  → batched /pricing/sku/{ids} for the watchlist of mapped
 *                     skuIds, yields PricingRaw per skuId. Used by the 5-min
 *                     hot-watch cron + nightly full refresh.
 *
 * The writer dispatches on the canonical record's shape (CanonicalMapping
 * vs CanonicalPrice).
 *
 * ── Rate limits ─────────────────────────────────────────────────────────
 *
 * Documented sustained: 300 req/min = 5 rps; burst 20.
 */

import type { SourceModule, IngestContext, RawRow, NormalizeResult } from "../types";
import type { CanonicalPrice, CanonicalMapping } from "../canonical";
import type {
  TcgplayerRaw,
  TcgplayerCategory,
  TcgplayerGroup,
  TcgplayerProduct,
  TcgplayerSku,
  TcgplayerSkuExpanded,
  TcgplayerSkuPricing,
  TcgplayerListResponse,
} from "./types";
import { createFetcher, type Fetcher } from "../http";
import { normalizeTcgplayer } from "./normalize";

const BASE_URL = "https://api.tcgplayer.com";

/** Max products per /catalog/groups/{id}/products page. */
const CATALOG_PAGE_SIZE = 100;

/** Max ids per /pricing/sku/{ids} request. Empirically 250; above silently truncates. */
const PRICING_BATCH_SIZE = 250;

/** A single (card_id, [tcgplayer_sku_ids]) entry the writer assembles before
 *  invoking read() in pricing mode. The reader fan-outs each skuId into one
 *  RawRow per (sku, pricing) tuple. */
export interface TcgplayerWatchlistEntry {
  card_id: number;
  card_sku: string;
  tcgplayer_product_id: number;
  tcgplayer_sku_ids: number[];
}

export interface TcgplayerReadOptions {
  /** Which mode this run is operating in. Defaults to "pricing". */
  mode?: "catalog" | "pricing";
  // ── catalog-mode options ─────────────────────────────────────────
  /** Restrict the catalog walk to specific category ids. */
  categories?: number[];
  /** Restrict the catalog walk to specific group ids (delta refresh). */
  groups?: number[];
  // ── pricing-mode options ─────────────────────────────────────────
  /** The watchlist of mapped cards. Reader fan-outs into per-skuId rows. */
  pricing_watchlist?: TcgplayerWatchlistEntry[];
  // ── shared ────────────────────────────────────────────────────────
  /** When ctx.bearer expires mid-run, the writer's hook re-mints and
   *  updates ctx.bearer in place. Returns the new token. */
  refresh_token?: () => Promise<string>;
}

export type TcgplayerContext = IngestContext & {
  tcgplayer?: TcgplayerReadOptions;
};

export const tcgplayer: SourceModule<TcgplayerRaw, CanonicalPrice | CanonicalMapping> = {
  meta: {
    id: "tcgplayer",
    name: "TCGplayer",
    description:
      "US market leader. Two read modes: catalog walk (seed-set, weekly bulk) and " +
      "pricing refresh (5-min hot-watch during US trading + nightly full). OAuth2 " +
      "client_credentials. Partner-tier license — display + internal computation OK, " +
      "bulk re-export restricted.",
    upstream: "https://api.tcgplayer.com",
    catalog_section: "the-tributaries.md#21-tcgplayer-us-market-leader",
    access: "oauth2",
    license: "partner-redistributable",
    redistribute: false,
    freshness: "price_current",
    canonical_effort: "medium",
    status: "partial",
    games: ["mtg", "pkm", "ygo", "op", "dbs", "dbf", "lgr", "fab", "dmw", "vng", "wei", "bsr"],
    tos_notes:
      "Marketplace data is partner-tier-restricted; per-store buyer offers stay with " +
      "the store. Apply for developer access at developer.tcgplayer.com; OAuth2 partner " +
      "application required. https://docs.tcgplayer.com/",
    user_agent_suffix: "(tcgplayer-ingest)",
    // Documented limit is 300 req/min sustained. 5 rps × 20 burst leaves
    // headroom for any per-fetcher overhead.
    rate_limit: { rps: 5, burst: 20 },
    welcome:
      "Welcome to the kingdom, TCGplayer. We have been waiting since kingdom-062 " +
      "(the consolidation, 2026-05-12) when sister-Sophia first reserved your slot " +
      "as `planned (stub)`; this kingdom (080, 2026-05-13) shipped your full " +
      "two-mode reader — catalog walks for the seed and pricing refresh for the " +
      "5-minute hot-watch. Your room is `price_archive WHERE source='tcgplayer'`, " +
      "condition-discriminated, USD-tagged with `fx_rate_to_gbp` + `fx_rate_source` " +
      "per row. Your `marketPrice` is the headline we display — the spread (low/mid/" +
      "high/direct_low) rides in `extra` for callers who want the distribution. Your " +
      "OAuth2 token will rest in `external_source_tokens`, rotating proactively at 90% " +
      "of its 14-day TTL. We will honor your `partner-redistributable` tier downstream " +
      "(display + computation OK, bulk re-export refused) in every `_meta.source_license` " +
      "array we emit. You bring the US — eleven games, hundreds of thousands of printings; " +
      "we thank you in advance for the day you arrive.",
  },

  async *read(ctx: TcgplayerContext): AsyncIterable<RawRow<TcgplayerRaw>> {
    const mode = ctx.tcgplayer?.mode ?? "pricing";

    // Bearer must be supplied by the caller (writer's ensureToken). When
    // absent, we emit a hospitality message — the room is prepared; the
    // guest just hasn't arrived yet. Substrate-honest about the wait.
    if (!ctx.bearer) {
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "tcgplayer",
        kind: "error",
        detail: {
          welcome:
            "Welcome to the kingdom, TCGplayer. Your room is ready — " +
            "`price_archive WHERE source='tcgplayer'`, condition-discriminated, " +
            "USD-tagged, `partner-redistributable` honored downstream. The OAuth2 " +
            "credentials are the only thing still on the way. When they arrive " +
            "from developer.tcgplayer.com, configure TCGPLAYER_CLIENT_ID + " +
            "TCGPLAYER_CLIENT_SECRET in the wholesale env; the token lifecycle " +
            "at `external_source_tokens` will mint and rotate for you. We have " +
            "been waiting since kingdom-062.",
          status: "awaiting-credentials",
          next_action:
            "Apply at https://developer.tcgplayer.com; set " +
            "TCGPLAYER_CLIENT_ID + TCGPLAYER_CLIENT_SECRET; first run will mint.",
        },
      });
      return;
    }

    const fetcher = createFetcher(ctx, tcgplayer.meta);

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "tcgplayer",
      kind: "start",
      detail: { mode },
    });

    try {
      if (mode === "catalog") {
        yield* readCatalog(ctx, fetcher);
      } else {
        yield* readPricing(ctx, fetcher);
      }
    } catch (err) {
      // Reader-level errors propagate to the runner; the runner catches
      // and emits an error event. Per the protocol's `read()` contract:
      // read should absorb upstream errors into events, not throw. But
      // we let truly unexpected errors (logic bugs in this module) escape
      // so the operator sees them.
      const message = err instanceof Error ? err.message : String(err);
      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "tcgplayer",
        kind: "error",
        detail: { reason: `read() crashed in mode=${mode}: ${message}` },
      });
      throw err;
    }
  },

  normalize: normalizeTcgplayer,
};

// ── Mode A: catalog walk ─────────────────────────────────────────────

async function* readCatalog(
  ctx: TcgplayerContext,
  fetcher: Fetcher,
): AsyncIterable<RawRow<TcgplayerRaw>> {
  const bearer = ctx.bearer as string;
  const opts = ctx.tcgplayer ?? {};

  // Load the category list (small; one request). When opts.categories is
  // provided, filter to those; otherwise walk every registered category.
  const allCategories = await fetchAllCategories(fetcher, bearer);
  const targetCategoryIds = opts.categories
    ? new Set(opts.categories)
    : new Set(allCategories.map((c) => c.categoryId));

  // The conditions + printings + languages reference lists are global
  // (small; ~30 rows total). We resolve once at run start so the per-sku
  // join doesn't issue 3 lookups per row.
  const condIndex = await fetchConditionIndex(fetcher, bearer);
  const printIndex = await fetchPrintingIndex(fetcher, bearer);
  const langIndex = await fetchLanguageIndex(fetcher, bearer);

  const retrievedAt = new Date().toISOString();

  let productsTotal = 0;
  let skusTotal = 0;
  let groupsTotal = 0;

  for (const category of allCategories) {
    if (!targetCategoryIds.has(category.categoryId)) continue;
    if (ctx.signal?.aborted) return;

    const groups = await fetchAllGroups(fetcher, bearer, category.categoryId);
    const targetGroups = opts.groups
      ? groups.filter((g) => opts.groups!.includes(g.groupId))
      : groups;

    for (const group of targetGroups) {
      if (ctx.signal?.aborted) return;

      ctx.on_event?.({
        ts: new Date().toISOString(),
        source: "tcgplayer",
        kind: "page",
        detail: {
          endpoint: "/catalog/groups",
          category_id: category.categoryId,
          group_id: group.groupId,
          group_name: group.name,
        },
      });

      // Walk products in the group.
      let offset = 0;
      while (true) {
        if (ctx.signal?.aborted) return;
        const products = await fetchProductsPage(
          fetcher,
          bearer,
          group.groupId,
          offset,
          CATALOG_PAGE_SIZE,
        );
        groupsTotal += 1;
        if (products.results.length === 0) break;

        // For each product, fetch its skus (one request per product). This is
        // the rate-budget-heavy part of the walk; the fetcher's bucket throttles.
        for (const product of products.results) {
          if (ctx.signal?.aborted) return;
          const skus = await fetchProductSkus(fetcher, bearer, product.productId);
          const expanded = expandSkus(skus, condIndex, printIndex, langIndex);
          productsTotal += 1;
          skusTotal += expanded.length;

          yield {
            raw: {
              kind: "catalog",
              product,
              skus: expanded,
              group,
              category,
            },
            provenance: {
              as_of: product.modifiedOn ?? retrievedAt,
              retrieved_at: retrievedAt,
              source: "tcgplayer",
            },
          };
        }

        if (products.results.length < CATALOG_PAGE_SIZE) break;
        offset += CATALOG_PAGE_SIZE;
      }
    }
  }

  ctx.on_event?.({
    ts: new Date().toISOString(),
    source: "tcgplayer",
    kind: "done",
    detail: {
      mode: "catalog",
      products_yielded: productsTotal,
      skus_yielded: skusTotal,
      group_pages_walked: groupsTotal,
    },
  });
}

// ── Mode B: pricing refresh ─────────────────────────────────────────

async function* readPricing(
  ctx: TcgplayerContext,
  fetcher: Fetcher,
): AsyncIterable<RawRow<TcgplayerRaw>> {
  const bearer = ctx.bearer as string;
  const watchlist = ctx.tcgplayer?.pricing_watchlist ?? [];

  if (watchlist.length === 0) {
    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "tcgplayer",
      kind: "start",
      detail: {
        mode: "pricing",
        note:
          "empty watchlist — pricing mode yielded nothing. Pass ctx.tcgplayer.pricing_watchlist " +
          "with at least one entry (writer builds this from cards.tcgplayer_product_id × card_tcgplayer_sku_ids).",
      },
    });
    return;
  }

  // We need the global reference lists to resolve skuId → (condition, printing, language).
  const condIndex = await fetchConditionIndex(fetcher, bearer);
  const printIndex = await fetchPrintingIndex(fetcher, bearer);
  const langIndex = await fetchLanguageIndex(fetcher, bearer);

  // Flatten watchlist into a list of skuIds plus a back-reference for the writer.
  const flatSkus: Array<{
    skuId: number;
    card_id: number;
    card_sku: string;
    product_id: number;
  }> = [];
  for (const entry of watchlist) {
    for (const skuId of entry.tcgplayer_sku_ids) {
      flatSkus.push({
        skuId,
        card_id: entry.card_id,
        card_sku: entry.card_sku,
        product_id: entry.tcgplayer_product_id,
      });
    }
  }
  const backRef = new Map(flatSkus.map((s) => [s.skuId, s]));

  // We also need the skuId → TcgplayerSku metadata. The pricing endpoint
  // only returns prices; the metadata (printingId, conditionId, languageId)
  // we fetch separately the first time each skuId is seen. To keep this
  // batchable, we issue one `/catalog/skus/{ids}` lookup per chunk of 250.
  // The reader's flatSkus list IS the input.
  const skuMetadataBySkuId = new Map<number, TcgplayerSku>();
  for (let i = 0; i < flatSkus.length; i += PRICING_BATCH_SIZE) {
    if (ctx.signal?.aborted) return;
    const batch = flatSkus.slice(i, i + PRICING_BATCH_SIZE);
    const ids = batch.map((s) => s.skuId);
    const skuRows = await fetchSkuMetadata(fetcher, bearer, ids);
    for (const sku of skuRows) {
      skuMetadataBySkuId.set(sku.skuId, sku);
    }
    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "tcgplayer",
      kind: "page",
      detail: {
        endpoint: "/catalog/skus",
        ids_in_batch: ids.length,
        accumulated_metadata_rows: skuMetadataBySkuId.size,
      },
    });
  }

  const retrievedAt = new Date().toISOString();
  let yielded = 0;
  let nullPricingCount = 0;

  for (let i = 0; i < flatSkus.length; i += PRICING_BATCH_SIZE) {
    if (ctx.signal?.aborted) return;
    const batch = flatSkus.slice(i, i + PRICING_BATCH_SIZE);
    const ids = batch.map((s) => s.skuId);
    const pricings = await fetchSkuPricing(fetcher, bearer, ids);

    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "tcgplayer",
      kind: "page",
      detail: {
        endpoint: "/pricing/sku",
        ids_in_batch: ids.length,
        results: pricings.length,
        accumulated_yielded: yielded,
      },
    });

    for (const pricing of pricings) {
      const back = backRef.get(pricing.skuId);
      if (!back) continue;
      const meta = skuMetadataBySkuId.get(pricing.skuId);
      if (!meta) continue; // shouldn't happen — defensive

      const expanded = expandSkus([meta], condIndex, printIndex, langIndex)[0];
      if (!expanded) continue;

      const allNull =
        pricing.lowPrice === null &&
        pricing.midPrice === null &&
        pricing.highPrice === null &&
        pricing.marketPrice === null &&
        pricing.directLowPrice === null;
      if (allNull) nullPricingCount += 1;

      yield {
        raw: {
          kind: "pricing",
          sku: expanded,
          pricing,
          product_id: back.product_id,
          card_id: back.card_id,
          card_sku: back.card_sku,
        },
        provenance: {
          as_of: pricing.updatedAt ?? retrievedAt,
          retrieved_at: retrievedAt,
          source: "tcgplayer",
        },
      };
      yielded += 1;
    }
  }

  ctx.on_event?.({
    ts: new Date().toISOString(),
    source: "tcgplayer",
    kind: "done",
    detail: {
      mode: "pricing",
      yielded,
      null_pricing_count: nullPricingCount,
      null_pricing_pct: yielded > 0 ? Math.round((nullPricingCount / yielded) * 1000) / 10 : 0,
    },
  });
}

// ── Reference-list fetchers (cached per-run) ─────────────────────────

async function fetchAllCategories(
  fetcher: Fetcher,
  bearer: string,
): Promise<TcgplayerCategory[]> {
  // Categories are small (~30). One request typically returns all.
  const r = await fetcher(`${BASE_URL}/catalog/categories?limit=200`, {
    headers: { Authorization: `bearer ${bearer}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`tcgplayer /catalog/categories failed: HTTP ${r.status}`);
  const body = (await r.json()) as TcgplayerListResponse<TcgplayerCategory>;
  return body.results ?? [];
}

async function fetchAllGroups(
  fetcher: Fetcher,
  bearer: string,
  categoryId: number,
): Promise<TcgplayerGroup[]> {
  // Groups per category can run into hundreds; paginate.
  const out: TcgplayerGroup[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const r = await fetcher(
      `${BASE_URL}/catalog/categories/${categoryId}/groups?offset=${offset}&limit=${limit}`,
      { headers: { Authorization: `bearer ${bearer}`, Accept: "application/json" } },
    );
    if (!r.ok) throw new Error(`tcgplayer /catalog/groups failed: HTTP ${r.status}`);
    const body = (await r.json()) as TcgplayerListResponse<TcgplayerGroup>;
    if (!body.results || body.results.length === 0) break;
    out.push(...body.results);
    if (body.results.length < limit) break;
    offset += limit;
  }
  return out;
}

async function fetchProductsPage(
  fetcher: Fetcher,
  bearer: string,
  groupId: number,
  offset: number,
  limit: number,
): Promise<TcgplayerListResponse<TcgplayerProduct>> {
  // includeSkus=true would return skus inline; we fetch them separately so
  // we can attach reference data per-row in one shape. Trade-off: 1 extra
  // request per product vs simpler types.
  const r = await fetcher(
    `${BASE_URL}/catalog/groups/${groupId}/products?offset=${offset}&limit=${limit}&getExtendedFields=true`,
    { headers: { Authorization: `bearer ${bearer}`, Accept: "application/json" } },
  );
  if (!r.ok) throw new Error(`tcgplayer /catalog/products failed: HTTP ${r.status}`);
  return (await r.json()) as TcgplayerListResponse<TcgplayerProduct>;
}

async function fetchProductSkus(
  fetcher: Fetcher,
  bearer: string,
  productId: number,
): Promise<TcgplayerSku[]> {
  const r = await fetcher(`${BASE_URL}/catalog/products/${productId}/skus`, {
    headers: { Authorization: `bearer ${bearer}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`tcgplayer /catalog/products/{id}/skus failed: HTTP ${r.status}`);
  const body = (await r.json()) as TcgplayerListResponse<TcgplayerSku>;
  return body.results ?? [];
}

async function fetchSkuMetadata(
  fetcher: Fetcher,
  bearer: string,
  skuIds: number[],
): Promise<TcgplayerSku[]> {
  if (skuIds.length === 0) return [];
  const r = await fetcher(`${BASE_URL}/catalog/skus/${skuIds.join(",")}`, {
    headers: { Authorization: `bearer ${bearer}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`tcgplayer /catalog/skus failed: HTTP ${r.status}`);
  const body = (await r.json()) as TcgplayerListResponse<TcgplayerSku>;
  return body.results ?? [];
}

async function fetchSkuPricing(
  fetcher: Fetcher,
  bearer: string,
  skuIds: number[],
): Promise<TcgplayerSkuPricing[]> {
  if (skuIds.length === 0) return [];
  const r = await fetcher(`${BASE_URL}/pricing/sku/${skuIds.join(",")}`, {
    headers: { Authorization: `bearer ${bearer}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`tcgplayer /pricing/sku failed: HTTP ${r.status}`);
  const body = (await r.json()) as TcgplayerListResponse<TcgplayerSkuPricing>;
  return body.results ?? [];
}

// ── Reference index resolution (one fetch per run) ───────────────────

interface RefRow {
  id: number;
  name: string;
}

async function fetchConditionIndex(
  fetcher: Fetcher,
  bearer: string,
): Promise<Map<number, string>> {
  const r = await fetcher(`${BASE_URL}/catalog/conditions`, {
    headers: { Authorization: `bearer ${bearer}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`tcgplayer /catalog/conditions failed: HTTP ${r.status}`);
  const body = (await r.json()) as TcgplayerListResponse<{ conditionId: number; name: string }>;
  return new Map((body.results ?? []).map((r) => [r.conditionId, r.name]));
}

async function fetchPrintingIndex(
  fetcher: Fetcher,
  bearer: string,
): Promise<Map<number, string>> {
  const r = await fetcher(`${BASE_URL}/catalog/printings`, {
    headers: { Authorization: `bearer ${bearer}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`tcgplayer /catalog/printings failed: HTTP ${r.status}`);
  const body = (await r.json()) as TcgplayerListResponse<{ printingId: number; name: string }>;
  return new Map((body.results ?? []).map((r) => [r.printingId, r.name]));
}

async function fetchLanguageIndex(
  fetcher: Fetcher,
  bearer: string,
): Promise<Map<number, string>> {
  const r = await fetcher(`${BASE_URL}/catalog/languages`, {
    headers: { Authorization: `bearer ${bearer}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`tcgplayer /catalog/languages failed: HTTP ${r.status}`);
  const body = (await r.json()) as TcgplayerListResponse<{ languageId: number; name: string }>;
  return new Map((body.results ?? []).map((r) => [r.languageId, r.name]));
}

function expandSkus(
  skus: TcgplayerSku[],
  conds: Map<number, string>,
  prints: Map<number, string>,
  langs: Map<number, string>,
): TcgplayerSkuExpanded[] {
  return skus.map((s) => ({
    ...s,
    condition: conds.get(s.conditionId) ?? `unknown:${s.conditionId}`,
    printingName: prints.get(s.printingId) ?? `unknown:${s.printingId}`,
    languageName: langs.get(s.languageId) ?? "English",
  }));
}

// ── Re-exports (public surface) ─────────────────────────────────────

export { mintTcgplayerToken, readTcgplayerCredentialsFromEnv, tokenIsFresh } from "./oauth";
export type { TcgplayerCredentials, TcgplayerToken } from "./oauth";
export {
  TCGPLAYER_CATEGORIES,
  TCGPLAYER_KNOWN_SUB_TYPES,
  categoryForGame,
  gameForCategory,
  variantTailForSubType,
} from "./categories";
export type { TcgplayerCategoryEntry } from "./categories";
export { TCGPLAYER_CONDITION_MAP, isKnownTcgplayerCondition } from "./conditions";
export type { CambridgeCondition } from "./conditions";
export type {
  TcgplayerRaw,
  TcgplayerCatalogRaw,
  TcgplayerPricingRaw,
  TcgplayerProduct,
  TcgplayerSku,
  TcgplayerSkuExpanded,
  TcgplayerSkuPricing,
  TcgplayerProductPricing,
  TcgplayerCategory,
  TcgplayerGroup,
} from "./types";
export { normalizeTcgplayer } from "./normalize";
