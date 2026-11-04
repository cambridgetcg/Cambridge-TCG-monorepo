// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Orders page says what RewardsPro actually does with each order: whether
 * automatic cashback is on (the flag orders/paid reads), the rate the cashback
 * was worked out at, and whose order it is.
 */

const remix = vi.hoisted(() => ({ loaderData: {} as Record<string, unknown> }));
vi.mock("@remix-run/react", () => ({
  useLoaderData: () => remix.loaderData,
  useActionData: () => undefined,
  useSubmit: () => vi.fn(),
  useNavigation: () => ({ state: "idle" }),
  useFetcher: () => ({ state: "idle", data: undefined, submit: vi.fn() }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

const server = vi.hoisted(() => ({
  db: {
    order: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    tier: { findMany: vi.fn() },
    shopSettings: { findUnique: vi.fn() },
  },
  getShopSettings: vi.fn(),
}));
vi.mock("~/shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("~/db.server", () => ({ default: server.db }));
// The 15-minute settings cache, as it stood before the merchant turned automatic cashback on
vi.mock("~/services/shop-data-provider.server", () => ({ getShopSettings: server.getShopSettings }));
vi.mock("~/services/refund-handler.server", () => ({ settleRefundClawback: vi.fn() }));
vi.mock("~/hooks/useToast", () => ({
  useToast: () => ({ toast: { active: false }, showSuccess: vi.fn(), showError: vi.fn(), hideToast: vi.fn() }),
}));

import { authenticate } from "~/shopify.server";
import OrdersPage, { loader } from "~/routes/app.orders";

const SHOP = "shop.myshopify.com";

/** Order #1009 from the dev-store test: the customer had no tier when the order row was written */
function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1009",
    shop: SHOP,
    shopifyOrderId: "1009",
    shopifyOrderNumber: "1009",
    shopifyOrderName: "#1009",
    customerId: "customer-1",
    customer: {
      id: "customer-1",
      shopifyCustomerId: "gid-1",
      email: "",
      firstName: "Ada",
      lastName: "Lovelace",
      currentTierId: "tier-bronze",
      storeCredit: new Prisma.Decimal("2.50"),
      totalCashbackEarned: new Prisma.Decimal("2.50"),
      totalSpent: new Prisma.Decimal("50"),
      lifetimeSpent: null,
    },
    email: "",
    currency: "GBP",
    totalPrice: new Prisma.Decimal("50"),
    totalRefunded: new Prisma.Decimal("0"),
    netAmount: new Prisma.Decimal("50"),
    financialStatus: "PAID",
    fulfillmentStatus: null,
    cashbackEligible: true,
    cashbackPercent: 0,
    cashbackPercentAtOrder: null,
    cashbackAmount: new Prisma.Decimal("2.50"),
    cashbackProcessed: true,
    tierIdAtOrder: null,
    tierNameAtOrder: null,
    shopifyCreatedAt: new Date("2026-11-04T10:00:00Z"),
    createdAt: new Date("2026-11-04T10:00:00Z"),
    lineItems: [],
    refunds: [],
    creditLedgerEntries: [
      {
        id: "ledger-1",
        type: "CASHBACK_EARNED",
        amount: new Prisma.Decimal("2.50"),
        balance: new Prisma.Decimal("2.50"),
        createdAt: new Date("2026-11-04T10:00:01Z"),
        metadata: { cashbackPercent: 5, tierName: "Bronze", syncStatus: "SYNCED" },
      },
    ],
    ...overrides,
  };
}

async function loadOrders() {
  const response = await loader({ request: new Request("https://app.example.com/app/orders"), params: {}, context: {} });
  return response.json();
}

describe("Orders page loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticate.admin).mockResolvedValue({ session: { shop: SHOP }, admin: {} } as never);
    server.db.order.findMany.mockResolvedValue([orderRow()]);
    server.db.order.count.mockResolvedValue(1);
    server.db.order.aggregate.mockResolvedValue({ _sum: { cashbackAmount: null, totalRefunded: null } });
    server.db.tier.findMany.mockResolvedValue([{ id: "tier-bronze", name: "Bronze", cashbackPercent: 5 }]);
    server.getShopSettings.mockResolvedValue({ storeCurrency: "GBP", currencyDisplayType: "SYMBOL", autoCashbackProcessingEnabled: false });
    server.db.shopSettings.findUnique.mockResolvedValue({ storeCurrency: "GBP", currencyDisplayType: "SYMBOL", autoCashbackProcessingEnabled: true });
  });

  it("reads automatic cashback from the shop's settings row, which the dashboard toggle writes and orders/paid reads", async () => {
    const data = await loadOrders();

    expect(data.shopSettings.autoCashbackProcessingEnabled).toBe(true);
    expect(server.db.shopSettings.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { shop: SHOP } }));
  });

  it("gives each order the rate and tier its cashback was worked out at", async () => {
    const [order] = (await loadOrders()).orders;

    expect(order.cashbackRateUsed).toBe(5);
    expect(order.cashbackTierUsed).toBe("Bronze");
  });

  it("falls back to the rate stored on the order when no cashback entry records one", async () => {
    server.db.order.findMany.mockResolvedValue([orderRow({ cashbackPercent: 3, tierNameAtOrder: "Silver", creditLedgerEntries: [] })]);
    const [order] = (await loadOrders()).orders;

    expect(order.cashbackRateUsed).toBe(3);
    expect(order.cashbackTierUsed).toBe("Silver");
  });

  it("gives no rate rather than 0% when nothing records one", async () => {
    server.db.order.findMany.mockResolvedValue([orderRow({ creditLedgerEntries: [] })]);
    const [order] = (await loadOrders()).orders;

    expect(order.cashbackRateUsed).toBeNull();
  });
});

