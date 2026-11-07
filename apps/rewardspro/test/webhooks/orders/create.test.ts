import { beforeEach, describe, expect, it, vi } from "vitest";

// orders/create stores the order's customer when customers/create hasn't
// arrived yet. A customer without an email is stored as "", as customer sync
// does, never as a made-up address that shopper emails would go to.

const SHOP = "test-shop.myshopify.com";

const shopify = vi.hoisted(() => ({ payload: null as unknown, graphql: vi.fn() }));
const prisma = vi.hoisted(() => ({
  webhookProcessed: { findUnique: vi.fn(), create: vi.fn() },
  customer: { findFirst: vi.fn(), create: vi.fn() },
  storeCreditLedger: { create: vi.fn() },
}));

vi.mock("~/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(async () => ({
      topic: "ORDERS_CREATE",
      shop: SHOP,
      payload: shopify.payload,
      admin: { graphql: shopify.graphql },
    })),
  },
}));
vi.mock("~/db.server", () => ({ default: prisma }));
vi.mock("~/utils/analytics-cache.server", () => ({ invalidateShopCache: vi.fn() }));

import { action } from "~/routes/webhooks.orders.create";

describe("orders/create: the order's customer", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    prisma.webhookProcessed.findUnique.mockResolvedValue(null);
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data);
  });

  it("stores a first-time customer whose order has no email without making up an address", async () => {
    // A phone-only checkout
    shopify.payload = { id: 7001, customer: { id: 301, email: null, phone: "+447700900123", total_spent: "0.00", orders_count: 1 } };
    shopify.graphql.mockResolvedValue(
      Response.json({
        data: { customer: { id: "gid://shopify/Customer/301", email: null, firstName: "Pat", lastName: null, storeCreditAccounts: { edges: [] } } },
      }),
    );

    const response = await action({
      request: new Request("https://app.test/webhooks/orders/create", { method: "POST", headers: { "X-Shopify-Webhook-Id": "wh-1" } }),
      params: {},
      context: {},
    });

    expect(response.status).toBe(200);
    expect(prisma.customer.create).toHaveBeenCalledTimes(1);
    expect(prisma.customer.create.mock.calls[0][0].data).toMatchObject({ shopifyCustomerId: "301", email: "", firstName: "Pat" });
  });
});
