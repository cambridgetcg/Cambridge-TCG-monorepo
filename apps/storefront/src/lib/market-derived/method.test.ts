import { describe, expect, it } from "vitest";
import { chainIndex, confidenceFor, crossRate, premiumQuantiles, referenceAmount, toGbp, type DerivedMarketSource } from "@cambridge-tcg/data-spec";
import { TCGPLAYER_HEADLINE_CONDITION, TCGPLAYER_PRODUCT_LINES, parseTcgplayerPriceGuide } from "@cambridge-tcg/data-ingest/tcgplayer/member-prices";
import {
  ANY_LANGUAGE, HEADLINE, HEADLINE_METRICS, PREMIUM_PAIRS, addDays, checkFxQuotes, computeIndices, computePremiums, computeReferences, contributionGaps,
  emptySkips, fxRecordFor, isHeadline, premiumIdentity, productKey, scanRanges, valueProducts, valuesBySku,
  type DerivationCandidate, type ValuedProduct,
} from "./method";

const RATES = { EUR: "1.153136531365", JPY: "187.419280442804", USD: "1.246771744696" };
const CURRENCY: Record<DerivedMarketSource, string> = { cardmarket: "EUR", cardrush: "JPY", tcgplayer: "USD" };
const LANGUAGE: Record<DerivedMarketSource, string | null> = { cardmarket: null, cardrush: "ja", tcgplayer: "en" };
const HEADLINE_FIELDS: Record<DerivedMarketSource, Pick<DerivationCandidate, "metric" | "condition">> = {
  cardmarket: { metric: "trend", condition: null },
  cardrush: { metric: "sell", condition: null },
  tcgplayer: { metric: "market", condition: TCGPLAYER_HEADLINE_CONDITION },
};
function candidate(source: DerivedMarketSource, id: string, sku: string | null, fields: Partial<DerivationCandidate> = {}): DerivationCandidate {
  return {
    source, sourceProductId: id, finish: null, language: LANGUAGE[source], game: "one-piece", amount: "10", currency: CURRENCY[source],
    mapping: sku ? { status: "exact", sku, setCode: sku.split("-")[1]! } : { status: "unmapped", sku: null, setCode: null }, keySetCode: null,
    ...HEADLINE_FIELDS[source], ...fields,
  };
}
function product(source: DerivedMarketSource, id: string, sku: string, gbp: string, fields: Partial<ValuedProduct> = {}): ValuedProduct {
  const language = fields.language === undefined ? LANGUAGE[source] : fields.language;
  return { key: productKey({ source, sourceProductId: id, finish: null, language }), source, game: "one-piece", sku, setCode: sku.split("-")[1]!, language, gbp, ...fields };
}
const number = (i: number) => String(i + 1).padStart(3, "0");
const bySku = (products: ValuedProduct[]) => valuesBySku(products, emptySkips());

