import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { action as customersCreate } from "~/routes/webhooks.customers.create";
import { action as customersUpdate } from "~/routes/webhooks.customers.update";
import { loader as tierMaintenance } from "~/routes/api.cron.tier-maintenance";
import { syncCustomersInBackground } from "~/services/background-customer-sync.server";
import { markChoiceModalSeen } from "~/services/marketing-mode.server";
import type { ShopperEmailKind } from "~/constants/shopper-emails";
import { server } from "../../mocks/server";
import { failNextCall, hasTestDatabase, resetDatabase, restoreFailedCalls } from "./database";
import { seedOfflineSession, signedWebhook } from "./shopify";

// The emails RewardsPro sends shoppers by itself, end to end: real webhooks,
// the first customer sync and the tier-maintenance cron against Postgres,
// with SendGrid answered by MSW.

const SHOP = "shopper-emails.myshopify.com";
const CRON_SECRET = "tier-maintenance-cron";

/** SendGrid's mail/send, answered by MSW; returns each recipient address. */
function mockSendGrid(): string[] {
  const sent: string[] = [];
  server.use(
    http.post("https://api.sendgrid.com/v3/mail/send", async ({ request }) => {
      const body = (await request.json()) as { personalizations: Array<{ to: Array<{ email: string }> }> };
      sent.push(...body.personalizations.flatMap((p) => p.to.map((to) => to.email)));
      return new HttpResponse(null, { status: 202 });
    }),
  );
  return sent;
}

/** Stores switches the way Email settings saves them (EmailSettings.sendTimePrefs.shopperEmails). */
async function turnOn(...kinds: ShopperEmailKind[]) {
  const sendTimePrefs = {
    preferredTime: "10:00",
    timezone: "America/New_York",
    dailyLimit: 1000,
    hourlyLimit: 100,
    shopperEmails: Object.fromEntries(kinds.map((kind) => [kind, true])),
  };
  await prisma.emailSettings.upsert({
    where: { shop: SHOP },
    create: { shop: SHOP, senderName: "Card Shop", senderEmail: `noreply@${SHOP}`, sendTimePrefs },
    update: { sendTimePrefs },
  });
}

const customerPayload = (id: number, email: string, { subscribed = false } = {}) => ({
  id,
  email,
  first_name: "Sam",
  last_name: "Shopper",
  total_spent: "0.00",
  orders_count: 0,
  created_at: "2026-11-04T10:00:00Z",
  updated_at: "2026-11-04T10:00:00Z",
  email_marketing_consent: {
    state: subscribed ? "subscribed" : "not_subscribed",
    consent_updated_at: "2026-11-04T10:00:00Z",
  },
});

/** The tier every customer starts in. */
const seedBronze = () =>
  prisma.tier.create({ data: { id: "tier-bronze", shop: SHOP, name: "Bronze", minSpend: 0, cashbackPercent: 1 } });

const deliver = (handler: typeof customersCreate, topic: string, body: unknown) =>
  handler({ request: signedWebhook(topic, SHOP, body), params: {}, context: {} });

const DAY = 24 * 60 * 60 * 1000;

/** Two bought Gold memberships: one runs out in 7 days, one ran out yesterday. Everyone else is Bronze. */
async function seedMemberships() {
  await seedBronze();
  const gold = await prisma.tier.create({ data: { id: "tier-gold", shop: SHOP, name: "Gold", minSpend: 1000, cashbackPercent: 5 } });
  const product = await prisma.tierProduct.create({
    data: {
      shop: SHOP,
      tierId: gold.id,
      shopifyProductId: "1",
      shopifyVariantId: "2",
      productHandle: "gold",
      sku: "GOLD",
      purchaseType: "ONE_TIME",
      price: 10,
    },
  });
  for (const [n, email, endDate] of [
    [1, "ending@example.test", new Date(Date.now() + 7 * DAY)],
    [2, "ended@example.test", new Date(Date.now() - DAY)],
  ] as const) {
    const customer = await prisma.customer.create({ data: { shop: SHOP, shopifyCustomerId: `${n}00`, email, currentTierId: gold.id } });
    await prisma.tierPurchase.create({
      data: {
        shop: SHOP,
        customerId: customer.id,
        tierId: gold.id,
        tierProductId: product.id,
        shopifyOrderId: `order-${n}`,
        shopifyLineItemId: `line-${n}`,
        purchasePrice: 10,
        currency: "GBP",
        startDate: new Date(Date.now() - 30 * DAY),
        endDate,
      },
    });
  }
  return { gold, product };
}

async function runTierMaintenance() {
  const response = await tierMaintenance({
    request: new Request("https://test.example.com/api/cron/tier-maintenance", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    }),
    params: {},
    context: {},
  });
  expect(response.status).toBe(200);
}

