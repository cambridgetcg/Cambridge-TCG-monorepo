import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { delay, graphql, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { ensureMerchant, findConnection, setRunning } from "~/lib/merchant.server";
import { tierSpend } from "~/lib/tiers.server";
import { flushWaitUntil } from "~/lib/wait-until.server";
import { WEBHOOK_READ_DEADLINE_MS } from "~/shopify/order-source.server";
import eurOnGbp from "../fixtures/orders/eur-on-gbp.json";
import plain from "../fixtures/orders/plain.json";
import refundMoneyOnly from "../fixtures/orders/refund-money-only.json";
import { server } from "../setup";
import { hasTestDatabase, resetDatabase } from "./helpers/database";
import { type FixtureAnswer, adminGraphqlUrl, mockOrderFacts, mockStoreCredit, seedOfflineSession, signedWebhook } from "./helpers/shopify";

/**
 * The order webhooks on Postgres, adapted from apps/rewardspro's
 * orders-paid.integration.test.ts: deliveries signed as Shopify signs them,
 * the real authenticate.webhook and offline session, and Admin GraphQL
 * answered by MSW by operation name (RewardsOrderFacts, RewardsRefundFacts,
 * RewardsCredit, RewardsDebit, RewardsBalance). The old suite's decimal,
 * currency, guest and lost-answer cases are kept; its idempotency-row,
 * email and Sync Orders cases have no counterpart (no webhook table, no
 * buyer email, Ruling 24 is A8's).
 */

type Routes = {
  paid: typeof import("~/routes/webhooks.orders.paid");
  refunded: typeof import("~/routes/webhooks.orders.refunded");
  cancelled: typeof import("~/routes/webhooks.orders.cancelled");
  scopesUpdate: typeof import("~/routes/webhooks.app.scopes_update");
  ignored: Array<[string, { action: (args: never) => Promise<Response> }]>;
};

const SHOP = "order-webhooks.myshopify.com";
const BUYER = "7001";
const ORDER = "gid://shopify/Order/5001";
const REFUND = "gid://shopify/Refund/6201";
const INSTALLED = new Date("2026-11-01T09:00:00Z");
const HOUR = 3_600_000;

const clone = <T>(value: T): T => structuredClone(value);

/** The plain £50 order (line items £30 + £20, £5 shipping) by BUYER, with changes. */
function plainOrder(change: (order: Record<string, unknown>) => void = () => {}): FixtureAnswer {
  const answer = clone(plain) as FixtureAnswer;
  change(answer.data.order as Record<string, unknown>);
  return answer;
}

/** A refund of the plain order of £`amount` of money, no items and no shipping. */
function moneyRefund(amount: string): FixtureAnswer {
  const answer = clone(refundMoneyOnly) as FixtureAnswer;
  Object.assign(answer.data.refund as object, {
    id: REFUND,
    createdAt: new Date().toISOString(),
    order: { id: ORDER },
    transactions: { nodes: [{ kind: "REFUND", status: "SUCCESS", amountSet: { shopMoney: { amount }, presentmentMoney: { amount } } }] },
  });
  return answer;
}

/** Shopify's orders/paid (and orders/cancelled) payload, as much of it as the routes read: no buyer data. */
const orderPayload = (gid = ORDER, extra: Record<string, unknown> = {}) => ({ id: Number(gid.split("/").pop()), admin_graphql_api_id: gid, ...extra });
/** Shopify's refunds/create payload, as much of it as the route reads. */
const refundPayload = () => ({ id: 6201, order_id: 5001, created_at: new Date().toISOString() });

/** A running GBP shop installed on INSTALLED with the given tiers, and its offline session. */
async function seedShop(o: { tiers?: Array<{ name: string; minSpend: string; percent: string }>; session?: boolean } = {}) {
  await ensureMerchant({ shop: SHOP, name: "Order Webhooks", currency: "GBP", timezone: "Europe/London", now: INSTALLED });
  const conn = await findConnection(SHOP);
  if (!conn) throw new Error("no connection");
  const tiers = o.tiers ?? [{ name: "Everyone", minSpend: "0", percent: "5.00" }];
  for (const [position, tier] of tiers.entries()) {
    await prisma.tier.create({
      data: {
        merchantId: conn.merchantId,
        name: tier.name,
        minSpend: new Prisma.Decimal(tier.minSpend),
        cashbackPercent: new Prisma.Decimal(tier.percent),
        position,
      },
    });
  }
  expect(await setRunning(conn.merchantId, true)).toEqual({ ok: true });
  if (o.session !== false) await seedOfflineSession(SHOP);
  return conn;
}

const credits = (calls: ReturnType<typeof mockStoreCredit>) => calls.filter((c) => c.operation === "credit");
const sent = (calls: ReturnType<typeof mockStoreCredit>) => calls.map((c) => `${c.operation} ${c.amount} ${c.currency}`);

describe.skipIf(!hasTestDatabase)("order webhooks", () => {
  let routes: Routes;
  const args = (request: Request) => ({ request, params: {}, context: {} }) as never;
  const deliverPaid = (payload: unknown = orderPayload(), apiVersion?: string) =>
    routes.paid.action(args(signedWebhook("orders/paid", SHOP, payload, crypto.randomUUID(), apiVersion)));
  const deliverRefund = () => routes.refunded.action(args(signedWebhook("refunds/create", SHOP, refundPayload())));
  const deliverCancelled = (payload: unknown) => routes.cancelled.action(args(signedWebhook("orders/cancelled", SHOP, payload)));

  beforeAll(async () => {
    // ~/shopify.server builds its session storage at import, which checks the
    // Session table at once, so the routes are imported only with a test
    // database. The library logs its version at start.
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.SHOPIFY_API_KEY = "test-api-key";
    routes = {
      paid: await import("~/routes/webhooks.orders.paid"),
      refunded: await import("~/routes/webhooks.orders.refunded"),
      cancelled: await import("~/routes/webhooks.orders.cancelled"),
      scopesUpdate: await import("~/routes/webhooks.app.scopes_update"),
      ignored: [
        ["orders/create", await import("~/routes/webhooks.orders.create")],
        ["orders/fulfilled", await import("~/routes/webhooks.orders.fulfilled")],
        ["customers/create", await import("~/routes/webhooks.customers.create")],
        ["customers/update", await import("~/routes/webhooks.customers.update")],
        ["products/update", await import("~/routes/webhooks.products.update")],
      ],
    };
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    // No work after a response outlives its test
    await flushWaitUntil();
    vi.mocked(console.log).mockClear();
  });

  afterAll(async () => {
    delete process.env.SHOPIFY_API_KEY;
    vi.restoreAllMocks();
    await prisma.$disconnect();
  });

  describe("orders/paid", () => {
    it("rejects a bad HMAC with 401", async () => {
      await seedShop();
      const request = signedWebhook("orders/paid", SHOP, orderPayload());
      request.headers.set("X-Shopify-Hmac-Sha256", crypto.createHmac("sha256", "not-the-secret").update("{}").digest("base64"));

      // Thrown, as authenticate.webhook throws it; React Router sends it as it is
      await expect(routes.paid.action(args(request))).rejects.toMatchObject({ status: 401 });
      await expect(prisma.order.count()).resolves.toBe(0);
    });

    it("an unknown shop answers 200 and writes nothing", async () => {
      // No MSW answers: a call to Shopify would fail the test
      const res = await deliverPaid();

      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(`[orders/paid] No store connection for ${SHOP}; nothing to do`);
      await expect(prisma.merchant.count()).resolves.toBe(0);
      await expect(prisma.order.count()).resolves.toBe(0);
    });

    it("no session answers 500 so Shopify retries", async () => {
      await seedShop({ session: false });
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await deliverPaid();

      expect(res.status).toBe(500);
      expect(logged).toHaveBeenCalledWith(`[orders/paid] No usable session for ${SHOP}; Shopify will deliver it again`);
      await expect(prisma.order.count()).resolves.toBe(0);
    });

    it("records the order, answers, then sends the credit after the response", async () => {
      await seedShop();
      mockOrderFacts(SHOP, { orders: [plainOrder()] });
      const calls = mockStoreCredit(SHOP, {});

      const res = await deliverPaid();

      expect(res.status).toBe(200);
      // Nothing sent before the answer
      expect(credits(calls)).toHaveLength(0);
      const order = await prisma.order.findFirstOrThrow({ include: { ledgerEntries: { include: { payout: true } } } });
      expect(order).toMatchObject({ externalOrderId: ORDER, name: "#1001", source: "live", currency: "GBP" });
      // Its payout written with it (the send after the response may already have claimed it)
      expect(order.ledgerEntries.map((e) => [e.kind, e.amount.toFixed(2), e.payout?.amount.toFixed(2)])).toEqual([["cashback", "2.50", "2.50"]]);

      await flushWaitUntil();

      expect(sent(calls)).toEqual(["credit 2.50 GBP"]);
      await expect(prisma.payout.findFirstOrThrow()).resolves.toMatchObject({ state: "sent" });
      // Then the tier is resolved
      const customer = await prisma.customer.findFirstOrThrow();
      expect(customer).toMatchObject({ externalCustomerId: BUYER });
      expect(customer.resolvedAt).not.toBeNull();
    });

    it("pays an exact decimal, rounded half up: 3.33% of £50 is £1.67", async () => {
      await seedShop({ tiers: [{ name: "Everyone", minSpend: "0", percent: "3.33" }] });
      mockOrderFacts(SHOP, { orders: [plainOrder()] });
      const calls = mockStoreCredit(SHOP, {});

      expect((await deliverPaid()).status).toBe(200);
      await flushWaitUntil();

      expect(sent(calls)).toEqual(["credit 1.67 GBP"]);
      const [entry] = await prisma.ledgerEntry.findMany();
      expect([entry.amount.toFixed(4), entry.ratePercent?.toFixed(2)]).toEqual(["1.6700", "3.33"]);
    });

    it("credits a euro order on a GBP shop in euros, keeping the pounds for the shop's totals", async () => {
      await seedShop();
      mockOrderFacts(SHOP, { orders: [clone(eurOnGbp) as FixtureAnswer] });
      const calls = mockStoreCredit(SHOP, {}, { currency: "EUR" });

      expect((await deliverPaid(orderPayload("gid://shopify/Order/5008"))).status).toBe(200);
      await flushWaitUntil();

      // (€58 − €5.80 discount − €11.60 store credit) × 5%; in pounds (£50 − £5 − £10) × 5%
      expect(sent(calls)).toEqual(["credit 2.03 EUR"]);
      const [entry] = await prisma.ledgerEntry.findMany();
      expect([entry.currency, entry.amount.toFixed(2), entry.shopAmount.toFixed(2)]).toEqual(["EUR", "2.03", "1.75"]);
      const order = await prisma.order.findFirstOrThrow();
      expect([order.currency, order.productAmount.toFixed(2), order.shopProductAmount.toFixed(2)]).toEqual(["EUR", "52.20", "45.00"]);
    });

    it("records nothing for a guest checkout", async () => {
      await seedShop();
      mockOrderFacts(SHOP, { orders: [plainOrder((order) => (order.customer = null))] });
      const calls = mockStoreCredit(SHOP, {});

      expect((await deliverPaid()).status).toBe(200);
      await flushWaitUntil();

      expect(calls).toEqual([]);
      await expect(prisma.order.count()).resolves.toBe(0);
      await expect(prisma.customer.count()).resolves.toBe(0);
    });

    it("a duplicate delivery makes no second credit", async () => {
      await seedShop();
      mockOrderFacts(SHOP, { orders: [plainOrder()] });
      const calls = mockStoreCredit(SHOP, {});

      expect((await deliverPaid()).status).toBe(200);
      await flushWaitUntil();
      expect((await deliverPaid()).status).toBe(200);
      await flushWaitUntil();

      expect(sent(calls)).toEqual(["credit 2.50 GBP"]);
      await expect(prisma.order.count()).resolves.toBe(1);
      await expect(prisma.ledgerEntry.count()).resolves.toBe(1);
    });

    it("never sends the credit again when Shopify's answer to it is lost", async () => {
      await seedShop();
      mockOrderFacts(SHOP, { orders: [plainOrder()] });
      // Shopify applies the credit; the connection drops before its answer
      const calls = mockStoreCredit(SHOP, {}, { unanswered: 1 });

      expect((await deliverPaid()).status).toBe(200);
      await flushWaitUntil();
      await expect(prisma.payout.findFirstOrThrow()).resolves.toMatchObject({ state: "unconfirmed" });

      // Shopify delivers orders/paid again
      expect((await deliverPaid()).status).toBe(200);
      await flushWaitUntil();

      expect(sent(calls)).toEqual(["credit 2.50 GBP"]);
      await expect(prisma.payout.findFirstOrThrow()).resolves.toMatchObject({ state: "unconfirmed" });
    });

    it("answers 500 when Shopify's answer can't be read as an order, logging only the order id", async () => {
      await seedShop();
      // An order with none of its fields
      mockOrderFacts(SHOP, { orders: [{ data: { shop: { currencyCode: "GBP" }, order: { id: ORDER } } }] });
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await deliverPaid();

      expect(res.status).toBe(500);
      expect(logged).toHaveBeenCalledWith(
        `[orders/paid] Could not read order ${ORDER} for ${SHOP}; Shopify will deliver it again: Expected the order's line items in Shopify's answer`,
      );
      await expect(prisma.order.count()).resolves.toBe(0);
    });

    it("answers 500 when Shopify answers the read with an error", async () => {
      await seedShop();
      server.use(
        graphql.link(adminGraphqlUrl(SHOP)).query("RewardsOrderFacts", () =>
          HttpResponse.json({ errors: [{ message: "Internal error", extensions: { code: "INTERNAL_SERVER_ERROR" } }] }),
        ),
      );
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await deliverPaid();

      expect(res.status).toBe(500);
      expect(logged).toHaveBeenCalledWith(`[orders/paid] Order ${ORDER} for ${SHOP} failed; Shopify will deliver it again: Internal error`);
      await expect(prisma.order.count()).resolves.toBe(0);
    });

    it.each(["2026-01", "2026-10"])("accepts deliveries signed with X-Shopify-API-Version %s", async (apiVersion) => {
      await seedShop();
      mockOrderFacts(SHOP, { orders: [plainOrder()] });
      const calls = mockStoreCredit(SHOP, {});

      expect((await deliverPaid(orderPayload(), apiVersion)).status).toBe(200);
      await flushWaitUntil();

      expect(sent(calls)).toEqual(["credit 2.50 GBP"]);
    });

    it("answers 400 for a delivery of another topic", async () => {
      await seedShop();

      const res = await routes.paid.action(args(signedWebhook("orders/create", SHOP, orderPayload())));

      expect(res.status).toBe(400);
    });
  });

  describe("refunds/create", () => {
    it("refund for an unrecorded order: 503 within 4 h, 200 after", async () => {
      await seedShop();
      const orders = [plainOrder((order) => (order.createdAt = new Date(Date.now() - HOUR).toISOString()))];
      mockOrderFacts(SHOP, { orders, refunds: [moneyRefund("10.0")] });
      mockStoreCredit(SHOP, {});

      // orders/paid may still record it: Shopify delivers the refund again
      expect((await deliverRefund()).status).toBe(503);

      // A guest's order is never recorded
      orders[0] = plainOrder((order) => {
        order.createdAt = new Date(Date.now() - HOUR).toISOString();
        order.customer = null;
      });
      expect((await deliverRefund()).status).toBe(200);

      // Past Shopify's 4 h of retries
      orders[0] = plainOrder((order) => (order.createdAt = new Date(Date.now() - 5 * HOUR).toISOString()));
      expect((await deliverRefund()).status).toBe(200);

      await expect(prisma.refund.count()).resolves.toBe(0);
    });

    it("refund while the credit is mid-send: 503", async () => {
      await seedShop();
      mockOrderFacts(SHOP, { orders: [plainOrder()], refunds: [moneyRefund("10.0")] });
      const statuses: number[] = [];
      const calls = mockStoreCredit(SHOP, {}, { duringCredit: async () => void statuses.push((await deliverRefund()).status) });

      expect((await deliverPaid()).status).toBe(200);
      await flushWaitUntil();

      expect(statuses).toEqual([503]);
      expect(sent(calls)).toEqual(["credit 2.50 GBP"]);
      await expect(prisma.refund.count()).resolves.toBe(0);
    });

    it("a refund after the credit was sent takes its share back after the response", async () => {
      await seedShop();
      mockOrderFacts(SHOP, { orders: [plainOrder()], refunds: [moneyRefund("10.0")] });
      const calls = mockStoreCredit(SHOP, {});
      expect((await deliverPaid()).status).toBe(200);
      await flushWaitUntil();

      const res = await deliverRefund();

      expect(res.status).toBe(200);
      expect(sent(calls)).toEqual(["credit 2.50 GBP"]);
      await expect(prisma.payout.findFirstOrThrow({ where: { direction: "debit" } })).resolves.toMatchObject({ amount: new Prisma.Decimal("0.5") });
      await flushWaitUntil();
      // £10 of £50 of products: a fifth of £2.50
      expect(sent(calls)).toEqual(["credit 2.50 GBP", "debit 0.50 GBP"]);
      await expect(prisma.payout.findFirstOrThrow({ where: { direction: "debit" } })).resolves.toMatchObject({ state: "sent" });

      // Shopify's redelivery takes nothing more
      expect((await deliverRefund()).status).toBe(200);
      await flushWaitUntil();
      expect(calls).toHaveLength(2);
    });

    it("reads the refund and then its order within one deadline from receipt, inside Shopify's 5 s", async () => {
      await seedShop();
      const orders = [plainOrder((order) => (order.createdAt = new Date(Date.now() - HOUR).toISOString()))];
      mockOrderFacts(SHOP, { refunds: [moneyRefund("10.0")] });
      // Each order read takes 2.2 s: readRefund's, then the not-recorded check's
      server.use(
        graphql.link(adminGraphqlUrl(SHOP)).query("RewardsOrderFacts", async () => {
          await delay(2200);
          return HttpResponse.json(orders[0]);
        }),
      );
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const start = Date.now();

      const res = await deliverRefund();

      // Each read alone fits its own 4.5 s; together they would answer at 4.4 s
      expect(res.status).toBe(500);
      expect(Date.now() - start).toBeLessThan(WEBHOOK_READ_DEADLINE_MS + 300);
      expect(logged).toHaveBeenCalledWith(expect.stringMatching(/^\[refunds\/create\] Refund gid:\/\/shopify\/Refund\/6201 for .+ failed; Shopify will deliver it again: Shopify did not answer within/));
    });

    it("a refund Shopify no longer has answers 200", async () => {
      await seedShop();
      mockOrderFacts(SHOP, {});

      expect((await deliverRefund()).status).toBe(200);
    });
  });

  describe("orders/cancelled", () => {
    const TIERS = [
      { name: "Bronze", minSpend: "0", percent: "2.00" },
      { name: "Gold", minSpend: "40", percent: "5.00" },
    ];

    it("cancelled order leaves tier spend", async () => {
      const conn = await seedShop({ tiers: TIERS });
      mockOrderFacts(SHOP, { orders: [plainOrder()] });
      const calls = mockStoreCredit(SHOP, {});
      expect((await deliverPaid()).status).toBe(200);
      await flushWaitUntil();
      const tierName = async () => (await prisma.customer.findFirstOrThrow({ include: { tier: true } })).tier?.name;
      const customer = await prisma.customer.findFirstOrThrow();
      // Bronze's 2% before this order's spend counts; its £50 then makes Gold
      expect(sent(calls)).toEqual(["credit 1.00 GBP"]);
      await expect(tierName()).resolves.toBe("Gold");

      const res = await deliverCancelled(orderPayload(ORDER, { cancelled_at: "2026-11-03T09:00:00Z" }));

      expect(res.status).toBe(200);
      await expect(prisma.order.findFirstOrThrow()).resolves.toMatchObject({ cancelledAt: new Date("2026-11-03T09:00:00Z") });
      await flushWaitUntil();
      expect((await tierSpend(customer.id, conn.tierWindow, new Date())).toFixed(2)).toBe("0.00");
      await expect(tierName()).resolves.toBe("Bronze");
      // Money moves only with refunds
      expect(sent(calls)).toEqual(["credit 1.00 GBP"]);
    });

    it("keeps the first cancellation time, and answers 200 for an order never recorded", async () => {
      await seedShop();
      mockOrderFacts(SHOP, { orders: [plainOrder()] });
      mockStoreCredit(SHOP, {});
      expect((await deliverPaid()).status).toBe(200);
      await flushWaitUntil();

      expect((await deliverCancelled(orderPayload(ORDER, { cancelled_at: "2026-11-03T09:00:00Z" }))).status).toBe(200);
      expect((await deliverCancelled(orderPayload(ORDER, { cancelled_at: "2026-11-04T09:00:00Z" }))).status).toBe(200);
      expect((await deliverCancelled(orderPayload("gid://shopify/Order/9999", { cancelled_at: "2026-11-04T09:00:00Z" }))).status).toBe(200);

      await expect(prisma.order.findMany()).resolves.toMatchObject([{ externalOrderId: ORDER, cancelledAt: new Date("2026-11-03T09:00:00Z") }]);
    });
  });

  describe("the other subscribed topics", () => {
    it("app/scopes_update stores the granted scopes on the shop's session", async () => {
      await seedShop();

      const res = await routes.scopesUpdate.action(
        args(signedWebhook("app/scopes_update", SHOP, { previous: ["read_orders"], current: ["read_orders", "read_customers"] })),
      );

      expect(res.status).toBe(200);
      await expect(prisma.session.findUniqueOrThrow({ where: { id: `offline_${SHOP}` } })).resolves.toMatchObject({
        scope: "read_orders,read_customers",
      });
    });

    it("the ignored topics are verified and answered 200, and write nothing", async () => {
      await seedShop();
      for (const [topic, route] of routes.ignored) {
        await expect(route.action(args(signedWebhook(topic, SHOP, { id: 1 }))), topic).resolves.toMatchObject({ status: 200 });
        const unsigned = signedWebhook(topic, SHOP, { id: 1 });
        unsigned.headers.set("X-Shopify-Hmac-Sha256", "not-a-signature");
        await expect(route.action(args(unsigned)), topic).rejects.toMatchObject({ status: 401 });
      }
      await expect(prisma.order.count()).resolves.toBe(0);
    });
  });
});
