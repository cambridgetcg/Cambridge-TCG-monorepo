/**
 * Pure timeline-merge contract.
 *
 * Tests the synthesis logic directly with hand-crafted source rows —
 * no database needed. The Prisma I/O in `journey.ts` is integration-
 * tested separately.
 */
import { describe, it, expect } from "vitest";
import { mergeTimeline } from "../../../app/services/customer-operations/merge";
import type { TimelineSources } from "../../../app/services/customer-operations";

const empty: TimelineSources = {
  pointsLedger: [],
  storeCreditLedger: [],
  tierChanges: [],
  raffleEntries: [],
  raffleWins: [],
  mysteryBoxOpens: [],
  mysteryBoxWins: [],
  challenges: [],
  giftCardsIssued: [],
};

const date = (s: string) => new Date(s);

describe("mergeTimeline — empty input", () => {
  it("returns []", () => {
    expect(mergeTimeline(empty)).toEqual([]);
  });
});

describe("mergeTimeline — type discrimination", () => {
  it("classifies positive PointsLedger as `points-earned`", () => {
    const t = mergeTimeline({
      ...empty,
      pointsLedger: [
        {
          id: "p1",
          amount: 250,
          balance: 1000,
          type: "ORDER_PAID",
          description: "Earned for order",
          orderId: "o1",
          createdAt: date("2026-04-01T00:00:00Z"),
        },
      ],
    });
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("points-earned");
    expect(t[0].amount).toBe(250);
    expect(t[0].balanceAfter).toBe(1000);
    expect(t[0].context).toMatchObject({ orderId: "o1" });
  });

  it("classifies negative PointsLedger as `points-spent`", () => {
    const t = mergeTimeline({
      ...empty,
      pointsLedger: [
        {
          id: "p2",
          amount: -100,
          balance: 900,
          type: "RAFFLE_ENTRY",
          description: null,
          orderId: null,
          createdAt: date("2026-04-02"),
        },
      ],
    });
    expect(t[0].type).toBe("points-spent");
    expect(t[0].amount).toBe(-100);
  });

  it("classifies MANUAL_CREDIT / MANUAL_DEBIT as `points-adjusted` regardless of sign", () => {
    const t = mergeTimeline({
      ...empty,
      pointsLedger: [
        {
          id: "p3",
          amount: 50,
          balance: 950,
          type: "MANUAL_CREDIT",
          description: "merchant added",
          orderId: null,
          createdAt: date("2026-04-03"),
        },
        {
          id: "p4",
          amount: -25,
          balance: 925,
          type: "MANUAL_DEBIT",
          description: "merchant clawed back",
          orderId: null,
          createdAt: date("2026-04-04"),
        },
      ],
    });
    expect(t.map((e) => e.type)).toEqual(["points-adjusted", "points-adjusted"]);
  });

  it("classifies StoreCreditLedger by sign", () => {
    const t = mergeTimeline({
      ...empty,
      storeCreditLedger: [
        {
          id: "s1",
          amount: 5.0,
          balance: 5.0,
          type: "ADJUSTMENT",
          description: "raffle prize",
          metadata: null,
          createdAt: date("2026-04-05"),
        },
        {
          id: "s2",
          amount: -3.0,
          balance: 2.0,
          type: "CONVERTED_TO_GIFT_CARD",
          description: "purchased gift card",
          metadata: null,
          createdAt: date("2026-04-06"),
        },
      ],
    });
    expect(t.map((e) => e.type)).toEqual([
      "store-credit-credited",
      "store-credit-debited",
    ]);
  });
});

describe("mergeTimeline — ordering and merging", () => {
  it("interleaves events from different sources chronologically", () => {
    const t = mergeTimeline({
      ...empty,
      pointsLedger: [
        {
          id: "p",
          amount: 100,
          balance: 100,
          type: "ORDER_PAID",
          description: null,
          orderId: null,
          createdAt: date("2026-04-01"),
        },
      ],
      tierChanges: [
        {
          id: "t",
          fromTierId: null,
          toTierId: "gold",
          fromTierName: null,
          toTierName: "Gold",
          source: "SPEND",
          createdAt: date("2026-04-03"),
        },
      ],
      raffleEntries: [
        {
          id: "r",
          raffleId: "raffle1",
          raffleName: "April raffle",
          entriesCount: 1,
          pointsSpent: 50,
          isWinner: false,
          createdAt: date("2026-04-02"),
        },
      ],
    });
    expect(t.map((e) => e.type)).toEqual([
      "points-earned",
      "raffle-entered",
      "tier-changed",
    ]);
  });

  it("sorts `oldest first`", () => {
    const t = mergeTimeline({
      ...empty,
      pointsLedger: [
        {
          id: "newer",
          amount: 1,
          balance: 2,
          type: "ORDER_PAID",
          description: null,
          orderId: null,
          createdAt: date("2026-04-10"),
        },
        {
          id: "older",
          amount: 1,
          balance: 1,
          type: "ORDER_PAID",
          description: null,
          orderId: null,
          createdAt: date("2026-04-01"),
        },
      ],
    });
    expect(t.map((e) => e.id)).toEqual(["older", "newer"]);
  });
});

