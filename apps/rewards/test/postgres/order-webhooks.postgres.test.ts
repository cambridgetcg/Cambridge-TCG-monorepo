import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { delay, graphql, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { ensureMerchant, findConnection, setRunning } from "~/lib/merchant.server";
import { tierSpend } from "~/lib/tiers.server";
import { NO_USABLE_SESSION } from "~/lib/webhook-helpers.server";
import { monitoring } from "~/lib/telemetry.server";
import { flushWaitUntil } from "~/lib/wait-until.server";
import { recordOrder } from "~/lib/record-order.server";
import { WEBHOOK_READ_DEADLINE_MS, factsFromOrderNode } from "~/shopify/order-source.server";
import eurOnGbp from "../fixtures/orders/eur-on-gbp.json";
import plain from "../fixtures/orders/plain.json";
import refundMoneyOnly from "../fixtures/orders/refund-money-only.json";
import { server } from "../setup";
import { hasTestDatabase, resetDatabase } from "./helpers/database";
import {
  type FixtureAnswer,
  adminGraphqlUrl,
  mockOrderFacts,
  mockStoreCredit,
  seedExpiredSessionWhoseRefreshIsRefused,
  seedOfflineSession,
  signedWebhook,
} from "./helpers/shopify";

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

/** The plain order created `createdHoursAgo` hours ago and paid (its SALE processed) `paidHoursAgo` hours ago. */
const paidOrder = (createdHoursAgo: number, paidHoursAgo: number, change: (order: Record<string, unknown>) => void = () => {}) =>
  plainOrder((order) => {
    order.createdAt = new Date(Date.now() - createdHoursAgo * HOUR).toISOString();
    order.processedAt = order.createdAt;
    for (const tx of order.transactions as Array<Record<string, unknown>>) tx.processedAt = new Date(Date.now() - paidHoursAgo * HOUR).toISOString();
    change(order);
  });

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

    it("no session answers 500 so Shopify retries, and reaches monitoring (M2b-F4)", async () => {
      await seedShop({ session: false });
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const capture = vi.spyOn(monitoring, "captureException").mockImplementation(() => {});
      capture.mockClear();

      const res = await deliverPaid();

      expect(res.status).toBe(500);
      expect(logged).toHaveBeenCalledWith(expect.stringContaining(`[orders/paid] No usable session for ${SHOP}; Shopify will deliver it again`));
      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture.mock.calls[0][1]).toEqual({ tags: { "webhook.topic": "orders/paid" } });
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

    it("a failure answers 500 and reaches monitoring once, tagged with its topic", async () => {
      await seedShop();
      mockOrderFacts(SHOP, { orders: [plainOrder()] });
      mockStoreCredit(SHOP, {});
      const capture = vi.spyOn(monitoring, "captureException").mockImplementation(() => {});
      capture.mockClear();
      vi.spyOn(console, "error").mockImplementation(() => {});
      // recordOrder's transaction fails, as a dropped pooled connection would.
      // Patched by hand: a vi.spyOn restore leaves the client's method undefined.
      const failure = new Error("connection reset");
      const client = prisma as unknown as { $transaction: unknown };
      const transaction = client.$transaction;
      client.$transaction = () => Promise.reject(failure);

      let res: Response;
      try {
        res = await deliverPaid();
      } finally {
        client.$transaction = transaction;
      }

      expect(res.status).toBe(500);
      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture).toHaveBeenCalledWith(failure, { tags: { "webhook.topic": "orders/paid" } });
      await expect(prisma.order.count()).resolves.toBe(0);
    });

    it("the designed answers reach no monitoring", async () => {
      await seedShop();
      const capture = vi.spyOn(monitoring, "captureException").mockImplementation(() => {});
      capture.mockClear();
      mockOrderFacts(SHOP, { orders: [paidOrder(1, 1)], refunds: [moneyRefund("10.0")] });

      // 503: the refund's order is not recorded yet
      expect((await deliverRefund()).status).toBe(503);
      const unsigned = signedWebhook("orders/cancelled", SHOP, orderPayload());
      unsigned.headers.set("X-Shopify-Hmac-Sha256", "not-a-signature");
      expect((await routes.cancelled.action(args(unsigned))).status).toBe(401);

      expect(capture).not.toHaveBeenCalled();
    });
  });

  describe("refunds/create", () => {
    it("refund for an unrecorded order: 503 within 4 h of its payment, 200 after", async () => {
      await seedShop();
      const orders = [paidOrder(1, 1)];
      mockOrderFacts(SHOP, { orders, refunds: [moneyRefund("10.0")] });
      mockStoreCredit(SHOP, {});

      // orders/paid may still record it: Shopify delivers the refund again
      expect((await deliverRefund()).status).toBe(503);

      // A guest's order is never recorded, nor is a test order
      orders[0] = paidOrder(1, 1, (order) => (order.customer = null));
      expect((await deliverRefund()).status).toBe(200);
      orders[0] = paidOrder(1, 1, (order) => (order.test = true));
      expect((await deliverRefund()).status).toBe(200);

      // Past Shopify's 4 h of retries
      orders[0] = paidOrder(5, 5);
      expect((await deliverRefund()).status).toBe(200);

      await expect(prisma.refund.count()).resolves.toBe(0);
    });

    // Ruling 43: orders/paid comes when the order is paid, which can be long after it was created
    it("the 503 window counts from payment: a 6-hour-old order paid 1 hour ago gets 503, one paid 5 hours ago 200", async () => {
      await seedShop();
      const orders = [paidOrder(6, 1)];
      mockOrderFacts(SHOP, { orders, refunds: [moneyRefund("10.0")] });

      expect((await deliverRefund()).status).toBe(503);

      orders[0] = paidOrder(6, 5);
      expect((await deliverRefund()).status).toBe(200);
      await expect(prisma.refund.count()).resolves.toBe(0);
    });

    it("an order with no SALE or CAPTURE time is judged from its processedAt", async () => {
      await seedShop();
      const orders = [
        plainOrder((order) => {
          order.createdAt = new Date(Date.now() - 6 * HOUR).toISOString();
          order.processedAt = new Date(Date.now() - HOUR).toISOString();
        }),
      ];
      mockOrderFacts(SHOP, { orders, refunds: [moneyRefund("10.0")] });

      expect((await deliverRefund()).status).toBe(503);
    });

    it("an unknown shop answers 200 and reads nothing", async () => {
      // No MSW answers: a call to Shopify would fail the test
      const res = await deliverRefund();

      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(`[refunds/create] No store connection for ${SHOP}; nothing to do`);
    });

    it("no session answers 500 so Shopify retries, and reaches monitoring (M2b-F4)", async () => {
      await seedShop({ session: false });
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const capture = vi.spyOn(monitoring, "captureException").mockImplementation(() => {});
      capture.mockClear();

      const res = await deliverRefund();

      expect(res.status).toBe(500);
      expect(logged).toHaveBeenCalledWith(expect.stringContaining(`[refunds/create] No usable session for ${SHOP}; Shopify will deliver it again`));
      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture.mock.calls[0][1]).toEqual({ tags: { "webhook.topic": "refunds/create" } });
    });

    it("answers 400 for a delivery of another topic", async () => {
      await seedShop();

      const res = await routes.refunded.action(args(signedWebhook("orders/paid", SHOP, refundPayload())));

      expect(res.status).toBe(400);
    });

    it("answers 500 when the unrecorded order's own read can't be read, logging only its id", async () => {
      await seedShop();
      const order = paidOrder(1, 1);
      mockOrderFacts(SHOP, { orders: [order], refunds: [moneyRefund("10.0")] });
      // The refund's read gets the order; the not-recorded check's read gets an unreadable answer
      let orderReads = 0;
      server.use(
        graphql.link(adminGraphqlUrl(SHOP)).query("RewardsOrderFacts", () =>
          HttpResponse.json(++orderReads === 1 ? order : { data: { shop: { currencyCode: "GBP" }, order: { id: ORDER } } }),
        ),
      );
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const capture = vi.spyOn(monitoring, "captureException").mockImplementation(() => {});
      capture.mockClear();

      const res = await deliverRefund();

      expect(res.status).toBe(500);
      expect(orderReads).toBe(2);
      expect(logged).toHaveBeenCalledWith(
        `[refunds/create] Could not read order ${ORDER} for ${SHOP}; Shopify will deliver it again: Expected the order's line items in Shopify's answer`,
      );
      expect(capture).toHaveBeenCalledWith(expect.any(Error), { tags: { "webhook.topic": "refunds/create" } });
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

    describe("a refund whose money is still on its way (#195)", () => {
      /** The money-only refund with these REFUND transactions. */
      const withMoney = (txs: Array<{ status: string; amount: string }>) => {
        const answer = moneyRefund("0.0");
        Object.assign(answer.data.refund as object, {
          transactions: {
            nodes: txs.map((tx) => ({ kind: "REFUND", status: tx.status, amountSet: { shopMoney: { amount: tx.amount }, presentmentMoney: { amount: tx.amount } } })),
          },
        });
        return answer;
      };

      it("answers 200 and marks it at £0; a redelivery writes nothing", async () => {
        await seedShop();
        mockOrderFacts(SHOP, { orders: [plainOrder()], refunds: [withMoney([{ status: "PENDING", amount: "20.0" }])] });
        const calls = mockStoreCredit(SHOP, {});
        expect((await deliverPaid()).status).toBe(200);
        await flushWaitUntil();

        expect((await deliverRefund()).status).toBe(200);
        await flushWaitUntil();

        const row = await prisma.refund.findFirstOrThrow();
        expect([row.externalRefundId, row.productAmount.toFixed(2), row.moneyPendingSince instanceof Date]).toEqual([REFUND, "0.00", true]);
        expect(await prisma.ledgerEntry.count({ where: { kind: "reversal" } })).toBe(0);
        expect(sent(calls)).toEqual(["credit 2.50 GBP"]);

        expect((await deliverRefund()).status).toBe(200);
        await flushWaitUntil();
        expect(await prisma.refund.findMany()).toEqual([row]);
        expect(sent(calls)).toEqual(["credit 2.50 GBP"]);
      });

      it("a partly settled one answers 200 and resolves the tier, with no take-back sent", async () => {
        const conn = await seedShop({ tiers: [{ name: "Bronze", minSpend: "0", percent: "2.00" }, { name: "Gold", minSpend: "40", percent: "5.00" }] });
        mockOrderFacts(SHOP, { orders: [plainOrder()], refunds: [withMoney([{ status: "SUCCESS", amount: "15.0" }, { status: "PENDING", amount: "5.0" }])] });
        const calls = mockStoreCredit(SHOP, {});
        expect((await deliverPaid()).status).toBe(200);
        await flushWaitUntil();
        const tierName = async () => (await prisma.customer.findFirstOrThrow({ include: { tier: true } })).tier?.name;
        await expect(tierName()).resolves.toBe("Gold");

        expect((await deliverRefund()).status).toBe(200);
        await flushWaitUntil();

        // £50 less the £15 that has succeeded: £35, under Gold's £40
        const customer = await prisma.customer.findFirstOrThrow();
        expect((await tierSpend(customer.id, conn.tierWindow, new Date())).toFixed(2)).toBe("35.00");
        await expect(tierName()).resolves.toBe("Bronze");
        expect(sent(calls)).toEqual(["credit 1.00 GBP"]);
        expect(await prisma.payout.count({ where: { direction: "debit" } })).toBe(0);
        expect((await prisma.refund.findFirstOrThrow()).moneyPendingSince).toBeInstanceOf(Date);
      });
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

    // Ruling 43: orders/paid may still be on its way, so Shopify is to deliver the cancellation again
    it("an unrecorded order paid within 4 h answers 503, judged from the signed payload", async () => {
      await seedShop();
      const cancelledPayload = (o: Record<string, unknown>) =>
        orderPayload("gid://shopify/Order/9999", {
          cancelled_at: new Date().toISOString(),
          customer: { id: 7001 },
          test: false,
          financial_status: "paid",
          created_at: new Date(Date.now() - 6 * HOUR).toISOString(),
          processed_at: new Date(Date.now() - HOUR).toISOString(),
          ...o,
        });

      expect((await deliverCancelled(cancelledPayload({}))).status).toBe(503);
      expect((await deliverCancelled(cancelledPayload({ financial_status: "partially_refunded" }))).status).toBe(503);
      // With no processed_at, from its creation
      expect((await deliverCancelled(cancelledPayload({ processed_at: null, created_at: new Date(Date.now() - HOUR).toISOString() }))).status).toBe(503);

      // Paid 5 hours ago, a guest's, a test order, or never paid: nothing will record it
      expect((await deliverCancelled(cancelledPayload({ processed_at: new Date(Date.now() - 5 * HOUR).toISOString() }))).status).toBe(200);
      expect((await deliverCancelled(cancelledPayload({ customer: null }))).status).toBe(200);
      expect((await deliverCancelled(cancelledPayload({ test: true }))).status).toBe(200);
      expect((await deliverCancelled(cancelledPayload({ financial_status: "pending" }))).status).toBe(200);
      expect((await deliverCancelled(cancelledPayload({ financial_status: "voided" }))).status).toBe(200);
      await expect(prisma.order.count()).resolves.toBe(0);
    });

    it("is redelivered after orders/paid commits, and then lands", async () => {
      await seedShop();
      mockOrderFacts(SHOP, { orders: [paidOrder(6, 1)] });
      mockStoreCredit(SHOP, {});
      const cancellation = orderPayload(ORDER, {
        cancelled_at: "2026-11-05T09:00:00Z",
        customer: { id: 7001 },
        test: false,
        financial_status: "paid",
        processed_at: new Date(Date.now() - HOUR).toISOString(),
      });

      expect((await deliverCancelled(cancellation)).status).toBe(503);
      expect((await deliverPaid()).status).toBe(200);
      expect((await deliverCancelled(cancellation)).status).toBe(200);

      await expect(prisma.order.findFirstOrThrow()).resolves.toMatchObject({ cancelledAt: new Date("2026-11-05T09:00:00Z") });
    });

    it("answers 400 for a delivery of another topic", async () => {
      await seedShop();

      const res = await routes.cancelled.action(args(signedWebhook("orders/paid", SHOP, orderPayload(ORDER, { cancelled_at: "2026-11-03T09:00:00Z" }))));

      expect(res.status).toBe(400);
    });

    it("an unknown shop answers 200 and writes nothing", async () => {
      const res = await deliverCancelled(orderPayload(ORDER, { cancelled_at: "2026-11-03T09:00:00Z" }));

      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(`[orders/cancelled] No store connection for ${SHOP}; nothing to do`);
      await expect(prisma.order.count()).resolves.toBe(0);
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
  });

  // Ruling 42: a route that never calls Shopify loads no session, so a refresh Shopify refuses can't fail it
  describe("routes that never call Shopify, while the store's refresh would be refused", () => {
    it("orders/cancelled answers 200 and starts no refresh", async () => {
      const conn = await seedShop({ session: false });
      const asked = await seedExpiredSessionWhoseRefreshIsRefused(SHOP);
      // Recorded before the token expired
      await recordOrder(conn, factsFromOrderNode(plainOrder().data.order, "GBP", { refunds: [] }), "live");

      expect((await deliverCancelled(orderPayload(ORDER, { cancelled_at: "2026-11-03T09:00:00Z" }))).status).toBe(200);

      await expect(prisma.order.findFirstOrThrow()).resolves.toMatchObject({ cancelledAt: new Date("2026-11-03T09:00:00Z") });
      expect(asked.refreshes).toBe(0);
    });

    it("app/scopes_update stores the scopes on the shop's offline session without refreshing it", async () => {
      await seedShop({ session: false });
      const asked = await seedExpiredSessionWhoseRefreshIsRefused(SHOP);

      const res = await routes.scopesUpdate.action(
        args(signedWebhook("app/scopes_update", SHOP, { previous: ["read_orders"], current: ["read_orders", "read_customers"] })),
      );

      expect(res.status).toBe(200);
      await expect(prisma.session.findUniqueOrThrow({ where: { id: `offline_${SHOP}` } })).resolves.toMatchObject({
        scope: "read_orders,read_customers",
      });
      expect(asked.refreshes).toBe(0);
    });

    it("orders/paid, which needs Shopify, still tries the refresh (and answers 500 when it is refused, reaching monitoring)", async () => {
      await seedShop({ session: false });
      const asked = await seedExpiredSessionWhoseRefreshIsRefused(SHOP);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const capture = vi.spyOn(monitoring, "captureException").mockImplementation(() => {});
      capture.mockClear();

      await expect(deliverPaid()).rejects.toMatchObject({ status: 500 });
      expect(asked.refreshes).toBe(1);
      // A thrown Response never reaches the server's error handler, so the route reports it (M2b-F4)
      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture.mock.calls[0][1]).toEqual({ tags: { "webhook.topic": "orders/paid" } });
    });

    // shopify-app-react-router 4.0.3: a refresh Shopify refuses with 401 invalid_request (a refresh token no
    // longer active) gives the route no session instead of throwing; the route then answers its own 500
    it("orders/paid of a store whose refresh token is no longer active still answers 500, reported once as no usable session", async () => {
      await seedShop({ session: false });
      const asked = await seedExpiredSessionWhoseRefreshIsRefused(SHOP, { status: 401 });
      vi.spyOn(console, "error").mockImplementation(() => {});
      const capture = vi.spyOn(monitoring, "captureException").mockImplementation(() => {});
      capture.mockClear();

      await expect(deliverPaid()).resolves.toMatchObject({ status: 500 });

      expect(asked.refreshes).toBe(1);
      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture.mock.calls[0][0]).toMatchObject({ message: NO_USABLE_SESSION });
      expect(capture.mock.calls[0][1]).toEqual({ tags: { "webhook.topic": "orders/paid" } });
      await expect(prisma.order.count()).resolves.toBe(0);
    });

    it("refunds/create of a store whose refresh token is no longer active still answers 500, reported once as no usable session", async () => {
      await seedShop({ session: false });
      await seedExpiredSessionWhoseRefreshIsRefused(SHOP, { status: 401 });
      vi.spyOn(console, "error").mockImplementation(() => {});
      const capture = vi.spyOn(monitoring, "captureException").mockImplementation(() => {});
      capture.mockClear();

      await expect(deliverRefund()).resolves.toMatchObject({ status: 500 });

      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture.mock.calls[0][0]).toMatchObject({ message: NO_USABLE_SESSION });
      expect(capture.mock.calls[0][1]).toEqual({ tags: { "webhook.topic": "refunds/create" } });
    });

    it("refunds/create reports a refused refresh too, and answers its 500", async () => {
      await seedShop({ session: false });
      await seedExpiredSessionWhoseRefreshIsRefused(SHOP);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const capture = vi.spyOn(monitoring, "captureException").mockImplementation(() => {});
      capture.mockClear();

      await expect(deliverRefund()).rejects.toMatchObject({ status: 500 });
      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture.mock.calls[0][1]).toEqual({ tags: { "webhook.topic": "refunds/create" } });
    });

    it("a delivery Shopify did not sign is answered 401 and not reported", async () => {
      await seedShop();
      const capture = vi.spyOn(monitoring, "captureException").mockImplementation(() => {});
      capture.mockClear();
      const unsigned = signedWebhook("orders/paid", SHOP, orderPayload(ORDER));
      unsigned.headers.set("X-Shopify-Hmac-Sha256", "bm90IHRoZSBzaWduYXR1cmU=");

      await expect(routes.paid.action(args(unsigned))).rejects.toMatchObject({ status: 401 });
      expect(capture).not.toHaveBeenCalled();
    });
  });
});
