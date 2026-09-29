/** The existing member-price observation wire contract. Amounts are decimal
 * strings in the named currency's major units, not pennies/cents or converted
 * GBP. A zero monetary amount is valid generically; this source-price feed
 * accepts only positive observations and quarantines zero sentinel values.
 */
export type MemberPriceUse = "member-display" | "member-api" | "member-download";
export type MemberPriceSource = "cardmarket" | "scryfall";

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
  currency: "EUR" | "USD";
  underlyingMarket: "cardmarket" | "tcgplayer";
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
}

export interface MemberPriceObservation extends NativePriceObservation {
  id: string;
  permittedUses: MemberPriceUse[];
  attribution: string;
}

export const MAJOR_AMOUNT_PATTERN = "^\\d{1,12}(?:\\.\\d{1,6})?$";
export const POSITIVE_NATIVE_AMOUNT_PATTERN = "^(?!0+(?:\\.0+)?$)\\d{1,12}(?:\\.\\d{1,6})?$";

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

/** Additional checks at the storage-to-response boundary. This does not grant
 * publication rights: the caller must still enforce source/use release policy.
 */
export function assertPriceObservationValues(observation: NativePriceObservation): void {
  if (typeof observation.amount !== "string" || parseNativePriceAmount(observation.amount) === null) {
    throw new TypeError("Native price amount must be a positive decimal string.");
  }
  if (!["EUR", "USD"].includes(observation.currency)) throw new TypeError("Unsupported native price currency.");
  if (!observation.sourceProductId || !observation.metric) throw new TypeError("Price identity and metric are required.");
  if (observation.mappingStatus === "exact") {
    if (!observation.sku || !observation.setCode) throw new TypeError("Exact price mapping requires SKU and set.");
  } else if (!["unmapped", "ambiguous"].includes(observation.mappingStatus) ||
             observation.sku !== null || observation.setCode !== null) {
    throw new TypeError("Unresolved price identity cannot claim a SKU or set.");
  }
  if (observation.currency === "EUR" && observation.underlyingMarket !== "cardmarket" ||
      observation.currency === "USD" && observation.underlyingMarket !== "tcgplayer") {
    throw new TypeError("Native currency and underlying market disagree.");
  }
  if (observation.source === "cardmarket") {
    if (observation.currency !== "EUR" || observation.granularity !== "source-product") {
      throw new TypeError("Cardmarket observations retain EUR product-level scope.");
    }
  } else if (observation.source !== "scryfall" || observation.granularity !== "printing") {
    throw new TypeError("Unknown price source or observation scope.");
  }
}

export const PRICE_OBSERVATION_CONTRACT = {
  version: "ctcg.member-prices/v1",
  amount: "Positive decimal string, native currency major units; never a converted value or minor-unit integer.",
  zero: "Zero is quarantined for native source observations, not converted to a free price. Generic money may represent zero.",
  missing: "Missing source prices create no observation; unavailable or withheld data never becomes zero.",
  identity: "Exact source-product crosswalk only. Unmapped or ambiguous observations keep sku and setCode null. Syntax normalization is not a mapping.",
  comparison: "Match currency, metric, granularity, finish, language, condition and time before comparing. Product aggregates are not individual sales.",
  provenance: "sourceUpdatedAt is source time; retrievedAt is retrieval time; pagination asOf is neither.",
  rights: "Evidence and permittedUses remain source- and operation-specific; this schema grants no publication or reuse rights.",
  legacy: "Existing *_gbp numeric fields remain GBP major units with their existing null/publication semantics. No mass unit or wire-type conversion.",
} as const;
