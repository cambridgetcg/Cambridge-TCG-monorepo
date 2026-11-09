import { Prisma } from "@prisma/client";
import { graphql, HttpResponse } from "msw";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { acquireCronLock } from "~/lib/cron.server";
import { type ConnectionContext, ensureMerchant, findConnection, setRunning } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import type { MoneyPair, OrderFacts } from "~/lib/order-facts";
import { runPayoutCheck } from "~/lib/payout-check.server";
import { KEEP_TRYING_MS, sendPayout } from "~/lib/payouts.server";
import type { OrderSource, PayoutRail, UpdatedOrder } from "~/lib/ports";
import { recordOrder } from "~/lib/record-order.server";
import { monitoring } from "~/lib/telemetry.server";
import { ShopifyTimeoutError } from "~/shopify/ask.server";
import { OrderReadLimitError } from "~/shopify/order-source.server";
import plain from "../fixtures/orders/plain.json";
import refundMoneyOnly from "../fixtures/orders/refund-money-only.json";
import { server } from "../setup";
import { hasTestDatabase, resetDatabase } from "./helpers/database";
import { noIds } from "./helpers/ids";
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

type RecentOrder = {
  id: string;
  test: boolean;
  createdAt: string;
  cancelledAt: string | null;
  customer: { id: string } | null;
  refunds: Array<{ id: string; createdAt: string }>;
};

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

/**
 * A running GBP shop installed `installedAgo` ago with one 5% tier, its
 * past-orders import done (the hourly route would start one not started,
 * Ruling 53), and (by default) its offline session.
 */
async function runningShop(shop = SHOP, o: { installedAgo?: number; session?: boolean } = {}): Promise<ConnectionContext> {
  const now = new Date(Date.now() - (o.installedAgo ?? 10 * DAY));
  await ensureMerchant({ shop, name: "Payout Check", currency: "GBP", timezone: "Europe/London", now });
  const conn = await findConnection(shop);
  if (!conn) throw new Error("no connection");
  await prisma.connection.update({ where: { id: conn.connectionId }, data: { importState: "done" } });
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
 * Answer the sweep's RewardsUpdatedOrders for `shop` with `orders` (one
 * page). Returns the search queries it was asked.
 */
function mockRecentPaidOrders(shop: string, orders: RecentOrder[] = []): string[] {
  const queries: string[] = [];
  server.use(
    graphql.link(adminGraphqlUrl(shop)).query("RewardsUpdatedOrders", ({ variables }) => {
      queries.push(String(variables.query));
      return HttpResponse.json({ data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: orders } } });
    }),
  );
  return queries;
}

/**
 * The plain £50 order (£2.50 at 5%) as Shopify reads it, created an hour ago
 * (or `createdAgo`), numbered `n`, with the ids of `refunds` on it.
 */
function plainOrder(n: number, o: { createdAgo?: number; refunds?: string[] } = {}): FixtureAnswer {
  const answer = structuredClone(plain) as FixtureAnswer;
  const at = new Date(Date.now() - (o.createdAgo ?? HOUR)).toISOString();
  Object.assign(answer.data.order as object, {
    id: `gid://shopify/Order/${n}`,
    name: `#${n}`,
    createdAt: at,
    processedAt: at,
    refunds: (o.refunds ?? []).map((id) => ({ id })),
  });
  return answer;
}

/** A refund of order `n` of £`amount` of money (no items, no shipping), made `madeAgo` ago. */
function moneyRefund(id: string, n: number, amount: string, madeAgo = 30 * MINUTE): FixtureAnswer {
  const answer = structuredClone(refundMoneyOnly) as FixtureAnswer;
  Object.assign(answer.data.refund as object, {
    id,
    createdAt: new Date(Date.now() - madeAgo).toISOString(),
    order: { id: `gid://shopify/Order/${n}` },
    transactions: { nodes: [{ kind: "REFUND", status: "SUCCESS", amountSet: { shopMoney: { amount }, presentmentMoney: { amount } } }] },
  });
  return answer;
}

