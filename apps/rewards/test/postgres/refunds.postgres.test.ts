import { Prisma, type PayoutState, type PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma, { createPrismaClient } from "~/db.server";
import { redactCustomer } from "~/lib/erasure.server";
import type { ConnectionContext } from "~/lib/merchant.server";
import { ensureMerchant, findConnection, setRunning } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import type { MoneyPair, OrderFacts, RefundFacts } from "~/lib/order-facts";
import { CLAIM_FINISHED_MS, sendPayout } from "~/lib/payouts.server";
import type { PayoutRail } from "~/lib/ports";
import { recordOrder } from "~/lib/record-order.server";
import { ORDER_RECORDING_WINDOW_MS, RefundRetryLater, recordRefund } from "~/lib/refunds.server";
import { hasTestDatabase, resetDatabase, waitForLockWaitOr } from "./helpers/database";

const SHOP = "refunds-test.myshopify.com";
const INSTALLED = new Date("2026-11-01T09:00:00Z");
const ORDERED = new Date("2026-11-04T12:00:00Z");
const ORDER = "gid://shopify/Order/3001";
const NOW = new Date("2026-11-05T10:00:00Z");
const MINUTE = 60_000;

function pair(amount: string, shopAmount = amount): MoneyPair {
  return { amount: new Money(amount), shopAmount: new Money(shopAmount) };
}

/** A paid GBP order: £50 of products by buyer 7001. */
function orderFacts(overrides: Partial<OrderFacts> = {}): OrderFacts {
  return {
    externalOrderId: ORDER,
    name: "#3001",
    externalCustomerId: "7001",
    currency: "GBP",
    shopCurrency: "GBP",
    test: false,
    cancelledAt: null,
    orderedAt: ORDERED,
    paidAt: new Date(ORDERED.getTime() + 5000),
    financialStatus: "PAID",
    total: pair("55.00"),
    productValue: pair("50.00"),
    storeCreditUsed: pair("0"),
    giftCardUsed: pair("0"),
    refundedProductValue: pair("0"),
    refunds: [],
    ...overrides,
  };
}

/**
 * Refund `n` of `product` worth of products, made `n` minutes after 13:00;
 * `completesOrder` when it returns the order's last unit (Ruling 34).
 */
function refundFacts(n: number, product: string, shopProduct = product, completesOrder = false): RefundFacts {
  return {
    externalRefundId: `gid://shopify/Refund/${n}`,
    productValue: pair(product, shopProduct),
    refundedAt: new Date(Date.UTC(2026, 10, 4, 13, n)),
    completesOrder,
  };
}

/** An installed GBP shop with cashback on and one 5% tier. */
async function runningShop(): Promise<ConnectionContext> {
  await ensureMerchant({ shop: SHOP, name: "Refunds Test", currency: "GBP", timezone: "Europe/London", now: INSTALLED });
  const conn = await findConnection(SHOP);
  if (!conn) throw new Error("no connection");
  await prisma.tier.create({
    data: {
      merchantId: conn.merchantId,
      name: "Everyone",
      minSpend: new Prisma.Decimal(0),
      cashbackPercent: new Prisma.Decimal("5.00"),
      position: 0,
    },
  });
  expect(await setRunning(conn.merchantId, true)).toEqual({ ok: true });
  return { ...conn, running: true };
}

/** A running shop and one recorded order of `facts`: by default £50, so a pending £2.50 credit. */
async function recordedOrder(overrides: Partial<OrderFacts> = {}, source: "live" | "import" = "live") {
  const conn = await runningShop();
  const recorded = await recordOrder(conn, orderFacts(overrides), source);
  if (recorded.status !== "recorded") throw new Error(`order: ${recorded.status}`);
  return { conn, ...recorded };
}

async function setCredit(payoutId: string | null, data: Prisma.PayoutUpdateInput) {
  if (!payoutId) throw new Error("no credit payout");
  await prisma.payout.update({ where: { id: payoutId }, data });
}

const money = (v: Prisma.Decimal | null | undefined) => (v == null ? null : v.toFixed(2));

/** The order's money, as the tests compare it. */
async function moneyOf(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const entries = await prisma.ledgerEntry.findMany({
    where: { orderId },
    include: { payout: true, refund: true },
  });
  const cashback = entries.find((e) => e.kind === "cashback") ?? null;
  const reversals = entries
    .filter((e) => e.kind === "reversal")
    .sort((a, b) => (a.refund?.refundedAt.getTime() ?? 0) - (b.refund?.refundedAt.getTime() ?? 0));
  return {
    refunded: money(order.refundedProductAmount),
    shopRefunded: money(order.shopRefundedProductAmount),
    cashback: money(cashback?.amount),
    credit: cashback?.payout ? { state: cashback.payout.state, amount: money(cashback.payout.amount) } : null,
    reversals: reversals.map((e) => ({
      refund: e.refund?.externalRefundId,
      amount: money(e.amount),
      shopAmount: money(e.shopAmount),
      payout: e.payout ? { direction: e.payout.direction, state: e.payout.state, amount: money(e.payout.amount) } : null,
    })),
  };
}

type Settled<T> = { status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown };
const settle = <T,>(promise: Promise<T>): Promise<Settled<T>> =>
  promise.then(
    (value) => ({ status: "fulfilled", value }) as const,
    (reason: unknown) => ({ status: "rejected", reason }) as const,
  );

/**
 * Record `refund` on a client of its own (the test pool has one connection),
 * held once it holds the credit's and the order's locks and has worked out
 * its take-back (at its reversal's insert), while `race()` starts on the
 * app's client, until that is waiting on a lock or has finished. Both
 * results, settled.
 */
async function refundRacing<T>(conn: ConnectionContext, refund: RefundFacts, race: () => Promise<T>) {
  const refundClient = createPrismaClient(process.env.REWARDS_DATABASE_URL);
  const watcher = createPrismaClient(process.env.REWARDS_DATABASE_URL);
  let raced: Promise<T> | null = null;
  const held = refundClient.$extends({
    query: {
      ledgerEntry: {
        async create({ args, query }) {
          if (!raced) {
            raced = race();
            raced.catch(() => {});
            await waitForLockWaitOr(watcher, raced);
          }
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
  try {
    const refunded = await settle(recordRefund(conn, ORDER, refund, held, NOW));
    if (!raced) throw new Error("the refund never reached its reversal");
    return { refunded, raced: await settle<T>(raced) };
  } finally {
    await refundClient.$disconnect();
    await watcher.$disconnect();
  }
}

describe.skipIf(!hasTestDatabase)("recordRefund", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("Shopify's retry window is about 4 hours (rule 8)", () => {
    expect(ORDER_RECORDING_WINDOW_MS).toBe(4 * 60 * 60 * 1000);
  });

  describe("by the state of the order's credit (Review Focus 4)", () => {
    it.each<[string, Prisma.PayoutUpdateInput]>([
      ["pending", {}],
      ["needs a look, refused", { state: "needs_look", lookReason: "refused" }],
      ["needs a look, kept failing", { state: "needs_look", lookReason: "kept_failing" }],
    ])("%s: the credit is reduced, and is nothing to send once a refund completes the order", async (_, data) => {
      const { conn, orderId, customerId, payoutId } = await recordedOrder();
      await setCredit(payoutId, data);
      const state = (data.state as PayoutState | undefined) ?? "pending";

      const first = await recordRefund(conn, ORDER, refundFacts(1, "20.00"), undefined, NOW);

      expect(first).toEqual({ status: "recorded", takenBack: expect.anything(), reversalPayoutId: expect.any(String), customerId });
      if (first.status !== "recorded") throw new Error("unreachable");
      expect(first.takenBack.toFixed(2)).toBe("1.00");
      expect(await moneyOf(orderId)).toEqual({
        refunded: "20.00",
        shopRefunded: "20.00",
        cashback: "2.50",
        credit: { state, amount: "1.50" },
        reversals: [
          {
            refund: "gid://shopify/Refund/1",
            amount: "-1.00",
            shopAmount: "-1.00",
            payout: { direction: "debit", state: "nothing_to_send", amount: "1.00" },
          },
        ],
      });
      const reversal = await prisma.ledgerEntry.findFirstOrThrow({ where: { kind: "reversal" }, include: { payout: true } });
      const refundRow = await prisma.refund.findFirstOrThrow();
      expect(reversal).toMatchObject({
        merchantId: conn.merchantId,
        connectionId: conn.connectionId,
        customerId,
        orderId,
        refundId: refundRow.id,
        currency: "GBP",
        tierName: "Everyone",
        idempotencyKey: `reversal:${conn.connectionId}:gid://shopify/Refund/1`,
      });
      expect(reversal.ratePercent?.toFixed(2)).toBe("5.00");
      expect(reversal.payout).toMatchObject({ id: first.reversalPayoutId, customerId, currency: "GBP", rail: "shopify_store_credit" });
      expect(refundRow).toMatchObject({
        merchantId: conn.merchantId,
        connectionId: conn.connectionId,
        orderId,
        externalRefundId: "gid://shopify/Refund/1",
        refundedAt: refundFacts(1, "20.00").refundedAt,
        appliedBeforeCashback: false,
      });
      expect([money(refundRow.productAmount), money(refundRow.shopProductAmount)]).toEqual(["20.00", "20.00"]);

      const rest = await recordRefund(conn, ORDER, refundFacts(2, "30.00"), undefined, NOW);

      expect(rest).toMatchObject({ status: "recorded" });
      if (rest.status !== "recorded") throw new Error("unreachable");
      expect(rest.takenBack.toFixed(2)).toBe("1.50");
      expect((await moneyOf(orderId)).credit).toEqual({ state: "nothing_to_send", amount: "0.00" });
    });

    it("sending, claimed under 30 minutes ago: retry later, and nothing is written", async () => {
      const { conn, orderId, payoutId } = await recordedOrder();
      await setCredit(payoutId, { state: "sending", claimedAt: new Date(NOW.getTime() - CLAIM_FINISHED_MS + MINUTE) });
      const before = await moneyOf(orderId);

      await expect(recordRefund(conn, ORDER, refundFacts(1, "20.00"), undefined, NOW)).rejects.toBeInstanceOf(RefundRetryLater);

      expect(await moneyOf(orderId)).toEqual(before);
      expect(await prisma.refund.count()).toBe(0);
    });

    it.each<[string, Prisma.PayoutUpdateInput]>([
      ["sending, its claim finished", { state: "sending", claimedAt: new Date(NOW.getTime() - CLAIM_FINISHED_MS) }],
      ["unconfirmed", { state: "unconfirmed", claimedAt: NOW, unconfirmedAt: NOW }],
      ["needs a look, could not confirm", { state: "needs_look", lookReason: "could_not_confirm" }],
    ])("%s: the take-back is held until the credit is settled", async (_, data) => {
      const { conn, orderId, payoutId } = await recordedOrder();
      await setCredit(payoutId, data);

      const result = await recordRefund(conn, ORDER, refundFacts(1, "20.00"), undefined, NOW);

      expect(result).toMatchObject({ status: "recorded", reversalPayoutId: expect.any(String) });
      expect(await moneyOf(orderId)).toEqual({
        refunded: "20.00",
        shopRefunded: "20.00",
        cashback: "2.50",
        credit: { state: data.state, amount: "2.50" },
        reversals: [
          {
            refund: "gid://shopify/Refund/1",
            amount: "-1.00",
            shopAmount: "-1.00",
            payout: { direction: "debit", state: "held", amount: "1.00" },
          },
        ],
      });
    });

    it("sent: the take-back is a pending debit, due now", async () => {
      const { conn, orderId, payoutId } = await recordedOrder();
      await setCredit(payoutId, { state: "sent", sentAt: NOW });

      const result = await recordRefund(conn, ORDER, refundFacts(1, "20.00"), undefined, NOW);

      expect(result).toMatchObject({ status: "recorded", reversalPayoutId: expect.any(String) });
      expect(await moneyOf(orderId)).toEqual({
        refunded: "20.00",
        shopRefunded: "20.00",
        cashback: "2.50",
        credit: { state: "sent", amount: "2.50" },
        reversals: [
          {
            refund: "gid://shopify/Refund/1",
            amount: "-1.00",
            shopAmount: "-1.00",
            payout: { direction: "debit", state: "pending", amount: "1.00" },
          },
        ],
      });
      const debit = await prisma.payout.findFirstOrThrow({ where: { direction: "debit" } });
      expect(debit).toMatchObject({ attempts: 0, nextAttemptAt: NOW });
    });

    it.each<[string, PayoutState]>([
      ["closed", "closed"],
      ["nothing to send", "nothing_to_send"],
    ])("%s: nothing is taken back, and spend still falls", async (_, state) => {
      const { conn, orderId, customerId, payoutId } = await recordedOrder();
      await setCredit(payoutId, { state });

      const result = await recordRefund(conn, ORDER, refundFacts(1, "20.00"), undefined, NOW);

      expect(result).toEqual({ status: "recorded", takenBack: expect.anything(), reversalPayoutId: null, customerId });
      if (result.status !== "recorded") throw new Error("unreachable");
      expect(result.takenBack.toFixed(2)).toBe("0.00");
      expect(await moneyOf(orderId)).toEqual({
        refunded: "20.00",
        shopRefunded: "20.00",
        cashback: "2.50",
        credit: { state, amount: "2.50" },
        reversals: [],
      });
      expect(await prisma.refund.count()).toBe(1);
    });
  });

  it("a partial refund takes its share, rounded down; the refund that completes the order takes the rest", async () => {
    // £2.50 × 10.10 / 50 = £0.505, down to £0.50, twice; the last £29.80
    // completes the order and takes the £1.50 left (its share would be £1.49).
    const { conn, orderId } = await recordedOrder();

    const taken: string[] = [];
    for (const [n, product] of [
      [1, "10.10"],
      [2, "10.10"],
      [3, "29.80"],
    ] as const) {
      const result = await recordRefund(conn, ORDER, refundFacts(n, product), undefined, NOW);
      if (result.status !== "recorded") throw new Error(result.status);
      taken.push(result.takenBack.toFixed(2));
    }

    expect(taken).toEqual(["0.50", "0.50", "1.50"]);
    const after = await moneyOf(orderId);
    expect(after.refunded).toBe("50.00");
    expect(after.credit).toEqual({ state: "nothing_to_send", amount: "0.00" });
    expect(after.reversals.map((r) => r.amount)).toEqual(["-0.50", "-0.50", "-1.50"]);
  });

  it("a credit held (which only a take-back can be) throws, and nothing is written (A10-F5)", async () => {
    const { conn, orderId, payoutId } = await recordedOrder();
    await setCredit(payoutId, { state: "held" });
    const before = await moneyOf(orderId);

    await expect(recordRefund(conn, ORDER, refundFacts(1, "20.00"), undefined, NOW)).rejects.toThrow(/held, which only a debit can be/);

    expect(await moneyOf(orderId)).toEqual(before);
    expect(await prisma.refund.count()).toBe(0);
  });

  it("a credit sending with no claim time holds the take-back, as one whose claim is over (A10-F5)", async () => {
    const { conn, orderId, payoutId } = await recordedOrder();
    await setCredit(payoutId, { state: "sending", claimedAt: null });

    await recordRefund(conn, ORDER, refundFacts(1, "20.00"), undefined, NOW);

    expect((await moneyOf(orderId)).reversals.map((r) => r.payout)).toEqual([{ direction: "debit", state: "held", amount: "1.00" }]);
  });

  describe("a refund for a buyer whose data was erased (MONEY-5)", () => {
    // An unconfirmed credit may have landed: the redaction leaves it to the
    // hourly check, and its take-back is closed as redactCustomer closes a
    // held one. Either way the buyer keeps the £2.50 in the ledger for now.
    it.each<[string, Prisma.PayoutUpdateInput]>([
      ["sent", { state: "sent", sentAt: NOW }],
      ["unconfirmed", { state: "unconfirmed", claimedAt: NOW, unconfirmedAt: NOW }],
    ])("%s: spend falls, and the take-back is closed at once, never sent and never a needs-a-look", async (_, data) => {
      const { conn, orderId, customerId, payoutId } = await recordedOrder();
      await setCredit(payoutId, data);
      await redactCustomer(conn, "7001", NOW);

      const result = await recordRefund(conn, ORDER, refundFacts(1, "20.00"), undefined, NOW);

      expect(result).toMatchObject({ status: "recorded", customerId });
      if (result.status !== "recorded" || !result.reversalPayoutId) throw new Error("no take-back");
      const after = await moneyOf(orderId);
      expect(after.refunded).toBe("20.00");
      expect(after.reversals).toEqual([
        { refund: "gid://shopify/Refund/1", amount: "-1.00", shopAmount: "-1.00", payout: { direction: "debit", state: "closed", amount: "1.00" } },
      ]);
      await expect(prisma.payout.findUniqueOrThrow({ where: { id: result.reversalPayoutId } })).resolves.toMatchObject({
        settledBy: "auto",
        lastError: "Customer data erased",
      });
      // The reversal stays as the ledger's trail, and an adjustment cancels it.
      const entries = await prisma.ledgerEntry.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
      expect(entries.filter((e) => e.kind === "adjustment").map((e) => [e.amount.toFixed(2), e.idempotencyKey])).toContainEqual([
        "1.00",
        `close:${result.reversalPayoutId}`,
      ]);
      const sum = entries.reduce((total, e) => total.plus(e.amount.toString()), new Money(0));
      expect(sum.toFixed(2)).toBe("2.50");
      // Nothing is left for the hourly job to send or the merchant to answer.
      expect(await prisma.payout.count({ where: { direction: "debit", state: { in: ["pending", "held", "needs_look"] } } })).toBe(0);
    });
  });

  describe("the refund that returns the order's last unit takes the rest (Ruling 34)", () => {
    /** Three one-unit refunds of a £24.97 order at 5% (£1.25): the order source values the last at the £8.33 left. */
    async function threeUnitRefunds(o: { sent: boolean; last: string }) {
      const { conn, orderId, payoutId } = await recordedOrder({ productValue: pair("24.97"), total: pair("24.97") });
      if (o.sent) await setCredit(payoutId, { state: "sent", sentAt: NOW });
      const taken: string[] = [];
      for (const [n, product, last] of [
        [1, "8.32", false],
        [2, "8.32", false],
        [3, o.last, true],
      ] as const) {
        const result = await recordRefund(conn, ORDER, refundFacts(n, product, product, last), undefined, NOW);
        if (result.status !== "recorded") throw new Error(result.status);
        taken.push(result.takenBack.toFixed(2));
      }
      return { orderId, taken, after: await moneyOf(orderId) };
    }

    it("before payout: the take-backs total the £1.25 earned, and the credit has nothing to send", async () => {
      const { taken, after } = await threeUnitRefunds({ sent: false, last: "8.33" });

      expect(after.cashback).toBe("1.25");
      expect(taken).toEqual(["0.41", "0.41", "0.43"]);
      expect(after.credit).toEqual({ state: "nothing_to_send", amount: "0.00" });
      expect(after.refunded).toBe("24.97");
    });

    it("after payout: the debits total the £1.25 earned", async () => {
      const { after } = await threeUnitRefunds({ sent: true, last: "8.33" });

      expect(after.credit).toEqual({ state: "sent", amount: "1.25" });
      expect(after.reversals.map((r) => r.payout)).toEqual([
        { direction: "debit", state: "pending", amount: "0.41" },
        { direction: "debit", state: "pending", amount: "0.41" },
        { direction: "debit", state: "pending", amount: "0.43" },
      ]);
    });

    it("completes the order by units even when the refunds' values fall short of its product value", async () => {
      // Valued as before Ruling 34 (each floored to £8.32, £24.96 in all): only the units say it is complete.
      const { taken, after } = await threeUnitRefunds({ sent: false, last: "8.32" });

      expect(taken).toEqual(["0.41", "0.41", "0.43"]);
      expect(after.credit).toEqual({ state: "nothing_to_send", amount: "0.00" });
    });

    it("an edited £10.00 line of 3 units, one removed: one refund of the other two takes the £0.33 earned", async () => {
      const { conn, orderId } = await recordedOrder({ productValue: pair("6.67"), total: pair("6.67") });

      const result = await recordRefund(conn, ORDER, refundFacts(1, "6.67", "6.67", true), undefined, NOW);

      if (result.status !== "recorded") throw new Error(result.status);
      expect(result.takenBack.toFixed(2)).toBe("0.33");
      expect((await moneyOf(orderId)).credit).toEqual({ state: "nothing_to_send", amount: "0.00" });
    });

    it("an edited line's last units, valued at £6.66 by rounding, still complete the order by units: the take-back is the £0.33 earned (M2a-F3)", async () => {
      // By value alone, £6.66 of £6.67 takes back £0.32 (rounded down) and leaves £0.01 of credit
      const { conn, orderId } = await recordedOrder({ productValue: pair("6.67"), total: pair("6.67") });

      const result = await recordRefund(conn, ORDER, refundFacts(1, "6.66", "6.66", true), undefined, NOW);

      if (result.status !== "recorded") throw new Error(result.status);
      expect(result.takenBack.toFixed(2)).toBe("0.33");
      expect((await moneyOf(orderId)).credit).toEqual({ state: "nothing_to_send", amount: "0.00" });
    });

    it("a refund that doesn't return the last unit still takes only its share", async () => {
      const { conn, orderId } = await recordedOrder({ productValue: pair("24.97"), total: pair("24.97") });

      const result = await recordRefund(conn, ORDER, refundFacts(1, "8.32"), undefined, NOW);

      if (result.status !== "recorded") throw new Error(result.status);
      expect(result.takenBack.toFixed(2)).toBe("0.41");
      expect((await moneyOf(orderId)).credit).toEqual({ state: "pending", amount: "0.84" });
    });
  });

  it("after a refund before payout, a refund after payout takes its share of the cashback as earned", async () => {
    // £20 before payout takes £1.00 of £2.50 and £1.50 is sent; £10 after
    // payout is a fifth of the products, so £0.50 of the £2.50 earned.
    const { conn, orderId, payoutId } = await recordedOrder();
    await recordRefund(conn, ORDER, refundFacts(1, "20.00"), undefined, NOW);
    await setCredit(payoutId, { state: "sent", sentAt: NOW });

    const result = await recordRefund(conn, ORDER, refundFacts(2, "10.00"), undefined, NOW);

    if (result.status !== "recorded") throw new Error(result.status);
    expect(result.takenBack.toFixed(2)).toBe("0.50");
    expect((await moneyOf(orderId)).reversals.map((r) => [r.amount, r.payout?.state])).toEqual([
      ["-1.00", "nothing_to_send"],
      ["-0.50", "pending"],
    ]);
  });

  it("a shipping-only refund takes nothing back and leaves spend unchanged", async () => {
    // Ruling 11: the order source gives a shipping-only refund 0 product value.
    const { conn, orderId, customerId } = await recordedOrder();
    const before = await moneyOf(orderId);

    const result = await recordRefund(conn, ORDER, refundFacts(1, "0"), undefined, NOW);

    expect(result).toEqual({ status: "recorded", takenBack: expect.anything(), reversalPayoutId: null, customerId });
    if (result.status !== "recorded") throw new Error("unreachable");
    expect(result.takenBack.toFixed(2)).toBe("0.00");
    expect(await moneyOf(orderId)).toEqual(before);
    expect(await prisma.refund.count()).toBe(1);
  });

  it("the same refund delivered twice is recorded once", async () => {
    const { conn } = await recordedOrder();
    await recordRefund(conn, ORDER, refundFacts(1, "20.00"), undefined, NOW);
    const snapshot = async () => ({
      orders: await prisma.order.findMany(),
      refunds: await prisma.refund.findMany(),
      entries: await prisma.ledgerEntry.findMany({ orderBy: { createdAt: "asc" } }),
      payouts: await prisma.payout.findMany({ orderBy: { createdAt: "asc" } }),
    });
    const before = await snapshot();

    expect(await recordRefund(conn, ORDER, refundFacts(1, "20.00"), undefined, NOW)).toEqual({ status: "already_recorded" });

    expect(await snapshot()).toEqual(before);
  });

  it("two different refunds at once on two clients never take back more than the cashback", async () => {
    // Review Focus 5. £30 then £20 of a £50 order (each read before the
    // other landed). The first is held, after it has worked out its
    // take-back but before writing it, until the second is waiting on the
    // first's locks. Without the locks the second reads the order as the
    // first found it: it writes £20 refunded over the first's £30, never sees
    // the order complete, and its credit write races the first's.
    const { conn, orderId } = await recordedOrder();

    const { refunded: first, raced } = await refundRacing(conn, refundFacts(1, "30.00"), () =>
      recordRefund(conn, ORDER, refundFacts(2, "20.00"), undefined, NOW),
    );

    if (first.status !== "fulfilled" || raced.status !== "fulfilled") throw new Error("a refund failed");
    if (first.value.status !== "recorded" || raced.value.status !== "recorded") throw new Error("not recorded");
    expect([first.value.takenBack.toFixed(2), raced.value.takenBack.toFixed(2)]).toEqual(["1.50", "1.00"]);
    const after = await moneyOf(orderId);
    expect(after.refunded).toBe("50.00");
    expect(after.credit).toEqual({ state: "nothing_to_send", amount: "0.00" });
    const takenBack = after.reversals.reduce((sum, r) => sum.minus(r.amount ?? 0), new Money(0));
    expect(takenBack.toFixed(2)).toBe("2.50");
  });

  it("a send claimed while a refund holds the credit waits, then asks Shopify for the reduced amount (A10-F3)", async () => {
    const { conn, orderId, payoutId } = await recordedOrder();
    if (!payoutId) throw new Error("no credit payout");
    const rail = {
      credit: vi.fn<PayoutRail["credit"]>(async () => ({ outcome: "applied", transactionId: "gid://shopify/StoreCreditAccountCreditTransaction/1" })),
      debit: vi.fn<PayoutRail["debit"]>(async () => ({ outcome: "applied", transactionId: null })),
      balance: vi.fn<PayoutRail["balance"]>(async () => new Money("100.00")),
      creditHistory: vi.fn<PayoutRail["creditHistory"]>(async () => ({ status: "failed", error: "not read here" })),
    } satisfies PayoutRail;

    const { refunded, raced } = await refundRacing(conn, refundFacts(1, "20.00"), () => sendPayout(payoutId, rail, new Date()));

    expect([refunded.status, raced]).toEqual(["fulfilled", { status: "fulfilled", value: "sent" }]);
    expect(rail.credit.mock.calls.map(([c]) => c.amount.toFixed(2))).toEqual(["1.50"]);
    expect((await moneyOf(orderId)).credit).toEqual({ state: "sent", amount: "1.50" });
  });

  it("a refund and customers/redact for the same buyer at once both finish, and the credit ends closed (CONCURRENCY-3)", async () => {
    // The redaction takes the credit's lock first, as the refund does, so it
    // waits for the refund instead of holding the buyer's row against the
    // reversal's foreign-key check (a deadlock, 40P01).
    const { conn, orderId, customerId } = await recordedOrder();

    const { refunded, raced } = await refundRacing(conn, refundFacts(1, "20.00"), () => redactCustomer(conn, "7001", NOW));

    expect([refunded.status, raced.status]).toEqual(["fulfilled", "fulfilled"]);
    expect(await moneyOf(orderId)).toMatchObject({ refunded: "20.00", credit: { state: "closed", amount: "1.50" } });
    await expect(prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).resolves.toMatchObject({ externalCustomerId: null });
    const net = (await prisma.ledgerEntry.findMany({ where: { orderId } })).reduce((sum, e) => sum.plus(e.amount.toString()), new Money(0));
    expect(net.toFixed(2)).toBe("0.00");
  });

  it("a refund of an imported order lowers spend and writes no ledger entry", async () => {
    const { conn, orderId, customerId } = await recordedOrder({}, "import");

    const result = await recordRefund(conn, ORDER, refundFacts(1, "20.00", "17.00"), undefined, NOW);

    expect(result).toEqual({ status: "recorded", takenBack: expect.anything(), reversalPayoutId: null, customerId });
    if (result.status !== "recorded") throw new Error("unreachable");
    expect(result.takenBack.toFixed(2)).toBe("0.00");
    expect(await moneyOf(orderId)).toEqual({ refunded: "20.00", shopRefunded: "17.00", cashback: null, credit: null, reversals: [] });
    expect(await prisma.ledgerEntry.count()).toBe(0);
    expect(await prisma.payout.count()).toBe(0);
  });

  it("an unrecorded order returns order_not_recorded", async () => {
    const conn = await runningShop();

    expect(await recordRefund(conn, ORDER, refundFacts(1, "20.00"), undefined, NOW)).toEqual({ status: "order_not_recorded" });

    expect(await prisma.refund.count()).toBe(0);
    expect(await prisma.order.count()).toBe(0);
  });

  it("another store's order with the same Shopify id is not this store's", async () => {
    await recordedOrder();
    await ensureMerchant({ shop: "other-shop.myshopify.com", name: "Other", currency: "GBP", timezone: "Europe/London", now: INSTALLED });
    const other = await findConnection("other-shop.myshopify.com");
    if (!other) throw new Error("no connection");

    expect(await recordRefund(other, ORDER, refundFacts(1, "20.00"), undefined, NOW)).toEqual({ status: "order_not_recorded" });
    expect(await prisma.refund.count()).toBe(0);
  });

  describe("an order recorded after Shopify shows refunds on it (Ruling 24)", () => {
    const LATE = "gid://shopify/Order/3002";

    /** The same order recorded on time and its refunds delivered one by one, then recorded late with them on it. */
    async function onTimeAndLate(overrides: Partial<OrderFacts>, refunds: RefundFacts[]) {
      const { conn, orderId: onTimeId } = await recordedOrder(overrides);
      for (const refund of refunds) await recordRefund(conn, ORDER, refund, undefined, NOW);

      const lateRefunds = refunds.map((r) => ({ ...r, externalRefundId: `${r.externalRefundId}0` }));
      const refunded = lateRefunds.reduce((sum, r) => sum.plus(r.productValue.amount), new Money(0)).toFixed(2);
      const late = await recordOrder(
        conn,
        orderFacts({
          ...overrides,
          externalOrderId: LATE,
          name: "#3002",
          externalCustomerId: "7002",
          refundedProductValue: pair(refunded),
          refunds: lateRefunds,
        }),
        "live",
      );
      if (late.status !== "recorded") throw new Error(`late order: ${late.status}`);
      const strip = (m: Awaited<ReturnType<typeof moneyOf>>) => ({
        ...m,
        reversals: m.reversals.map((r) => ({ amount: r.amount, shopAmount: r.shopAmount, payout: r.payout })),
      });
      return { conn, late, onTime: strip(await moneyOf(onTimeId)), lateMoney: strip(await moneyOf(late.orderId)) };
    }

    it("late equals on time: £50 at 5%, refunds of £20 then £15, keeps £0.75", async () => {
      const { late, onTime, lateMoney } = await onTimeAndLate({}, [refundFacts(1, "20.00"), refundFacts(2, "15.00")]);

      expect(lateMoney).toEqual(onTime);
      expect(lateMoney).toEqual({
        refunded: "35.00",
        shopRefunded: "35.00",
        cashback: "2.50",
        credit: { state: "pending", amount: "0.75" },
        reversals: [
          { amount: "-1.00", shopAmount: "-1.00", payout: { direction: "debit", state: "nothing_to_send", amount: "1.00" } },
          { amount: "-0.75", shopAmount: "-0.75", payout: { direction: "debit", state: "nothing_to_send", amount: "0.75" } },
        ],
      });
      const rows = await prisma.refund.findMany({ where: { orderId: late.orderId } });
      expect(rows.map((r) => r.appliedBeforeCashback)).toEqual([true, true]);
      expect(await prisma.refund.count({ where: { appliedBeforeCashback: false } })).toBe(2);
    });

    it("late equals on time with £10 paid in store credit", async () => {
      // Base £40, so £2.00 earned; the shares are of product value: £0.80, £0.60.
      const { onTime, lateMoney } = await onTimeAndLate({ storeCreditUsed: pair("10.00") }, [
        refundFacts(1, "20.00"),
        refundFacts(2, "15.00"),
      ]);

      expect(lateMoney).toEqual(onTime);
      expect(lateMoney.credit).toEqual({ state: "pending", amount: "0.60" });
      expect(lateMoney.reversals.map((r) => r.amount)).toEqual(["-0.80", "-0.60"]);
    });

    it("a late order whose refunds complete it ends nothing to send, with amount 0", async () => {
      const { onTime, lateMoney } = await onTimeAndLate({}, [refundFacts(1, "20.00"), refundFacts(2, "30.00")]);

      expect(lateMoney).toEqual(onTime);
      expect(lateMoney.credit).toEqual({ state: "nothing_to_send", amount: "0.00" });
      expect(lateMoney.reversals.map((r) => r.amount)).toEqual(["-1.00", "-1.50"]);
    });

    it("the refunds are applied oldest first, whatever order they come in", async () => {
      // Oldest first: £10.10 takes £0.50, then £39.90 completes the order and
      // takes the £2.00 left. The other way round would take £1.99, then £0.51.
      const conn = await runningShop();
      const late = await recordOrder(
        conn,
        orderFacts({ refundedProductValue: pair("50.00"), refunds: [refundFacts(2, "39.90"), refundFacts(1, "10.10")] }),
        "live",
      );
      if (late.status !== "recorded") throw new Error(late.status);

      const after = await moneyOf(late.orderId);
      expect(after.reversals.map((r) => [r.refund, r.amount])).toEqual([
        ["gid://shopify/Refund/1", "-0.50"],
        ["gid://shopify/Refund/2", "-2.00"],
      ]);
      expect(after.credit).toEqual({ state: "nothing_to_send", amount: "0.00" });
      expect(after.refunded).toBe("50.00");
    });

    it("a redelivered refunds/create after the late record is already_recorded", async () => {
      const conn = await runningShop();
      const late = await recordOrder(conn, orderFacts({ refundedProductValue: pair("20.00"), refunds: [refundFacts(1, "20.00")] }), "live");
      if (late.status !== "recorded") throw new Error(late.status);
      const before = await moneyOf(late.orderId);

      expect(await recordRefund(conn, ORDER, refundFacts(1, "20.00"), undefined, NOW)).toEqual({ status: "already_recorded" });

      expect(await moneyOf(late.orderId)).toEqual(before);
      expect(before.refunded).toBe("20.00");
      expect(await prisma.refund.count()).toBe(1);
    });

    it("a refund listed twice on a late order is applied once (A10-F1)", async () => {
      const conn = await runningShop();
      const late = await recordOrder(
        conn,
        orderFacts({ refundedProductValue: pair("40.00"), refunds: [refundFacts(1, "20.00"), refundFacts(1, "20.00")] }),
        "live",
      );
      if (late.status !== "recorded") throw new Error(late.status);

      expect(await prisma.refund.count()).toBe(1);
      expect(await moneyOf(late.orderId)).toMatchObject({ refunded: "20.00", credit: { state: "pending", amount: "1.50" } });
    });

    it("a late order whose refund is already recorded elsewhere on the store is not recorded at all (A10-F1)", async () => {
      // The same Shopify refund id on another order: a source bug, whose spend would otherwise vanish unseen.
      const { conn } = await recordedOrder();
      await recordRefund(conn, ORDER, refundFacts(1, "20.00"), undefined, NOW);

      await expect(
        recordOrder(
          conn,
          orderFacts({ externalOrderId: LATE, name: "#3002", refundedProductValue: pair("20.00"), refunds: [refundFacts(1, "20.00")] }),
          "live",
        ),
      ).rejects.toThrow(/gid:\/\/shopify\/Refund\/1/);

      expect(await prisma.order.count()).toBe(1);
    });

    it("an imported order whose refunds come only as quantities keeps that refunded value", async () => {
      // The import's bulk node has no refunds, only quantity − currentQuantity (A7).
      const conn = await runningShop();
      const imported = await recordOrder(conn, orderFacts({ refundedProductValue: pair("12.50", "11.00") }), "import");
      if (imported.status !== "recorded") throw new Error(imported.status);

      expect(await moneyOf(imported.orderId)).toMatchObject({ refunded: "12.50", shopRefunded: "11.00", reversals: [] });
      expect(await prisma.refund.count()).toBe(0);
    });

    it("a late order that earns nothing still records its refunds for spend", async () => {
      const conn = await runningShop();
      const late = await recordOrder(
        conn,
        orderFacts({ test: true, refundedProductValue: pair("20.00"), refunds: [refundFacts(1, "20.00")] }),
        "live",
      );
      if (late.status !== "recorded") throw new Error(late.status);

      expect(await moneyOf(late.orderId)).toEqual({ refunded: "20.00", shopRefunded: "20.00", cashback: null, credit: null, reversals: [] });
      expect(await prisma.refund.findFirstOrThrow()).toMatchObject({ appliedBeforeCashback: true });
    });
  });
});
