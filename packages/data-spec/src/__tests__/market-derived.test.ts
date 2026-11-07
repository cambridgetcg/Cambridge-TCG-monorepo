import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import {
  DERIVED_MARKET_CONTRACT, DERIVED_MARKET_SOURCES, MIN_REFERENCE_SOURCES, MIN_INDEX_CONSTITUENTS, MIN_PREMIUM_SKUS,
  MIN_REFERENCE_UNEXPORTED_SOURCES, EXPORTABLE_DERIVATION_SOURCES,
  REFERENCE_FRESHNESS_DAYS, THREE_FIGURES_PATTERN_BODY, INDEX_LEVEL_PATTERN_BODY,
  MARKET_DERIVATION_RUN_SCHEMA, MARKET_REFERENCE_PRICE_SCHEMA, MARKET_INDEX_POINT_SCHEMA, MARKET_PREMIUM_SCHEMA,
  roundToSignificant, crossRate, toGbp, referenceSourcesAllowed, FX_CROSS_SCALE, referenceAmount, confidenceFor, startIndex, chainIndex, premiumQuantiles, marketIndexKey,
  type IndexPair, type PremiumPair,
} from "../index";

const ajv = new Ajv2020({ allErrors: true, strictTypes: false });
addFormats(ajv);
const validRun = ajv.compile(MARKET_DERIVATION_RUN_SCHEMA);
const validReference = ajv.compile(MARKET_REFERENCE_PRICE_SCHEMA);
const validIndex = ajv.compile(MARKET_INDEX_POINT_SCHEMA);
const validPremium = ajv.compile(MARKET_PREMIUM_SCHEMA);
const threeFigures = new RegExp(`^${THREE_FIGURES_PATTERN_BODY}$`);
const indexLevel = new RegExp(`^${INDEX_LEVEL_PATTERN_BODY}$`);
const migration = readFileSync(new URL("../../../../apps/storefront/drizzle/0141_market_derived.sql", import.meta.url), "utf8");
const pairs = (n: number, previous: string, current: string): IndexPair[] => Array.from({ length: n }, () => ({ previous, current }));
const ratios = (values: readonly number[]): PremiumPair[] => values.map(value => ({ market: String(value), baseMarket: "1" }));

describe("roundToSignificant", () => {
  it.each([
    ["12.345", "12.3"], ["1234.5", "1230"], ["0.012345", "0.0123"],
    ["12.35", "12.4"], ["12.25", "12.3"], ["12.349999", "12.3"], ["1.245", "1.25"],
    ["9.995", "10"], ["9.994", "9.99"], ["999.5", "1000"], ["999.4", "999"], ["0.09995", "0.1"],
    ["1005", "1010"], ["1004.9999", "1000"], ["100", "100"], ["1", "1"], ["0.1", "0.1"], ["0.001", "0.001"],
    ["12.300", "12.3"], ["0012.34", "12.3"], ["0.000012345", "0.0000123"],
    ["123456789012345678901234567890", "123000000000000000000000000000"],
  ])("rounds %s half-up to %s", (value, expected) => {
    expect(roundToSignificant(value, 3)).toBe(expected);
  });
  it("is exact where binary floats are not", () => {
    // Math.round(1.005 * 100) / 100 === 1 and (2.675).toFixed(2) === "2.67".
    expect(roundToSignificant("1.005", 3)).toBe("1.01");
    expect(roundToSignificant("2.675", 3)).toBe("2.68");
    expect(roundToSignificant("0.30000000000000004", 3)).toBe("0.3");
  });
  it("honours other figure counts", () => {
    expect(roundToSignificant("15", 1)).toBe("20");
    expect(roundToSignificant("149", 1)).toBe("100");
    expect(roundToSignificant("12.345", 4)).toBe("12.35");
    expect(roundToSignificant("12.345", 10)).toBe("12.345");
  });
  it.each(["", "0", "0.000", "-1", "+1", "1e3", "1E3", " 1", "1 ", "1\n", "1.", ".5", "1,5", "NaN", "Infinity", "１"])(
    "refuses %j", value => { expect(() => roundToSignificant(value, 3)).toThrow(RangeError); },
  );
  it.each([12.3, null, undefined, 12n])("refuses non-string %s", value => {
    expect(() => roundToSignificant(value as unknown as string, 3)).toThrow(TypeError);
  });
  it.each([0, -1, 1.5, 31, Number.NaN])("refuses figure count %s", figures => {
    expect(() => roundToSignificant("12.3", figures)).toThrow(RangeError);
  });
  it("produces only text the database and schemas accept, below 10^12", () => {
    for (let exponent = -6; exponent <= 11; exponent++) {
      for (const mantissa of ["1", "1.004", "1.005", "4.5", "9.94", "9.95", "9.999", "1.23456", "7.0001"]) {
        const [whole, fraction = ""] = mantissa.split(".");
        const digits = `${whole}${fraction}`;
        const point = whole!.length + exponent;
        const value = point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? digits.padEnd(point, "0") : `${digits.slice(0, point)}.${digits.slice(point)}`;
        const rounded = roundToSignificant(value, 3);
        if (Number(rounded) < 1e12) expect(rounded, `${value} → ${rounded}`).toMatch(threeFigures);
      }
    }
  });
});

