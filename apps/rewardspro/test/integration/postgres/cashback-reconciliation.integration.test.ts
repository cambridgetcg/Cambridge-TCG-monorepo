import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { loader as reconcile } from "~/routes/api.cron.cashback-reconciliation";
import { claimLedgerEntry, manualCashbackRefusal } from "~/services/cashback-ledger.server";
import { recordRefund } from "~/services/refund-handler.server";
import { hasTestDatabase, resetDatabase } from "./database";
import { backdateClaim, creditHistory, mockStoreCredit, seedOfflineSession } from "./shopify";

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
    // The claim kept the rest of the metadata, and noted when it was made
    expect(claimed.metadata).toEqual({ description: "5% cashback on order #5001", syncStatus: "SYNCING", claimedAt: expect.any(String) });
  });

  it("leaves an entry SYNCING when Shopify's answer is lost, and never sends it again", async () => {
    const { order, entry } = await seedShop(AUTO_SHOP, true);
    const balances = { "100": 0 };
    const calls = mockStoreCredit(AUTO_SHOP, balances, { unanswered: 1 });

    await expect((await run()).json()).resolves.toMatchObject({ synced: 0, failed: 1 });
    await expect((await run()).json()).resolves.toMatchObject({ processed: 0 });

    expect(calls).toHaveLength(1);
    expect(balances["100"]).toBe(5);
    const unconfirmed = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
    expect(unconfirmed.metadata).toMatchObject({ syncStatus: "SYNCING", unconfirmedAt: expect.any(String) });
    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ cashbackProcessed: false });
  });

  it("retries an entry Shopify turned away (control)", async () => {
    const { entry } = await seedShop(AUTO_SHOP, true);
    const balances = { "100": 0 };
    const calls = mockStoreCredit(AUTO_SHOP, balances, { throttled: 1 });

    await expect((await run()).json()).resolves.toMatchObject({ synced: 0, failed: 1 });
    expect((await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } })).metadata).toMatchObject({ syncStatus: "PENDING" });
    await expect((await run()).json()).resolves.toMatchObject({ synced: 1 });

    expect(calls).toHaveLength(2);
    expect(balances["100"]).toBe(5);
  });

  describe("refunds the order shows that the entry does not reflect", () => {
    it("issues nothing on an order Sync Orders marked refunded in full", async () => {
      const { order, entry } = await seedShop(AUTO_SHOP, true);
      const calls = mockStoreCredit(AUTO_SHOP, { "100": 0 });
      // "Sync Orders" copies Shopify's status and totals; no refund reached refunds/create
      await prisma.order.update({ where: { id: order.id }, data: { financialStatus: "REFUNDED", totalRefunded: 100, netAmount: 0 } });

      await expect((await run()).json()).resolves.toMatchObject({ synced: 0, skipped: 1 });
      await expect((await run()).json()).resolves.toMatchObject({ processed: 0 });

      expect(calls).toEqual([]);
      const after = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
      expect(after.amount.toFixed(2)).toBe("0.00");
      expect(after.metadata).toMatchObject({ syncStatus: "NOT_APPLICABLE", originalAmount: "5.00", reversedBeforeIssue: [{ orderRefundedTotal: "100.00", amount: "5.00" }] });
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).cashbackAmount?.toFixed(2)).toBe("0.00");
    });

    it("issues what a partial refund imported by Sync Orders leaves", async () => {
      const { order, entry } = await seedShop(AUTO_SHOP, true);
      const calls = mockStoreCredit(AUTO_SHOP, { "100": 0 });
      // As OrderSyncService imports it: the order's totals and a refund row, no cashback reversed
      await prisma.order.update({ where: { id: order.id }, data: { financialStatus: "PARTIALLY_REFUNDED", totalRefunded: 40, netAmount: 60 } });
      await prisma.orderRefund.create({ data: { orderId: order.id, shopifyRefundId: "9001", amount: 40, shippingAmount: 0, taxAmount: 0, shopifyCreatedAt: new Date() } });

      await expect((await run()).json()).resolves.toMatchObject({ synced: 1 });

      expect(calls.map((c) => c.amount)).toEqual(["3.00"]);
      const after = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
      expect(after.amount.toFixed(2)).toBe("3.00");
      expect(after.metadata).toMatchObject({ syncStatus: "SYNCED", originalAmount: "5.00" });
    });

    it("does not take a refund recorded through refunds/create twice (control)", async () => {
      const { entry } = await seedShop(AUTO_SHOP, true);
      const calls = mockStoreCredit(AUTO_SHOP, { "100": 0 });
      const refund = { shop: AUTO_SHOP, shopifyOrderId: "5001", shopifyRefundId: "9002", amount: new Prisma.Decimal("33.33"), currency: "GBP", createdAt: new Date() };
      await recordRefund(refund);
      await recordRefund({ ...refund, shopifyRefundId: "9003" });
      // Each refund took 1.66 of the 5.00 (its share, rounded down)
      expect((await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } })).amount.toFixed(2)).toBe("1.68");

      await expect((await run()).json()).resolves.toMatchObject({ synced: 1 });

      expect(calls.map((c) => c.amount)).toEqual(["1.68"]);
    });
  });

  describe("cashback Shopify never confirmed", () => {
    it("marks cashback issued when Shopify applied it though its answer was lost, and never sends it again", async () => {
      const { order, entry } = await seedShop(AUTO_SHOP, true);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const history = creditHistory();
      const balances = { "100": 0 };
      const calls = mockStoreCredit(AUTO_SHOP, balances, { unanswered: 1, history });
      await run();
      expect((await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } })).metadata).toMatchObject({ syncStatus: "SYNCING" });

      // A run soon after leaves it: the send may still be in Shopify's hands
      await expect((await run()).json()).resolves.toMatchObject({ stuck: { checked: 0 } });
      expect(history.reads).toBe(0);

      await backdateClaim(entry.id, 60, history);
      await expect((await run()).json()).resolves.toMatchObject({ stuck: { checked: 1, issued: 1 } });
      await run();

      expect(calls).toHaveLength(1);
      expect(balances["100"]).toBe(5);
      const settled = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
      expect(settled.metadata).toMatchObject({ syncStatus: "SYNCED", shopifyTransactionId: history.credits[0].id });
      await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ cashbackProcessed: true });
      expect((await prisma.customer.findFirstOrThrow({ where: { shop: AUTO_SHOP } })).storeCredit.toFixed(2)).toBe("5.00");
    });

    it("hands back cashback Shopify never applied, and issues it once", async () => {
      const { entry } = await seedShop(AUTO_SHOP, true);
      // A run claimed it and stopped before sending (a crash): Shopify has no credit
      await claimLedgerEntry(entry.id);
      const history = creditHistory();
      const balances = { "100": 0 };
      const calls = mockStoreCredit(AUTO_SHOP, balances, { history });
      await backdateClaim(entry.id, 60, history);

      await expect((await run()).json()).resolves.toMatchObject({ stuck: { checked: 1, returned: 1 }, synced: 1 });
      await run();

      expect(calls).toEqual([{ operation: "credit", customerId: "100", amount: "5.00", currency: "GBP" }]);
      expect(balances["100"]).toBe(5);
      const issued = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
      expect(issued.metadata).toMatchObject({ syncStatus: "SYNCED" });
      expect(issued.metadata).not.toHaveProperty("unconfirmedAt");
    });

    it("never hands back cashback Shopify did apply (control: the check bites)", async () => {
      const { entry } = await seedShop(AUTO_SHOP, true);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const history = creditHistory();
      const balances = { "100": 0 };
      const calls = mockStoreCredit(AUTO_SHOP, balances, { internalErrors: 1, history });
      await run();
      await backdateClaim(entry.id, 60, history);

      await run();
      await run();

      expect(calls).toHaveLength(1);
      expect(balances["100"]).toBe(5);
    });

    it("asks the merchant to check cashback it cannot match to one credit, and stops asking Shopify", async () => {
      const { order, entry } = await seedShop(AUTO_SHOP, true);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const history = creditHistory();
      const calls = mockStoreCredit(AUTO_SHOP, { "100": 0 }, { unanswered: 1, history });
      await run();
      // The merchant gave the shopper the same amount in Shopify at the same moment
      history.credits.push({ ...history.credits[0], id: "gid://shopify/StoreCreditAccountCreditTransaction/999" });
      await backdateClaim(entry.id, 60, history);

      await expect((await run()).json()).resolves.toMatchObject({ stuck: { checked: 1, needsReview: 1 } });
      await run();

      expect(history.reads).toBe(1);
      expect(calls).toHaveLength(1);
      const kept = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
      expect(kept.metadata).toMatchObject({ syncStatus: "SYNCING", needsReview: true });
      const orderRow = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(manualCashbackRefusal(orderRow, kept)).toMatch(/^Shopify never confirmed this order's cashback/);
    });

    it("waits for a claim made before claims were timed, then checks it", async () => {
      const { entry } = await seedShop(AUTO_SHOP, true);
      await prisma.storeCreditLedger.update({ where: { id: entry.id }, data: { metadata: { syncStatus: "SYNCING" } } });
      const history = creditHistory();
      const calls = mockStoreCredit(AUTO_SHOP, { "100": 0 }, { history });

      await expect((await run()).json()).resolves.toMatchObject({ stuck: { checked: 0 } });
      const seen = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
      expect(seen.metadata).toMatchObject({ syncStatus: "SYNCING", syncingSeenAt: expect.any(String) });
      expect(history.reads).toBe(0);
      expect(calls).toEqual([]);
    });
  });

  it("counts the pending cashback it no longer sends because it is over 7 days old", async () => {
    const { entry } = await seedShop(AUTO_SHOP, true);
    await prisma.storeCreditLedger.update({ where: { id: entry.id }, data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60_000) } });
    const calls = mockStoreCredit(AUTO_SHOP, { "100": 0 });
    const logged = vi.mocked(console.log);

    await expect((await run()).json()).resolves.toMatchObject({ processed: 0, tooOldToSend: 1 });

    expect(calls).toEqual([]);
    // The cron's own lines are JSON; others (the lock's) are not
    const lines = logged.mock.calls.map(([message]) => String(message)).filter((message) => message.startsWith("{"));
    const line = lines.map((message) => JSON.parse(message)).find((entry) => entry.shop === AUTO_SHOP && entry.count === 1);
    expect(line).toMatchObject({ level: "warn", total: "5.00" });
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
