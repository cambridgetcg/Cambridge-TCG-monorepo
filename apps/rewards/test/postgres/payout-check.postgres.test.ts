import { Prisma } from "@prisma/client";
import { graphql, HttpResponse } from "msw";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { acquireCronLock } from "~/lib/cron.server";
import { type ConnectionContext, ensureMerchant, findConnection, setRunning } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import type { MoneyPair, OrderFacts } from "~/lib/order-facts";
import { KEEP_TRYING_MS, sendPayout } from "~/lib/payouts.server";
import type { PayoutRail } from "~/lib/ports";
import { recordOrder } from "~/lib/record-order.server";
import plain from "../fixtures/orders/plain.json";
import { server } from "../setup";
import { hasTestDatabase, resetDatabase } from "./helpers/database";
import {
  type FixtureAnswer,
  adminGraphqlUrl,
  backdateClaim,
  creditHistory,
  mockOrderFacts,
  mockStoreCredit,
  seedOfflineSession,
} from "./helpers/shopify";

/**
 * The hourly payout check through its cron route (api.cron.payouts), adapted
 * from apps/rewardspro's cashback-reconciliation.integration.test.ts: the
 * real route, lock, offline session and Shopify rail, with Admin GraphQL
 * answered by MSW. The old suite's hard cases are kept (a lost answer is
 * never sent again; the three history verdicts; queue fairness; 401), its
 * 7-day stop is replaced by 24 h of backoff (rule 9), and the missed-order
 * sweep (rule 13) is new.
 */

const SHOP = "payout-check.myshopify.com";
const OTHER_SHOP = "payout-check-other.myshopify.com";
const BUYER = "7001";
const CRON_SECRET = "cron-secret-for-tests";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type RecentOrder = { id: string; test: boolean; createdAt: string; customer: { id: string } | null };

function pair(amount: string): MoneyPair {
  return { amount: new Money(amount), shopAmount: new Money(amount) };
}

/** A paid order of £50 of products, an hour ago: 5% earns a £2.50 credit. */
function orderFacts(n: number, buyer = BUYER): OrderFacts {
  return {
    externalOrderId: `gid://shopify/Order/${n}`,
    name: `#${n}`,
    externalCustomerId: buyer,
    currency: "GBP",
    shopCurrency: "GBP",
    test: false,
    cancelledAt: null,
    orderedAt: new Date(Date.now() - HOUR),
    paidAt: new Date(Date.now() - HOUR),
    financialStatus: "PAID",
    total: pair("50.00"),
    productValue: pair("50.00"),
    storeCreditUsed: pair("0"),
    giftCardUsed: pair("0"),
    refundedProductValue: pair("0"),
    refunds: [],
  };
}

/** A running GBP shop installed `installedAgo` ago with one 5% tier, and (by default) its offline session. */
async function runningShop(shop = SHOP, o: { installedAgo?: number; session?: boolean } = {}): Promise<ConnectionContext> {
  const now = new Date(Date.now() - (o.installedAgo ?? 10 * DAY));
  await ensureMerchant({ shop, name: "Payout Check", currency: "GBP", timezone: "Europe/London", now });
  const conn = await findConnection(shop);
  if (!conn) throw new Error("no connection");
  await prisma.tier.create({
    data: { merchantId: conn.merchantId, name: "Everyone", minSpend: new Prisma.Decimal(0), cashbackPercent: new Prisma.Decimal("5.00"), position: 0 },
  });
  expect(await setRunning(conn.merchantId, true)).toEqual({ ok: true });
  if (o.session !== false) await seedOfflineSession(shop);
  return { ...conn, running: true };
}

/** Record order `n`; its £2.50 credit is pending, created `minutesAgo` minutes ago. */
async function pendingCredit(conn: ConnectionContext, n = 5001, o: { minutesAgo?: number; buyer?: string } = {}) {
  const recorded = await recordOrder(conn, orderFacts(n, o.buyer), "live");
  if (recorded.status !== "recorded" || !recorded.payoutId) throw new Error("no payout");
  await prisma.payout.update({ where: { id: recorded.payoutId }, data: { createdAt: new Date(Date.now() - (o.minutesAgo ?? 10) * MINUTE) } });
  return recorded.payoutId;
}

