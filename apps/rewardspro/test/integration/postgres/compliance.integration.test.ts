import { beforeEach, describe, expect, it, vi } from "vitest";

// Shopify verifies the HMAC; here the authenticated webhook is injected.
const webhook = vi.hoisted(() => ({ next: null as null | { topic: string; shop: string; payload: unknown } }));
vi.mock("~/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(async () => {
      if (!webhook.next) throw new Response("Unauthorized", { status: 401 });
      return webhook.next;
    }),
  },
}));

import prisma from "~/db.server";
import { action } from "~/routes/webhooks.compliance";
import { action as appUninstalled } from "~/routes/webhooks.app.uninstalled";
import { readDataRequestReport } from "~/services/customer-data-request.server";
import { getShopDataCounts } from "~/services/shop-data-cleanup.server";
import { hasTestDatabase, resetDatabase } from "./database";

const SHOP = "redact-me.myshopify.com";
const OTHER_SHOP = "keep-me.myshopify.com";

/** A shop with two customers and data in the tables erasure must reach. */
async function seedShop(shop: string) {
  const tag = shop.split(".")[0];
  await prisma.shopSettings.create({ data: { shop, storeName: tag, storeUrl: `https://${shop}` } });
  await prisma.shopEntitlements.create({ data: { shop } });
  // Integration OAuth tokens are shop data too
  await prisma.integration.create({
    data: { shop, provider: "KLAVIYO", name: "Klaviyo", accessToken: "encrypted-access", refreshToken: "encrypted-refresh" },
  });
  await prisma.session.create({
    data: { id: `offline_${shop}`, shop, state: "s", accessToken: "encrypted" },
  });
  const tier = await prisma.tier.create({
    data: { id: `${tag}-gold`, shop, name: "Gold", minSpend: 0, cashbackPercent: 5 },
  });
  const tierProduct = await prisma.tierProduct.create({
    data: {
      shop,
      tierId: tier.id,
      shopifyProductId: "1",
      shopifyVariantId: "2",
      productHandle: "gold",
      sku: "GOLD",
      purchaseType: "ONE_TIME",
      price: 10,
    },
  });

  const customers = [];
  for (const [n, email] of [
    [1, `alice@${tag}.test`],
    [2, `bob@${tag}.test`],
  ] as const) {
    const customer = await prisma.customer.create({
      data: { shop, shopifyCustomerId: `${n}00`, email, currentTierId: tier.id, storeCredit: 5 },
    });
    await prisma.customerTierState.create({ data: { shop, customerId: customer.id, effectiveTierId: tier.id } });
    const order = await prisma.order.create({
      data: {
        shop,
        shopifyOrderId: `${tag}-order-${n}`,
        shopifyOrderNumber: `100${n}`,
        shopifyOrderName: `#100${n}`,
        customerId: customer.id,
        email,
        currency: "GBP",
        subtotalPrice: 100,
        totalDiscounts: 0,
        totalShipping: 0,
        totalTax: 0,
        totalPrice: 100,
        netAmount: 100,
        financialStatus: "PAID",
        shopifyCreatedAt: new Date(),
        shopifyUpdatedAt: new Date(),
        lineItems: {
          create: { shopifyLineItemId: `${tag}-li-${n}`, title: "Booster", quantity: 1, price: 100, totalPrice: 100, totalDiscount: 0 },
        },
        refunds: {
          create: { shopifyRefundId: `${tag}-refund-${n}`, amount: 10, shippingAmount: 0, taxAmount: 0, shopifyCreatedAt: new Date() },
        },
      },
    });
    await prisma.storeCreditLedger.create({
      data: { shop, customerId: customer.id, orderId: order.id, amount: 5, balance: 5, type: "CASHBACK_EARNED", shopifyOrderId: order.shopifyOrderId },
    });
    await prisma.tierPurchase.create({
      data: {
        shop,
        customerId: customer.id,
        tierId: tier.id,
        tierProductId: tierProduct.id,
        shopifyOrderId: order.shopifyOrderId,
        shopifyLineItemId: `${tag}-li-${n}`,
        purchasePrice: 10,
        currency: "GBP",
        startDate: new Date(),
      },
    });
    await prisma.tierChangeLog.create({
      data: { shop, customerId: customer.id, toTierId: tier.id, changeType: "INITIAL_ASSIGNMENT", triggerType: "SPENDING_MILESTONE" },
    });
    await prisma.pointsLedger.create({ data: { shop, customerId: customer.id, amount: 10, balance: 10, type: "ORDER_EARNED" } });
    // Email-keyed traces without a foreign key to Customer
    await prisma.emailEvent.create({ data: { shop, customerEmail: email.toUpperCase(), eventType: "delivered" } });
    await prisma.pendingAutomation.create({
      data: {
        shop,
        automationId: "a",
        automationName: "Welcome",
        templateId: "t",
        recipientEmail: email,
        triggerType: "welcome",
        executeAt: new Date(),
      },
    });
    await prisma.klaviyoProfile.create({
      data: { shop, customerId: customer.id, klaviyoProfileId: `${tag}-kp-${n}`, email },
    });
    await prisma.klaviyoEvent.create({
      data: { shop, eventType: "Placed Order", uniqueId: `${tag}-ke-${n}`, metricName: "Placed Order", customerEmail: email, eventProperties: {}, eventTime: new Date() },
    });
    await prisma.issuedGiftCard.create({
      data: { shop, shopifyGiftCardId: `${tag}-gc-${n}`, initialValue: 10, totalValue: 10, purchasedByEmail: email },
    });
    customers.push(customer);
  }
  await prisma.webhookProcessed.create({ data: { shop, topic: "ORDERS_PAID", webhookId: `${tag}-wh` } });
  return customers;
}

