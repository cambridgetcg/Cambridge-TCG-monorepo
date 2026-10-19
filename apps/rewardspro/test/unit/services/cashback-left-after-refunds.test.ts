import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

// The computation reads only its arguments; nothing reaches a database
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewardspro" }));

import { cashbackLeftAfterRefunds, cashbackTakenBefore, type OrderRefunds } from "~/services/refund-handler.server";

const d = (value: number | string) => new Prisma.Decimal(value);
const order = (overrides: Partial<OrderRefunds> = {}): OrderRefunds => ({
  totalPrice: d(100),
  totalRefunded: d(0),
  financialStatus: "PAID",
  cashbackEligible: true,
  refunds: [],
  ...overrides,
});
const left = (o: OrderRefunds, original = 5) => {
  const { remaining, unrecorded } = cashbackLeftAfterRefunds(d(original), o);
  return { remaining: remaining.toFixed(2), unrecorded: unrecorded.toFixed(2) };
};

describe("cashbackLeftAfterRefunds (what orders/paid and the cron may still issue)", () => {
  it("leaves all of it on an order nothing refunded", () => {
    expect(left(order())).toEqual({ remaining: "5.00", unrecorded: "0.00" });
  });

  it("leaves none on an order refunded in full or excluded, as the Orders page refuses it", () => {
    expect(left(order({ financialStatus: "REFUNDED" })).remaining).toBe("0.00");
    expect(left(order({ totalRefunded: d(100), financialStatus: "PARTIALLY_REFUNDED" })).remaining).toBe("0.00");
    expect(left(order({ cashbackEligible: false })).remaining).toBe("0.00");
  });

  it("takes each recorded refund's share, then the share of a refunded total no refund accounts for", () => {
    const refunds = [{ id: "r1", shopifyRefundId: "1", amount: d(20) }];
    // Recorded only: 20% of 5.00
    expect(left(order({ totalRefunded: d(20), financialStatus: "PARTIALLY_REFUNDED", refunds }))).toEqual({ remaining: "4.00", unrecorded: "0.00" });
    // "Sync Orders" copied a 60.00 total: the 40.00 no refund records takes 2.00 more
    expect(left(order({ totalRefunded: d(60), financialStatus: "PARTIALLY_REFUNDED", refunds }))).toEqual({ remaining: "2.00", unrecorded: "2.00" });
    // A total below what the refunds record changes nothing
    expect(left(order({ totalRefunded: d(10), financialStatus: "PARTIALLY_REFUNDED", refunds }))).toEqual({ remaining: "4.00", unrecorded: "0.00" });
  });
});

describe("cashbackTakenBefore (what recordRefund does not take again)", () => {
  const taken = (matchedShare: number, own: number, unclaimed: number) =>
    cashbackTakenBefore({ matchedShare: d(matchedShare), own: d(own), unclaimed: d(unclaimed) }).toFixed(2);

  it("is nothing for a refund nothing counted before it arrived", () => {
    expect(taken(0, 0, 1.5)).toBe("0.00");
  });

  it("is what the refund's own row says orders/paid or the cron took", () => {
    expect(taken(1.5, 1.5, 0)).toBe("1.50");
  });

  it("takes from reversals no row claims, at most the share of what the order counted", () => {
    // The cron took 1.50 for a refunded total of 30.00 the sync copied; this refund is those 30.00
    expect(taken(1.5, 0, 1.5)).toBe("1.50");
    // Only 20.00 of a 30.00 refund was counted: 1.00 of the 1.50 share was taken
    expect(taken(1, 0, 1.5)).toBe("1.00");
    // Less was taken than the share (a smaller hand issue scaled it): only that
    expect(taken(1.5, 0, 0.5)).toBe("0.50");
    // Its row noted part of it already
    expect(taken(1.5, 1, 1.5)).toBe("1.50");
    // A negative balance (nothing unclaimed) takes nothing
    expect(taken(1.5, 0, -0.5)).toBe("0.00");
  });
});