function ordersPageHtml(orders: unknown[], autoCashbackProcessingEnabled: boolean) {
  remix.loaderData = {
    orders,
    stats: { totalOrders: orders.length, totalCashback: 2.5, pendingCashback: 0, processedCashback: 2.5, totalRefunded: 0 },
    shopSettings: { storeCurrency: "GBP", currencyDisplayType: "SYMBOL", autoCashbackProcessingEnabled },
    pagination: { page: 1, pageSize: 25, totalPages: 1, totalCount: orders.length },
  };
  const view = renderToStaticMarkup(createElement(AppProvider, { i18n: en }, createElement(OrdersPage)));
  return view.replaceAll("&#x27;", "'").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

/** An order as the loader serializes it */
function serializedOrder(overrides: Record<string, unknown> = {}) {
  return {
    ...orderRow(),
    customer: { ...orderRow().customer, currentTier: { id: "tier-bronze", name: "Bronze", cashbackPercent: 5 }, storeCredit: 2.5 },
    totalPrice: 50,
    totalRefunded: 0,
    netAmount: 50,
    cashbackAmount: 2.5,
    cashbackStatus: "PROCESSED",
    cashbackDue: null,
    cashbackRefusal: "Cashback already processed",
    cashbackRateUsed: 5,
    cashbackTierUsed: "Bronze",
    creditLedgerEntries: [],
    ...overrides,
  };
}

describe("Orders page", () => {
  it("says automatic cashback is on when it is", () => {
    const html = ordersPageHtml([serializedOrder()], true);

    expect(html).toContain("Automatic cashback: On");
    expect(html).not.toContain("Off");
  });

  it("says automatic cashback is off when it is", () => {
    expect(ordersPageHtml([serializedOrder()], false)).toContain("Automatic cashback: Off");
  });

  it("shows the rate the cashback was worked out at, not the 0% stored before the customer had a tier", () => {
    const html = ordersPageHtml([serializedOrder()], true);

    expect(html).toContain("£2.50 back (5%)");
    expect(html).not.toContain("(0%)");
  });

  it("leaves the rate out when nothing records one", () => {
    const html = ordersPageHtml([serializedOrder({ cashbackRateUsed: null })], true);

    expect(html).toContain("£2.50 back");
    expect(html).not.toMatch(/back \(/);
  });

  it("names the customer, with their tier beside the name", () => {
    const html = ordersPageHtml([serializedOrder()], true);

    expect(html).toContain("Ada Lovelace Info Bronze");
  });

  it("shows the customer's email when Shopify gave no name", () => {
    const customer = { ...serializedOrder().customer, firstName: null, lastName: null, email: "ada@example.com" };
    expect(ordersPageHtml([serializedOrder({ customer })], true)).toContain("ada@example.com Info Bronze");
  });

  it("says a customer has no name or email rather than calling them a guest", () => {
    const customer = { ...serializedOrder().customer, firstName: null, lastName: null, email: "", currentTier: null };
    const html = ordersPageHtml([serializedOrder({ customer })], true);

    expect(html).toContain("No name or email");
    expect(html).not.toContain("Guest");
  });
});
