/**
 * Market derivation, method ctcg.market-derived/v1 (plan §3; the contract is
 * DERIVED_MARKET_CONTRACT in packages/data-spec): the selection and
 * arithmetic of one run, as pure functions. No database, clock, network or
 * environment: derive.ts reads the inputs in one snapshot and writes every
 * row in one transaction. Amounts stay decimal strings, and every step is one
 * of data-spec's exact helpers, so no binary float reaches a stored value.
 *
 * Selection, stated once:
 * - One headline value per source product: the latest accepted observation of
 *   its source's headline metric at its headline condition (HEADLINE below).
 *   A candidate at any other metric or condition is counted, never averaged in.
 * - References and premiums are over SKUs, and a product counts toward them
 *   only through an exact live product crosswalk. A SKU that two of one
 *   source's products map to is ambiguous for that source and is left out of
 *   both, never averaged.
 * - Indices are over source products and need only a product's set: its
 *   exact crosswalk's set code or, without one, the set its source set key's
 *   live set crosswalk names (Cardmarket's expansions, which map to sets but
 *   whose products do not map to printings). A product whose two mappings
 *   name different sets is left out of the run, never guessed.
 * - Sources are named, never valued: no row below carries a source's value.
 */
import { parseSku, resolveOracle } from "@cambridge-tcg/sku";
import { TCGPLAYER_HEADLINE_CONDITION } from "@cambridge-tcg/data-ingest/tcgplayer/member-prices";
import {
  DERIVED_MARKET_SOURCES, MIN_REFERENCE_SOURCES, chainIndex, confidenceFor, crossRate, marketIndexKey, premiumQuantiles,
  referenceAmount, referenceSourcesAllowed, startIndex, toGbp,
  type DerivedConfidence, type DerivedMarketSource, type FxCurrency, type FxQuote, type IndexPair, type IndexStep, type PremiumPair,
} from "@cambridge-tcg/data-spec";

/** DERIVED_MARKET_CONTRACT.inputs: observations retrieved before 2026-10-28,
 * when derivation was permitted, are never inputs. This holds for every
 * source, Cardmarket included: its 2026-09-07 grant covered member display,
 * API and download, not derivation. */
export const DERIVATION_PERMITTED_FROM = "2026-10-28T00:00:00Z";
/** An ECB quote date is on or before the derivation date and at most this
 * many days earlier (ECB publishes on business days only). 0141's fx CHECK
 * holds the same bound. */
export const FX_QUOTE_MAX_AGE_DAYS = 7;
/** A premium side's language for a value recorded with no language: a
 * source's product-level aggregate (Cardmarket's) spans every language the
 * product is listed in. The same mark as marketIndexKey's all-sets "*". */
export const ANY_LANGUAGE = "*";

export const SOURCE_CURRENCY: Readonly<Record<DerivedMarketSource, FxCurrency>> = Object.freeze({ cardmarket: "EUR", cardrush: "JPY", tcgplayer: "USD" });

/** Each source's headline metric and condition. Cardmarket's product-level
 * aggregates state no condition; CardRush's headline is the listing that
 * states no grade (a page that states one is that grade's price); TCGplayer's
 * is Market Price for Near Mint, matched exactly as its collector records the
 * grade (TCGPLAYER_HEADLINE_CONDITION, imported so the two cannot drift). */
export const HEADLINE: Readonly<Record<DerivedMarketSource, { metric: (finish: string | null) => string; condition: string | null }>> = Object.freeze({
  cardmarket: { metric: finish => (finish === "foil" ? "trend-foil" : "trend"), condition: null },
  cardrush: { metric: () => "sell", condition: null },
  tcgplayer: { metric: () => "market", condition: TCGPLAYER_HEADLINE_CONDITION },
});

export function isHeadline(candidate: { source: DerivedMarketSource; finish: string | null; condition: string | null; metric: string }): boolean {
  const headline = HEADLINE[candidate.source];
  return headline !== undefined && candidate.metric === headline.metric(candidate.finish) && candidate.condition === headline.condition;
}

/** Every metric HEADLINE names for a source, whatever the finish: the only
 * metrics a run reads of it. */
export const HEADLINE_METRICS: Readonly<Record<DerivedMarketSource, readonly string[]>> = Object.freeze({
  cardmarket: Object.freeze(["trend", "trend-foil"]), cardrush: Object.freeze(["sell"]), tcgplayer: Object.freeze(["market"]),
});

