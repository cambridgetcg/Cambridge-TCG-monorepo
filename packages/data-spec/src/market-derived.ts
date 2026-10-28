/** Cambridge-derived market data: reference prices, indices and cross-market
 * premiums computed from permitted source observations (Yu, 2026-10-28:
 * paid plans sell derived data only). No derived value is a provider's own
 * price, and none is published with per-source values or a numeric spread.
 *
 * Amounts are GBP decimal strings in major units. The helpers below are the
 * method's arithmetic: exact decimal/rational maths, half-up rounding (the
 * same rule as PostgreSQL's numeric round()), canonical output with no
 * trailing fractional zeros. They never accept JS numbers, so no binary float
 * artefact can enter a published value.
 */

export const DERIVED_MARKET_METHOD_VERSION = "ctcg.market-derived/v1" as const;

/** Scryfall is never a derivation source: its basis permits free accounts
 * and value-added Magic views, not resale. Each source is its own market. */
export const DERIVED_MARKET_SOURCES = ["cardmarket", "cardrush", "tcgplayer"] as const;
export type DerivedMarketSource = (typeof DERIVED_MARKET_SOURCES)[number];
export type DerivedConfidence = "high" | "medium" | "low";
export type FxCurrency = "EUR" | "JPY" | "USD";

export const MIN_REFERENCE_SOURCES = 2;
/** A reference needs at least this many contributing sources whose raw values
 * Cambridge does not export. With only one, the mean of it and an exported
 * value gives it back: 2 × reference − the exported value, up to rounding. */
export const MIN_REFERENCE_UNEXPORTED_SOURCES = 2;
/** Derivation sources whose raw values a release row can export (member_api
 * or member_download): Cardmarket alone, because migration 0139 keeps
 * CardRush and TCGplayer display-only. Release rows hold the live answer and
 * the derivation job reads it there; 0141's CHECK and the JSON schema pin
 * this set, since neither can read a release row. */
export const EXPORTABLE_DERIVATION_SOURCES = ["cardmarket"] as const satisfies readonly DerivedMarketSource[];
export const MIN_INDEX_CONSTITUENTS = 10;
export const MIN_PREMIUM_SKUS = 10;
/** An input observation is at most this many days old at the derivation date. */
export const REFERENCE_FRESHNESS_DAYS = 7;
export const REFERENCE_SIGNIFICANT_FIGURES = 3;
export const GBP_CONVERSION_SCALE = 6;
/** Decimal places of a recorded GBP cross rate, the most 0141's fx record holds. */
export const FX_CROSS_SCALE = 12;
export const INDEX_BASE_LEVEL = "100";
export const INDEX_LEVEL_SCALE = 6;

/** Canonical output text, below 10^12, shared verbatim by migration 0141's
 * CHECKs (as `^body$`) and the JSON schemas. [0-9] reads the same in
 * PostgreSQL and ECMAScript. At most 3 significant figures, no trailing
 * fractional zero: a full-precision value cannot be stored or served. */
export const THREE_FIGURES_PATTERN_BODY =
  "(?:[1-9][0-9]{0,2}0{0,9}|[1-9][.][0-9]?[1-9]|[1-9][0-9][.][1-9]|0[.]0*[1-9](?:[0-9]?[1-9])?)";
/** Positive, at most INDEX_LEVEL_SCALE decimal places, no trailing fractional zero. */
export const INDEX_LEVEL_PATTERN_BODY = "(?:[1-9][0-9]{0,11}(?:[.][0-9]{0,5}[1-9])?|0[.][0-9]{0,5}[1-9])";

