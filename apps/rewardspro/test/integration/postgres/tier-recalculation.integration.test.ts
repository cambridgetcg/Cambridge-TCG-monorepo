import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { loader as tierRecalculation } from "~/routes/api.cron.tier-recalculation";
import { resolveEffectiveTier } from "~/services/tier-resolution.server";
import { failNextCall, hasTestDatabase, resetDatabase, restoreFailedCalls } from "./database";

// The tier-recalculation cron against Postgres. It must put every shopper in
// the tier that the resolver orders use would give them, because the next
// order pays cashback at the stored tier's rate before that order's own tier
// step runs.

const SHOP = "tier-rules.myshopify.com";
const CRON_SECRET = "tier-recalculation-cron";
const DAY = 24 * 60 * 60 * 1000;

async function runTierRecalculation() {
  const response = await tierRecalculation({
    request: new Request("https://test.example.com/api/cron/tier-recalculation", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    }),
    params: {},
    context: {},
  });
  expect(response.status).toBe(200);
  return response.json();
}

let orderNumber = 0;
async function seedOrder(customerId: string, amount: number, placedAt: Date, cashbackEligible = true) {
  orderNumber++;
  await prisma.order.create({
    data: {
      shop: SHOP,
      shopifyOrderId: `${9000 + orderNumber}`,
      shopifyOrderNumber: `#${9000 + orderNumber}`,
      shopifyOrderName: `#${9000 + orderNumber}`,
      customerId,
      email: "",
      currency: "GBP",
      subtotalPrice: amount,
      totalDiscounts: 0,
      totalShipping: 0,
      totalTax: 0,
      totalPrice: amount,
      netAmount: amount,
      financialStatus: "PAID",
      cashbackEligible,
      shopifyCreatedAt: placedAt,
      shopifyUpdatedAt: placedAt,
    },
  });
}

/** A customer whose lifetime spending (Customer.netSpent) is `netSpent`. */
const seedCustomer = (n: number, netSpent: number, currentTierId: string | null) =>
  prisma.customer.create({
    data: {
      shop: SHOP,
      shopifyCustomerId: `${n}00`,
      email: `customer-${n}@example.test`,
      totalSpent: netSpent,
      netSpent,
      currentTierId,
    },
  });

async function tierOf(customerId: string) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  return customer.currentTierId;
}

