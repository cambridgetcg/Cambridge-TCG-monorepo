/**
 * Pure compute contract for loyalty impact.
 *
 * Tests cohort math, cost aggregation, and confidence-band logic
 * with hand-crafted inputs. No database needed. The Prisma I/O in
 * `report.ts` is integration-tested separately.
 */
import { describe, it, expect } from "vitest";
import { compute } from "../../../app/services/loyalty-impact/compute";
import type { ComputeInputs } from "../../../app/services/loyalty-impact";

const baseInputs = (): ComputeInputs => ({
  allCustomerIds: [],
  memberCustomerIds: new Set(),
  ordersInWindow: [],
  pointsLedger: [],
  storeCreditLedger: [],
  giftCardsIssued: [],
  raffleWinnersDelivered: { count: 0 },
  mysteryBoxWinnersDelivered: { count: 0 },
  options: { pointsRate: 0.01 },
});

describe("compute — cohort sizing", () => {
  it("returns zeros for an empty shop", () => {
    const r = compute(baseInputs());
    expect(r.cohorts).toEqual({ members: 0, nonMembers: 0, totalCustomers: 0 });
    expect(r.revenue.members.aov).toBe(0);
    expect(r.revenue.nonMembers.aov).toBe(0);
  });

  it("splits customers into member / non-member buckets correctly", () => {
    const inputs = baseInputs();
    inputs.allCustomerIds = ["a", "b", "c", "d"];
    inputs.memberCustomerIds = new Set(["a", "b"]);
    const r = compute(inputs);
    expect(r.cohorts).toEqual({ members: 2, nonMembers: 2, totalCustomers: 4 });
  });
});

describe("compute — revenue cohorts", () => {
  it("aggregates orders by member status", () => {
    const inputs = baseInputs();
    inputs.allCustomerIds = ["a", "b", "c"];
    inputs.memberCustomerIds = new Set(["a"]);
    inputs.ordersInWindow = [
      { customerId: "a", netAmount: 100 },
      { customerId: "a", netAmount: 50 },
      { customerId: "b", netAmount: 30 },
      { customerId: "c", netAmount: 20 },
    ];
    const r = compute(inputs);
    expect(r.revenue.members).toMatchObject({
      customerCount: 1,
      totalRevenue: 150,
      orderCount: 2,
      aov: 75,
      arpu: 150,
    });
    expect(r.revenue.nonMembers).toMatchObject({
      customerCount: 2,
      totalRevenue: 50,
      orderCount: 2,
      aov: 25,
      arpu: 25,
    });
  });

  it("computes aovDelta and aovLiftPercent", () => {
    const inputs = baseInputs();
    inputs.allCustomerIds = ["a", "b"];
    inputs.memberCustomerIds = new Set(["a"]);
    inputs.ordersInWindow = [
      { customerId: "a", netAmount: 100 }, // member aov = 100
      { customerId: "b", netAmount: 50 }, // non-member aov = 50
    ];
    const r = compute(inputs);
    expect(r.revenue.aovDelta).toBe(50);
    expect(r.revenue.aovLiftPercent).toBe(100); // 50 / 50 * 100
  });

  it("aovLiftPercent is NaN when nonMembers.aov is 0", () => {
    const inputs = baseInputs();
    inputs.allCustomerIds = ["a", "b"];
    inputs.memberCustomerIds = new Set(["a"]);
    inputs.ordersInWindow = [{ customerId: "a", netAmount: 100 }];
    const r = compute(inputs);
    expect(r.revenue.nonMembers.aov).toBe(0);
    expect(Number.isNaN(r.revenue.aovLiftPercent)).toBe(true);
  });

  it("handles Decimal-shaped order amounts", () => {
    const inputs = baseInputs();
    inputs.allCustomerIds = ["a"];
    inputs.memberCustomerIds = new Set(["a"]);
    inputs.ordersInWindow = [
      { customerId: "a", netAmount: { toNumber: () => 100.5 } as any },
    ];
    const r = compute(inputs);
    expect(r.revenue.members.totalRevenue).toBe(100.5);
  });
});

