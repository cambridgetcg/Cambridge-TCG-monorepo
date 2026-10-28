import {
  DERIVED_MARKET_METHOD_VERSION, DERIVED_MARKET_SOURCES, EXPORTABLE_DERIVATION_SOURCES, INDEX_BASE_LEVEL, INDEX_LEVEL_PATTERN_BODY,
  MIN_INDEX_CONSTITUENTS, MIN_PREMIUM_SKUS, MIN_REFERENCE_SOURCES, MIN_REFERENCE_UNEXPORTED_SOURCES, THREE_FIGURES_PATTERN_BODY,
} from "../market-derived";

// `(?![\s\S])` rather than `$`: some JSON Schema engines let `$` match before a final newline.
const whole = (body: string) => `^${body}(?![\\s\\S])`;
const text = { type: "string", minLength: 1 } as const;
const day = { type: "string", format: "date" } as const;
const source = { enum: [...DERIVED_MARKET_SOURCES] } as const;
const game = { type: "string", pattern: whole("[a-z0-9]+(?:-[a-z0-9]+)*") } as const;
const setCode = { type: "string", pattern: whole("[a-z0-9]+") } as const;
const threeFigures = { type: "string", pattern: whole(THREE_FIGURES_PATTERN_BODY) } as const;
const rights = "Derived market data: not CC0, not licensed for AI training; offered under Cambridge data-API terms. Schema validity grants no access or reuse.";
const derived = {
  runId: { type: "string", pattern: whole("[1-9][0-9]*") },
  methodVersion: { const: DERIVED_MARKET_METHOD_VERSION },
  asOf: day,
} as const;
const sourceList = (minItems: number, maxItems: number) =>
  ({ type: "array", minItems, maxItems, uniqueItems: true, items: source }) as const;
// Sources a release row can never export; a reference needs at least two of them.
const unexported = DERIVED_MARKET_SOURCES.filter(name => !(EXPORTABLE_DERIVATION_SOURCES as readonly string[]).includes(name));

const fxQuote = {
  type: "object", additionalProperties: false, required: ["rate", "source", "as_of"],
  properties: {
    rate: { type: "string", pattern: whole("(?!0+(?:[.]0+)?(?![\\s\\S]))[0-9]{1,6}(?:[.][0-9]{1,12})?"), description: "Units of the currency per 1 GBP: a cross computed with exact decimal arithmetic from ECB's EUR-based quotes for as_of." },
    source: { const: "ecb.europa.eu" },
    as_of: day,
  },
} as const;

export const MARKET_DERIVATION_RUN_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://cambridgetcg.com/spec/v1/MarketDerivationRun.schema.json",
  title: "MarketDerivationRun",
  description: `One derivation date's inputs: the evidence each source contributed under, the FX record and the observation batch ceiling read. ${rights}`,
  type: "object", additionalProperties: false,
  required: ["id", "methodVersion", "asOf", "inputBatchCeiling", "inputEvidence", "fx", "createdAt"],
  properties: {
    id: derived.runId,
    methodVersion: derived.methodVersion,
    asOf: day,
    inputBatchCeiling: { type: "string", pattern: whole("(?:0|[1-9][0-9]*)") },
    inputEvidence: {
      type: "object", additionalProperties: false, minProperties: 1,
      properties: Object.fromEntries(DERIVED_MARKET_SOURCES.map(name => [name, text])),
    },
    fx: { type: "object", additionalProperties: false, properties: { EUR: fxQuote, JPY: fxQuote, USD: fxQuote } },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const referenceProperties = {
  ...derived,
  sku: text,
  game,
  setCode,
  amount: threeFigures,
  currency: { const: "GBP" },
  confidence: { enum: ["high", "medium", "low"] },
  sources: { ...sourceList(MIN_REFERENCE_SOURCES, DERIVED_MARKET_SOURCES.length), contains: { enum: unexported }, minContains: MIN_REFERENCE_UNEXPORTED_SOURCES },
  sourceCount: { type: "integer", minimum: MIN_REFERENCE_SOURCES, maximum: DERIVED_MARKET_SOURCES.length },
} as const;

export const MARKET_REFERENCE_PRICE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://cambridgetcg.com/spec/v1/MarketReferencePrice.schema.json",
  title: "MarketReferencePrice",
  description: `GBP mean of the sources' values for one SKU, to 3 significant figures, with a confidence label instead of a numeric spread. At least two sources are ones whose raw values Cambridge does not export (${unexported.join(", ")}); ${EXPORTABLE_DERIVATION_SOURCES.join(", ")} may contribute on top. Sources are named, never valued. ${rights}`,
  type: "object", additionalProperties: false,
  properties: referenceProperties,
  required: Object.keys(referenceProperties),
  allOf: [
    // sourceCount names the number of distinct sources listed.
    ...[2, 3].map(count => ({
      if: { properties: { sourceCount: { const: count } }, required: ["sourceCount"] },
      then: { properties: { sources: { minItems: count, maxItems: count } } },
    })),
    {
      if: { properties: { confidence: { const: "high" } }, required: ["confidence"] },
      then: { properties: { sourceCount: { minimum: 3 } } },
    },
  ],
} as const;

