import { Prisma } from "@prisma/client";
import type { Decimal } from "decimal.js";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma, { createPrismaClient } from "~/db.server";
import { ensureMerchant, findConnection, setRunning } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import type { MoneyPair, OrderFacts } from "~/lib/order-facts";
import { CLAIM_FINISHED_MS, KEEP_TRYING_MS, sendPayout } from "~/lib/payouts.server";
import type { PayoutRail, RailAnswer } from "~/lib/ports";
import { recordOrder } from "~/lib/record-order.server";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

const SHOP = "send-payout-test.myshopify.com";
const BUYER = "7001";
const INSTALLED = new Date("2026-11-01T09:00:00Z");
const HOUR = 3_600_000;

function pair(amount: string): MoneyPair {
  return { amount: new Money(amount), shopAmount: new Money(amount) };
}

/** A paid GBP order worth `product` of products, by BUYER. */
function orderFacts(product: string): OrderFacts {
  return {
    externalOrderId: "gid://shopify/Order/2001",
    name: "#2001",
    externalCustomerId: BUYER,
    currency: "GBP",
    shopCurrency: "GBP",
    test: false,
    cancelledAt: null,
    orderedAt: new Date("2026-11-04T12:00:00Z"),
    paidAt: new Date("2026-11-04T12:00:05Z"),
    financialStatus: "PAID",
    total: pair(product),
    productValue: pair(product),
    storeCreditUsed: pair("0"),
    giftCardUsed: pair("0"),
    refundedProductValue: pair("0"),
    refunds: [],
  };
}

/**
 * A running GBP shop with one 5% tier and one recorded £50 order: a pending
 * £2.50 credit payout, due now.
 */
async function pendingCredit(o: { notifyBuyers?: boolean } = {}) {
  await ensureMerchant({ shop: SHOP, name: "Send Payout Test", currency: "GBP", timezone: "Europe/London", now: INSTALLED });
  const conn = await findConnection(SHOP);
  if (!conn) throw new Error("no connection");
  await prisma.tier.create({
    data: { merchantId: conn.merchantId, name: "Everyone", minSpend: new Prisma.Decimal(0), cashbackPercent: new Prisma.Decimal("5.00"), position: 0 },
  });
  expect(await setRunning(conn.merchantId, true)).toEqual({ ok: true });
  if (o.notifyBuyers) await prisma.merchant.update({ where: { id: conn.merchantId }, data: { notifyBuyers: true } });
  const recorded = await recordOrder({ ...conn, running: true }, orderFacts("50.00"), "live");
  if (recorded.status !== "recorded" || !recorded.payoutId) throw new Error("no payout");
  return { conn, payoutId: recorded.payoutId, orderId: recorded.orderId, customerId: recorded.customerId };
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

    const t3 = new Date(t0.getTime() + KEEP_TRYING_MS);
    await prisma.payout.update({ where: { id: payoutId }, data: { nextAttemptAt: t3 } });
    await expect(sendPayout(payoutId, rail, t3)).resolves.toBe("needs_look");
    await expect(read()).resolves.toMatchObject({ state: "needs_look", lookReason: "kept_failing", attempts: 4, firstFailedAt: t0, lastError: "THROTTLED" });
    expect(rail.credit).toHaveBeenCalledTimes(4);
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
    for (const state of ["held", "sending", "unconfirmed", "closed"] as const) {
      await prisma.payout.update({ where: { id: payoutId }, data: { state } });
      await expect(sendPayout(payoutId, rail, new Date())).resolves.toBe("skipped");
    }
    expect(rail.credit).not.toHaveBeenCalled();
    await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({ attempts: 0, claimedAt: null });
  });
});