const recent = (
  n: number,
  o: { test?: boolean; guest?: boolean; buyer?: string; createdAgo?: number; cancelledAt?: Date; refunds?: Array<{ id: string; madeAgo?: number }> } = {},
): RecentOrder => ({
  id: `gid://shopify/Order/${n}`,
  test: o.test ?? false,
  createdAt: new Date(Date.now() - (o.createdAgo ?? HOUR)).toISOString(),
  cancelledAt: o.cancelledAt?.toISOString() ?? null,
  customer: o.guest ? null : { id: `gid://shopify/Customer/${o.buyer ?? BUYER}` },
  refunds: (o.refunds ?? []).map((r) => ({ id: r.id, createdAt: new Date(Date.now() - (r.madeAgo ?? 30 * MINUTE)).toISOString() })),
});

const cronRow = (outcome: string) => prisma.cronRun.findUnique({ where: { job_outcome: { job: "payouts", outcome } } });

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
    // A payout the run leaves not sent is logged by its id (Ruling 46); the tests that read the lines spy again
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(console.error).mockClear();
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
    await expect(run()).resolves.toMatchObject({ body: { sent: 0, problems: 1 } });
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

  it("counts every credit Shopify turned away as a problem, so the run is partial and monitoring is told (Ruling 46)", async () => {
    const conn = await runningShop();
    const first = await pendingCredit(conn, 5001, { minutesAgo: 20 });
    await pendingCredit(conn, 5002, { minutesAgo: 10, buyer: "7002" });
    mockStoreCredit(SHOP, { [BUYER]: "0", "7002": "0" }, { throttled: 2 });
    mockRecentPaidOrders(SHOP);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const warning = vi.spyOn(monitoring, "captureMessage").mockReturnValue(true);

    await expect(run()).resolves.toMatchObject({ status: 200, body: { success: true, sent: 0, problems: 2 } });

    // Recorded as partial, with the first payout's code, and not as succeeded
    await expect(cronRow("partial")).resolves.toMatchObject({ errorMessage: "2 failed; first: THROTTLED" });
    await expect(cronRow("succeeded")).resolves.toBeNull();
    expect(warning).toHaveBeenCalledWith("Cron payouts finished with problems", "warning", expect.objectContaining({ extra: { problems: 2, firstProblem: "THROTTLED" } }));
    // One line per failed send: the payout id and the code, nothing about the buyer
    const logged = errors.mock.calls.map((args) => args.join(" "));
    expect(logged).toEqual([expect.stringContaining(first), expect.any(String)]);
    expect(logged.every((line) => line.includes("THROTTLED") && !/7001|7002|Customer/.test(noIds(line)))).toBe(true);
    errors.mockRestore();
    warning.mockRestore();
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

      // Sent again after it was found not landed: no problem
      await expect(run()).resolves.toMatchObject({ body: { settled: 1, sent: 1, problems: 0 } });
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

      // Needing a look is a problem of the run
      await expect(run()).resolves.toMatchObject({ body: { settled: 1, needsLook: 1, problems: 1 } });
      await expect(run()).resolves.toMatchObject({ body: { settled: 0, needsLook: 0, problems: 0 } });

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

      // A finished run with problems (the store, and its payout not sent): the monitor records it as partial
      expect(status).toBe(200);
      expect(body).toMatchObject({ sent: 1, problems: 2 });
      await expect(cronRow("partial")).resolves.toMatchObject({ errorMessage: expect.stringMatching(/^2 failed; first: Error: The store of connection/) });
      expect(calls.map((c) => c.amount)).toEqual(["2.50"]);
      await expect(payout(due)).resolves.toMatchObject({ state: "sent" });
      // Counted as a failed try: it waits its backoff, so it can't hold the queue
      const waiting = await payout(stuck);
      expect(waiting).toMatchObject({ state: "pending", attempts: 1 });
      expect(waiting.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30 * MINUTE);
      expect(waiting.lastError).toMatch(/could not be reached/);
      vi.mocked(console.error).mockRestore();
    });

    // F1-F3 (Ruling 85): another renewal of its token is running, so the store waits for the next run
    it("leaves a store whose token is being renewed for the next run, with no attempt spent and no problem", async () => {
      const conn = await runningShop();
      const due = await pendingCredit(conn, 5001, { minutesAgo: 10 });

      const result = await runPayoutCheck({ now: new Date(), railFor: async () => "busy", deadline: Date.now() + 60_000 });

      expect(result).toMatchObject({ sent: 0, busy: 1, problems: 0 });
      await expect(payout(due)).resolves.toMatchObject({ state: "pending", attempts: 0, lastError: null });
      // Not stamped as swept, so it goes first next run
      await expect(prisma.connection.findUniqueOrThrow({ where: { id: conn.connectionId } })).resolves.toMatchObject({ lastSweptAt: null });
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
      const since = new Date(/updated_at:>='([^']+)'/.exec(queries[0])![1]).getTime();
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
        `updated_at:>='${connection.installedAt.toISOString()}' AND (financial_status:paid OR financial_status:partially_refunded OR financial_status:refunded)`,
      ]);
    });

    it("leaves an order from before the import's horizon alone when no webhook recorded it (M2c-F2)", async () => {
      const conn = await runningShop();
      // A webhook recorded this old order (paid after install); the sweep still looks after it
      const old = { ...orderFacts(5003), orderedAt: new Date(Date.now() - 400 * DAY) };
      await expect(recordOrder(conn, old, "live")).resolves.toMatchObject({ status: "recorded" });
      const cancelledAt = new Date(Date.now() - 20 * MINUTE);
      mockRecentPaidOrders(SHOP, [
        // Created before install − 365 days, updated since (a fulfilment, a retag)
        recent(5001, { createdAgo: 400 * DAY }),
        // Before install but inside the horizon
        recent(5002, { createdAgo: 300 * DAY }),
        recent(5003, { createdAgo: 400 * DAY, cancelledAt }),
      ]);
      const facts = mockOrderFacts(SHOP, { orders: [plainOrder(5002, { createdAgo: 300 * DAY })] });
      const calls = mockStoreCredit(SHOP, { [BUYER]: "0" });

      await expect(run()).resolves.toMatchObject({ status: 200, body: { swept: 1, sent: 0, cancelledSwept: 1, problems: 0 } });

      expect(facts.reads).toEqual(["gid://shopify/Order/5002"]);
      expect(calls).toEqual([]);
      const rows = await prisma.order.findMany({
        select: { externalOrderId: true, noCashbackReason: true, cancelledAt: true },
        orderBy: { externalOrderId: "asc" },
      });
      expect(rows).toEqual([
        { externalOrderId: "gid://shopify/Order/5002", noCashbackReason: "before_install", cancelledAt: null },
        { externalOrderId: "gid://shopify/Order/5003", noCashbackReason: "before_install", cancelledAt },
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

    it("records an order created 5 days ago and paid today", async () => {
      await runningShop();
      mockRecentPaidOrders(SHOP, [recent(5001, { createdAgo: 5 * DAY })]);
      const order = plainOrder(5001, { createdAgo: 5 * DAY });
      for (const tx of (order.data.order as { transactions: Array<Record<string, unknown>> }).transactions) {
        tx.processedAt = new Date(Date.now() - HOUR).toISOString();
      }
      mockOrderFacts(SHOP, { orders: [order] });
      const calls = mockStoreCredit(SHOP, { [BUYER]: "0" });

      await expect(run()).resolves.toMatchObject({ body: { swept: 1, sent: 1, problems: 0 } });

      expect(calls.map((c) => c.amount)).toEqual(["2.50"]);
      await expect(prisma.order.findFirstOrThrow()).resolves.toMatchObject({ noCashbackReason: null });
    });

    it("records a fully refunded order no webhook recorded, with nothing to send (Ruling 24)", async () => {
      await runningShop();
      const queries = mockRecentPaidOrders(SHOP, [recent(5001, { refunds: [{ id: "gid://shopify/Refund/6301" }] })]);
      mockOrderFacts(SHOP, {
        orders: [plainOrder(5001, { refunds: ["gid://shopify/Refund/6301"] })],
        refunds: [moneyRefund("gid://shopify/Refund/6301", 5001, "50.0")],
      });
      const calls = mockStoreCredit(SHOP, { [BUYER]: "0" });

      await expect(run()).resolves.toMatchObject({ body: { swept: 1, sent: 0, problems: 0 } });

      expect(queries[0]).toContain("financial_status:refunded");
      expect(calls).toEqual([]);
      const credit = await prisma.payout.findFirstOrThrow({ where: { direction: "credit" } });
      expect(credit).toMatchObject({ state: "nothing_to_send" });
      await expect(prisma.refund.count()).resolves.toBe(1);
    });
  });

  describe("the backstop for refunds and cancellations (Ruling 45)", () => {
    it("takes back the cashback of a refund whose webhook never came, once", async () => {
      const conn = await runningShop();
      const credit = await pendingCredit(conn, 5001, { minutesAgo: 30 });
      const balances = { [BUYER]: "0" };
      const calls = mockStoreCredit(SHOP, balances);
      mockRecentPaidOrders(SHOP);
      await run();
      await expect(payout(credit)).resolves.toMatchObject({ state: "sent" });

      // The merchant refunded £20 of it; refunds/create failed all of Shopify's retries
      const REFUND = "gid://shopify/Refund/6302";
      mockRecentPaidOrders(SHOP, [recent(5001, { refunds: [{ id: REFUND }] })]);
      const reads = mockOrderFacts(SHOP, {
        orders: [plainOrder(5001, { refunds: [REFUND] })],
        refunds: [moneyRefund(REFUND, 5001, "20.0")],
      });

      await expect(run()).resolves.toMatchObject({ body: { refundsSwept: 1, problems: 0 } });

      const reversal = await prisma.ledgerEntry.findFirstOrThrow({ where: { kind: "reversal" }, include: { payout: true } });
      // £20 of £50: 2/5 of the £2.50, waiting for the next run's sends
      expect(reversal.amount.toFixed(2)).toBe("-1.00");
      expect(reversal.payout).toMatchObject({ direction: "debit", state: "pending" });
      expect(reads.reads).toContain(REFUND);

      // A second run finds the refund recorded and changes nothing
      const readsBefore = reads.reads.length;
      await expect(run()).resolves.toMatchObject({ body: { refundsSwept: 0, problems: 0 } });
      expect(reads.reads).toHaveLength(readsBefore);
      await expect(prisma.ledgerEntry.count({ where: { kind: "reversal" } })).resolves.toBe(1);
      await expect(prisma.refund.count()).resolves.toBe(1);
      expect(calls.filter((c) => c.operation === "debit")).toEqual([]);
    });

    it("marks a recorded order cancelled in Shopify, whose orders/cancelled never came", async () => {
      const conn = await runningShop();
      await pendingCredit(conn, 5001, { minutesAgo: 0 });
      const cancelledAt = new Date(Date.now() - 20 * MINUTE);
      mockRecentPaidOrders(SHOP, [recent(5001, { cancelledAt })]);
      mockStoreCredit(SHOP, { [BUYER]: "0" });

      await expect(run()).resolves.toMatchObject({ body: { cancelledSwept: 1, problems: 0 } });

      await expect(prisma.order.findFirstOrThrow()).resolves.toMatchObject({ cancelledAt });
      await expect(run()).resolves.toMatchObject({ body: { cancelledSwept: 0 } });
    });

    it("reads the order itself when the listing's refunds may be cut short", async () => {
      const conn = await runningShop();
      await pendingCredit(conn, 5001, { minutesAgo: 0 });
      const REFUND = "gid://shopify/Refund/6303";
      const listed = recent(5001);
      listed.refunds = Array.from({ length: 15 }, (_, n) => ({ id: `gid://shopify/Refund/${8000 + n}`, createdAt: new Date().toISOString() }));
      mockRecentPaidOrders(SHOP, [listed]);
      const reads = mockOrderFacts(SHOP, { orders: [plainOrder(5001, { refunds: [REFUND] })], refunds: [moneyRefund(REFUND, 5001, "20.0")] });
      mockStoreCredit(SHOP, { [BUYER]: "0" });

      await expect(run()).resolves.toMatchObject({ body: { refundsSwept: 1, problems: 0 } });

      expect(reads.reads[0]).toBe("gid://shopify/Order/5001");
      await expect(prisma.refund.findFirstOrThrow()).resolves.toMatchObject({ externalRefundId: REFUND });
    });

    it("records an imported order's refund its file listed without a spend change, and counts one it didn't, once (Ruling 54)", async () => {
      const conn = await runningShop();
      const LISTED = "gid://shopify/Refund/6304";
      const UNLISTED = "gid://shopify/Refund/6305";
      const importOrder = {
        ...orderFacts(5001),
        orderedAt: new Date(Date.now() - 30 * DAY),
        paidAt: new Date(Date.now() - 30 * DAY),
        importRefundIds: [LISTED],
      };
      await expect(recordOrder(conn, importOrder, "import")).resolves.toMatchObject({ status: "recorded" });
      // Both refunds were made after the bulk query began; Shopify's file read the order between them
      mockRecentPaidOrders(SHOP, [recent(5001, { refunds: [{ id: LISTED, madeAgo: 2 * DAY }, { id: UNLISTED, madeAgo: HOUR }] })]);
      const order = plainOrder(5001, { createdAgo: 30 * DAY, refunds: [LISTED, UNLISTED] });
      const reads = mockOrderFacts(SHOP, {
        orders: [order],
        refunds: [moneyRefund(LISTED, 5001, "10.0", 2 * DAY), moneyRefund(UNLISTED, 5001, "5.0", HOUR)],
      });
      mockStoreCredit(SHOP, { [BUYER]: "0" });

      await expect(run()).resolves.toMatchObject({ body: { refundsSwept: 2, problems: 0 } });

      // Both get their row; only the one the file didn't list comes off spend
      expect(reads.reads).toEqual(expect.arrayContaining([LISTED, UNLISTED]));
      const row = await prisma.order.findFirstOrThrow();
      expect(row.shopRefundedProductAmount.toFixed(2)).toBe("5.00");
      const rows = await prisma.refund.findMany({ select: { externalRefundId: true }, orderBy: { externalRefundId: "asc" } });
      expect(rows).toEqual([{ externalRefundId: LISTED }, { externalRefundId: UNLISTED }]);

      // A second run changes nothing
      const readsBefore = reads.reads.length;
      await expect(run()).resolves.toMatchObject({ body: { refundsSwept: 0, problems: 0 } });
      expect(reads.reads).toHaveLength(readsBefore);
      expect((await prisma.order.findFirstOrThrow()).shopRefundedProductAmount.toFixed(2)).toBe("5.00");
      await expect(prisma.refund.count()).resolves.toBe(2);
    });
  });

  describe("the sweep's own failures and limits", () => {
    const rail = { credit: vi.fn(), debit: vi.fn(), balance: vi.fn(), creditHistory: vi.fn() } as unknown as PayoutRail;
    const listed = (n: number, o: { refunds: UpdatedOrder["refunds"]; cancelledAt?: Date }): UpdatedOrder => ({
      orderGid: `gid://shopify/Order/${n}`,
      hasCustomer: true,
      test: false,
      orderedAt: new Date(Date.now() - HOUR),
      cancelledAt: o.cancelledAt ?? null,
      refunds: o.refunds,
    });

    it("goes on to the order's next refund and its cancellation when one refund can't be read (M2c-F6)", async () => {
      const conn = await runningShop(SHOP, { session: false });
      await pendingCredit(conn, 5001, { minutesAgo: 0 });
      const BROKEN = "gid://shopify/Refund/6401";
      const FINE = "gid://shopify/Refund/6402";
      const cancelledAt = new Date(Date.now() - 10 * MINUTE);
      const broken = new Error("The refund's order could not be read");
      const orders: OrderSource = {
        readOrder: async () => null,
        readRefund: async (refundGid) => {
          if (refundGid === BROKEN) throw broken;
          return {
            orderGid: "gid://shopify/Order/5001",
            refund: { externalRefundId: FINE, refundedAt: new Date(Date.now() - 20 * MINUTE), completesOrder: false, moneyPending: false, productValue: pair("20.00") },
          };
        },
        recentlyUpdatedOrders: async () => [
          listed(5001, {
            refunds: [
              { refundGid: BROKEN, refundedAt: new Date(Date.now() - 30 * MINUTE) },
              { refundGid: FINE, refundedAt: new Date(Date.now() - 20 * MINUTE) },
            ],
            cancelledAt,
          }),
        ],
      };

      const result = await runPayoutCheck({ now: new Date(), railFor: async () => ({ rail, orders }), deadline: Date.now() + 60_000 });

      expect(result).toMatchObject({ refundsSwept: 1, cancelledSwept: 1, problems: 1, firstProblem: broken });
      await expect(prisma.refund.findMany({ select: { externalRefundId: true } })).resolves.toEqual([{ externalRefundId: FINE }]);
      await expect(prisma.order.findFirstOrThrow()).resolves.toMatchObject({ cancelledAt });
      // Logged by the order's and the refund's ids only
      const lines = vi.mocked(console.error).mock.calls.map((call) => call.map(String).join(" "));
      expect(lines).toEqual([expect.stringMatching(/gid:\/\/shopify\/Refund\/6401.*gid:\/\/shopify\/Order\/5001|gid:\/\/shopify\/Order\/5001.*gid:\/\/shopify\/Refund\/6401/)]);
    });

    it("logs an order with more refunds than one read takes as a limit, not a problem, and still records its cancellation (M2c-F7)", async () => {
      const conn = await runningShop(SHOP, { session: false });
      await pendingCredit(conn, 5001, { minutesAgo: 0 });
      const cancelledAt = new Date(Date.now() - 10 * MINUTE);
      const limit = new OrderReadLimitError("Shopify gave 20 refunds, the most one read takes; there may be more");
      const orders: OrderSource = {
        readOrder: async () => {
          throw limit;
        },
        readRefund: async () => null,
        // 15 or more refunds listed: the listing may be cut short. 5002 is a missed order, read in full
        recentlyUpdatedOrders: async () => [listed(5001, { refunds: null, cancelledAt }), listed(5002, { refunds: null })],
      };
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await runPayoutCheck({ now: new Date(), railFor: async () => ({ rail, orders }), deadline: Date.now() + 60_000 });

      expect(result).toMatchObject({ cancelledSwept: 1, swept: 0, problems: 0 });
      expect(result.firstProblem).toBeUndefined();
      await expect(prisma.order.findFirstOrThrow()).resolves.toMatchObject({ cancelledAt });
      const lines = warn.mock.calls.map((call) => call.map(String).join(" "));
      expect(lines).toEqual([expect.stringContaining("gid://shopify/Order/5001"), expect.stringContaining("gid://shopify/Order/5002")]);
      expect(vi.mocked(console.error)).not.toHaveBeenCalled();
    });

    it("leaves a store whose listing the deadline cut off unstamped, and unfinished, counted once (M2c-F3)", async () => {
      const conn = await runningShop(SHOP, { session: false });
      const sweptBefore = new Date(Date.now() - DAY);
      await prisma.connection.update({ where: { id: conn.connectionId }, data: { lastSweptAt: sweptBefore } });
      let deadline = 0;
      const orders: OrderSource = {
        readOrder: async () => null,
        readRefund: async () => null,
        // The listing's page runs into the run's deadline
        recentlyUpdatedOrders: async () => {
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now()) + 5));
          throw new ShopifyTimeoutError(0);
        },
      };

      deadline = Date.now() + 50;
      const result = await runPayoutCheck({ now: new Date(), railFor: async () => ({ rail, orders }), deadline });

      expect(result).toMatchObject({ unfinished: 1, problems: 1 });
      expect(String(result.firstProblem)).toMatch(/cut short by the deadline/);
      await expect(prisma.connection.findUniqueOrThrow({ where: { id: conn.connectionId } })).resolves.toMatchObject({ lastSweptAt: sweptBefore });
    });
    it("leaves a store unstamped when the deadline cuts off one of its order's refund reads, counted once (M2d-F1)", async () => {
      const conn = await runningShop(SHOP, { session: false });
      await pendingCredit(conn, 5001, { minutesAgo: 0 });
      const sweptBefore = new Date(Date.now() - DAY);
      await prisma.connection.update({ where: { id: conn.connectionId }, data: { lastSweptAt: sweptBefore } });
      let deadline = 0;
      const reads: string[] = [];
      const orders: OrderSource = {
        readOrder: async () => null,
        // The first refund's read runs into the run's deadline
        readRefund: async (refundGid) => {
          reads.push(refundGid);
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now()) + 5));
          throw new ShopifyTimeoutError(0);
        },
        recentlyUpdatedOrders: async () => [
          listed(5001, {
            refunds: [
              { refundGid: "gid://shopify/Refund/6501", refundedAt: new Date(Date.now() - 30 * MINUTE) },
              { refundGid: "gid://shopify/Refund/6502", refundedAt: new Date(Date.now() - 20 * MINUTE) },
            ],
          }),
        ],
      };

      deadline = Date.now() + 50;
      const result = await runPayoutCheck({ now: new Date(), railFor: async () => ({ rail, orders }), deadline });

      expect(reads).toEqual(["gid://shopify/Refund/6501"]);
      expect(result).toMatchObject({ refundsSwept: 0, unfinished: 1, problems: 1 });
      expect(String(result.firstProblem)).toMatch(/cut short by the deadline/);
      await expect(prisma.refund.count()).resolves.toBe(0);
      await expect(prisma.connection.findUniqueOrThrow({ where: { id: conn.connectionId } })).resolves.toMatchObject({ lastSweptAt: sweptBefore });
    });

    it("leaves a store unstamped when the deadline cuts off the read of an order whose listed refunds were cut short (M2d-F1)", async () => {
      const conn = await runningShop(SHOP, { session: false });
      await pendingCredit(conn, 5001, { minutesAgo: 0 });
      const sweptBefore = new Date(Date.now() - DAY);
      await prisma.connection.update({ where: { id: conn.connectionId }, data: { lastSweptAt: sweptBefore } });
      let deadline = 0;
      const orders: OrderSource = {
        readOrder: async () => {
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now()) + 5));
          throw new ShopifyTimeoutError(0);
        },
        readRefund: async () => null,
        recentlyUpdatedOrders: async () => [listed(5001, { refunds: null })],
      };

      deadline = Date.now() + 50;
      const result = await runPayoutCheck({ now: new Date(), railFor: async () => ({ rail, orders }), deadline });

      expect(result).toMatchObject({ unfinished: 1, problems: 1 });
      expect(String(result.firstProblem)).toMatch(/cut short by the deadline/);
      expect(vi.mocked(console.error)).not.toHaveBeenCalled();
      await expect(prisma.connection.findUniqueOrThrow({ where: { id: conn.connectionId } })).resolves.toMatchObject({ lastSweptAt: sweptBefore });
    });
  });

  describe("the sweep's turn (OPERATIONS-6)", () => {
    const rail = { credit: vi.fn(), debit: vi.fn(), balance: vi.fn(), creditHistory: vi.fn() } as unknown as PayoutRail;

    it("sweeps the store least recently swept first, so two short runs reach two stores, and reports the one it can't reach", async () => {
      const a = await runningShop(SHOP, { session: false });
      const b = await runningShop(OTHER_SHOP, { session: false });
      const swept: string[] = [];
      let deadline = 0;
      /** A listing that takes until the run's deadline has passed. */
      const slowOrders = (shop: string): OrderSource => ({
        readOrder: async () => null,
        readRefund: async () => null,
        recentlyUpdatedOrders: async (): Promise<UpdatedOrder[]> => {
          swept.push(shop);
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now()) + 5));
          return [];
        },
      });
      const railFor = async (connectionId: string) => ({ rail, orders: slowOrders(connectionId === a.connectionId ? SHOP : OTHER_SHOP) });

      deadline = Date.now() + 50;
      const first = await runPayoutCheck({ now: new Date(), railFor, deadline });
      deadline = Date.now() + 50;
      const second = await runPayoutCheck({ now: new Date(), railFor, deadline });

      expect(new Set(swept)).toEqual(new Set([SHOP, OTHER_SHOP]));
      expect(swept).toHaveLength(2);
      // The store left for the next run is unfinished, and a problem
      expect(first).toMatchObject({ unfinished: 1, problems: 1 });
      expect(second).toMatchObject({ unfinished: 1, problems: 1 });
      const stamped = await prisma.connection.findMany({ select: { id: true, lastSweptAt: true } });
      expect(stamped.every((c) => c.lastSweptAt !== null)).toBe(true);
      expect([a.connectionId, b.connectionId].sort()).toEqual(stamped.map((c) => c.id).sort());
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
