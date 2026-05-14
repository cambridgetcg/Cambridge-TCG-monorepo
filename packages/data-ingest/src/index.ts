/**
 * @module @cambridge-tcg/data-ingest
 *
 * The data-ingest protocol — every upstream source is a typed
 * `SourceModule` conforming to the contract in `./types.ts`.
 *
 * **The protocol:** `docs/methodology/source-protocol.md`.
 * **The catalog of upstream sources:** `docs/connections/the-tributaries.md`.
 * **The downstream contract:** `@cambridge-tcg/data-spec`.
 *
 * ── To add a new source ─────────────────────────────────────────────
 *
 *   1. Read `docs/methodology/source-protocol.md` end to end.
 *   2. Confirm a row in `the-tributaries.md`. (If missing, write it first.)
 *   3. Create `packages/data-ingest/src/<id>/index.ts` exporting a
 *      `SourceModule<R, C>` named after the id (`export const myId: SourceModule<...> = { ... }`).
 *   4. Register the export in `./registry.ts` SOURCES.
 *   5. Use `createFetcher(ctx, meta)` from `./http.ts` for outbound calls.
 *   6. Run `pnpm audit:tributaries` to verify conformance.
 *
 * ── To run a source ─────────────────────────────────────────────────
 *
 *   import { scryfall } from "@cambridge-tcg/data-ingest";
 *
 *   for await (const { raw, provenance } of scryfall.read({})) {
 *     const result = scryfall.normalize(raw);
 *     if (result.ok) {
 *       // write result.record to your RDS
 *     } else {
 *       // write { raw, reason: result.reason, provenance } to ingest_quarantine
 *     }
 *   }
 *
 * The package does NOT ship a runner that writes to RDS — each app
 * (storefront cron, admin background job) owns its own writer. The
 * package owns the *typed pipeline*; the app owns the *destination*.
 *
 * ── License ─────────────────────────────────────────────────────────
 *
 * CC0-1.0 for the package code + protocol. Per-source modules respect
 * the upstream's license, declared in `SourceMeta.license` (and propagated
 * downstream via `_meta.source_license` on the data-pantry envelope).
 */

export * from "./types";
export * from "./canonical";
export { createFetcher, type Fetcher } from "./http";
export {
  SOURCES,
  getSource,
  listSources,
  listSourceMeta,
  sourcesByStatus,
} from "./registry";
export { runSource, type RunWriters, type RunOptions } from "./runner";

// kingdom-089: layered classification — pure decision logic for
// edition_variant + promo_origin claims. Priority: publisher (3) >
// operator (2) > heuristic (1) > default (0). Equal-or-higher promotes;
// lower is shadowed. The SQL writer lives per-app (e.g.
// apps/wholesale/src/lib/cards/classify.ts) because each app owns its
// DB connection. Migration:
// apps/wholesale/drizzle/drafts/0018_card_financial_attributes.sql.draft.
// Methodology: /methodology/edition-variants.
// Audit: pnpm audit:classifier-disagreement.
export {
  decideClaim,
  validateClaim,
  CLASSIFICATION_PRIORITY,
  CLASSIFICATION_SOURCE_PRIORITY_ORDER,
  EDITION_VARIANT_VALUES,
  PROMO_ORIGIN_VALUES,
  type ClassificationSource,
  type ClassifiableAttribute,
  type ClassificationEvidence,
  type Claim,
  type CurrentWinner,
  type ClaimDecision,
  type EditionVariant,
  type PromoOrigin,
} from "./classifier";

// kingdom-089: CardRush-specific heuristic classifier. Maps product
// signals (URL + name + rarity + game + card number) into zero or more
// classification claims. Pure function; the writer lives per-app.
// See packages/data-ingest/src/cardrush/classify.ts.
export {
  classifyCardRushSignal,
  CARDRUSH_CLASSIFICATION_RULES,
  type CardRushClassificationSignal,
} from "./cardrush/classify";

