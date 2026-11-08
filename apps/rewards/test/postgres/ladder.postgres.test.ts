import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "~/db.server";
import { MAX_BINS, binOf } from "~/lib/ladder";
import { readGuideBasics, readLadder } from "~/lib/ladder.server";
import { type ConnectionContext, ensureMerchant, findConnection } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import { tierSpend } from "~/lib/tiers.server";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

/**
 * The guide's one read per store (RP-24 spec 4.4): buyers binned by the
 * spend tier placement measures, the replay of imported orders' cashback
 * base by the buyer's spend before each order, and step 1's median order.
 */

const SHOP = "ladder-test.myshopify.com";
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-05T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);
/** Outside the rolling 12 months */
const THIRTEEN_MONTHS_AGO = daysAgo(395);

let conn: ConnectionContext;

async function openShop(): Promise<ConnectionContext> {
  await ensureMerchant({ shop: SHOP, name: "Ladder Test", currency: "GBP", timezone: "Europe/London", now: new Date("2026-10-01T00:00:00Z") });
  const found = await findConnection(SHOP);
  if (!found) throw new Error("no connection");
  return found;
}

let buyerNumber = 0;
const addBuyer = (o: { erased?: boolean } = {}) =>
  prisma.customer.create({
    data: {
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      externalCustomerId: o.erased ? null : String(7000 + ++buyerNumber),
    },
    select: { id: true },
  });

let orderNumber = 0;
/**
 * An order of `shopAmount` of products in the shop's currency (GBP). The
 * buyer paid in GBP too unless `currency` says otherwise, with
 * `productAmount` and `cashbackBase` in that currency.
 */
async function addOrder(
  customerId: string,
  shopAmount: string,
  orderedAt: Date,
  o: {
    refunded?: string;
    test?: boolean;
    cancelledAt?: Date;
    source?: "live" | "import";
    currency?: string;
    productAmount?: string;
    cashbackBase?: string;
  } = {},
) {
  orderNumber++;
  const productAmount = o.productAmount ?? shopAmount;
  await prisma.order.create({
    data: {
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      customerId,
      externalOrderId: `gid://shopify/Order/${9000 + orderNumber}`,
      name: `#${9000 + orderNumber}`,
      source: o.source ?? "live",
      currency: o.currency ?? "GBP",
      totalAmount: productAmount,
      productAmount,
      shopProductAmount: shopAmount,
      storeCreditUsed: "0",
      shopStoreCreditUsed: "0",
      giftCardUsed: "0",
      cashbackBase: o.cashbackBase ?? productAmount,
      refundedProductAmount: o.refunded ?? "0",
      shopRefundedProductAmount: o.refunded ?? "0",
      orderedAt,
      paidAt: orderedAt,
      cancelledAt: o.cancelledAt ?? null,
      test: o.test ?? false,
      noCashbackReason: (o.source ?? "live") === "import" ? "import" : null,
    },
  });
}

const totalOf = (amounts: string[]) => amounts.reduce((total, amount) => total.plus(amount), new Money(0)).toFixed();

/** earnBase with every bin but the given ones at "0" */
const onlyBins = (bins: Record<number, string>) => Array.from({ length: MAX_BINS }, (_, bin) => bins[bin] ?? "0");

