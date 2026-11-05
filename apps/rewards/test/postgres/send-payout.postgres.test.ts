import { Prisma, type PrismaClient } from "@prisma/client";
import type { Decimal } from "decimal.js";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma, { createPrismaClient } from "~/db.server";
import { redactCustomer } from "~/lib/erasure.server";
import { ensureMerchant, findConnection, setRunning } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import type { MoneyPair, OrderFacts, RefundFacts } from "~/lib/order-facts";
import { CLAIM_FINISHED_MS, KEEP_TRYING_MS, sendPayout, settleUnconfirmed } from "~/lib/payouts.server";
import type { PayoutRail, RailAnswer } from "~/lib/ports";
import { recordOrder } from "~/lib/record-order.server";
import { recordRefund } from "~/lib/refunds.server";
import { hasTestDatabase, resetDatabase, waitForLockWaitOr } from "./helpers/database";

const SHOP = "send-payout-test.myshopify.com";
const BUYER = "7001";
const ORDER = "gid://shopify/Order/2001";
const INSTALLED = new Date("2026-11-01T09:00:00Z");
const MINUTE = 60_000;
const HOUR = 3_600_000;

function pair(amount: string, shopAmount = amount): MoneyPair {
  return { amount: new Money(amount), shopAmount: new Money(shopAmount) };
}

