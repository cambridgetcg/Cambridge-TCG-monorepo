import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Refunds that reach the app before orders/paid has recorded the order's
 * cashback, through the real orders/paid and refunds/create routes on
 * Postgres. Shopify's side is mocked: the webhooks' authentication and the
 * Admin GraphQL the app sends (the order's payments, store credit).
 */
const shopify = vi.hoisted(() => ({
  topic: "ORDERS_PAID",
  payload: null as Record<string, unknown> | null,
  graphql: vi.fn(),
}));
vi.mock("~/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(async () => ({ shop: SHOP, topic: shopify.topic, payload: shopify.payload, admin: { graphql: shopify.graphql } })),
  },
  // The Orders page's Admin API, answered by the same mock
  unauthenticated: { admin: vi.fn(async () => ({ admin: { graphql: shopify.graphql } })) },
}));
// No mail leaves the test
vi.mock("~/services/email-notifications.server", () => ({
  sendTierUpgradeEmailNotification: vi.fn(),
  sendTierDowngradeEmailNotification: vi.fn(),
}));

import prisma from "~/db.server";
import { action as ordersPaid } from "~/routes/webhooks.orders.paid";
import { action as refundsCreate } from "~/routes/webhooks.orders.refunded";
import { issueCashbackByHand } from "~/services/cashback-ledger.server";
import { unauthenticated } from "~/shopify.server";
import { hasTestDatabase, resetDatabase } from "./database";

const SHOP = "refund-first.myshopify.com";
const ORDER = 6660001;

type StoreCreditVariables = {
  creditInput?: { creditAmount: { amount: string } };
  debitInput?: { debitAmount: { amount: string } };
};

/**
 * Shopify's side of one £100.00 card payment, and the shopper's store credit.
 * `failPaymentLookups` fails the next lookups of the order's payments (each
 * orders/paid delivery tries twice); `duringPaymentLookup` runs inside the
 * next one, after orders/paid has created the order. The order belongs to
 * a customer and was placed an hour ago unless `guestOrder` or
 * `placedHoursAgo` say otherwise; `failOrderLookup` makes that query fail.
 */
function mockShopify(
  options: {
    failPaymentLookups?: number;
    duringPaymentLookup?: () => Promise<void>;
    guestOrder?: boolean;
    placedHoursAgo?: number;
    failOrderLookup?: boolean;
  } = {},
) {
  const shopper = { balance: 0, credited: [] as string[], debited: [] as string[] };
  let failures = options.failPaymentLookups ?? 0;
  let during = options.duringPaymentLookup;
  const answer = (body: unknown) => ({ json: async () => body });
  const transaction = () => ({
    id: `gid://shopify/StoreCreditAccountTransaction/${shopper.credited.length + shopper.debited.length}`,
    amount: { amount: "0.00", currencyCode: "GBP" },
    balanceAfterTransaction: { amount: shopper.balance.toFixed(2), currencyCode: "GBP" },
  });

  shopify.graphql.mockImplementation(async (query: string, request?: { variables?: StoreCreditVariables }) => {
    if (query.includes("RefundedOrderCustomer")) {
      if (options.failOrderLookup) throw new Error("fetch failed");
      const placed = new Date(Date.now() - (options.placedHoursAgo ?? 1) * 3_600_000);
      return answer({
        data: {
          order: {
            id: `gid://shopify/Order/${ORDER}`,
            createdAt: placed.toISOString(),
            customer: options.guestOrder ? null : { id: "gid://shopify/Customer/100" },
          },
        },
      });
    }
    if (query.includes("GetOrderPaymentDetails")) {
      if (failures > 0) {
        failures--;
        throw new Error("fetch failed");
      }
      const hook = during;
      during = undefined;
      await hook?.();
      return answer({
        data: {
          order: {
            id: `gid://shopify/Order/${ORDER}`,
            totalReceivedSet: { shopMoney: { amount: "100.00", currencyCode: "GBP" } },
            transactions: [
              { id: "gid://shopify/OrderTransaction/1", gateway: "shopify_payments", status: "SUCCESS", kind: "SALE", amountSet: { shopMoney: { amount: "100.00", currencyCode: "GBP" } }, parentTransaction: null },
            ],
          },
        },
      });
    }
    if (query.includes("GetCustomerStoreCredit")) {
      return answer({
        data: {
          customer: {
            id: "gid://shopify/Customer/100",
            email: null,
            displayName: "Alice",
            storeCreditAccounts: { edges: [{ node: { id: "gid://shopify/StoreCreditAccount/1", balance: { amount: shopper.balance.toFixed(2), currencyCode: "GBP" } } }] },
          },
        },
      });
    }
    if (query.includes("IssueStoreCredit")) {
      const amount = request?.variables?.creditInput?.creditAmount.amount ?? "0.00";
      shopper.credited.push(amount);
      shopper.balance += Number(amount);
      return answer({ data: { storeCreditAccountCredit: { storeCreditAccountTransaction: transaction(), userErrors: [] } } });
    }
    if (query.includes("DebitStoreCredit")) {
      const amount = request?.variables?.debitInput?.debitAmount.amount ?? "0.00";
      shopper.debited.push(amount);
      shopper.balance -= Number(amount);
      return answer({ data: { storeCreditAccountDebit: { storeCreditAccountTransaction: transaction(), userErrors: [] } } });
    }
    throw new Error(`Unexpected Admin GraphQL: ${query.slice(0, 80)}`);
  });
  return shopper;
}