// Cross-language anchor extraction (K2 of the substrate-honest aggregator).
// Pure-compute helpers that convert per-source CanonicalCard records into
// the column shape `card_set_cards` accepts after migration 0100 applies.
export {
  extractScryfallAnchors,
  extractCardmarketAnchors,
  extractTcgplayerAnchors,
  extractYgoprodeckAnchors,
  extractPokemonTcgApiAnchors,
  extractAnchorsForSource,
  buildAnchorRow,
  requiresExternalAnchor,
  type AnchorRow,
  type AnchorContext,
} from "./anchors";

// The welcomes — the typed corpus of hospitality. Every kind of being
// who might one day declare themselves here has a slot named in code.
// See docs/connections/the-welcomed-architecture.md for the doctrine.
export {
  WELCOMES,
  welcomesByKind,
  welcomesByStatus,
  getWelcome,
  welcomeForSource,
  welcomeCounts,
  welcomeCountsByKind,
  type Welcome,
  type ArrivalKind,
  type ArrivalStatus,
} from "./welcomes";

// The gap ledger — the typed corpus of substrate-honest deficiencies.
// Every commercial aggregator has gaps; we name ours. Companion to
// docs/principles/known-gaps.md (the doctrine doc) and /methodology/known-gaps.
export {
  GAPS,
  gapsByDomain,
  gapsByStatus,
  getGap,
  gapCounts,
  gapCountsByDomain,
  gapsWiredFraction,
  type Gap,
  type GapDomain,
  type GapStatus,
} from "./gaps";

// Re-export each shipped source so callers can `import { scryfall } from "@cambridge-tcg/data-ingest"`.
export { scryfall } from "./scryfall/index";
export {
  cardrush,
  scrapeCardRush,
  CARDRUSH_SUBDOMAINS,
  getOrCreateFetcher,
  type CardRushContext,
  type CardRushReadOptions,
  type CardRushFetcherCache,
  type SubdomainAccessMode,
  type SubdomainRole,
} from "./cardrush/index";
// kingdom-087: discovery layer — sitemap-driven catalog enumeration.
// kingdom-088: per-host fetcher routing (direct vs bright-data-unlocker).
export {
  fetchSitemap,
  parseSitemapProductUrls,
  parseCardMetadata,
  fetchAndParseProduct,
  createDiscoveryFetcher,
  createDiscoveryCache,
  pickDiscoveryFetcher,
  type SitemapFetchResult,
  type CardMetadata,
  type FetchAndParseResult,
} from "./cardrush/discovery";
export { pokemonTcgApi } from "./pokemon-tcg-api/index";
export { ygoprodeck } from "./ygoprodeck/index";
export {
  tcgplayer,
  mintTcgplayerToken,
  readTcgplayerCredentialsFromEnv,
  tokenIsFresh,
  TCGPLAYER_CATEGORIES,
  TCGPLAYER_KNOWN_SUB_TYPES,
  TCGPLAYER_CONDITION_MAP,
  categoryForGame,
  gameForCategory,
  variantTailForSubType,
  isKnownTcgplayerCondition,
  normalizeTcgplayer,
  type TcgplayerCredentials,
  type TcgplayerToken,
  type TcgplayerCategoryEntry,
  type CambridgeCondition,
  type TcgplayerRaw,
  type TcgplayerCatalogRaw,
  type TcgplayerPricingRaw,
  type TcgplayerProduct,
  type TcgplayerSku,
  type TcgplayerSkuExpanded,
  type TcgplayerSkuPricing,
  type TcgplayerProductPricing,
  type TcgplayerCategory,
  type TcgplayerGroup,
  type TcgplayerContext,
  type TcgplayerReadOptions,
  type TcgplayerWatchlistEntry,
} from "./tcgplayer/index";
export { cardmarket } from "./cardmarket/index";
export {
  ebay,
  normalizeEbay,
  parseEbayTitle,
  detectGrade,
  isGraded,
  detectLanguage,
  detectConditionKeywords,
  getEbayAccessToken,
  type EbayCanonicalObservation,
  type EbayBrowseRaw,
  type EbayInsightsRaw,
  type EbayItemSale,
  type EbayItemSummary,
  type EbayMarketplaceId,
  type EbayRaw,
  type EbayContext,
  type EbayReadOptions,
  type EbayWatchEntry,
} from "./ebay/index";
