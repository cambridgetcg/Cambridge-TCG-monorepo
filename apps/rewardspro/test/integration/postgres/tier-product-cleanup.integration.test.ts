import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { loader as tierProductCleanup } from "~/routes/api.cron.tier-product-cleanup";
import { hasTestDatabase, resetDatabase } from "./database";

// The tier-product-cleanup cron against Postgres: 30 days after a merchant
// deletes a membership product it deletes the product and its purchases for
// good. It must not take away a membership a shopper still holds.

const SHOP = "tier-cleanup.myshopify.com";
const CRON_SECRET = "tier-product-cleanup-cron";
const DAY = 24 * 60 * 60 * 1000;

let n = 0;
async function seedProduct(deletedDaysAgo: number) {
  n++;
  return prisma.tierProduct.create({
    data: {
      shop: SHOP,
      tierId: "tier-gold",
      shopifyProductId: `${n}`,
      shopifyVariantId: `${n}0`,
      productHandle: `gold-${n}`,
      sku: `GOLD-${n}`,
      purchaseType: "ONE_TIME",
      price: 10,
      deletedAt: new Date(Date.now() - deletedDaysAgo * DAY),
    },
  });
}

async function seedPurchase(
  tierProductId: string,
  customerId: string,
  status: "ACTIVE" | "EXPIRED",
  endDate: Date | null,
) {
  n++;
  return prisma.tierPurchase.create({
    data: {
      shop: SHOP,
      customerId,
      tierId: "tier-gold",
      tierProductId,
      shopifyOrderId: `order-${n}`,
      shopifyLineItemId: `line-${n}`,
      purchasePrice: 10,
      currency: "GBP",
      startDate: new Date(Date.now() - 60 * DAY),
      endDate,
      status,
    },
  });
}

async function runCleanup() {
  const response = await tierProductCleanup({
    request: new Request("https://test.example.com/api/cron/tier-product-cleanup", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    }),
    params: {},
    context: {},
  });
  expect(response.status).toBe(200);
  return response.json();
}

describe.skipIf(!hasTestDatabase)("tier-product-cleanup cron on Postgres", () => {
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

  it("keeps a deleted product while a shopper still holds a membership bought from it", async () => {
    await prisma.tier.create({ data: { id: "tier-gold", shop: SHOP, name: "Gold", minSpend: 500, cashbackPercent: 10 } });
    const shopper = await prisma.customer.create({
      data: { shop: SHOP, shopifyCustomerId: "100", email: "member@example.test", currentTierId: "tier-gold" },
    });

    // Bought for life while Shopify was deleting the product
    const lifetime = await seedProduct(31);
    const held = await seedPurchase(lifetime.id, shopper.id, "ACTIVE", null);
    await seedPurchase(lifetime.id, shopper.id, "EXPIRED", new Date(Date.now() - 40 * DAY));

    // Ran out yesterday; tier-maintenance hasn't ended it yet
    const justEnded = await seedProduct(31);
    await seedPurchase(justEnded.id, shopper.id, "ACTIVE", new Date(Date.now() - DAY));

    // Every membership from it has ended
    const finished = await seedProduct(31);
    await seedPurchase(finished.id, shopper.id, "EXPIRED", new Date(Date.now() - 40 * DAY));

    // Still inside the 30 days the merchant can restore it
    const recoverable = await seedProduct(5);

    const body = await runCleanup();

    expect(body.result.permanentlyDeleted).toBe(1);
    const left = await prisma.tierProduct.findMany({ where: { shop: SHOP }, select: { id: true } });
    expect(left.map((product) => product.id).sort()).toEqual([lifetime.id, justEnded.id, recoverable.id].sort());
    expect(await prisma.tierPurchase.findUnique({ where: { id: held.id } })).not.toBeNull();
    expect(await prisma.tierPurchase.count({ where: { tierProductId: finished.id } })).toBe(0);
  });
});
