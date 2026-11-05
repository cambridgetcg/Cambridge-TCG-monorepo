import { Prisma, type PayoutState, type PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma, { createPrismaClient } from "~/db.server";
import type { ConnectionContext } from "~/lib/merchant.server";
import { ensureMerchant, findConnection, setRunning } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import type { MoneyPair, OrderFacts, RefundFacts } from "~/lib/order-facts";
import { CLAIM_FINISHED_MS } from "~/lib/payouts.server";
import { recordOrder } from "~/lib/record-order.server";
import { ORDER_RECORDING_WINDOW_MS, RefundRetryLater, recordRefund } from "~/lib/refunds.server";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

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

/** Refund `n` of `product` worth of products, made `n` minutes after 13:00. */
function refundFacts(n: number, product: string, shopProduct = product): RefundFacts {
  return {
    externalRefundId: `gid://shopify/Refund/${n}`,
    productValue: pair(product, shopProduct),
    refundedAt: new Date(Date.UTC(2026, 10, 4, 13, n)),
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

/** Resolves once another session is waiting on a lock, or once `settled` has settled (up to 5 s). */
async function waitForLockWaitOr(client: PrismaClient, settled: Promise<unknown>): Promise<void> {
  let done = false;
  settled.then(
    () => (done = true),
    () => (done = true),
  );
  for (let i = 0; i < 100; i++) {
    const [{ waiting }] = await client.$queryRaw<Array<{ waiting: number }>>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (waiting > 0 || done) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The racing refund neither waited on the first one nor finished");
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
    // Review Focus 5. Two £30 refunds of a £50 order (each read before the
    // other landed). The first runs on its own client and is held, after it
    // has worked out its take-back but before writing it, until the second
    // (on the app's client) is waiting on the first's locks. Without the
    // locks the second reads the order as the first found it: it writes £30
    // refunded over the first's £30, never sees the order complete, and its
    // credit write races the first's.
    const { conn, orderId } = await recordedOrder();
    const firstClient = createPrismaClient(process.env.REWARDS_DATABASE_URL);
    const watcher = createPrismaClient(process.env.REWARDS_DATABASE_URL);
    let second!: ReturnType<typeof recordRefund>;
    const held = firstClient.$extends({
      query: {
        ledgerEntry: {
          async create({ args, query }) {
            second = recordRefund(conn, ORDER, refundFacts(2, "30.00"), undefined, NOW);
            second.catch(() => {});
            await waitForLockWaitOr(watcher, second);
            return query(args);
          },
        },
      },
    }) as unknown as PrismaClient;

    let first: Awaited<ReturnType<typeof recordRefund>>;
    let raced: Awaited<ReturnType<typeof recordRefund>>;
    try {
      first = await recordRefund(conn, ORDER, refundFacts(1, "30.00"), held, NOW);
      raced = await second;
    } finally {
      await firstClient.$disconnect();
      await watcher.$disconnect();
    }

    if (first.status !== "recorded" || raced.status !== "recorded") throw new Error("not recorded");
    expect([first.takenBack.toFixed(2), raced.takenBack.toFixed(2)]).toEqual(["1.50", "1.00"]);
    const after = await moneyOf(orderId);
    expect(after.refunded).toBe("60.00");
    expect(after.credit).toEqual({ state: "nothing_to_send", amount: "0.00" });
    const takenBack = after.reversals.reduce((sum, r) => sum.minus(r.amount ?? 0), new Money(0));
    expect(takenBack.toFixed(2)).toBe("2.50");
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
