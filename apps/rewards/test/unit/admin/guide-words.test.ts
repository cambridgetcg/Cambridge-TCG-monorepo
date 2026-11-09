import { describe, expect, it } from "vitest";
import { GUIDE, periodLabel } from "~/admin/guide-words";

/**
 * Sample arguments for each of GUIDE's functions, by its key. The house-rules
 * test calls every function with these, and fails on a function missing
 * here, so a new word that takes arguments brings its samples with it; a
 * sample whose function is gone fails it too, so the table can't drift.
 */
const SAMPLES: Record<string, unknown[]> = {
  progress: [1],
  example: ["£40.00", "£2.00"],
  tiersIntro: ["12 months"],
  importRunning: [3],
  chartLabel: ["12 months"],
  chartSummary: ["Buyers", [7, 3, 1], "£200", "£500"],
  andAbove: ["£820"],
  buyers: [1200],
  tierCount: ["Bronze", 1200],
  firstStart: ["£0.00"],
  rowName: [1],
  rowStart: [2],
  rowRate: [3],
  cost: ["£1", "12 months"],
  tryItSteps: ["£0.17"],
};

/** Every sentence a value of GUIDE can show: its strings, its lists' items, and what its functions return. */
function sentencesOf(value: unknown, key: string, missing: string[]): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => sentencesOf(item, key, missing));
  if (typeof value === "function") {
    const samples = SAMPLES[key];
    if (!samples) {
      missing.push(key);
      return [];
    }
    return sentencesOf((value as (...args: unknown[]) => unknown)(...samples), key, missing);
  }
  throw new Error(`GUIDE.${key} is neither a sentence, a list nor a function`);
}

/**
 * Every sentence the setup guide shows (RP-24): the house rules hold over all
 * of them, the period is the import's own, and the picture's spoken summary
 * counts buyers as the page does.
 */
describe("guide words", () => {
  it("keeps the house rules in every sentence", () => {
    const missing: string[] = [];
    const sentences = Object.entries(GUIDE).flatMap(([key, value]) => sentencesOf(value, key, missing));
    expect(missing).toEqual([]);
    // And no sample is left over from a function renamed or removed
    expect(Object.keys(SAMPLES).filter((key) => typeof (GUIDE as Record<string, unknown>)[key] !== "function")).toEqual([]);
    // Every function's sentences are there, not only the plain ones
    expect(sentences).toContain(GUIDE.cost("£1", "12 months"));

    for (const sentence of sentences) {
      const text = sentence.toLowerCase();
      for (const banned of ["free", "costs nothing", "no fees", "instant", "in minutes", "members", "!", "points", "loyalty program"]) {
        expect(text, sentence).not.toContain(banned);
      }
      // "Buyers", never "customer(s)", except Shopify's own field: a draft order "with yourself as the customer"
      expect(text.replaceAll("yourself as the customer", ""), sentence).not.toMatch(/\bcustomer/i);
    }
  });

  // M-8: the page links this phrase in the emails line, so it is there once
  it("names RewardsPro's Settings once in the line about buyer emails", () => {
    expect(GUIDE.emailsSettings).toBe("RewardsPro's Settings");
    expect(GUIDE.emails.split(GUIDE.emailsSettings)).toHaveLength(2);
  });

  it("says the import's own period", () => {
    expect([365, 60].map(periodLabel)).toEqual(["12 months", "60 days"]);
  });

  it("counts buyers", () => {
    expect([1, 2, 1200].map(GUIDE.buyers)).toEqual(["1 buyer", "2 buyers", "1,200 buyers"]);
  });

  it("labels each row's fields with its tier, so a screen reader tells the rows apart", () => {
    expect([1, 2, 3].map(GUIDE.rowName)).toEqual(["Tier 1 name", "Tier 2 name", "Tier 3 name"]);
    expect([2, 3].map(GUIDE.rowStart)).toEqual(["Tier 2 starts at", "Tier 3 starts at"]);
    expect([1, 2, 3].map(GUIDE.rowRate)).toEqual(["Tier 1 cashback", "Tier 2 cashback", "Tier 3 cashback"]);
    expect(GUIDE.firstStart("£0.00")).toBe("Starts at £0.00");
    expect(GUIDE.wholeAmounts).toBe("Whole amounts only.");
  });

  it("counts a tier's buyers under its name", () => {
    expect(GUIDE.tierCount("Bronze", 1)).toBe("Bronze: 1 buyer");
    expect(GUIDE.tierCount("Gold Club", 1200)).toBe("Gold Club: 1,200 buyers");
  });

  it("labels the picture's last bar, which holds every spend above its start", () => {
    expect(GUIDE.andAbove("£820")).toBe("£820 and above");
  });

  it("says which figures a start above the picture leaves low: that tier's count, not every count", () => {
    expect(GUIDE.beyondPicture).toBe("This start is above the highest spend the picture shows, so that tier's count and the estimate may be low.");
  });

  it("sums up the picture for a screen reader", () => {
    expect(GUIDE.chartSummary("Buyers by what they spent over the last 12 months", [7, 3, 1], "£200", "£500")).toBe(
      "Buyers by what they spent over the last 12 months: 7 buyers below £200, 3 buyers from £200, 1 buyer from £500",
    );
  });
});