/** A paid order worth `product` of products (`shopProduct` in the shop's GBP), by BUYER, in GBP unless said. */
function orderFacts(product: string, o: { currency?: string; shopProduct?: string } = {}): OrderFacts {
  return {
    externalOrderId: ORDER,
    name: "#2001",
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

/** Refund `n` of `product` worth of the order's products (`shopProduct` in GBP). */
function refundFacts(n: number, product: string, o: { shopProduct?: string; completesOrder?: boolean } = {}): RefundFacts {
  return {
    externalRefundId: `gid://shopify/Refund/${n}`,
    productValue: pair(product, o.shopProduct),
    refundedAt: new Date(),
    completesOrder: o.completesOrder ?? false,
  };
}

/**
 * A running GBP shop with one 5% tier and one recorded £50 order (or
 * `product` in `currency`, `shopProduct` in GBP): a pending £2.50 credit
 * payout, due now.
 */
async function pendingCredit(o: { notifyBuyers?: boolean; currency?: string; product?: string; shopProduct?: string } = {}) {
  await ensureMerchant({ shop: SHOP, name: "Send Payout Test", currency: "GBP", timezone: "Europe/London", now: INSTALLED });
  const conn = await findConnection(SHOP);
  if (!conn) throw new Error("no connection");
  await prisma.tier.create({
    data: { merchantId: conn.merchantId, name: "Everyone", minSpend: new Prisma.Decimal(0), cashbackPercent: new Prisma.Decimal("5.00"), position: 0 },
  });
  expect(await setRunning(conn.merchantId, true)).toEqual({ ok: true });
  if (o.notifyBuyers) await prisma.merchant.update({ where: { id: conn.merchantId }, data: { notifyBuyers: true } });
  const recorded = await recordOrder(
    { ...conn, running: true },
    orderFacts(o.product ?? "50.00", { currency: o.currency, shopProduct: o.shopProduct }),
    "live",
  );
  if (recorded.status !== "recorded" || !recorded.payoutId) throw new Error("no payout");
  return { conn, payoutId: recorded.payoutId, orderId: recorded.orderId, customerId: recorded.customerId };
}

/** A sent credit, then refund 1 (`product`, and `shopProduct` in GBP): its take-back is the debit `payoutId`. */
async function sentThenRefunded(o: { currency?: string; product?: string; shopProduct?: string; refund: string; refundShop?: string; completesOrder?: boolean }) {
  const credit = await pendingCredit(o);
  await expect(sendPayout(credit.payoutId, fakeRail())).resolves.toBe("sent");
  const refund = await recordRefund(credit.conn, ORDER, refundFacts(1, o.refund, { shopProduct: o.refundShop, completesOrder: o.completesOrder }));
  if (refund.status !== "recorded" || !refund.reversalPayoutId) throw new Error("no take-back");
  return { ...credit, creditPayoutId: credit.payoutId, payoutId: refund.reversalPayoutId };
}

/** What the buyer's ledger adds up to, in the issue and the shop currency, and its shortfall entries. */
async function ledgerOf(customerId: string) {
  const entries = await prisma.ledgerEntry.findMany({ where: { customerId } });
  const total = (pick: (e: (typeof entries)[number]) => Prisma.Decimal) => entries.reduce((sum, e) => sum.plus(pick(e).toString()), new Money(0)).toFixed(2);
  return {
    net: total((e) => e.amount),
    shopNet: total((e) => e.shopAmount),
    shortfalls: entries
      .filter((e) => e.idempotencyKey.startsWith("shortfall:"))
      .map((e) => ({ kind: e.kind, key: e.idempotencyKey, amount: e.amount.toFixed(2), currency: e.currency, shopAmount: e.shopAmount.toFixed(2) })),
  };
}

/** A sent credit and a pending take-back of `amount` from it (as A10 writes one after a refund). */
async function pendingDebit(amount: string) {
  const credit = await pendingCredit();
  await prisma.payout.update({ where: { id: credit.payoutId }, data: { state: "sent", sentAt: new Date() } });
  const entry = await prisma.ledgerEntry.create({
    data: {
      merchantId: credit.conn.merchantId,
      connectionId: credit.conn.connectionId,
      customerId: credit.customerId,
      orderId: credit.orderId,
      kind: "reversal",
      amount: `-${amount}`,
      currency: "GBP",
      shopAmount: `-${amount}`,
      idempotencyKey: `reversal:${credit.conn.connectionId}:gid://shopify/Refund/1`,
    },
  });
  const payout = await prisma.payout.create({
    data: {
      merchantId: credit.conn.merchantId,
      ledgerEntryId: entry.id,
      customerId: credit.customerId,
      rail: "shopify_store_credit",
      direction: "debit",
      amount,
      currency: "GBP",
      state: "pending",
      nextAttemptAt: new Date(),
    },
  });
  return { ...credit, payoutId: payout.id };
}

const applied = (id: string): RailAnswer => ({ outcome: "applied", transactionId: id });
const refused = (permanent: boolean, code: string | null, message = code ?? "refused"): RailAnswer => ({ outcome: "refused", permanent, code, message });
const unclear = (message: string): RailAnswer => ({ outcome: "unclear", message });

/** A rail that answers every credit and debit the same way, with a balance of `balance`. */
function fakeRail(o: { credit?: RailAnswer; debit?: RailAnswer; balance?: Decimal | null } = {}) {
  return {
    credit: vi.fn<PayoutRail["credit"]>(async () => o.credit ?? applied("gid://shopify/StoreCreditAccountCreditTransaction/1")),
    debit: vi.fn<PayoutRail["debit"]>(async () => o.debit ?? applied("gid://shopify/StoreCreditAccountDebitTransaction/1")),
    balance: vi.fn<PayoutRail["balance"]>(async () => (o.balance === undefined ? new Money("100.00") : o.balance)),
    creditHistory: vi.fn<PayoutRail["creditHistory"]>(async () => {
      throw new Error("sending never reads the history");
    }),
  } satisfies PayoutRail;
}

const money = (v: Prisma.Decimal | null) => (v === null ? null : v.toFixed(2));

describe.skipIf(!hasTestDatabase)("sendPayout", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("applied → sent with the transaction id", async () => {
    const { payoutId } = await pendingCredit();
    const rail = fakeRail({ credit: applied("gid://shopify/StoreCreditAccountCreditTransaction/41") });
    const now = new Date();

    await expect(sendPayout(payoutId, rail, now)).resolves.toBe("sent");

    expect(rail.credit).toHaveBeenCalledTimes(1);
    const [sent] = rail.credit.mock.calls[0];
    expect({ ...sent, amount: sent.amount.toFixed(2) }).toEqual({ externalCustomerId: BUYER, amount: "2.50", currency: "GBP", notify: false });
    const payout = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
    expect(payout).toMatchObject({
      state: "sent",
      attempts: 1,
      claimedAt: now,
      sentAt: now,
      externalTransactionId: "gid://shopify/StoreCreditAccountCreditTransaction/41",
      lookReason: null,
      lastError: null,
      debitedAmount: null,
      shortfall: null,
    });
    // Sent once: nothing is claimed again.
    await expect(sendPayout(payoutId, rail, new Date(now.getTime() + 2 * HOUR))).resolves.toBe("skipped");
    expect(rail.credit).toHaveBeenCalledTimes(1);
  });

  it("two sendPayout calls at once make one rail.credit call", async () => {
    // Review Focus 5: the after-response send and the hourly job at once.
    // The test pool has one connection (connection_limit=1), so the second
    // call runs on its own client. The first credit is held in flight until
    // the other call has returned (or 2 s), so the other call's claim runs
    // while the payout is being sent.
    const { payoutId } = await pendingCredit();
    const other = createPrismaClient(process.env.REWARDS_DATABASE_URL);
    let oneReturned!: () => void;
    const returned = new Promise<void>((resolve) => (oneReturned = resolve));
    const rail = fakeRail();
    rail.credit.mockImplementation(async () => {
      await Promise.race([returned, new Promise((resolve) => setTimeout(resolve, 2000))]);
      return applied("gid://shopify/StoreCreditAccountCreditTransaction/42");
    });
    const now = new Date();

    let outcomes: string[];
    try {
      outcomes = await Promise.all([
        sendPayout(payoutId, rail, now).finally(oneReturned),
        sendPayout(payoutId, rail, now, other).finally(oneReturned),
      ]);
    } finally {
      await other.$disconnect();
    }

    expect(outcomes.sort()).toEqual(["sent", "skipped"]);
    expect(rail.credit).toHaveBeenCalledTimes(1);
    await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({ state: "sent", attempts: 1 });
  });

  it("an unclear credit is unconfirmed and a later sendPayout does not resend it", async () => {
    const { payoutId } = await pendingCredit();
    const rail = fakeRail({ credit: unclear("Shopify answered 502") });
    const now = new Date();

    await expect(sendPayout(payoutId, rail, now)).resolves.toBe("unconfirmed");
    await expect(sendPayout(payoutId, rail, new Date(now.getTime() + CLAIM_FINISHED_MS + HOUR))).resolves.toBe("skipped");

    expect(rail.credit).toHaveBeenCalledTimes(1);
    await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({
      state: "unconfirmed",
      attempts: 1,
      claimedAt: now,
      unconfirmedAt: now,
      sentAt: null,
      lastError: "Shopify answered 502",
    });
  });

  it("OWNER_NOT_FOUND → needs_look refused at once", async () => {
    const { payoutId } = await pendingCredit();
    const rail = fakeRail({ credit: refused(true, "OWNER_NOT_FOUND", "Owner does not exist") });
    const now = new Date();

    await expect(sendPayout(payoutId, rail, now)).resolves.toBe("needs_look");
    await expect(sendPayout(payoutId, rail, new Date(now.getTime() + 2 * HOUR))).resolves.toBe("skipped");

    expect(rail.credit).toHaveBeenCalledTimes(1);
    await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({
      state: "needs_look",
      lookReason: "refused",
      lastError: "OWNER_NOT_FOUND",
      attempts: 1,
      sentAt: null,
    });
  });

  it("input the rail can't send (Ruling 14) → needs_look refused at once, with the rail's message", async () => {
    const { payoutId } = await pendingCredit();
    const rail = fakeRail({ credit: refused(true, null, "Store credit amount not in GBP's minor unit (2.505)") });

    await expect(sendPayout(payoutId, rail, new Date())).resolves.toBe("needs_look");

    await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({
      state: "needs_look",
      lookReason: "refused",
      lastError: "Store credit amount not in GBP's minor unit (2.505)",
    });
  });

  it("THROTTLED → pending at +1 h; after 24 h of failures → needs_look kept_failing", async () => {
    const { payoutId } = await pendingCredit();
    const rail = fakeRail({ credit: refused(false, "THROTTLED", "Throttled") });
    const t0 = new Date();
    const read = () => prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });

    await expect(sendPayout(payoutId, rail, t0)).resolves.toBe("pending");
    await expect(read()).resolves.toMatchObject({
      state: "pending",
      attempts: 1,
      nextAttemptAt: new Date(t0.getTime() + HOUR),
      firstFailedAt: t0,
      lastError: "THROTTLED",
      lookReason: null,
    });

    // Not due yet: not claimed, not counted.
    await expect(sendPayout(payoutId, rail, new Date(t0.getTime() + HOUR / 2))).resolves.toBe("skipped");
    expect(rail.credit).toHaveBeenCalledTimes(1);

    // The second failure waits 2 h; the first failure's time stays.
    const t1 = new Date(t0.getTime() + HOUR);
    await expect(sendPayout(payoutId, rail, t1)).resolves.toBe("pending");
    await expect(read()).resolves.toMatchObject({ attempts: 2, nextAttemptAt: new Date(t1.getTime() + 2 * HOUR), firstFailedAt: t0 });

    // Just inside the 24 h it is still tried again later.
    const t2 = new Date(t0.getTime() + KEEP_TRYING_MS - 1);
    await prisma.payout.update({ where: { id: payoutId }, data: { nextAttemptAt: t2 } });
    await expect(sendPayout(payoutId, rail, t2)).resolves.toBe("pending");

    // 24 h after the first failure it needs a look as soon as it is claimed,
    // without asking Shopify again (Ruling 36).
    const t3 = new Date(t0.getTime() + KEEP_TRYING_MS);
    await prisma.payout.update({ where: { id: payoutId }, data: { nextAttemptAt: t3 } });
    await expect(sendPayout(payoutId, rail, t3)).resolves.toBe("needs_look");
    await expect(read()).resolves.toMatchObject({ state: "needs_look", lookReason: "kept_failing", attempts: 3, firstFailedAt: t0, lastError: "THROTTLED" });
    expect(rail.credit).toHaveBeenCalledTimes(3);
  });

  it("the retry due 23 h after the first failure asks Shopify; one claimed at 24 h needs a look without asking (Ruling 36)", async () => {
    const { payoutId } = await pendingCredit();
    // The first failure 23 h ago: the claims below are made now and in an hour.
    const t0 = new Date(Date.now() - 23 * HOUR);
    const read = () => prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
    const rail = fakeRail({ credit: refused(false, "THROTTLED", "Throttled") });

    // The fifth retry, about 23 h after the first failure
    const at23 = new Date(t0.getTime() + 23 * HOUR);
    await prisma.payout.update({ where: { id: payoutId }, data: { firstFailedAt: t0, attempts: 5, nextAttemptAt: at23, lastError: "THROTTLED" } });
    await expect(sendPayout(payoutId, rail, at23)).resolves.toBe("pending");
    expect(rail.credit).toHaveBeenCalledTimes(1);
    await expect(read()).resolves.toMatchObject({ state: "pending", attempts: 6, nextAttemptAt: new Date(at23.getTime() + 8 * HOUR) });

    // Claimed again at exactly 24 h
    const at24 = new Date(t0.getTime() + KEEP_TRYING_MS);
    await prisma.payout.update({ where: { id: payoutId }, data: { nextAttemptAt: at24 } });
    await expect(sendPayout(payoutId, rail, at24)).resolves.toBe("needs_look");
    expect(rail.credit).toHaveBeenCalledTimes(1);
    await expect(read()).resolves.toMatchObject({ state: "needs_look", lookReason: "kept_failing", attempts: 6, firstFailedAt: t0, lastError: "THROTTLED" });
  });

  it("a later success after failures is sent", async () => {
    const { payoutId } = await pendingCredit();
    const rail = fakeRail({ credit: refused(false, null, "Shopify answered 401") });
    const t0 = new Date();

    await expect(sendPayout(payoutId, rail, t0)).resolves.toBe("pending");
    rail.credit.mockResolvedValue(applied("gid://shopify/StoreCreditAccountCreditTransaction/43"));
    await expect(sendPayout(payoutId, rail, new Date(t0.getTime() + HOUR))).resolves.toBe("sent");

    await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({
      state: "sent",
      attempts: 2,
      lastError: null,
      externalTransactionId: "gid://shopify/StoreCreditAccountCreditTransaction/43",
    });
  });

  it("passes notify=true when the merchant turned buyer emails on", async () => {
    const { payoutId } = await pendingCredit({ notifyBuyers: true });
    const rail = fakeRail();

    await expect(sendPayout(payoutId, rail, new Date())).resolves.toBe("sent");

    expect(rail.credit).toHaveBeenCalledWith(expect.objectContaining({ notify: true }));
  });

  it("a debit is capped at the live balance and records the shortfall", async () => {
    const { payoutId } = await pendingDebit("5.00");
    const rail = fakeRail({ balance: new Money("3.20"), debit: applied("gid://shopify/StoreCreditAccountDebitTransaction/7") });
    const now = new Date();

    await expect(sendPayout(payoutId, rail, now)).resolves.toBe("sent");

    expect(rail.balance).toHaveBeenCalledWith(BUYER, "GBP");
    expect(rail.debit).toHaveBeenCalledTimes(1);
    const [taken] = rail.debit.mock.calls[0];
    expect({ ...taken, amount: taken.amount.toFixed(2) }).toEqual({ externalCustomerId: BUYER, amount: "3.20", currency: "GBP" });
    const payout = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
    expect(payout).toMatchObject({ state: "sent", sentAt: now, externalTransactionId: "gid://shopify/StoreCreditAccountDebitTransaction/7" });
    expect({ amount: money(payout.amount), debited: money(payout.debitedAmount), shortfall: money(payout.shortfall) }).toEqual({
      amount: "5.00",
      debited: "3.20",
      shortfall: "1.80",
    });
  });

  it("a debit the balance covers takes it all, with no shortfall", async () => {
    const { payoutId } = await pendingDebit("5.00");
    const rail = fakeRail({ balance: new Money("12.00") });

    await expect(sendPayout(payoutId, rail, new Date())).resolves.toBe("sent");

    expect(rail.debit.mock.calls[0][0].amount.toFixed(2)).toBe("5.00");
    const payout = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
    expect({ debited: money(payout.debitedAmount), shortfall: money(payout.shortfall) }).toEqual({ debited: "5.00", shortfall: "0.00" });
  });

  it("a debit when the buyer holds nothing is sent with nothing taken and the whole amount short", async () => {
    const { payoutId } = await pendingDebit("5.00");
    const rail = fakeRail({ balance: new Money("0") });
    const now = new Date();

    await expect(sendPayout(payoutId, rail, now)).resolves.toBe("sent");

    expect(rail.debit).not.toHaveBeenCalled();
    const payout = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
    expect(payout).toMatchObject({ state: "sent", sentAt: now, externalTransactionId: null });
    expect({ debited: money(payout.debitedAmount), shortfall: money(payout.shortfall) }).toEqual({ debited: "0.00", shortfall: "5.00" });
  });

  it("a debit whose balance can't be read is tried again later, with nothing sent", async () => {
    const { payoutId } = await pendingDebit("5.00");
    const rail = fakeRail({ balance: null });
    const now = new Date();

    await expect(sendPayout(payoutId, rail, now)).resolves.toBe("pending");

    expect(rail.debit).not.toHaveBeenCalled();
    await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({
      state: "pending",
      attempts: 1,
      nextAttemptAt: new Date(now.getTime() + HOUR),
      firstFailedAt: now,
      debitedAmount: null,
      shortfall: null,
    });
  });

  it("an unclear debit → needs_look could_not_confirm, never sent again on its own", async () => {
    const { payoutId } = await pendingDebit("5.00");
    const rail = fakeRail({ balance: new Money("3.20"), debit: unclear("Shopify did not answer within 10 s") });
    const now = new Date();

    await expect(sendPayout(payoutId, rail, now)).resolves.toBe("needs_look");
    await expect(sendPayout(payoutId, rail, new Date(now.getTime() + 2 * HOUR))).resolves.toBe("skipped");

    expect(rail.debit).toHaveBeenCalledTimes(1);
    const payout = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
    expect(payout).toMatchObject({ state: "needs_look", lookReason: "could_not_confirm", lastError: "Shopify did not answer within 10 s", sentAt: null });
    // What was asked for, so "It arrived" leaves the true take-back.
    expect({ debited: money(payout.debitedAmount), shortfall: money(payout.shortfall) }).toEqual({ debited: "3.20", shortfall: "1.80" });
  });

  it("a debit Shopify refuses for good → needs_look refused; INSUFFICIENT_FUNDS is tried again", async () => {
    const { payoutId } = await pendingDebit("5.00");
    const rail = fakeRail({ debit: refused(false, "INSUFFICIENT_FUNDS") });
    const now = new Date();

    await expect(sendPayout(payoutId, rail, now)).resolves.toBe("pending");
    await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({ lastError: "INSUFFICIENT_FUNDS", debitedAmount: null, shortfall: null });

    // As left by an earlier unclear attempt the merchant sent again: a
    // refusal took nothing, so what that attempt asked for is cleared.
    await prisma.payout.update({ where: { id: payoutId }, data: { debitedAmount: "3.20", shortfall: "1.80" } });
    rail.debit.mockResolvedValue(refused(true, "ACCOUNT_NOT_FOUND"));
    await expect(sendPayout(payoutId, rail, new Date(now.getTime() + HOUR))).resolves.toBe("needs_look");
    await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({
      state: "needs_look",
      lookReason: "refused",
      lastError: "ACCOUNT_NOT_FOUND",
      debitedAmount: null,
      shortfall: null,
    });
  });

  it("a buyer whose data was erased → needs_look refused, with nothing sent", async () => {
    const { payoutId, customerId } = await pendingCredit();
    await prisma.customer.update({ where: { id: customerId }, data: { externalCustomerId: null, redactedAt: new Date() } });
    const rail = fakeRail();

    await expect(sendPayout(payoutId, rail, new Date())).resolves.toBe("needs_look");

    expect(rail.credit).not.toHaveBeenCalled();
    await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({
      state: "needs_look",
      lookReason: "refused",
      lastError: "Customer data erased",
    });
  });

  it("only a pending payout is claimed", async () => {
    const { payoutId } = await pendingCredit();
    const rail = fakeRail();
    for (const state of ["held", "sending", "unconfirmed", "closed", "sent", "needs_look", "nothing_to_send"] as const) {
      await prisma.payout.update({ where: { id: payoutId }, data: { state, lookReason: state === "needs_look" ? "refused" : null } });
      await expect(sendPayout(payoutId, rail, new Date())).resolves.toBe("skipped");
    }
    expect(rail.credit).not.toHaveBeenCalled();
    await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({ attempts: 0, claimedAt: null });
  });

  it("a balance read that throws keeps its error in lastError (A9-F2)", async () => {
    const { payoutId } = await pendingDebit("5.00");
    const rail = fakeRail();
    rail.balance.mockRejectedValue(new Error("Shopify did not answer within 2.5 s"));

    await expect(sendPayout(payoutId, rail, new Date())).resolves.toBe("pending");

    expect(rail.debit).not.toHaveBeenCalled();
    await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({
      state: "pending",
      lastError: "The buyer's store credit balance could not be read: Shopify did not answer within 2.5 s",
    });
  });

  it("an answer for a payout that changed while it was sent is not written, and says so (claim_lost, A9-F3)", async () => {
    const { payoutId } = await pendingCredit();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rail = fakeRail();
    rail.credit.mockImplementation(async () => {
      // Moved on meanwhile, as a stale claim taken over would be.
      await prisma.payout.update({ where: { id: payoutId }, data: { state: "needs_look", lookReason: "could_not_confirm" } });
      return applied("gid://shopify/StoreCreditAccountCreditTransaction/44");
    });

    try {
      await expect(sendPayout(payoutId, rail, new Date())).resolves.toBe("claim_lost");
      await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({ state: "needs_look", externalTransactionId: null });
      expect(warn).toHaveBeenCalledTimes(1);
      const [line] = warn.mock.calls[0] as [string];
      expect(line).toContain(payoutId);
      expect(line).toContain("applied");
      expect(line).not.toContain(BUYER);
    } finally {
      warn.mockRestore();
    }
  });

  describe("a take-back that falls short reaches the ledger (Ruling 35)", () => {
    it("a EUR buyer on a GBP shop who spent most of it: the shortfall is an adjustment in both currencies", async () => {
      // €2.50 (£2.15) sent, the order refunded in full, and the buyer holds €0.40 of it.
      const { payoutId, customerId } = await sentThenRefunded({ currency: "EUR", product: "50.00", shopProduct: "43.00", refund: "50.00", refundShop: "43.00", completesOrder: true });
      const rail = fakeRail({ balance: new Money("0.40") });

      await expect(sendPayout(payoutId, rail, new Date())).resolves.toBe("sent");

      expect(rail.debit.mock.calls.map(([d]) => [d.amount.toFixed(2), d.currency])).toEqual([["0.40", "EUR"]]);
      const payout = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
      expect({ state: payout.state, debited: money(payout.debitedAmount), shortfall: money(payout.shortfall) }).toEqual({ state: "sent", debited: "0.40", shortfall: "2.10" });
      // €2.10 kept: its shop share is £2.15 × 2.10 / 2.50 = £1.806, half up to £1.81.
      await expect(ledgerOf(customerId)).resolves.toEqual({
        net: "2.10",
        shopNet: "1.81",
        shortfalls: [{ kind: "adjustment", key: `shortfall:${payoutId}`, amount: "2.10", currency: "EUR", shopAmount: "1.81" }],
      });
    });

    it("a buyer who holds nothing: the whole take-back is the shortfall", async () => {
      const { payoutId, customerId } = await sentThenRefunded({ refund: "50.00", completesOrder: true });

      await expect(sendPayout(payoutId, fakeRail({ balance: new Money("0") }), new Date())).resolves.toBe("sent");

      await expect(ledgerOf(customerId)).resolves.toEqual({
        net: "2.50",
        shopNet: "2.50",
        shortfalls: [{ kind: "adjustment", key: `shortfall:${payoutId}`, amount: "2.50", currency: "GBP", shopAmount: "2.50" }],
      });
    });

    it("a take-back the balance covers writes no adjustment", async () => {
      const { payoutId, customerId } = await sentThenRefunded({ refund: "20.00" });

      await expect(sendPayout(payoutId, fakeRail(), new Date())).resolves.toBe("sent");

      await expect(ledgerOf(customerId)).resolves.toEqual({ net: "1.50", shopNet: "1.50", shortfalls: [] });
    });

    it("a later refund takes back its share of the cashback, not the shortfall again", async () => {
      // £1.00 asked for, £0.40 held: £0.60 short. The refund completing the order then takes the £1.50 left.
      const { conn, payoutId, customerId } = await sentThenRefunded({ refund: "20.00" });
      await expect(sendPayout(payoutId, fakeRail({ balance: new Money("0.40") }), new Date())).resolves.toBe("sent");

      const later = await recordRefund(conn, ORDER, refundFacts(2, "30.00", { completesOrder: true }));

      if (later.status !== "recorded") throw new Error(later.status);
      expect(later.takenBack.toFixed(2)).toBe("1.50");
      await expect(ledgerOf(customerId)).resolves.toMatchObject({ net: "0.60", shortfalls: [{ amount: "0.60" }] });
    });
  });

  it("a take-back's answer and customers/redact on the same order at once both finish: both lock the credit first", async () => {
    // The take-back's answer is written on a client of its own, held once it
    // holds its locks, while the redaction (which must close a second
    // take-back of the order) starts. Were the answer to lock the take-back
    // before the order's credit, the redaction would hold the credit and the
    // order, wait on the take-back, and the answer would then wait on the
    // order: a deadlock (40P01).
    const { conn, payoutId, customerId } = await sentThenRefunded({ refund: "10.00" });
    const second = await recordRefund(conn, ORDER, refundFacts(2, "10.00"));
    if (second.status !== "recorded" || !second.reversalPayoutId) throw new Error("no second take-back");
    const answerClient = createPrismaClient(process.env.REWARDS_DATABASE_URL);
    const watcher = createPrismaClient(process.env.REWARDS_DATABASE_URL);
    let redaction: Promise<unknown> | null = null;
    const held = answerClient.$extends({
      query: {
        payout: {
          async findUnique({ args, query }) {
            // lockPayout's read of the payout under its own row lock
            if (!redaction && args.include) {
              redaction = redactCustomer(conn, BUYER);
              redaction.catch(() => {});
              await waitForLockWaitOr(watcher, redaction);
            }
            return query(args);
          },
        },
      },
    }) as unknown as PrismaClient;

    let outcome: string;
    try {
      outcome = await sendPayout(payoutId, fakeRail(), new Date(), held);
      await expect(redaction).resolves.toEqual({ found: true });
    } finally {
      await answerClient.$disconnect();
      await watcher.$disconnect();
    }

    expect(outcome).toBe("sent");
    await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({ state: "sent" });
    await expect(prisma.payout.findUniqueOrThrow({ where: { id: second.reversalPayoutId } })).resolves.toMatchObject({ state: "closed" });
    await expect(prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).resolves.toMatchObject({ externalCustomerId: null });
  });

  describe("an answer that comes after the claim is over (CONCURRENCY-2)", () => {
    it("writes nothing once CLAIM_FINISHED_MS has passed, and settle later resolves the held take-back", async () => {
      const { conn, payoutId } = await pendingCredit();
      const claimedAt = new Date(Date.now() - CLAIM_FINISHED_MS - MINUTE);
      await prisma.payout.update({ where: { id: payoutId }, data: { nextAttemptAt: claimedAt } });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      let takeBackId: string | null = null;
      const rail = fakeRail();
      rail.credit.mockImplementation(async () => {
        // The claim is over by the clock, so a refund now holds its take-back.
        const refund = await recordRefund(conn, ORDER, refundFacts(1, "20.00"));
        if (refund.status !== "recorded") throw new Error(refund.status);
        takeBackId = refund.reversalPayoutId;
        return applied("gid://shopify/StoreCreditAccountCreditTransaction/45");
      });

      try {
        await expect(sendPayout(payoutId, rail, claimedAt)).resolves.toBe("claim_lost");
      } finally {
        warn.mockRestore();
      }

      await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({
        state: "sending",
        claimedAt,
        sentAt: null,
        externalTransactionId: null,
      });
      expect(await prisma.payout.findUniqueOrThrow({ where: { id: takeBackId! } })).toMatchObject({ state: "held" });

      // Settle finds the credit in the buyer's history: sent, and the take-back released.
      rail.creditHistory.mockResolvedValue({
        status: "found",
        complete: true,
        credits: [{ id: "gid://shopify/StoreCreditAccountCreditTransaction/45", amount: new Money("2.50"), currency: "GBP", createdAt: new Date(claimedAt.getTime() + 2000) }],
      });
      await expect(settleUnconfirmed(payoutId, rail)).resolves.toBe("sent");
      await expect(prisma.payout.findUniqueOrThrow({ where: { id: takeBackId! } })).resolves.toMatchObject({ state: "pending" });
      await expect(prisma.payout.count({ where: { state: "held" } })).resolves.toBe(0);
    });

    /** A pending £2.50 credit whose send, while the rail is asked, sees a £20 refund hold its £1.00 take-back. */
    async function heldDuringTheSend(answer: RailAnswer) {
      const { conn, payoutId } = await pendingCredit();
      let takeBackId: string | null = null;
      const rail = fakeRail();
      rail.credit.mockImplementation(async () => {
        // Recorded as if the claim were over, the only way a take-back is held against a credit being sent.
        const refund = await recordRefund(conn, ORDER, refundFacts(1, "20.00"), undefined, new Date(Date.now() + CLAIM_FINISHED_MS + MINUTE));
        if (refund.status !== "recorded" || !refund.reversalPayoutId) throw new Error("no take-back");
        takeBackId = refund.reversalPayoutId;
        await expect(prisma.payout.findUniqueOrThrow({ where: { id: takeBackId } })).resolves.toMatchObject({ state: "held" });
        return answer;
      });
      const outcome = await sendPayout(payoutId, rail, new Date());
      return { payoutId, outcome, takeBackId: takeBackId! };
    }

    it("a refusal for now inside the claim: pending at what the held take-back left, which has nothing to send", async () => {
      const { payoutId, outcome, takeBackId } = await heldDuringTheSend(refused(false, "THROTTLED", "Throttled"));

      expect(outcome).toBe("pending");
      const credit = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
      expect({ state: credit.state, amount: money(credit.amount) }).toEqual({ state: "pending", amount: "1.50" });
      await expect(prisma.payout.findUniqueOrThrow({ where: { id: takeBackId } })).resolves.toMatchObject({ state: "nothing_to_send" });
    });

    it("applied inside the claim: sent, and the held take-back is released to be debited", async () => {
      const { payoutId, outcome, takeBackId } = await heldDuringTheSend(applied("gid://shopify/StoreCreditAccountCreditTransaction/46"));

      expect(outcome).toBe("sent");
      await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({ state: "sent" });
      await expect(prisma.payout.findUniqueOrThrow({ where: { id: takeBackId } })).resolves.toMatchObject({ state: "pending" });
    });
  });
});
