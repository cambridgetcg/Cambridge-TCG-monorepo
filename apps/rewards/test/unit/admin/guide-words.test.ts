import { describe, expect, it } from "vitest";
import { GUIDE, periodLabel } from "~/admin/guide-words";

/**
 * Every sentence the setup guide shows (RP-24): the house rules hold over all
 * of them, the period is the import's own, and the picture's spoken summary
 * counts buyers as the page does.
 */
describe("guide words", () => {
  it("keeps the house rules", () => {
    const all = [
      JSON.stringify(GUIDE),
      GUIDE.beyondPicture,
      GUIDE.progress(1),
      GUIDE.example("£40.00", "£2.00"),
      GUIDE.tiersIntro("12 months"),
      GUIDE.importRunning(3),
      GUIDE.chartLabel("12 months"),
      GUIDE.chartSummary("Buyers", [7, 3, 1], "£200", "£500"),
      GUIDE.cost("£1", "12 months"),
      GUIDE.tryItSteps("£0.17").join(" "),
    ].join(" ");
    for (const banned of ["free", "costs nothing", "no fees", "instant", "in minutes", "members", "customers", "!", "points", "loyalty program"]) {
      expect(all.toLowerCase()).not.toContain(banned);
    }
  });

  it("says the import's own period", () => {
    expect([365, 60].map(periodLabel)).toEqual(["12 months", "60 days"]);
  });

  it("counts buyers", () => {
    expect([1, 2, 1200].map(GUIDE.buyers)).toEqual(["1 buyer", "2 buyers", "1,200 buyers"]);
  });

  it("sums up the picture for a screen reader", () => {
    expect(GUIDE.chartSummary("Buyers by what they spent over the last 12 months", [7, 3, 1], "£200", "£500")).toBe(
      "Buyers by what they spent over the last 12 months: 7 buyers below £200, 3 buyers from £200, 1 buyer from £500",
    );
  });
});
