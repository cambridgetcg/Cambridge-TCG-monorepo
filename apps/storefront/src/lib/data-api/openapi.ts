import {
  DERIVED_MARKET_SOURCES, MARKET_DERIVATION_RUN_SCHEMA, MARKET_INDEX_POINT_SCHEMA, MARKET_PREMIUM_SCHEMA, MARKET_REFERENCE_PRICE_SCHEMA,
} from "@cambridge-tcg/data-spec";
import { dataApiPlansPublished, dataApiReadsPublished } from "./posture";

/**
 * OpenAPI operations for the data API, each registered exactly while its
 * route serves. docs/plans/tcg-data-platform/agent-layer.md: register
 * operations only when implementation, authorization, tests and
 * documentation are ready together. The routes, keys and tests exist; the
 * data-API terms, the public copy and the provisioned tables do not, and they
 * arrive with publication (paid-data-api.md §7, §8).
 *
 * Two switches, read from the environment on every call (posture.ts): the
 * market reads and account usage serve, and are registered, only while
 * DATA_API_READS=on; the plan catalogue only while DATA_API_PLANS_PUBLISHED=on.
 * Unpublished, each answers 404 NOT_PUBLISHED and is not advertised.
 * Publishing is Yu's act; flipping a switch is what registers its operations,
 * with no code change.
 */