export const DERIVED_MARKET_CONTRACT = {
  version: DERIVED_MARKET_METHOD_VERSION,
  scope: "Cambridge reference prices, market indices and cross-market premiums. No row is, or stands in for, a provider's own price.",
  inputs: "Accepted observations from sources whose release row is unrevoked, has derivation set and matches the code's derivation evidence version, each at most 7 days old at the derivation date. Scryfall is never an input. Observations retrieved before 2026-10-28, when derivation was permitted, are never inputs.",
  headline: "One value per source product: the latest accepted observation of Cardmarket trend (trend-foil for a foil finish), CardRush sell for the listing that states no grade, or TCGplayer Market Price for Near Mint (recorded by its collector as near-mint). A value at any other condition is not the headline and is never averaged in. Asks, aggregates and recent-sale values differ in meaning; a reference combines them as stated, not as one kind of price.",
  fx: "ECB publishes reference rates against the euro (units per 1 EUR), not against sterling. A run takes ECB's quotes for one date, published on or before the derivation date and at most 7 days earlier, as decimal text, and computes each GBP cross from them with exact decimal arithmetic: units per 1 GBP = the currency's EUR quote ÷ ECB's GBP quote (for EUR, 1 ÷ the GBP quote), half-up to 12 decimal places. Each run records the cross, its source and ECB's date per currency. Every input is then converted to GBP: native amount ÷ the cross, half-up to 6 decimal places. Fallback rates are never used, and no cross is computed in binary floating point.",
  reference: "Mean of each source's GBP value for one exactly mapped SKU, half-up to 3 significant figures. A source two of whose products map to the SKU contributes nothing to it. Needs at least 2 contributing sources whose raw values Cambridge does not export (on 2026-10-28, CardRush and TCGplayer, which are display-only); Cardmarket, whose raw values members can download, may contribute on top but never counts toward the 2. The mean of one display-only value and an exported value would give the display-only value back (2 × reference − the exported value, up to rounding). Whether a source is exported is read from its release row (member API or download). Confidence is high with at least 3 sources and max/min at most 1.25, medium with at least 2 sources and max/min at most 1.5, otherwise low.",
  index: "Chain-linked per game × set × market and per game × market: I_t = I_prev × Σp_t / Σp_prev over source products placed in a set and priced on both days (a product's set is its exact product crosswalk's set code or, without one, the set its source's own set key maps to in a live set crosswalk: Cardmarket's are a reviewed seed, CardRush's and TCGplayer's are written by their collectors by rule, from the set code a CardRush title prints or a TCGplayer set whose numbered cards all carry its abbreviation; a product whose two mappings name different sets is left out; the earlier day is valued again from its own run's inputs), chained from the latest published level, half-up to 6 decimal places. Base 100 on a series' first day only: a series (index key and method version) has one base row and never restarts at 100, so a gap chains from the latest published level. Needs at least 10 constituents. Levels are in GBP terms, so they include exchange-rate movement.",
  premium: "Median, 25th and 75th percentiles (linear interpolation between order statistics) of the ratio market ÷ base_market of GBP values, each half-up to 3 significant figures, over card identities exactly mapped in both: the SKU without its language segment (variant kept) where the game's oracle policy shares numbering across languages, otherwise the whole SKU. A source with more than one SKU for an identity is left out of it. One row per market pair per game × set, base_market the pair's first source in source order. Each side states its language basis: the ISO 639-1 languages of the values compared, \"*\" for a product-level value recorded with no language. Needs at least 10 SKUs, counted as card identities. A quartile can be exactly one card's ratio (p25 and p75 when the count is one more than a multiple of 4, the median whenever it is odd); it is published rounded, and no row names the card.",
  trends: "7, 30 and 90 day changes are computed on read from reference and index history; they are not stored.",
  disclosure: "Sources are named, never valued. No per-source value, numeric dispersion or per-source breakdown of a card is published.",
  revocation: "A row is served only while every source it names still has derivation set. Revoking a source hides its rows on the next read; rows are not rewritten.",
  immutability: "Runs and derived rows are append-only, and a run's rows commit with it. A changed method is a new method version, never a rewrite.",
  rights: "Derived market data is not CC0 and is not licensed for AI training. It is offered under Cambridge data-API terms. Schema validity grants no access or reuse.",
} as const;

/** The GBP cross recorded on a run: units of `currency` per 1 GBP, computed by
 * crossRate from ECB's EUR-based quotes, as a decimal string, with ECB's
 * observation date. */
export interface FxQuote { rate: string; source: "ecb.europa.eu"; as_of: string }

export interface MarketDerivationRun {
  id: string;
  methodVersion: typeof DERIVED_MARKET_METHOD_VERSION;
  asOf: string;
  /** Highest committed member_price_batches id the run read. */
  inputBatchCeiling: string;
  /** Derivation evidence version per contributing source. */
  inputEvidence: Partial<Record<DerivedMarketSource, string>>;
  fx: Partial<Record<FxCurrency, FxQuote>>;
  createdAt: string;
}