describe("headline selection", () => {
  it.each<[DerivedMarketSource, string | null, string, string | null, boolean]>([
    ["cardmarket", null, "trend", null, true],
    ["cardmarket", null, "trend-foil", null, false],
    ["cardmarket", "foil", "trend-foil", null, true],
    ["cardmarket", "foil", "trend", null, false],
    ["cardmarket", null, "avg7", null, false],
    ["cardrush", "parallel", "sell", null, true],
    ["cardrush", null, "sell", "状態B", false],
    ["tcgplayer", "normal", "market", "near-mint", true],
    ["tcgplayer", "foil", "market", "near-mint", true],
    ["tcgplayer", "normal", "market", "lightly-played", false],
    // The page's own text is not the stored grade: the collector records near-mint.
    ["tcgplayer", "normal", "market", "Near Mint", false],
    ["tcgplayer", "normal", "market", null, false],
    ["tcgplayer", "normal", "listed-median", "near-mint", false],
  ])("%s finish=%j metric=%s condition=%j → %s", (source, finish, metric, condition, expected) => {
    expect(isHeadline({ source, finish, metric, condition })).toBe(expected);
  });

  it("reads TCGplayer's headline grade from its collector, so what the collector stores is what a run averages", () => {
    expect(HEADLINE.tcgplayer.condition).toBe(TCGPLAYER_HEADLINE_CONDITION);
    const line = TCGPLAYER_PRODUCT_LINES.find(entry => entry.slug === "one-piece-card-game")!;
    const row = (condition: string, marketPrice: number) => ({ productID: 454591, condition, game: line.gameLabel, marketPrice, number: "OP01-064", printing: "Normal", productName: "Alvida", set: "Romance Dawn", setAbbrv: "OP01", type: "Cards" });
    const guide = parseTcgplayerPriceGuide({
      line, set: { setId: 3188, categoryId: 68, name: "Romance Dawn", abbreviation: "OP01", urlName: "romance-dawn", releaseDate: "2022-12-02" },
      bytes: new TextEncoder().encode(JSON.stringify({ result: [row("Near Mint", 1.5), row("Lightly Played", 0.25)] })),
      sourceUrl: "https://infinite-api.tcgplayer.com/priceguide/set/3188/cards/?rows=5000&productTypeID=110", retrievedAt: "2026-10-28T15:00:00.000Z",
    });
    const stored = guide.parsed.observations.map(observation => ({ source: "tcgplayer" as const, finish: observation.finish, condition: observation.condition, metric: observation.metric, amount: observation.amount }));
    expect(stored.filter(isHeadline).map(observation => observation.amount)).toEqual(["1.5"]);
  });

  // The snapshot reads only these metrics, so a headline metric missing here
  // would be dropped before isHeadline ever saw it.
  it("reads every metric a headline can name, and nothing else", () => {
    expect(HEADLINE_METRICS).toEqual({ cardmarket: ["trend", "trend-foil"], cardrush: ["sell"], tcgplayer: ["market"] });
    for (const source of Object.keys(HEADLINE) as DerivedMarketSource[]) {
      for (const finish of [null, "foil", "normal", "parallel", "reverse-holofoil"]) expect(HEADLINE_METRICS[source]).toContain(HEADLINE[source].metric(finish));
    }
  });

  it("values one product from its headline condition only, counting the others and never averaging them", () => {
    const skips = emptySkips();
    const products = valueProducts([
      candidate("tcgplayer", "t1", "op-op01-001-en", { amount: "12.4" }),
      candidate("tcgplayer", "t1", "op-op01-001-en", { amount: "8.1", condition: "Lightly Played" }),
      candidate("tcgplayer", "t1", "op-op01-001-en", { amount: "15", metric: "listed-median" }),
      candidate("cardrush", "r1", "op-op01-001-ja", { amount: "900", condition: "状態B" }),
    ], RATES, skips);
    expect([...products.values()]).toEqual([expect.objectContaining({ source: "tcgplayer", sku: "op-op01-001-en", gbp: toGbp("12.4", RATES.USD) })]);
    expect(skips.notHeadline).toBe(3);
  });

  it("counts unmapped, ambiguous, rateless and unconvertible candidates instead of valuing them", () => {
    const skips = emptySkips();
    const products = valueProducts([
      candidate("cardmarket", "1", null),
      candidate("cardmarket", "2", null, { mapping: { status: "ambiguous", sku: null, setCode: null } }),
      candidate("cardrush", "3", "op-op01-003-ja", { currency: "USD" }),
      candidate("tcgplayer", "4", "op-op01-004-en"),
      candidate("cardrush", "5", "op-op01-005-ja", { amount: "0.000001" }),
      candidate("cardmarket", "6", "op-op01-006-en", { amount: "2.950000" }),
    ], { EUR: RATES.EUR, JPY: RATES.JPY }, skips);
    expect(skips).toMatchObject({ unmapped: 1, ambiguousMapping: 1, noRate: 2, unconvertible: 1 });
    expect([...products.values()].map(p => [p.sku, p.gbp])).toEqual([["op-op01-006-en", toGbp("2.95", RATES.EUR)]]);
  });

  it("places a product without a product crosswalk in its set through its source set key, for indices only", () => {
    const skips = emptySkips();
    const products = valueProducts([
      candidate("cardmarket", "set-only", null, { keySetCode: "op02" }),
      candidate("cardmarket", "ambiguous", null, { mapping: { status: "ambiguous", sku: null, setCode: null }, keySetCode: "op02" }),
      candidate("cardmarket", "both", "op-op01-002-en", { keySetCode: "op01" }),
      candidate("cardmarket", "conflict", "op-op01-003-en", { keySetCode: "op02" }),
      candidate("cardmarket", "nothing", null),
    ], RATES, skips);
    expect([...products.values()].map(p => [p.key, p.sku, p.setCode])).toEqual([
      [productKey({ source: "cardmarket", sourceProductId: "set-only", finish: null, language: null }), null, "op02"],
      [productKey({ source: "cardmarket", sourceProductId: "ambiguous", finish: null, language: null }), null, "op02"],
      [productKey({ source: "cardmarket", sourceProductId: "both", finish: null, language: null }), "op-op01-002-en", "op01"],
    ]);
    // Two reviewed mappings that name different sets: left out, never guessed.
    expect(skips).toMatchObject({ setKeyOnly: 2, setConflict: 1, unmapped: 1, ambiguousMapping: 0 });
    // Only the product with a SKU can reach references or premiums.
    expect([...valuesBySku(products.values(), emptySkips()).keys()]).toEqual(["op-op01-002-en"]);
  });

  it("names an eligible source that contributes nothing, with the step that left it empty", () => {
    const seen = (source: DerivedMarketSource, condition: string | null, placeable: boolean) => ({ source, finish: null, condition, metric: HEADLINE[source].metric(null), placeable });
    const valued = valueProducts([candidate("cardmarket", "1", "op-op01-001-en")], RATES, emptySkips());
    expect(contributionGaps(["cardmarket", "cardrush", "tcgplayer"], [seen("cardmarket", null, true), seen("tcgplayer", "Near Mint", false)], valued))
      .toEqual({ cardrush: "no-fresh-observations", tcgplayer: "no-headline-condition" });
    expect(contributionGaps(["tcgplayer"], [seen("tcgplayer", "near-mint", false)], new Map())).toEqual({ tcgplayer: "no-mapped-headline" });
    expect(contributionGaps(["tcgplayer"], [seen("tcgplayer", "near-mint", true)], new Map())).toEqual({ tcgplayer: "no-valued-headline" });
    expect(contributionGaps(["cardmarket"], [seen("cardmarket", null, true)], valued)).toEqual({});
  });

  it("leaves out a SKU that two of one source's products map to, for that source only", () => {
    const skips = emptySkips();
    const values = valuesBySku([
      product("cardrush", "a", "op-op01-001-ja", "5"), product("cardrush", "b", "op-op01-001-ja", "6"), product("cardrush", "c", "op-op01-001-ja", "7"),
      product("tcgplayer", "t", "op-op01-001-ja", "5.5", { language: "ja" }),
    ], skips);
    expect([...values.get("op-op01-001-ja")!.keys()]).toEqual(["tcgplayer"]);
    expect(skips.ambiguousSku).toBe(1);
  });
});

