import { graphql, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

// No mail leaves the test (orders/paid sends tier notices)
vi.mock("~/services/email-notifications.server", () => ({
  sendTierUpgradeEmailNotification: vi.fn(),
  sendTierDowngradeEmailNotification: vi.fn(),
}));

import prisma from "~/db.server";
import { loader as reconcile } from "~/routes/api.cron.cashback-reconciliation";
import { action as ordersPaid } from "~/routes/webhooks.orders.paid";
import { action as refundsCreate } from "~/routes/webhooks.orders.refunded";
import { issueCashbackByHand } from "~/services/cashback-ledger.server";
import { unauthenticated } from "~/shopify.server";
import { server } from "../../mocks/server";
import { hasTestDatabase, resetDatabase } from "./database";
import { mockStoreCredit, seedOfflineSession, signedWebhook } from "./shopify";

/**
 * Shopify can apply a store-credit credit or debit and still answer with an
 * error: HTTP 200 with a top-level INTERNAL_SERVER_ERROR (its GraphQL form of
 * a 500), or a 502. The real Admin client throws for both (GraphqlQueryError;
 * an HttpInternalError, which the webhook context rethrows as a Response).
 * Each writer must leave the entry SYNCING and unconfirmed and never send it
 * again. Deliveries are signed, and the real authenticate.webhook and
 * unauthenticated.admin run against MSW.
 */

const SHOP = "answers.myshopify.com";
const CUSTOMER = "100";
const ORDER = 4440001;
const CRON_SECRET = "store-credit-answers-cron";
const UNCONFIRMED =
  "Shopify did not confirm this order's cashback when it was sent, so it may have been applied. Check the customer's store credit in Shopify: it is not sent again";

const ANSWERS: Array<[string, { internalErrors: number } | { badGateways: number }]> = [
  ["200 with INTERNAL_SERVER_ERROR", { internalErrors: 1 }],
  ["502", { badGateways: 1 }],
];

/** A paid £100 order with £5.00 cashback, issued (SYNCED) or still PENDING. */
async function seedOrder(cashback: "issued" | "pending", { auto = false } = {}) {
  await prisma.shopSettings.create({
    data: { shop: SHOP, storeName: "Answers", storeUrl: `https://${SHOP}`, storeCurrency: "GBP", autoCashbackProcessingEnabled: auto },
  });
  const issued = cashback === "issued";
  const customer = await prisma.customer.create({
    data: { shop: SHOP, shopifyCustomerId: CUSTOMER, email: "alice@example.test", storeCredit: issued ? 5 : 0 },
  });
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
      metadata: { orderName: "#1", description: "5% cashback on order #1", syncStatus: issued ? "SYNCED" : "PENDING" },
      // Old enough for the reconciliation cron
      createdAt: new Date(Date.now() - 10 * 60_000),
    },
  });
  return { order, entry };
}

function runCron() {
  return reconcile({
    request: new Request("https://test.example.com/api/cron/cashback-reconciliation", { headers: { Authorization: `Bearer ${CRON_SECRET}` } }),
    params: {},
    context: {},
  });
}

const refundPayload = { id: 1, order_id: ORDER, created_at: "2026-10-19T10:00:00Z", refund_line_items: [], transactions: [{ kind: "refund", status: "success", amount: "100.00", currency: "GBP" }] };

/** orders/paid as Shopify signs it: a £100 order paid by card, by a customer at the 5% tier. */
function paidOrderDelivery(webhookId: string) {
  return signedWebhook(
    "orders/paid",
    SHOP,
    {
      id: ORDER,
      name: "#1",
      order_number: 1,
      email: "alice@example.test",
      created_at: "2026-10-19T09:00:00Z",
      updated_at: "2026-10-19T09:00:05Z",
      processed_at: "2026-10-19T09:00:00Z",
      currency: "GBP",
      financial_status: "paid",
      test: false,
      total_price: "100.00",
      subtotal_price: "100.00",
      total_discounts: "0.00",
      total_tax: "0.00",
      total_price_set: { shop_money: { amount: "100.00", currency_code: "GBP" }, presentment_money: { amount: "100.00", currency_code: "GBP" } },
      customer: { id: Number(CUSTOMER), email: "alice@example.test", first_name: "Alice", last_name: "Archer" },
      line_items: [{ id: 1, product_id: 11, variant_id: 12, sku: null, title: "Booster Box", price: "100.00", quantity: 1, gift_card: false }],
      discount_applications: [],
      payment_gateway_names: ["shopify_payments"],
    },
    webhookId,
  );
}