describe("crossRate", () => {
  // ECB quotes per 1 EUR; GBP 0.8672 means 1 EUR = 0.8672 GBP.
  it("divides the EUR-based quote by ECB's GBP quote, half-up to 12 places", () => {
    expect(FX_CROSS_SCALE).toBe(12);
    expect(crossRate("1", "0.8672")).toBe("1.153136531365");
    expect(crossRate("162.53", "0.8672")).toBe("187.419280442804");
    expect(crossRate("1.0812", "0.8672")).toBe("1.246771217712");
    expect(crossRate("0.8672", "0.8672")).toBe("1");
    expect(crossRate("1.0000000000005", "1")).toBe("1.000000000001");
    expect(crossRate("1.00000000000049", "1")).toBe("1");
  });
  it.each([
    ["101.974", "0.8672", "117.589944649446"],
    ["102.954", "0.8672", "118.720018450185"],
  ])("is exact where the float cross is not: %s ÷ %s", (target, gbp, expected) => {
    expect(crossRate(target, gbp)).toBe(expected);
    // The float path apps/storefront/src/lib/fx/rates.ts uses for display.
    expect(String(Number((Number(target) / Number(gbp)).toFixed(12)))).not.toBe(expected);
  });
  it("feeds toGbp a cross that the run record and its CHECK accept", () => {
    const yen = crossRate("162.53", "0.8672");
    expect(yen).toMatch(/^[0-9]{1,6}([.][0-9]{1,12})?$/);
    expect(toGbp("1500", yen)).toBe("8.003446");
    expect(migration).toContain("quote->>'rate' !~ '^[0-9]{1,6}([.][0-9]{1,12})?$'");
  });
  it("refuses floats, zero, non-decimal text and crosses beyond the recorded form", () => {
    expect(() => crossRate(162.53 as unknown as string, "0.8672")).toThrow(TypeError);
    expect(() => crossRate("162.53", 0.8672 as unknown as string)).toThrow(TypeError);
    for (const [target, gbp] of [["0", "0.8672"], ["162.53", "0"], ["1e2", "0.8672"], ["162,53", "0.8672"], ["-1", "0.8672"], ["", "0.8672"]]) {
      expect(() => crossRate(target!, gbp!)).toThrow(RangeError);
    }
    expect(() => crossRate("1000000", "1")).toThrow(/at most 6 integer digits/);
    expect(crossRate("999999", "1")).toBe("999999");
    expect(() => crossRate("0.0000000000004", "1")).toThrow(/rounds to zero/);
  });
});

