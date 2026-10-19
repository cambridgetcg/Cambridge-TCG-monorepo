import { graphql, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

// No mail leaves the test
vi.mock("~/services/email-notifications.server", () => ({
  sendTierUpgradeEmailNotification: vi.fn(),
  sendTierDowngradeEmailNotification: vi.fn(),
}));

import prisma from "~/db.server";
import { loader as reconcile } from "~/routes/api.cron.cashback-reconciliation";
import { action as ordersPaid } from "~/routes/webhooks.orders.paid";
import { action as refundsCreate } from "~/routes/webhooks.orders.refunded";
import { processOrderBatch, startOrderSyncJob } from "~/services/order-sync-job.server";
import { unauthenticated } from "~/shopify.server";
import { server } from "../../mocks/server";
import { hasTestDatabase, resetDatabase } from "./database";
import { mockStoreCredit, seedOfflineSession, signedWebhook } from "./shopify";

/**
 * Refunds the app learns of through an order sync before the refund's own
 * refunds/create is processed. The background order-sync job copied an
 * order's refunded total without its refund rows; the cron (or orders/paid)
 * then took the refund's share before issuing, and refunds/create counted
 * the refund again: a second store-credit debit, and an order total twice
 * Shopify's. Every case ends with the shopper's Shopify balance equal to
 * what the ledger records, each credit and debit sent once.
 */

const SHOP = "sync-refunds.myshopify.com";
const CUSTOMER = "100";
const ORDER = 6660001;
const CRON_SECRET = "sync-refunds-cron";
const ADMIN = `https://${SHOP}/admin/api/2025-01/graphql.json`;

async function seedShop({ auto = false }: { auto?: boolean } = {}) {
  await prisma.shopSettings.create({
    data: { shop: SHOP, storeName: "Sync refunds", storeUrl: `https://${SHOP}`, storeCurrency: "GBP", autoCashbackProcessingEnabled: auto },
  });
  const gold = await prisma.tier.create({ data: { id: "gold", shop: SHOP, name: "Gold", minSpend: 0, cashbackPercent: 5 } });
  return prisma.customer.create({ data: { shop: SHOP, shopifyCustomerId: CUSTOMER, email: "carol@example.test", currentTierId: gold.id } });
}

/** A paid £100 order with £5.00 cashback, issued (SYNCED) or pending, recorded 10 minutes ago. */
async function seedOrder(cashback: "issued" | "pending", { auto = false } = {}) {
  const customer = await seedShop({ auto });
  const issued = cashback === "issued";
  await prisma.customer.update({ where: { id: customer.id }, data: { storeCredit: issued ? 5 : 0 } });
  const order = await prisma.order.create({
    data: {
      shop: SHOP,
      shopifyOrderId: String(ORDER),
      shopifyOrderNumber: "1",
      shopifyOrderName: "#1",
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
      shopifyCreatedAt: new Date(Date.now() - 3_600_000),
      shopifyUpdatedAt: new Date(Date.now() - 3_600_000),
    },
  });
  await prisma.storeCreditLedger.create({
    data: {
      shop: SHOP,
      customerId: customer.id,
      orderId: order.id,
      shopifyOrderId: order.shopifyOrderId,
      type: "CASHBACK_EARNED",
      amount: 5,
      balance: 5,
      metadata: { orderName: "#1", description: "5% cashback on order #1", syncStatus: issued ? "SYNCED" : "PENDING" },
      createdAt: new Date(Date.now() - 10 * 60_000),
    },
  });
  return order;
}

type ShopifyRefund = { id: number; amount: string };

/** The order as Shopify's Admin API returns it to the background order sync. */
function shopifyOrder(refunds: ShopifyRefund[]) {
  const refunded = refunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
  const money = (amount: number | string) => ({ shopMoney: { amount: Number(amount).toFixed(2), currencyCode: "GBP" } });
  return {
    id: `gid://shopify/Order/${ORDER}`,
    name: "#1",
    email: "carol@example.test",
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    updatedAt: new Date().toISOString(),
    processedAt: new Date(Date.now() - 3_600_000).toISOString(),
    currencyCode: "GBP",
    subtotalPriceSet: money(100),
    totalDiscountsSet: money(0),
    totalShippingPriceSet: money(0),
    totalTaxSet: money(0),
    totalPriceSet: money(100),
    totalRefundedSet: money(refunded),
    netPaymentSet: money(100 - refunded),
    displayFinancialStatus: refunded >= 100 ? "REFUNDED" : refunded > 0 ? "PARTIALLY_REFUNDED" : "PAID",
    displayFulfillmentStatus: "UNFULFILLED",
    customer: { id: `gid://shopify/Customer/${CUSTOMER}`, email: "carol@example.test" },
    lineItems: { edges: [] },
    refunds: refunds.map((refund) => ({
      id: `gid://shopify/Refund/${refund.id}`,
      createdAt: new Date().toISOString(),
      note: null,
      refundLineItems: { edges: [] },
      totalRefundedSet: money(refund.amount),
    })),
  };
}

/** The background order-sync job (orders-sync page), run to completion against Shopify's `refunds`. */
async function backgroundSync(refunds: ShopifyRefund[]) {
  const link = graphql.link(ADMIN);
  server.use(
    link.query("getOrderCount", () => HttpResponse.json({ data: { ordersCount: { count: 1 } } })),
    link.query("getOrders", () =>
      HttpResponse.json({
        data: { orders: { edges: [{ cursor: "c1", node: shopifyOrder(refunds) }], pageInfo: { hasNextPage: false, endCursor: "c1" } } },
      }),
    ),
  );
  const { admin } = await unauthenticated.admin(SHOP);
  const job = await startOrderSyncJob(SHOP, admin, "test");
  return processOrderBatch(job.jobId, admin);
}

/** What the background job wrote before this fix: Shopify's totals, no refund rows (still in databases). */
async function totalsOnly(refunded: number) {
  await prisma.order.update({
    where: { shop_shopifyOrderId: { shop: SHOP, shopifyOrderId: String(ORDER) } },
    data: { totalRefunded: refunded, netAmount: 100 - refunded, financialStatus: refunded >= 100 ? "REFUNDED" : "PARTIALLY_REFUNDED" },
  });
}

/** Shopify's answer to the transaction analyzer orders/paid runs: one £100 card payment. */
function mockOrderPayments() {
  server.use(
    graphql.link(ADMIN).query("GetOrderPaymentDetails", ({ variables }) =>
      HttpResponse.json({
        data: {
          order: {
            id: variables.id,
            totalReceivedSet: { shopMoney: { amount: "100.00", currencyCode: "GBP" } },
            transactions: [
              { id: "gid://shopify/OrderTransaction/1", gateway: "shopify_payments", status: "SUCCESS", kind: "SALE", amountSet: { shopMoney: { amount: "100.00", currencyCode: "GBP" } }, parentTransaction: null },
            ],
          },
        },
      }),
    ),
  );
}

/** orders/paid for the order, as Shopify delivers it (its status as of delivery). */
function deliverPaid(financialStatus = "paid") {
  const payload = {
    id: ORDER, name: "#1", order_number: 1, email: "carol@example.test",
    created_at: new Date(Date.now() - 3_600_000).toISOString(), updated_at: new Date().toISOString(), processed_at: new Date().toISOString(),
    currency: "GBP", financial_status: financialStatus, test: false, total_price: "100.00", subtotal_price: "100.00", total_discounts: "0.00", total_tax: "0.00",
    total_price_set: { shop_money: { amount: "100.00", currency_code: "GBP" }, presentment_money: { amount: "100.00", currency_code: "GBP" } },
    customer: { id: Number(CUSTOMER), email: "carol@example.test", first_name: "Carol", last_name: "C" },
    line_items: [{ id: 1, product_id: 11, variant_id: 12, sku: null, title: "Booster Box", price: "100.00", quantity: 1, gift_card: false }],
    discount_applications: [], payment_gateway_names: ["shopify_payments"],
  };
  return ordersPaid({ request: signedWebhook("orders/paid", SHOP, payload, "wh-paid"), params: {}, context: {} });
}

function refundDelivery(id: number, amount: string, webhookId = `wh-${id}`) {
  const payload = {
    id,
    order_id: ORDER,
    created_at: new Date().toISOString(),
    refund_line_items: [],
    transactions: [{ kind: "refund", status: "success", amount, currency: "GBP" }],
  };
  return refundsCreate({ request: signedWebhook("refunds/create", SHOP, payload, webhookId), params: {}, context: {} });
}

function runCron() {
  return reconcile({
    request: new Request("https://test.example.com/api/cron/cashback-reconciliation", { headers: { Authorization: `Bearer ${CRON_SECRET}` } }),
    params: {},
    context: {},
  });
}

const order = () => prisma.order.findUniqueOrThrow({ where: { shop_shopifyOrderId: { shop: SHOP, shopifyOrderId: String(ORDER) } } });
const refundRow = async (id: number) => prisma.orderRefund.findFirstOrThrow({ where: { shopifyRefundId: String(id) } });
const money = (calls: Array<{ operation: string; amount: string }>) => calls.map((c) => `${c.operation} ${c.amount}`);

/** What the ledger says the shopper was credited for the order, net of debits Shopify confirmed. */
async function ledgerNet(): Promise<string> {
  const entries = await prisma.storeCreditLedger.findMany({ where: { shop: SHOP, type: { in: ["CASHBACK_EARNED", "REFUND_CLAWBACK"] } } });
  const synced = entries.filter((entry) => (entry.metadata as { syncStatus?: string } | null)?.syncStatus === "SYNCED");
  return synced.reduce((sum, entry) => sum + Number(entry.amount), 0).toFixed(2);
}

describe.skipIf(!hasTestDatabase)("refunds the app learns of through an order sync", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedOfflineSession(SHOP);
    process.env.CRON_SECRET = CRON_SECRET;
    for (const level of ["log", "info", "debug", "warn"] as const) vi.spyOn(console, level).mockImplementation(() => {});
  });

  it("a refunded total copied without its row (the job before this fix), the cron, then refunds/create: one share taken", async () => {
    await seedOrder("pending", { auto: true });
    const balances = { [CUSTOMER]: 0 };
    const calls = mockStoreCredit(SHOP, balances);
    await totalsOnly(30);
    await expect((await runCron()).json()).resolves.toMatchObject({ synced: 1 });

    const response = await refundDelivery(77, "30.00");
    expect(response.status).toBe(200);

    expect(money(calls)).toEqual(["credit 3.50"]);
    expect(balances[CUSTOMER]).toBe(3.5);
    await expect(ledgerNet()).resolves.toBe("3.50");
    expect((await order()).totalRefunded.toFixed(2)).toBe("30.00");
    // The share the cron took is the refund's
    expect((await refundRow(77)).cashbackAdjustment?.toFixed(2)).toBe("1.50");
  });

  describe("cashback issued before the sync saw the refund", () => {
    for (const sync of ["totals only"] as const) {
      const seen = (refunds: ShopifyRefund[]) =>
        sync === "totals only" ? totalsOnly(refunds.reduce((sum, r) => sum + Number(r.amount), 0)) : backgroundSync(refunds);

      it(`reverses the refund's share once (${sync})`, async () => {
        await seedOrder("issued");
        const balances = { [CUSTOMER]: 5 };
        const calls = mockStoreCredit(SHOP, balances);
        await seen([{ id: 77, amount: "30.00" }]);

        expect((await refundDelivery(77, "30.00")).status).toBe(200);
        expect((await refundDelivery(77, "30.00", "wh-77-again")).status).toBe(200);

        expect(money(calls)).toEqual(["debit 1.50"]);
        expect(balances[CUSTOMER]).toBe(3.5);
        await expect(ledgerNet()).resolves.toBe("3.50");
        expect((await order()).totalRefunded.toFixed(2)).toBe("30.00");
      });

      it(`a half refund the sync counted does not complete the order (${sync})`, async () => {
        await seedOrder("issued");
        const balances = { [CUSTOMER]: 5 };
        const calls = mockStoreCredit(SHOP, balances);
        await seen([{ id: 77, amount: "50.00" }]);

        expect((await refundDelivery(77, "50.00")).status).toBe(200);
        let after = await order();
        expect({ refunded: after.totalRefunded.toFixed(2), status: after.financialStatus, eligible: after.cashbackEligible }).toEqual({
          refunded: "50.00",
          status: "PARTIALLY_REFUNDED",
          eligible: true,
        });
        expect(money(calls)).toEqual(["debit 2.50"]);

        // The other half, which no sync saw, completes it
        expect((await refundDelivery(78, "50.00")).status).toBe(200);
        after = await order();
        expect({ refunded: after.totalRefunded.toFixed(2), status: after.financialStatus }).toEqual({ refunded: "100.00", status: "REFUNDED" });
        expect(money(calls)).toEqual(["debit 2.50", "debit 2.50"]);
        expect(balances[CUSTOMER]).toBe(0);
        await expect(ledgerNet()).resolves.toBe("0.00");
      });
    }
  });

  it("orders/paid nets a refund the sync imported first, and its refunds/create takes nothing more", async () => {
    await seedShop({ auto: true });
    mockOrderPayments();
    const balances = { [CUSTOMER]: 0 };
    const calls = mockStoreCredit(SHOP, balances);
    // The sync creates the order with its refund before orders/paid is processed
    await expect(backgroundSync([{ id: 77, amount: "30.00" }])).resolves.toMatchObject({ progress: { createdCount: 1 } });
    expect((await deliverPaid("partially_refunded")).status).toBe(200);
    expect(await refundRow(77)).toMatchObject({ processedAt: null, cashbackProcessed: true });
    expect((await refundRow(77)).cashbackAdjustment?.toFixed(2)).toBe("1.50");

    expect((await refundDelivery(77, "30.00")).status).toBe(200);

    expect(money(calls)).toEqual(["credit 3.50"]);
    expect(balances[CUSTOMER]).toBe(3.5);
    await expect(ledgerNet()).resolves.toBe("3.50");
    expect((await order()).totalRefunded.toFixed(2)).toBe("30.00");
  });

  it("an order the sync created refunded in full: orders/paid records nothing, and its refunds/create notes the share once", async () => {
    await seedShop({ auto: true });
    mockOrderPayments();
    const balances = { [CUSTOMER]: 0 };
    const calls = mockStoreCredit(SHOP, balances);
    // Cancelled and refunded in Shopify before orders/paid was processed; the
    // sync creates the order with its refund row and a history record
    await expect(backgroundSync([{ id: 77, amount: "100.00" }])).resolves.toMatchObject({ progress: { createdCount: 1 } });
    expect((await deliverPaid("refunded")).status).toBe(200);
    await expect(prisma.storeCreditLedger.count({ where: { shop: SHOP, shopifyOrderId: String(ORDER) } })).resolves.toBe(0);

    expect((await refundDelivery(77, "100.00")).status).toBe(200);

    expect(calls).toEqual([]);
    // The 100% refund's share is the 5.00 cashback, noted once (orders/paid recorded no entry to note it on)
    expect((await refundRow(77)).cashbackAdjustment?.toFixed(2)).toBe("5.00");
    const after = await order();
    expect({ refunded: after.totalRefunded.toFixed(2), status: after.financialStatus, cashback: after.cashbackAmount?.toFixed(2) }).toEqual({
      refunded: "100.00",
      status: "REFUNDED",
      cashback: "0.00",
    });
  });
});