/** The order's payments, as the transaction analyzer reads them: £100 by card. */
function mockOrderPayments() {
  server.use(
    graphql.link(`https://${SHOP}/admin/api/2025-01/graphql.json`).query("GetOrderPaymentDetails", ({ variables }) =>
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

describe.skipIf(!hasTestDatabase)("store credit Shopify applied but answered with an error", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedOfflineSession(SHOP);
    process.env.CRON_SECRET = CRON_SECRET;
    for (const level of ["log", "info", "debug", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
  });

  for (const [answer, applyThenAnswer] of ANSWERS) {
    describe(`answered ${answer}`, () => {
      it("hand issue: credits once, though the merchant retries", async () => {
        const { order, entry } = await seedOrder("pending");
        const balances = { [CUSTOMER]: 0 };
        const calls = mockStoreCredit(SHOP, balances, applyThenAnswer);
        const { admin } = await unauthenticated.admin(SHOP);
        const issue = () => issueCashbackByHand({ shop: SHOP, admin, orderId: order.id, currency: "GBP", reason: "Loyalty reward" });

        await expect(issue()).resolves.toEqual({ success: false, error: UNCONFIRMED });
        await expect(issue()).resolves.toEqual({ success: false, error: UNCONFIRMED });

        expect(calls.map((c) => `${c.operation} ${c.amount}`)).toEqual(["credit 5.00"]);
        expect(balances[CUSTOMER]).toBe(5);
        const after = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
        expect(after.metadata).toMatchObject({ syncStatus: "SYNCING", unconfirmedAt: expect.any(String) });
      });

      it("refund: debits the clawback once across Shopify's redelivery", async () => {
        await seedOrder("issued");
        // The shopper holds more credit than this order's cashback
        const balances = { [CUSTOMER]: 50 };
        const calls = mockStoreCredit(SHOP, balances, applyThenAnswer);
        const deliver = () => refundsCreate({ request: signedWebhook("refunds/create", SHOP, refundPayload, "wh-refund-1"), params: {}, context: {} });

        expect((await deliver()).status).toBe(503);
        expect((await deliver()).status).toBe(200);

        expect(calls.map((c) => `${c.operation} ${c.amount}`)).toEqual(["debit 5.00"]);
        expect(balances[CUSTOMER]).toBe(45);
        const [clawback] = await prisma.storeCreditLedger.findMany({ where: { shop: SHOP, type: "REFUND_CLAWBACK" } });
        expect(clawback.metadata).toMatchObject({ syncStatus: "SYNCING", unconfirmedAt: expect.any(String) });
      });

      it("cron: credits once, and the next run sends nothing", async () => {
        const { order, entry } = await seedOrder("pending", { auto: true });
        const balances = { [CUSTOMER]: 0 };
        const calls = mockStoreCredit(SHOP, balances, applyThenAnswer);

        await expect((await runCron()).json()).resolves.toMatchObject({ synced: 0, failed: 1 });
        await expect((await runCron()).json()).resolves.toMatchObject({ processed: 0 });

        expect(calls.map((c) => `${c.operation} ${c.amount}`)).toEqual(["credit 5.00"]);
        expect(balances[CUSTOMER]).toBe(5);
        const after = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id } });
        expect(after.metadata).toMatchObject({ syncStatus: "SYNCING", unconfirmedAt: expect.any(String) });
        await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ cashbackProcessed: false });
      });

      it("orders/paid with automatic processing, then the cron: credits once", async () => {
        await prisma.shopSettings.create({
          data: { shop: SHOP, storeName: "Answers", storeUrl: `https://${SHOP}`, storeCurrency: "GBP", autoCashbackProcessingEnabled: true },
        });
        const gold = await prisma.tier.create({ data: { id: "gold", shop: SHOP, name: "Gold", minSpend: 0, cashbackPercent: 5 } });
        await prisma.customer.create({ data: { shop: SHOP, shopifyCustomerId: CUSTOMER, email: "alice@example.test", currentTierId: gold.id } });
        mockOrderPayments();
        const balances = { [CUSTOMER]: 0 };
        const calls = mockStoreCredit(SHOP, balances, applyThenAnswer);

        expect((await ordersPaid({ request: paidOrderDelivery("wh-paid-1"), params: {}, context: {} })).status).toBe(200);
        const entry = await prisma.storeCreditLedger.findFirstOrThrow({ where: { shop: SHOP, type: "CASHBACK_EARNED" } });
        expect(entry.amount.toFixed(2)).toBe("5.00");
        expect(entry.metadata).toMatchObject({ syncStatus: "SYNCING", unconfirmedAt: expect.any(String) });

        // A duplicate delivery of the same orders/paid, and the cron's next run
        expect((await ordersPaid({ request: paidOrderDelivery("wh-paid-2"), params: {}, context: {} })).status).toBe(200);
        await prisma.storeCreditLedger.update({ where: { id: entry.id }, data: { createdAt: new Date(Date.now() - 10 * 60_000) } });
        await expect((await runCron()).json()).resolves.toMatchObject({ processed: 0 });

        expect(calls.map((c) => `${c.operation} ${c.amount}`)).toEqual(["credit 5.00"]);
        expect(balances[CUSTOMER]).toBe(5);
        await expect(prisma.storeCreditLedger.count({ where: { shop: SHOP } })).resolves.toBe(1);
        await expect(prisma.order.findFirstOrThrow({ where: { shop: SHOP } })).resolves.toMatchObject({ cashbackProcessed: false });
      });
    });
  }

  it("control: a THROTTLED credit is handed back and the next attempt credits once", async () => {
    const { order } = await seedOrder("pending");
    const balances = { [CUSTOMER]: 0 };
    const calls = mockStoreCredit(SHOP, balances, { throttled: 1 });
    const { admin } = await unauthenticated.admin(SHOP);
    const issue = () => issueCashbackByHand({ shop: SHOP, admin, orderId: order.id, currency: "GBP", reason: "Loyalty reward" });

    await expect(issue()).resolves.toEqual({ success: false, error: "Throttled" });
    await expect(issue()).resolves.toMatchObject({ success: true, amount: 5 });

    expect(calls).toHaveLength(2);
    expect(balances[CUSTOMER]).toBe(5);
  });
});