describe.skipIf(!hasTestDatabase)("the guide's ladder read", () => {
  beforeEach(async () => {
    await resetDatabase();
    conn = await openShop();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("bins buyers by the same spend tierSpend measures", async () => {
    const a = await addBuyer();
    await addOrder(a.id, "150", daysAgo(30), { source: "import" });
    await addOrder(a.id, "70", daysAgo(29), { source: "import", test: true });
    await addOrder(a.id, "80", daysAgo(28), { source: "import", cancelledAt: daysAgo(27) });
    await addOrder(a.id, "90", THIRTEEN_MONTHS_AGO, { source: "import" });
    const b = await addBuyer();
    await addOrder(b.id, "260", daysAgo(20), { refunded: "60" });
    const c = await addBuyer();
    await addOrder(c.id, "120", daysAgo(15));
    await addOrder(c.id, "50", daysAgo(14), { refunded: "80" });
    const e = await addBuyer();
    await addOrder(e.id, "40", daysAgo(10), { test: true });
    await addOrder(e.id, "45", THIRTEEN_MONTHS_AGO);
    const d = await addBuyer({ erased: true });
    await addOrder(d.id, "999", daysAgo(5), { source: "import" });

    const ladder = await readLadder(conn, NOW);
    for (const [buyer, spend] of [
      [a, "150"],
      [b, "200"],
      [c, "120"],
      [e, "0"],
    ] as const) {
      expect(await tierSpend(buyer.id, "rolling_12_months", NOW)).toEqual(new Money(spend));
      expect(ladder.buyers[binOf(new Money(spend), ladder.binWidth)]).toBeGreaterThan(0);
    }
    expect(ladder.buyers).toHaveLength(MAX_BINS);
    expect(ladder.buyers.reduce((sum, n) => sum + n, 0)).toBe(4);
    expect(ladder.spenders).toBe(3);
    // Only A's counted import order earns in the replay; the erased buyer's is left out
    expect(totalOf(ladder.earnBase)).toBe("150");
  });

  it("counts every order a lifetime window keeps", async () => {
    await prisma.merchant.update({ where: { id: conn.merchantId }, data: { tierWindow: "lifetime" } });
    conn = (await findConnection(SHOP))!;
    const a = await addBuyer();
    await addOrder(a.id, "150", daysAgo(30));
    await addOrder(a.id, "90", THIRTEEN_MONTHS_AGO, { source: "import" });

    const ladder = await readLadder(conn, NOW);
    expect(await tierSpend(a.id, "lifetime", NOW)).toEqual(new Money("240"));
    expect(ladder.buyers[binOf(new Money("240"), ladder.binWidth)]).toBe(1);
    expect(ladder.earnBase[0]).toBe("90");
  });

  it("answers the percentiles of the buyers who spent anything", async () => {
    // 20 spenders of 10, 20, ..., 200, and one buyer with nothing counted
    for (let i = 1; i <= 20; i++) {
      const buyer = await addBuyer();
      await addOrder(buyer.id, String(i * 10), daysAgo(i));
    }
    await addBuyer();

    const ladder = await readLadder(conn, NOW);
    expect(ladder).toMatchObject({ spenders: 20, p80: "160", p95: "190", binWidth: 2 });
    expect(ladder.buyers[0]).toBe(1);
    expect(ladder.buyers.reduce((sum, n) => sum + n, 0)).toBe(21);
  });

  it("replays each imported order at the spend its buyer had before it", async () => {
    const buyer = await addBuyer();
    await addOrder(buyer.id, "300", daysAgo(40), { source: "import" });
    await addOrder(buyer.id, "300", daysAgo(30), { source: "import" });
    // A live order adds spend but no base
    await addOrder(buyer.id, "100", daysAgo(20));
    await addOrder(buyer.id, "300", daysAgo(10), { source: "import" });

    const ladder = await readLadder(conn, NOW);
    expect(ladder.binWidth).toBe(10);
    const at = (spend: string) => binOf(new Money(spend), ladder.binWidth);
    expect(ladder.earnBase).toEqual(onlyBins({ [at("0")]: "300", [at("300")]: "300", [at("700")]: "300" }));
    expect(ladder.estimate).toBe(false);
  });

  it("reduces an order's base by what was refunded, and an over-refunded one adds nothing", async () => {
    const buyer = await addBuyer();
    await addOrder(buyer.id, "300", daysAgo(40), { source: "import", refunded: "100", cashbackBase: "240" });
    await addOrder(buyer.id, "50", daysAgo(30), { source: "import", refunded: "80" });
    await addOrder(buyer.id, "100", daysAgo(20), { source: "import" });

    const ladder = await readLadder(conn, NOW);
    expect(ladder.binWidth).toBe(5);
    const at = (spend: string) => binOf(new Money(spend), ladder.binWidth);
    // 240 × 200 / 300 = 160 at spend 0; the over-refunded order earns 0 and adds no spend, so the last is at 200
    expect(ladder.earnBase).toEqual(onlyBins({ [at("0")]: "160", [at("200")]: "100" }));
  });

  it("converts another currency's base at the order's own rate, and says so", async () => {
    const buyer = await addBuyer();
    await addOrder(buyer.id, "100", daysAgo(10), { source: "import", currency: "EUR", productAmount: "117", cashbackBase: "117" });

    const ladder = await readLadder(conn, NOW);
    expect(totalOf(ladder.earnBase)).toBe("100");
    expect(ladder.earnBase[0]).toBe("100");
    expect(ladder.estimate).toBe(true);
  });

  it("answers an empty store with empty bins and no percentiles", async () => {
    const ladder = await readLadder(conn, NOW);
    expect(ladder).toMatchObject({ binWidth: 10, spenders: 0, p80: null, p95: null, medianOrder: null, multiCurrency: false, estimate: false });
    expect(ladder.earnBase).toHaveLength(MAX_BINS);
    expect(ladder.earnBase.every((base) => base === "0")).toBe(true);
    expect(ladder.buyers).toEqual(Array(MAX_BINS).fill(0));
  });

  it("caps the replay's bins like the buyers' bins", async () => {
    // 100 buyers of 10 keep the 99th percentile at 10, so the bins are 1 wide
    const small = Array.from({ length: 100 }, () => ({ id: crypto.randomUUID(), external: String(7000 + ++buyerNumber) }));
    await prisma.customer.createMany({
      data: small.map((b) => ({ id: b.id, merchantId: conn.merchantId, connectionId: conn.connectionId, externalCustomerId: b.external })),
    });
    for (const b of small) await addOrder(b.id, "10", daysAgo(50));
    const big = await addBuyer();
    await addOrder(big.id, "5000", daysAgo(40));
    await addOrder(big.id, "300", daysAgo(30), { source: "import" });

    const ladder = await readLadder(conn, NOW);
    expect(ladder.binWidth).toBe(1);
    expect(ladder.earnBase).toEqual(onlyBins({ [MAX_BINS - 1]: "300" }));
    expect(ladder.buyers).toHaveLength(MAX_BINS);
    expect(ladder.buyers[MAX_BINS - 1]).toBe(1);
    expect(ladder.buyers[10]).toBe(100);
  });

  it("gives step 1 the median order and whether another currency was used", async () => {
    const buyer = await addBuyer();
    for (const amount of ["40", "50", "60"]) await addOrder(buyer.id, amount, daysAgo(10), { source: "import" });
    // Counted but worth nothing (gift card only, fully discounted): not the example
    await addOrder(buyer.id, "0", daysAgo(10));
    await addOrder(buyer.id, "0", daysAgo(10));
    // Not counted: a test order, a cancelled one, one outside the window, and an erased buyer's
    await addOrder(buyer.id, "5", daysAgo(9), { test: true, currency: "EUR" });
    await addOrder(buyer.id, "6", daysAgo(9), { cancelledAt: daysAgo(8), currency: "EUR" });
    await addOrder(buyer.id, "7", THIRTEEN_MONTHS_AGO, { currency: "EUR" });
    const erased = await addBuyer({ erased: true });
    await addOrder(erased.id, "8", daysAgo(9), { currency: "EUR" });

    expect(await readGuideBasics(conn, NOW)).toEqual({ medianOrder: "50", multiCurrency: false });
    expect(await readLadder(conn, NOW)).toMatchObject({ medianOrder: "50", multiCurrency: false });

    await addOrder(buyer.id, "100", daysAgo(5), { currency: "EUR", productAmount: "117" });
    expect(await readGuideBasics(conn, NOW)).toEqual({ medianOrder: "50", multiCurrency: true });
    expect(await readLadder(conn, NOW)).toMatchObject({ medianOrder: "50", multiCurrency: true });
  });

  it("answers an empty store's basics with no median", async () => {
    expect(await readGuideBasics(conn, NOW)).toEqual({ medianOrder: null, multiCurrency: false });
  });
});
