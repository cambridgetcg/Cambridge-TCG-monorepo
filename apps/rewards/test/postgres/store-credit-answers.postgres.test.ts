import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { ensureMerchant, findConnection, setRunning } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import type { MoneyPair, OrderFacts } from "~/lib/order-facts";
import { sendPayout } from "~/lib/payouts.server";
import type { PayoutRail } from "~/lib/ports";
import { recordOrder } from "~/lib/record-order.server";
import { createStoreCreditRail } from "~/shopify/store-credit-rail.server";
import { hasTestDatabase, resetDatabase } from "./helpers/database";
import { mockStoreCredit, seedOfflineSession } from "./helpers/shopify";

/**
 * Shopify can apply a store-credit credit or debit and still answer with an
 * error: HTTP 200 with a top-level INTERNAL_SERVER_ERROR (its GraphQL form of
 * a 500), or a 502. Carried from apps/rewardspro's
 * store-credit-answers.integration.test.ts onto sendPayout and the real
 * Shopify rail: the real unauthenticated.admin runs against MSW. Each answer
 * must leave the payout waiting for a check and never send it again (rule
 * 9). The old suite's hand-issue cases have no counterpart (rule 12 has no
 * hand issue), and the webhook cases come with the routes (A13).
 */

const SHOP = "answers.myshopify.com";
const BUYER = "100";
const HOUR = 3_600_000;

const ANSWERS: Array<[string, { internalErrors: number } | { badGateways: number }]> = [
  ["200 with INTERNAL_SERVER_ERROR", { internalErrors: 1 }],
  ["502", { badGateways: 1 }],
];

function pair(amount: string): MoneyPair {
  return { amount: new Money(amount), shopAmount: new Money(amount) };
}

