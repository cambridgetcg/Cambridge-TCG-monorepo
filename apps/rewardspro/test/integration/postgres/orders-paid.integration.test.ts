import { beforeEach, describe, expect, it, vi } from "vitest";

// The Shopify boundary: an authenticated webhook and the Admin GraphQL call
// the transaction analyzer makes. Everything else runs against Postgres.
const shopify = vi.hoisted(() => ({
  payload: null as Record<string, unknown> | null,
  graphql: vi.fn(),
}));
vi.mock("~/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(async () => ({
      shop: SHOP,
      topic: "ORDERS_PAID",
      payload: shopify.payload,
      admin: { graphql: shopify.graphql },
    })),
  },
  unauthenticated: {},
}));
// No mail leaves the test
vi.mock("~/services/email-notifications.server", () => ({
  sendTierUpgradeEmailNotification: vi.fn(),
  sendTierDowngradeEmailNotification: vi.fn(),
}));

import prisma from "~/db.server";
import { action } from "~/routes/webhooks.orders.paid";
import { hasTestDatabase, resetDatabase } from "./database";

const SHOP = "cashback-test.myshopify.com";

function paidOrder(overrides: { id?: number; customer?: Record<string, unknown> | null } = {}) {
  const id = overrides.id ?? 5550001;
  return {
    id,
    name: `#${id}`,
    order_number: id,
    email: "alice@example.test",
    created_at: "2026-10-18T10:00:00Z",
    updated_at: "2026-10-18T10:00:05Z",
    processed_at: "2026-10-18T10:00:00Z",
    currency: "GBP",
    financial_status: "paid",
    test: false,
    total_price: "100.00",
    subtotal_price: "100.00",
    total_discounts: "0.00",
    total_tax: "0.00",
    total_price_set: {
      shop_money: { amount: "100.00", currency_code: "GBP" },
      presentment_money: { amount: "100.00", currency_code: "GBP" },
    },
    customer:
      overrides.customer === undefined
        ? { id: 100, email: "alice@example.test", first_name: "Alice", last_name: "Archer" }
        : overrides.customer,
    // A line item without a SKU: the deleted diagnostic lookup failed on this
    line_items: [
      { id: 1, product_id: 11, variant_id: 12, sku: null, title: "Booster Box", price: "100.00", quantity: 1, gift_card: false },
    ],
    discount_applications: [],
    payment_gateway_names: ["shopify_payments"],
  };
}

function cardPaymentResponse(orderId: number) {
  return {
    json: async () => ({
      data: {
        order: {
          id: `gid://shopify/Order/${orderId}`,
          totalReceivedSet: { shopMoney: { amount: "100.00", currencyCode: "GBP" } },
          transactions: [
            {
              id: "gid://shopify/OrderTransaction/1",
              gateway: "shopify_payments",
              status: "SUCCESS",
              kind: "SALE",
              amountSet: { shopMoney: { amount: "100.00", currencyCode: "GBP" } },
              parentTransaction: null,
            },
          ],
        },
      },
    }),
  };
}

function deliver(webhookId: string, payload: Record<string, unknown>) {
  shopify.payload = payload;
  return action({
    request: new Request("https://example.test/webhooks/orders/paid", {
      method: "POST",
      headers: { "X-Shopify-Webhook-Id": webhookId },
    }),
    params: {},
    context: {},
  });
}

async function seedShop() {
  // Auto-processing off: cashback is recorded as PENDING for the
  // reconciliation cron, and no store credit call is made here.
  await prisma.shopSettings.create({
    data: { shop: SHOP, storeName: "Cashback Test", storeUrl: `https://${SHOP}`, storeCurrency: "GBP", autoCashbackProcessingEnabled: false },
  });
  const bronze = await prisma.tier.create({
    data: { id: "bronze", shop: SHOP, name: "Bronze", minSpend: 0, cashbackPercent: 2 },
  });
  const gold = await prisma.tier.create({
    data: { id: "gold", shop: SHOP, name: "Gold", minSpend: 10_000, cashbackPercent: 5 },
  });
  return { bronze, gold };
}