/** A rail that never answers clearly: the send becomes unconfirmed, nothing reaches Shopify. */
const unclearRail: PayoutRail = {
  credit: async () => ({ outcome: "unclear", message: "Shopify answered 502" }),
  debit: async () => ({ outcome: "unclear", message: "Shopify answered 502" }),
  balance: async () => new Money("100"),
  creditHistory: async () => ({ status: "failed", error: "not used" }),
};

/**
 * Answer the sweep's RewardsRecentPaidOrders for `shop` with `orders` (one
 * page). Returns the search queries it was asked.
 */
function mockRecentPaidOrders(shop: string, orders: RecentOrder[] = []): string[] {
  const queries: string[] = [];
  server.use(
    graphql.link(adminGraphqlUrl(shop)).query("RewardsRecentPaidOrders", ({ variables }) => {
      queries.push(String(variables.query));
      return HttpResponse.json({ data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: orders } } });
    }),
  );
  return queries;
}

/** The plain £50 order (£2.50 at 5%) as Shopify reads it, created an hour ago, numbered `n`. */
function plainOrder(n: number): FixtureAnswer {
  const answer = structuredClone(plain) as FixtureAnswer;
  const at = new Date(Date.now() - HOUR).toISOString();
  Object.assign(answer.data.order as object, { id: `gid://shopify/Order/${n}`, name: `#${n}`, createdAt: at, processedAt: at });
  return answer;
}

const recent = (n: number, o: { test?: boolean; guest?: boolean; buyer?: string } = {}): RecentOrder => ({
  id: `gid://shopify/Order/${n}`,
  test: o.test ?? false,
  createdAt: new Date(Date.now() - HOUR).toISOString(),
  customer: o.guest ? null : { id: `gid://shopify/Customer/${o.buyer ?? BUYER}` },
});

const payout = (id: string) => prisma.payout.findUniqueOrThrow({ where: { id } });

