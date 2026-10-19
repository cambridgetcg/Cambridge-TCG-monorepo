import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma, { createPrismaClient } from "~/db.server";
import { action as refundsCreate } from "~/routes/webhooks.orders.refunded";
import { action as ordersCancelled } from "~/routes/webhooks.orders.cancelled";
import { issueCashbackByHand, lockLedgerEntry, lockOrder } from "~/services/cashback-ledger.server";
import { RefundRetryableError, recordRefund } from "~/services/refund-handler.server";
import { unauthenticated } from "~/shopify.server";
import { hasTestDatabase, resetDatabase } from "./database";
import { mockStoreCredit, seedOfflineSession, signedWebhook } from "./shopify";

const SHOP = "refunds-test.myshopify.com";
const SHOPIFY_CUSTOMER = "100";
const SHOPIFY_ORDER = 7770001;

// The Orders page's refusals for cashback that is not waiting to be issued
const NOT_RECORDED = "No cashback was recorded for this order when it was paid, so there is none to issue";
const HISTORY_RECORD = "This order's cashback is a record imported with the order history, not cashback waiting to be issued";

/** A paid £100 order with £5.00 cashback, issued (SYNCED) or still pending. */
async function seedOrder({ cashback = "issued" }: { cashback?: "issued" | "pending" } = {}) {
  await prisma.shopSettings.create({
    data: { shop: SHOP, storeName: "Refunds", storeUrl: `https://${SHOP}`, storeCurrency: "GBP" },
  });
  const issued = cashback === "issued";
  const customer = await prisma.customer.create({
    data: { shop: SHOP, shopifyCustomerId: SHOPIFY_CUSTOMER, email: "alice@example.test", storeCredit: issued ? 5 : 0, totalSpent: 100, netSpent: 100, totalCashbackEarned: 5 },
  });
  const order = await prisma.order.create({
    data: {
      shop: SHOP,
      shopifyOrderId: String(SHOPIFY_ORDER),
      shopifyOrderNumber: "1001",
      shopifyOrderName: "#1001",
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
      cashbackProcessed: issued,
      shopifyCreatedAt: new Date(),
      shopifyUpdatedAt: new Date(),
    },
  });
  const entry = await prisma.storeCreditLedger.create({
    data: {
      shop: SHOP,
      customerId: customer.id,
      orderId: order.id,
      shopifyOrderId: order.shopifyOrderId,
      type: "CASHBACK_EARNED",
      amount: 5,
      balance: 5,
      metadata: { orderName: "#1001", syncStatus: issued ? "SYNCED" : "PENDING" },
    },
  });
  return { customer, order, entry };
}

function refundPayload(id: number, amount: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    order_id: SHOPIFY_ORDER,
    created_at: "2026-10-19T10:00:00Z",
    refund_line_items: [],
    transactions: [{ kind: "refund", status: "success", amount, currency: "GBP" }],
    ...overrides,
  };
}

/** A refund as recordRefund takes it, for calls on a client of the test's choosing. */
function refundInput(id: string, amount: string) {
  return {
    shop: SHOP,
    shopifyOrderId: String(SHOPIFY_ORDER),
    shopifyRefundId: id,
    amount: new Prisma.Decimal(amount),
    currency: "GBP",
    createdAt: new Date(),
  };
}

function deliverRefund(payload: unknown, webhookId?: string) {
  return refundsCreate({ request: signedWebhook("refunds/create", SHOP, payload, webhookId), params: {}, context: {} });
}

const clawbacks = () =>
  prisma.storeCreditLedger.findMany({ where: { shop: SHOP, type: "REFUND_CLAWBACK" }, orderBy: { createdAt: "asc" }, include: { refund: true } });

/** The Orders page issuing an order's cashback; without `amount`, its batch action. */
async function issueByHand(orderId: string, amount?: number) {
  const { admin } = await unauthenticated.admin(SHOP);
  return issueCashbackByHand({ shop: SHOP, admin, orderId, amount, currency: "GBP", reason: "Loyalty reward" });
}

/**
 * Wait, inside `tx`, until `count` other sessions are blocked on a lock.
 * (pg_locks, not pg_stat_activity: a transaction sees the latter frozen.)
 */