interface DerivedRow { runId: string; methodVersion: typeof DERIVED_MARKET_METHOD_VERSION; asOf: string }

export interface MarketReferencePrice extends DerivedRow {
  sku: string;
  game: string;
  setCode: string;
  amount: string;
  currency: "GBP";
  confidence: DerivedConfidence;
  sources: DerivedMarketSource[];
  sourceCount: number;
}

export interface MarketIndexPoint extends DerivedRow {
  indexKey: string;
  game: string;
  /** null for the per-game index. */
  setCode: string | null;
  market: DerivedMarketSource;
  level: string;
  constituents: number;
  /** The level this step chained from; null on the base day. */
  previousAsOf: string | null;
  sources: [DerivedMarketSource];
}

export interface MarketPremium extends DerivedRow {
  game: string;
  setCode: string;
  market: DerivedMarketSource;
  baseMarket: DerivedMarketSource;
  ratioP25: string;
  ratioMedian: string;
  ratioP75: string;
  /** Matched card identities. */
  skuCount: number;
  sources: DerivedMarketSource[];
  /** Each side's language basis: ISO 639-1 codes of the values compared,
   * "*" for a product-level value recorded with no language. Distinct, ascending. */
  marketLanguages: string[];
  baseLanguages: string[];
}

/** `<game>:<set or *>:<market>`; the database generates the same key. */
export function marketIndexKey(game: string, setCode: string | null, market: DerivedMarketSource): string {
  return `${game}:${setCode ?? "*"}:${market}`;
}

// ── Exact arithmetic ────────────────────────────────────────────────────

interface Ratio { n: bigint; d: bigint }
const DECIMAL = /^(\d+)(?:\.(\d+))?$/;
// BigInt(…) rather than literals such as 10n: this contract is compiled by
// apps that target ES2017 (wholesale), where BigInt literals do not parse.
const ZERO = BigInt(0), ONE = BigInt(1), TWO = BigInt(2), FOUR = BigInt(4), TEN = BigInt(10);
const ten = (power: number) => TEN ** BigInt(power);

function positive(value: unknown, label: string): Ratio {
  if (typeof value !== "string") throw new TypeError(`${label} must be a decimal string.`);
  const match = DECIMAL.exec(value);
  if (!match) throw new RangeError(`${label} must be a plain decimal string.`);
  const fraction = match[2] ?? "";
  const n = BigInt(match[1] + fraction);
  if (n === ZERO) throw new RangeError(`${label} must be positive.`);
  return { n, d: ten(fraction.length) };
}

/** Half-up integer rounding of a nonnegative ratio. */
const roundHalfUp = (n: bigint, d: bigint) => (TWO * n + d) / (TWO * d);
const compare = (a: Ratio, b: Ratio) => {
  const left = a.n * b.d, right = b.n * a.d;
  return left < right ? -1 : left > right ? 1 : 0;
};
const gcd = (a: bigint, b: bigint): bigint => (b === ZERO ? a : gcd(b, a % b));
// Over the least common denominator: decimal inputs keep a power of ten, not a product.
const sum = (values: readonly Ratio[]) => values.reduce((total, value) => {
  const d = (total.d / gcd(total.d, value.d)) * value.d;
  return { n: total.n * (d / total.d) + value.n * (d / value.d), d };
}, { n: ZERO, d: ONE });

function formatScaled(units: bigint, scale: number): string {
  if (scale <= 0) return (units * ten(-scale)).toString();
  const digits = units.toString().padStart(scale + 1, "0");
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return fraction ? `${digits.slice(0, -scale)}.${fraction}` : digits.slice(0, -scale);
}

function roundToScale(value: Ratio, scale: number, label: string): string {
  const units = roundHalfUp(value.n * ten(scale), value.d);
  if (units === ZERO) throw new RangeError(`${label} rounds to zero at ${scale} decimal places.`);
  return formatScaled(units, scale);
}

/** floor(log10(n/d)) for a positive ratio, exactly. */
function floorLog10({ n, d }: Ratio): number {
  const e = n.toString().length - d.toString().length;
  const atLeast = e >= 0 ? n >= d * ten(e) : n * ten(-e) >= d;
  return atLeast ? e : e - 1;
}