// ── Dates ────────────────────────────────────────────────────────────────

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** An observation range a run reads, as UTC instants: from inclusive, to exclusive. */
export interface ScanRange { from: string; to: string }

/** The source_updated_at ranges a run reads of one source: each window date
 * d's own freshness window, [d − days, d + 1) from midnight UTC, merged
 * where two overlap or touch, in ascending order. derive.ts passes every
 * bound as its own constant, so member_price_observations_derivation (0139)
 * is read over these ranges and nothing between them: a series whose latest
 * level is weeks old adds its own week, never every day since. */
export function scanRanges(dates: Iterable<string>, days: number): ScanRange[] {
  const ranges: { from: string; to: string }[] = [];
  for (const date of [...new Set(dates)].sort()) {
    if (!isCalendarDate(date)) throw new RangeError("A scan range needs calendar dates, YYYY-MM-DD.");
    const from = addDays(date, -days), to = addDays(date, 1);
    const last = ranges.at(-1);
    if (last && from <= last.to) { if (to > last.to) last.to = to; }
    else ranges.push({ from, to });
  }
  return ranges.map(({ from, to }) => ({ from: `${from}T00:00:00Z`, to: `${to}T00:00:00Z` }));
}

// ── FX ───────────────────────────────────────────────────────────────────

/** ECB's quotes for one date: units per 1 EUR as decimal text. `source` is
 * whatever the caller's FX path says it is; only ECB is accepted. */
export interface EcbQuotesInput {
  source: string;
  as_of: string;
  perEur: Readonly<Record<string, string>>;
}
export type FxCheck = { ok: true } | { ok: false; detail: string };

/** Refuses anything but ECB's own quotes for a date in the run's window, with
 * a GBP quote to cross through. A fallback table is never a rate. */
export function checkFxQuotes(quotes: EcbQuotesInput | null | undefined, asOf: string): FxCheck {
  if (!quotes) return { ok: false, detail: "ECB quotes are unavailable." };
  if (quotes.source !== "ecb.europa.eu") return { ok: false, detail: `FX source "${String(quotes.source)}" refused: a derivation uses ECB's own quotes, never fallback rates.` };
  if (!isCalendarDate(quotes.as_of)) return { ok: false, detail: "ECB's observation date is not a calendar date." };
  if (quotes.as_of > asOf || quotes.as_of < addDays(asOf, -FX_QUOTE_MAX_AGE_DAYS)) {
    return { ok: false, detail: `ECB's quotes of ${quotes.as_of} are not within ${FX_QUOTE_MAX_AGE_DAYS} days on or before ${asOf}.` };
  }
  if (typeof quotes.perEur?.GBP !== "string") return { ok: false, detail: "ECB's quotes carry no GBP rate to cross through." };
  return { ok: true };
}

/** The run's FX record for these currencies: each GBP cross via crossRate
 * from ECB's EUR-based quotes ("1" for EUR itself). */
export function fxRecordFor(quotes: EcbQuotesInput, currencies: Iterable<FxCurrency>):
  | { ok: true; record: Partial<Record<FxCurrency, FxQuote>>; rates: Partial<Record<FxCurrency, string>> }
  | { ok: false; detail: string } {
  const record: Partial<Record<FxCurrency, FxQuote>> = {};
  const rates: Partial<Record<FxCurrency, string>> = {};
  for (const currency of [...new Set(currencies)].sort()) {
    const perEur = currency === "EUR" ? "1" : quotes.perEur[currency];
    if (typeof perEur !== "string") return { ok: false, detail: `ECB's quotes carry no ${currency} rate.` };
    let rate: string;
    try { rate = crossRate(perEur, quotes.perEur.GBP!); }
    catch (error) { return { ok: false, detail: `ECB's ${currency} quote cannot be crossed: ${error instanceof Error ? error.message : "invalid"}` }; }
    record[currency] = { rate, source: "ecb.europa.eu", as_of: quotes.as_of };
    rates[currency] = rate;
  }
  return { ok: true, record, rates };
}

// ── Candidates and valuation ─────────────────────────────────────────────

/** The latest accepted observation of a headline metric per (source,
 * product, finish, language, condition, metric) in one window, with its
 * live product crosswalk's resolution (resolveLiveCrosswalk in lib/datafeed)
 * and the set its source set key's live set crosswalk names. */
