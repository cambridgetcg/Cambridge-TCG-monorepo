import { Prisma, type LedgerEntryKind, type LookReason, type PayoutDirection, type PayoutState } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { homeBanners } from "~/lib/home-rules";
import { type ConnectionContext, ensureMerchant, findConnection } from "~/lib/merchant.server";
import { customerRows, homeStats } from "~/lib/stats.server";
import { monitoring } from "~/lib/telemetry.server";
import { flushWaitUntil } from "~/lib/wait-until.server";
import type { GraphqlClient } from "~/shopify/graphql";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

/**
 * Home (spec 4.3): its numbers from the ledger and the orders, in the shop's
 * time zone; its banners in order; the review request's timing; and its
 * actions (the switch, the base rate, the review request), each followed by
 * the widget's app metafield. The admin session is the library's job
 * (requireMerchant), so it is replaced here by the store's connection and a
 * stand-in Admin API client that answers by operation name.
 */

vi.mock("~/admin/require-merchant.server", () => ({ requireMerchant: vi.fn() }));

const SHOP = "home-test.myshopify.com";
// Auckland is UTC+13 in November (daylight time), so its month and days
// start 13 hours before UTC's.
const TZ = "Pacific/Auckland";
const INSTALLED = new Date("2026-10-01T00:00:00Z");
// 13:00 on 15 November in Auckland, whose month began at 2026-10-31T11:00Z
const NOW = new Date("2026-11-15T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const APP_INSTALLATION = "gid://shopify/AppInstallation/42";

type Call = { operation: string; variables: Record<string, unknown> };

/**
 * An Admin API client that answers the documents Home sends, by operation
 * name, and records each call. `answers` replaces the default answer of an
 * operation; any other operation fails the test.
 */
function fakeAdmin(answers: Record<string, unknown> = {}): GraphqlClient & { calls: Call[] } {
  const calls: Call[] = [];
  const defaults: Record<string, unknown> = {
    RewardsCustomerAccounts: { data: { shop: { customerAccountsV2: { customerAccountsVersion: "NEW_CUSTOMER_ACCOUNTS", loginLinksVisibleOnStorefrontAndCheckout: true } } } },
    RewardsStoreCreditConfig: { data: { storeCreditConfiguration: { storeCreditEnabled: true } } },
    RewardsCustomerNames: { data: { nodes: [] } },
    RewardsAppInstallation: { data: { currentAppInstallation: { id: APP_INSTALLATION } } },
    RewardsWidgetConfig: { data: { metafieldsSet: { metafields: [{ id: "gid://shopify/Metafield/1" }], userErrors: [] } } },
  };
  return {
    calls,
    async graphql(query, options) {
      const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "unknown";
      calls.push({ operation, variables: options?.variables ?? {} });
      const answer = answers[operation] ?? defaults[operation];
      if (answer === undefined) throw new Error(`The test answers no ${operation}`);
      return { json: async () => answer };
    },
  };
}

type HomeRoute = typeof import("~/routes/app._index");
let route: HomeRoute;
let requireMerchant: ReturnType<typeof vi.fn>;

/** Home's loader and action as the signed-in store, through `admin`. */
async function signIn(admin: GraphqlClient) {
  const conn = (await findConnection(SHOP))!;
  requireMerchant.mockResolvedValue({ admin, session: { shop: SHOP }, conn });
  return conn;
}

async function load(admin: GraphqlClient = fakeAdmin()) {
  await signIn(admin);
  return (await route.loader({ request: new Request("https://test.example.com/app"), params: {}, context: {} } as never)) as Exclude<
    Awaited<ReturnType<HomeRoute["loader"]>>,
    Response
  >;
}

async function act(fields: Record<string, string>, admin: GraphqlClient = fakeAdmin()) {
  await signIn(admin);
  const request = new Request("https://test.example.com/app", { method: "POST", body: new URLSearchParams(fields) });
  return (await route.action({ request, params: {}, context: {} } as never)) as { ok: boolean; error?: string };
}

async function seedShop(): Promise<ConnectionContext> {
  await ensureMerchant({ shop: SHOP, name: "Home Test", currency: "GBP", timezone: TZ, now: INSTALLED });
  return (await findConnection(SHOP))!;
}

async function seedTier(conn: ConnectionContext, name: string, minSpend: string, percent: string, position: number) {
  return prisma.tier.create({ data: { merchantId: conn.merchantId, name, minSpend, cashbackPercent: percent, position } });
}

async function seedBuyer(conn: ConnectionContext, externalCustomerId: string, tierId: string | null = null) {
  return prisma.customer.create({
    data: { merchantId: conn.merchantId, connectionId: conn.connectionId, externalCustomerId, tierId },
  });
}

let orderNumber = 1000;

async function seedOrder(
  conn: ConnectionContext,
  customerId: string,
  o: { orderedAt: Date; paidAt?: Date; creditUsed?: string; shopCreditUsed?: string; test?: boolean; cancelledAt?: Date; source?: "live" | "import" },
) {
  orderNumber++;
  return prisma.order.create({
    data: {
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      customerId,
      externalOrderId: `gid://shopify/Order/${orderNumber}`,
      name: `#${orderNumber}`,
      source: o.source ?? "live",
      currency: "GBP",
      totalAmount: "50",
      productAmount: "50",
      shopProductAmount: "50",
      storeCreditUsed: o.creditUsed ?? "0",
      shopStoreCreditUsed: o.shopCreditUsed ?? o.creditUsed ?? "0",
      giftCardUsed: "0",
      cashbackBase: "50",
      orderedAt: o.orderedAt,
      paidAt: o.paidAt ?? o.orderedAt,
      cancelledAt: o.cancelledAt ?? null,
      test: o.test ?? false,
    },
  });
}

let entryNumber = 0;

async function seedEntry(
  conn: ConnectionContext,
  o: {
    customerId: string;
    orderId?: string;
    kind: LedgerEntryKind;
    amount: string;
    shopAmount?: string;
    currency?: string;
    createdAt: Date;
    tierName?: string;
    key?: string;
  },
) {
  entryNumber++;
  return prisma.ledgerEntry.create({
    data: {
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      customerId: o.customerId,
      orderId: o.orderId ?? null,
      kind: o.kind,
      amount: o.amount,
      currency: o.currency ?? "GBP",
      shopAmount: o.shopAmount ?? o.amount,
      tierName: o.tierName ?? "Everyone",
      ratePercent: "5",
      idempotencyKey: o.key ?? `${o.kind}:${entryNumber}`,
      createdAt: o.createdAt,
    },
  });
}

async function seedPayout(
  conn: ConnectionContext,
  entry: { id: string; customerId: string; amount: { toString(): string }; currency: string },
  state: PayoutState,
  o: { direction?: PayoutDirection; lookReason?: LookReason; debitedAmount?: string; shortfall?: string } = {},
) {
  const amount = entry.amount.toString().replace("-", "");
  return prisma.payout.create({
    data: {
      merchantId: conn.merchantId,
      ledgerEntryId: entry.id,
      customerId: entry.customerId,
      rail: "shopify_store_credit",
      direction: o.direction ?? "credit",
      amount: state === "nothing_to_send" ? "0" : amount,
      currency: entry.currency,
      state,
      lookReason: o.lookReason ?? (state === "needs_look" ? "refused" : null),
      debitedAmount: o.debitedAmount ?? null,
      shortfall: o.shortfall ?? null,
      nextAttemptAt: NOW,
    },
  });
}

/** `n` cashback entries, for the review request. */
let reviewBuyers = 9000;

async function seedCashbackEntries(conn: ConnectionContext, n: number) {
  reviewBuyers++;
  const buyer = await seedBuyer(conn, String(reviewBuyers));
  for (let i = 0; i < n; i++) {
    const order = await seedOrder(conn, buyer.id, { orderedAt: new Date(Date.now() - DAY) });
    const entry = await seedEntry(conn, { customerId: buyer.id, orderId: order.id, kind: "cashback", amount: "1.00", createdAt: new Date(Date.now() - DAY) });
    await seedPayout(conn, entry, "sent");
  }
}

const merchantOf = (conn: ConnectionContext) => prisma.merchant.findUniqueOrThrow({ where: { id: conn.merchantId } });

/** The widget config each RewardsWidgetConfig call wrote, parsed. */
function widgetConfigs(admin: { calls: Call[] }) {
  return admin.calls
    .filter((call) => call.operation === "RewardsWidgetConfig")
    .map((call) => {
      const [metafield] = call.variables.metafields as Array<Record<string, string>>;
      return { ...metafield, value: JSON.parse(metafield.value) };
    });
}

describe.skipIf(!hasTestDatabase)("Home", () => {
  beforeEach(async () => {
    await resetDatabase();
    process.env.SHOPIFY_API_KEY = "test-api-key";
    if (!route) {
      route = await import("~/routes/app._index");
      ({ requireMerchant } = (await import("~/admin/require-merchant.server")) as unknown as { requireMerchant: ReturnType<typeof vi.fn> });
    }
  });

  afterEach(async () => {
    await flushWaitUntil();
    requireMerchant?.mockReset();
  });

  afterAll(async () => {
    delete process.env.SHOPIFY_API_KEY;
    await prisma.$disconnect();
  });

  describe("this month's numbers", () => {
    it("gives cashback net of take-backs and adjustments, in the shop's currency and time zone", async () => {
      const conn = await seedShop();
      const buyer = await seedBuyer(conn, "7001");
      const order = await seedOrder(conn, buyer.id, { orderedAt: new Date("2026-10-31T11:30:00Z") });
      const at = (iso: string) => new Date(iso);
      // 1 November at 01:00 in Auckland (still 31 October in UTC): this month.
      // A euro order on the GBP shop: counted at its shop amount.
      const euro = await seedEntry(conn, { customerId: buyer.id, orderId: order.id, kind: "cashback", amount: "6.00", currency: "EUR", shopAmount: "5.00", createdAt: at("2026-10-31T12:00:00Z") });
      await seedPayout(conn, euro, "sent");
      // 31 October at 23:00 in Auckland: last month
      await seedEntry(conn, { customerId: buyer.id, kind: "cashback", amount: "3.00", createdAt: at("2026-10-31T10:00:00Z") });
      await seedEntry(conn, { customerId: buyer.id, kind: "cashback", amount: "4.00", createdAt: at("2026-11-10T09:00:00Z") });
      // A take-back, the shortfall it couldn't take (Ruling 35) and a payout closed without sending
      await seedEntry(conn, { customerId: buyer.id, kind: "reversal", amount: "-1.50", createdAt: at("2026-11-11T09:00:00Z") });
      await seedEntry(conn, { customerId: buyer.id, kind: "adjustment", amount: "0.50", createdAt: at("2026-11-11T09:00:01Z"), key: "shortfall:payout-1" });
      await seedEntry(conn, { customerId: buyer.id, kind: "adjustment", amount: "-2.00", createdAt: at("2026-11-12T09:00:00Z"), key: "close:payout-2" });
      // After now
      await seedEntry(conn, { customerId: buyer.id, kind: "cashback", amount: "9.00", createdAt: at("2026-11-15T00:00:01Z") });

      const stats = await homeStats(conn, NOW);

      expect(stats.cashbackGiven.toFixed(2)).toBe("6.00");
      // The last 30 days in Auckland, oldest first, ending today
      expect(stats.daily).toHaveLength(30);
      expect(stats.daily[0].date).toBe("2026-10-17");
      expect(stats.daily[29].date).toBe("2026-11-15");
      const given = Object.fromEntries(stats.daily.filter((d) => !d.given.isZero()).map((d) => [d.date, d.given.toFixed(2)]));
      expect(given).toEqual({
        "2026-10-31": "3.00",
        "2026-11-01": "5.00",
        "2026-11-10": "4.00",
        "2026-11-11": "-1.00",
        "2026-11-12": "-2.00",
      });
      expect(stats.cashbackOrders).toBe(4);
    });

    it("counts store credit spent at checkout from the orders paid this month, in the shop's currency", async () => {
      const conn = await seedShop();
      const buyer = await seedBuyer(conn, "7001");
      await seedOrder(conn, buyer.id, { orderedAt: new Date("2026-11-02T09:00:00Z"), creditUsed: "12.00", shopCreditUsed: "10.00" });
      // Paid at 00:30 on 1 November in Auckland
      await seedOrder(conn, buyer.id, { orderedAt: new Date("2026-10-30T09:00:00Z"), paidAt: new Date("2026-10-31T11:30:00Z"), creditUsed: "2.50" });
      // Last month, a test order and a cancelled one count nowhere
      await seedOrder(conn, buyer.id, { orderedAt: new Date("2026-10-31T10:00:00Z"), creditUsed: "100.00" });
      await seedOrder(conn, buyer.id, { orderedAt: new Date("2026-11-03T09:00:00Z"), creditUsed: "200.00", test: true });
      await seedOrder(conn, buyer.id, {
        orderedAt: new Date("2026-11-04T09:00:00Z"),
        creditUsed: "300.00",
        cancelledAt: new Date("2026-11-05T09:00:00Z"),
      });

      const stats = await homeStats(conn, NOW);

      expect(stats.creditSpent.toFixed(2)).toBe("12.50");
      const spent = Object.fromEntries(stats.daily.filter((d) => !d.spent.isZero()).map((d) => [d.date, d.spent.toFixed(2)]));
      expect(spent).toEqual({ "2026-10-31": "100.00", "2026-11-01": "2.50", "2026-11-02": "10.00" });
    });

    it("counts a buyer as came back when a paid order this month follows an earlier order that earned cashback", async () => {
      const conn = await seedShop();
      const earned = async (customerId: string, orderedAt: Date) => {
        const order = await seedOrder(conn, customerId, { orderedAt });
        await seedPayout(conn, await seedEntry(conn, { customerId, orderId: order.id, kind: "cashback", amount: "1.00", createdAt: orderedAt }), "sent");
      };
      // Earned in October, bought again in November: came back
      const returning = await seedBuyer(conn, "7001");
      await earned(returning.id, new Date("2026-10-05T09:00:00Z"));
      await seedOrder(conn, returning.id, { orderedAt: new Date("2026-11-03T09:00:00Z") });
      // An October order that earned nothing
      const noCashback = await seedBuyer(conn, "7002");
      await seedOrder(conn, noCashback.id, { orderedAt: new Date("2026-10-05T09:00:00Z") });
      await seedOrder(conn, noCashback.id, { orderedAt: new Date("2026-11-03T09:00:00Z") });
      // Only this month's order, which earned
      const first = await seedBuyer(conn, "7003");
      await earned(first.id, new Date("2026-11-03T09:00:00Z"));
      // Earned early this month, then bought again later this month
      const twice = await seedBuyer(conn, "7004");
      await earned(twice.id, new Date("2026-11-02T09:00:00Z"));
      await seedOrder(conn, twice.id, { orderedAt: new Date("2026-11-09T09:00:00Z") });
      // Bought again only last month
      const lapsed = await seedBuyer(conn, "7005");
      await earned(lapsed.id, new Date("2026-09-05T09:00:00Z"));
      await seedOrder(conn, lapsed.id, { orderedAt: new Date("2026-10-20T09:00:00Z") });

      const stats = await homeStats(conn, NOW);

      expect(stats.cameBack).toBe(2);
    });

    it("lists recent rewards newest first with their status, the tiers with their members, and the orders that need a look", async () => {
      const conn = await seedShop();
      const everyone = await seedTier(conn, "Everyone", "0", "5", 0);
      const gold = await seedTier(conn, "Gold", "500", "10", 1);
      const buyer = await seedBuyer(conn, "7001", everyone.id);
      await seedBuyer(conn, "7002", everyone.id);
      await seedBuyer(conn, "7003", gold.id);
      await seedBuyer(conn, "7004");
      // Erased by customers/redact: the row stays, but is no member (TRUTH-9)
      await seedBuyer(conn, "erased-placeholder", gold.id).then((erased) =>
        prisma.customer.update({ where: { id: erased.id }, data: { externalCustomerId: null } }),
      );
      const order = await seedOrder(conn, buyer.id, { orderedAt: new Date("2026-11-02T09:00:00Z") });
      const sent = await seedEntry(conn, { customerId: buyer.id, orderId: order.id, kind: "cashback", amount: "2.50", createdAt: new Date("2026-11-02T09:00:00Z") });
      await seedPayout(conn, sent, "sent");
      const back = await seedEntry(conn, { customerId: buyer.id, orderId: order.id, kind: "reversal", amount: "-1.00", createdAt: new Date("2026-11-03T09:00:00Z") });
      await seedPayout(conn, back, "needs_look", { direction: "debit", lookReason: "could_not_confirm" });
      const waiting = await seedEntry(conn, { customerId: buyer.id, orderId: order.id, kind: "cashback", amount: "4.00", createdAt: new Date("2026-11-04T09:00:00Z") });
      await seedPayout(conn, waiting, "unconfirmed");
      const refused = await seedEntry(conn, { customerId: buyer.id, orderId: order.id, kind: "cashback", amount: "3.00", tierName: "Gold", createdAt: new Date("2026-11-05T09:00:00Z") });
      await seedPayout(conn, refused, "needs_look");
      // An earlier order whose credit needs a look
      const second = await seedOrder(conn, buyer.id, { orderedAt: new Date("2026-11-01T09:00:00Z") });
      const stuck = await seedEntry(conn, { customerId: buyer.id, orderId: second.id, kind: "cashback", amount: "1.00", createdAt: new Date("2026-11-01T09:00:00Z") });
      await seedPayout(conn, stuck, "needs_look", { lookReason: "kept_failing" });

      const data = await load(fakeAdmin({ RewardsCustomerNames: { data: { nodes: [{ id: "gid://shopify/Customer/7001", firstName: "Sam", lastName: "K." }] } } }));

      expect(data.stats.recent).toEqual([
        { orderId: order.id, orderName: order.name, buyer: "Sam K.", tierName: "Gold", amount: "£3.00", status: "Needs a look", tone: "warning", detail: null },
        { orderId: order.id, orderName: order.name, buyer: "Sam K.", tierName: "Everyone", amount: "£4.00", status: "Waiting", tone: "info", detail: null },
        { orderId: order.id, orderName: order.name, buyer: "Sam K.", tierName: "Everyone", amount: "-£1.00", status: "Needs a look", tone: "warning", detail: null },
        { orderId: order.id, orderName: order.name, buyer: "Sam K.", tierName: "Everyone", amount: "£2.50", status: "Issued", tone: "success", detail: null },
        { orderId: second.id, orderName: second.name, buyer: "Sam K.", tierName: "Everyone", amount: "£1.00", status: "Needs a look", tone: "warning", detail: null },
      ]);
      expect(data.stats.tiers).toEqual([
        { id: everyone.id, name: "Everyone", percent: "5", members: 2 },
        { id: gold.id, name: "Gold", percent: "10", members: 1 },
      ]);
      // Ruling 56: three payouts need a look, on two orders, as the Orders page counts them
      expect(data.stats.needsLook).toBe(2);
      expect(homeBanners(data.bannerFacts, true).map((b) => b.text)).toEqual(["2 orders need a look."]);
    });

    it("names an erased buyer as every page does", async () => {
      const conn = await seedShop();
      const buyer = await seedBuyer(conn, "7001");
      const order = await seedOrder(conn, buyer.id, { orderedAt: new Date("2026-11-02T09:00:00Z") });
      await seedPayout(conn, await seedEntry(conn, { customerId: buyer.id, orderId: order.id, kind: "cashback", amount: "1.00", createdAt: new Date("2026-11-02T09:00:00Z") }), "sent");
      await prisma.customer.update({ where: { id: buyer.id }, data: { externalCustomerId: null } });

      const data = await load();

      expect(data.stats.recent.map((r) => r.buyer)).toEqual(["Erased buyer"]);
    });

    // A19-F8: every cashback and take-back is written with its payout; one without is reported, not shown as Waiting
    it("reports an entry with no payout, by its id alone, and shows it as Unknown", async () => {
      const conn = await seedShop();
      const buyer = await seedBuyer(conn, "7001");
      const order = await seedOrder(conn, buyer.id, { orderedAt: new Date("2026-11-02T09:00:00Z") });
      const orphan = await seedEntry(conn, { customerId: buyer.id, orderId: order.id, kind: "cashback", amount: "1.00", createdAt: new Date("2026-11-02T09:00:00Z") });
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const capture = vi.spyOn(monitoring, "captureMessage").mockImplementation(() => true);

      const data = await load();

      expect(data.stats.recent).toEqual([expect.objectContaining({ amount: "£1.00", status: "Unknown", tone: "neutral" })]);
      expect(errors.mock.calls.map((args) => args.join(" "))).toEqual([expect.stringContaining(orphan.id)]);
      expect(capture).toHaveBeenCalledWith(expect.stringContaining("no payout"), "error", { tags: { "ledger.invariant": "entry-without-payout" }, extra: { ledgerEntryId: orphan.id } });
      // No buyer detail goes with it
      const reported = JSON.stringify([errors.mock.calls, capture.mock.calls]);
      expect(reported).not.toContain("7001");
      expect(reported).not.toContain(buyer.id);
      errors.mockRestore();
      capture.mockRestore();
    });

    // Ruling 65 (TRUTH-1, DESIGN-2): what left the buyer, as the ledger nets it
    describe("a take-back, at what it took", () => {
      /** A £1.00 credit sent, then fully refunded: the debit took `taken` (null: Shopify never said) */
      async function refundedInFull(conn: ConnectionContext, externalId: string, taken: string | null, day: number) {
        const buyer = await seedBuyer(conn, externalId);
        const order = await seedOrder(conn, buyer.id, { orderedAt: new Date(`2026-11-0${day}T09:00:00Z`) });
        const credit = await seedEntry(conn, { customerId: buyer.id, orderId: order.id, kind: "cashback", amount: "1.00", createdAt: new Date(`2026-11-0${day}T09:00:00Z`) });
        await seedPayout(conn, credit, "sent");
        const reversal = await seedEntry(conn, { customerId: buyer.id, orderId: order.id, kind: "reversal", amount: "-1.00", createdAt: new Date(`2026-11-0${day}T10:00:00Z`) });
        const shortfall = taken === null ? null : new Prisma.Decimal("1.00").minus(taken).toFixed(2);
        const debit = await seedPayout(conn, reversal, "sent", { direction: "debit", debitedAmount: taken ?? undefined, shortfall: shortfall ?? undefined });
        // Ruling 35: the part not taken comes back on the ledger
        if (shortfall !== null && shortfall !== "0.00") {
          await seedEntry(conn, { customerId: buyer.id, orderId: order.id, kind: "adjustment", amount: shortfall, createdAt: new Date(`2026-11-0${day}T10:00:01Z`), key: `shortfall:${debit.id}` });
        }
        return buyer;
      }

      it("shows on Recent rewards what the debit took, the spec's sentence when short, and Amount unknown when Shopify never said", async () => {
        const conn = await seedShop();
        await refundedInFull(conn, "7001", "0", 2);
        await refundedInFull(conn, "7002", "0.40", 3);

        const data = await load();

        expect(data.stats.recent.map(({ amount, status, detail }) => ({ amount, status, detail }))).toEqual([
          { amount: "-£0.40", status: "Taken back", detail: "Took back £0.40 of £1.00; the buyer had spent the rest" },
          { amount: "£1.00", status: "Issued", detail: null },
          { amount: "£0.00", status: "Not taken back", detail: "Couldn't take back £1.00; the buyer had spent it" },
          { amount: "£1.00", status: "Issued", detail: null },
        ]);
        // The ledger agrees: £1.00 kept by the first buyer, £0.60 by the second
        expect(data.stats.cashbackGiven).toBe("1.6");
        const rows = await customerRows(conn, { page: 1, now: NOW });
        expect(Object.fromEntries(rows.rows.map((row) => [row.externalCustomerId, row.cashbackGiven.toFixed(2)]))).toEqual({ "7001": "1.00", "7002": "0.60" });
      });

      it("shows Amount unknown for a take-back Shopify confirmed without saying how much", async () => {
        const conn = await seedShop();
        await refundedInFull(conn, "7003", null, 4);

        const data = await load();

        expect(data.stats.recent.map(({ amount, status, detail }) => ({ amount, status, detail }))).toEqual([
          { amount: "Amount unknown", status: "Taken back", detail: null },
          { amount: "£1.00", status: "Issued", detail: null },
        ]);
        // No shortfall was recorded, so the ledger counts it as taken
        const rows = await customerRows(conn, { page: 1, now: NOW });
        expect(rows.rows.map((row) => row.cashbackGiven.toFixed(2))).toEqual(["0.00"]);
      });
    });
  });

  // Ruling 59 (A19-F3): a check Shopify couldn't answer is unknown, never "can be spent"
  it("says the store credit check is unknown when Shopify couldn't answer it", async () => {
    await seedShop();
    const silent = fakeAdmin({ RewardsStoreCreditConfig: { errors: [{ message: "Throttled" }] } });

    const data = await load(silent);

    expect(data.storeCreditReady).toBeNull();
    expect(data.bannerFacts.spendProblems).toEqual([]);
    expect((await load()).storeCreditReady).toBe(true);
  });

  describe("the review request", () => {
    const sevenDaysOld = (conn: ConnectionContext, days = 7) =>
      prisma.merchant.update({ where: { id: conn.merchantId }, data: { createdAt: new Date(Date.now() - days * DAY - 60_000) } });

    it("is due once 3 orders earned cashback and the merchant is 7 days old", async () => {
      const conn = await seedShop();
      await sevenDaysOld(conn);
      await seedCashbackEntries(conn, 2);
      expect((await load()).reviewDue).toBe(false);

      await seedCashbackEntries(conn, 1);
      expect((await load()).reviewDue).toBe(true);
    });

    it("is not due before 7 days", async () => {
      const conn = await seedShop();
      await sevenDaysOld(conn, 6);
      await seedCashbackEntries(conn, 3);
      expect((await load()).reviewDue).toBe(false);
    });

    it("is not due after the merchant dismissed it", async () => {
      const conn = await seedShop();
      await sevenDaysOld(conn);
      await seedCashbackEntries(conn, 3);

      await expect(act({ intent: "review-dismissed" })).resolves.toEqual({ ok: true });

      expect((await merchantOf(conn)).reviewPromptDismissedAt).toBeInstanceOf(Date);
      expect((await load()).reviewDue).toBe(false);
    });

    it("is recorded as shown only when Shopify showed it or the merchant had reviewed, and is then not due", async () => {
      const conn = await seedShop();
      await sevenDaysOld(conn);
      await seedCashbackEntries(conn, 3);

      // Declined for a reason that passes: a later visit tries again
      await expect(act({ intent: "review-shown", code: "cooldown-period" })).resolves.toEqual({ ok: true });
      expect((await merchantOf(conn)).reviewPromptShownAt).toBeNull();
      expect((await load()).reviewDue).toBe(true);

      await expect(act({ intent: "review-shown", code: "already-reviewed" })).resolves.toEqual({ ok: true });
      expect((await merchantOf(conn)).reviewPromptShownAt).toBeInstanceOf(Date);
      expect((await load()).reviewDue).toBe(false);
    });

    it("is not due when it was shown before, whatever the counts", async () => {
      const conn = await seedShop();
      await sevenDaysOld(conn, 30);
      await seedCashbackEntries(conn, 5);
      await prisma.merchant.update({ where: { id: conn.merchantId }, data: { reviewPromptShownAt: new Date(Date.now() - DAY) } });
      expect((await load()).reviewDue).toBe(false);
    });
  });

  it("shows the banners most urgent first: data request, store credit, needs a look, widget", async () => {
    const conn = await seedShop();
    const buyer = await seedBuyer(conn, "7001");
    for (const [i, key] of ["a", "b"].entries()) {
      const order = await seedOrder(conn, buyer.id, { orderedAt: new Date(Date.now() - (i + 1) * DAY) });
      const entry = await seedEntry(conn, { customerId: buyer.id, orderId: order.id, kind: "cashback", amount: "1.00", createdAt: new Date(Date.now() - (i + 1) * DAY), key });
      await seedPayout(conn, entry, "needs_look");
    }
    const request = (shopifyRequestId: string, dueAt: Date, status: "open" | "downloaded" = "open") => ({
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      externalCustomerId: "7001",
      shopifyRequestId,
      ordersRequested: [],
      status,
      receivedAt: new Date(dueAt.getTime() - 30 * DAY),
      dueAt,
      expiresAt: new Date(dueAt.getTime() + 15 * DAY),
    });
    // The soonest open request is the one to download first; a downloaded one needs nothing
    await prisma.privacyRequest.createMany({
      data: [
        request("1", new Date("2026-12-20T10:00:00Z")),
        // 01:00 on 5 December in Auckland, still 4 December in UTC
        request("2", new Date("2026-12-04T12:00:00Z")),
        request("3", new Date("2026-11-30T10:00:00Z"), "downloaded"),
      ],
    });
    const admin = fakeAdmin({
      RewardsCustomerAccounts: { data: { shop: { customerAccountsV2: { customerAccountsVersion: "CLASSIC", loginLinksVisibleOnStorefrontAndCheckout: true } } } },
      RewardsStoreCreditConfig: { data: { storeCreditConfiguration: { storeCreditEnabled: false } } },
    });

    const data = await load(admin);
    // The widget check runs in the browser; here it found the embed off
    const banners = homeBanners(data.bannerFacts, false);

    expect(banners.map((b) => b.text)).toEqual([
      "A customer asked for their data. Download it by December 5, 2026.",
      "Buyers can't spend their store credit yet: your store uses legacy customer accounts; store credit is turned off in Settings > Customer accounts.",
      "2 orders need a look.",
      "The rewards widget is off in your theme.",
    ]);
    expect(banners[2].link).toEqual({ label: "Open orders", href: "/app/orders" });
    expect(banners[3].link?.href).toBe(`https://${SHOP}/admin/themes/current/editor?context=apps&activateAppId=test-api-key/membership_widget`);
    // With nothing to act on, no banner
    expect(homeBanners({ ...data.bannerFacts, privacyDueAt: null, spendProblems: [], needsLook: 0 }, true)).toEqual([]);
    expect(homeBanners({ ...data.bannerFacts, privacyDueAt: null, spendProblems: [], needsLook: 0 }, null)).toEqual([]);
  });

  describe("the switch", () => {
    it("refuses to switch on with no tiers, and writes nothing to the widget", async () => {
      const conn = await seedShop();
      const admin = fakeAdmin();

      await expect(act({ intent: "running", running: "on" }, admin)).resolves.toEqual({ ok: false, error: "Set your base cashback rate first." });

      expect((await merchantOf(conn)).running).toBe(false);
      expect(widgetConfigs(admin)).toEqual([]);
    });

    it("switches on and off with a tier, and tells the widget each time", async () => {
      const conn = await seedShop();
      await seedTier(conn, "Gold", "500", "10", 1);
      await seedTier(conn, "Everyone", "0", "5.50", 0);
      const admin = fakeAdmin();

      await expect(act({ intent: "running", running: "on" }, admin)).resolves.toEqual({ ok: true });
      expect((await merchantOf(conn)).running).toBe(true);
      await expect(act({ intent: "running", running: "off" }, admin)).resolves.toEqual({ ok: true });
      expect((await merchantOf(conn)).running).toBe(false);

      expect(widgetConfigs(admin)).toEqual([
        { ownerId: APP_INSTALLATION, namespace: "rewards", key: "config", type: "json", value: { running: true, basePercent: 5.5 } },
        { ownerId: APP_INSTALLATION, namespace: "rewards", key: "config", type: "json", value: { running: false, basePercent: 5.5 } },
      ]);
    });

    it("keeps the switch when the widget can't be told, and says why in the log", async () => {
      const conn = await seedShop();
      await seedTier(conn, "Everyone", "0", "5", 0);
      const admin = fakeAdmin({
        RewardsWidgetConfig: { data: { metafieldsSet: { metafields: [], userErrors: [{ field: ["metafields", "0", "value"], message: "Value is invalid", code: "INVALID_VALUE" }] } } },
      });
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(act({ intent: "running", running: "on" }, admin)).resolves.toEqual({ ok: true });

      expect((await merchantOf(conn)).running).toBe(true);
      expect(errors.mock.calls.map((args) => args.join(" "))).toEqual([expect.stringContaining("INVALID_VALUE")]);
      errors.mockRestore();
    });
  });

  describe("the base rate", () => {
    it("creates the lowest tier, Everyone with minimum 0, places the buyers and tells the widget", async () => {
      const conn = await seedShop();
      // A buyer the import brought in before there were tiers
      const buyer = await seedBuyer(conn, "7001");
      const admin = fakeAdmin();

      await expect(act({ intent: "base-rate", percent: "5" }, admin)).resolves.toEqual({ ok: true });
      await flushWaitUntil();

      const tiers = await prisma.tier.findMany({ where: { merchantId: conn.merchantId } });
      expect(tiers.map((t) => ({ name: t.name, minSpend: t.minSpend.toString(), percent: t.cashbackPercent.toString() }))).toEqual([
        { name: "Everyone", minSpend: "0", percent: "5" },
      ]);
      expect((await prisma.customer.findUniqueOrThrow({ where: { id: buyer.id } })).tierId).toBe(tiers[0].id);
      expect(widgetConfigs(admin).map((c) => c.value)).toEqual([{ running: false, basePercent: 5 }]);
    });

    it("changes the lowest tier's rate when there is one, and makes no second tier", async () => {
      const conn = await seedShop();
      await seedTier(conn, "Gold", "500", "10", 0);
      const lowest = await seedTier(conn, "Bronze", "0", "3", 1);

      await expect(act({ intent: "base-rate", percent: "4" })).resolves.toEqual({ ok: true });

      const tiers = await prisma.tier.findMany({ where: { merchantId: conn.merchantId }, orderBy: { minSpend: "asc" } });
      expect(tiers.map((t) => [t.id, t.name, t.cashbackPercent.toString()])).toEqual([
        [lowest.id, "Bronze", "4"],
        [expect.any(String), "Gold", "10"],
      ]);
    });

    it("refuses a rate that isn't a whole percent from 0 to 100", async () => {
      const conn = await seedShop();
      for (const percent of ["4.5", "101", "-1", "", "five"]) {
        await expect(act({ intent: "base-rate", percent })).resolves.toEqual({ ok: false, error: "Enter a whole number from 0 to 100." });
      }
      await expect(prisma.tier.count({ where: { merchantId: conn.merchantId } })).resolves.toBe(0);
    });
  });

  it("shows the past-orders import's progress and how many buyers it placed", async () => {
    const conn = await seedShop();
    const everyone = await seedTier(conn, "Everyone", "0", "5", 0);
    const placed = await seedBuyer(conn, "7001", everyone.id);
    await seedOrder(conn, placed.id, { orderedAt: new Date("2026-09-01T09:00:00Z"), source: "import" });
    // An imported buyer the tier pass hasn't reached, and a live buyer
    const waiting = await seedBuyer(conn, "7002");
    await seedOrder(conn, waiting.id, { orderedAt: new Date("2026-09-02T09:00:00Z"), source: "import" });
    const live = await seedBuyer(conn, "7003", everyone.id);
    await seedOrder(conn, live.id, { orderedAt: new Date("2026-11-02T09:00:00Z") });
    // An imported buyer since erased by customers/redact (TRUTH-9)
    const erased = await seedBuyer(conn, "7004", everyone.id);
    await seedOrder(conn, erased.id, { orderedAt: new Date("2026-09-03T09:00:00Z"), source: "import" });
    await prisma.customer.update({ where: { id: erased.id }, data: { externalCustomerId: null } });
    await prisma.connection.update({
      where: { id: conn.connectionId },
      data: { importState: "done", importedCount: 2, importError: "1 of 3 past orders could not be read, so their spend is not counted: #1" },
    });

    const data = await load();

    expect(data.setup).toMatchObject({
      importState: "done",
      placedBuyers: 1,
      importError: "1 of 3 past orders could not be read, so their spend is not counted: #1",
      importDismissed: false,
    });
  });

  it("keeps the import's outcome until the merchant dismisses it, and takes a dismissal only once the import has ended", async () => {
    const conn = await seedShop();
    const importDismissedAt = async () =>
      (await prisma.connection.findUniqueOrThrow({ where: { id: conn.connectionId } })).importDismissedAt;
    await prisma.connection.update({ where: { id: conn.connectionId }, data: { importState: "running", importOperationId: null } });

    // While it runs there is no outcome to dismiss
    await expect(act({ intent: "import-dismissed" })).resolves.toEqual({ ok: true });
    expect(await importDismissedAt()).toBeNull();

    await prisma.connection.update({
      where: { id: conn.connectionId },
      data: { importState: "done", importError: "1 of 3 past orders could not be read, so their spend is not counted: #1" },
    });
    expect((await load()).setup.importDismissed).toBe(false);

    await expect(act({ intent: "import-dismissed" })).resolves.toEqual({ ok: true });
    const first = await importDismissedAt();
    expect(first).toBeInstanceOf(Date);
    expect((await load()).setup).toMatchObject({ importState: "done", importDismissed: true });

    // A second dismissal keeps the first time
    await act({ intent: "import-dismissed" });
    expect(await importDismissedAt()).toEqual(first);
  });
});