function roundRatioToSignificant(value: Ratio, figures: number): string {
  const scale = figures - 1 - floorLog10(value);
  const units = scale >= 0 ? roundHalfUp(value.n * ten(scale), value.d) : roundHalfUp(value.n, value.d * ten(-scale));
  return formatScaled(units, scale);
}

function figuresCount(figures: number): number {
  if (!Number.isSafeInteger(figures) || figures < 1 || figures > 30) throw new RangeError("Significant figures must be an integer from 1 to 30.");
  return figures;
}

// ── Method helpers ──────────────────────────────────────────────────────

/** Half-up to `figures` significant figures: "12.345" → "12.3",
 * "1234.5" → "1230", "0.012345" → "0.0123", "9.995" → "10". */
export function roundToSignificant(value: string, figures: number): string {
  return roundRatioToSignificant(positive(value, "Value"), figuresCount(figures));
}

/** ECB quotes every currency against the euro. The GBP cross, units of a
 * currency per 1 GBP, is its EUR quote ÷ ECB's GBP quote for the same date
 * ("1" for EUR itself), from the published decimal text, exactly, half-up to
 * FX_CROSS_SCALE places: crossRate("162.53", "0.8672") → "187.419280442804".
 * The result fits 0141's fx record (at most 6 integer digits). */
export function crossRate(targetPerEur: string, gbpPerEur: string): string {
  const target = positive(targetPerEur, "EUR-based quote"), gbp = positive(gbpPerEur, "GBP per EUR quote");
  const cross = roundToScale({ n: target.n * gbp.d, d: target.d * gbp.n }, FX_CROSS_SCALE, "GBP cross rate");
  if (cross.split(".")[0]!.length > 6) throw new RangeError("GBP cross rate exceeds the recorded form of at most 6 integer digits.");
  return cross;
}

/** native ÷ rate (units per GBP), half-up to GBP_CONVERSION_SCALE places. */
export function toGbp(amount: string, ratePerGbp: string): string {
  const native = positive(amount, "Native amount"), rate = positive(ratePerGbp, "FX rate");
  return roundToScale({ n: native.n * rate.d, d: native.d * rate.n }, GBP_CONVERSION_SCALE, "GBP value");
}

function referenceInputs(gbpValues: readonly string[]): Ratio[] {
  if (!Array.isArray(gbpValues) || gbpValues.length < MIN_REFERENCE_SOURCES) {
    throw new RangeError(`A reference price needs at least ${MIN_REFERENCE_SOURCES} sources.`);
  }
  return gbpValues.map((value, i) => positive(value, `GBP value ${i}`));
}

/** Whether a reference may be published from these contributing sources: at
 * least MIN_REFERENCE_UNEXPORTED_SOURCES of them must be sources whose raw
 * values Cambridge does not export. `exportable` is every source whose release
 * row has member_api or member_download set, read when the run starts. A
 * source that is not a derivation source refuses the whole list. */
export function referenceSourcesAllowed(sources: readonly string[], exportable: Iterable<string>): boolean {
  if (!sources.every(source => (DERIVED_MARKET_SOURCES as readonly string[]).includes(source))) return false;
  const exported = new Set(exportable);
  return new Set(sources.filter(source => !exported.has(source))).size >= MIN_REFERENCE_UNEXPORTED_SOURCES;
}

/** One GBP value per source → the published mean, to 3 significant figures. */
export function referenceAmount(gbpValues: readonly string[]): string {
  const values = referenceInputs(gbpValues);
  const total = sum(values);
  return roundRatioToSignificant({ n: total.n, d: total.d * BigInt(values.length) }, REFERENCE_SIGNIFICANT_FIGURES);
}

/** high: ≥3 sources, max/min ≤ 1.25; medium: ≥2, ≤ 1.5; otherwise low.
 * Bounds are inclusive. Fewer than two values have no reference to label. */