describe("mergeTimeline — filtering", () => {
  const wide: TimelineSources = {
    ...empty,
    pointsLedger: [
      {
        id: "old",
        amount: 1,
        balance: 1,
        type: "ORDER_PAID",
        description: null,
        orderId: null,
        createdAt: date("2026-01-01"),
      },
      {
        id: "mid",
        amount: 1,
        balance: 2,
        type: "ORDER_PAID",
        description: null,
        orderId: null,
        createdAt: date("2026-04-15"),
      },
      {
        id: "new",
        amount: 1,
        balance: 3,
        type: "ORDER_PAID",
        description: null,
        orderId: null,
        createdAt: date("2026-12-01"),
      },
    ],
  };

  it("respects `since`", () => {
    const t = mergeTimeline(wide, { since: date("2026-04-01") });
    expect(t.map((e) => e.id)).toEqual(["mid", "new"]);
  });

  it("respects `until`", () => {
    const t = mergeTimeline(wide, { until: date("2026-04-30") });
    expect(t.map((e) => e.id)).toEqual(["old", "mid"]);
  });

  it("respects `since` + `until` together", () => {
    const t = mergeTimeline(wide, {
      since: date("2026-04-01"),
      until: date("2026-04-30"),
    });
    expect(t.map((e) => e.id)).toEqual(["mid"]);
  });

  it("respects `types` allowlist", () => {
    const sources: TimelineSources = {
      ...wide,
      tierChanges: [
        {
          id: "tc",
          fromTierId: null,
          toTierId: "gold",
          fromTierName: null,
          toTierName: "Gold",
          source: "MANUAL",
          createdAt: date("2026-04-15"),
        },
      ],
    };
    const t = mergeTimeline(sources, { types: ["tier-changed"] });
    expect(t.map((e) => e.type)).toEqual(["tier-changed"]);
  });

  it("applies `limit` keeping the most-recent N", () => {
    const t = mergeTimeline(wide, { limit: 2 });
    // Returns most-recent 2, still in chronological order.
    expect(t.map((e) => e.id)).toEqual(["mid", "new"]);
  });
});

describe("mergeTimeline — Decimal-shaped numeric inputs", () => {
  it("calls `.toNumber()` on Prisma Decimal values", () => {
    const decimalLike = { toNumber: () => 42 };
    const t = mergeTimeline({
      ...empty,
      pointsLedger: [
        {
          id: "p",
          amount: decimalLike as any,
          balance: decimalLike as any,
          type: "ORDER_PAID",
          description: null,
          orderId: null,
          createdAt: date("2026-04-01"),
        },
      ],
    });
    expect(t[0].amount).toBe(42);
    expect(t[0].balanceAfter).toBe(42);
  });
});

describe("mergeTimeline — gift cards", () => {
  it("renders an issued gift card as a debit-shaped event", () => {
    const t = mergeTimeline({
      ...empty,
      giftCardsIssued: [
        {
          id: "g1",
          totalValue: 25.0,
          status: "ACTIVE",
          recipientEmail: "friend@example.com",
          createdAt: date("2026-04-15"),
        },
      ],
    });
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("gift-card-issued");
    expect(t[0].amount).toBe(-25); // outbound from purchaser's perspective
    expect(t[0].description).toContain("friend@example.com");
  });
});

describe("mergeTimeline — challenges", () => {
  it("includes only claimed challenges", () => {
    const t = mergeTimeline({
      ...empty,
      challenges: [
        {
          id: "c1",
          challengeId: "ch1",
          challengeName: "Spring sale",
          status: "CLAIMED",
          claimedAt: date("2026-04-15"),
        },
        {
          id: "c2",
          challengeId: "ch2",
          challengeName: "Summer sale",
          status: "IN_PROGRESS",
          claimedAt: null,
        },
      ],
    });
    expect(t).toHaveLength(1);
    expect(t[0].id).toBe("c1");
    expect(t[0].type).toBe("challenge-claimed");
  });
});
