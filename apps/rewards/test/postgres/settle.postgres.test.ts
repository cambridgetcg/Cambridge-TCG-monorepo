import { Prisma, type PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma, { createPrismaClient } from "~/db.server";
import type { ConnectionContext } from "~/lib/merchant.server";
import { ensureMerchant, findConnection, setRunning } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import type { MoneyPair, OrderFacts, RefundFacts } from "~/lib/order-facts";
import { CLAIM_FINISHED_MS, answerNeedsLook, closeWithoutSending, lockPayout, payoutVersion, sendPayout, settleUnconfirmed } from "~/lib/payouts.server";
import type { CreditHistoryResult, PayoutRail, RailAnswer } from "~/lib/ports";
import { recordOrder } from "~/lib/record-order.server";
import { recordRefund } from "~/lib/refunds.server";
import { createStoreCreditRail } from "~/shopify/store-credit-rail.server";
import { hasTestDatabase, resetDatabase, waitForLockWaitOr } from "./helpers/database";
import { backdateClaim, creditHistory, mockStoreCredit, seedOfflineSession } from "./helpers/shopify";

/**
 * Settling payouts whose answer was unclear (rule 9) and the merchant's
 * answers to the ones that need a look (rule 12). The credit history is read
 * through the real Shopify rail against MSW where Shopify's answer matters;
 * a fake rail stands in where only the rail's verdict does.
 */

const SHOP = "settle-test.myshopify.com";
const OTHER_SHOP = "settle-other.myshopify.com";
const BUYER = "7001";
const ORDER = "gid://shopify/Order/5001";
const INSTALLED = new Date("2026-11-01T09:00:00Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function pair(amount: string, shopAmount = amount): MoneyPair {
  return { amount: new Money(amount), shopAmount: new Money(shopAmount) };
}

/** A paid order of £50 of products by BUYER (or `currency` worth `product`, `shopProduct` in GBP). */
function orderFacts(o: { currency?: string; product?: string; shopProduct?: string } = {}): OrderFacts {
  const product = o.product ?? "50.00";
  return {
    externalOrderId: ORDER,
    name: "#5001",
    externalCustomerId: BUYER,
    currency: o.currency ?? "GBP",
    shopCurrency: "GBP",
    test: false,
    cancelledAt: null,
    orderedAt: new Date("2026-11-04T12:00:00Z"),
    paidAt: new Date("2026-11-04T12:00:05Z"),
    financialStatus: "PAID",
    total: pair(product, o.shopProduct),
    productValue: pair(product, o.shopProduct),
    storeCreditUsed: pair("0"),
    giftCardUsed: pair("0"),
    refundedProductValue: pair("0"),
    refunds: [],
  };
}

/** Refund `n` of `product` worth of products (`shopProduct` in GBP). */
function refundFacts(n: number, product: string, shopProduct = product): RefundFacts {
  return { externalRefundId: `gid://shopify/Refund/${n}`, productValue: pair(product, shopProduct), refundedAt: new Date(), completesOrder: false };
}

/** A running GBP shop with one 5% tier. */
async function runningShop(shop = SHOP): Promise<ConnectionContext> {
  await ensureMerchant({ shop, name: "Settle Test", currency: "GBP", timezone: "Europe/London", now: INSTALLED });
  const conn = await findConnection(shop);
  if (!conn) throw new Error("no connection");
  await prisma.tier.create({
    data: { merchantId: conn.merchantId, name: "Everyone", minSpend: new Prisma.Decimal(0), cashbackPercent: new Prisma.Decimal("5.00"), position: 0 },
  });
  expect(await setRunning(conn.merchantId, true)).toEqual({ ok: true });
  return { ...conn, running: true };
}

/** A running shop with one recorded order: by default a pending £2.50 credit. */
async function pendingCredit(o: Parameters<typeof orderFacts>[0] = {}) {
  const conn = await runningShop();
  const recorded = await recordOrder(conn, orderFacts(o), "live");
  if (recorded.status !== "recorded" || !recorded.payoutId) throw new Error("no payout");
  return { conn, orderId: recorded.orderId, customerId: recorded.customerId, payoutId: recorded.payoutId };
}

const applied = (id = "gid://shopify/StoreCreditAccountCreditTransaction/1"): RailAnswer => ({ outcome: "applied", transactionId: id });
const unclear: RailAnswer = { outcome: "unclear", message: "Shopify answered 502" };
const refusedForGood: RailAnswer = { outcome: "refused", permanent: true, code: "OWNER_NOT_FOUND", message: "Owner not found" };

/** A rail that answers every call the same way. */
function fakeRail(o: { credit?: RailAnswer; debit?: RailAnswer; history?: CreditHistoryResult } = {}) {
  return {
    credit: vi.fn<PayoutRail["credit"]>(async () => o.credit ?? applied()),
    debit: vi.fn<PayoutRail["debit"]>(async () => o.debit ?? applied("gid://shopify/StoreCreditAccountDebitTransaction/1")),
    balance: vi.fn<PayoutRail["balance"]>(async () => new Money("100.00")),
    creditHistory: vi.fn<PayoutRail["creditHistory"]>(async () => o.history ?? { status: "found", credits: [], complete: true }),
  } satisfies PayoutRail;
}

/** A pending £2.50 credit sent `minutesAgo` minutes ago with an unclear answer: `unconfirmed`. */
async function unconfirmedCredit(minutesAgo = 60, o: Parameters<typeof orderFacts>[0] = {}) {
  const credit = await pendingCredit(o);
  await expect(sendPayout(credit.payoutId, fakeRail({ credit: unclear }))).resolves.toBe("unconfirmed");
  await backdateClaim(credit.payoutId, minutesAgo);
  return credit;
}

/** A credit Shopify refused for good: needs a look, `refused`. */
async function refusedCredit(o: Parameters<typeof orderFacts>[0] = {}) {
  const credit = await pendingCredit(o);
  await expect(sendPayout(credit.payoutId, fakeRail({ credit: refusedForGood }))).resolves.toBe("needs_look");
  return credit;
}

/** A credit that couldn't be confirmed: needs a look, `could_not_confirm`. */
async function unconfirmableCredit() {
  const credit = await unconfirmedCredit();
  const twoAlike = fakeRail({
    history: {
      status: "found",
      complete: true,
      credits: [0, 1].map((n) => ({ id: `t${n}`, amount: new Money("2.50"), currency: "GBP", createdAt: new Date(Date.now() - 60 * MINUTE + n * 1000) })),
    },
  });
  await expect(settleUnconfirmed(credit.payoutId, twoAlike)).resolves.toBe("needs_look");
  return credit;
}

/** A sent £2.50 credit and a take-back of £0.50 (refund 1, £10 of products) in `state`. */
async function debitIn(state: "pending" | "sending" | "needs_look", data: Prisma.PayoutUpdateInput = {}) {
  const credit = await pendingCredit();
  await expect(sendPayout(credit.payoutId, fakeRail())).resolves.toBe("sent");
  const refund = await recordRefund(credit.conn, ORDER, refundFacts(1, "10.00"));
  if (refund.status !== "recorded" || !refund.reversalPayoutId) throw new Error("no take-back");
  await prisma.payout.update({ where: { id: refund.reversalPayoutId }, data: { state, ...data } });
  return { ...credit, creditPayoutId: credit.payoutId, payoutId: refund.reversalPayoutId };
}

const money = (v: Prisma.Decimal | null | undefined) => (v == null ? null : v.toFixed(2));

async function payoutOf(id: string) {
  const p = await prisma.payout.findUniqueOrThrow({ where: { id } });
  return { ...p, amount: money(p.amount), debitedAmount: money(p.debitedAmount), shortfall: money(p.shortfall) };
}

/** The order's ledger and payouts, oldest entry first. */
async function ledgerOf(orderId: string) {
  const entries = await prisma.ledgerEntry.findMany({ where: { orderId }, include: { payout: true }, orderBy: { createdAt: "asc" } });
  const net = (pick: (e: (typeof entries)[number]) => Prisma.Decimal) => entries.reduce((sum, e) => sum.plus(pick(e).toString()), new Money(0)).toFixed(2);
  return {
    entries: entries.map((e) => ({
      kind: e.kind,
      amount: money(e.amount),
      shopAmount: money(e.shopAmount),
      currency: e.currency,
      key: e.idempotencyKey,
      payout: e.payout ? { direction: e.payout.direction, state: e.payout.state, amount: money(e.payout.amount) } : null,
    })),
    net: net((e) => e.amount),
    shopNet: net((e) => e.shopAmount),
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe.skipIf(!hasTestDatabase)("settleUnconfirmed", () => {
  let shopifyRail: () => Promise<PayoutRail>;

  beforeAll(async () => {
    // ~/shopify.server checks the Session table as soon as it is imported,
    // so it is imported only with a test database. The library logs its
    // version at start.
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.SHOPIFY_API_KEY = "test-api-key";
    const { unauthenticated } = await import("~/shopify.server");
    shopifyRail = async () => createStoreCreditRail((await unauthenticated.admin(SHOP)).admin);
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedOfflineSession(SHOP);
  });

  afterAll(() => {
    delete process.env.SHOPIFY_API_KEY;
    vi.restoreAllMocks();
  });

  it("waits while the claim may still be running, without reading the history", async () => {
    const { payoutId } = await unconfirmedCredit(10);
    const rail = fakeRail();

    await expect(settleUnconfirmed(payoutId, rail)).resolves.toBe("waiting");

    expect(rail.creditHistory).not.toHaveBeenCalled();
    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "unconfirmed" });
  });

  it("dates the claim from Shopify's unclear answer when it came later than the claim", async () => {
    const { payoutId } = await unconfirmedCredit(60);
    // Claimed 60 minutes ago; the unclear answer came 20 minutes ago.
    await prisma.payout.update({ where: { id: payoutId }, data: { unconfirmedAt: new Date(Date.now() - 20 * MINUTE) } });
    const rail = fakeRail();

    await expect(settleUnconfirmed(payoutId, rail)).resolves.toBe("waiting");
    expect(rail.creditHistory).not.toHaveBeenCalled();
  });

  it("leaves payouts that aren't waiting on an answer alone", async () => {
    const { payoutId } = await pendingCredit();
    const rail = fakeRail();

    await expect(settleUnconfirmed(payoutId, rail)).resolves.toBe("waiting");
    await expect(sendPayout(payoutId, rail)).resolves.toBe("sent");
    await expect(settleUnconfirmed(payoutId, rail)).resolves.toBe("waiting");

    expect(rail.creditHistory).not.toHaveBeenCalled();
    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "sent", settledBy: null });
  });

  it("landed: sent, and a held take-back is released for the next sendPayout to debit", async () => {
    const { conn, payoutId, orderId } = await pendingCredit();
    const balances = { [BUYER]: "0" };
    const history = creditHistory();
    // Shopify applies the credit but the answer is lost.
    const calls = mockStoreCredit(SHOP, balances, { unanswered: 1, history });
    await expect(sendPayout(payoutId, await shopifyRail())).resolves.toBe("unconfirmed");
    // A £10 refund meanwhile holds its £0.50 take-back.
    const refund = await recordRefund(conn, ORDER, refundFacts(1, "10.00"));
    if (refund.status !== "recorded" || !refund.reversalPayoutId) throw new Error("no take-back");
    await expect(payoutOf(refund.reversalPayoutId)).resolves.toMatchObject({ state: "held", amount: "0.50" });
    await backdateClaim(payoutId, 60, history);
    const now = new Date();

    await expect(settleUnconfirmed(payoutId, await shopifyRail(), now)).resolves.toBe("sent");

    expect(history.reads).toBe(1);
    await expect(payoutOf(payoutId)).resolves.toMatchObject({
      state: "sent",
      settledBy: "auto",
      amount: "2.50",
      externalTransactionId: history.credits[0].id,
      sentAt: history.credits[0].createdAt,
      lookReason: null,
      lastError: null,
    });
    await expect(payoutOf(refund.reversalPayoutId)).resolves.toMatchObject({ state: "pending", nextAttemptAt: now });

    await expect(sendPayout(refund.reversalPayoutId, await shopifyRail())).resolves.toBe("sent");
    expect(calls.map((c) => `${c.operation} ${c.amount}`)).toEqual(["credit 2.50", "debit 0.50"]);
    expect(balances[BUYER]).toBe("2.00");
    await expect(ledgerOf(orderId)).resolves.toMatchObject({ net: "2.00" });
  });

  it("not landed: back to pending less the held take-back, which nets out", async () => {
    const { conn, payoutId, orderId } = await unconfirmedCredit();
    const refund = await recordRefund(conn, ORDER, refundFacts(1, "10.00"));
    if (refund.status !== "recorded" || !refund.reversalPayoutId) throw new Error("no take-back");
    // Shopify's history holds no credit of £2.50: nothing arrived.
    const history = creditHistory();
    const calls = mockStoreCredit(SHOP, { [BUYER]: "0" }, { history });
    const now = new Date();

    await expect(settleUnconfirmed(payoutId, await shopifyRail(), now)).resolves.toBe("returned");

    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "pending", amount: "2.00", nextAttemptAt: now, unconfirmedAt: null, settledBy: null });
    await expect(payoutOf(refund.reversalPayoutId)).resolves.toMatchObject({ state: "nothing_to_send", amount: "0.50" });
    await expect(ledgerOf(orderId)).resolves.toMatchObject({ net: "2.00" });

    await expect(sendPayout(payoutId, await shopifyRail(), now)).resolves.toBe("sent");
    expect(calls.map((c) => `${c.operation} ${c.amount}`)).toEqual(["credit 2.00"]);
  });

  it("not landed while a refund holds the credit: settle waits, then nets the take-back the refund held (A11-F3)", async () => {
    // The refund runs on a client of its own (the test pool has one
    // connection) and is held once it holds the credit's and the order's
    // locks, until settle is waiting on them. Without settle's lock it would
    // send the credit again in full, and the take-back would stay held.
    const { conn, payoutId, orderId } = await unconfirmedCredit();
    const refundClient = createPrismaClient(process.env.REWARDS_DATABASE_URL);
    const watcher = createPrismaClient(process.env.REWARDS_DATABASE_URL);
    let settling: Promise<unknown> | null = null;
    const held = refundClient.$extends({
      query: {
        ledgerEntry: {
          async create({ args, query }) {
            settling ??= settleUnconfirmed(payoutId, fakeRail());
            settling.catch(() => {});
            await waitForLockWaitOr(watcher, settling);
            return query(args);
          },
        },
      },
    }) as unknown as PrismaClient;

    let refund: Awaited<ReturnType<typeof recordRefund>>;
    try {
      refund = await recordRefund(conn, ORDER, refundFacts(1, "10.00"), held);
      await expect(settling).resolves.toBe("returned");
    } finally {
      await refundClient.$disconnect();
      await watcher.$disconnect();
    }

    if (refund.status !== "recorded" || !refund.reversalPayoutId) throw new Error("no take-back");
    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "pending", amount: "2.00" });
    await expect(payoutOf(refund.reversalPayoutId)).resolves.toMatchObject({ state: "nothing_to_send", amount: "0.50" });
    await expect(ledgerOf(orderId)).resolves.toMatchObject({ net: "2.00" });
  });

  it("not landed after a refund of everything: nothing to send", async () => {
    const { conn, payoutId, orderId } = await unconfirmedCredit();
    await recordRefund(conn, ORDER, refundFacts(1, "50.00"));

    await expect(settleUnconfirmed(payoutId, fakeRail())).resolves.toBe("returned");

    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "nothing_to_send", amount: "0.00" });
    const ledger = await ledgerOf(orderId);
    expect(ledger.net).toBe("0.00");
    expect(ledger.entries.map((e) => e.payout?.state)).toEqual(["nothing_to_send", "nothing_to_send"]);
  });

  it("unknown: needs a look because it couldn't be confirmed, and is never sent again", async () => {
    const { payoutId } = await unconfirmedCredit();
    const history = creditHistory();
    // Two credits of £2.50 from when it was sent: one from somewhere else.
    for (const n of [1, 2]) {
      history.credits.push({ id: `gid://shopify/StoreCreditAccountCreditTransaction/9${n}`, customerId: BUYER, amount: "2.50", currency: "GBP", createdAt: new Date(Date.now() - 60 * MINUTE + n * 1000) });
    }
    const calls = mockStoreCredit(SHOP, { [BUYER]: "5.00" }, { history });

    await expect(settleUnconfirmed(payoutId, await shopifyRail())).resolves.toBe("needs_look");

    await expect(payoutOf(payoutId)).resolves.toMatchObject({
      state: "needs_look",
      lookReason: "could_not_confirm",
      lastError: "Shopify holds several credits of this amount from when this one was sent",
    });
    await expect(sendPayout(payoutId, await shopifyRail(), new Date(Date.now() + 2 * HOUR))).resolves.toBe("skipped");
    await expect(settleUnconfirmed(payoutId, await shopifyRail())).resolves.toBe("waiting");
    expect(calls).toEqual([]);
  });

  it("does not take another of the buyer's RewardsPro credits of that amount for this one", async () => {
    const { conn, payoutId } = await unconfirmedCredit();
    // A second order's £2.50 credit sent to the same buyer around the same time.
    const second = await recordOrder(conn, { ...orderFacts(), externalOrderId: "gid://shopify/Order/5002", name: "#5002" }, "live");
    if (second.status !== "recorded" || !second.payoutId) throw new Error("no payout");
    await prisma.payout.update({ where: { id: second.payoutId }, data: { state: "sent", claimedAt: new Date(Date.now() - 58 * MINUTE), sentAt: new Date(Date.now() - 58 * MINUTE) } });
    const rail = fakeRail({
      history: { status: "found", complete: true, credits: [{ id: "t1", amount: new Money("2.50"), currency: "GBP", createdAt: new Date(Date.now() - 60 * MINUTE + 5000) }] },
    });

    await expect(settleUnconfirmed(payoutId, rail)).resolves.toBe("needs_look");
    await expect(payoutOf(payoutId)).resolves.toMatchObject({
      lookReason: "could_not_confirm",
      lastError: "RewardsPro sent this customer another credit of this amount at the same time",
    });
  });

  it("reads the history from just before the claim", async () => {
    const { payoutId } = await unconfirmedCredit();
    const { claimedAt } = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
    const rail = fakeRail();

    await settleUnconfirmed(payoutId, rail);

    expect(rail.creditHistory).toHaveBeenCalledWith(BUYER, new Date(claimedAt!.getTime() - 5 * MINUTE));
  });

  it("a credit still sending after its claim finished is judged the same way", async () => {
    const { payoutId } = await pendingCredit();
    // The function stopped mid-send: no answer was ever written.
    await prisma.payout.update({ where: { id: payoutId }, data: { state: "sending", claimedAt: new Date(Date.now() - CLAIM_FINISHED_MS - MINUTE), attempts: 1 } });

    await expect(settleUnconfirmed(payoutId, fakeRail())).resolves.toBe("returned");
    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "pending", amount: "2.50" });
  });

  it("customer missing: needs a look as refused", async () => {
    const { payoutId } = await unconfirmedCredit();

    await expect(settleUnconfirmed(payoutId, fakeRail({ history: { status: "customer_missing" } }))).resolves.toBe("needs_look");

    await expect(payoutOf(payoutId)).resolves.toMatchObject({
      state: "needs_look",
      lookReason: "refused",
      lastError: "The customer no longer exists in Shopify",
    });
  });

  it("a failed read keeps waiting, and needs a look 24 hours after the claim", async () => {
    const { payoutId } = await unconfirmedCredit(23 * 60);
    const rail = fakeRail({ history: { status: "failed", error: "Throttled" } });

    await expect(settleUnconfirmed(payoutId, rail)).resolves.toBe("waiting");
    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "unconfirmed", lookReason: null });

    await expect(settleUnconfirmed(payoutId, rail, new Date(Date.now() + HOUR))).resolves.toBe("needs_look");
    await expect(payoutOf(payoutId)).resolves.toMatchObject({
      state: "needs_look",
      lookReason: "could_not_confirm",
      lastError: "Shopify would not give the buyer's store credit history: Throttled",
    });
  });

  it("a history read that throws counts as a failed read", async () => {
    const { payoutId } = await unconfirmedCredit();
    const rail = fakeRail();
    rail.creditHistory.mockRejectedValue(new Error("socket hang up"));

    await expect(settleUnconfirmed(payoutId, rail)).resolves.toBe("waiting");
    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "unconfirmed" });
  });

  it("a take-back stuck in sending needs a look, and is never debited again", async () => {
    const { payoutId } = await debitIn("sending", { claimedAt: new Date(Date.now() - CLAIM_FINISHED_MS - MINUTE), attempts: 1 });
    const rail = fakeRail();

    await expect(settleUnconfirmed(payoutId, rail)).resolves.toBe("needs_look");

    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "needs_look", lookReason: "could_not_confirm" });
    await expect(sendPayout(payoutId, rail, new Date(Date.now() + 2 * HOUR))).resolves.toBe("skipped");
    await expect(settleUnconfirmed(payoutId, rail)).resolves.toBe("waiting");
    expect(rail.debit).not.toHaveBeenCalled();
    expect(rail.balance).not.toHaveBeenCalled();
    expect(rail.creditHistory).not.toHaveBeenCalled();
  });

  it("a take-back still inside its claim waits", async () => {
    const { payoutId } = await debitIn("sending", { claimedAt: new Date(Date.now() - 5 * MINUTE), attempts: 1 });

    await expect(settleUnconfirmed(payoutId, fakeRail())).resolves.toBe("waiting");
    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "sending" });
  });

  it("a credit with no claim time can't be judged and needs a look", async () => {
    const { payoutId } = await unconfirmedCredit();
    await prisma.payout.update({ where: { id: payoutId }, data: { claimedAt: null } });
    const rail = fakeRail();

    await expect(settleUnconfirmed(payoutId, rail)).resolves.toBe("needs_look");

    expect(rail.creditHistory).not.toHaveBeenCalled();
    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "needs_look", lookReason: "could_not_confirm" });
  });

  it("a credit whose buyer was erased meanwhile needs a look as refused", async () => {
    const { payoutId, customerId } = await unconfirmedCredit();
    await prisma.customer.update({ where: { id: customerId }, data: { externalCustomerId: null, redactedAt: new Date() } });
    const rail = fakeRail();

    await expect(settleUnconfirmed(payoutId, rail)).resolves.toBe("needs_look");

    expect(rail.creditHistory).not.toHaveBeenCalled();
    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "needs_look", lookReason: "refused", lastError: "Customer data erased" });
  });

  it("writes nothing when the payout changed while its history was read", async () => {
    const { payoutId } = await unconfirmedCredit();
    const rail = fakeRail();
    rail.creditHistory.mockImplementation(async () => {
      // The merchant's view moved it on meanwhile.
      await prisma.payout.update({ where: { id: payoutId }, data: { state: "needs_look", lookReason: "could_not_confirm" } });
      return { status: "found", complete: true, credits: [] };
    });

    await expect(settleUnconfirmed(payoutId, rail)).resolves.toBe("waiting");

    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "needs_look", amount: "2.50" });
  });
});

