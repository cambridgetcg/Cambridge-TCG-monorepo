import { describe, expect, it } from "vitest";
import { autoCashbackBacklogText } from "~/components/AutoCashbackConfirmModal";

describe("autoCashbackBacklogText (what turning automatic cashback on pays)", () => {
  it("names the orders and the amount, and how waiting cashback is sent", () => {
    expect(autoCashbackBacklogText({ count: 3, total: 7.5 }, "GBP")).toBe(
      "3 paid orders from the last 7 days are waiting for cashback (£7.50 in all). Turning automatic cashback on pays them as store credit, less any refunds, along with cashback on new paid orders. Waiting cashback is sent once an hour, oldest first.",
    );
  });

  it("speaks of one order as one", () => {
    expect(autoCashbackBacklogText({ count: 1, total: 2.5 }, "GBP")).toBe(
      "1 paid order from the last 7 days is waiting for cashback (£2.50). Turning automatic cashback on pays it as store credit, less any refunds, along with cashback on new paid orders. Waiting cashback is sent once an hour, oldest first.",
    );
  });

  it("promises no time it cannot keep: other shops' cashback is sent in the same hourly runs", () => {
    const text = autoCashbackBacklogText({ count: 120, total: 300 }, "USD");
    expect(text).not.toMatch(/within the hour|next \d+ hours/);
  });

  it("speaks in general terms when the waiting cashback is not known", () => {
    expect(autoCashbackBacklogText(null, "GBP")).toBe(
      "Turning automatic cashback on also pays any cashback still waiting from paid orders of the last 7 days as store credit, less any refunds, along with cashback on new paid orders. Waiting cashback is sent once an hour, oldest first.",
    );
  });
});