const indexProperties = {
  ...derived,
  indexKey: { type: "string", pattern: whole(`[a-z0-9]+(?:-[a-z0-9]+)*:(?:[a-z0-9]+|[*]):(?:${DERIVED_MARKET_SOURCES.join("|")})`) },
  game,
  setCode: { type: ["string", "null"], pattern: whole("[a-z0-9]+") },
  market: source,
  level: { type: "string", pattern: whole(INDEX_LEVEL_PATTERN_BODY) },
  constituents: { type: "integer", minimum: MIN_INDEX_CONSTITUENTS },
  previousAsOf: { type: ["string", "null"], format: "date" },
  sources: sourceList(1, 1),
} as const;

export const MARKET_INDEX_POINT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://cambridgetcg.com/spec/v1/MarketIndexPoint.schema.json",
  title: "MarketIndexPoint",
  description: `Chain-linked GBP index level over at least ten source products, base 100. A null setCode is the per-game index. previousAsOf names the level this step chained from. ${rights}`,
  type: "object", additionalProperties: false,
  properties: indexProperties,
  required: Object.keys(indexProperties),
  allOf: [
    ...DERIVED_MARKET_SOURCES.map(market => ({
      if: { properties: { market: { const: market } }, required: ["market"] },
      then: { properties: { sources: { const: [market] }, indexKey: { pattern: `:${market}(?![\\s\\S])` } } },
    })),
    {
      if: { properties: { setCode: { type: "null" } }, required: ["setCode"] },
      then: { properties: { indexKey: { pattern: "^[^:]+:[*]:" } } },
      else: { properties: { indexKey: { pattern: "^[^:]+:[a-z0-9]+:" } } },
    },
    {
      if: { properties: { previousAsOf: { type: "null" } }, required: ["previousAsOf"] },
      then: { properties: { level: { const: INDEX_BASE_LEVEL } } },
    },
  ],
} as const;

// ISO 639-1 codes of the values a side compared; "*" for a product-level
// value recorded with no language. Ascending order is enforced at storage.
const languageBasis = { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", pattern: whole("(?:[a-z]{2}|[*])") } } as const;
const premiumProperties = {
  ...derived,
  game,
  setCode,
  market: source,
  baseMarket: source,
  ratioP25: threeFigures,
  ratioMedian: threeFigures,
  ratioP75: threeFigures,
  skuCount: { type: "integer", minimum: MIN_PREMIUM_SKUS },
  sources: sourceList(2, 2),
  marketLanguages: languageBasis,
  baseLanguages: languageBasis,
} as const;

export const MARKET_PREMIUM_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://cambridgetcg.com/spec/v1/MarketPremium.schema.json",
  title: "MarketPremium",
  description: `Quartiles of market ÷ baseMarket GBP values over at least ten card identities exactly mapped in both, each to 3 significant figures, with each side's language basis; ratioP25 ≤ ratioMedian ≤ ratioP75 is enforced at storage, not by this schema. ${rights}`,
  type: "object", additionalProperties: false,
  properties: premiumProperties,
  required: Object.keys(premiumProperties),
  allOf: DERIVED_MARKET_SOURCES.flatMap(market => [
    { not: { properties: { market: { const: market }, baseMarket: { const: market } }, required: ["market", "baseMarket"] } },
    {
      if: { properties: { market: { const: market } }, required: ["market"] },
      then: { properties: { sources: { contains: { const: market } } } },
    },
    {
      if: { properties: { baseMarket: { const: market } }, required: ["baseMarket"] },
      then: { properties: { sources: { contains: { const: market } } } },
    },
  ]),
} as const;