describe("reference prices", () => {
  const exportable = ["cardmarket"];

  it("never writes Cardmarket with one display-only source: the exported value would give the other back", () => {
    const skips = emptySkips();
    const rows = computeReferences(bySku([
      product("cardmarket", "1", "op-op01-001-ja", "10"), product("cardrush", "r", "op-op01-001-ja", "11"),
      product("cardmarket", "2", "op-op01-002-en", "10"), product("tcgplayer", "t", "op-op01-002-en", "12"),
    ]), exportable, skips);
    expect(rows).toEqual([]);
    expect(skips.referenceExportedSources).toBe(2);
  });

  it("writes the mean of two unexported sources, and lets Cardmarket contribute on top", () => {
    const rows = computeReferences(bySku([
      product("cardrush", "r1", "op-op01-001-ja", "10.1"), product("tcgplayer", "t1", "op-op01-001-ja", "12.6", { language: "ja" }),
      product("cardmarket", "c2", "op-op01-002-ja", "9.9"), product("cardrush", "r2", "op-op01-002-ja", "10.2"), product("tcgplayer", "t2", "op-op01-002-ja", "11.4", { language: "ja" }),
      product("cardrush", "r3", "op-op01-003-ja", "4"),
    ]), exportable, emptySkips());
    expect(rows).toEqual([
      { sku: "op-op01-001-ja", game: "one-piece", setCode: "op01", amount: referenceAmount(["10.1", "12.6"]), confidence: confidenceFor(["10.1", "12.6"]), sources: ["cardrush", "tcgplayer"] },
      { sku: "op-op01-002-ja", game: "one-piece", setCode: "op01", amount: "10.5", confidence: "high", sources: ["cardmarket", "cardrush", "tcgplayer"] },
    ]);
    expect(rows[0]).toMatchObject({ amount: "11.4", confidence: "medium" });
  });

  it("reads exportability from the release rows it is given rather than assuming it", () => {
    const values = bySku([product("cardmarket", "1", "op-op01-001-ja", "10"), product("cardrush", "r", "op-op01-001-ja", "11")]);
    expect(computeReferences(values, [], emptySkips())).toHaveLength(1);
    expect(computeReferences(values, ["cardmarket"], emptySkips())).toHaveLength(0);
    expect(computeReferences(bySku([product("cardrush", "r", "op-op01-009-ja", "1"), product("tcgplayer", "t", "op-op01-009-ja", "1", { language: "ja" })]), ["cardrush"], emptySkips())).toHaveLength(0);
  });
});