describe("toGbp", () => {
  it("divides by the rate per GBP and rounds half-up to 6 places", () => {
    expect(toGbp("100", "1.15")).toBe("86.956522");
    expect(toGbp("1000", "200")).toBe("5");
    expect(toGbp("1", "3")).toBe("0.333333");
    expect(toGbp("2", "3")).toBe("0.666667");
    expect(toGbp("0.0000005", "1")).toBe("0.000001");
    expect(toGbp("12.340000", "1.000000000000")).toBe("12.34");
  });
  it("refuses a zero rate, a value that rounds to zero and non-decimal input", () => {
    expect(() => toGbp("100", "0")).toThrow(RangeError);
    expect(() => toGbp("0.0000004", "1")).toThrow(/rounds to zero/);
    expect(() => toGbp("100", "1e2")).toThrow(RangeError);
    expect(() => toGbp(100 as unknown as string, "1")).toThrow(TypeError);
  });
});

describe("referenceAmount", () => {
  it("publishes the exact mean to 3 significant figures", () => {
    expect(referenceAmount(["10", "11"])).toBe("10.5");
    expect(referenceAmount(["1", "1", "2"])).toBe("1.33");
    expect(referenceAmount(["2", "2", "1"])).toBe("1.67");
    expect(referenceAmount(["12.34", "12.36"])).toBe("12.4");
    expect(referenceAmount(["0.01", "0.02", "0.02"])).toBe("0.0167");
    expect(referenceAmount(["1234.567891", "1234.567891"])).toBe("1230");
  });
  it(`needs at least ${MIN_REFERENCE_SOURCES} values`, () => {
    expect(() => referenceAmount(["12.3"])).toThrow(RangeError);
    expect(() => referenceAmount([])).toThrow(RangeError);
    expect(() => referenceAmount(["12.3", "0"])).toThrow(RangeError);
  });
});

describe("referenceSourcesAllowed", () => {
  // Release rows on 2026-10-28: Cardmarket exports raw trend; CardRush and TCGplayer are display-only.
  const exported = ["cardmarket"];
  it("needs two sources whose raw values are not exported", () => {
    expect(referenceSourcesAllowed(["cardrush", "tcgplayer"], exported)).toBe(true);
    expect(referenceSourcesAllowed(["cardmarket", "cardrush", "tcgplayer"], exported)).toBe(true);
  });
  it.each([[["cardmarket", "cardrush"]], [["cardmarket", "tcgplayer"]], [["cardrush"]], [["cardmarket"]], [[]]])(
    "refuses %j: an exported value would give the display-only one back", sources => {
      expect(referenceSourcesAllowed(sources, exported)).toBe(false);
    },
  );
  it("is why: a Cardmarket and CardRush mean recovers the CardRush value from the free Cardmarket trend", () => {
    const cardmarket = "10", cardrush = "14.6";
    const published = referenceAmount([cardmarket, cardrush]);
    expect(published).toBe("12.3");
    // 2 × 12.3 − 10 = 14.6: rounding to 3 figures does not hide it.
    expect((2 * Number(published) - Number(cardmarket)).toFixed(1)).toBe(cardrush);
  });
  it("reads exportability from the set it is given, not from a fixed list", () => {
    expect(referenceSourcesAllowed(["cardmarket", "cardrush"], [])).toBe(true);
    expect(referenceSourcesAllowed(["cardrush", "tcgplayer"], ["cardmarket", "tcgplayer"])).toBe(false);
    expect(referenceSourcesAllowed(["cardrush", "tcgplayer"], new Set(["cardmarket"]))).toBe(true);
  });
  it("counts each source once and refuses a list naming any other source", () => {
    expect(referenceSourcesAllowed(["cardrush", "cardrush"], exported)).toBe(false);
    expect(referenceSourcesAllowed(["cardrush", "tcgplayer", "scryfall"], exported)).toBe(false);
  });
  it("pins the exportable set 0141 and the schemas enforce", () => {
    expect(MIN_REFERENCE_UNEXPORTED_SOURCES).toBe(2);
    expect(EXPORTABLE_DERIVATION_SOURCES).toEqual(["cardmarket"]);
  });
});

