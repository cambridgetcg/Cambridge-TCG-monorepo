import { describe, expect, it } from "vitest";
import { autoCashbackBacklogText } from "~/components/AutoCashbackConfirmModal";

describe("autoCashbackBacklogText (what turning automatic cashback on pays)", () => {
  it("names the orders, the amount and when they are paid", () => {
    expect(autoCashbackBacklogText({ count: 3, total: 7.5, currency: "GBP" })).toBe(
      "3 paid orders from the last 7 days are waiting for cashback (£7.50 in all). Turning automatic cashback on pays them as store credit within the hour, less any refunds, along with cashback on new paid orders.",
    );
  });

  it("speaks of one order as one", () => {
    expect(autoCashbackBacklogText({ count: 1, total: 2.5, currency: "GBP" })).toBe(
      "1 paid order from the last 7 days is waiting for cashback (£2.50). Turning automatic cashback on pays it as store credit within the hour, less any refunds, along with cashback on new paid orders.",
    );
  });

  it("says it takes hours when more are waiting than one run sends", () => {
    expect(autoCashbackBacklogText({ count: 120, total: 300, currency: "USD" })).toContain("pays them as store credit over the next 3 hours");
  });
});