/** Credited minus debited, in pence */
const netPence = (shopper: { credited: string[]; debited: string[] }) =>
  Math.round(shopper.credited.reduce((sum, a) => sum + Number(a) * 100, 0) - shopper.debited.reduce((sum, a) => sum + Number(a) * 100, 0));

async function seedShop(autoCashbackProcessingEnabled: boolean) {
  await prisma.shopSettings.create({
    data: { shop: SHOP, storeName: "Refund First", storeUrl: `https://${SHOP}`, storeCurrency: "GBP", autoCashbackProcessingEnabled },
  });
  const gold = await prisma.tier.create({ data: { id: "gold", shop: SHOP, name: "Gold", minSpend: 0, cashbackPercent: 5 } });
  await prisma.customer.create({ data: { shop: SHOP, shopifyCustomerId: "100", email: "alice@example.test", currentTierId: gold.id } });
}

function paidOrder() {
  return {
    id: ORDER,
    name: `#${ORDER}`,
    order_number: ORDER,
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
    total_price_set: { shop_money: { amount: "100.00", currency_code: "GBP" }, presentment_money: { amount: "100.00", currency_code: "GBP" } },
    customer: { id: 100, email: "alice@example.test", first_name: "Alice", last_name: "Archer" },
    line_items: [{ id: 1, product_id: 11, variant_id: 12, sku: null, title: "Booster Box", price: "100.00", quantity: 1, gift_card: false }],
    discount_applications: [],
    payment_gateway_names: ["shopify_payments"],
  };
}

function deliver(topic: "ORDERS_PAID" | "REFUNDS_CREATE", payload: Record<string, unknown>, webhookId: string) {
  shopify.topic = topic;
  shopify.payload = payload;
  const route = topic === "ORDERS_PAID" ? ordersPaid : refundsCreate;
  return route({
    request: new Request(`https://example.test/webhooks/${topic.toLowerCase()}`, { method: "POST", headers: { "X-Shopify-Webhook-Id": webhookId } }),
    params: {},
    context: {},
  });
}

/** orders/paid; Shopify redelivers a failed delivery under the same id */
const paid = () => deliver("ORDERS_PAID", paidOrder(), "orders-paid-1");

/** refunds/create for refund `id` of the order */
const refund = (id: number, amount: string) =>
  deliver(
    "REFUNDS_CREATE",
    { id, order_id: ORDER, created_at: "2026-10-19T10:00:00Z", refund_line_items: [], transactions: [{ kind: "refund", status: "success", amount, currency: "GBP" }] },
    `refund-${id}`,
  );

/** The Orders page issuing the order's cashback (its batch action) */
async function issueByHand() {
  const order = await prisma.order.findFirstOrThrow({ where: { shop: SHOP, shopifyOrderId: String(ORDER) } });
  const { admin } = await unauthenticated.admin(SHOP);
  return issueCashbackByHand({ shop: SHOP, admin, orderId: order.id, currency: "GBP", reason: "Loyalty reward" });
}

const recordedOrder = () => prisma.order.findFirstOrThrow({ where: { shop: SHOP, shopifyOrderId: String(ORDER) } });
const cashbackEntries = () => prisma.storeCreditLedger.findMany({ where: { shop: SHOP, type: "CASHBACK_EARNED" } });

