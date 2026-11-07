/**
 * @module @cambridge-tcg/data-spec
 *
 * The Cambridge TCG public-response specification — schemas, error
 * codes, and freshness budgets — packaged so partners can consume the
 * contract without depending on the platform's runtime emission code.
 *
 * The pantry holds itself to this spec. `apps/storefront/src/lib/data-pantry/`
 * is the runtime that emits responses matching this spec; this package
 * is the *publishable contract* that names what the responses look like.
 *
 * ── What's in here ──────────────────────────────────────────────────
 *
 *   import {
 *     ENVELOPE_SCHEMA,   // JSON Schema for { data, _meta }
 *     META_SCHEMA,       // JSON Schema for the _meta block alone
 *     ERROR_BODY_SCHEMA, // JSON Schema for failures
 *     PROVENANCE_SCHEMA, // JSON Schema for per-record @-prefixed provenance
 *     FRESHNESS,         // Numeric freshness budgets per data kind
 *     ERROR_CODES,       // Stable error code enum
 *     SPEC_VERSION,      // "1" — bump on breaking changes
 *     DEFAULT_LICENSE,   // "NOASSERTION"
 *     DERIVED_MARKET_CONTRACT, // Method, guards and rights of derived market data
 *   } from "@cambridge-tcg/data-spec";
 *
 * ── Versioning ──────────────────────────────────────────────────────
 *
 * Stable. Breaking changes bump `SPEC_VERSION`. Non-breaking additions
 * (new error code, new optional field on _meta) do not.
 *
 * ── License ─────────────────────────────────────────────────────────
 *
 * This internal package has no general code license. The specification text
 * it implements is CC0-1.0; response payload rights are endpoint- and
 * source-specific. See `docs/STANDARDS-LICENSE.md`.
 */

export { SPEC_VERSION, DEFAULT_LICENSE, FRESHNESS, type FreshnessKey } from "./freshness";
export { ERROR_CODES, ERROR_STATUS, type ErrorCode } from "./error-codes";
export {
  PRICE_OBSERVATION_CONTRACT, PAGE_SOURCE_COLLECTION_START, parseNativePriceAmount, assertPriceObservationValues,
  type NativePriceObservation, type MemberPriceObservation, type MemberPriceUse, type MemberPriceSource,
} from "./price-observation";
export {
  DERIVED_MARKET_CONTRACT, DERIVED_MARKET_METHOD_VERSION, DERIVED_MARKET_SOURCES,
  MIN_REFERENCE_SOURCES, MIN_REFERENCE_UNEXPORTED_SOURCES, EXPORTABLE_DERIVATION_SOURCES,
  MIN_INDEX_CONSTITUENTS, MIN_PREMIUM_SKUS, REFERENCE_FRESHNESS_DAYS,
  REFERENCE_SIGNIFICANT_FIGURES, GBP_CONVERSION_SCALE, FX_CROSS_SCALE, INDEX_BASE_LEVEL, INDEX_LEVEL_SCALE,
  THREE_FIGURES_PATTERN_BODY, INDEX_LEVEL_PATTERN_BODY,
  roundToSignificant, crossRate, toGbp, referenceSourcesAllowed, referenceAmount, confidenceFor, startIndex, chainIndex, premiumQuantiles, marketIndexKey,
  type DerivedMarketSource, type DerivedConfidence, type FxCurrency, type FxQuote, type MarketDerivationRun,
  type MarketReferencePrice, type MarketIndexPoint, type MarketPremium, type IndexPair, type IndexStep,
  type PremiumPair, type PremiumQuantiles,
} from "./market-derived";
export {
  ENVELOPE_SCHEMA,
  META_SCHEMA,
  ERROR_BODY_SCHEMA,
  PROVENANCE_SCHEMA,
  ERROR_CODE_VALUES,
  MONEY_SCHEMA,
  NATIVE_PRICE_OBSERVATION_SCHEMA,
  MEMBER_PRICE_OBSERVATION_SCHEMA,
  MARKET_DERIVATION_RUN_SCHEMA,
  MARKET_REFERENCE_PRICE_SCHEMA,
  MARKET_INDEX_POINT_SCHEMA,
  MARKET_PREMIUM_SCHEMA,
} from "./schemas/index";
