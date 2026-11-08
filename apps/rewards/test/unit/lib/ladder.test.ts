import { describe, expect, it } from "vitest";
import {
  MAX_BINS,
  binOf,
  binWidthFor,
  costFor,
  countsFor,
  exampleOrder,
  fallbackStarts,
  minEarningBase,
  niceStep,
  onGrid,
  pictureBins,
  snap,
  suggestStarts,
  tierOfBin,
  validStarts,
} from "~/lib/ladder";
import { Money } from "~/lib/money";

describe("the ladder", () => {
  it("picks round bin widths", () => {
    expect([0.4, 1, 3, 7, 12, 260].map(niceStep)).toEqual([1, 1, 5, 10, 20, 500]);
    expect(binWidthFor(new Money("1840"))).toBe(20);
    expect(binWidthFor(null)).toBe(10);
  });

  it("puts each spend in its bin, the last bin holding everything above", () => {
    expect([new Money("0"), new Money("9.99"), new Money("10"), new Money("1999.99")].map((s) => binOf(s, 10))).toEqual([
      0, 0, 1, 199,
    ]);
    expect(binOf(new Money("2000"), 10)).toBe(MAX_BINS - 1);
    expect(binOf(new Money("1000000"), 10)).toBe(MAX_BINS - 1);
  });

  it("counts buyers per tier by each bin's start", () => {
    // w = 10; bins: 0-9: 5, 10-19: 2, 200-209: 3, 500-509: 1
    const buyers = Array(MAX_BINS).fill(0);
    buyers[0] = 5;
    buyers[1] = 2;
    buyers[20] = 3;
    buyers[50] = 1;
    expect(countsFor(buyers, 10, [0, 200, 500])).toEqual([7, 3, 1]);
  });

  it("works out what the tiers would have given, rounded once in the shop's currency", () => {
    const base = Array(MAX_BINS).fill("0");
    base[0] = "1000";
    base[25] = "400.50";
    expect(costFor(base, 10, [0, 200, 500], [3, 5, 8], "GBP").toFixed()).toBe("50.03"); // 30 + 20.025 → 50.03
  });

  it("rounds the total once, not each bin", () => {
    const base = Array(MAX_BINS).fill("0");
    base[0] = "0.10";
    base[1] = "0.10";
    // Each bin earns 0.005 (0.01 rounded alone, 0.02 summed); together 0.01
    expect(costFor(base, 10, [0, 200, 500], [5, 5, 5], "GBP").toFixed()).toBe("0.01");
  });

  it("falls back to 200 and 500 only near the pound", () => {
    expect(fallbackStarts("GBP")).toEqual([200, 500]);
    expect(fallbackStarts("JPY")).toBeNull();
    expect(fallbackStarts("KWD")).toBeNull();
  });

  it("suggests starts from the store only with a finished 12-month import and enough buyers", () => {
    const base = {
      p80: new Money("230"),
      p95: new Money("610"),
      spenders: 40,
      binWidth: 10,
      horizonDays: 365,
      importState: "done",
      currency: "GBP",
    };
    expect(suggestStarts(base)).toEqual({ starts: [230, 610], fromData: true });
    expect(suggestStarts({ ...base, spenders: 19 })).toEqual({ starts: [200, 500], fromData: false });
    expect(suggestStarts({ ...base, horizonDays: 60 })).toEqual({ starts: [200, 500], fromData: false });
    expect(suggestStarts({ ...base, importState: "running" })).toEqual({ starts: [200, 500], fromData: false });
    expect(suggestStarts({ ...base, currency: "JPY", importState: "failed" })).toEqual({ starts: null, fromData: false });
    expect(suggestStarts({ ...base, p80: new Money("610"), p95: new Money("610") }).starts).toEqual([610, 620]); // kept apart by one bin
  });

  it("rounds suggested starts up to the bin grid, and falls back on a short import", () => {
    const base = {
      p80: new Money("221.40"),
      p95: new Money("601"),
      spenders: 20,
      binWidth: 10,
      horizonDays: 365,
      importState: "done",
      currency: "JPY",
    };
    expect(suggestStarts(base)).toEqual({ starts: [230, 610], fromData: true });
    expect(suggestStarts({ ...base, p95: null })).toEqual({ starts: null, fromData: false });
    expect(suggestStarts({ ...base, currency: "GBP", horizonDays: 60 })).toEqual({ starts: [200, 500], fromData: false });
  });

  it("knows the smallest base that earns something", () => {
    expect(minEarningBase(3, "GBP")?.toFixed()).toBe("0.17");
    expect(minEarningBase(3, "JPY")?.toFixed()).toBe("17");
    expect(minEarningBase(5, "KWD")?.toFixed()).toBe("0.01");
    expect(minEarningBase(0, "GBP")).toBeNull();
  });

  it("reads two typed starts only when they make a ladder", () => {
    expect(validStarts("200", "500")).toEqual([200, 500]);
    expect(["", "abc", "0"].map((s) => validStarts(s, "500"))).toEqual([null, null, null]);
    expect(validStarts("500", "200")).toBeNull();
    expect(validStarts("500", "500")).toBeNull();
    expect(validStarts("200.5", "500")).toBeNull();
    expect(validStarts("200", "1234567890123")).toBeNull(); // 13 digits
    expect(validStarts(" 200 ", "123456789012")).toEqual([200, 123456789012]);
  });

  it("rounds the cost in currencies with other decimals", () => {
    const base = Array(MAX_BINS).fill("0");
    base[0] = "1015";
    expect(costFor(base, 10, [0, 200, 500], [3, 5, 8], "JPY").toFixed()).toBe("30"); // 30.45 → 30
    expect(costFor(base, 10, [0, 200, 500], [3, 5, 8], "KWD").toFixed()).toBe("30.45");
  });

  it("snaps a dragged start to the bin grid", () => {
    expect([3, 14, 15, 205].map((v) => snap(v, 10))).toEqual([10, 10, 20, 210]);
  });

  it("counts a typed start from the start of its bin, and at least one bin", () => {
    expect(onGrid(200, 10)).toBe(200); // on the grid
    expect([201, 205, 209].map((v) => onGrid(v, 10))).toEqual([200, 200, 200]); // between bins: down, not to the nearest
    expect([0, 7].map((v) => onGrid(v, 10))).toEqual([10, 10]); // bin 0 is the buyers who spent nothing
    expect(onGrid(2505, 10)).toBe(2500); // beyond the last bin: still its own bin's start, not the last bin's
  });

  it("picks a round example order, the 1, 2 or 5 step nearest the median", () => {
    const example = (median: string, currency = "GBP") => exampleOrder(new Money(median), currency)?.toFixed();
    expect(["101", "210", "45", "87.40"].map((median) => example(median))).toEqual(["100", "200", "50", "100"]);
    expect(example("4300", "JPY")).toBe("5000");
    // Halfway between two steps it rounds up: 15 between 10 and 20, 3.5 between 2 and 5
    expect(["15", "3.5", "150"].map((median) => example(median))).toEqual(["20", "5", "200"]);
    // No smaller than 1, as before
    expect(["0", "0.3", "1"].map((median) => example(median))).toEqual(["1", "1", "1"]);
    expect(exampleOrder(null, "GBP")?.toFixed()).toBe("100");
    expect(exampleOrder(null, "JPY")).toBeNull();
  });

  it("puts a bin in the tier its start falls in", () => {
    expect([0, 19, 20, 49, 50, 199].map((bin) => tierOfBin(bin, 10, [0, 200, 500]))).toEqual([0, 0, 1, 1, 2, 2]);
    // A start off the grid: the bin it falls in starts below it, so stays in the tier before
    expect([20, 21].map((bin) => tierOfBin(bin, 10, [0, 205, 500]))).toEqual([0, 1]);
  });
});