export interface DerivationCandidate {
  source: DerivedMarketSource;
  sourceProductId: string;
  finish: string | null;
  language: string | null;
  condition: string | null;
  metric: string;
  game: string;
  /** Native decimal text. */
  amount: string;
  currency: string;
  mapping: { status: "exact" | "ambiguous" | "unmapped"; sku: string | null; setCode: string | null };
  /** The set code price_source_set_crosswalks gives the observation's
   * source_set_key in its game, or null: no key, or no live mapping for it. */
  keySetCode: string | null;
}

/** One source product's headline GBP value. Internal to a run: never stored. */
export interface ValuedProduct {
  key: string;
  source: DerivedMarketSource;
  game: string;
  /** The exact product crosswalk's SKU; null when only the source set key
   * maps, so the product is an index constituent and nothing else. */
  sku: string | null;
  /** The set the product counts toward in indices (and, with a SKU, its references and premiums). */
  setCode: string;
  language: string | null;
  gbp: string;
}

/** Counts only, for the run's report. No value, product or SKU is named. */
export interface DerivationSkips {
  /** Candidates at another metric or condition than their source's headline. */
  notHeadline: number;
  /** Headline candidates with no live product crosswalk and no live set crosswalk for their source set key. */
  unmapped: number;
  /** Headline candidates whose live product crosswalk is ambiguous or no longer passes the SKU rule, with no live set crosswalk either. */
  ambiguousMapping: number;
  /** Headline candidates whose exact product crosswalk and source set key name different sets: left out of the run. */
  setConflict: number;
  /** Valued products with a set but no SKU (through their source set key alone): index constituents only, never references or premiums. Not a skip of the index. */
  setKeyOnly: number;
  /** Two headline candidates for one product (defensive: the headline admits one). */
  ambiguousHeadline: number;
  /** Candidates in a currency other than their source's, or without a recorded cross. */
  noRate: number;
  /** Values that round to zero GBP at 6 decimal places. */
  unconvertible: number;
  /** (source, SKU) pairs that two of one source's products map to. */
  ambiguousSku: number;
  /** SKUs valued by one source only. */
  referenceSingleSource: number;
  /** SKUs whose sources include fewer than two whose raw values Cambridge does not export. */
  referenceExportedSources: number;
  /** SKUs whose sources disagree on game or set. */
  referenceIdentityConflict: number;
  /** Index series with fewer than 10 constituents (on both days, when chaining). */
  indexTooFewConstituents: number;
  /** (source, card identity) pairs with more than one SKU on that source. */
  premiumAmbiguousIdentity: number;
  /** Market pairs in a set with fewer than 10 matched card identities. */
  premiumTooFewSkus: number;
}
export function emptySkips(): DerivationSkips {
  return {
    notHeadline: 0, unmapped: 0, ambiguousMapping: 0, setConflict: 0, setKeyOnly: 0, ambiguousHeadline: 0, noRate: 0, unconvertible: 0, ambiguousSku: 0,
    referenceSingleSource: 0, referenceExportedSources: 0, referenceIdentityConflict: 0, indexTooFewConstituents: 0,
    premiumAmbiguousIdentity: 0, premiumTooFewSkus: 0,
  };
}

export const productKey = (product: { source: string; sourceProductId: string; finish: string | null; language: string | null }) =>
  JSON.stringify([product.source, product.sourceProductId, product.finish, product.language]);

/** A product's SKU (exact product crosswalk only) and the set it counts
 * toward, or why it has neither. */
type Placement = { ok: true; sku: string | null; setCode: string } | { ok: false; skip: "unmapped" | "ambiguousMapping" | "setConflict" };
function placement(candidate: DerivationCandidate): Placement {
  const { status, sku, setCode } = candidate.mapping;
  const exact = status === "exact" && sku && setCode ? { sku, setCode } : null;
  const keySet = candidate.keySetCode;
  if (exact && keySet !== null && keySet !== exact.setCode) return { ok: false, skip: "setConflict" };
  if (exact) return { ok: true, ...exact };
  if (keySet !== null) return { ok: true, sku: null, setCode: keySet };
  return { ok: false, skip: status === "unmapped" ? "unmapped" : "ambiguousMapping" };
}