describe("confidenceFor", () => {
  it.each([
    [["10", "12.5", "11"], "high"], [["7", "7", "7"], "high"], [["12.5", "10", "11"], "high"],
    [["10", "12.5000001", "11"], "medium"], [["10", "15", "12"], "medium"],
    [["10", "12.5"], "medium"], [["7", "7"], "medium"], [["10", "15"], "medium"],
    [["10", "15.000001"], "low"], [["10", "20", "15"], "low"], [["10", "15.000001", "12", "11"], "low"],
  ] as const)("labels %j %s (inclusive bounds, three sources for high)", (values, expected) => {
    expect(confidenceFor(values)).toBe(expected);
  });
  it("does not reorder its input", () => {
    const values = ["12.5", "10", "11"];
    confidenceFor(values);
    expect(values).toEqual(["12.5", "10", "11"]);
  });
  it("has no label for fewer than two sources or invalid values", () => {
    expect(() => confidenceFor(["10"])).toThrow(RangeError);
    expect(() => confidenceFor([])).toThrow(RangeError);
    expect(() => confidenceFor(["10", "-1"])).toThrow(RangeError);
    expect(() => confidenceFor(["10", 12 as unknown as string])).toThrow(TypeError);
  });
});

describe("index chain", () => {
  it(`starts at 100 with at least ${MIN_INDEX_CONSTITUENTS} constituents`, () => {
    expect(startIndex(Array(10).fill("1.5"))).toEqual({ ok: true, level: "100", constituents: 10 });
    expect(startIndex(Array(9).fill("1.5"))).toEqual({ ok: false, reason: "too-few-constituents", constituents: 9 });
    expect(() => startIndex([...Array(10).fill("1.5"), "0"])).toThrow(RangeError);
  });
  it("chains prev × Σcurrent ÷ Σprevious over matched pairs", () => {
    expect(chainIndex("100", pairs(10, "1", "1.1"))).toEqual({ ok: true, level: "110", constituents: 10 });
    expect(chainIndex("100", pairs(10, "2", "2"))).toEqual({ ok: true, level: "100", constituents: 10 });
    expect(chainIndex("100", [...pairs(9, "1", "1"), { previous: "1", current: "11" }])).toMatchObject({ level: "200" });
    expect(chainIndex("100", pairs(10, "0.3", "0.1"))).toMatchObject({ level: "33.333333" });
    expect(chainIndex("100", pairs(10, "0.3", "0.2"))).toMatchObject({ level: "66.666667" });
  });
  it("chains from the published rounded level, so each step is reproducible", () => {
    const down = chainIndex("100", pairs(10, "3", "1"));
    expect(down).toMatchObject({ ok: true, level: "33.333333" });
    expect(chainIndex(down.ok ? down.level : "", pairs(10, "1", "3"))).toMatchObject({ level: "99.999999" });
  });
  it("refuses fewer than 10 matched pairs without computing a level", () => {
    expect(chainIndex("100", pairs(9, "1", "2"))).toEqual({ ok: false, reason: "too-few-constituents", constituents: 9 });
    expect(chainIndex("100", [])).toEqual({ ok: false, reason: "too-few-constituents", constituents: 0 });
  });
  it("refuses invalid levels and values", () => {
    expect(() => chainIndex("0", pairs(10, "1", "1"))).toThrow(RangeError);
    expect(() => chainIndex("100", [...pairs(9, "1", "1"), { previous: "0", current: "1" }])).toThrow(RangeError);
    expect(() => chainIndex("100", [...pairs(9, "1", "1"), { previous: "1", current: "1e1" }])).toThrow(RangeError);
    expect(() => chainIndex("0.000001", pairs(10, "3", "1"))).toThrow(/rounds to zero/);
  });
  it("keeps every level in the stored text form", () => {
    let level = "100";
    for (const [previous, current] of [["3", "1"], ["7", "11"], ["13", "12.97"], ["1", "1.000001"]] as const) {
      const step = chainIndex(level, pairs(10, previous, current));
      expect(step.ok).toBe(true);
      level = step.ok ? step.level : level;
      expect(level).toMatch(indexLevel);
    }
  });
  it("names keys as the database generates them", () => {
    expect(marketIndexKey("one-piece", "op01", "cardmarket")).toBe("one-piece:op01:cardmarket");
    expect(marketIndexKey("one-piece", null, "cardrush")).toBe("one-piece:*:cardrush");
    expect(migration).toContain("GENERATED ALWAYS AS (game || ':' || COALESCE(set_code, '*') || ':' || market) STORED");
  });
});