describe("index chaining", () => {
  const today = (count: number, gbp: (i: number) => string, source: DerivedMarketSource = "cardmarket", set = "op01") =>
    new Map(Array.from({ length: count }, (_, i) => product(source, `${set}-${i}`, `op-${set}-${number(i)}-en`, gbp(i))).map(p => [p.key, p]));
  const none = { latest: new Map(), valuations: new Map() };

  it("starts a series at 100 the first time it has ten constituents, per set and per game", () => {
    const skips = emptySkips();
    const products = new Map([...today(10, () => "2.5"), ...today(4, () => "3", "cardmarket", "op02")]);
    expect(computeIndices("2026-10-29", products, none, skips)).toEqual([
      { game: "one-piece", setCode: null, market: "cardmarket", level: "100", constituents: 14, previousAsOf: null },
      { game: "one-piece", setCode: "op01", market: "cardmarket", level: "100", constituents: 10, previousAsOf: null },
    ]);
    expect(skips.indexTooFewConstituents).toBe(1);
  });

  it("counts products placed only through their source set key as constituents of their set's series", () => {
    const keyed = valueProducts(Array.from({ length: 10 }, (_, i) => candidate("cardmarket", `x${i}`, null, { keySetCode: "op03", amount: "2" })), RATES, emptySkips());
    expect(computeIndices("2026-10-29", keyed, none, emptySkips())).toEqual([
      { game: "one-piece", setCode: null, market: "cardmarket", level: "100", constituents: 10, previousAsOf: null },
      { game: "one-piece", setCode: "op03", market: "cardmarket", level: "100", constituents: 10, previousAsOf: null },
    ]);
  });

  it("chains from the latest published level over products valued on both days only", () => {
    const products = new Map([...today(11, i => (i === 10 ? "500" : "1.1"))]);
    const previous = new Map([...today(10, () => "1")].map(([key]) => [key, "1"]));
    const prior = {
      latest: new Map([["one-piece:op01:cardmarket", { asOf: "2026-10-29", level: "100" }], ["one-piece:*:cardmarket", { asOf: "2026-10-27", level: "105.5" }]]),
      valuations: new Map([["2026-10-29", previous], ["2026-10-27", previous]]),
    };
    const pairs = Array.from({ length: 10 }, () => ({ previous: "1", current: "1.1" }));
    expect(computeIndices("2026-10-30", products, prior, emptySkips())).toEqual([
      // After a gap the series chains from its latest level, never back to 100.
      { game: "one-piece", setCode: null, market: "cardmarket", level: (chainIndex("105.5", pairs) as { level: string }).level, constituents: 10, previousAsOf: "2026-10-27" },
      { game: "one-piece", setCode: "op01", market: "cardmarket", level: "110", constituents: 10, previousAsOf: "2026-10-29" },
    ]);
  });

  it("skips a published series that cannot chain rather than restarting it", () => {
    const skips = emptySkips();
    const previous = new Map([...today(9, () => "1")].map(([key]) => [key, "1"]));
    const prior = { latest: new Map([["one-piece:op01:cardmarket", { asOf: "2026-10-29", level: "100" }], ["one-piece:*:cardmarket", { asOf: "2026-10-29", level: "100" }]]), valuations: new Map([["2026-10-29", previous]]) };
    expect(computeIndices("2026-10-30", today(20, () => "1"), prior, skips)).toEqual([]);
    expect(skips.indexTooFewConstituents).toBe(2);
  });

  it("refuses to compute a series that already has a level on or after the date", () => {
    const prior = { latest: new Map([["one-piece:*:cardmarket", { asOf: "2026-10-30", level: "100" }]]), valuations: new Map() };
    expect(() => computeIndices("2026-10-30", today(10, () => "1"), prior, emptySkips())).toThrow(RangeError);
  });
});

