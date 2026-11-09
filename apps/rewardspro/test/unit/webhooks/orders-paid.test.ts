/**
 * orders/paid: a customer who already exists without a tier, and what the
 * webhook error log keeps when processing fails.
 *
 * @see app/routes/webhooks.orders.paid.tsx
 */

import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWebhookTestContext } from "../../helpers/webhook-test-client";
import { createOrderPayload } from "../../factories/order.factory";
import { getMockPrisma, resetMockPrisma, type MockPrismaClient } from "../../helpers/database-helpers";

vi.mock("~/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(async (request: Request) => ({
      shop: request.headers.get("X-Shopify-Shop-Domain"),
      topic: request.headers.get("X-Shopify-Topic"),
      payload: JSON.parse(await request.clone().text()),
      admin: { graphql: vi.fn() },
    })),
  },
}));
vi.mock("~/db.server", () => {
  const mock = getMockPrisma();
  return { default: mock, db: mock, databaseSchema: "rewardspro" };
});
vi.mock("~/services/tier-resolution.server", () => ({ updateCustomerToEffectiveTier: vi.fn() }));
vi.mock("~/utils/transaction-analyzer", () => ({
  createTransactionAnalyzer: () => ({
    getCashbackEligibleAmount: vi.fn(async () => ({ eligibleAmount: 100, breakdown: null })),
  }),
}));
vi.mock("~/services/tier-products", () => ({
  TierProductMatcher: { matchLineItem: vi.fn(async () => ({ matched: false })) },
  TierProductPurchaseService: { createPurchase: vi.fn() },
  tierPurchaseExists: vi.fn(async () => false),
}));
vi.mock("~/services/email-notifications.server", () => ({
  sendTierUpgradeEmailNotification: vi.fn(),
  sendTierDowngradeEmailNotification: vi.fn(),
}));
vi.mock("~/services/automation-trigger.server", () => ({ processAutomationTrigger: vi.fn() }));
vi.mock("~/services/email-provider.server", () => ({ trackOrderForKlaviyo: vi.fn() }));
vi.mock("~/services/klaviyo.server", () => ({ isKlaviyoEnabled: vi.fn(async () => false) }));
vi.mock("~/services/klaviyo-events.server", () => ({
  syncCustomerToKlaviyo: vi.fn(),
  trackTierUpgraded: vi.fn(),
  trackCashbackEarned: vi.fn(),
}));
vi.mock("~/services/challenge-progress.server", () => ({ processOrderForChallenges: vi.fn(async () => []) }));
vi.mock("~/services/webhook-entitlement-monitor.server", () => ({ logWebhookEntitlementContext: vi.fn() }));
vi.mock("~/utils/order-count.server", () => ({ incrementMonthlyOrderCount: vi.fn() }));
vi.mock("~/services/monitoring/sentry.service", () => ({
  SentryService: {
    startWebhookTransaction: () => ({ finish: vi.fn() }),
    setShopContext: vi.fn(),
    setOperationContext: vi.fn(),
    captureException: vi.fn(),
    events: { webhookProcessed: vi.fn() },
  },
}));
vi.mock("~/services/logger.server", () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { createLogger: () => ({ ...logger, withContext: () => logger }) };
});

import { updateCustomerToEffectiveTier } from "~/services/tier-resolution.server";

const { action } = await import("~/routes/webhooks.orders.paid");

const SHOP = "test-shop.myshopify.com";
const SHOPIFY_CUSTOMER_ID = "123456789";
const memberTier = { id: "tier-member", shop: SHOP, name: "Member", minSpend: 0, cashbackPercent: 5 };

