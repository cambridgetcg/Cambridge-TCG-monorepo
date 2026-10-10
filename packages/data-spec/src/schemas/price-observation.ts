import { MAJOR_AMOUNT_PATTERN, POSITIVE_NATIVE_AMOUNT_PATTERN } from "../price-observation";

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
  source: { enum: ["cardmarket", "scryfall"] },
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
  currency: { enum: ["EUR", "USD"] },
  underlyingMarket: { enum: ["cardmarket", "tcgplayer"] },
  sourceUpdatedAt: timestamp,
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
    if: { properties: { currency: { const: "EUR" } }, required: ["currency"] },
    then: { properties: { underlyingMarket: { const: "cardmarket" } } },
    else: { properties: { underlyingMarket: { const: "tcgplayer" } } },
  },
] as const;

export const NATIVE_PRICE_OBSERVATION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://cambridgetcg.com/spec/v1/NativePriceObservation.schema.json",
  title: "NativePriceObservation",
  description: "The existing source-normalized observation contract. Exact mapping and source-product/printing scope are independent. This schema neither publishes data nor grants rights.",
  type: "object", additionalProperties: false,
  properties: observationProperties,
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
