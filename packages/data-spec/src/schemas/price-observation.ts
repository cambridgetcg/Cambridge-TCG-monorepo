import { MAJOR_AMOUNT_PATTERN, POSITIVE_NATIVE_AMOUNT_PATTERN, WHOLE_YEN_AMOUNT_PATTERN } from "../price-observation";

const text = { type: "string", minLength: 1 } as const;
const nullableText = { type: ["string", "null"] } as const;
const timestamp = { type: "string", format: "date-time" } as const;
const digest = { type: "string", pattern: "^[a-f0-9]{64}$" } as const;

export const MONEY_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://cambridgetcg.com/spec/v1/Money.schema.json",
  title: "Money",
  description: "A nonnegative decimal amount in major units; no conversion, quote, publication permission or settlement precision is implied.",
  type: "object", additionalProperties: false, required: ["amount", "currency", "unit"],
  properties: {
    amount: { type: "string", pattern: MAJOR_AMOUNT_PATTERN },
    currency: { enum: ["GBP", "EUR", "USD", "JPY"] },
    unit: { const: "major" },
  },
} as const;

const observationProperties = {
  source: { enum: ["cardmarket", "scryfall", "cardrush", "tcgplayer"] },
  sourceProductId: text,
  sku: nullableText,
  mappingStatus: { enum: ["exact", "unmapped", "ambiguous"] },
  game: text,
  setCode: nullableText,
  productName: nullableText,
  granularity: { enum: ["source-product", "printing"] },
  finish: nullableText,
  language: nullableText,
  condition: nullableText,
  metric: text,
  amount: { type: "string", pattern: POSITIVE_NATIVE_AMOUNT_PATTERN, description: "Positive native-currency major units, preserving source precision. Never pennies/cents, FX-converted GBP or a zero sentinel." },
  currency: { enum: ["EUR", "USD", "JPY"] },
  underlyingMarket: { enum: ["cardmarket", "tcgplayer", "cardrush"] },
  sourceUpdatedAt: { ...timestamp, description: "Source time. Live retail pages (cardrush, tcgplayer) publish no clock of their own, so for them it equals retrievedAt." },
  retrievedAt: timestamp,
  sourceUrl: { type: "string", format: "uri" },
  parserVersion: text,
  crosswalkVersion: text,
  evidenceVersion: text,
  artifactSha256: digest,
  catalogSourceUrl: { type: ["string", "null"], format: "uri" },
  catalogUpdatedAt: { type: ["string", "null"], format: "date-time" },
  catalogArtifactSha256: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
  quality: { const: "accepted" },
} as const;
/** Native-only and optional: not part of an observation's identity, and not
 * served in member items. */
const optionalObservationProperties = {
  sourceSetKey: {
    type: ["string", "null"], minLength: 1, pattern: "\\S",
    description: "The source's own set key (Cardmarket idExpansion, the set code a CardRush title prints, TCGplayer setId), for joining set crosswalks. Evidence, not a mapping; not part of the observation's identity. Absent or null where the source names no set or the row predates the key.",
  },
} as const;

const observationRules = [
  {
    if: { properties: { mappingStatus: { const: "exact" } }, required: ["mappingStatus"] },
    then: { properties: { sku: text, setCode: text } },
    else: { properties: { sku: { type: "null" }, setCode: { type: "null" } } },
  },
  {
    if: { properties: { source: { const: "cardmarket" } }, required: ["source"] },
    then: { properties: {
      currency: { const: "EUR" }, granularity: { const: "source-product" },
      language: { type: "null" }, condition: { type: "null" },
    } },
    else: { properties: { granularity: { const: "printing" } } },
  },
  {
    if: { properties: { source: { const: "scryfall" } }, required: ["source"] },
    then: { properties: { currency: { enum: ["EUR", "USD"] } } },
  },
  {
    if: { properties: { source: { const: "cardrush" } }, required: ["source"] },
    then: { properties: { currency: { const: "JPY" } } },
  },
  {
    if: { properties: { source: { const: "tcgplayer" } }, required: ["source"] },
    then: { properties: { currency: { const: "USD" } } },
  },
  // Each native currency names one underlying market.
  {
    if: { properties: { currency: { const: "EUR" } }, required: ["currency"] },
    then: { properties: { underlyingMarket: { const: "cardmarket" } } },
  },
  {
    if: { properties: { currency: { const: "USD" } }, required: ["currency"] },
    then: { properties: { underlyingMarket: { const: "tcgplayer" } } },
  },
  {
    if: { properties: { currency: { const: "JPY" } }, required: ["currency"] },
    then: { properties: { underlyingMarket: { const: "cardrush" }, amount: { pattern: WHOLE_YEN_AMOUNT_PATTERN } } },
  },
] as const;

export const NATIVE_PRICE_OBSERVATION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://cambridgetcg.com/spec/v1/NativePriceObservation.schema.json",
  title: "NativePriceObservation",
  description: "The existing source-normalized observation contract. Exact mapping and source-product/printing scope are independent. A live-page observation's sourceUpdatedAt must equal its retrievedAt, and its retrievedAt must be at or after 2026-10-28T00:00:00Z; JSON Schema cannot compare two fields or bound a date-time, so assertPriceObservationValues enforces both. This schema neither publishes data nor grants rights.",
  type: "object", additionalProperties: false,
  properties: { ...observationProperties, ...optionalObservationProperties },
  required: Object.keys(observationProperties),
  allOf: observationRules,
} as const;

export const MEMBER_PRICE_OBSERVATION_SCHEMA = {
  ...NATIVE_PRICE_OBSERVATION_SCHEMA,
  $id: "https://cambridgetcg.com/spec/v1/MemberPriceObservation.schema.json",
  title: "MemberPriceObservation",
  description: "Actual member feed/export item, with per-use permission evidence and attribution. Schema validity does not authorize access or reuse; source/use release policy remains authoritative.",
  properties: {
    ...observationProperties,
    id: text,
    permittedUses: { type: "array", minItems: 1, uniqueItems: true, items: { enum: ["member-display", "member-api", "member-download"] } },
    attribution: text,
  },
  required: [...Object.keys(observationProperties), "id", "permittedUses", "attribution"],
} as const;