describe("the picture's bins", () => {
  const total = (bins: number[]) => bins.reduce((sum, count) => sum + count, 0);
  const grid = (filled: Record<number, number>) => Array.from({ length: MAX_BINS }, (_, bin) => filled[bin] ?? 0);

  it("leaves the bins as they are when no buyer has spent", () => {
    expect(pictureBins(grid({}))).toEqual(grid({}));
    expect(pictureBins([])).toEqual([]);
  });

  it("shows at least 20 bins", () => {
    // Every buyer in bin 0: 99% of them in 1 bin, a quarter more is 2, at least 20
    expect(pictureBins(grid({ 0: 50 }))).toEqual([50, ...Array(19).fill(0)]);
  });

  it("shows where 99% of buyers spend and a quarter more, folding the rest into its last bin", () => {
    // 990 of 1,000 buyers in bins 0-39: 99% are in the first 40 bins, so 50 are shown
    const buyers = grid({ 5: 500, 39: 490, 60: 4, 120: 3, [MAX_BINS - 1]: 3 });
    const shown = pictureBins(buyers);
    expect(shown).toHaveLength(50);
    expect(shown.slice(0, 49)).toEqual(buyers.slice(0, 49));
    // 49 through the last bin: the 10 buyers above the 99%
    expect(shown[49]).toBe(10);
    expect(total(shown)).toBe(total(buyers));
  });

  it("keeps every buyer, whatever the spread", () => {
    for (const buyers of [grid({ 0: 1 }), grid({ 3: 7, 150: 2 }), grid({ [MAX_BINS - 1]: 9 }), grid({ 10: 1, 11: 1, 12: 98 }), [4, 0, 2]]) {
      expect(total(pictureBins(buyers))).toBe(total(buyers));
    }
    // Everyone above the picture: all of it is shown
    expect(pictureBins(grid({ [MAX_BINS - 1]: 9 }))).toHaveLength(MAX_BINS);
  });

  it("leaves a picture of fewer than 20 bins as it is", () => {
    expect(pictureBins([4, 0, 2, 1])).toEqual([4, 0, 2, 1]);
  });
});