describe.skipIf(!hasTestDatabase)("answerNeedsLook", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("retry on a refused credit: pending now, the failure clock cleared, and it is sent", async () => {
    const { conn, payoutId } = await refusedCredit();
    await prisma.payout.update({ where: { id: payoutId }, data: { firstFailedAt: new Date(Date.now() - HOUR) } });
    const now = new Date();

    // The caller sends it at once (Ruling 69)
    await expect(answerNeedsLook(conn.merchantId, payoutId, "retry", now)).resolves.toEqual({ ok: true, sendNow: [payoutId] });

    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "pending", nextAttemptAt: now, firstFailedAt: null, lookReason: null });
    const rail = fakeRail();
    await expect(sendPayout(payoutId, rail, now)).resolves.toBe("sent");
    expect(rail.credit).toHaveBeenCalledTimes(1);
  });

  it("retry gives the full backoff ladder again: attempts start from 0 (Ruling 37)", async () => {
    const { conn, payoutId } = await debitIn("needs_look", { lookReason: "kept_failing", attempts: 6, firstFailedAt: new Date(Date.now() - 25 * HOUR) });
    const now = new Date();

    await expect(answerNeedsLook(conn.merchantId, payoutId, "retry", now)).resolves.toMatchObject({ ok: true });

    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "pending", attempts: 0, firstFailedAt: null });
    // The next failure waits an hour, as a first one does, not the longest 8 h.
    const throttled = fakeRail({ debit: { outcome: "refused", permanent: false, code: "THROTTLED", message: "Throttled" } });
    await expect(sendPayout(payoutId, throttled, now)).resolves.toBe("pending");
    await expect(payoutOf(payoutId)).resolves.toMatchObject({ attempts: 1, nextAttemptAt: new Date(now.getTime() + HOUR), firstFailedAt: now });
  });

  it("retry on a take-back that kept failing", async () => {
    const { conn, payoutId } = await debitIn("needs_look", { lookReason: "kept_failing", firstFailedAt: new Date(Date.now() - 25 * HOUR), lastError: "INSUFFICIENT_FUNDS" });
    const now = new Date();

    await expect(answerNeedsLook(conn.merchantId, payoutId, "retry", now)).resolves.toMatchObject({ ok: true });

    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "pending", nextAttemptAt: now, firstFailedAt: null });
  });

  it("close on a refused credit: closed by the merchant, its cashback cancelled in both currencies", async () => {
    const { conn, payoutId, orderId } = await refusedCredit({ currency: "EUR", product: "50.00", shopProduct: "43.00" });

    // Nothing to send
    await expect(answerNeedsLook(conn.merchantId, payoutId, "close")).resolves.toEqual({ ok: true, sendNow: [] });

    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "closed", settledBy: "merchant", amount: "2.50" });
    const ledger = await ledgerOf(orderId);
    expect(ledger.entries).toEqual([
      { kind: "cashback", amount: "2.50", shopAmount: "2.15", currency: "EUR", key: `cashback:${orderId}`, payout: { direction: "credit", state: "closed", amount: "2.50" } },
      { kind: "adjustment", amount: "-2.50", shopAmount: "-2.15", currency: "EUR", key: `close:${payoutId}`, payout: null },
    ]);
    expect(ledger).toMatchObject({ net: "0.00", shopNet: "0.00" });
  });

  it("a refused credit, a partial refund, then Close: the order's ledger nets to 0.00", async () => {
    const { conn, payoutId, orderId } = await refusedCredit({ currency: "EUR", product: "50.00", shopProduct: "43.00" });
    await recordRefund(conn, ORDER, refundFacts(1, "10.00", "8.60"));
    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "needs_look", amount: "2.00" });

    await expect(answerNeedsLook(conn.merchantId, payoutId, "close")).resolves.toMatchObject({ ok: true });

    const ledger = await ledgerOf(orderId);
    expect(ledger.entries.map((e) => [e.kind, e.amount, e.shopAmount])).toEqual([
      ["cashback", "2.50", "2.15"],
      ["reversal", "-0.50", "-0.43"],
      ["adjustment", "-2.00", "-1.72"],
    ]);
    expect(ledger).toMatchObject({ net: "0.00", shopNet: "0.00" });
    // Closed: a later refund takes nothing back and sends nothing.
    const later = await recordRefund(conn, ORDER, refundFacts(2, "10.00", "8.60"));
    expect(later).toMatchObject({ status: "recorded", reversalPayoutId: null });
    await expect(ledgerOf(orderId)).resolves.toMatchObject({ net: "0.00" });
  });

  it("close on a take-back that kept failing cancels the take-back", async () => {
    const { conn, payoutId, orderId } = await debitIn("needs_look", { lookReason: "kept_failing" });

    await expect(answerNeedsLook(conn.merchantId, payoutId, "close")).resolves.toMatchObject({ ok: true });

    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "closed", settledBy: "merchant" });
    const ledger = await ledgerOf(orderId);
    expect(ledger.entries.map((e) => [e.kind, e.amount, e.key])).toEqual([
      ["cashback", "2.50", `cashback:${orderId}`],
      ["reversal", "-0.50", `reversal:${conn.connectionId}:gid://shopify/Refund/1`],
      ["adjustment", "0.50", `close:${payoutId}`],
    ]);
    // The buyer keeps the £2.50 they were sent.
    expect(ledger.net).toBe("2.50");
  });

  // Ruling 67: an answer made about one send is refused once the payout is at another
  it("refuses an answer about another send than the payout is at, changing nothing", async () => {
    const { conn, payoutId } = await unconfirmableCredit();
    const payout = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
    const version = payoutVersion(payout);
    expect(version).toBe(payout.claimedAt!.toISOString());

    for (const stale of [null, "", new Date(payout.claimedAt!.getTime() - 1).toISOString()]) {
      await expect(answerNeedsLook(conn.merchantId, payoutId, "not_arrived", new Date(), { version: stale })).resolves.toEqual({
        ok: false,
        reason: "not_waiting_for_this_answer",
      });
    }
    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "needs_look", lookReason: "could_not_confirm" });
    await expect(answerNeedsLook(conn.merchantId, payoutId, "not_arrived", new Date(), { version })).resolves.toEqual({ ok: true, sendNow: [payoutId] });
  });

  it("a second close is not waiting for this answer", async () => {
    const { conn, payoutId, orderId } = await refusedCredit();
    await expect(answerNeedsLook(conn.merchantId, payoutId, "close")).resolves.toMatchObject({ ok: true });

    await expect(answerNeedsLook(conn.merchantId, payoutId, "close")).resolves.toEqual({ ok: false, reason: "not_waiting_for_this_answer" });
    await expect(answerNeedsLook(conn.merchantId, payoutId, "retry")).resolves.toEqual({ ok: false, reason: "not_waiting_for_this_answer" });
    expect((await ledgerOf(orderId)).entries).toHaveLength(2);
  });

  it("arrived on a credit that couldn't be confirmed: sent by the merchant, its held take-back released", async () => {
    const { conn, payoutId } = await unconfirmableCredit();
    const refund = await recordRefund(conn, ORDER, refundFacts(1, "10.00"));
    if (refund.status !== "recorded" || !refund.reversalPayoutId) throw new Error("no take-back");
    await expect(payoutOf(refund.reversalPayoutId)).resolves.toMatchObject({ state: "held" });
    const now = new Date();
    const { claimedAt } = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
    expect(claimedAt).toBeInstanceOf(Date);

    // The released take-back is the one to send at once (Ruling 69)
    await expect(answerNeedsLook(conn.merchantId, payoutId, "arrived", now)).resolves.toEqual({ ok: true, sendNow: [refund.reversalPayoutId] });

    // Dated when it went out, not when the merchant answered (TRUTH-8)
    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "sent", settledBy: "merchant", sentAt: claimedAt, amount: "2.50" });
    await expect(payoutOf(refund.reversalPayoutId)).resolves.toMatchObject({ state: "pending", nextAttemptAt: now, amount: "0.50" });
    const rail = fakeRail();
    await expect(sendPayout(refund.reversalPayoutId, rail, now)).resolves.toBe("sent");
    expect(rail.debit.mock.calls.map(([d]) => d.amount.toFixed(2))).toEqual(["0.50"]);
  });

  it("a refund while it couldn't be confirmed, then It didn't arrive: sent minus the refunded share, no take-back held", async () => {
    const { conn, payoutId, orderId } = await unconfirmableCredit();
    const refund = await recordRefund(conn, ORDER, refundFacts(1, "10.00"));
    if (refund.status !== "recorded" || !refund.reversalPayoutId) throw new Error("no take-back");
    const now = new Date();

    await expect(answerNeedsLook(conn.merchantId, payoutId, "not_arrived", now)).resolves.toEqual({ ok: true, sendNow: [payoutId] });

    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "pending", amount: "2.00", nextAttemptAt: now, lookReason: null });
    await expect(prisma.payout.count({ where: { state: "held" } })).resolves.toBe(0);
    const rail = fakeRail();
    await expect(sendPayout(payoutId, rail, now)).resolves.toBe("sent");
    expect(rail.credit.mock.calls.map(([c]) => c.amount.toFixed(2))).toEqual(["2.00"]);
    await expect(ledgerOf(orderId)).resolves.toMatchObject({ net: "2.00" });
  });

  it("It didn't arrive after a refund of everything: nothing to send", async () => {
    const { conn, payoutId } = await unconfirmableCredit();
    await recordRefund(conn, ORDER, refundFacts(1, "50.00"));

    await expect(answerNeedsLook(conn.merchantId, payoutId, "not_arrived")).resolves.toEqual({ ok: true, sendNow: [] });

    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "nothing_to_send", amount: "0.00" });
    await expect(prisma.payout.count({ where: { state: { not: "nothing_to_send" } } })).resolves.toBe(0);
  });

  it("arrived on a take-back that couldn't be confirmed: sent, keeping what it asked for", async () => {
    const { conn, payoutId } = await debitIn("needs_look", { lookReason: "could_not_confirm", debitedAmount: "0.50", shortfall: "0" });
    const now = new Date();

    await expect(answerNeedsLook(conn.merchantId, payoutId, "arrived", now)).resolves.toMatchObject({ ok: true });

    // No claim or unconfirmed time on record: the answer's own time
    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "sent", settledBy: "merchant", sentAt: now, debitedAmount: "0.50", shortfall: "0.00" });
    await expect(prisma.ledgerEntry.count({ where: { kind: "adjustment" } })).resolves.toBe(0);
  });

  it("arrived on a take-back that asked for less than it was: the shortfall reaches the ledger (Ruling 35)", async () => {
    // £0.50 to take back, the buyer held £0.20 of it when it was asked for.
    const { conn, payoutId, orderId } = await debitIn("needs_look", { lookReason: "could_not_confirm", debitedAmount: "0.20", shortfall: "0.30" });

    await expect(answerNeedsLook(conn.merchantId, payoutId, "arrived")).resolves.toMatchObject({ ok: true });

    const ledger = await ledgerOf(orderId);
    expect(ledger.entries.map((e) => [e.kind, e.amount, e.shopAmount, e.key])).toEqual([
      ["cashback", "2.50", "2.50", `cashback:${orderId}`],
      ["reversal", "-0.50", "-0.50", `reversal:${conn.connectionId}:gid://shopify/Refund/1`],
      ["adjustment", "0.30", "0.30", `shortfall:${payoutId}`],
    ]);
    expect(ledger).toMatchObject({ net: "2.30", shopNet: "2.30" });
  });

  it("arrived on a take-back that died mid-send writes no shortfall: what it took is unknown (A11-F4)", async () => {
    const { conn, payoutId, orderId } = await debitIn("needs_look", { lookReason: "could_not_confirm" });

    await expect(answerNeedsLook(conn.merchantId, payoutId, "arrived")).resolves.toMatchObject({ ok: true });

    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "sent", debitedAmount: null, shortfall: null });
    expect((await ledgerOf(orderId)).entries.map((e) => e.kind)).toEqual(["cashback", "reversal"]);
  });

  it("It didn't arrive on a take-back: pending now, to be debited again", async () => {
    const { conn, payoutId } = await debitIn("needs_look", { lookReason: "could_not_confirm", debitedAmount: "0.50", shortfall: "0" });
    const now = new Date();

    await expect(answerNeedsLook(conn.merchantId, payoutId, "not_arrived", now)).resolves.toMatchObject({ ok: true });

    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "pending", nextAttemptAt: now, amount: "0.50", debitedAmount: null, shortfall: null });
    const rail = fakeRail();
    await expect(sendPayout(payoutId, rail, now)).resolves.toBe("sent");
    expect(rail.debit).toHaveBeenCalledTimes(1);
  });

  it("each answer is refused where the payout isn't waiting for it", async () => {
    const refused = await refusedCredit();
    for (const answer of ["arrived", "not_arrived"] as const) {
      await expect(answerNeedsLook(refused.conn.merchantId, refused.payoutId, answer)).resolves.toEqual({ ok: false, reason: "not_waiting_for_this_answer" });
    }
    await resetDatabase();
    const unconfirmable = await unconfirmableCredit();
    for (const answer of ["retry", "close"] as const) {
      await expect(answerNeedsLook(unconfirmable.conn.merchantId, unconfirmable.payoutId, answer)).resolves.toEqual({ ok: false, reason: "not_waiting_for_this_answer" });
    }
    await expect(payoutOf(unconfirmable.payoutId)).resolves.toMatchObject({ state: "needs_look", lookReason: "could_not_confirm" });
    await resetDatabase();
    const pending = await pendingCredit();
    for (const answer of ["retry", "close", "arrived", "not_arrived"] as const) {
      await expect(answerNeedsLook(pending.conn.merchantId, pending.payoutId, answer)).resolves.toEqual({ ok: false, reason: "not_waiting_for_this_answer" });
    }
    await expect(payoutOf(pending.payoutId)).resolves.toMatchObject({ state: "pending" });
  });

  describe("a take-back held while the credit was unconfirmed, then the credit is refused", () => {
    /** An unconfirmed £2.50 credit, a £10 refund holding its £0.50 take-back, then settle finds the customer gone. */
    async function heldThenRefused() {
      const credit = await unconfirmedCredit();
      const refund = await recordRefund(credit.conn, ORDER, refundFacts(1, "10.00", "10.00"));
      if (refund.status !== "recorded" || !refund.reversalPayoutId) throw new Error("no take-back");
      await expect(payoutOf(refund.reversalPayoutId)).resolves.toMatchObject({ state: "held", amount: "0.50" });
      await expect(settleUnconfirmed(credit.payoutId, fakeRail({ history: { status: "customer_missing" } }))).resolves.toBe("needs_look");
      return { ...credit, takeBackId: refund.reversalPayoutId };
    }

    it("settle nets the held take-back into the refused credit", async () => {
      const { payoutId, takeBackId, orderId } = await heldThenRefused();

      await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "needs_look", lookReason: "refused", amount: "2.00", lastError: "The customer no longer exists in Shopify" });
      await expect(payoutOf(takeBackId)).resolves.toMatchObject({ state: "nothing_to_send", amount: "0.50" });
      await expect(ledgerOf(orderId)).resolves.toMatchObject({ net: "2.00" });
    });

    it("then Close: no take-back stays held, the adjustment equals the payout's amount, and the order nets to 0.00", async () => {
      const { conn, payoutId, orderId } = await heldThenRefused();

      await expect(answerNeedsLook(conn.merchantId, payoutId, "close")).resolves.toMatchObject({ ok: true });

      await expect(prisma.payout.count({ where: { state: "held" } })).resolves.toBe(0);
      await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "closed", settledBy: "merchant", amount: "2.00" });
      const ledger = await ledgerOf(orderId);
      expect(ledger.entries.map((e) => [e.kind, e.amount, e.payout?.state ?? null])).toEqual([
        ["cashback", "2.50", "closed"],
        ["reversal", "-0.50", "nothing_to_send"],
        ["adjustment", "-2.00", null],
      ]);
      expect(ledger).toMatchObject({ net: "0.00", shopNet: "0.00" });
    });

    it("then Retry: the credit less the take-back is sent, and nothing is taken back", async () => {
      const { conn, payoutId, takeBackId, orderId } = await heldThenRefused();
      const now = new Date();

      await expect(answerNeedsLook(conn.merchantId, payoutId, "retry", now)).resolves.toMatchObject({ ok: true });

      await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "pending", amount: "2.00", nextAttemptAt: now });
      const rail = fakeRail();
      await expect(sendPayout(payoutId, rail, now)).resolves.toBe("sent");
      await expect(sendPayout(takeBackId, rail, now)).resolves.toBe("skipped");
      expect(rail.credit.mock.calls.map(([c]) => c.amount.toFixed(2))).toEqual(["2.00"]);
      expect(rail.debit).not.toHaveBeenCalled();
      await expect(ledgerOf(orderId)).resolves.toMatchObject({ net: "2.00" });
    });

    it("a buyer erased meanwhile: the held take-back is netted the same way", async () => {
      const credit = await unconfirmedCredit();
      const refund = await recordRefund(credit.conn, ORDER, refundFacts(1, "10.00"));
      if (refund.status !== "recorded" || !refund.reversalPayoutId) throw new Error("no take-back");
      await prisma.customer.update({ where: { id: credit.customerId }, data: { externalCustomerId: null, redactedAt: new Date() } });

      await expect(settleUnconfirmed(credit.payoutId, fakeRail())).resolves.toBe("needs_look");

      await expect(payoutOf(credit.payoutId)).resolves.toMatchObject({ state: "needs_look", lookReason: "refused", amount: "2.00", lastError: "Customer data erased" });
      await expect(payoutOf(refund.reversalPayoutId)).resolves.toMatchObject({ state: "nothing_to_send" });
    });

    it("a refund of everything held: the refused credit has nothing to send", async () => {
      const credit = await unconfirmedCredit();
      await recordRefund(credit.conn, ORDER, refundFacts(1, "50.00"));

      await expect(settleUnconfirmed(credit.payoutId, fakeRail({ history: { status: "customer_missing" } }))).resolves.toBe("returned");

      await expect(payoutOf(credit.payoutId)).resolves.toMatchObject({ state: "nothing_to_send", amount: "0.00", lookReason: null });
      const ledger = await ledgerOf(credit.orderId);
      expect(ledger.net).toBe("0.00");
      expect(ledger.entries.map((e) => e.payout?.state)).toEqual(["nothing_to_send", "nothing_to_send"]);
    });

    it("closeWithoutSending (A14's redaction) on an unconfirmed credit nets its held take-back too", async () => {
      const credit = await unconfirmedCredit();
      const refund = await recordRefund(credit.conn, ORDER, refundFacts(1, "10.00"));
      if (refund.status !== "recorded" || !refund.reversalPayoutId) throw new Error("no take-back");

      await prisma.$transaction(async (tx) => {
        const locked = await lockPayout(tx, credit.payoutId);
        if (!locked) throw new Error("no payout");
        await closeWithoutSending(tx, locked, { now: new Date(), settledBy: "auto" });
      });

      await expect(prisma.payout.count({ where: { state: "held" } })).resolves.toBe(0);
      await expect(payoutOf(credit.payoutId)).resolves.toMatchObject({ state: "closed", amount: "2.00" });
      const ledger = await ledgerOf(credit.orderId);
      expect(ledger.entries.map((e) => [e.kind, e.amount])).toEqual([
        ["cashback", "2.50"],
        ["reversal", "-0.50"],
        ["adjustment", "-2.00"],
      ]);
      expect(ledger).toMatchObject({ net: "0.00", shopNet: "0.00" });
    });

    it("Close after a refund of everything held: nothing to send, and nothing is adjusted", async () => {
      const credit = await unconfirmedCredit();
      await recordRefund(credit.conn, ORDER, refundFacts(1, "50.00"));

      await prisma.$transaction(async (tx) => {
        const locked = await lockPayout(tx, credit.payoutId);
        if (!locked) throw new Error("no payout");
        await closeWithoutSending(tx, locked, { now: new Date(), settledBy: "auto" });
      });

      await expect(payoutOf(credit.payoutId)).resolves.toMatchObject({ state: "nothing_to_send", amount: "0.00", settledBy: "auto" });
      const ledger = await ledgerOf(credit.orderId);
      expect(ledger.entries.map((e) => e.kind)).toEqual(["cashback", "reversal"]);
      expect(ledger.net).toBe("0.00");
    });
  });

  it("another merchant's payout id is not found", async () => {
    const { payoutId } = await refusedCredit();
    const other = await runningShop(OTHER_SHOP);

    await expect(answerNeedsLook(other.merchantId, payoutId, "close")).resolves.toEqual({ ok: false, reason: "not_found" });
    await expect(answerNeedsLook(other.merchantId, "not-a-payout-id", "close")).resolves.toEqual({ ok: false, reason: "not_found" });

    await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "needs_look", lookReason: "refused" });
  });
});