describe("premiums on card identity", () => {
  it.each([
    ["op-op01-001-ja", "op-op01-001"],
    ["op-op01-001-en-p1", "op-op01-001-p1"],
    ["mtg-otj-001-de-foil", "mtg-otj-001-foil"],
    ["pkm-sv01-001-en", "pkm-sv01-001-en"],
    ["ygo-lob-001-en", "ygo-lob-001-en"],
    ["not-a-sku", null],
  ])("%s → %s", (sku, identity) => {
    expect(premiumIdentity(sku)).toBe(identity);
  });

  it("orients one row per market pair, base first in source order", () => {
    expect(PREMIUM_PAIRS).toEqual([
      { market: "cardrush", baseMarket: "cardmarket" }, { market: "tcgplayer", baseMarket: "cardmarket" }, { market: "tcgplayer", baseMarket: "cardrush" },
    ]);
  });

  it("compares a Japanese printing with Cardmarket's product aggregate of the same card and records each side's language basis", () => {
    const products = Array.from({ length: 12 }, (_, i) => [
      product("cardmarket", `c${i}`, `op-op01-${number(i)}-en`, "2"),
      product("cardrush", `r${i}`, `op-op01-${number(i)}-ja`, String(2 + i / 10)),
    ]).flat();
    // A parallel is another card identity; it pairs with nothing here.
    products.push(product("cardrush", "rp", "op-op01-001-ja-p1", "40"));
    const rows = computePremiums(bySku(products), emptySkips());
    const expected = premiumQuantiles(Array.from({ length: 12 }, (_, i) => ({ market: String(2 + i / 10), baseMarket: "2" })));
    expect(expected.ok).toBe(true);
    expect(rows).toEqual([{
      game: "one-piece", setCode: "op01", market: "cardrush", baseMarket: "cardmarket", skuCount: 12,
      ratioP25: (expected as { ratioP25: string }).ratioP25, ratioMedian: (expected as { ratioMedian: string }).ratioMedian, ratioP75: (expected as { ratioP75: string }).ratioP75,
      marketLanguages: ["ja"], baseLanguages: [ANY_LANGUAGE],
    }]);
  });

  it("leaves out an identity a source prices in two languages, and below ten identities writes nothing", () => {
    const skips = emptySkips();
    const products = Array.from({ length: 10 }, (_, i) => [
      product("cardrush", `r${i}`, `op-op01-${number(i)}-ja`, "3"),
      product("tcgplayer", `t${i}`, `op-op01-${number(i)}-en`, "4"),
    ]).flat();
    products.push(product("tcgplayer", "tj", "op-op01-001-ja", "3.5", { language: "ja" }));
    expect(computePremiums(bySku(products), skips)).toEqual([]);
    expect(skips).toMatchObject({ premiumAmbiguousIdentity: 1, premiumTooFewSkus: 1 });
  });

  it("matches only the same printing language where a game's numbering differs across languages", () => {
    const products = Array.from({ length: 10 }, (_, i) => [
      product("cardmarket", `c${i}`, `pkm-sv01-${number(i)}-en`, "1", { game: "pokemon" }),
      product("tcgplayer", `t${i}`, `pkm-sv01-${number(i)}-${i < 5 ? "en" : "ja"}`, "2", { game: "pokemon", language: i < 5 ? "en" : "ja" }),
    ]).flat();
    const skips = emptySkips();
    expect(computePremiums(bySku(products), skips)).toEqual([]);
    expect(skips.premiumTooFewSkus).toBe(1);
  });
});

