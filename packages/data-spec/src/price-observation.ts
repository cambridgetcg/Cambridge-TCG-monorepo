/** The existing member-price observation wire contract. Amounts are decimal
 * strings in the named currency's major units, not pennies/cents or converted
 * GBP. A zero monetary amount is valid generically; this source-price feed
 * accepts only positive observations and quarantines zero sentinel values.
 */
export type MemberPriceUse = "member-display" | "member-api" | "member-download";
export type MemberPriceSource = "cardmarket" | "scryfall" | "cardrush" | "tcgplayer";

export interface NativePriceObservation {
  source: MemberPriceSource;
  sourceProductId: string;
  sku: string | null;
  mappingStatus: "exact" | "unmapped" | "ambiguous";
  game: string;
  setCode: string | null;
  productName: string | null;
  granularity: "source-product" | "printing";
  finish: string | null;
  language: string | null;
  condition: string | null;
  metric: string;
  amount: string;
  currency: "EUR" | "USD" | "JPY";
  underlyingMarket: "cardmarket" | "tcgplayer" | "cardrush";
  sourceUpdatedAt: string;
  retrievedAt: string;
  sourceUrl: string;
  parserVersion: string;
  crosswalkVersion: string;
  evidenceVersion: string;
  artifactSha256: string;
  catalogSourceUrl: string | null;
  catalogUpdatedAt: string | null;
  catalogArtifactSha256: string | null;
  quality: "accepted";
  /** The source's own key for the set the product belongs to, as the source
   * writes it: Cardmarket's idExpansion, the set code a CardRush title prints,
   * TCGplayer's setId. It is what price_source_set_crosswalks is keyed on, so
   * a derivation can reach a set from the observation. Evidence, not a
   * mapping: setCode stays null until an exact crosswalk names it. Optional,
   * and not part of the observation's identity, so re-reading an artifact
   * never adds a row; absent or null where the source names no set or the
   * row was stored before the key was kept.
   */
  sourceSetKey?: string | null;
}

/** The member feed serves what it served before the source set key was
 * kept; the key stays storage-side evidence for set crosswalks. */
export interface MemberPriceObservation extends Omit<NativePriceObservation, "sourceSetKey"> {
  id: string;
  permittedUses: MemberPriceUse[];
  attribution: string;
}

export const MAJOR_AMOUNT_PATTERN = "^\\d{1,12}(?:\\.\\d{1,6})?$";
// `$` alone also matches before a final line terminator in ECMAScript. A
// normalized source amount must consume the entire string, including at JSON
// Schema boundaries; whitespace is invalid rather than silently trimmed.
export const POSITIVE_NATIVE_AMOUNT_PATTERN = "^(?!0+(?:\\.0+)?$)\\d{1,12}(?:\\.\\d{1,6})?(?![\\s\\S])";
// The yen has no minor unit. Fixed-scale storage reads back with zero
// fraction digits; a nonzero fraction is a parse fault (e.g. "1,500" read as
// 1.5), not a price.
export const WHOLE_YEN_AMOUNT_PATTERN = "^\\d{1,12}(?:\\.0{1,6})?(?![\\s\\S])";
/** CardRush and TCGplayer collection is forward-only (Yu, 2026-10-28): a page
 * read before this instant was gathered without permission, so it is never
 * stored, served or used as an input. Migration 0139 holds the same line. */
export const PAGE_SOURCE_COLLECTION_START = "2026-10-28T00:00:00Z";
/** Each native currency names one underlying market. */
const CURRENCY_MARKET = { EUR: "cardmarket", USD: "tcgplayer", JPY: "cardrush" } as const;

/** Preserve native decimal text and distinguish missing from invalid/zero.
 * Kept here so ingestion and the response boundary use one rule.
 */
export function parseNativePriceAmount(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== "string" || !new RegExp(POSITIVE_NATIVE_AMOUNT_PATTERN).test(text)) {
    throw new RangeError("invalid-or-zero-price");
  }
  return text;
}

/** Shared normalized-value checks before storage and response serialization.
 * Raw source numbers may be parsed into strings by parseNativePriceAmount;
 * normalized observations themselves must already carry decimal strings.
 * This is not a full schema/evidence validator or a printing-identity proof.
 * Callers must independently enforce provenance and source/use release policy.
 */