describe("compute — program cost aggregation", () => {
  it("values redeemed points at the configured rate", () => {
    const inputs = baseInputs();
    inputs.options.pointsRate = 0.02;
    inputs.pointsLedger = [
      { amount: 500 }, // earned, ignored
      { amount: -250 }, // redeemed → 250 × 0.02 = 5
      { amount: -100 }, // redeemed → 100 × 0.02 = 2
    ];
    const r = compute(inputs);
    expect(r.programCost.pointsRedeemedValue).toBe(7);
  });

  it("separates store-credit issued from redeemed", () => {
    const inputs = baseInputs();
    inputs.storeCreditLedger = [
      { amount: 50 }, // issued
      { amount: 30 }, // issued
      { amount: -25 }, // redeemed (real cost)
    ];
    const r = compute(inputs);
    expect(r.programCost.storeCreditIssued).toBe(80);
    expect(r.programCost.storeCreditRedeemed).toBe(25);
  });

  it("sums gift card face values", () => {
    const inputs = baseInputs();
    inputs.giftCardsIssued = [
      { totalValue: 25 },
      { totalValue: 50 },
      { totalValue: { toNumber: () => 100 } as any },
    ];
    const r = compute(inputs);
    expect(r.programCost.giftCardsIssued).toBe(175);
  });

  it("totalDirectCost = pointsRedeemedValue + storeCreditRedeemed + giftCardsIssued", () => {
    const inputs = baseInputs();
    inputs.pointsLedger = [{ amount: -1000 }]; // 1000 × 0.01 = 10
    inputs.storeCreditLedger = [{ amount: -25 }];
    inputs.giftCardsIssued = [{ totalValue: 50 }];
    const r = compute(inputs);
    expect(r.programCost.totalDirectCost).toBe(85);
  });

  it("counts raffle / mystery-box prizes without summing their value", () => {
    const inputs = baseInputs();
    inputs.raffleWinnersDelivered = { count: 7 };
    inputs.mysteryBoxWinnersDelivered = { count: 23 };
    const r = compute(inputs);
    expect(r.programCost.rafflePrizesAwarded).toBe(7);
    expect(r.programCost.mysteryBoxRewardsAwarded).toBe(23);
    // Not added to totalDirectCost — heterogeneous prizes.
    expect(r.programCost.totalDirectCost).toBe(0);
  });
});

describe("compute — estimated impact", () => {
  it("aovLiftRevenue = max(0, aovDelta) × member order count", () => {
    const inputs = baseInputs();
    inputs.allCustomerIds = ["a", "b"];
    inputs.memberCustomerIds = new Set(["a"]);
    inputs.ordersInWindow = [
      { customerId: "a", netAmount: 100 },
      { customerId: "a", netAmount: 100 },
      { customerId: "b", netAmount: 50 },
    ];
    // members.aov = 100, nonMembers.aov = 50, delta = 50, member orders = 2
    // → aovLiftRevenue = 50 × 2 = 100
    const r = compute(inputs);
    expect(r.estimatedImpact.aovLiftRevenue).toBe(100);
  });

  it("clamps aovLiftRevenue at 0 when members spend less per order", () => {
    const inputs = baseInputs();
    inputs.allCustomerIds = ["a", "b"];
    inputs.memberCustomerIds = new Set(["a"]);
    inputs.ordersInWindow = [
      { customerId: "a", netAmount: 30 },
      { customerId: "b", netAmount: 100 },
    ];
    const r = compute(inputs);
    expect(r.revenue.aovDelta).toBeLessThan(0);
    expect(r.estimatedImpact.aovLiftRevenue).toBe(0);
  });

  it("netImpact = aovLiftRevenue − totalDirectCost", () => {
    const inputs = baseInputs();
    inputs.allCustomerIds = ["a", "b"];
    inputs.memberCustomerIds = new Set(["a"]);
    inputs.ordersInWindow = [
      { customerId: "a", netAmount: 100 },
      { customerId: "b", netAmount: 50 },
    ];
    inputs.storeCreditLedger = [{ amount: -20 }]; // realized cost = 20
    const r = compute(inputs);
    // aovLiftRevenue = 50 × 1 = 50; netImpact = 50 - 20 = 30
    expect(r.estimatedImpact.netImpact).toBe(30);
  });

  it("confidence is `low` when sample sizes are small (under 50 in either cohort)", () => {
    const inputs = baseInputs();
    inputs.allCustomerIds = Array.from({ length: 60 }, (_, i) => `c${i}`);
    inputs.memberCustomerIds = new Set(inputs.allCustomerIds.slice(0, 5)); // 5 members, 55 non-members
    const r = compute(inputs);
    expect(r.estimatedImpact.confidence).toBe("low");
  });

  it("confidence is `medium` only when both cohorts ≥ 50 AND |netImpact| > totalDirectCost", () => {
    const inputs = baseInputs();
    inputs.allCustomerIds = Array.from({ length: 200 }, (_, i) => `c${i}`);
    inputs.memberCustomerIds = new Set(inputs.allCustomerIds.slice(0, 100));
    // Member orders show clear lift: 100 members @ $100 each, 100 non @ $50 each
    inputs.ordersInWindow = [
      ...inputs.allCustomerIds.slice(0, 100).map((id) => ({ customerId: id, netAmount: 100 })),
      ...inputs.allCustomerIds.slice(100).map((id) => ({ customerId: id, netAmount: 50 })),
    ];
    inputs.storeCreditLedger = [{ amount: -100 }]; // tiny cost vs $5000 lift
    const r = compute(inputs);
    expect(r.estimatedImpact.confidence).toBe("medium");
  });

  it("includes a non-empty caveat string", () => {
    const r = compute(baseInputs());
    expect(r.estimatedImpact.caveat.length).toBeGreaterThan(50);
    expect(r.estimatedImpact.caveat).toMatch(/selection bias/i);
    expect(r.estimatedImpact.caveat).toMatch(/experiment/i);
  });
});