describe.skipIf(!hasTestDatabase)("shopper emails on Postgres", () => {
  const env = { ...process.env };

  beforeEach(async () => {
    await resetDatabase();
    await prisma.shopSettings.create({ data: { shop: SHOP, storeName: "Card Shop", storeUrl: `https://${SHOP}` } });
    await prisma.shopEntitlements.create({ data: { shop: SHOP } });
    await seedOfflineSession(SHOP);
    process.env.SENDGRID_API_KEY = "SG.test";
    process.env.CRON_SECRET = CRON_SECRET;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
    restoreFailedCalls();
  });

  it("a newly installed shop emails no shopper", async () => {
    const sent = mockSendGrid();
    await seedMemberships();

    expect((await deliver(customersCreate, "customers/create", customerPayload(10, "new@example.test"))).status).toBe(200);
    await runTierMaintenance();

    expect(sent).toEqual([]);
  });

  it("dismissing the Marketing choice turns no shopper email on", async () => {
    const sent = mockSendGrid();
    await markChoiceModalSeen(SHOP);
    await seedMemberships();

    await deliver(customersCreate, "customers/create", customerPayload(10, "new@example.test"));
    await runTierMaintenance();

    expect(sent).toEqual([]);
  });

  it("with Welcome on, welcomes only customers created after install", async () => {
    const sent = mockSendGrid();
    await turnOn("welcome");
    await seedBronze();

    // The first sync after install brings in the store's existing customers
    await syncCustomersInBackground(SHOP, {
      graphql: async () =>
        Response.json({
          data: {
            customers: {
              edges: [
                {
                  cursor: "a",
                  node: {
                    id: "gid://shopify/Customer/1",
                    email: "existing@example.test",
                    displayName: "Existing",
                    createdAt: "2025-01-01T00:00:00Z",
                    updatedAt: "2025-01-01T00:00:00Z",
                    emailMarketingConsent: { marketingState: "SUBSCRIBED", consentUpdatedAt: "2025-01-01T00:00:00Z" },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }),
    });
    // An existing customer the sync hasn't reached yet updates their details
    await deliver(customersUpdate, "customers/update", customerPayload(2, "updated@example.test", { subscribed: true }));
    expect(await prisma.customer.count({ where: { shop: SHOP } })).toBe(2);
    expect(sent).toEqual([]);

    // A new customer signs up, and Shopify delivers it twice
    await deliver(customersCreate, "customers/create", customerPayload(3, "new@example.test", { subscribed: true }));
    await deliver(customersCreate, "customers/create", customerPayload(3, "new@example.test", { subscribed: true }));

    expect(sent).toEqual(["new@example.test"]);
  });

  it("with Welcome on, welcomes no new customer who hasn't agreed to marketing email or has no tier", async () => {
    const sent = mockSendGrid();
    await turnOn("welcome");

    // The shop has no tiers yet
    await deliver(customersCreate, "customers/create", customerPayload(4, "no-tier@example.test", { subscribed: true }));
    await seedBronze();
    // Checked out without ticking "email me with news and offers"
    await deliver(customersCreate, "customers/create", customerPayload(5, "not-subscribed@example.test"));
    await deliver(customersCreate, "customers/create", customerPayload(6, "subscribed@example.test", { subscribed: true }));

    expect(await prisma.customer.count({ where: { shop: SHOP } })).toBe(3);
    expect(sent).toEqual(["subscribed@example.test"]);
  });

  it("sends the membership reminder only once it is on, and nothing else", async () => {
    const sent = mockSendGrid();
    await turnOn("membershipReminder");
    await seedMemberships();

    await runTierMaintenance();

    expect(sent).toEqual(["ending@example.test"]);
  });

  it("sends the membership-ended email only once it is on, and nothing else", async () => {
    const sent = mockSendGrid();
    await turnOn("membershipEnded");
    await seedMemberships();

    await runTierMaintenance();

    expect(sent).toEqual(["ended@example.test"]);
  });

  it("sends nothing through SendGrid for a shop that sends through Klaviyo", async () => {
    const sent = mockSendGrid();
    await turnOn("welcome", "membershipReminder", "membershipEnded");
    await prisma.emailSettings.update({ where: { shop: SHOP }, data: { emailProvider: "KLAVIYO", marketingHubMode: "KLAVIYO" } });
    await seedMemberships();

    await deliver(customersCreate, "customers/create", customerPayload(10, "new@example.test"));
    await runTierMaintenance();

    expect(sent).toEqual([]);
  });

  it("tells only shoppers who really lose their tier, and names the tier they move to", async () => {
    const sent = mockSendGrid();
    await turnOn("membershipReminder", "membershipEnded");
    const { gold, product } = await seedMemberships();

    // The shopper whose membership ends in 7 days has bought it again
    const ending = await prisma.customer.findFirstOrThrow({ where: { shop: SHOP, email: "ending@example.test" } });
    await prisma.tierPurchase.create({
      data: {
        shop: SHOP,
        customerId: ending.id,
        tierId: gold.id,
        tierProductId: product.id,
        shopifyOrderId: "order-renewal",
        shopifyLineItemId: "line-renewal",
        purchasePrice: 10,
        currency: "GBP",
        startDate: new Date(),
        endDate: new Date(Date.now() + 37 * DAY),
      },
    });

    // A shopper whose membership ran out yesterday, but who spent enough this
    // year to be Gold anyway
    const spender = await prisma.customer.create({
      data: { shop: SHOP, shopifyCustomerId: "300", email: "spender@example.test", currentTierId: gold.id },
    });
    await prisma.tierPurchase.create({
      data: {
        shop: SHOP,
        customerId: spender.id,
        tierId: gold.id,
        tierProductId: product.id,
        shopifyOrderId: "order-3",
        shopifyLineItemId: "line-3",
        purchasePrice: 10,
        currency: "GBP",
        startDate: new Date(Date.now() - 30 * DAY),
        endDate: new Date(Date.now() - DAY),
      },
    });
    const placedAt = new Date(Date.now() - 10 * DAY);
    await prisma.order.create({
      data: {
        shop: SHOP,
        shopifyOrderId: "5001",
        shopifyOrderNumber: "#5001",
        shopifyOrderName: "#5001",
        customerId: spender.id,
        email: "",
        currency: "GBP",
        subtotalPrice: 1200,
        totalDiscounts: 0,
        totalShipping: 0,
        totalTax: 0,
        totalPrice: 1200,
        netAmount: 1200,
        financialStatus: "PAID",
        shopifyCreatedAt: placedAt,
        shopifyUpdatedAt: placedAt,
      },
    });

    await runTierMaintenance();

    expect(sent).toEqual(["ended@example.test"]);
    const ended = await prisma.emailEvent.findFirstOrThrow({ where: { shop: SHOP, eventType: "TIER_EXPIRED" } });
    expect(ended.metadata).toMatchObject({ expiredTierName: "Gold", newTierName: "Bronze" });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: spender.id } })).currentTierId).toBe(gold.id);
  });
  it("puts a membership back and emails no one when the shopper's tier can't be worked out", async () => {
    const sent = mockSendGrid();
    await turnOn("membershipEnded");
    await seedBronze();
    const gold = await prisma.tier.create({ data: { id: "tier-gold", shop: SHOP, name: "Gold", minSpend: 1000, cashbackPercent: 5 } });
    const product = await prisma.tierProduct.create({
      data: {
        shop: SHOP,
        tierId: gold.id,
        shopifyProductId: "1",
        shopifyVariantId: "2",
        productHandle: "gold",
        sku: "GOLD",
        purchaseType: "ONE_TIME",
        price: 10,
      },
    });
    // Ran out yesterday, but the shopper spent enough this year to stay Gold
    const spender = await prisma.customer.create({
      data: { shop: SHOP, shopifyCustomerId: "300", email: "spender@example.test", currentTierId: gold.id },
    });
    const purchase = await prisma.tierPurchase.create({
      data: {
        shop: SHOP,
        customerId: spender.id,
        tierId: gold.id,
        tierProductId: product.id,
        shopifyOrderId: "order-3",
        shopifyLineItemId: "line-3",
        purchasePrice: 10,
        currency: "GBP",
        startDate: new Date(Date.now() - 30 * DAY),
        endDate: new Date(Date.now() - DAY),
      },
    });
    const placedAt = new Date(Date.now() - 10 * DAY);
    await prisma.order.create({
      data: {
        shop: SHOP,
        shopifyOrderId: "5001",
        shopifyOrderNumber: "#5001",
        shopifyOrderName: "#5001",
        customerId: spender.id,
        email: "",
        currency: "GBP",
        subtotalPrice: 1200,
        totalDiscounts: 0,
        totalShipping: 0,
        totalTax: 0,
        totalPrice: 1200,
        netAmount: 1200,
        financialStatus: "PAID",
        shopifyCreatedAt: placedAt,
        shopifyUpdatedAt: placedAt,
      },
    });

    // The read of the shopper's orders fails once (a dropped pooled connection)
    failNextCall("order", "findMany", new Error("Server has closed the connection"));

    const response = await tierMaintenance({
      request: new Request("https://test.example.com/api/cron/tier-maintenance", {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }),
      params: {},
      context: {},
    });

    expect(response.status).toBe(500);
    expect((await response.json()).summary.errorCount).toBe(1);
    expect(sent).toEqual([]);
    expect((await prisma.tierPurchase.findUniqueOrThrow({ where: { id: purchase.id } })).status).toBe("ACTIVE");
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: spender.id } })).currentTierId).toBe(gold.id);
  });
});
