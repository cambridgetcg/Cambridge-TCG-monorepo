import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "~/db.server";
import { dismissGuide, guideDue, guideSwitchedOnAt, tryItOrders } from "~/lib/guide.server";
import { type ConnectionContext, ensureMerchant, findConnection } from "~/lib/merchant.server";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

/**
 * The first-time setup guide's gate (RP-24): a store is sent to the guide
 * while it has no tiers and has not pressed "Finish later", and the first
 * "Finish later" is kept.
 */

const SHOP = "guide-test.myshopify.com";
const INSTALLED = new Date("2026-11-01T00:00:00Z");

async function seedShop(shop = SHOP): Promise<ConnectionContext> {
  await ensureMerchant({ shop, name: "Guide Test", currency: "GBP", timezone: "Europe/London", now: INSTALLED });
  return (await findConnection(shop))!;
}

async function seedTier(conn: ConnectionContext, name: string, minSpend: string, percent: string, position: number) {
  return prisma.tier.create({ data: { merchantId: conn.merchantId, name, minSpend, cashbackPercent: percent, position } });
}

const merchantOf = (conn: ConnectionContext) => prisma.merchant.findUniqueOrThrow({ where: { id: conn.merchantId } });

const MINUTE = 60 * 1000;
/** When the guide's switch turned cashback on */
const SWITCHED_ON = new Date("2026-11-09T10:00:00Z");
const minutesAfter = (minutes: number) => new Date(SWITCHED_ON.getTime() + minutes * MINUTE);

async function seedBuyer(conn: ConnectionContext, externalCustomerId: string) {
  return prisma.customer.create({ data: { merchantId: conn.merchantId, connectionId: conn.connectionId, externalCustomerId } });
}

async function seedOrder(
  conn: ConnectionContext,
  customerId: string,
  name: string,
  o: { orderedAt: Date; source?: "live" | "import"; test?: boolean; noCashbackReason?: "test" | "import" },
) {
  return prisma.order.create({
    data: {
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      customerId,
      externalOrderId: `gid://shopify/Order/${name.slice(1)}`,
      name,
      source: o.source ?? "live",
      currency: "GBP",
      totalAmount: "50",
      productAmount: "50",
      shopProductAmount: "50",
      storeCreditUsed: "0",
      shopStoreCreditUsed: "0",
      giftCardUsed: "0",
      cashbackBase: "50",
      orderedAt: o.orderedAt,
      paidAt: o.orderedAt,
      test: o.test ?? false,
      noCashbackReason: o.noCashbackReason ?? null,
    },
  });
}

/** A cashback entry of `amount` GBP on the order, with its credit payout in `state` */
async function seedCashback(conn: ConnectionContext, order: { id: string; customerId: string }, amount: string, state: "sent" | "pending") {
  const entry = await prisma.ledgerEntry.create({
    data: {
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      customerId: order.customerId,
      orderId: order.id,
      kind: "cashback",
      amount,
      currency: "GBP",
      shopAmount: amount,
      tierName: "Everyone",
      ratePercent: "3",
      idempotencyKey: `cashback:${order.id}`,
    },
  });
  await prisma.payout.create({
    data: {
      merchantId: conn.merchantId,
      ledgerEntryId: entry.id,
      customerId: order.customerId,
      rail: "shopify_store_credit",
      direction: "credit",
      amount,
      currency: "GBP",
      state,
      nextAttemptAt: SWITCHED_ON,
      sentAt: state === "sent" ? minutesAfter(1) : null,
    },
  });
}

describe.skipIf(!hasTestDatabase)("the setup guide's gate", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("is due for a store with no tiers that hasn't finished later", async () => {
    const conn = await seedShop();
    expect(await guideDue(conn.merchantId)).toBe(true);
  });

  it("is not due once the store has a tier, or once Finish later was pressed", async () => {
    const a = await seedShop("a.myshopify.com");
    await seedTier(a, "Everyone", "0", "3", 0);
    expect(await guideDue(a.merchantId)).toBe(false);
    const b = await seedShop("b.myshopify.com");
    await dismissGuide(b.merchantId, new Date("2026-11-09T10:00:00Z"));
    expect(await guideDue(b.merchantId)).toBe(false);
  });

  it("keeps the first Finish later", async () => {
    const conn = await seedShop();
    await dismissGuide(conn.merchantId, new Date("2026-11-09T10:00:00Z"));
    await dismissGuide(conn.merchantId, new Date("2026-11-10T10:00:00Z"));
    expect((await merchantOf(conn)).guideDismissedAt).toEqual(new Date("2026-11-09T10:00:00Z"));
  });

  it("is not due for an unknown merchant", async () => {
    expect(await guideDue(crypto.randomUUID())).toBe(false);
    expect(await guideDue("not-a-uuid")).toBe(false);
  });
});

