import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { loader as tierRecalculation } from "~/routes/api.cron.tier-recalculation";
import { resolveEffectiveTier } from "~/services/tier-resolution.server";
import { hasTestDatabase, resetDatabase } from "./database";

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