describe.skipIf(!hasTestDatabase)("orders/paid on Postgres", () => {
  beforeEach(async () => {
    await resetDatabase();
    shopify.graphql.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  it("records the order and a PENDING cashback entry, then marks the delivery processed", async () => {
    const { gold } = await seedShop();
    const customer = await prisma.customer.create({
      data: { shop: SHOP, shopifyCustomerId: "100", email: "alice@example.test", currentTierId: gold.id, storeCredit: 1.5 },
    });
    shopify.graphql.mockResolvedValue(cardPaymentResponse(5550001));

    const response = await deliver("wh-1", paidOrder());

    expect(response.status).toBe(200);
    const order = await prisma.order.findFirstOrThrow({ where: { shop: SHOP, shopifyOrderId: "5550001" } });
    expect(order.customerId).toBe(customer.id);

    const [entry] = await prisma.storeCreditLedger.findMany({ where: { customerId: customer.id } });
    expect(entry.type).toBe("CASHBACK_EARNED");
    expect(entry.amount.toFixed(2)).toBe("5.00");
    // Decimal arithmetic: 1.50 + 5.00, not the string concatenation "1.55"
    expect(entry.balance.toFixed(2)).toBe("6.50");
    expect(entry.metadata).toMatchObject({ syncStatus: "PENDING" });

    // Not issued yet, so the local balance waits for Shopify
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(after.storeCredit.toFixed(2)).toBe("1.50");
    expect(after.totalSpent.toFixed(2)).toBe("100.00");

    await expect(prisma.webhookProcessed.count({ where: { webhookId: "wh-1" } })).resolves.toBe(1);
    await expect(prisma.webhookError.count()).resolves.toBe(0);
  });

  it("acknowledges a redelivered webhook without processing it again", async () => {
    const { gold } = await seedShop();
    await prisma.customer.create({
      data: { shop: SHOP, shopifyCustomerId: "100", email: "alice@example.test", currentTierId: gold.id },
    });
    shopify.graphql.mockResolvedValue(cardPaymentResponse(5550001));
    await deliver("wh-1", paidOrder());
    shopify.graphql.mockClear();

    const response = await deliver("wh-1", paidOrder());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ message: "Already processed" });
    expect(shopify.graphql).not.toHaveBeenCalled();
    await expect(prisma.storeCreditLedger.count()).resolves.toBe(1);
  });

  it("writes no idempotency row when processing fails, so the redelivery completes the cashback", async () => {
    const { gold } = await seedShop();
    const customer = await prisma.customer.create({
      data: { shop: SHOP, shopifyCustomerId: "100", email: "alice@example.test", currentTierId: gold.id },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Shopify's Admin API is down for the first delivery
    shopify.graphql.mockRejectedValue(new Error("fetch failed"));
    const failed = await deliver("wh-1", paidOrder());

    expect(failed.status).toBe(500);
    await expect(prisma.webhookProcessed.count()).resolves.toBe(0);
    await expect(prisma.storeCreditLedger.count()).resolves.toBe(0);

    shopify.graphql.mockResolvedValue(cardPaymentResponse(5550001));
    const retried = await deliver("wh-1", paidOrder());

    expect(retried.status).toBe(200);
    const entries = await prisma.storeCreditLedger.findMany({ where: { customerId: customer.id } });
    expect(entries.map((e) => e.amount.toFixed(2))).toEqual(["5.00"]);
    await expect(prisma.order.count({ where: { shop: SHOP } })).resolves.toBe(1);
    await expect(prisma.webhookProcessed.count({ where: { webhookId: "wh-1" } })).resolves.toBe(1);
  });

  it("creates a first-time customer before their order and pays cashback at the tier the order reaches", async () => {
    await seedShop();
    shopify.graphql.mockResolvedValue(cardPaymentResponse(5550002));

    const response = await deliver("wh-2", paidOrder({ id: 5550002 }));

    expect(response.status).toBe(200);
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { shop_shopifyCustomerId: { shop: SHOP, shopifyCustomerId: "100" } },
    });
    expect(customer.currentTierId).toBe("bronze");
    const order = await prisma.order.findFirstOrThrow({ where: { shopifyOrderId: "5550002" } });
    expect(order.customerId).toBe(customer.id);
    const [entry] = await prisma.storeCreditLedger.findMany({ where: { customerId: customer.id } });
    expect(entry.amount.toFixed(2)).toBe("2.00");
  });

  it("records nothing for a guest checkout", async () => {
    await seedShop();

    const response = await deliver("wh-3", paidOrder({ id: 5550003, customer: null }));

    expect(response.status).toBe(200);
    expect(shopify.graphql).not.toHaveBeenCalled();
    await expect(prisma.order.count()).resolves.toBe(0);
    await expect(prisma.customer.count()).resolves.toBe(0);
  });
});