describe.skipIf(!hasTestDatabase)("the setup guide's try-it list", () => {
  let conn: ConnectionContext;

  beforeEach(async () => {
    await resetDatabase();
    conn = await seedShop();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lists the live orders since switch-on, newest first, with what they earned", async () => {
    const buyer = await seedBuyer(conn, "7001");
    // Placed a little before the switch was pressed, inside the 15 minutes' grace
    const earned = await seedOrder(conn, buyer.id, "#1002", { orderedAt: new Date(SWITCHED_ON.getTime() - 5 * MINUTE) });
    await seedCashback(conn, earned, "1.5", "sent");
    await seedOrder(conn, buyer.id, "#1003", { orderedAt: minutesAfter(2), test: true, noCashbackReason: "test" });
    // Left out: an import order, and a live order from before the grace
    await seedOrder(conn, buyer.id, "#1001", { orderedAt: minutesAfter(1), source: "import", noCashbackReason: "import" });
    await seedOrder(conn, buyer.id, "#1000", { orderedAt: new Date(SWITCHED_ON.getTime() - 20 * MINUTE) });
    // Another store's order
    const other = await seedShop("other-guide.myshopify.com");
    const otherBuyer = await seedBuyer(other, "7001");
    await seedOrder(other, otherBuyer.id, "#1004", { orderedAt: minutesAfter(3) });

    const list = await tryItOrders(conn, SWITCHED_ON);
    expect(list.map((o) => [o.name, o.status.label, o.status.detail])).toEqual([
      ["#1003", "No cashback", "Test order"],
      ["#1002", "Issued", null],
    ]);
    expect(list[1]).toEqual({
      orderId: earned.id,
      name: "#1002",
      externalCustomerId: "7001",
      status: { key: "issued", label: "Issued", detail: null },
      cashback: { amount: "1.5", currency: "GBP" },
    });
    expect(list[0].cashback).toBeNull();
  });

  it("lists at most the limit, newest first", async () => {
    const buyer = await seedBuyer(conn, "7001");
    for (let i = 1; i <= 7; i++) {
      const order = await seedOrder(conn, buyer.id, `#${1000 + i}`, { orderedAt: minutesAfter(i) });
      await seedCashback(conn, order, "1.5", "pending");
    }
    expect((await tryItOrders(conn, SWITCHED_ON)).map((o) => [o.name, o.status.label])).toEqual([
      ["#1007", "Waiting"],
      ["#1006", "Waiting"],
      ["#1005", "Waiting"],
      ["#1004", "Waiting"],
      ["#1003", "Waiting"],
    ]);
    expect((await tryItOrders(conn, SWITCHED_ON, 1)).map((o) => o.name)).toEqual(["#1007"]);
  });

  it("gives an erased buyer's order no Shopify id", async () => {
    const buyer = await prisma.customer.create({ data: { merchantId: conn.merchantId, connectionId: conn.connectionId, externalCustomerId: null } });
    await seedOrder(conn, buyer.id, "#1002", { orderedAt: minutesAfter(1) });
    expect((await tryItOrders(conn, SWITCHED_ON)).map((o) => o.externalCustomerId)).toEqual([null]);
  });
});

describe.skipIf(!hasTestDatabase)("the guide's switch-on time", () => {
  let conn: ConnectionContext;
  const MONTH_AGO = new Date(SWITCHED_ON.getTime() - 30 * 24 * 60 * MINUTE);

  beforeEach(async () => {
    await resetDatabase();
    conn = await seedShop();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const setMerchant = (data: { running?: boolean; setupCompletedAt?: Date | null }) => prisma.merchant.update({ where: { id: conn.merchantId }, data });
  const tierAt = (name: string, minSpend: string, position: number, createdAt: Date) =>
    prisma.tier.create({ data: { merchantId: conn.merchantId, name, minSpend, cashbackPercent: "3", position, createdAt } });

  it("is the newest tier's creation when the ladder came after an old setup", async () => {
    await tierAt("Everyone", "0", 0, MONTH_AGO);
    await tierAt("Gold", "500", 1, SWITCHED_ON);
    await setMerchant({ running: true, setupCompletedAt: MONTH_AGO });
    expect(await guideSwitchedOnAt(conn.merchantId)).toEqual(SWITCHED_ON);
  });

  it("is the setup's completion when that came after the tiers", async () => {
    await tierAt("Everyone", "0", 0, MONTH_AGO);
    await setMerchant({ running: true, setupCompletedAt: SWITCHED_ON });
    expect(await guideSwitchedOnAt(conn.merchantId)).toEqual(SWITCHED_ON);
  });

  it("is nothing while cashback is off", async () => {
    await tierAt("Everyone", "0", 0, MONTH_AGO);
    await setMerchant({ running: false, setupCompletedAt: SWITCHED_ON });
    expect(await guideSwitchedOnAt(conn.merchantId)).toBeNull();
    await setMerchant({ running: false, setupCompletedAt: null });
    expect(await guideSwitchedOnAt(conn.merchantId)).toBeNull();
  });

  // The guide's switch leaves setup open until the widget is seen on, so the try-it list still follows it
  it("is the newest tier's creation while cashback is on and setup isn't completed", async () => {
    await tierAt("Everyone", "0", 0, MONTH_AGO);
    await tierAt("Gold", "500", 1, SWITCHED_ON);
    await setMerchant({ running: true, setupCompletedAt: null });
    expect(await guideSwitchedOnAt(conn.merchantId)).toEqual(SWITCHED_ON);
  });

  it("is nothing while cashback is on with no tiers and setup not completed", async () => {
    await setMerchant({ running: true, setupCompletedAt: null });
    expect(await guideSwitchedOnAt(conn.merchantId)).toBeNull();
  });

  it("is nothing for an unknown merchant", async () => {
    expect(await guideSwitchedOnAt(crypto.randomUUID())).toBeNull();
    expect(await guideSwitchedOnAt("not-a-uuid")).toBeNull();
  });
});