/** Whether a candidate can be valued at all: a headline with a set to count toward. */
export function isPlaceableHeadline(candidate: DerivationCandidate): boolean {
  return isHeadline(candidate) && placement(candidate).ok;
}

/** Headline GBP value per source product, at the given crosses (units per 1 GBP). */
export function valueProducts(candidates: readonly DerivationCandidate[], rates: Partial<Record<FxCurrency, string>>, skips: DerivationSkips): Map<string, ValuedProduct> {
  const products = new Map<string, ValuedProduct>();
  const doubled = new Set<string>();
  for (const candidate of candidates) {
    if (!isHeadline(candidate)) { skips.notHeadline++; continue; }
    const placed = placement(candidate);
    if (!placed.ok) { skips[placed.skip]++; continue; }
    const currency = SOURCE_CURRENCY[candidate.source];
    const rate = rates[currency];
    if (candidate.currency !== currency || !rate) { skips.noRate++; continue; }
    let gbp: string;
    try { gbp = toGbp(candidate.amount, rate); } catch { skips.unconvertible++; continue; }
    const key = productKey(candidate);
    if (doubled.has(key)) { skips.ambiguousHeadline++; continue; }
    if (products.delete(key)) { doubled.add(key); skips.ambiguousHeadline += 2; continue; }
    products.set(key, { key, source: candidate.source, game: candidate.game, sku: placed.sku, setCode: placed.setCode, language: candidate.language, gbp });
  }
  for (const product of products.values()) if (product.sku === null) skips.setKeyOnly++;
  return products;
}

/** Why an eligible source contributed no headline value to a run: the first
 * selection step that left it with nothing. A source that contributes nothing
 * is reported by name with this reason, never only through the skip counts. */
export type ContributionGap =
  /** No accepted, permitted observation of its headline metric in the window. */
  | "no-fresh-observations"
  /** Observations of its headline metrics, none matching its headline: the
   * condition for TCGplayer and CardRush, the finish's metric for Cardmarket. */
  | "no-headline-condition"
  /** Headline observations, none placed in a set by a live crosswalk without conflict. */
  | "no-mapped-headline"
  /** Placed headline observations, none convertible to a GBP value. */
  | "no-valued-headline";

/** A current-window observation of a headline metric, mapped or not, as a
 * run saw it: whether it was a placeable headline (isPlaceableHeadline). */
export interface SeenObservation { source: DerivedMarketSource; finish: string | null; condition: string | null; metric: string; placeable: boolean }

/** `seen` is every current-window observation of a headline metric of the
 * sources; `valued` is valueProducts' result for the same window. */
export function contributionGaps(
  sources: Iterable<DerivedMarketSource>, seen: readonly SeenObservation[], valued: ReadonlyMap<string, ValuedProduct>,
): Partial<Record<DerivedMarketSource, ContributionGap>> {
  const contributed = new Set([...valued.values()].map(product => product.source));
  const gaps: Partial<Record<DerivedMarketSource, ContributionGap>> = {};
  for (const source of sources) {
    if (contributed.has(source)) continue;
    const own = seen.filter(row => row.source === source);
    const headline = own.filter(row => isHeadline(row));
    gaps[source] = !own.length ? "no-fresh-observations" : !headline.length ? "no-headline-condition"
      : !headline.some(row => row.placeable) ? "no-mapped-headline" : "no-valued-headline";
  }
  return gaps;
}

/** SKU → source → that source's one product for it. A (source, SKU) pair
 * that several products map to is ambiguous and left out. A product placed
 * through its source set key alone has no SKU and is not here. */
export function valuesBySku(products: Iterable<ValuedProduct>, skips: DerivationSkips): Map<string, Map<DerivedMarketSource, ValuedProduct>> {
  const bySku = new Map<string, Map<DerivedMarketSource, ValuedProduct>>();
  const ambiguous = new Set<string>();
  for (const product of products) {
    if (product.sku === null) continue;
    const pair = JSON.stringify([product.source, product.sku]);
    if (ambiguous.has(pair)) continue;
    const sources = bySku.get(product.sku) ?? new Map<DerivedMarketSource, ValuedProduct>();
    if (sources.delete(product.source)) { ambiguous.add(pair); skips.ambiguousSku++; }
    else sources.set(product.source, product);
    if (sources.size) bySku.set(product.sku, sources); else bySku.delete(product.sku);
  }
  return bySku;
}