/** A paid order worth `product` of products in `currency`, by BUYER. */
function orderFacts(product: string, currency: string): OrderFacts {
  return {
    externalOrderId: "gid://shopify/Order/4440001",
    name: "#1",
    externalCustomerId: BUYER,
    currency,
    shopCurrency: currency,
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

/** A running shop with a 5% tier and one recorded order: its pending credit payout. */
async function pendingCredit(product: string, currency = "GBP") {
  await ensureMerchant({ shop: SHOP, name: "Answers", currency, timezone: "Europe/London", now: new Date("2026-11-01T09:00:00Z") });
  const conn = await findConnection(SHOP);
  if (!conn) throw new Error("no connection");
  await prisma.tier.create({
    data: { merchantId: conn.merchantId, name: "Everyone", minSpend: new Prisma.Decimal(0), cashbackPercent: new Prisma.Decimal("5.00"), position: 0 },
  });
  expect(await setRunning(conn.merchantId, true)).toEqual({ ok: true });
  const recorded = await recordOrder({ ...conn, running: true }, orderFacts(product, currency), "live");
  if (recorded.status !== "recorded" || !recorded.payoutId) throw new Error("no payout");
  return { conn, ...recorded, payoutId: recorded.payoutId };
}

/** The credit sent, and a pending take-back of `amount` from it (as A10 writes one after a refund). */
async function pendingDebit(amount: string) {
  const credit = await pendingCredit("100.00");
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
  return payout.id;
}

const sentList = (calls: ReturnType<typeof mockStoreCredit>) => calls.map((c) => `${c.operation} ${c.amount} ${c.currency}`);

describe.skipIf(!hasTestDatabase)("store credit Shopify applied but answered with an error", () => {
  let rail: () => Promise<PayoutRail>;

  beforeAll(async () => {
    // ~/shopify.server builds its session storage at import, which checks
    // the Session table at once, so it is imported only with a test database.
    // The library logs its version at start.
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.SHOPIFY_API_KEY = "test-api-key";
    const { unauthenticated } = await import("~/shopify.server");
    rail = async () => createStoreCreditRail((await unauthenticated.admin(SHOP)).admin);
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedOfflineSession(SHOP);
  });

  afterAll(async () => {
    delete process.env.SHOPIFY_API_KEY;
    vi.restoreAllMocks();
    await prisma.$disconnect();
  });

  for (const [answer, applyThenAnswer] of ANSWERS) {
    describe(`answered ${answer}`, () => {
      it("a credit is sent once, though sendPayout runs again", async () => {
        const { payoutId } = await pendingCredit("100.00");
        const balances = { [BUYER]: "0" };
        const calls = mockStoreCredit(SHOP, balances, applyThenAnswer);
        const now = new Date();

        await expect(sendPayout(payoutId, await rail(), now)).resolves.toBe("unconfirmed");
        await expect(sendPayout(payoutId, await rail(), new Date(now.getTime() + 2 * HOUR))).resolves.toBe("skipped");

        expect(sentList(calls)).toEqual(["credit 5.00 GBP"]);
        expect(balances[BUYER]).toBe("5.00");
        await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({
          state: "unconfirmed",
          unconfirmedAt: now,
          sentAt: null,
        });
      });

      it("a take-back is debited once, though sendPayout runs again", async () => {
        const payoutId = await pendingDebit("5.00");
        // The buyer holds more credit than the take-back.
        const balances = { [BUYER]: "50.00" };
        const calls = mockStoreCredit(SHOP, balances, applyThenAnswer);
        const now = new Date();

        await expect(sendPayout(payoutId, await rail(), now)).resolves.toBe("needs_look");
        await expect(sendPayout(payoutId, await rail(), new Date(now.getTime() + 2 * HOUR))).resolves.toBe("skipped");

        expect(sentList(calls)).toEqual(["debit 5.00 GBP"]);
        expect(balances[BUYER]).toBe("45.00");
        await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({
          state: "needs_look",
          lookReason: "could_not_confirm",
          sentAt: null,
        });
      });
    });
  }

  describe("the amount sent is the amount the ledger records", () => {
    it("a credit of 1.13: 5% of £22.50 rounded half-up", async () => {
      const { payoutId } = await pendingCredit("22.50");
      const calls = mockStoreCredit(SHOP, { [BUYER]: "0" });

      await expect(sendPayout(payoutId, await rail(), new Date())).resolves.toBe("sent");

      expect(sentList(calls)).toEqual(["credit 1.13 GBP"]);
      const payout = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId }, include: { ledgerEntry: true } });
      expect(payout.amount.toFixed(4)).toBe("1.1300");
      expect(payout.ledgerEntry.amount.toFixed(4)).toBe("1.1300");
      expect(payout.externalTransactionId).toBe("gid://shopify/StoreCreditAccountCreditTransaction/1");
    });

    it("a yen credit is sent in whole yen", async () => {
      const { payoutId } = await pendingCredit("1240", "JPY");
      const calls = mockStoreCredit(SHOP, { [BUYER]: "0" }, { currency: "JPY" });

      await expect(sendPayout(payoutId, await rail(), new Date())).resolves.toBe("sent");

      expect(sentList(calls)).toEqual(["credit 62 JPY"]);
    });

    it("a take-back of 4.35 the buyer holds in full", async () => {
      const payoutId = await pendingDebit("4.35");
      const balances = { [BUYER]: "4.35" };
      const calls = mockStoreCredit(SHOP, balances);

      await expect(sendPayout(payoutId, await rail(), new Date())).resolves.toBe("sent");

      expect(sentList(calls)).toEqual(["debit 4.35 GBP"]);
      expect(balances[BUYER]).toBe("0.00");
      const payout = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
      expect([payout.debitedAmount?.toFixed(2), payout.shortfall?.toFixed(2)]).toEqual(["4.35", "0.00"]);
    });

    it("a take-back capped at the 3.20 the buyer still holds", async () => {
      const payoutId = await pendingDebit("5.00");
      const balances = { [BUYER]: "3.20" };
      const calls = mockStoreCredit(SHOP, balances);

      await expect(sendPayout(payoutId, await rail(), new Date())).resolves.toBe("sent");

      expect(sentList(calls)).toEqual(["debit 3.20 GBP"]);
      const payout = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
      expect([payout.debitedAmount?.toFixed(2), payout.shortfall?.toFixed(2)]).toEqual(["3.20", "1.80"]);
    });
  });

  it("control: a THROTTLED credit goes back to pending and the next attempt credits once", async () => {
    const { payoutId } = await pendingCredit("100.00");
    const balances = { [BUYER]: "0" };
    const calls = mockStoreCredit(SHOP, balances, { throttled: 1 });
    const now = new Date();

    await expect(sendPayout(payoutId, await rail(), now)).resolves.toBe("pending");
    await expect(sendPayout(payoutId, await rail(), new Date(now.getTime() + HOUR))).resolves.toBe("sent");

    expect(sentList(calls)).toEqual(["credit 5.00 GBP", "credit 5.00 GBP"]);
    expect(balances[BUYER]).toBe("5.00");
    await expect(prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).resolves.toMatchObject({ state: "sent", attempts: 2 });
  });
});