async function waitForLockWaiters(tx: Prisma.TransactionClient, count: number) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const [{ waiting }] = await tx.$queryRaw<Array<{ waiting: number }>>`
      SELECT count(DISTINCT pid)::int AS waiting FROM pg_locks WHERE NOT granted`;
    if (waiting >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${count} sessions never waited on a lock`);
}

describe.skipIf(!hasTestDatabase)("refunds/create on Postgres", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedOfflineSession(SHOP);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  it("rejects a delivery not signed with the app's client secret", async () => {
    await seedOrder();
    const request = signedWebhook("refunds/create", SHOP, refundPayload(1, "100.00"));
    const forged = new Request(request.url, {
      method: "POST",
      headers: { ...Object.fromEntries(request.headers), "X-Shopify-Hmac-Sha256": "forged" },
      body: await request.text(),
    });

    await expect(refundsCreate({ request: forged, params: {}, context: {} })).rejects.toMatchObject({ status: 401 });
    await expect(prisma.orderRefund.count()).resolves.toBe(0);
  });

  it("reverses issued cashback on a full refund with a linked entry and a store-credit debit", async () => {
    const { customer } = await seedOrder();
    const calls = mockStoreCredit(SHOP, { [SHOPIFY_CUSTOMER]: 5 });

    const response = await deliverRefund(refundPayload(1, "100.00"));

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ operation: "debit", customerId: SHOPIFY_CUSTOMER, amount: "5.00", currency: "GBP" }]);
    const [clawback] = await clawbacks();
    expect(clawback.amount.toFixed(2)).toBe("-5.00");
    expect(clawback.refund?.shopifyRefundId).toBe("1");
    expect(clawback.refund?.cashbackProcessed).toBe(true);
    expect(clawback.metadata).toMatchObject({ syncStatus: "SYNCED", reversalAmount: "5.00", debitedAmount: "5.00" });

    const order = await prisma.order.findUniqueOrThrow({ where: { shop_shopifyOrderId: { shop: SHOP, shopifyOrderId: String(SHOPIFY_ORDER) } } });
    expect(order.financialStatus).toBe("REFUNDED");
    expect(order.totalRefunded.toFixed(2)).toBe("100.00");
    expect(order.cashbackAmount?.toFixed(2)).toBe("0.00");
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(after.storeCredit.toFixed(2)).toBe("0.00");
    expect(after.netSpent.toFixed(2)).toBe("0.00");
  });

  it("reverses partial refunds proportionally, never more than was credited, once per refund", async () => {
    await seedOrder();
    const calls = mockStoreCredit(SHOP, { [SHOPIFY_CUSTOMER]: 5 });

    expect((await deliverRefund(refundPayload(1, "30.00"), "wh-1")).status).toBe(200);
    // Redelivery under a new webhook id: same refund, no second debit
    expect((await deliverRefund(refundPayload(1, "30.00"), "wh-2")).status).toBe(200);
    expect((await deliverRefund(refundPayload(2, "70.00"), "wh-3")).status).toBe(200);

    expect(calls.map((c) => c.amount)).toEqual(["1.50", "3.50"]);
    const entries = await clawbacks();
    expect(entries.map((e) => e.amount.toFixed(2))).toEqual(["-1.50", "-3.50"]);
    const order = await prisma.order.findFirstOrThrow({ where: { shop: SHOP } });
    expect(order.financialStatus).toBe("REFUNDED");
    expect(order.totalRefunded.toFixed(2)).toBe("100.00");
    await expect(prisma.orderRefund.count()).resolves.toBe(2);
  });

  it("caps the debit at the credit the shopper still holds and records the shortfall", async () => {
    await seedOrder();
    const calls = mockStoreCredit(SHOP, { [SHOPIFY_CUSTOMER]: 2 });

    expect((await deliverRefund(refundPayload(1, "100.00"))).status).toBe(200);

    expect(calls.map((c) => c.amount)).toEqual(["2.00"]);
    const [clawback] = await clawbacks();
    expect(clawback.amount.toFixed(2)).toBe("-2.00");
    expect(clawback.metadata).toMatchObject({ reversalAmount: "5.00", debitedAmount: "2.00", unrecoveredAmount: "3.00" });
  });

  it("shrinks cashback that was not issued yet instead of debiting", async () => {
    const { entry } = await seedOrder({ cashback: "pending" });
    const calls = mockStoreCredit(SHOP, { [SHOPIFY_CUSTOMER]: 0 });

    expect((await deliverRefund(refundPayload(1, "40.00"))).status).toBe(200);
    let pending = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
    expect(pending.amount.toFixed(2)).toBe("3.00");
    expect(pending.metadata).toMatchObject({ syncStatus: "PENDING", originalAmount: "5.00" });

    expect((await deliverRefund(refundPayload(2, "60.00"))).status).toBe(200);
    pending = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
    expect(pending.amount.toFixed(2)).toBe("0.00");
    // Fully reversed before issue: never sent
    expect(pending.metadata).toMatchObject({ syncStatus: "NOT_APPLICABLE" });
    expect(calls).toEqual([]);
    await expect(clawbacks()).resolves.toEqual([]);
  });

  it("answers 5xx when the debit fails and settles once on redelivery", async () => {
    await seedOrder();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const calls = mockStoreCredit(SHOP, { [SHOPIFY_CUSTOMER]: 5 }, { failDebits: 1 });

    const first = await deliverRefund(refundPayload(1, "100.00"), "wh-1");
    expect(first.status).toBe(503);
    let [clawback] = await clawbacks();
    expect(clawback.metadata).toMatchObject({ syncStatus: "PENDING", lastError: "Temporarily unavailable" });

    const retry = await deliverRefund(refundPayload(1, "100.00"), "wh-1");
    expect(retry.status).toBe(200);
    [clawback] = await clawbacks();
    expect(clawback.metadata).toMatchObject({ syncStatus: "SYNCED", debitedAmount: "5.00" });
    expect(calls.filter((c) => c.operation === "debit")).toHaveLength(2);
    expect((await prisma.order.findFirstOrThrow({ where: { shop: SHOP } })).totalRefunded.toFixed(2)).toBe("100.00");
  });

  it("asks for a retry while the reconciliation cron is issuing the cashback", async () => {
    const { entry } = await seedOrder({ cashback: "pending" });
    await prisma.storeCreditLedger.update({ where: { id: entry.id }, data: { metadata: { syncStatus: "SYNCING" } } });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await deliverRefund(refundPayload(1, "100.00"));

    expect(response.status).toBe(503);
    // Rolled back: the redelivery applies the refund once
    await expect(prisma.orderRefund.count()).resolves.toBe(0);
    expect((await prisma.order.findFirstOrThrow({ where: { shop: SHOP } })).totalRefunded.toFixed(2)).toBe("0.00");
  });

  it("handles cancel-then-refund: the cancellation leaves cashback to the refund", async () => {
    await seedOrder();
    const calls = mockStoreCredit(SHOP, { [SHOPIFY_CUSTOMER]: 5 });

    const cancelled = await ordersCancelled({
      request: signedWebhook("orders/cancelled", SHOP, {
        id: SHOPIFY_ORDER,
        created_at: "2026-10-18T10:00:00Z",
        updated_at: "2026-10-19T10:00:00Z",
        cancelled_at: "2026-10-19T10:00:00Z",
        cancel_reason: "customer",
        financial_status: "refunded",
        fulfillment_status: null,
        total_price: "100.00",
        currency: "GBP",
      }),
      params: {},
      context: {},
    });
    expect(cancelled.status).toBe(200);
    expect(calls).toEqual([]);

    expect((await deliverRefund(refundPayload(1, "100.00"))).status).toBe(200);

    expect(calls.map((c) => c.amount)).toEqual(["5.00"]);
    const order = await prisma.order.findFirstOrThrow({ where: { shop: SHOP } });
    expect(order.financialStatus).toBe("REFUNDED");
    expect(order.fulfillmentStatus).toBe("CANCELLED");
  });

  it("keeps a refund recorded before a late cancellation", async () => {
    await seedOrder();
    mockStoreCredit(SHOP, { [SHOPIFY_CUSTOMER]: 5 });
    expect((await deliverRefund(refundPayload(1, "40.00"))).status).toBe(200);

    // A cancellation snapshot taken before the refund still says "paid"
    await ordersCancelled({
      request: signedWebhook("orders/cancelled", SHOP, {
        id: SHOPIFY_ORDER,
        created_at: "2026-10-18T10:00:00Z",
        updated_at: "2026-10-19T09:00:00Z",
        cancelled_at: "2026-10-19T09:00:00Z",
        cancel_reason: "customer",
        financial_status: "paid",
        fulfillment_status: null,
        total_price: "100.00",
        currency: "GBP",
      }),
      params: {},
      context: {},
    });

    const order = await prisma.order.findFirstOrThrow({ where: { shop: SHOP } });
    expect(order.financialStatus).toBe("PARTIALLY_REFUNDED");
  });

  it("leaves the order alone when a refund returns no money (restock only)", async () => {
    await seedOrder();
    const calls = mockStoreCredit(SHOP, { [SHOPIFY_CUSTOMER]: 5 });

    expect((await deliverRefund(refundPayload(1, "0.00", { transactions: [] }))).status).toBe(200);
    // A failed refund transaction returned nothing either
    const failed = { transactions: [{ kind: "refund", status: "failure", amount: "100.00", currency: "GBP" }] };
    expect((await deliverRefund(refundPayload(2, "0.00", failed))).status).toBe(200);

    expect(calls).toEqual([]);
    const order = await prisma.order.findFirstOrThrow({ where: { shop: SHOP } });
    expect(order.financialStatus).toBe("PAID");
    expect(order.cashbackAmount?.toFixed(2)).toBe("5.00");
    await expect(clawbacks()).resolves.toEqual([]);
  });

  describe("concurrent refunds of one order", () => {
    /**
     * Record a £40 and a £60 refund at once, each on its own connection as two
     * app instances would, while `hold` locks a row they need until both wait
     * for it: both have started before either goes on.
     */
    async function raceRefunds(hold: (tx: Prisma.TransactionClient) => Promise<void>) {
      const instances = [createPrismaClient(process.env.DATABASE_URL), createPrismaClient(process.env.DATABASE_URL)];
      try {
        let holding!: () => void;
        const held = new Promise<void>((resolve) => (holding = resolve));
        const holder = prisma.$transaction(
          async (tx) => {
            await hold(tx);
            holding();
            await waitForLockWaiters(tx, 2);
          },
          { timeout: 20_000 },
        );
        await held;
        await Promise.all([recordRefund(refundInput("1", "40.00"), instances[0]), recordRefund(refundInput("2", "60.00"), instances[1]), holder]);
      } finally {
        await Promise.all(instances.map((client) => client.$disconnect()));
      }
      const order = await prisma.order.findFirstOrThrow({ where: { shop: SHOP } });
      expect(order.totalRefunded.toFixed(2)).toBe("100.00");
      expect(order.netAmount.toFixed(2)).toBe("0.00");
      expect(order.financialStatus).toBe("REFUNDED");
      expect(order.cashbackEligible).toBe(false);
      return order;
    }

    it("apply one after the other when the order has cashback", async () => {
      const { order, entry } = await seedOrder({ cashback: "pending" });
      const calls = mockStoreCredit(SHOP, { [SHOPIFY_CUSTOMER]: 0 });

      const after = await raceRefunds((tx) => lockLedgerEntry(tx, entry.id));

      expect(after.cashbackAmount?.toFixed(2)).toBe("0.00");
      const reversed = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
      expect(reversed.amount.toFixed(2)).toBe("0.00");
      expect(reversed.metadata).toMatchObject({ syncStatus: "NOT_APPLICABLE" });
      // Nothing is left for the Orders page to issue
      await expect(issueByHand(order.id)).resolves.toMatchObject({ success: false });
      expect(calls).toEqual([]);
    });

    it("apply one after the other when the order has no cashback entry", async () => {
      const { order, entry } = await seedOrder({ cashback: "pending" });
      await prisma.storeCreditLedger.delete({ where: { id: entry.id } });

      await raceRefunds((tx) => lockOrder(tx, order.id));
    });
  });

  describe("a refund that commits while the Orders page issues cashback", () => {
    /**
     * Give the seeded order's cashback the shape under test: none recorded
     * (orders/paid found none due), a record from the order history sync
     * (order-sync-job.server.ts: no syncStatus, no shopifyOrderId, balance 0)
     * or the PENDING entry orders/paid writes. The order keeps its £5.00.
     */
    async function seedCashback(kind: "none" | "historical" | "pending") {
      const { order, entry } = await seedOrder({ cashback: "pending" });
      if (kind === "none") await prisma.storeCreditLedger.delete({ where: { id: entry.id } });
      if (kind === "historical") {
        await prisma.storeCreditLedger.update({
          where: { id: entry.id },
          data: { shopifyOrderId: null, balance: 0, metadata: { orderName: "#1001", historical: true, tierName: "Gold", cashbackPercent: 5 } },
        });
      }
      return order;
    }

    /**
     * The batch action issues the order's cashback. While Shopify's
     * store-credit call is in flight, a full refund of the order is recorded
     * on a second connection (another app instance) and commits before the
     * credit returns. Shopify then delivers the refund to the webhook, as it
     * redelivers one answered 5xx (one already recorded changes nothing).
     */
    async function issueWhileRefunding(orderId: string) {
      const instance = createPrismaClient(process.env.DATABASE_URL);
      const duringCredit: string[] = [];
      try {
        const calls = mockStoreCredit(SHOP, { [SHOPIFY_CUSTOMER]: 0 }, {
          duringCredit: async () => {
            try {
              duringCredit.push((await recordRefund(refundInput("1", "100.00"), instance)).status);
            } catch (error) {
              if (!(error instanceof RefundRetryableError)) throw error;
              duringCredit.push("retry");
            }
          },
        });
        const issued = await issueByHand(orderId);
        expect((await deliverRefund(refundPayload(1, "100.00"))).status).toBe(200);
        const total = (operation: string) =>
          calls.filter((c) => c.operation === operation).reduce((sum, c) => sum + Number(c.amount), 0);
        return { issued, duringCredit, calls, netCashback: total("credit") - total("debit") };
      } finally {
        await instance.$disconnect();
      }
    }

    it("refuses an order with no cashback entry, so nothing is credited", async () => {
      const order = await seedCashback("none");

      const { issued, duringCredit, calls, netCashback } = await issueWhileRefunding(order.id);

      expect(netCashback).toBe(0);
      expect(calls).toEqual([]);
      expect(issued).toEqual({ success: false, error: NOT_RECORDED });
      expect(duringCredit).toEqual([]);
      await expect(prisma.storeCreditLedger.count({ where: { orderId: order.id } })).resolves.toBe(0);
      await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({
        financialStatus: "REFUNDED",
        cashbackProcessed: false,
      });
    });

    it("refuses a historical entry from the order sync, so nothing is credited", async () => {
      const order = await seedCashback("historical");

      const { issued, duringCredit, calls, netCashback } = await issueWhileRefunding(order.id);

      expect(netCashback).toBe(0);
      expect(calls).toEqual([]);
      expect(issued).toEqual({ success: false, error: HISTORY_RECORD });
      expect(duringCredit).toEqual([]);
      // Still a record: the refund shrank it and nothing marked it issued
      const record = await prisma.storeCreditLedger.findFirstOrThrow({ where: { orderId: order.id, type: "CASHBACK_EARNED" } });
      expect(record.amount.toFixed(2)).toBe("0.00");
      expect(record.metadata).toMatchObject({ historical: true });
      expect(record.metadata).not.toHaveProperty("syncStatus");
      await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({
        financialStatus: "REFUNDED",
        cashbackProcessed: false,
      });
    });

    it("makes the refund wait for a pending entry's issue, then reverses it (control)", async () => {
      const order = await seedCashback("pending");

      const { issued, duringCredit, calls, netCashback } = await issueWhileRefunding(order.id);

      expect(netCashback).toBe(0);
      expect(issued).toMatchObject({ success: true, amount: 5 });
      // Mid-credit the entry is SYNCING: the refund rolls back and asks for a retry
      expect(duringCredit).toEqual(["retry"]);
      expect(calls.map((c) => `${c.operation} ${c.amount}`)).toEqual(["credit 5.00", "debit 5.00"]);
      const entry = await prisma.storeCreditLedger.findFirstOrThrow({ where: { orderId: order.id, type: "CASHBACK_EARNED" } });
      expect(entry.metadata).toMatchObject({ syncStatus: "SYNCED" });
      expect(await clawbacks()).toMatchObject([{ metadata: { syncStatus: "SYNCED", reversalAmount: "5.00", debitedAmount: "5.00" } }]);
    });
  });

  it("leaves nothing to issue after a partial refund of an order with no cashback entry", async () => {
    const { order, entry } = await seedOrder({ cashback: "pending" });
    await prisma.storeCreditLedger.delete({ where: { id: entry.id } });
    const calls = mockStoreCredit(SHOP, { [SHOPIFY_CUSTOMER]: 0 });

    expect((await deliverRefund(refundPayload(1, "40.00"))).status).toBe(200);

    // The batch action, and the modal with the amount the page showed
    await expect(issueByHand(order.id)).resolves.toEqual({ success: false, error: NOT_RECORDED });
    await expect(issueByHand(order.id, 5)).resolves.toEqual({ success: false, error: NOT_RECORDED });
    expect(calls).toEqual([]);
    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({
      financialStatus: "PARTIALLY_REFUNDED",
      cashbackProcessed: false,
    });
  });

  it("never issues more by hand than a refund left of the cashback", async () => {
    const { order, entry } = await seedOrder({ cashback: "pending" });
    const calls = mockStoreCredit(SHOP, { [SHOPIFY_CUSTOMER]: 0 });
    expect((await deliverRefund(refundPayload(1, "40.00"))).status).toBe(200);

    // The modal was opened before the refund and still shows £5.00
    await expect(issueByHand(order.id, 5)).resolves.toEqual({ success: false, error: "Only 3.00 GBP of cashback is due for this order" });
    expect(calls).toEqual([]);
    // Refused after the claim: the entry waits to be issued again
    const pending = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
    expect(pending.metadata).toMatchObject({ syncStatus: "PENDING" });
    expect(pending.amount.toFixed(2)).toBe("3.00");

    await expect(issueByHand(order.id, 3)).resolves.toMatchObject({ success: true, amount: 3 });
    expect(calls.map((c) => c.amount)).toEqual(["3.00"]);
  });

  it("refuses to hand-issue cashback that refunds reversed", async () => {
    // What a lost refund update used to leave: the order still shows cashback
    // while its entry was reversed in full
    const { order, entry } = await seedOrder({ cashback: "pending" });
    await prisma.storeCreditLedger.update({ where: { id: entry.id }, data: { amount: 0, metadata: { syncStatus: "NOT_APPLICABLE" } } });
    await prisma.order.update({ where: { id: order.id }, data: { cashbackAmount: 2, totalRefunded: 60, financialStatus: "PARTIALLY_REFUNDED" } });
    const calls = mockStoreCredit(SHOP, { [SHOPIFY_CUSTOMER]: 0 });

    // The modal's amount, as the page showed it before the refunds
    await expect(issueByHand(order.id, 2)).resolves.toEqual({ success: false, error: "No cashback is left to issue for this order" });
    await expect(issueByHand(order.id)).resolves.toMatchObject({ success: false });

    // A refunded order is refused even without a cashback entry
    await prisma.storeCreditLedger.delete({ where: { id: entry.id } });
    await prisma.order.update({ where: { id: order.id }, data: { totalRefunded: 100, financialStatus: "REFUNDED" } });
    await expect(issueByHand(order.id, 2)).resolves.toEqual({ success: false, error: "This order was refunded or is excluded from cashback" });
    expect(calls).toEqual([]);
  });

  it("reverses issued cashback by shares of the original after a refund before issue", async () => {
    const { order, entry } = await seedOrder({ cashback: "pending" });
    const calls = mockStoreCredit(SHOP, { [SHOPIFY_CUSTOMER]: 0 });

    expect((await deliverRefund(refundPayload(1, "50.00"))).status).toBe(200);
    // The batch issue pays what the refund left, read when it is issued
    await expect(issueByHand(order.id)).resolves.toMatchObject({ success: true, amount: 2.5 });
    // 25% of the original £5.00 each, not 25% of the £2.50 issued
    expect((await deliverRefund(refundPayload(2, "25.00"))).status).toBe(200);
    expect((await deliverRefund(refundPayload(3, "25.00"))).status).toBe(200);

    expect(calls.map((c) => `${c.operation} ${c.amount}`)).toEqual(["credit 2.50", "debit 1.25", "debit 1.25"]);
    const issued = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
    expect(issued.amount.toFixed(2)).toBe("2.50");
    expect(issued.metadata).toMatchObject({ syncStatus: "SYNCED", originalAmount: "5.00" });
    expect(await clawbacks()).toMatchObject([{ metadata: { reversalAmount: "1.25" } }, { metadata: { reversalAmount: "1.25" } }]);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.financialStatus).toBe("REFUNDED");
    expect(after.cashbackAmount?.toFixed(2)).toBe("0.00");
  });

  it("acknowledges refunds for orders it never recorded", async () => {
    const response = await deliverRefund(refundPayload(1, "10.00"));
    expect(response.status).toBe(200);
    await expect(prisma.orderRefund.count()).resolves.toBe(0);
  });
});
