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
  snap,
  suggestStarts,
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

  it("picks a round example order", () => {
    expect(exampleOrder(new Money("87.40"), "GBP")?.toFixed()).toBe("100");
    expect(exampleOrder(null, "GBP")?.toFixed()).toBe("100");
    expect(exampleOrder(new Money("4300"), "JPY")?.toFixed()).toBe("5000");
    expect(exampleOrder(null, "JPY")).toBeNull();
  });
});
