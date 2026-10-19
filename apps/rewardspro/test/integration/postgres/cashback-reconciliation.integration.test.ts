import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { loader as reconcile } from "~/routes/api.cron.cashback-reconciliation";
import { claimLedgerEntry } from "~/services/cashback-ledger.server";
import { hasTestDatabase, resetDatabase } from "./database";
import { mockStoreCredit, seedOfflineSession } from "./shopify";

const AUTO_SHOP = "auto-on.myshopify.com";
const MANUAL_SHOP = "auto-off.myshopify.com";
const CRON_SECRET = "cron-secret-for-tests";

/** A shop with one order whose £5.00 cashback is PENDING (created 10 minutes ago). */
async function seedShop(shop: string, autoCashbackProcessingEnabled: boolean) {
  await prisma.shopSettings.create({
    data: { shop, storeName: shop, storeUrl: `https://${shop}`, storeCurrency: "GBP", autoCashbackProcessingEnabled },
  });
  await seedOfflineSession(shop);
  const customer = await prisma.customer.create({ data: { shop, shopifyCustomerId: "100", email: `a@${shop}` } });
  const order = await prisma.order.create({
    data: {
      shop,
      shopifyOrderId: "5001",
      shopifyOrderNumber: "5001",
      shopifyOrderName: "#5001",
      customerId: customer.id,
      email: customer.email,
      currency: "GBP",
      subtotalPrice: 100,
      totalDiscounts: 0,
      totalShipping: 0,
      totalTax: 0,
      totalPrice: 100,
      netAmount: 100,
      financialStatus: "PAID",
      cashbackAmount: 5,
      shopifyCreatedAt: new Date(),
      shopifyUpdatedAt: new Date(),
    },
  });
  const entry = await prisma.storeCreditLedger.create({
    data: {
      shop,
      customerId: customer.id,
      orderId: order.id,
      shopifyOrderId: order.shopifyOrderId,
      type: "CASHBACK_EARNED",
      amount: 5,
      balance: 5,
      metadata: { description: "5% cashback on order #5001", syncStatus: "PENDING" },
      createdAt: new Date(Date.now() - 10 * 60_000),
    },
  });
  return { order, entry };
}

function run() {
  return reconcile({
    request: new Request("https://test.example.com/api/cron/cashback-reconciliation", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    }),
    params: {},
    context: {},
  });
}

describe.skipIf(!hasTestDatabase)("cashback reconciliation cron on Postgres", () => {
  beforeEach(async () => {
    await resetDatabase();
    process.env.CRON_SECRET = CRON_SECRET;
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("issues pending cashback only for merchants who turned automatic processing on", async () => {
    const auto = await seedShop(AUTO_SHOP, true);
    const manual = await seedShop(MANUAL_SHOP, false);
    const autoCalls = mockStoreCredit(AUTO_SHOP, { "100": 0 });
    const manualCalls = mockStoreCredit(MANUAL_SHOP, { "100": 0 });

    const response = await run();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ processed: 1, synced: 1, failed: 0 });
    expect(autoCalls).toEqual([{ operation: "credit", customerId: "100", amount: "5.00", currency: "GBP" }]);
    expect(manualCalls).toEqual([]);

    const issued = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: auto.entry.id } });
    expect(issued.metadata).toMatchObject({ syncStatus: "SYNCED", reconciledBy: "cashback-reconciliation-cron" });
    await expect(prisma.order.findUniqueOrThrow({ where: { id: auto.order.id } })).resolves.toMatchObject({ cashbackProcessed: true });
    const untouched = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: manual.entry.id } });
    expect(untouched.metadata).toMatchObject({ syncStatus: "PENDING" });
  });

  it("issues what a refund left of the cashback and never a fully reversed entry", async () => {
    const { entry } = await seedShop(AUTO_SHOP, true);
    const calls = mockStoreCredit(AUTO_SHOP, { "100": 0 });
    await prisma.storeCreditLedger.update({ where: { id: entry.id }, data: { amount: 2 } });

    await run();
    expect(calls.map((c) => c.amount)).toEqual(["2.00"]);

    await prisma.storeCreditLedger.update({ where: { id: entry.id }, data: { amount: 0, metadata: { syncStatus: "PENDING" } } });
    await prisma.order.updateMany({ data: { cashbackProcessed: false } });
    await run();
    expect(calls).toHaveLength(1);
    const settled = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
    expect(settled.metadata).toMatchObject({ syncStatus: "NOT_APPLICABLE" });
  });

  it("does not re-issue cashback the merchant already issued by hand", async () => {
    const { order, entry } = await seedShop(AUTO_SHOP, true);
    const calls = mockStoreCredit(AUTO_SHOP, { "100": 5 });
    await prisma.order.update({ where: { id: order.id }, data: { cashbackProcessed: true } });

    await run();

    expect(calls).toEqual([]);
    const settled = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
    expect(settled.metadata).toMatchObject({ syncStatus: "SYNCED", settledBy: "manual" });
  });

  it("skips an entry another writer has claimed", async () => {
    const { entry } = await seedShop(AUTO_SHOP, true);
    const calls = mockStoreCredit(AUTO_SHOP, { "100": 0 });
    await expect(claimLedgerEntry(entry.id)).resolves.toBe(true);
    // A second claim fails: only one writer sends an entry
    await expect(claimLedgerEntry(entry.id)).resolves.toBe(false);

    await run();
    expect(calls).toEqual([]);
    const claimed = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
    // The claim kept the rest of the metadata
    expect(claimed.metadata).toEqual({ description: "5% cashback on order #5001", syncStatus: "SYNCING" });
  });

  it("requires the cron bearer token", async () => {
    const response = await reconcile({
      request: new Request("https://test.example.com/api/cron/cashback-reconciliation"),
      params: {},
      context: {},
    });
    expect(response.status).toBe(401);
  });
});