export function assertPriceObservationValues(observation: NativePriceObservation): void {
  if (typeof observation.amount !== "string" || parseNativePriceAmount(observation.amount) === null) {
    throw new TypeError("Native price amount must be a positive decimal string.");
  }
  if (!Object.hasOwn(CURRENCY_MARKET, observation.currency)) throw new TypeError("Unsupported native price currency.");
  if (observation.currency === "JPY" && !new RegExp(WHOLE_YEN_AMOUNT_PATTERN).test(observation.amount)) {
    throw new TypeError("JPY amounts are whole yen.");
  }
  const nonemptyText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
  if (!nonemptyText(observation.sourceProductId) || !nonemptyText(observation.metric)) throw new TypeError("Price identity and metric are required.");
  // Absent and null both mean the source named no set; empty text would be a
  // third spelling of that, and set crosswalks refuse a blank key.
  if (observation.sourceSetKey !== undefined && observation.sourceSetKey !== null &&
      !(typeof observation.sourceSetKey === "string" && observation.sourceSetKey.trim().length > 0)) {
    throw new TypeError("A source set key is non-empty text or null.");
  }
  if (observation.mappingStatus === "exact") {
    if (!nonemptyText(observation.sku) || !nonemptyText(observation.setCode)) throw new TypeError("Exact price mapping requires SKU and set.");
  } else if (!["unmapped", "ambiguous"].includes(observation.mappingStatus) ||
             observation.sku !== null || observation.setCode !== null) {
    throw new TypeError("Unresolved price identity cannot claim a SKU or set.");
  }
  if (observation.underlyingMarket !== CURRENCY_MARKET[observation.currency]) {
    throw new TypeError("Native currency and underlying market disagree.");
  }
  if (observation.source === "cardmarket") {
    if (observation.currency !== "EUR" || observation.granularity !== "source-product" ||
        observation.language !== null || observation.condition !== null) {
      throw new TypeError("Cardmarket observations retain EUR product-level scope with unknown language and condition.");
    }
  } else if (observation.source === "scryfall") {
    if (observation.granularity !== "printing" || observation.currency === "JPY") {
      throw new TypeError("Scryfall observations relay EUR or USD printing-level values.");
    }
  } else if (observation.source === "cardrush" || observation.source === "tcgplayer") {
    // Currency fixes the market above: JPY is CardRush's own, USD TCGplayer's.
    if (observation.currency !== (observation.source === "cardrush" ? "JPY" : "USD") || observation.granularity !== "printing") {
      throw new TypeError("CardRush observations are JPY and TCGplayer observations USD, both printing-level.");
    }
    // A live page has no publication clock of its own. Its source time is
    // the instant it was read; any other value would be invented.
    if (Date.parse(observation.sourceUpdatedAt) !== Date.parse(observation.retrievedAt)) {
      throw new TypeError("Live-page observations carry sourceUpdatedAt equal to retrievedAt.");
    }
    // Written so that an unparseable retrievedAt (NaN) is refused too.
    if (!(Date.parse(observation.retrievedAt) >= Date.parse(PAGE_SOURCE_COLLECTION_START))) {
      throw new TypeError(`Live-page observations are retrieved at or after ${PAGE_SOURCE_COLLECTION_START}, when collection was permitted.`);
    }
  } else {
    throw new TypeError("Unknown price source or observation scope.");
  }
}

export const PRICE_OBSERVATION_CONTRACT = {
  version: "ctcg.member-prices/v1",
  amount: "Positive decimal string, native currency major units; never a converted value or minor-unit integer. JPY is whole yen.",
  zero: "Zero is quarantined for native source observations, not converted to a free price. Generic money may represent zero.",
  missing: "Missing source prices create no observation; unavailable or withheld data never becomes zero.",
  identity: "Exact source-product crosswalk only. Unmapped or ambiguous observations keep sku and setCode null. Syntax normalization is not a mapping.",
  sourceSetKey: "Optional native field: the source's own set key (Cardmarket idExpansion, the set code a CardRush title prints, TCGplayer setId), kept so set crosswalks can be joined. It is evidence, not a mapping, and not part of an observation's identity. Absent or null means the source named no set or the row was stored before the key was kept. The member feed does not serve it.",
  comparison: "Match currency, metric, granularity, finish, language, condition and time before comparing. Product aggregates are not individual sales.",
  scope: "cardmarket: EUR source-product aggregates. scryfall: EUR or USD printing values relayed from Cardmarket or TCGplayer. cardrush: JPY printing values. tcgplayer: USD printing values. Currency names the underlying market: EUR Cardmarket, USD TCGplayer, JPY CardRush.",
  provenance: `sourceUpdatedAt is source time; retrievedAt is retrieval time; pagination asOf is neither. Live retail pages (cardrush, tcgplayer) publish no clock of their own: source time is the instant the page was read, so sourceUpdatedAt equals retrievedAt. Their retrievedAt is at or after ${PAGE_SOURCE_COLLECTION_START}, when collection was permitted; nothing read earlier is stored or served.`,
  rights: "Evidence and permittedUses remain source- and operation-specific; this schema grants no publication or reuse rights.",
  legacy: "Existing *_gbp numeric fields remain GBP major units with their existing null/publication semantics. No mass unit or wire-type conversion.",
  compatibility: "2026-10-28 added the cardrush and tcgplayer sources, JPY, the cardrush market and the optional native sourceSetKey within v1. Those sources are released for member display only, and member items do not carry sourceSetKey, so member API and download payloads keep their earlier value sets and fields.",
} as const;