function deliver(topic: string, shop: string, payload: unknown) {
  webhook.next = { topic, shop, payload };
  return action({
    request: new Request("https://example.test/webhooks/compliance", { method: "POST" }),
    params: {},
    context: {},
  });
}

function total(counts: Record<string, number>) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

describe.skipIf(!hasTestDatabase)("compliance webhooks on Postgres", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("customers/redact erases one shopper everywhere, including email-only traces", async () => {
    const [alice, bob] = await seedShop(SHOP);
    await seedShop(OTHER_SHOP);
    const otherBefore = await getShopDataCounts(OTHER_SHOP);

    const response = await deliver("CUSTOMERS_REDACT", SHOP, {
      shop_id: 1,
      shop_domain: SHOP,
      customer: { id: 100, email: alice.email },
      orders_to_redact: [],
    });

    expect(response.status).toBe(200);
    await expect(prisma.customer.findUnique({ where: { id: alice.id } })).resolves.toBeNull();
    for (const count of [
      prisma.order.count({ where: { customerId: alice.id } }),
      prisma.storeCreditLedger.count({ where: { customerId: alice.id } }),
      prisma.tierPurchase.count({ where: { customerId: alice.id } }),
      prisma.pointsLedger.count({ where: { customerId: alice.id } }),
      prisma.klaviyoProfile.count({ where: { customerId: alice.id } }),
      prisma.emailEvent.count({ where: { shop: SHOP, customerEmail: alice.email.toUpperCase() } }),
      prisma.pendingAutomation.count({ where: { shop: SHOP, recipientEmail: alice.email } }),
    ]) {
      await expect(count).resolves.toBe(0);
    }

    // The other shopper and the other shop are untouched
    await expect(prisma.order.count({ where: { customerId: bob.id } })).resolves.toBe(1);
    await expect(prisma.emailEvent.count({ where: { shop: SHOP } })).resolves.toBe(1);
    await expect(getShopDataCounts(OTHER_SHOP)).resolves.toEqual(otherBefore);
  });

  it("customers/redact for a shopper never synced still removes their email traces", async () => {
    await seedShop(SHOP);
    await prisma.emailEvent.create({ data: { shop: SHOP, customerEmail: "ghost@example.test", eventType: "bounce" } });

    const response = await deliver("CUSTOMERS_REDACT", SHOP, {
      shop_id: 1,
      shop_domain: SHOP,
      customer: { id: 999, email: "Ghost@Example.test" },
      orders_to_redact: [],
    });

    expect(response.status).toBe(200);
    await expect(prisma.emailEvent.count({ where: { customerEmail: "ghost@example.test" } })).resolves.toBe(0);
    await expect(prisma.customer.count({ where: { shop: SHOP } })).resolves.toBe(2);
  });

  it("customers/data_request stores an encrypted report of every record, for the merchant only", async () => {
    const [alice, bob] = await seedShop(SHOP);
    const logs: string[] = [];
    vi.mocked(console.log).mockImplementation((...args: unknown[]) => void logs.push(args.join(" ")));
    const before = await getShopDataCounts(SHOP);

    const response = await deliver("CUSTOMERS_DATA_REQUEST", SHOP, {
      shop_id: 1,
      shop_domain: SHOP,
      orders_requested: [],
      customer: { id: 100, email: alice.email },
      data_request: { id: 7 },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, processed: "CUSTOMERS_DATA_REQUEST" });
    const stored = await prisma.customerDataRequest.findFirstOrThrow({ where: { shop: SHOP, shopifyRequestId: "7" } });
    // Encrypted at rest
    expect(stored.report).not.toContain(alice.email);
    expect(stored.downloadedAt).toBeNull();

    // Another shop cannot read it
    await expect(readDataRequestReport(OTHER_SHOP, stored.id)).resolves.toBeNull();
    const download = await readDataRequestReport(SHOP, stored.id);
    const report = JSON.parse(download!.json);
    expect(report.customerFound).toBe(true);
    for (const model of ["Customer", "Order", "OrderLineItem", "OrderRefund", "StoreCreditLedger", "TierPurchase", "PointsLedger", "KlaviyoProfile", "KlaviyoEvent", "EmailEvent", "PendingAutomation", "IssuedGiftCard"]) {
      expect(report.records[model]?.length, model).toBeGreaterThan(0);
    }
    expect(report.records.Customer[0].email).toBe(alice.email);
    expect(JSON.stringify(report)).not.toContain(bob.email);
    expect(stored.recordCount).toBe(Object.values(report.records as Record<string, unknown[]>).flat().length);
    await expect(prisma.customerDataRequest.findUniqueOrThrow({ where: { id: stored.id } })).resolves.toMatchObject({ downloadedAt: expect.any(Date) });

    // Nothing personal in the logs, and nothing else changed
    expect(logs.join("\n")).not.toContain(alice.email);
    expect(logs.join("\n")).not.toContain('"100"');
    const after = await getShopDataCounts(SHOP);
    expect({ ...after, CustomerDataRequest: 0 }).toEqual({ ...before, CustomerDataRequest: 0 });
  });

  it("customers/data_request for an unknown shopper reports their email-only traces", async () => {
    await seedShop(SHOP);
    await prisma.emailEvent.create({ data: { shop: SHOP, customerEmail: "ghost@example.test", eventType: "bounce" } });

    const response = await deliver("CUSTOMERS_DATA_REQUEST", SHOP, {
      shop_id: 1,
      shop_domain: SHOP,
      orders_requested: [],
      customer: { id: 999, email: "Ghost@Example.test" },
      data_request: { id: 8 },
    });

    expect(response.status).toBe(200);
    const stored = await prisma.customerDataRequest.findFirstOrThrow({ where: { shopifyRequestId: "8" } });
    const report = JSON.parse((await readDataRequestReport(SHOP, stored.id))!.json);
    expect(report.customerFound).toBe(false);
    expect(Object.keys(report.records)).toEqual(["EmailEvent"]);
  });

  it("customers/data_request answers 5xx when the report cannot be stored", async () => {
    const [alice] = await seedShop(SHOP);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = process.env.ENCRYPTION_SECRET;
    delete process.env.ENCRYPTION_SECRET;
    try {
      const response = await deliver("CUSTOMERS_DATA_REQUEST", SHOP, {
        shop_id: 1,
        shop_domain: SHOP,
        orders_requested: [],
        customer: { id: 100, email: alice.email },
        data_request: { id: 9 },
      });
      expect(response.status).toBe(500);
    } finally {
      process.env.ENCRYPTION_SECRET = secret;
    }
    await expect(prisma.customerDataRequest.count()).resolves.toBe(0);
  });

  it("customers/redact also removes the shopper's stored data request reports", async () => {
    const [alice] = await seedShop(SHOP);
    await deliver("CUSTOMERS_DATA_REQUEST", SHOP, {
      shop_id: 1,
      shop_domain: SHOP,
      orders_requested: [],
      customer: { id: 100, email: alice.email },
      data_request: { id: 10 },
    });
    await expect(prisma.customerDataRequest.count()).resolves.toBe(1);

    await deliver("CUSTOMERS_REDACT", SHOP, { shop_id: 1, shop_domain: SHOP, customer: { id: 100, email: alice.email }, orders_to_redact: [] });

    await expect(prisma.customerDataRequest.count()).resolves.toBe(0);
    await expect(prisma.issuedGiftCard.count({ where: { shop: SHOP, purchasedByEmail: alice.email } })).resolves.toBe(0);
    await expect(prisma.klaviyoEvent.count({ where: { shop: SHOP, customerEmail: alice.email } })).resolves.toBe(0);
  });

  it("shop/redact erases every shop-scoped row for that shop only", async () => {
    await seedShop(SHOP);
    await seedShop(OTHER_SHOP);
    await prisma.cronLock.create({ data: { jobName: "metrics", expiresAt: new Date(Date.now() + 60_000) } });
    const otherBefore = await getShopDataCounts(OTHER_SHOP);
    expect(total(await getShopDataCounts(SHOP))).toBeGreaterThan(20);

    const response = await deliver("SHOP_REDACT", SHOP, { shop_id: 1, shop_domain: SHOP });

    expect(response.status).toBe(200);
    expect(total(await getShopDataCounts(SHOP))).toBe(0);
    // Children without a shop column went with their parents
    await expect(prisma.orderLineItem.count({ where: { order: { shop: SHOP } } })).resolves.toBe(0);
    await expect(prisma.orderRefund.count()).resolves.toBe(2);
    await expect(getShopDataCounts(OTHER_SHOP)).resolves.toEqual(otherBefore);
    await expect(prisma.cronLock.count()).resolves.toBe(1);
    await expect(prisma.integration.count({ where: { shop: SHOP } })).resolves.toBe(0);
  });

  it("app/uninstalled runs the same erasure as shop/redact", async () => {
    await seedShop(SHOP);
    await seedShop(OTHER_SHOP);
    const otherBefore = await getShopDataCounts(OTHER_SHOP);

    webhook.next = { topic: "APP_UNINSTALLED", shop: SHOP, payload: {} };
    const response = await appUninstalled({
      request: new Request("https://example.test/webhooks/app/uninstalled", { method: "POST" }),
      params: {},
      context: {},
    });

    expect(response.status).toBe(200);
    expect(total(await getShopDataCounts(SHOP))).toBe(0);
    await expect(prisma.integration.count({ where: { shop: SHOP } })).resolves.toBe(0);
    await expect(getShopDataCounts(OTHER_SHOP)).resolves.toEqual(otherBefore);
  });

  it("answers 5xx when redaction fails, so Shopify redelivers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await deliver("SHOP_REDACT", "not-a-shop-domain", { shop_id: 1, shop_domain: "x" });
    expect(response.status).toBe(500);
  });

  it("rejects an unauthenticated delivery with 401", async () => {
    webhook.next = null;
    const response = await action({
      request: new Request("https://example.test/webhooks/compliance", { method: "POST" }),
      params: {},
      context: {},
    });
    expect(response.status).toBe(401);
  });
});