describe.skipIf(!hasTestDatabase)("tier-recalculation cron on Postgres", () => {
  const env = { ...process.env };

  beforeEach(async () => {
    await resetDatabase();
    process.env.CRON_SECRET = CRON_SECRET;
    for (const method of ["log", "info", "warn", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation(() => {});
    }
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
    restoreFailedCalls();
  });

  it("gives shoppers the tier orders give them: annual tiers count the last 12 months, and membership orders don't count", async () => {
    await prisma.shopSettings.create({ data: { shop: SHOP, storeName: "Card Shop", storeUrl: `https://${SHOP}` } });
    // Both tiers judge the last 12 months (the default)
    await prisma.tier.create({ data: { id: "tier-bronze", shop: SHOP, name: "Bronze", minSpend: 0, cashbackPercent: 5 } });
    await prisma.tier.create({ data: { id: "tier-gold", shop: SHOP, name: "Gold", minSpend: 500, cashbackPercent: 10 } });

    // Spent £600 eighteen months ago and nothing since: Gold until now
    const lapsed = await seedCustomer(1, 600, "tier-gold");
    await seedOrder(lapsed.id, 600, new Date(Date.now() - 548 * DAY));

    // Paid £600 for a Gold membership this month, which has already ended
    const member = await seedCustomer(2, 600, "tier-bronze");
    await seedOrder(member.id, 600, new Date(Date.now() - 20 * DAY), false);

    // Spent £700 this year: really Gold. Resolved before, as Bronze.
    const regular = await seedCustomer(3, 700, "tier-bronze");
    await seedOrder(regular.id, 700, new Date(Date.now() - 60 * DAY));
    await prisma.customerTierState.create({
      data: {
        shop: SHOP,
        customerId: regular.id,
        effectiveTierId: "tier-bronze",
        tierSource: "SPENDING_BASED",
        lastResolvedAt: new Date(Date.now() - 90 * DAY),
      },
    });

    await runTierRecalculation();

    for (const customer of [lapsed, member, regular]) {
      const resolved = await resolveEffectiveTier(SHOP, customer.id);
      expect(await tierOf(customer.id)).toBe(resolved.effectiveTierId);
    }
    expect(await tierOf(lapsed.id)).toBe("tier-bronze");
    expect(await tierOf(member.id)).toBe("tier-bronze");
    expect(await tierOf(regular.id)).toBe("tier-gold");

    const logged = await prisma.tierChangeLog.findMany({ where: { shop: SHOP }, orderBy: { toTierName: "asc" } });
    expect(logged.map((entry) => [entry.customerId, entry.toTierId, entry.triggerType])).toEqual([
      [lapsed.id, "tier-bronze", "PERIODIC_REVIEW"],
      [regular.id, "tier-gold", "PERIODIC_REVIEW"],
    ]);
    const settings = await prisma.shopSettings.findUniqueOrThrow({ where: { shop: SHOP } });
    expect(settings.tierRecalculationLastRun).not.toBeNull();
  });

  // A dropped pooled connection fails one read. The resolver used to treat
  // the failed read as "nothing found" and write the lower tier it got.
  it.each([
    ["the shopper's orders", "order", "findMany", "tier-gold"],
    ["the shopper's manual tier", "customerTierState", "findUnique", "tier-gold"],
    ["the shop's base tier setting", "shopSettings", "findUnique", "tier-silver"],
  ] as const)("keeps a shopper's tier when the read of %s fails, and counts the error", async (_read, model, method, heldTier) => {
    await prisma.shopSettings.create({ data: { shop: SHOP, storeName: "Card Shop", storeUrl: `https://${SHOP}` } });
    if (heldTier === "tier-gold") {
      await prisma.tier.create({ data: { id: "tier-bronze", shop: SHOP, name: "Bronze", minSpend: 0, cashbackPercent: 5 } });
      await prisma.tier.create({ data: { id: "tier-gold", shop: SHOP, name: "Gold", minSpend: 500, cashbackPercent: 10 } });
    } else {
      // The only tier needs spending, so a shopper with none holds it as the base tier
      await prisma.tier.create({ data: { id: "tier-silver", shop: SHOP, name: "Silver", minSpend: 100, cashbackPercent: 3 } });
    }
    const shopper = await seedCustomer(5, model === "order" ? 700 : 0, heldTier);
    if (model === "order") await seedOrder(shopper.id, 700, new Date(Date.now() - 30 * DAY));
    if (model === "customerTierState") {
      // Gold by hand; spending alone gives Bronze
      await prisma.customerTierState.create({
        data: {
          shop: SHOP,
          customerId: shopper.id,
          effectiveTierId: "tier-gold",
          tierSource: "MANUAL_OVERRIDE",
          hasManualOverride: true,
          manualOverrideTierId: "tier-gold",
          manualOverrideAt: new Date(Date.now() - 10 * DAY),
          lastResolvedAt: new Date(Date.now() - 10 * DAY),
        },
      });
    }

    failNextCall(model, method, new Error("Server has closed the connection"));

    const response = await tierRecalculation({
      request: new Request("https://test.example.com/api/cron/tier-recalculation", {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }),
      params: {},
      context: {},
    });
    const { summary } = await response.json();

    expect(response.status).toBe(500);
    expect(await tierOf(shopper.id)).toBe(heldTier);
    expect(summary).toMatchObject({ errorCount: 1, totalDowngraded: 0 });
    expect(await prisma.tierChangeLog.count({ where: { shop: SHOP } })).toBe(0);
    const settings = await prisma.shopSettings.findUniqueOrThrow({ where: { shop: SHOP } });
    expect(settings.tierRecalculationLastRun).toBeNull();
  });

  it("finishes a pass an earlier run ran out of time on, resolving only the customers it didn't reach", async () => {
    const lastRun = new Date(Date.now() - 8 * DAY);
    await prisma.shopSettings.create({
      data: {
        shop: SHOP,
        storeName: "Card Shop",
        storeUrl: `https://${SHOP}`,
        tierRecalculationFrequency: "WEEKLY",
        tierRecalculationLastRun: lastRun,
      },
    });
    await prisma.tier.create({ data: { id: "tier-bronze", shop: SHOP, name: "Bronze", minSpend: 0, cashbackPercent: 5 } });
    // Yesterday's run resolved four of the six before it ran out of time
    const resolvedYesterday = new Date(Date.now() - DAY);
    const notReached = new Date(Date.now() - 20 * DAY);
    const customers = [];
    for (let i = 0; i < 6; i++) {
      const customer = await seedCustomer(10 + i, 0, "tier-bronze");
      await prisma.customerTierState.create({
        data: {
          shop: SHOP,
          customerId: customer.id,
          effectiveTierId: "tier-bronze",
          tierSource: "SPENDING_BASED",
          lastResolvedAt: i < 4 ? resolvedYesterday : notReached,
        },
      });
      customers.push(customer);
    }
    const runStart = new Date();

    const { summary } = await runTierRecalculation();

    expect(summary).toMatchObject({ customersProcessed: 2, shopsUnfinished: 0, errorCount: 0 });
    const states = await prisma.customerTierState.findMany({ where: { shop: SHOP } });
    const lastResolved = new Map(states.map((state) => [state.customerId, state.lastResolvedAt]));
    for (const [i, customer] of customers.entries()) {
      if (i < 4) expect(lastResolved.get(customer.id)).toEqual(resolvedYesterday);
      else expect(lastResolved.get(customer.id)!.getTime()).toBeGreaterThanOrEqual(runStart.getTime());
    }
    const settings = await prisma.shopSettings.findUniqueOrThrow({ where: { shop: SHOP } });
    expect(settings.tierRecalculationLastRun!.getTime()).toBeGreaterThanOrEqual(runStart.getTime());
  });

  it("leaves a shopper with no tier when the shop turned off automatic base tiers, as orders do", async () => {
    await prisma.shopSettings.create({
      data: { shop: SHOP, storeName: "Card Shop", storeUrl: `https://${SHOP}`, autoAssignBaseTier: false },
    });
    await prisma.tier.create({ data: { id: "tier-silver", shop: SHOP, name: "Silver", minSpend: 100, cashbackPercent: 3 } });
    const newcomer = await seedCustomer(4, 0, null);

    await runTierRecalculation();

    expect((await resolveEffectiveTier(SHOP, newcomer.id)).effectiveTierId).toBeNull();
    expect(await tierOf(newcomer.id)).toBeNull();
  });
});