describe("orders/paid", () => {
  let db: MockPrismaClient;
  let customer: Record<string, unknown>;
  let orderRecord: Record<string, unknown> | null;

  beforeEach(() => {
    db = getMockPrisma();
    resetMockPrisma();
    (db as any).shopEntitlements = { findUnique: vi.fn(async () => null) };

    // Synced at install (or created by customers/create) before any tier
    // existed, so the customer has none yet
    customer = {
      id: "cust-1",
      shop: SHOP,
      shopifyCustomerId: SHOPIFY_CUSTOMER_ID,
      email: "shopper@example.com",
      currentTierId: null,
      storeCredit: new Prisma.Decimal(0),
    };
    orderRecord = null;

    vi.mocked(db.customer.findUnique).mockImplementation(async () => ({ ...customer }));
    vi.mocked(db.customer.findFirst).mockImplementation(async () => ({ ...customer }));
    vi.mocked(db.tier.findUnique).mockImplementation(async ({ where }: any) => (where.id === memberTier.id ? memberTier : null));
    vi.mocked(db.shopSettings.findUnique).mockResolvedValue({ autoCashbackProcessingEnabled: false, storeCurrency: "USD" });
    vi.mocked(db.order.findFirst).mockImplementation(async () => orderRecord);
    vi.mocked(db.order.create).mockImplementation(async ({ data }: any) => (orderRecord = { ...data }));
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue({
      totalPrice: new Prisma.Decimal(100),
      totalRefunded: new Prisma.Decimal(0),
      financialStatus: "PAID",
      cashbackEligible: true,
      refunds: [],
    });
    vi.mocked(db.storeCreditLedger.create).mockImplementation(async ({ data }: any) => data);

    // The tier resolver places the customer in the shop's first tier
    vi.mocked(updateCustomerToEffectiveTier).mockImplementation(async () => {
      const previousTierId = customer.currentTierId as string | null;
      customer.currentTierId = memberTier.id;
      return { success: true, previousTierId, newTierId: memberTier.id, changed: previousTierId !== memberTier.id, source: "DEFAULT_BASE_TIER" };
    });
  });

  it("places an existing customer without a tier before cashback, so their first order earns it", async () => {
    const payload = createOrderPayload({ customerId: SHOPIFY_CUSTOMER_ID, totalPrice: 100 });

    await createWebhookTestContext({ topic: "orders/paid", shop: SHOP, payload }).execute(action);

    const cashback = vi
      .mocked(db.storeCreditLedger.create)
      .mock.calls.map(([args]: any) => args.data)
      .find((data: any) => data.type === "CASHBACK_EARNED");
    expect(cashback).toBeDefined();
    expect(cashback.customerId).toBe("cust-1");
    expect(Number(cashback.amount)).toBeCloseTo(5, 2);
  });

  it("places them on a redelivery too, when an earlier attempt stopped after recording the order", async () => {
    const payload = createOrderPayload({ customerId: SHOPIFY_CUSTOMER_ID, totalPrice: 100 });
    orderRecord = { id: "order-1", shop: SHOP, shopifyOrderId: String(payload.id), customerId: "cust-1" };

    await createWebhookTestContext({ topic: "orders/paid", shop: SHOP, payload }).execute(action);

    expect(db.order.create).not.toHaveBeenCalled();
    const cashback = vi
      .mocked(db.storeCreditLedger.create)
      .mock.calls.map(([args]: any) => args.data)
      .find((data: any) => data.type === "CASHBACK_EARNED");
    expect(Number(cashback?.amount)).toBeCloseTo(5, 2);
  });

  it("keeps the order id and the error kind in the webhook error log, never the order payload or the shopper's ids", async () => {
    vi.mocked(db.customer.findUnique).mockRejectedValue(new Error("Invalid customer record"));
    const payload = createOrderPayload({ customerId: SHOPIFY_CUSTOMER_ID, totalPrice: 100, email: "shopper@example.com" });

    await createWebhookTestContext({ topic: "orders/paid", shop: SHOP, payload }).execute(action);

    expect(db.webhookError.create).toHaveBeenCalledTimes(1);
    const logged = vi.mocked(db.webhookError.create).mock.calls[0][0].data;
    expect(logged).toMatchObject({ shop: SHOP, orderId: String(payload.id), error: "Invalid customer record" });
    // customers/redact does not reach this table, so it holds nothing that names the shopper
    expect(logged.payload).toEqual({ orderId: payload.id, errorKind: "Error" });
    expect(JSON.stringify(logged)).not.toContain("shopper@example.com");
    expect(JSON.stringify(logged)).not.toContain(SHOPIFY_CUSTOMER_ID);
  });
});