export function confidenceFor(gbpValues: readonly string[]): DerivedConfidence {
  const values = referenceInputs(gbpValues).sort(compare);
  const min = values[0]!, max = values[values.length - 1]!;
  const spreadAtMost = (num: bigint, den: bigint) => den * max.n * min.d <= num * min.n * max.d;
  if (values.length >= 3 && spreadAtMost(BigInt(5), FOUR)) return "high";
  return spreadAtMost(BigInt(3), TWO) ? "medium" : "low";
}

export interface IndexPair { previous: string; current: string }
export type IndexStep =
  | { ok: true; level: string; constituents: number }
  | { ok: false; reason: "too-few-constituents"; constituents: number };

/** The base day: level 100 when at least MIN_INDEX_CONSTITUENTS products are priced. */
export function startIndex(gbpValues: readonly string[]): IndexStep {
  gbpValues.forEach((value, i) => positive(value, `GBP value ${i}`));
  return gbpValues.length >= MIN_INDEX_CONSTITUENTS
    ? { ok: true, level: INDEX_BASE_LEVEL, constituents: gbpValues.length }
    : { ok: false, reason: "too-few-constituents", constituents: gbpValues.length };
}

/** One chain-linking step from the latest published level: prev × Σcurrent ÷
 * Σprevious over products priced on both days, half-up to INDEX_LEVEL_SCALE.
 * Chaining from the rounded published level keeps every step reproducible. */
export function chainIndex(prev: string, matchedPairs: readonly IndexPair[]): IndexStep {
  const level = positive(prev, "Previous level");
  const previous = sum(matchedPairs.map((pair, i) => positive(pair.previous, `Previous value ${i}`)));
  const current = sum(matchedPairs.map((pair, i) => positive(pair.current, `Current value ${i}`)));
  if (matchedPairs.length < MIN_INDEX_CONSTITUENTS) return { ok: false, reason: "too-few-constituents", constituents: matchedPairs.length };
  const next = { n: level.n * current.n * previous.d, d: level.d * current.d * previous.n };
  return { ok: true, level: roundToScale(next, INDEX_LEVEL_SCALE, "Index level"), constituents: matchedPairs.length };
}

export interface PremiumPair { market: string; baseMarket: string }
export type PremiumQuantiles =
  | { ok: true; ratioP25: string; ratioMedian: string; ratioP75: string; skuCount: number }
  | { ok: false; reason: "too-few-skus"; skuCount: number };

/** Quantiles of market ÷ baseMarket, linear interpolation between order
 * statistics (h = (n − 1)p, as R's and NumPy's defaults), then 3 significant figures.
 *
 * With n ≡ 1 (mod 4), (n − 1)/4 is whole, so p25 and p75 are each exactly one
 * card's ratio, as the median is for every odd n. All three are published
 * from MIN_PREMIUM_SKUS identities (an agent's call, 2026-10-28, open to
 * Yu): a quartile names no card and is rounded to 3 significant figures, so
 * turning it back into a provider's value needs the card's identity, which no
 * row carries. Publishing p25 and p75 only from 20 identities would not end
 * single-card quartiles (21, 25, … are 1 mod 4 too, and the median stays);
 * it would only withhold the spread of smaller sets. */
export function premiumQuantiles(pairs: readonly PremiumPair[]): PremiumQuantiles {
  const ratios = pairs.map((pair, i) => {
    const market = positive(pair.market, `Market value ${i}`), base = positive(pair.baseMarket, `Base market value ${i}`);
    return { n: market.n * base.d, d: market.d * base.n };
  }).sort(compare);
  if (ratios.length < MIN_PREMIUM_SKUS) return { ok: false, reason: "too-few-skus", skuCount: ratios.length };
  const quantile = (quarters: number) => {
    const position = (ratios.length - 1) * quarters;
    const low = Math.floor(position / 4), weight = BigInt(position % 4);
    const a = ratios[low]!, b = ratios[Math.min(low + 1, ratios.length - 1)]!;
    // a + (b − a) × weight/4, over the common denominator 4·a.d·b.d.
    const value = { n: FOUR * a.n * b.d + weight * (b.n * a.d - a.n * b.d), d: FOUR * a.d * b.d };
    return roundRatioToSignificant(value, REFERENCE_SIGNIFICANT_FIGURES);
  };
  return { ok: true, ratioP25: quantile(1), ratioMedian: quantile(2), ratioP75: quantile(3), skuCount: ratios.length };
}