describe.skipIf(!hasTestDatabase)("refunds that arrive before orders/paid has recorded the cashback", () => {
  beforeEach(async () => {
    await resetDatabase();
    shopify.graphql.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  for (const auto of [true, false]) {
    const processing = `automatic processing ${auto ? "on" : "off"}`;

    it(`a full refund recorded while orders/paid reads the payments leaves no cashback (${processing})`, async () => {
      await seedShop(auto);
      let duringPayments: Response | undefined;
      const shopper = mockShopify({
        duringPaymentLookup: async () => {
          duringPayments = await refund(1, "100.00");
        },
      });

      expect((await paid()).status).toBe(200);

      // The order existed, so the refund was recorded, with no cashback yet to reverse
      expect(duringPayments?.status).toBe(200);
      await expect(cashbackEntries()).resolves.toEqual([]);
      await expect(recordedOrder()).resolves.toMatchObject({ financialStatus: "REFUNDED", cashbackEligible: false });
      expect((await recordedOrder()).cashbackAmount?.toFixed(2)).toBe("0.00");
      if (!auto) await expect(issueByHand()).resolves.toMatchObject({ success: false });
      expect(shopper.credited).toEqual([]);
      expect(netPence(shopper)).toBe(0);
    });

    it(`a partial refund recorded before the cashback, then the rest, nets to nothing (${processing})`, async () => {
      await seedShop(auto);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const shopper = mockShopify({ failPaymentLookups: 2 });

      // orders/paid records the order, then cannot read its payments: 500
      expect((await paid()).status).toBe(500);
      expect((await refund(1, "40.00")).status).toBe(200);
      // Shopify's redelivery records the cashback net of that refund
      expect((await paid()).status).toBe(200);

      const [entry] = await cashbackEntries();
      expect(entry.amount.toFixed(2)).toBe("3.00");
      expect(entry.metadata).toMatchObject({ originalAmount: "5.00", reversedBeforeIssue: [{ shopifyRefundId: "1", amount: "2.00" }] });
      const first = await prisma.orderRefund.findFirstOrThrow({ where: { shopifyRefundId: "1" } });
      expect(first.cashbackAdjustment?.toFixed(2)).toBe("2.00");
      expect((await recordedOrder()).cashbackAmount?.toFixed(2)).toBe("3.00");
      if (!auto) await expect(issueByHand()).resolves.toMatchObject({ success: true, amount: 3 });
      expect(shopper.credited).toEqual(["3.00"]);

      expect((await refund(2, "60.00")).status).toBe(200);
      expect(shopper.debited).toEqual(["3.00"]);
      expect(netPence(shopper)).toBe(0);
    });

    it(`a full refund delivered before orders/paid is retried, then reverses the cashback (${processing})`, async () => {
      await seedShop(auto);
      const shopper = mockShopify();

      // Not recorded yet: Shopify is asked to redeliver
      expect((await refund(1, "100.00")).status).toBe(503);
      await expect(prisma.order.count()).resolves.toBe(0);
      expect((await paid()).status).toBe(200);
      expect(shopper.credited).toEqual(auto ? ["5.00"] : []);

      expect((await refund(1, "100.00")).status).toBe(200);

      const [entry] = await cashbackEntries();
      if (auto) {
        expect(shopper.debited).toEqual(["5.00"]);
      } else {
        expect(entry.amount.toFixed(2)).toBe("0.00");
        expect(entry.metadata).toMatchObject({ syncStatus: "NOT_APPLICABLE" });
        await expect(issueByHand()).resolves.toMatchObject({ success: false });
      }
      await expect(recordedOrder()).resolves.toMatchObject({ financialStatus: "REFUNDED", cashbackEligible: false });
      expect(netPence(shopper)).toBe(0);
    });

    it(`a partial refund delivered before orders/paid, then the rest, nets to nothing (${processing})`, async () => {
      await seedShop(auto);
      const shopper = mockShopify();

      expect((await refund(1, "40.00")).status).toBe(503);
      expect((await paid()).status).toBe(200);
      expect((await refund(1, "40.00")).status).toBe(200);
      if (!auto) await expect(issueByHand()).resolves.toMatchObject({ success: true, amount: 3 });
      expect((await refund(2, "60.00")).status).toBe(200);

      // On: 5.00 credited, then 2.00 and 3.00 debited. Off: 3.00 issued after the
      // first refund shrank the entry, then 3.00 debited.
      expect(shopper.credited).toEqual(auto ? ["5.00"] : ["3.00"]);
      expect(shopper.debited).toEqual(auto ? ["2.00", "3.00"] : ["3.00"]);
      expect(netPence(shopper)).toBe(0);
      await expect(recordedOrder()).resolves.toMatchObject({ financialStatus: "REFUNDED" });
    });
  }

  it("acknowledges a refund of a guest checkout, or of an order placed long ago, that it never recorded", async () => {
    await seedShop(true);

    mockShopify({ guestOrder: true });
    const guest = await refund(1, "100.00");
    expect(guest.status).toBe(200);
    await expect(guest.json()).resolves.toMatchObject({ success: true, message: "Order not found" });

    // Older than the 48 hours orders/paid can still take
    mockShopify({ placedHoursAgo: 49 });
    expect((await refund(2, "100.00")).status).toBe(200);
    await expect(prisma.orderRefund.count()).resolves.toBe(0);
  });

  it("asks for a redelivery when Shopify cannot say whose order a refund is for", async () => {
    await seedShop(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockShopify({ failOrderLookup: true });

    expect((await refund(1, "100.00")).status).toBe(500);
    await expect(prisma.webhookProcessed.count()).resolves.toBe(0);
  });
});
