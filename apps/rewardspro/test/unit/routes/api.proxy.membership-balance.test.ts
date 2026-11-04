import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { loader as Loader } from "~/routes/api.proxy.$";
import { selectedFields } from "../../helpers/graphql-fields";

/**
 * The membership widget shows the store credit the proxy returns. RewardsPro's
 * copy of it changes only when the app credits or debits, so after a shopper
 * spends credit at checkout the widget would show too much. The proxy returns
 * Shopify's balance, and the copy only when Shopify can't be reached.
 */

const SHOP = "live-balance.myshopify.com";
const STORED_CREDIT = 50;

const prisma = vi.hoisted(() => ({
  customer: { findUnique: vi.fn() },
  shopSettings: { findUnique: vi.fn() },
  pointsConfig: { findUnique: vi.fn() },
  tier: { findMany: vi.fn() },
  tierProduct: { findMany: vi.fn() },
}));
const graphql = vi.hoisted(() => vi.fn());

vi.mock("~/db.server", () => ({ default: prisma, db: prisma, databaseSchema: "rewardspro" }));
vi.mock("~/shopify.server", () => ({
  authenticate: { public: { appProxy: vi.fn(async () => ({ session: { shop: SHOP }, admin: { graphql } })) } },
  unauthenticated: {},
}));
vi.mock("~/utils/rate-limiter-redis", () => ({ appProxyRateLimit: vi.fn(async () => null) }));

let loader: typeof Loader;

// The fields each query must select, as Admin API 2026-10 names them
const CUSTOMER_ACCOUNTS_FIELDS = ["shop.customerAccountsV2.customerAccountsVersion"];
const BALANCE_FIELDS = [
  "customer.storeCreditAccounts.nodes.balance.amount",
  "customer.storeCreditAccounts.nodes.balance.currencyCode",
  "customer.storeCreditAccounts.pageInfo.hasNextPage",
  "shop.currencyCode",
];
const selects = (query: string, fields: string[]) => selectedFields(query).join() === fields.join();
const askedForBalance = () => graphql.mock.calls.filter(([query]) => selects(query, BALANCE_FIELDS)).length;

/** Shopify answers with `balance` in GBP for every shopper, or fails to answer it */
function shopify({ balance = "12.50", fail = false }: { balance?: string; fail?: boolean } = {}) {
  graphql.mockImplementation(async (query: string) => {
    if (selects(query, CUSTOMER_ACCOUNTS_FIELDS)) {
      return { json: async () => ({ data: { shop: { customerAccountsV2: { customerAccountsVersion: "NEW_CUSTOMER_ACCOUNTS" } } } }) };
    }
    if (selects(query, BALANCE_FIELDS)) {
      if (fail) throw new Error("fetch failed");
      return {
        json: async () => ({
          data: {
            shop: { currencyCode: "GBP" },
            customer: {
              storeCreditAccounts: {
                nodes: [{ balance: { amount: balance, currencyCode: "GBP" } }],
                pageInfo: { hasNextPage: false },
              },
            },
          },
        }),
      };
    }
    // Shopify answers a field its schema doesn't have with an error, not data
    throw new Error(`Shopify doesn't answer: ${selectedFields(query).join(", ")}`);
  });
}

async function membership(customerId: string) {
  const response = await loader({
    request: new Request(`https://app.test/api/proxy/membership?shop=${SHOP}&logged_in_customer_id=${customerId}`),
    params: { "*": "membership" },
    context: {},
  });
  return response.json();
}

beforeEach(async () => {
  // An empty balance cache for each test, and for each retry of one
  vi.resetModules();
  ({ loader } = await import("~/routes/api.proxy.$"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  graphql.mockReset();
  prisma.customer.findUnique.mockReset();
  prisma.customer.findUnique.mockImplementation(async ({ where }) => ({
    id: `customer-${where.shop_shopifyCustomerId.shopifyCustomerId}`,
    shopifyCustomerId: where.shop_shopifyCustomerId.shopifyCustomerId,
    email: "shopper@example.com",
    storeCredit: STORED_CREDIT,
    totalCashbackEarned: STORED_CREDIT,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: null,
    tierState: null,
  }));
  prisma.shopSettings.findUnique.mockResolvedValue({ storeCurrency: "GBP" });
  prisma.pointsConfig.findUnique.mockResolvedValue(null);
  prisma.tier.findMany.mockResolvedValue([]);
  prisma.tierProduct.findMany.mockResolvedValue([]);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("membership store credit", () => {
  it("shows the lower balance Shopify holds after the shopper spent credit", async () => {
    shopify({ balance: "12.50" });
    const body = await membership("101");
    expect(body.success).toBe(true);
    expect(body.balance.storeCredit).toBe(12.5);
  });

  it("falls back to the stored balance when Shopify can't be reached", async () => {
    shopify({ fail: true });
    const body = await membership("101");
    expect(body.success).toBe(true);
    expect(body.balance.storeCredit).toBe(STORED_CREDIT);
  });

  it("asks Shopify once per shopper while the answer is fresh", async () => {
    shopify({ balance: "20.00" });
    await membership("101");
    const body = await membership("101");
    expect(body.balance.storeCredit).toBe(20);
    expect(askedForBalance()).toBe(1);
  });

  it("gives a guest nothing, and asks Shopify nothing", async () => {
    shopify();
    const body = await membership("");
    expect(body).toMatchObject({ success: false, requiresLogin: true, customer: null });
    expect(body.balance.storeCredit).toBe(0);
    expect(graphql).not.toHaveBeenCalled();
    expect(prisma.customer.findUnique).not.toHaveBeenCalled();
  });
});
