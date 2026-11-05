import { Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { type ConnectionContext, ensureMerchant, findConnection } from "~/lib/merchant.server";
import { Money, fromDb } from "~/lib/money";
import { type TierRow, lockTier, progress, qualify, resolveTier, runTierPass, tierSpend, windowStart } from "~/lib/tiers.server";
import { failNextCall, hasTestDatabase, resetDatabase, restoreFailedCalls } from "./helpers/database";

// Tier spend, the resolver and the nightly pass against Postgres, adapted
// from apps/rewardspro/test/integration/postgres/tier-recalculation.integration.test.ts.
// Spend is rule 10's: product value minus product value refunded, in the
// shop's currency, by created date, over the merchant's window.

const SHOP = "tiers-test.myshopify.com";
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-05T12:00:00Z");

let conn: ConnectionContext;
let bronze: { id: string };
let gold: { id: string };

async function openShop(): Promise<ConnectionContext> {
  await ensureMerchant({ shop: SHOP, name: "Tiers Test", currency: "GBP", timezone: "Europe/London", now: new Date("2024-01-01T00:00:00Z") });
  const found = await findConnection(SHOP);
  if (!found) throw new Error("no connection");
  return found;
}

const addTier = (merchantId: string, name: string, minSpend: string, percent: string, position: number) =>
  prisma.tier.create({
    data: { merchantId, name, minSpend: new Prisma.Decimal(minSpend), cashbackPercent: new Prisma.Decimal(percent), position },
    select: { id: true },
  });

let buyerNumber = 0;
const addBuyer = (o: { tierId?: string | null; lockedTierId?: string | null; resolvedAt?: Date | null; tierSince?: Date | null } = {}) =>
  prisma.customer.create({
    data: {
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      externalCustomerId: String(7000 + ++buyerNumber),
      tierId: o.tierId === undefined ? bronze.id : o.tierId,
      tierSince: o.tierSince ?? new Date("2025-01-01T00:00:00Z"),
      lockedTierId: o.lockedTierId ?? null,
      resolvedAt: o.resolvedAt ?? null,
    },
    select: { id: true },
  });

let orderNumber = 0;
/** An order of `shopAmount` of products in the shop's currency (GBP); the buyer paid in EUR. */
async function addOrder(
  customerId: string,
  shopAmount: string,
  orderedAt: Date,
  o: { refunded?: string; test?: boolean; cancelledAt?: Date; source?: "live" | "import" } = {},
) {
  orderNumber++;
  // The buyer's currency amounts differ on purpose: spend reads the shop's.
  const eur = (v: string) => new Money(v).times("1.17").toFixed(4);
  await prisma.order.create({
    data: {
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      customerId,
      externalOrderId: `gid://shopify/Order/${9000 + orderNumber}`,
      name: `#${9000 + orderNumber}`,
      source: o.source ?? "live",
      currency: "EUR",
      totalAmount: eur(shopAmount),
      productAmount: eur(shopAmount),
      shopProductAmount: shopAmount,
      storeCreditUsed: "0",
      shopStoreCreditUsed: "0",
      giftCardUsed: "0",
      cashbackBase: eur(shopAmount),
      refundedProductAmount: eur(o.refunded ?? "0"),
      shopRefundedProductAmount: o.refunded ?? "0",
      orderedAt,
      paidAt: orderedAt,
      cancelledAt: o.cancelledAt ?? null,
      test: o.test ?? false,
    },
  });
}

const buyerRow = (id: string) =>
  prisma.customer.findUniqueOrThrow({
    where: { id },
    select: { tierId: true, tierSince: true, lockedTierId: true, resolvedAt: true },
  });

async function tierRows(merchantId: string): Promise<TierRow[]> {
  const rows = await prisma.tier.findMany({ where: { merchantId } });
  return rows.map((t) => ({ ...t, minSpend: fromDb(t.minSpend), cashbackPercent: fromDb(t.cashbackPercent) }));
}

type Aggregate = (...args: unknown[]) => Promise<unknown>;
const spendReads = prisma.order as unknown as { aggregate: Aggregate };
const unpatchedAggregate = spendReads.aggregate;

/**
 * Wrap every spend read (prisma.order.aggregate) in `wrapper`, until the
 * test ends. Like failNextCall, it reaches calls made through `prisma`, not
 * through a transaction's own client.
 */
function wrapSpendReads(wrapper: (read: () => Promise<unknown>) => Promise<unknown>): void {
  spendReads.aggregate = (...args: unknown[]) => wrapper(() => unpatchedAggregate(...args));
}

const setWindow = (tierWindow: "rolling_12_months" | "lifetime") =>
  prisma.merchant.update({ where: { id: conn.merchantId }, data: { tierWindow } });

describe.skipIf(!hasTestDatabase)("tiers on Postgres", () => {
  beforeEach(async () => {
    await resetDatabase();
    conn = await openShop();
    bronze = await addTier(conn.merchantId, "Bronze", "0", "5.00", 0);
    gold = await addTier(conn.merchantId, "Gold", "500", "10.00", 1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreFailedCalls();
    spendReads.aggregate = unpatchedAggregate;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("counts the last 12 months by created date, or all time", async () => {
    const buyer = await addBuyer();
    const start = windowStart("rolling_12_months", NOW)!;
    await addOrder(buyer.id, "300.00", new Date(NOW.getTime() - 30 * DAY));
    await addOrder(buyer.id, "50.00", start); // the window's first instant counts
    await addOrder(buyer.id, "400.00", new Date(start.getTime() - 1)); // just before it doesn't

    expect((await tierSpend(buyer.id, "rolling_12_months", NOW)).toFixed()).toBe("350");
    expect((await tierSpend(buyer.id, "lifetime", NOW)).toFixed()).toBe("750");

    expect(await resolveTier(buyer.id, { now: NOW })).toEqual({ changed: false, tierId: bronze.id });
    await setWindow("lifetime");
    expect(await resolveTier(buyer.id, { now: NOW })).toEqual({ changed: true, tierId: gold.id });
    expect(await buyerRow(buyer.id)).toMatchObject({ tierId: gold.id, tierSince: NOW, resolvedAt: NOW });
  });

  it("lowers spend by refunded product value, and an order refunded beyond its value counts 0, not less", async () => {
    const buyer = await addBuyer();
    const recent = new Date(NOW.getTime() - 10 * DAY);
    await addOrder(buyer.id, "600.00", recent, { refunded: "100.00" });
    // Refunds above the order's value (the order source caps them; this is the belt and braces, Ruling 20)
    await addOrder(buyer.id, "100.00", recent, { refunded: "150.00" });

    expect((await tierSpend(buyer.id, "rolling_12_months", NOW)).toFixed()).toBe("500");
    expect(await resolveTier(buyer.id, { now: NOW })).toEqual({ changed: true, tierId: gold.id });

    // Every order refunded in full: 0, never negative
    const refunded = await addBuyer();
    await addOrder(refunded.id, "80.00", recent, { refunded: "80.00" });
    expect((await tierSpend(refunded.id, "lifetime", NOW)).toFixed()).toBe("0");
  });

  it("doesn't count test or cancelled orders, and does count imported ones (rule 11)", async () => {
    const buyer = await addBuyer();
    const recent = new Date(NOW.getTime() - 10 * DAY);
    await addOrder(buyer.id, "1000.00", recent, { test: true });
    await addOrder(buyer.id, "1000.00", recent, { cancelledAt: new Date(NOW.getTime() - DAY) });
    await addOrder(buyer.id, "200.00", recent, { source: "import" });
    await addOrder(buyer.id, "299.99", recent);

    expect((await tierSpend(buyer.id, "rolling_12_months", NOW)).toFixed()).toBe("499.99");
    expect(await resolveTier(buyer.id, { now: NOW })).toEqual({ changed: false, tierId: bronze.id });

    await addOrder(buyer.id, "0.01", recent);
    expect(await resolveTier(buyer.id, { now: NOW })).toEqual({ changed: true, tierId: gold.id });
  });

  it("only stamps resolvedAt when the tier is unchanged", async () => {
    const since = new Date("2025-06-01T00:00:00Z");
    const buyer = await addBuyer({ tierId: gold.id, tierSince: since, resolvedAt: new Date(NOW.getTime() - 9 * DAY) });
    await addOrder(buyer.id, "500.00", new Date(NOW.getTime() - 10 * DAY));

    expect(await resolveTier(buyer.id, { now: NOW })).toEqual({ changed: false, tierId: gold.id });
    expect(await buyerRow(buyer.id)).toEqual({ tierId: gold.id, tierSince: since, lockedTierId: null, resolvedAt: NOW });
  });

  // A dropped pooled connection fails one read. The resolver must not take
  // the failed read as "nothing found" and write the lower tier it got.
  it.each([
    ["the buyer's orders", "order", "aggregate"],
    ["the buyer's lock", "customer", "findUniqueOrThrow"],
    ["the shop's tiers", "tier", "findMany"],
  ] as const)("keeps a buyer's tier when the read of %s fails, and counts the error", async (_read, model, method) => {
    const resolvedAt = new Date(Date.now() - 3 * DAY);
    // Gold by hand for the lock case; Gold by spend for the others. Nothing else gives Gold.
    const buyer =
      model === "customer"
        ? await addBuyer({ tierId: gold.id, lockedTierId: gold.id, resolvedAt })
        : await addBuyer({ tierId: gold.id, resolvedAt });
    if (model !== "customer") await addOrder(buyer.id, "700.00", new Date(Date.now() - 30 * DAY));
    const before = await buyerRow(buyer.id);
    const lost = new Error("Server has closed the connection");
    vi.spyOn(console, "error").mockImplementation(() => {});

    failNextCall(model, method, lost);
    const summary = await runTierPass(conn.connectionId, { deadline: Date.now() + 60_000, resolvedBefore: new Date() });

    expect(summary).toEqual({ processed: 1, remaining: 0, changed: 0, errors: 1, complete: true, firstError: lost });
    expect(await buyerRow(buyer.id)).toEqual(before);

    // The resolver itself throws and writes nothing
    failNextCall(model, method, lost);
    await expect(resolveTier(buyer.id)).rejects.toBe(lost);
    expect(await buyerRow(buyer.id)).toEqual(before);
  });

  it("finishes a pass an earlier run ran out of time on: never-resolved first, then the oldest", async () => {
    const runStart = new Date();
    const resolvedBefore = new Date(runStart.getTime() - 2 * DAY);
    const neverA = await addBuyer();
    const neverB = await addBuyer();
    const oldest = await addBuyer({ resolvedAt: new Date(runStart.getTime() - 20 * DAY) });
    await addOrder(oldest.id, "600.00", new Date(runStart.getTime() - 40 * DAY));
    const older = await addBuyer({ resolvedAt: new Date(runStart.getTime() - 10 * DAY) });
    const old = await addBuyer({ resolvedAt: new Date(runStart.getTime() - 5 * DAY) });
    const lastOne = await addBuyer({ resolvedAt: new Date(runStart.getTime() - 3 * DAY) });
    const fresh = await addBuyer({ resolvedAt: new Date(runStart.getTime() - DAY) });
    const freshBefore = await buyerRow(fresh.id);

    // A clock that moves a second with each spend read, so the deadline falls
    // after the third buyer
    let clock = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    wrapSpendReads((read) => {
      clock += 1000;
      return read();
    });

    const first = await runTierPass(conn.connectionId, { deadline: clock + 2500, resolvedBefore });
    expect(first).toEqual({ processed: 3, remaining: 3, changed: 1, errors: 0, complete: false });

    const stamped = async (ids: string[]) =>
      Promise.all(ids.map(async (id) => (await buyerRow(id)).resolvedAt!.getTime() >= runStart.getTime()));
    expect(await stamped([neverA.id, neverB.id, oldest.id])).toEqual([true, true, true]);
    expect(await stamped([older.id, old.id, lastOne.id])).toEqual([false, false, false]);
    expect((await buyerRow(oldest.id)).tierId).toBe(gold.id);

    const second = await runTierPass(conn.connectionId, { deadline: clock + 60_000, resolvedBefore });
    expect(second).toEqual({ processed: 3, remaining: 0, changed: 0, errors: 0, complete: true });
    expect(await stamped([older.id, old.id, lastOne.id])).toEqual([true, true, true]);
    // Resolved after resolvedBefore: not this pass's
    expect(await buyerRow(fresh.id)).toEqual(freshBefore);
  });

  it("starts over when a refund's resolve lands between its spend read and its write", async () => {
    const buyer = await addBuyer();
    await addOrder(buyer.id, "700.00", new Date(NOW.getTime() - 30 * DAY));
    let overtaken = false;
    wrapSpendReads(async (read) => {
      const spend = await read();
      if (!overtaken) {
        overtaken = true;
        // The order is refunded in full, and the refund's own resolve keeps Bronze
        await prisma.order.updateMany({ where: { customerId: buyer.id }, data: { shopRefundedProductAmount: "700.00" } });
        expect(await resolveTier(buyer.id, { now: new Date(NOW.getTime() - 1000) })).toEqual({ changed: false, tierId: bronze.id });
      }
      return spend;
    });

    // Its first read saw £700 (Gold); the write it would have made is stale
    expect(await resolveTier(buyer.id, { now: NOW })).toEqual({ changed: false, tierId: bronze.id });
    expect(await buyerRow(buyer.id)).toMatchObject({ tierId: bronze.id, resolvedAt: NOW });
  });

  it("starts over when a lock lands between its spend read and its write", async () => {
    const buyer = await addBuyer();
    await addOrder(buyer.id, "700.00", new Date(NOW.getTime() - 30 * DAY));
    let overtaken = false;
    wrapSpendReads(async (read) => {
      const spend = await read();
      if (!overtaken) {
        overtaken = true;
        expect(await lockTier(conn.merchantId, buyer.id, bronze.id)).toEqual({ ok: true });
      }
      return spend;
    });

    expect(await resolveTier(buyer.id, { now: NOW })).toEqual({ changed: false, tierId: bronze.id });
    expect(await buyerRow(buyer.id)).toMatchObject({ tierId: bronze.id, lockedTierId: bronze.id });
  });

  it("lets a lock beat spend, and Return to automatic re-resolves", async () => {
    const buyer = await addBuyer({ tierId: gold.id });
    await addOrder(buyer.id, "700.00", new Date(NOW.getTime() - 30 * DAY));

    expect(await lockTier(conn.merchantId, buyer.id, bronze.id)).toEqual({ ok: true });
    expect(await buyerRow(buyer.id)).toMatchObject({ tierId: bronze.id, lockedTierId: bronze.id });
    // The nightly pass keeps the lock
    expect(await resolveTier(buyer.id)).toEqual({ changed: false, tierId: bronze.id });

    expect(await lockTier(conn.merchantId, buyer.id, null)).toEqual({ ok: true });
    expect(await buyerRow(buyer.id)).toMatchObject({ tierId: gold.id, lockedTierId: null });

    // Locking a buyer to the tier they hold is allowed and changes nothing else
    const { tierSince } = await buyerRow(buyer.id);
    expect(await lockTier(conn.merchantId, buyer.id, gold.id)).toEqual({ ok: true });
    expect(await buyerRow(buyer.id)).toMatchObject({ tierId: gold.id, lockedTierId: gold.id, tierSince });
  });

  it("refuses a lock to another merchant's tier, an unknown buyer or a malformed id", async () => {
    const buyer = await addBuyer();
    await ensureMerchant({ shop: "other-tiers.myshopify.com", name: "Other", currency: "GBP", timezone: "Europe/London" });
    const other = (await findConnection("other-tiers.myshopify.com"))!;
    const theirs = await addTier(other.merchantId, "Theirs", "0", "20.00", 0);
    const before = await buyerRow(buyer.id);

    expect(await lockTier(conn.merchantId, buyer.id, theirs.id)).toEqual({ ok: false });
    expect(await lockTier(other.merchantId, buyer.id, theirs.id)).toEqual({ ok: false });
    expect(await lockTier(conn.merchantId, "00000000-0000-4000-8000-000000000000", gold.id)).toEqual({ ok: false });
    expect(await lockTier(conn.merchantId, buyer.id, "not-a-tier")).toEqual({ ok: false });
    expect(await lockTier(conn.merchantId, "not-a-buyer", null)).toEqual({ ok: false });
    expect(await buyerRow(buyer.id)).toEqual(before);
  });

  it("measures progress from the same spend that decides the tier", async () => {
    const buyer = await addBuyer({ tierId: null });
    await addOrder(buyer.id, "300.00", new Date(NOW.getTime() - 30 * DAY), { refunded: "50.00" });
    await addOrder(buyer.id, "400.00", new Date(NOW.getTime() - 400 * DAY));

    const spend = await tierSpend(buyer.id, conn.tierWindow, NOW);
    const tiers = await tierRows(conn.merchantId);
    const { tierId } = await resolveTier(buyer.id, { now: NOW });

    expect(spend.toFixed()).toBe("250");
    expect(tierId).toBe(qualify(spend, tiers).id);
    const p = progress(spend, tierId!, tiers);
    expect(p).toMatchObject({ percent: 50, nextTierName: "Gold", isTop: false });
    expect(p.amountRemaining.toFixed()).toBe(p.nextTierMin!.minus(spend).toFixed());
  });

  it("moves a deleted tier's members inside the delete's own transaction", async () => {
    const silver = await addTier(conn.merchantId, "Silver", "200", "7.00", 2);
    const member = await addBuyer({ tierId: silver.id });
    await addOrder(member.id, "300.00", new Date(NOW.getTime() - 30 * DAY));
    const lockedThere = await addBuyer({ tierId: silver.id, lockedTierId: silver.id });

    await prisma.$transaction(async (tx) => {
      for (const c of [member, lockedThere]) {
        expect(await resolveTier(c.id, { tx, now: NOW, excludeTierId: silver.id })).toEqual({ changed: true, tierId: bronze.id });
      }
      // A lock to the excluded tier no longer counts; A20 also clears it
      await tx.customer.updateMany({ where: { lockedTierId: silver.id }, data: { lockedTierId: null } });
      await tx.tier.delete({ where: { id: silver.id } });
    });

    expect(await buyerRow(member.id)).toMatchObject({ tierId: bronze.id, tierSince: NOW });
    expect(await prisma.tier.count({ where: { id: silver.id } })).toBe(0);
  });

  it("leaves a buyer with no tier while the shop has none, and stamps the resolve", async () => {
    await prisma.tier.deleteMany({ where: { merchantId: conn.merchantId } });
    const buyer = await addBuyer({ tierId: null });

    expect(await resolveTier(buyer.id, { now: NOW })).toEqual({ changed: false, tierId: null });
    expect(await buyerRow(buyer.id)).toMatchObject({ tierId: null, resolvedAt: NOW });
  });

  it("places a buyer with no tier yet in the tier their spend gives", async () => {
    const buyer = await addBuyer({ tierId: null });
    await addOrder(buyer.id, "550.00", new Date(NOW.getTime() - 30 * DAY));

    expect(await resolveTier(buyer.id, { now: NOW })).toEqual({ changed: true, tierId: gold.id });
    expect(await buyerRow(buyer.id)).toMatchObject({ tierId: gold.id, tierSince: NOW, resolvedAt: NOW });
  });
});
