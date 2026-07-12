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
 *   1. Read `docs/methodology/source-intake.md` and record its legal, rights,
 *      intention, and shape decisions before writing ingestion code.
 *   2. Read `docs/methodology/source-protocol.md` end to end.
 *   3. Add or correct the source's row in `the-tributaries.md` only after the
 *      intake decision names what may be fetched, stored, and published.
 *   4. Create `packages/data-ingest/src/<id>/index.ts` exporting a
 *      `SourceModule<R, C>` named after the id (`export const myId: SourceModule<...> = { ... }`).
 *   5. Register the export in `./registry.ts` SOURCES.
 *   6. Use `createFetcher(ctx, meta)` from `./http.ts` for outbound calls.
 *   7. Run `pnpm audit:tributaries` to verify structural conformance. The
 *      audit does not replace the recorded intake review.
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
 * This internal package has no general code license. Published specification
 * text carries its own explicit license. Per-source modules declare the
 * upstream policy in `SourceMeta.license`; known rights can propagate through
 * `_meta.source_license`, while incomplete field-level lineage is NOASSERTION.
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

// Re-export each registered source so callers can `import { scryfall } from "@cambridge-tcg/data-ingest"`.
export { scryfall } from "./scryfall/index";
export {
  cardrush,
  scrapeCardRush,
  CARDRUSH_ACQUISITION_ENABLED,
  CARDRUSH_BLOCK_REASON,
  CARDRUSH_DATA_POLICY_URL,
  CARDRUSH_SUBDOMAINS,
  getOrCreateFetcher,
  resolveEgress,
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
  TCGPLAYER_ACCESS_BLOCKED_MESSAGE,
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
// The honest block — a source we decided NOT to scrape, declared in code
// with its verdict. Consented first-party normalizer is the usable export.
// Doctrine: docs/methodology/source-intake.md.
export {
  vinted,
  normalizeVintedSale,
  type VintedConsentedSale,
  type VintedCanonicalObservation,
} from "./vinted/index";
// kingdom: sitemap+JSON-LD discovery — first vendor TCGCollector.
// Public sitemap-index → per-page Schema.org Product/Offer JSON-LD →
// typed TcgCollectorProduct shape. Mirrors the cardrush discovery
// pattern; when a second sitemap+JSON-LD vendor lands, the shared
// parts can be extracted to a generic discovery/ module.
// Doctrine: docs/connections/the-sitemap-discovery.md.
export {
  tcgcollector,
  TCGCOLLECTOR_ACQUISITION_ENABLED,
  TCGCOLLECTOR_BLOCK_REASON,
  TCGCOLLECTOR_TERMS_URL,
  scrapeOne,
  getOrCreateFetcher as getOrCreateTcgcollectorFetcher,
  resetFetcher as resetTcgcollectorFetcher,
  fetchSitemap as fetchTcgcollectorSitemap,
  extractJsonLd,
  normalizeProduct,
  matchSku as matchTcgcollectorSku,
  TCGC_GAME_SEGMENT_MAP,
  knownGameSegments as knownTcgcollectorGameSegments,
  type TcgCollectorContext,
  type TcgCollectorRaw,
  type TcgCollectorProduct,
  type SitemapFetchResult as TcgCollectorSitemapFetchResult,
  type MatchResult as TcgCollectorMatchResult,
} from "./tcgcollector/index";
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
// The lawful first-party eBay SOLD door — a seller's own consented sales
// from the Sell/Fulfillment API (getOrders after OAuth consent). Buyer PII
// structurally excluded; forward-ready + INERT (no live fetch, no cron),
// gated on operator OAuth app + solicitor review. Same shape as the Vinted
// consented stub — build-once, reuse. Doctrine: docs/methodology/source-intake.md.
export {
  normalizeEbayConsentedSale,
  type EbayConsentedSale,
  type EbayConsentedCanonicalObservation,
} from "./ebay/consented";