describe("scan ranges", () => {
  it("reads each window's own week and day, never the days between windows", () => {
    // Today, yesterday, and a series last published three weeks before.
    expect(scanRanges(["2026-11-26", "2026-11-25", "2026-11-06"], 7)).toEqual([
      { from: "2026-10-30T00:00:00Z", to: "2026-11-07T00:00:00Z" },
      { from: "2026-11-18T00:00:00Z", to: "2026-11-27T00:00:00Z" },
    ]);
  });

  it("merges windows whose ranges overlap or touch, and repeats none", () => {
    expect(scanRanges(["2026-11-06", "2026-11-14", "2026-11-14"], 7)).toEqual([{ from: "2026-10-30T00:00:00Z", to: "2026-11-15T00:00:00Z" }]);
    expect(scanRanges(["2026-11-06", "2026-11-15"], 7)).toEqual([
      { from: "2026-10-30T00:00:00Z", to: "2026-11-07T00:00:00Z" }, { from: "2026-11-08T00:00:00Z", to: "2026-11-16T00:00:00Z" },
    ]);
    expect(scanRanges([], 7)).toEqual([]);
  });

  it("refuses a date that is not a calendar date", () => {
    expect(() => scanRanges(["2026-11-31"], 7)).toThrow(RangeError);
  });
});

describe("FX from ECB's quotes", () => {
  const quotes = { source: "ecb.europa.eu", as_of: "2026-10-27", perEur: { GBP: "0.8672", JPY: "162.53", USD: "1.0812" } };

  it.each([
    ["absent quotes", null, /unavailable/],
    ["a fallback table", { ...quotes, source: "fallback" }, /never fallback/],
    ["quotes dated after the run", { ...quotes, as_of: "2026-10-29" }, /not within 7 days/],
    ["quotes eight days old", { ...quotes, as_of: "2026-10-20" }, /not within 7 days/],
    ["an impossible date", { ...quotes, as_of: "2026-02-30" }, /calendar date/],
    ["no GBP quote", { ...quotes, perEur: { JPY: "162.53" } }, /GBP/],
  ])("refuses %s", (_label, input, detail) => {
    const check = checkFxQuotes(input, "2026-10-28");
    expect(check.ok).toBe(false);
    expect(check.ok ? "" : check.detail).toMatch(detail);
  });

  it("accepts ECB's quotes up to seven days before the run", () => {
    expect(checkFxQuotes({ ...quotes, as_of: addDays("2026-10-28", -7) }, "2026-10-28")).toEqual({ ok: true });
  });

  it("records each cross via crossRate, with ECB's date, and refuses a missing currency", () => {
    expect(fxRecordFor(quotes, ["JPY", "EUR", "JPY"])).toEqual({
      ok: true,
      record: { EUR: { rate: crossRate("1", "0.8672"), source: "ecb.europa.eu", as_of: "2026-10-27" }, JPY: { rate: "187.419280442804", source: "ecb.europa.eu", as_of: "2026-10-27" } },
      rates: { EUR: crossRate("1", "0.8672"), JPY: "187.419280442804" },
    });
    expect(fxRecordFor({ ...quotes, perEur: { GBP: "0.8672" } }, ["USD"])).toMatchObject({ ok: false, detail: expect.stringMatching(/USD/) });
  });
});
