import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

// The refusal reads only its arguments; nothing reaches a database
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewardspro" }));

import { manualCashbackRefusal } from "~/services/cashback-ledger.server";

const paidOrder = {
  cashbackProcessed: false,
  cashbackEligible: true,
  financialStatus: "PAID" as const,
  totalPrice: new Prisma.Decimal(100),
  totalRefunded: new Prisma.Decimal(0),
};

const entry = (metadata: Prisma.JsonValue, amount = 5) => ({ amount: new Prisma.Decimal(amount), metadata });

describe("manualCashbackRefusal (what the Orders page may issue by hand)", () => {
  it("allows only a PENDING entry with cashback left", () => {
    expect(manualCashbackRefusal(paidOrder, entry({ syncStatus: "PENDING" }))).toBeNull();
    expect(manualCashbackRefusal(paidOrder, entry({ syncStatus: "PENDING" }, 0))).toBe("No cashback is left to issue for this order");
  });

  it("refuses an order with no cashback entry, whatever its cashbackAmount", () => {
    expect(manualCashbackRefusal(paidOrder, null)).toBe(
      "No cashback was recorded for this order when it was paid, so there is none to issue",
    );
  });

  it("refuses a historical record from the order sync", () => {
    expect(manualCashbackRefusal(paidOrder, entry({ orderName: "#1001", historical: true }))).toBe(
      "This order's cashback is a record imported with the order history, not cashback waiting to be issued",
    );
    expect(manualCashbackRefusal(paidOrder, entry(null))).not.toBeNull();
  });

  it("refuses cashback being issued, issued or reversed before issue", () => {
    for (const syncStatus of ["SYNCING", "SYNCED"]) {
      expect(manualCashbackRefusal(paidOrder, entry({ syncStatus }))).toBe("Cashback for this order is already being issued or was issued");
    }
    expect(manualCashbackRefusal(paidOrder, entry({ syncStatus: "NOT_APPLICABLE" }, 0))).toBe("No cashback is left to issue for this order");
  });

  it("refuses processed, fully refunded and excluded orders before looking at the entry", () => {
    const pending = entry({ syncStatus: "PENDING" });
    expect(manualCashbackRefusal({ ...paidOrder, cashbackProcessed: true }, pending)).toBe("Cashback already processed");
    expect(manualCashbackRefusal({ ...paidOrder, totalRefunded: new Prisma.Decimal(100) }, pending)).toBe(
      "This order was refunded or is excluded from cashback",
    );
    expect(manualCashbackRefusal({ ...paidOrder, cashbackEligible: false }, pending)).toBe(
      "This order was refunded or is excluded from cashback",
    );
  });
});