const bySortKey = <T>(entries: Iterable<[string, T]>) => [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

// ── References ───────────────────────────────────────────────────────────

export interface ReferenceRow {
  sku: string;
  game: string;
  setCode: string;
  amount: string;
  confidence: DerivedConfidence;
  /** Canonical order (DERIVED_MARKET_SOURCES), as 0141 stores them. */
  sources: DerivedMarketSource[];
}

/** A reference per SKU whose sources pass referenceSourcesAllowed against the
 * exportable set read from the release rows: at least two contributing
 * sources Cambridge does not export. Cardmarket with one display-only source
 * is refused, since 2 × reference − Cardmarket would give the other back. */
export function computeReferences(bySku: ReadonlyMap<string, ReadonlyMap<DerivedMarketSource, ValuedProduct>>, exportable: Iterable<string>, skips: DerivationSkips): ReferenceRow[] {
  const exported = [...exportable];
  const rows: ReferenceRow[] = [];
  for (const [sku, bySource] of bySortKey(bySku)) {
    const sources = DERIVED_MARKET_SOURCES.filter(source => bySource.has(source));
    if (sources.length < MIN_REFERENCE_SOURCES) { skips.referenceSingleSource++; continue; }
    if (!referenceSourcesAllowed(sources, exported)) { skips.referenceExportedSources++; continue; }
    const contributing = sources.map(source => bySource.get(source)!);
    const first = contributing[0]!;
    if (contributing.some(product => product.game !== first.game || product.setCode !== first.setCode)) { skips.referenceIdentityConflict++; continue; }
    const values = contributing.map(product => product.gbp);
    rows.push({ sku, game: first.game, setCode: first.setCode, amount: referenceAmount(values), confidence: confidenceFor(values), sources });
  }
  return rows;
}

// ── Indices ──────────────────────────────────────────────────────────────

export interface IndexRow {
  game: string;
  /** null for the per-game index. */
  setCode: string | null;
  market: DerivedMarketSource;
  level: string;
  constituents: number;
  previousAsOf: string | null;
}
/** A series' latest published level, and the run date it was published for. */
export interface PublishedLevel { asOf: string; level: string }

/** Chain-linked per game × set × market and per game × market over source
 * products placed in a set (valueProducts: an exact product crosswalk's set
 * code, or the set its source set key's live set crosswalk names). A
 * series with a published level chains from its latest one over the products
 * valued on both that level's date and today (chainIndex); a series that has
 * never published starts at 100 (startIndex). Neither happens below 10
 * constituents, and a series that has published never restarts: 0141's
 * market_indices_one_base refuses a second base row. */
export function computeIndices(asOf: string, today: ReadonlyMap<string, ValuedProduct>, prior: {
  latest: ReadonlyMap<string, PublishedLevel>;
  /** Run date → product key → that date's headline GBP value. */
  valuations: ReadonlyMap<string, ReadonlyMap<string, string>>;
}, skips: DerivationSkips): IndexRow[] {
  const series = new Map<string, { game: string; setCode: string | null; market: DerivedMarketSource; members: ValuedProduct[] }>();
  for (const product of today.values()) {
    for (const setCode of [null, product.setCode]) {
      const key = marketIndexKey(product.game, setCode, product.source);
      const entry = series.get(key) ?? { game: product.game, setCode, market: product.source, members: [] };
      entry.members.push(product);
      series.set(key, entry);
    }
  }
  const rows: IndexRow[] = [];
  for (const [key, { game, setCode, market, members }] of bySortKey(series)) {
    const latest = prior.latest.get(key);
    // A level dated today or later belongs to a run this one must not precede
    // or repeat; derive.ts refuses such runs before computing anything.
    if (latest && latest.asOf >= asOf) throw new RangeError(`Index series ${key} already has a level on or after ${asOf}.`);
    let step: IndexStep;
    if (latest) {
      const before = prior.valuations.get(latest.asOf);
      const pairs: IndexPair[] = members.flatMap(member => {
        const previous = before?.get(member.key);
        return previous ? [{ previous, current: member.gbp }] : [];
      });
      step = chainIndex(latest.level, pairs);
    } else {
      step = startIndex(members.map(member => member.gbp));
    }
    if (!step.ok) { skips.indexTooFewConstituents++; continue; }
    rows.push({ game, setCode, market, level: step.level, constituents: step.constituents, previousAsOf: latest?.asOf ?? null });
  }
  return rows;
}

// ── Premiums ─────────────────────────────────────────────────────────────

/** The card a SKU prints, for comparing markets. Where the game's oracle
 * policy says numbering is shared across languages (stripped, single-lang),
 * that is the SKU without its language segment, variant kept: a Japanese
 * and an English printing of one card compare, a parallel and a base print
 * do not. Where it is not (passcode, diverged: Yu-Gi-Oh!, Pokémon), the whole
 * SKU, so only the same printing language compares. */
export function premiumIdentity(sku: string): string | null {
  if (!parseSku(sku)) return null;
  return resolveOracle(sku).oracle_id ?? sku;
}

/** One row per unordered market pair: base_market is the pair's first
 * source in DERIVED_MARKET_SOURCES order, so ratios read market ÷ base. */
export const PREMIUM_PAIRS: readonly { market: DerivedMarketSource; baseMarket: DerivedMarketSource }[] = Object.freeze(
  DERIVED_MARKET_SOURCES.flatMap((baseMarket, i) => DERIVED_MARKET_SOURCES.slice(i + 1).map(market => ({ market, baseMarket }))),
);

export interface PremiumRow {
  game: string;
  setCode: string;
  market: DerivedMarketSource;
  baseMarket: DerivedMarketSource;
  ratioP25: string;
  ratioMedian: string;
  ratioP75: string;
  /** Matched card identities. */
  skuCount: number;
  /** Each side's language basis: ISO 639-1 codes of the values compared, ANY_LANGUAGE for a value recorded with no language. Distinct, ascending. */
  marketLanguages: string[];
  baseLanguages: string[];
}

/** Quartiles of market ÷ base GBP values per game × set, over card
 * identities valued by exactly one SKU on each side (premiumIdentity). A
 * source with several SKUs for one identity (two languages, say) is
 * ambiguous for it and that identity is left out, never averaged. */
export function computePremiums(bySku: ReadonlyMap<string, ReadonlyMap<DerivedMarketSource, ValuedProduct>>, skips: DerivationSkips): PremiumRow[] {
  // [game, set, identity] → source → its one value (null once ambiguous).
  const identities = new Map<string, Map<DerivedMarketSource, { gbp: string; language: string } | null>>();
  for (const [sku, bySource] of bySortKey(bySku)) {
    const identity = premiumIdentity(sku);
    if (!identity) continue;
    for (const [source, product] of bySource) {
      const key = JSON.stringify([product.game, product.setCode, identity]);
      const sides = identities.get(key) ?? new Map();
      const seen = sides.get(source);
      if (seen === undefined) sides.set(source, { gbp: product.gbp, language: product.language ?? ANY_LANGUAGE });
      else if (seen !== null) { sides.set(source, null); skips.premiumAmbiguousIdentity++; }
      identities.set(key, sides);
    }
  }
  const rows: PremiumRow[] = [];
  for (const { market, baseMarket } of PREMIUM_PAIRS) {
    const groups = new Map<string, { game: string; setCode: string; pairs: PremiumPair[]; marketLanguages: Set<string>; baseLanguages: Set<string> }>();
    for (const [key, sides] of bySortKey(identities)) {
      const top = sides.get(market), base = sides.get(baseMarket);
      if (!top || !base) continue;
      const [game, setCode] = JSON.parse(key) as [string, string, string];
      const groupKey = JSON.stringify([game, setCode]);
      const group = groups.get(groupKey) ?? { game, setCode, pairs: [], marketLanguages: new Set(), baseLanguages: new Set() };
      group.pairs.push({ market: top.gbp, baseMarket: base.gbp });
      group.marketLanguages.add(top.language);
      group.baseLanguages.add(base.language);
      groups.set(groupKey, group);
    }
    for (const [, group] of bySortKey(groups)) {
      const quartiles = premiumQuantiles(group.pairs);
      if (!quartiles.ok) { skips.premiumTooFewSkus++; continue; }
      rows.push({
        game: group.game, setCode: group.setCode, market, baseMarket,
        ratioP25: quartiles.ratioP25, ratioMedian: quartiles.ratioMedian, ratioP75: quartiles.ratioP75, skuCount: quartiles.skuCount,
        marketLanguages: [...group.marketLanguages].sort(), baseLanguages: [...group.baseLanguages].sort(),
      });
    }
  }
  return rows;
}