describe.skipIf(!hasTestDatabase)("the hourly payout check", () => {
  let loader: typeof import("~/routes/api.cron.payouts").loader;

  const run = async (authorization: string | null = `Bearer ${CRON_SECRET}`) => {
    const response = await loader({
      request: new Request("https://test.example.com/api/cron/payouts", { headers: authorization ? { Authorization: authorization } : {} }),
      params: {},
      context: {},
    } as never);
    const text = await response.text();
    return { status: response.status, body: (text.startsWith("{") ? JSON.parse(text) : {}) as Record<string, unknown> };
  };

  beforeAll(async () => {
    // ~/shopify.server checks the Session table when it loads, so the route
    // is imported only with a test database. The library logs its version.
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.SHOPIFY_API_KEY = "test-api-key";
    ({ loader } = await import("~/routes/api.cron.payouts"));
  });

  beforeEach(async () => {
    await resetDatabase();
    process.env.CRON_SECRET = CRON_SECRET;
    vi.mocked(console.log).mockClear();
  });

  afterAll(async () => {
    delete process.env.SHOPIFY_API_KEY;
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it("requires the cron bearer token", async () => {
    await expect(run(null)).resolves.toMatchObject({ status: 401 });
    await expect(run("Bearer wrong")).resolves.toMatchObject({ status: 401 });
  });

  it("sends a due pending payout, and leaves one created under 2 minutes ago to its own send", async () => {
    const conn = await runningShop();
    const due = await pendingCredit(conn, 5001);
    const fresh = await pendingCredit(conn, 5002, { minutesAgo: 0 });
    const balances = { [BUYER]: "0" };
    const calls = mockStoreCredit(SHOP, balances);
    mockRecentPaidOrders(SHOP);

    const { status, body } = await run();

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, sent: 1, settled: 0, needsLook: 0, swept: 0, problems: 0 });
    expect(calls).toEqual([{ operation: "credit", customerId: BUYER, amount: "2.50", currency: "GBP" }]);
    expect(balances[BUYER]).toBe("2.50");
    await expect(payout(due)).resolves.toMatchObject({ state: "sent", attempts: 1 });
    await expect(payout(fresh)).resolves.toMatchObject({ state: "pending", attempts: 0 });
  });

  it("leaves a payout unconfirmed when Shopify's answer is lost, and never sends it again", async () => {
    const conn = await runningShop();
    const id = await pendingCredit(conn);
    const balances = { [BUYER]: "0" };
    const calls = mockStoreCredit(SHOP, balances, { unanswered: 1 });
    mockRecentPaidOrders(SHOP);

    await expect(run()).resolves.toMatchObject({ status: 200, body: { sent: 0 } });
    await expect(run()).resolves.toMatchObject({ status: 200, body: { sent: 0, settled: 0 } });

    expect(calls).toHaveLength(1);
    expect(balances[BUYER]).toBe("2.50");
    await expect(payout(id)).resolves.toMatchObject({ state: "unconfirmed", attempts: 1 });
  });

  it("retries a payout Shopify turned away with backoff, then needs a look after 24 hours of failures", async () => {
    const conn = await runningShop();
    const id = await pendingCredit(conn);
    const calls = mockStoreCredit(SHOP, { [BUYER]: "0" }, { throttled: 2 });
    mockRecentPaidOrders(SHOP);

    const before = Date.now();
    await run();
    const waiting = await payout(id);
    expect(waiting).toMatchObject({ state: "pending", attempts: 1, lastError: "THROTTLED" });
    // The first retry waits an hour (plan Decision 3)
    expect(waiting.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + HOUR);
    await run();
    expect(calls).toHaveLength(1);

    // A day after the first failure, due again: it needs a look as soon as
    // it is claimed, without asking Shopify again (Ruling 36)
    await prisma.payout.update({
      where: { id },
      data: { nextAttemptAt: new Date(Date.now() - MINUTE), firstFailedAt: new Date(Date.now() - KEEP_TRYING_MS - MINUTE) },
    });
    await expect(run()).resolves.toMatchObject({ body: { sent: 0, needsLook: 1 } });

    expect(calls).toHaveLength(1);
    await expect(payout(id)).resolves.toMatchObject({ state: "needs_look", lookReason: "kept_failing", attempts: 1 });
  });

  describe("payouts Shopify never confirmed", () => {
    it("marks a credit sent when Shopify applied it though its answer was lost, and never sends it again", async () => {
      const conn = await runningShop();
      const id = await pendingCredit(conn);
      const history = creditHistory();
      const balances = { [BUYER]: "0" };
      const calls = mockStoreCredit(SHOP, balances, { unanswered: 1, history });
      mockRecentPaidOrders(SHOP);
      await run();

      // A run soon after leaves it: the send may still be in Shopify's hands
      await expect(run()).resolves.toMatchObject({ body: { settled: 0 } });
      expect(history.reads).toBe(0);

      await backdateClaim(id, 60, history);
      await expect(run()).resolves.toMatchObject({ body: { settled: 1, sent: 0 } });
      await run();

      expect(calls).toHaveLength(1);
      expect(balances[BUYER]).toBe("2.50");
      expect(history.reads).toBe(1);
      await expect(payout(id)).resolves.toMatchObject({ state: "sent", settledBy: "auto", externalTransactionId: history.credits[0].id });
    });

    it("sends again, once, a credit Shopify never applied", async () => {
      const conn = await runningShop();
      const id = await pendingCredit(conn);
      // A run claimed it and stopped before sending (a crash): Shopify has no credit
      await prisma.payout.update({ where: { id }, data: { state: "sending", claimedAt: new Date(), attempts: 1 } });
      await backdateClaim(id, 60);
      const history = creditHistory();
      const balances = { [BUYER]: "0" };
      const calls = mockStoreCredit(SHOP, balances, { history });
      mockRecentPaidOrders(SHOP);

      await expect(run()).resolves.toMatchObject({ body: { settled: 1, sent: 1 } });
      await run();

      expect(calls).toEqual([{ operation: "credit", customerId: BUYER, amount: "2.50", currency: "GBP" }]);
      expect(balances[BUYER]).toBe("2.50");
      await expect(payout(id)).resolves.toMatchObject({ state: "sent", unconfirmedAt: null });
    });

    it("asks the merchant about a credit it cannot match to one Shopify credit, and stops asking Shopify", async () => {
      const conn = await runningShop();
      const id = await pendingCredit(conn);
      const history = creditHistory();
      const calls = mockStoreCredit(SHOP, { [BUYER]: "0" }, { unanswered: 1, history });
      mockRecentPaidOrders(SHOP);
      await run();
      // The merchant gave the buyer the same amount in Shopify at the same moment
      history.credits.push({ ...history.credits[0], id: "gid://shopify/StoreCreditAccountCreditTransaction/999" });
      await backdateClaim(id, 60, history);

      await expect(run()).resolves.toMatchObject({ body: { settled: 1, needsLook: 1 } });
      await expect(run()).resolves.toMatchObject({ body: { settled: 0, needsLook: 0 } });

      expect(history.reads).toBe(1);
      expect(calls).toHaveLength(1);
      await expect(payout(id)).resolves.toMatchObject({ state: "needs_look", lookReason: "could_not_confirm" });
    });

    it("asks the merchant about a take-back still being sent once its claim is over, without asking Shopify", async () => {
      const conn = await runningShop();
      const credit = await pendingCredit(conn);
      const calls = mockStoreCredit(SHOP, { [BUYER]: "0" });
      mockRecentPaidOrders(SHOP);
      await run();
      expect((await payout(credit)).state).toBe("sent");
      // A refund's take-back, claimed by a send that stopped
      const entry = await prisma.ledgerEntry.create({
        data: {
          merchantId: conn.merchantId,
          connectionId: conn.connectionId,
          customerId: (await payout(credit)).customerId,
          kind: "reversal",
          amount: "-1.00",
          currency: "GBP",
          shopAmount: "-1.00",
          idempotencyKey: "reversal:test",
        },
      });
      const debit = await prisma.payout.create({
        data: {
          merchantId: conn.merchantId,
          ledgerEntryId: entry.id,
          customerId: entry.customerId,
          rail: "shopify_store_credit",
          direction: "debit",
          amount: "1.00",
          currency: "GBP",
          state: "sending",
          attempts: 1,
          claimedAt: new Date(Date.now() - 2 * HOUR),
          nextAttemptAt: new Date(Date.now() - 2 * HOUR),
        },
      });

      await expect(run()).resolves.toMatchObject({ body: { settled: 1, needsLook: 1 } });

      expect(calls).toHaveLength(1);
      await expect(payout(debit.id)).resolves.toMatchObject({ state: "needs_look", lookReason: "could_not_confirm" });
    });
  });

  describe("queue fairness", () => {
    it("reads at most 20 histories a run, and reaches the ones it has not checked first", async () => {
      const conn = await runningShop();
      // 21 unclear credits to 21 buyers, the oldest claim first
      const ids: string[] = [];
      for (let n = 0; n < 21; n++) {
        const id = await pendingCredit(conn, 6000 + n, { buyer: String(8000 + n) });
        await expect(sendPayout(id, unclearRail)).resolves.toBe("unconfirmed");
        await backdateClaim(id, 120 - n);
        ids.push(id);
      }
      const newest = ids[20];
      mockStoreCredit(SHOP, {});
      // Shopify won't give the 20 oldest buyers' histories; the newest buyer has none
      const reads: string[] = [];
      server.use(
        graphql.link(adminGraphqlUrl(SHOP)).query("RewardsCreditHistory", ({ variables }) => {
          const buyer = String(variables.customerId).split("/").pop()!;
          reads.push(buyer);
          if (buyer !== "8020") return HttpResponse.json({ errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] });
          return HttpResponse.json({
            data: { customer: { storeCreditAccounts: { pageInfo: { hasNextPage: false }, nodes: [] } } },
          });
        }),
      );
      mockRecentPaidOrders(SHOP);

      await expect(run()).resolves.toMatchObject({ body: { settled: 0 } });
      expect(reads).toHaveLength(20);
      expect(reads).not.toContain("8020");

      // The one not yet checked goes first: not landed, so it is sent again
      await expect(run()).resolves.toMatchObject({ body: { settled: 1, sent: 1 } });
      expect(reads[20]).toBe("8020");
      expect(reads).toHaveLength(40);
      await expect(payout(newest)).resolves.toMatchObject({ state: "sent" });
    });

    it("moves a store it cannot reach out of the way, and pays the others", async () => {
      const unreachable = await runningShop(OTHER_SHOP, { session: false });
      const stuck = await pendingCredit(unreachable, 7001, { minutesAgo: 30 });
      const conn = await runningShop();
      const due = await pendingCredit(conn, 5001, { minutesAgo: 10 });
      const calls = mockStoreCredit(SHOP, { [BUYER]: "0" });
      mockRecentPaidOrders(SHOP);
      vi.spyOn(console, "error").mockImplementation(() => {});

      const { status, body } = await run();

      // A finished run with a problem: the monitor records it as partial
      expect(status).toBe(200);
      expect(body).toMatchObject({ sent: 1, problems: 1 });
      expect(calls.map((c) => c.amount)).toEqual(["2.50"]);
      await expect(payout(due)).resolves.toMatchObject({ state: "sent" });
      // Counted as a failed try: it waits its backoff, so it can't hold the queue
      const waiting = await payout(stuck);
      expect(waiting).toMatchObject({ state: "pending", attempts: 1 });
      expect(waiting.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30 * MINUTE);
      expect(waiting.lastError).toMatch(/could not be reached/);
      vi.mocked(console.error).mockRestore();
    });
  });

  describe("the missed-order sweep (rule 13)", () => {
    it("records a paid order no webhook recorded, and credits it", async () => {
      const conn = await runningShop();
      // Already recorded, by its webhook
      await pendingCredit(conn, 5002, { minutesAgo: 0 });
      const queries = mockRecentPaidOrders(SHOP, [recent(5001), recent(5002), recent(5003, { guest: true }), recent(5004, { test: true })]);
      const facts = mockOrderFacts(SHOP, { orders: [plainOrder(5001)] });
      const balances = { [BUYER]: "0" };
      const calls = mockStoreCredit(SHOP, balances);

      const before = Date.now();
      await expect(run()).resolves.toMatchObject({ status: 200, body: { swept: 1, sent: 1, problems: 0 } });

      // Only the missed order with a buyer, not a test, is read
      expect(facts.reads).toEqual(["gid://shopify/Order/5001"]);
      const since = new Date(/created_at:>='([^']+)'/.exec(queries[0])![1]).getTime();
      expect(since).toBeGreaterThanOrEqual(before - 3 * DAY - MINUTE);
      expect(since).toBeLessThanOrEqual(before - 3 * DAY + MINUTE);
      const order = await prisma.order.findUniqueOrThrow({
        where: { connectionId_externalOrderId: { connectionId: conn.connectionId, externalOrderId: "gid://shopify/Order/5001" } },
        include: { ledgerEntries: { include: { payout: true } } },
      });
      expect(order).toMatchObject({ source: "live", noCashbackReason: null });
      expect(order.ledgerEntries.map((e) => [e.kind, e.amount.toFixed(2), e.payout?.state])).toEqual([["cashback", "2.50", "sent"]]);
      expect(calls).toEqual([{ operation: "credit", customerId: BUYER, amount: "2.50", currency: "GBP" }]);
      await expect(prisma.order.count()).resolves.toBe(2);
    });

    it("looks back no further than the install", async () => {
      await runningShop(SHOP, { installedAgo: DAY });
      const connection = await prisma.connection.findFirstOrThrow();
      const queries = mockRecentPaidOrders(SHOP);
      mockStoreCredit(SHOP, {});

      await run();

      expect(queries).toEqual([
        `created_at:>='${connection.installedAt.toISOString()}' AND (financial_status:paid OR financial_status:partially_refunded)`,
      ]);
    });

    it("logs an order it cannot read by its id, and records the next", async () => {
      await runningShop();
      mockRecentPaidOrders(SHOP, [recent(5001), recent(5002)]);
      const unreadable = plainOrder(5001);
      (unreadable.data.order as Record<string, unknown>).test = "not a flag";
      mockOrderFacts(SHOP, { orders: [unreadable, plainOrder(5002)] });
      mockStoreCredit(SHOP, { [BUYER]: "0" });
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(run()).resolves.toMatchObject({ status: 200, body: { swept: 1, sent: 1, problems: 1 } });

      const logged = errors.mock.calls.map((args) => args.join(" "));
      expect(logged).toEqual([expect.stringContaining("gid://shopify/Order/5001")]);
      expect(logged[0]).not.toMatch(/7001|Customer/);
      await expect(prisma.order.findMany({ select: { externalOrderId: true } })).resolves.toEqual([
        { externalOrderId: "gid://shopify/Order/5002" },
      ]);
      errors.mockRestore();
    });
  });

  it("does nothing while another run holds the job", async () => {
    const conn = await runningShop();
    const id = await pendingCredit(conn);
    const calls = mockStoreCredit(SHOP, { [BUYER]: "0" });
    await acquireCronLock("payouts", 15);

    await expect(run()).resolves.toMatchObject({ status: 200, body: { success: true, skipped: true } });

    expect(calls).toEqual([]);
    await expect(payout(id)).resolves.toMatchObject({ state: "pending" });
  });
});