describe("premiumQuantiles", () => {
  it("interpolates between order statistics at h = (n − 1)p", () => {
    expect(premiumQuantiles(ratios([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toEqual({ ok: true, ratioP25: "3.25", ratioMedian: "5.5", ratioP75: "7.75", skuCount: 10 });
    expect(premiumQuantiles(ratios([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))).toMatchObject({ ratioP25: "3.5", ratioMedian: "6", ratioP75: "8.5" });
  });
  it("is independent of input order and exact for non-terminating ratios", () => {
    expect(premiumQuantiles(ratios([10, 3, 7, 1, 9, 2, 8, 4, 6, 5]))).toEqual(premiumQuantiles(ratios([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])));
    const third = Array.from({ length: 10 }, () => ({ market: "1", baseMarket: "3" }));
    expect(premiumQuantiles(third)).toMatchObject({ ratioP25: "0.333", ratioMedian: "0.333", ratioP75: "0.333" });
    const mixed = [...Array.from({ length: 5 }, () => ({ market: "1", baseMarket: "3" })), ...Array.from({ length: 5 }, () => ({ market: "2", baseMarket: "3" }))];
    expect(premiumQuantiles(mixed)).toMatchObject({ ratioP25: "0.333", ratioMedian: "0.5", ratioP75: "0.667" });
  });
  it("publishes every quartile from ten identities, including where one is a single card's ratio (recorded on premiumQuantiles)", () => {
    // 13 ≡ 1 (mod 4): h = 3, 6, 9 fall on order statistics.
    expect(premiumQuantiles(ratios([13, 1, 12, 2, 11, 3, 10, 4, 9, 5, 8, 6, 7]))).toEqual({ ok: true, ratioP25: "4", ratioMedian: "7", ratioP75: "10", skuCount: 13 });
    for (let n = MIN_PREMIUM_SKUS; n < 20; n++) {
      expect(premiumQuantiles(ratios(Array.from({ length: n }, (_, i) => i + 1))), `n=${n}`).toMatchObject({ ok: true, skuCount: n });
    }
    expect(DERIVED_MARKET_CONTRACT.premium).toContain("A quartile can be exactly one card's ratio");
  });
  it(`needs at least ${MIN_PREMIUM_SKUS} SKUs and positive values`, () => {
    expect(premiumQuantiles(ratios([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toEqual({ ok: false, reason: "too-few-skus", skuCount: 9 });
    expect(() => premiumQuantiles([...ratios([1, 2, 3, 4, 5, 6, 7, 8, 9]), { market: "1", baseMarket: "0" }])).toThrow(RangeError);
  });
  it("keeps the quartiles ordered and in stored text form", () => {
    const result = premiumQuantiles(ratios([0.91, 1.07, 1.234, 1.5, 0.777, 2.2, 1.01, 1.3, 0.85, 1.19, 1.42]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const value of [result.ratioP25, result.ratioMedian, result.ratioP75]) expect(value).toMatch(threeFigures);
    expect(Number(result.ratioP25)).toBeLessThanOrEqual(Number(result.ratioMedian));
    expect(Number(result.ratioMedian)).toBeLessThanOrEqual(Number(result.ratioP75));
  });
});

describe("derived market contract", () => {
  it("states the method, guards and rights", () => {
    expect(DERIVED_MARKET_CONTRACT.version).toBe("ctcg.market-derived/v1");
    expect([MIN_REFERENCE_SOURCES, MIN_INDEX_CONSTITUENTS, MIN_PREMIUM_SKUS, REFERENCE_FRESHNESS_DAYS]).toEqual([2, 10, 10, 7]);
    expect(DERIVED_MARKET_SOURCES).toEqual(["cardmarket", "cardrush", "tcgplayer"]);
    expect(DERIVED_MARKET_CONTRACT.disclosure).toContain("No per-source value, numeric dispersion");
    expect(DERIVED_MARKET_CONTRACT.rights).toContain("not CC0");
    expect(DERIVED_MARKET_CONTRACT.rights).toContain("not licensed for AI training");
    expect(DERIVED_MARKET_CONTRACT.inputs).toContain("Scryfall is never an input");
    expect(DERIVED_MARKET_CONTRACT.inputs).toContain("at most 7 days old");
    expect(DERIVED_MARKET_CONTRACT.reference).toContain("at least 2 contributing sources whose raw values Cambridge does not export");
    expect(DERIVED_MARKET_CONTRACT.reference).toContain("2 × reference − the exported value");
    expect(DERIVED_MARKET_CONTRACT.index).toContain("at least 10 constituents");
    expect(DERIVED_MARKET_CONTRACT.index).toContain("never restarts at 100");
    // Only Cardmarket's set crosswalks are a reviewed seed; the page collectors write theirs by rule.
    expect(DERIVED_MARKET_CONTRACT.index).toContain("Cardmarket's are a reviewed seed, CardRush's and TCGplayer's are written by their collectors by rule");
    expect(DERIVED_MARKET_CONTRACT.index).not.toContain("in a reviewed set crosswalk");
    expect(DERIVED_MARKET_CONTRACT.premium).toContain("at least 10 SKUs");
    expect(DERIVED_MARKET_CONTRACT.fx).toContain("Fallback rates are never used");
    expect(DERIVED_MARKET_CONTRACT.fx).toContain("ECB publishes reference rates against the euro");
    expect(DERIVED_MARKET_CONTRACT.fx).toContain("exact decimal arithmetic");
    expect(DERIVED_MARKET_CONTRACT.fx).toContain(`half-up to ${FX_CROSS_SCALE} decimal places`);
  });
  it("is the rule migration 0141 enforces", () => {
    expect(migration).toContain(`amount::text ~ '^${THREE_FIGURES_PATTERN_BODY}$'`);
    for (const column of ["ratio_p25", "ratio_median", "ratio_p75"]) expect(migration).toContain(`${column}::text ~ '^${THREE_FIGURES_PATTERN_BODY}$'`);
    expect(migration).toContain(`level::text ~ '^${INDEX_LEVEL_PATTERN_BODY}$'`);
    expect(migration).toContain("CREATE UNIQUE INDEX market_indices_one_base ON market_indices (index_key, method_version) WHERE previous_as_of IS NULL");
    expect(migration).toContain(`CHECK (source_count >= ${MIN_REFERENCE_SOURCES})`);
    const unexported = EXPORTABLE_DERIVATION_SOURCES.reduce((list, name) => `array_remove(${list}, '${name}')`, "sources");
    expect(migration).toContain(`CHECK (cardinality(${unexported}) >= ${MIN_REFERENCE_UNEXPORTED_SOURCES})`);
    expect(migration).toContain(`CHECK (constituents >= ${MIN_INDEX_CONSTITUENTS})`);
    expect(migration).toContain(`CHECK (sku_count >= ${MIN_PREMIUM_SKUS})`);
    expect(migration).toContain(`NOT BETWEEN run_as_of - ${REFERENCE_FRESHNESS_DAYS} AND run_as_of`);
    expect(migration).toContain(`ARRAY['${DERIVED_MARKET_SOURCES.join("','")}']`);
  });
});

const derived = { runId: "1", methodVersion: "ctcg.market-derived/v1", asOf: "2026-10-28" } as const;
const reference = { ...derived, sku: "op-op01-001-en", game: "one-piece", setCode: "op01", amount: "12.3", currency: "GBP", confidence: "medium", sources: ["cardrush", "tcgplayer"], sourceCount: 2 };
const point = { ...derived, indexKey: "one-piece:op01:cardmarket", game: "one-piece", setCode: "op01", market: "cardmarket", level: "101.25", constituents: 10, previousAsOf: "2026-10-27", sources: ["cardmarket"] };
const premium = { ...derived, game: "one-piece", setCode: "op01", market: "cardrush", baseMarket: "cardmarket", ratioP25: "1.1", ratioMedian: "1.25", ratioP75: "1.4", skuCount: 10, sources: ["cardmarket", "cardrush"], marketLanguages: ["ja"], baseLanguages: ["*"] };
const run = {
  id: "1", methodVersion: "ctcg.market-derived/v1", asOf: "2026-10-28", inputBatchCeiling: "42",
  inputEvidence: { cardmarket: "cardmarket-derivation/2026-10-28.1", cardrush: "cardrush/2026-10-28.1" },
  fx: { EUR: { rate: "1.1534", source: "ecb.europa.eu", as_of: "2026-10-27" }, JPY: { rate: "196.12", source: "ecb.europa.eu", as_of: "2026-10-27" } },
  createdAt: "2026-10-28T06:00:00.000Z",
};

describe("derived market schemas", () => {
  it("accept well-formed rows", () => {
    expect(validRun(run), JSON.stringify(validRun.errors)).toBe(true);
    expect(validReference(reference), JSON.stringify(validReference.errors)).toBe(true);
    expect(validReference({ ...reference, confidence: "high", sources: [...DERIVED_MARKET_SOURCES], sourceCount: 3 })).toBe(true);
    expect(validIndex(point), JSON.stringify(validIndex.errors)).toBe(true);
    expect(validIndex({ ...point, indexKey: "one-piece:*:cardmarket", setCode: null, previousAsOf: null, level: "100" })).toBe(true);
    expect(validPremium(premium), JSON.stringify(validPremium.errors)).toBe(true);
  });
  it.each([
    { amount: "12.345" }, { amount: "12.30" }, { amount: "0" }, { amount: 12.3 }, { amount: "1000000000000" },
    { currency: "EUR" }, { sources: ["cardmarket"], sourceCount: 1 }, { sources: ["cardmarket", "cardmarket"] },
    { sources: ["cardmarket", "scryfall"] }, { sources: ["cardmarket", "cardrush"] }, { sources: ["cardmarket", "tcgplayer"] },
    { sources: ["cardrush", "cardrush"] }, { sourceCount: 3 }, { confidence: "high" }, { confidence: "certain" },
    { perSource: { cardmarket: "12.1" } }, { dispersion: "0.2" }, { methodVersion: "ctcg.market-derived/v2" },
  ])("refuse reference %j", fields => {
    expect(validReference({ ...reference, ...fields })).toBe(false);
  });
  it.each([
    { constituents: 9 }, { level: "101.2500001" }, { level: "100.0" }, { sources: ["cardrush"] },
    { indexKey: "one-piece:op01:cardrush" }, { setCode: null }, { previousAsOf: null }, { market: "scryfall" },
  ])("refuse index point %j", fields => {
    expect(validIndex({ ...point, ...fields })).toBe(false);
  });
  it.each([
    { skuCount: 9 }, { baseMarket: "cardrush" }, { ratioMedian: "1.234" }, { sources: ["cardmarket", "tcgplayer"] },
    { sources: ["cardmarket"] }, { setCode: null }, { marketLanguages: [] }, { baseLanguages: ["jpn"] }, { baseLanguages: ["en", "en"] },
    { marketLanguages: undefined }, { baseLanguages: "*" },
  ])("refuse premium %j", fields => {
    expect(validPremium({ ...premium, ...fields })).toBe(false);
  });
  it.each([
    { inputEvidence: {} }, { inputEvidence: { scryfall: "member-prices/2026-09-07.1" } },
    { fx: { EUR: { rate: "1.15", source: "fallback", as_of: "2026-10-27" } } },
    { fx: { EUR: { rate: 1.15, source: "ecb.europa.eu", as_of: "2026-10-27" } } },
    { fx: { EUR: { rate: "0", source: "ecb.europa.eu", as_of: "2026-10-27" } } },
    { fx: { GBP: { rate: "1", source: "ecb.europa.eu", as_of: "2026-10-27" } } },
  ])("refuse run %j", fields => {
    expect(validRun({ ...run, ...fields })).toBe(false);
  });
});