const RIGHTS = "Cambridge-derived market data (ctcg.market-derived/v1): not CC0 and not licensed for AI training; offered under Cambridge data-API terms. No provider's own price, per-source value or numeric spread.";
const security = [{ MemberDataKey: [] }];
const envelope = { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } };
const responses = (ok: string, extra: Record<string, { description: string }> = {}) => ({
  "200": { description: ok, content: envelope },
  "400": { description: "Invalid, unknown or duplicate query parameter, or an invalid, expired or filter-mismatched cursor." },
  "401": { description: "Missing, invalid, expired or revoked member data key; nothing read or counted." },
  "403": { description: "INSUFFICIENT_TIER: the plan does not include this data, or a date is before the plan's history window." },
  "429": { description: "RATE_LIMITED: the key's per-minute or the account's monthly limit is reached; Retry-After and X-RateLimit-* headers say which and when it resets." },
  "503": { description: "NOT_PROVISIONED: derived market storage does not exist yet, or SOURCE_UNAVAILABLE: storage failed. Never an empty result." },
  ...extra,
});
const cursor = { name: "cursor", in: "query", schema: { type: "string" }, description: "Opaque continuation bound to the account, filters, page size and run ceiling; expires after 24 hours." };
const limit = (fallback: number, maximum: number) => ({ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum, default: fallback } });
const date = (name: string, description: string) => ({ name, in: "query", schema: { type: "string", format: "date" }, description });
const game = { name: "game", in: "query", required: true, schema: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" } };
const meta = "Envelope _meta carries data_rights, derived_market_contract and the plan; X-RateLimit-* headers carry the minute and month counts.";

/** The market-data tag, worded for what is registered under it: the keyed
 * reads while DATA_API_READS is on, otherwise the plan catalogue alone, which
 * must not advertise reads that answer 404 NOT_PUBLISHED. */
export const DATA_API_OPENAPI_TAGS = {
  reads: { name: "market-data", description: `Cambridge-derived reference prices, indices and cross-market premiums, read with a member data key and metered per plan. ${RIGHTS}` },
  catalogue: { name: "market-data", description: "The data-API plan catalogue: plans, limits, features and permitted use, read without a key. No keyed market read is published." },
} as const;

export const DATA_API_OPENAPI_PATHS = {
  "/api/v1/market/reference": {
    get: {
      tags: ["market-data"], operationId: "getMarketReferencePrices", security,
      summary: "Latest Cambridge reference prices",
      description: `Each SKU's latest servable reference price: a GBP mean of at least two sources whose raw values Cambridge does not export, to 3 significant figures, with a confidence label. Give sku (up to 100, comma-separated, one complete page) or game and set (signed pages). Rows from a revoked source or dated before the plan's history window are not served. ${meta}`,
      parameters: [
        { name: "sku", in: "query", schema: { type: "string" }, description: "Comma-separated canonical lowercase SKUs; not combined with game, set, limit or cursor." },
        { ...game, required: false }, { name: "set", in: "query", schema: { type: "string", pattern: "^[a-z0-9]{1,32}$" } }, limit(100, 500), cursor,
      ],
      responses: responses("Envelope whose data has status, items (MarketReferencePrice), nextCursor, ceiling, asOf, count, complete and history."),
    },
  },
  "/api/v1/market/reference/history": {
    get: {
      tags: ["market-data"], operationId: "getMarketReferenceHistory", security,
      summary: "One SKU's reference price history",
      description: `Servable references for one SKU, oldest first, clipped to the plan's history window (history.clipped says when the requested range began before it). ${meta}`,
      parameters: [{ name: "sku", in: "query", required: true, schema: { type: "string" } }, date("from", "Inclusive."), date("to", "Inclusive."), limit(366, 1000), cursor],
      responses: responses("Envelope whose data has items (MarketReferencePrice) and the history window applied."),
    },
  },
  "/api/v1/market/indices": {
    get: {
      tags: ["market-data"], operationId: "getMarketIndices", security,
      summary: "Chain-linked market index levels with 7, 30 and 90 day changes",
      description: `Index levels per series (game × set × market; no set is the per-game index) and day, each with its 7, 30 and 90 day change computed on read against the latest servable level on or before that many days earlier and at most 7 days before that, inside the plan's window; null when there is none. ${meta}`,
      parameters: [game, { name: "set", in: "query", schema: { type: "string", pattern: "^[a-z0-9]{1,32}$" } },
        { name: "market", in: "query", schema: { type: "string", enum: [...DERIVED_MARKET_SOURCES] } }, date("from", "Inclusive."), date("to", "Inclusive."), limit(500, 1000), cursor],
      responses: responses("Envelope whose data items are { point: MarketIndexPoint, changes: { d7, d30, d90 } }."),
    },
  },
  "/api/v1/market/premiums": {
    get: {
      tags: ["market-data"], operationId: "getMarketPremiums", security,
      summary: "Cross-market premium quartiles",
      description: `Each market pair's latest servable premium per set (or the given date's): quartiles of market ÷ base market GBP values over at least ten card identities exactly mapped in both, with each side's language basis (marketLanguages, baseLanguages: ISO 639-1 codes, "*" for a product-level value recorded with no language). ${meta}`,
      parameters: [game, { name: "set", in: "query", schema: { type: "string", pattern: "^[a-z0-9]{1,32}$" } }, date("date", "A day inside the plan's history window."), limit(100, 500), cursor],
      responses: responses("Envelope whose data items are MarketPremium."),
    },
  },
  "/api/v1/market/export": {
    get: {
      tags: ["market-data"], operationId: "getMarketDerivedExport", security,
      summary: "A day's derived rows as bounded NDJSON",
      description: `One bounded NDJSON page of a day's servable references, index points and premiums: a manifest line (the day's MarketDerivationRun, counts, cursor, rights), one line per row with its type, and a footer. Follow nextCursor with the same date and limit until complete. ${RIGHTS}`,
      parameters: [{ ...date("date", "A day inside the plan's history window."), required: true }, limit(1000, 5000), cursor],
      responses: { ...responses("NDJSON page."), "200": { description: "NDJSON page.", content: { "application/x-ndjson": { schema: { type: "string" } } } } },
    },
  },
  "/api/v1/account/usage": {
    get: {
      tags: ["market-data"], operationId: "getDataApiUsage", security,
      summary: "The key's plan, limits and this month's request count",
      description: "Aggregate counts only: requests per key per minute and per account per UTC calendar month. No paths, queries, IP addresses or read history. This request is counted.",
      responses: responses("Envelope whose data has plan, limits, features, minute and month."),
    },
  },
  "/api/v1/plans": {
    get: {
      tags: ["market-data"], operationId: "getDataApiPlans", security: [],
      summary: "Data-API plan catalogue",
      description: "Plans, limits, features and permitted use, with proposed GBP prices ex VAT. on_sale is false while no member can buy: sale_status is closed, or test-mode-operators-only while test-mode checkout admits operators testing the round trip. Every plan sells the same derived data; paid plans add scale and permitted use.",
      responses: { "200": { description: "Pantry envelope with catalogue_version, on_sale, sale_status and plans.", content: envelope }, "404": { description: "NOT_PUBLISHED." } },
    },
  },
} as const;

export const DATA_API_OPENAPI_SCHEMAS = {
  MarketReferencePrice: MARKET_REFERENCE_PRICE_SCHEMA,
  MarketIndexPoint: MARKET_INDEX_POINT_SCHEMA,
  MarketPremium: MARKET_PREMIUM_SCHEMA,
  MarketDerivationRun: MARKET_DERIVATION_RUN_SCHEMA,
} as const;

/** The plan catalogue's path; every other path is a read behind DATA_API_READS. */
const PLANS_PATH = "/api/v1/plans";

/** The data-API paths served under this posture: none, the reads, the catalogue, or both. */
export function publishedDataApiPaths(env: NodeJS.ProcessEnv = process.env): Partial<typeof DATA_API_OPENAPI_PATHS> {
  const reads = dataApiReadsPublished(env), plans = dataApiPlansPublished(env);
  return Object.fromEntries(Object.entries(DATA_API_OPENAPI_PATHS).filter(([path]) => (path === PLANS_PATH ? plans : reads)));
}

/** The spec with the data-API operations that serve under this posture, unchanged when none does. */
export function withDataApiOperations<T extends { tags: readonly unknown[]; paths: object; components: { schemas: object } }>(spec: T, env: NodeJS.ProcessEnv = process.env): T {
  const paths = publishedDataApiPaths(env);
  if (!Object.keys(paths).length) return spec;
  return {
    ...spec,
    tags: [...spec.tags, dataApiReadsPublished(env) ? DATA_API_OPENAPI_TAGS.reads : DATA_API_OPENAPI_TAGS.catalogue],
    paths: { ...spec.paths, ...paths },
    // The row schemas describe what the reads return; the catalogue needs none.
    components: dataApiReadsPublished(env) ? { ...spec.components, schemas: { ...spec.components.schemas, ...DATA_API_OPENAPI_SCHEMAS } } : spec.components,
  };
}
