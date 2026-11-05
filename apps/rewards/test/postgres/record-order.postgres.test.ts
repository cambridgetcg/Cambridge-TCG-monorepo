import { Prisma, type PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma, { createPrismaClient } from "~/db.server";
import type { ConnectionContext } from "~/lib/merchant.server";
import { ensureMerchant, findConnection, markUninstalled, setRunning } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import type { MoneyPair, OrderFacts } from "~/lib/order-facts";
import { recordOrder } from "~/lib/record-order.server";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

const SHOP = "record-order-test.myshopify.com";
const INSTALLED = new Date("2026-11-01T09:00:00Z");
const ORDERED = new Date("2026-11-04T12:00:00Z");
const PAID = new Date("2026-11-04T12:00:05Z");

function pair(amount: string, shopAmount = amount): MoneyPair {
  return { amount: new Money(amount), shopAmount: new Money(shopAmount) };
}

/** A paid GBP order: £50 of products, nothing paid with credit or gift cards. */
function orderFacts(overrides: Partial<OrderFacts> = {}): OrderFacts {
  return {
    externalOrderId: "gid://shopify/Order/1001",
    name: "#1001",
    externalCustomerId: "7001",
    currency: "GBP",
    shopCurrency: "GBP",
    test: false,
    cancelledAt: null,
    orderedAt: ORDERED,
    paidAt: PAID,
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

async function openShop(o: { currency?: string; now?: Date } = {}): Promise<ConnectionContext> {
  await ensureMerchant({
    shop: SHOP,
    name: "Record Order Test",
    currency: o.currency ?? "GBP",
    timezone: "Europe/London",
    now: o.now ?? INSTALLED,
  });
  const conn = await findConnection(SHOP);
  if (!conn) throw new Error("no connection");
  return conn;
}

async function addTier(merchantId: string, name: string, minSpend: string, percent: string, position: number) {
  return prisma.tier.create({
    data: {
      merchantId,
      name,
      minSpend: new Prisma.Decimal(minSpend),
      cashbackPercent: new Prisma.Decimal(percent),
      position,
    },
  });
}

/** An installed GBP shop with cashback on and one 5% tier. */
async function runningShop(o: { currency?: string } = {}) {
  const conn = await openShop(o);
  const tier = await addTier(conn.merchantId, "Everyone", "0", "5.00", 0);
  expect(await setRunning(conn.merchantId, true)).toEqual({ ok: true });
  return { conn: { ...conn, running: true }, tier };
}

const money = (v: Prisma.Decimal | null | undefined) => (v == null ? null : v.toFixed(4));

/** Resolves once another session is waiting on a lock (up to 5 s). */
async function waitForLockWait(client: PrismaClient): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const [{ waiting }] = await client.$queryRaw<Array<{ waiting: number }>>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The racing delivery never waited on the first one");
}

describe.skipIf(!hasTestDatabase)("recordOrder", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("records the order and 5% of the base as one pending credit", async () => {
    const { conn, tier } = await runningShop();
    const facts = orderFacts({ storeCreditUsed: pair("10.00"), giftCardUsed: pair("0") });
    const before = Date.now();

    const result = await recordOrder(conn, facts, "live");

    expect(result).toEqual({
      status: "recorded",
      orderId: expect.any(String),
      customerId: expect.any(String),
      payoutId: expect.any(String),
      noCashback: null,
    });
    if (result.status !== "recorded") throw new Error("unreachable");

    const order = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(order).toMatchObject({
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      customerId: result.customerId,
      externalOrderId: "gid://shopify/Order/1001",
      name: "#1001",
      source: "live",
      currency: "GBP",
      orderedAt: ORDERED,
      paidAt: PAID,
      cancelledAt: null,
      test: false,
      noCashbackReason: null,
    });
    expect({
      total: money(order.totalAmount),
      product: money(order.productAmount),
      shopProduct: money(order.shopProductAmount),
      storeCredit: money(order.storeCreditUsed),
      shopStoreCredit: money(order.shopStoreCreditUsed),
      giftCard: money(order.giftCardUsed),
      base: money(order.cashbackBase),
      refunded: money(order.refundedProductAmount),
      shopRefunded: money(order.shopRefundedProductAmount),
    }).toEqual({
      total: "55.0000",
      product: "50.0000",
      shopProduct: "50.0000",
      storeCredit: "10.0000",
      shopStoreCredit: "10.0000",
      giftCard: "0.0000",
      base: "40.0000",
      refunded: "0.0000",
      shopRefunded: "0.0000",
    });

    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: result.customerId } });
    expect(customer).toMatchObject({ connectionId: conn.connectionId, externalCustomerId: "7001", tierId: tier.id });

    const entries = await prisma.ledgerEntry.findMany({ include: { payout: true } });
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry).toMatchObject({
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      customerId: result.customerId,
      orderId: result.orderId,
      refundId: null,
      kind: "cashback",
      currency: "GBP",
      tierName: "Everyone",
      idempotencyKey: `cashback:${result.orderId}`,
    });
    expect([money(entry.amount), money(entry.shopAmount), entry.ratePercent?.toFixed(2)]).toEqual([
      "2.0000",
      "2.0000",
      "5.00",
    ]);
    expect(entry.payout).toMatchObject({
      id: result.payoutId,
      merchantId: conn.merchantId,
      customerId: result.customerId,
      rail: "shopify_store_credit",
      direction: "credit",
      currency: "GBP",
      state: "pending",
      attempts: 0,
    });
    expect(money(entry.payout?.amount)).toBe("2.0000");
    const nextAttemptAt = entry.payout?.nextAttemptAt.getTime() ?? 0;
    expect(nextAttemptAt).toBeGreaterThanOrEqual(before);
    expect(nextAttemptAt).toBeLessThanOrEqual(Date.now());
    expect(await prisma.payout.count()).toBe(1);
  });

  it("a second delivery is already_recorded and writes nothing", async () => {
    const { conn } = await runningShop();
    const first = await recordOrder(conn, orderFacts(), "live");
    if (first.status !== "recorded") throw new Error(`first delivery: ${first.status}`);
    const snapshot = async () => ({
      orders: await prisma.order.findMany(),
      customers: await prisma.customer.findMany(),
      entries: await prisma.ledgerEntry.findMany(),
      payouts: await prisma.payout.findMany(),
    });
    const before = await snapshot();

    const second = await recordOrder(conn, orderFacts(), "live");

    expect(second).toEqual({ status: "already_recorded", orderId: first.orderId, customerId: first.customerId });
    expect(await snapshot()).toEqual(before);
  });

  it("two deliveries at once write one order and one ledger entry", async () => {
    // Review Focus 5. The test pool has one connection (connection_limit=1),
    // so the first delivery runs on its own client and is held, uncommitted,
    // just after writing its ledger entry, until the second delivery (on the
    // app's client) is blocked on the first one's rows.
    const { conn } = await runningShop();
    const firstClient = createPrismaClient(process.env.REWARDS_DATABASE_URL);
    const watcher = createPrismaClient(process.env.REWARDS_DATABASE_URL);
    let second!: ReturnType<typeof recordOrder>;
    const held = firstClient.$extends({
      query: {
        ledgerEntry: {
          async create({ args, query }) {
            const created = await query(args);
            second = recordOrder(conn, orderFacts(), "live");
            second.catch(() => {});
            await waitForLockWait(watcher);
            return created;
          },
        },
      },
    }) as unknown as PrismaClient;

    try {
      const first = await recordOrder(conn, orderFacts(), "live", held);
      const raced = await second;

      expect(first).toMatchObject({ status: "recorded", noCashback: null });
      if (first.status !== "recorded") throw new Error("unreachable");
      expect(raced).toEqual({ status: "already_recorded", orderId: first.orderId, customerId: first.customerId });
    } finally {
      await firstClient.$disconnect();
      await watcher.$disconnect();
    }
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.customer.count()).toBe(1);
    expect(await prisma.ledgerEntry.count()).toBe(1);
    expect(await prisma.payout.count()).toBe(1);
  });

  it("off: the order counts for spend but earns nothing", async () => {
    const { conn } = await runningShop();
    expect(await setRunning(conn.merchantId, false)).toEqual({ ok: true });

    // The switch is read when the order is recorded, not when the caller
    // looked the store up: an order recorded after switching off earns nothing.
    const result = await recordOrder(conn, orderFacts(), "live");

    expect(result).toMatchObject({ status: "recorded", payoutId: null, noCashback: "off" });
    expect(await prisma.order.findFirstOrThrow()).toMatchObject({ noCashbackReason: "off", test: false });
    expect(money((await prisma.order.findFirstOrThrow()).shopProductAmount)).toBe("50.0000");
    expect(await prisma.ledgerEntry.count()).toBe(0);
    expect(await prisma.payout.count()).toBe(0);
  });

  it("test orders earn nothing", async () => {
    const { conn } = await runningShop();

    const result = await recordOrder(conn, orderFacts({ test: true }), "live");

    expect(result).toMatchObject({ status: "recorded", payoutId: null, noCashback: "test" });
    expect(await prisma.order.findFirstOrThrow()).toMatchObject({ noCashbackReason: "test", test: true });
    expect(await prisma.ledgerEntry.count()).toBe(0);
    expect(await prisma.payout.count()).toBe(0);
  });

  it("a cancelled order earns nothing", async () => {
    const { conn } = await runningShop();
    const cancelledAt = new Date("2026-11-04T13:00:00Z");

    const result = await recordOrder(conn, orderFacts({ cancelledAt }), "live");

    expect(result).toMatchObject({ status: "recorded", payoutId: null, noCashback: "cancelled" });
    expect(await prisma.order.findFirstOrThrow()).toMatchObject({ noCashbackReason: "cancelled", cancelledAt });
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it("an imported order earns nothing", async () => {
    const { conn } = await runningShop();

    const result = await recordOrder(conn, orderFacts(), "import");

    expect(result).toMatchObject({ status: "recorded", payoutId: null, noCashback: "import" });
    expect(await prisma.order.findFirstOrThrow()).toMatchObject({ source: "import", noCashbackReason: "import" });
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it("with cashback on but no tiers the order earns nothing", async () => {
    const conn = await openShop();
    // setRunning refuses without tiers; a store can only get here if its
    // tiers went after it was switched on.
    await prisma.merchant.update({ where: { id: conn.merchantId }, data: { running: true } });

    const result = await recordOrder({ ...conn, running: true }, orderFacts(), "live");

    expect(result).toMatchObject({ status: "recorded", payoutId: null, noCashback: "no_tier" });
    expect(await prisma.customer.findFirstOrThrow()).toMatchObject({ tierId: null, tierSince: null });
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it.each([
    ["everything was paid with store credit and gift cards", { storeCreditUsed: pair("30.00"), giftCardUsed: pair("25.00") }],
    ["the cashback rounds to nothing", { productValue: pair("0.09") }],
  ])("nothing to pay on when %s", async (_, overrides) => {
    const { conn } = await runningShop();

    const result = await recordOrder(conn, orderFacts(overrides), "live");

    expect(result).toMatchObject({ status: "recorded", payoutId: null, noCashback: "nothing_to_pay_on" });
    expect(await prisma.order.findFirstOrThrow()).toMatchObject({ noCashbackReason: "nothing_to_pay_on" });
    expect(await prisma.ledgerEntry.count()).toBe(0);
    expect(await prisma.payout.count()).toBe(0);
  });

  it("a tier at 0% has nothing to pay on", async () => {
    const conn = await openShop();
    await addTier(conn.merchantId, "Everyone", "0", "0.00", 0);
    await setRunning(conn.merchantId, true);

    expect(await recordOrder({ ...conn, running: true }, orderFacts(), "live")).toMatchObject({
      status: "recorded",
      noCashback: "nothing_to_pay_on",
    });
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it("the reasons are checked in order: import, before install, test, cancelled, off, no tier, nothing to pay on", async () => {
    // Off and with no tiers throughout, so each order also has every later reason.
    const conn = await openShop();
    const early = new Date(INSTALLED.getTime() - 1);
    const all = { test: true, cancelledAt: ORDERED, orderedAt: early };
    const cases: Array<[OrderFacts, "live" | "import", string]> = [
      [orderFacts({ ...all, externalOrderId: "gid://shopify/Order/1" }), "import", "import"],
      [orderFacts({ ...all, externalOrderId: "gid://shopify/Order/2" }), "live", "before_install"],
      [orderFacts({ ...all, orderedAt: ORDERED, externalOrderId: "gid://shopify/Order/3" }), "live", "test"],
      [orderFacts({ cancelledAt: ORDERED, externalOrderId: "gid://shopify/Order/4" }), "live", "cancelled"],
      [orderFacts({ productValue: pair("0"), externalOrderId: "gid://shopify/Order/5" }), "live", "off"],
    ];
    for (const [facts, source, reason] of cases) {
      expect(await recordOrder(conn, facts, source)).toMatchObject({ status: "recorded", noCashback: reason });
    }

    await prisma.merchant.update({ where: { id: conn.merchantId }, data: { running: true } });
    expect(
      await recordOrder(conn, orderFacts({ productValue: pair("0"), externalOrderId: "gid://shopify/Order/6" }), "live"),
    ).toMatchObject({ status: "recorded", noCashback: "no_tier" });
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it("a new buyer earns at the lowest tier even when this order alone reaches a higher tier", async () => {
    const conn = await openShop();
    // Created out of position order, so "lowest" is the smallest minimum spend.
    const gold = await addTier(conn.merchantId, "Gold", "100", "10.00", 1);
    const bronze = await addTier(conn.merchantId, "Bronze", "0", "2.00", 0);
    await setRunning(conn.merchantId, true);
    const before = Date.now();

    const result = await recordOrder({ ...conn, running: true }, orderFacts({ productValue: pair("500.00") }), "live");

    expect(result).toMatchObject({ status: "recorded", noCashback: null });
    const entry = await prisma.ledgerEntry.findFirstOrThrow();
    expect([money(entry.amount), entry.tierName, entry.ratePercent?.toFixed(2)]).toEqual(["10.0000", "Bronze", "2.00"]);
    const customer = await prisma.customer.findFirstOrThrow();
    expect(customer.tierId).toBe(bronze.id);
    expect(customer.tierId).not.toBe(gold.id);
    expect(customer.tierSince?.getTime()).toBeGreaterThanOrEqual(before);
    expect(customer.tierSince?.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("a buyer with no tier is placed in the lowest, and one with a tier keeps it", async () => {
    const conn = await openShop();
    const bronze = await addTier(conn.merchantId, "Bronze", "0", "2.00", 0);
    const silver = await addTier(conn.merchantId, "Silver", "50", "4.00", 1);
    await setRunning(conn.merchantId, true);
    const since = new Date("2026-10-01T00:00:00Z");
    await prisma.customer.create({
      data: { merchantId: conn.merchantId, connectionId: conn.connectionId, externalCustomerId: "7001" },
    });
    await prisma.customer.create({
      data: {
        merchantId: conn.merchantId,
        connectionId: conn.connectionId,
        externalCustomerId: "7002",
        tierId: silver.id,
        tierSince: since,
      },
    });
    const running = { ...conn, running: true };

    await recordOrder(running, orderFacts({ externalOrderId: "gid://shopify/Order/1" }), "live");
    await recordOrder(running, orderFacts({ externalOrderId: "gid://shopify/Order/2", externalCustomerId: "7002" }), "live");

    const placed = await prisma.customer.findFirstOrThrow({ where: { externalCustomerId: "7001" } });
    expect(placed.tierId).toBe(bronze.id);
    expect(placed.tierSince).not.toBeNull();
    expect(await prisma.customer.findFirstOrThrow({ where: { externalCustomerId: "7002" } })).toMatchObject({
      tierId: silver.id,
      tierSince: since,
    });
    const rates = await prisma.ledgerEntry.findMany({ orderBy: { amount: "asc" } });
    expect(rates.map((e) => [e.tierName, money(e.amount)])).toEqual([
      ["Bronze", "1.0000"],
      ["Silver", "2.0000"],
    ]);
    expect(await prisma.customer.count()).toBe(2);
  });

  it("a locked tier's rate wins", async () => {
    const conn = await openShop();
    const bronze = await addTier(conn.merchantId, "Bronze", "0", "2.00", 0);
    const gold = await addTier(conn.merchantId, "Gold", "1000", "7.50", 1);
    await setRunning(conn.merchantId, true);
    await prisma.customer.create({
      data: {
        merchantId: conn.merchantId,
        connectionId: conn.connectionId,
        externalCustomerId: "7001",
        tierId: bronze.id,
        tierSince: INSTALLED,
        lockedTierId: gold.id,
      },
    });

    await recordOrder({ ...conn, running: true }, orderFacts(), "live");

    const entry = await prisma.ledgerEntry.findFirstOrThrow({ include: { payout: true } });
    expect([money(entry.amount), entry.tierName, entry.ratePercent?.toFixed(2)]).toEqual(["3.7500", "Gold", "7.50"]);
    expect(money(entry.payout?.amount)).toBe("3.7500");
    // The lock sets the rate; the stored tier is the resolver's (A12).
    expect((await prisma.customer.findFirstOrThrow()).tierId).toBe(bronze.id);
  });

  it("JPY order: cashback in whole yen", async () => {
    // Review Focus 3: ¥1,234 at 5% is ¥61.7, rounded half-up to ¥62.
    const { conn } = await runningShop({ currency: "JPY" });
    const facts = orderFacts({
      currency: "JPY",
      shopCurrency: "JPY",
      total: pair("1734"),
      productValue: pair("1234"),
    });

    await recordOrder(conn, facts, "live");

    const entry = await prisma.ledgerEntry.findFirstOrThrow({ include: { payout: true } });
    expect([entry.currency, money(entry.amount), money(entry.shopAmount)]).toEqual(["JPY", "62.0000", "62.0000"]);
    expect([entry.payout?.currency, money(entry.payout?.amount)]).toEqual(["JPY", "62.0000"]);
  });

  it("EUR order on a GBP shop: credit is in EUR, shopAmount in GBP", async () => {
    // Review Focus 3: €50.00 at 5% is €2.50; the shop's £43.10 at 5% is
    // £2.155, rounded half-up to £2.16, each currency on its own.
    const { conn } = await runningShop();
    const facts = orderFacts({
      currency: "EUR",
      shopCurrency: "GBP",
      total: pair("55.00", "47.41"),
      productValue: pair("50.00", "43.10"),
    });

    await recordOrder(conn, facts, "live");

    const order = await prisma.order.findFirstOrThrow();
    expect([order.currency, money(order.productAmount), money(order.shopProductAmount)]).toEqual([
      "EUR",
      "50.0000",
      "43.1000",
    ]);
    const entry = await prisma.ledgerEntry.findFirstOrThrow({ include: { payout: true } });
    expect([entry.currency, money(entry.amount), money(entry.shopAmount)]).toEqual(["EUR", "2.5000", "2.1600"]);
    expect([entry.payout?.currency, money(entry.payout?.amount)]).toEqual(["EUR", "2.5000"]);
  });

  it("a late order with a refund already in Shopify earns on the full base, then the refund takes its share", async () => {
    // Ruling 24: the base is never netted; the refund is then recorded inside
    // this transaction as one before payout (A10: refunds.postgres.test.ts).
    const { conn } = await runningShop();
    const facts = orderFacts({
      refundedProductValue: pair("20.00", "20.00"),
      refunds: [
        {
          externalRefundId: "gid://shopify/Refund/1",
          productValue: pair("20.00"),
          refundedAt: new Date("2026-11-04T14:00:00Z"),
        },
      ],
    });

    const result = await recordOrder(conn, facts, "live");

    expect(result).toMatchObject({ status: "recorded", noCashback: null });
    const order = await prisma.order.findFirstOrThrow();
    expect([money(order.cashbackBase), money(order.refundedProductAmount), money(order.shopRefundedProductAmount)]).toEqual([
      "50.0000",
      "20.0000",
      "20.0000",
    ]);
    const entry = await prisma.ledgerEntry.findFirstOrThrow({ where: { kind: "cashback" }, include: { payout: true } });
    expect([money(entry.amount), money(entry.payout?.amount)]).toEqual(["2.5000", "1.5000"]);
    const reversal = await prisma.ledgerEntry.findFirstOrThrow({ where: { kind: "reversal" } });
    expect(money(reversal.amount)).toBe("-1.0000");
    expect(await prisma.refund.findFirstOrThrow()).toMatchObject({
      externalRefundId: "gid://shopify/Refund/1",
      appliedBeforeCashback: true,
    });
  });

  it("a guest order is not recorded", async () => {
    const { conn } = await runningShop();

    expect(await recordOrder(conn, orderFacts({ externalCustomerId: null }), "live")).toEqual({ status: "no_customer" });

    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.customer.count()).toBe(0);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it("an order created before install earns nothing even with cashback on", async () => {
    // Decision 21: the import's boundary, whichever path sees the order first.
    const { conn } = await runningShop();

    const before = await recordOrder(
      conn,
      orderFacts({ externalOrderId: "gid://shopify/Order/1", orderedAt: new Date(INSTALLED.getTime() - 1) }),
      "live",
    );
    const at = await recordOrder(conn, orderFacts({ externalOrderId: "gid://shopify/Order/2", orderedAt: INSTALLED }), "live");

    expect(before).toMatchObject({ status: "recorded", payoutId: null, noCashback: "before_install" });
    expect(at).toMatchObject({ status: "recorded", noCashback: null });
    // Still recorded, so it counts for tier spend.
    expect(await prisma.order.findFirstOrThrow({ where: { externalOrderId: "gid://shopify/Order/1" } })).toMatchObject({
      noCashbackReason: "before_install",
      source: "live",
    });
    expect(await prisma.ledgerEntry.count()).toBe(1);
  });

  describe("an order created while the app was uninstalled (Ruling 13)", () => {
    const UNINSTALLED = new Date("2026-11-02T10:00:00Z");
    const REACTIVATED = new Date("2026-11-03T10:00:00Z");

    it.each([
      ["just before the uninstall", new Date(UNINSTALLED.getTime() - 1), null],
      ["at the uninstall", UNINSTALLED, "before_install"],
      ["just before the reinstall", new Date(REACTIVATED.getTime() - 1), "before_install"],
      ["at the reinstall", REACTIVATED, null],
    ])("%s", async (_, orderedAt, reason) => {
      const { conn: first } = await runningShop();
      expect(await markUninstalled(SHOP, UNINSTALLED)).toBe("uninstalled");
      const conn = { ...(await openShop({ now: REACTIVATED })), running: true };
      expect(conn).toMatchObject({ installedAt: first.installedAt, activatedAt: REACTIVATED, uninstalledAt: UNINSTALLED });

      const result = await recordOrder(conn, orderFacts({ orderedAt }), "live");

      expect(result).toMatchObject({ status: "recorded", noCashback: reason });
      expect(await prisma.order.count()).toBe(1);
      expect(await prisma.ledgerEntry.count()).toBe(reason === null ? 1 : 0);
    });
  });

  it("another merchant's customer with the same Shopify id is a different buyer", async () => {
    const { conn } = await runningShop();
    await ensureMerchant({
      shop: "other-shop.myshopify.com",
      name: "Other",
      currency: "GBP",
      timezone: "Europe/London",
      now: INSTALLED,
    });
    const other = await findConnection("other-shop.myshopify.com");
    if (!other) throw new Error("no connection");

    const mine = await recordOrder(conn, orderFacts(), "live");
    const theirs = await recordOrder(other, orderFacts(), "live");

    if (mine.status !== "recorded" || theirs.status !== "recorded") throw new Error("not recorded");
    expect(theirs.customerId).not.toBe(mine.customerId);
    expect(theirs.orderId).not.toBe(mine.orderId);
    expect(theirs.noCashback).toBe("off");
  });
});
