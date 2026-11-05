import { Prisma, type LedgerEntryKind, type LookReason, type PayoutDirection, type PayoutState } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { homeBanners, importOutcomeLines } from "~/admin/home-rules";
import { type ConnectionContext, ensureMerchant, findConnection } from "~/lib/merchant.server";
import { customerRows, homeState, homeStats, orderRows } from "~/lib/stats.server";
import { monitoring } from "~/lib/telemetry.server";
import { flushWaitUntil } from "~/lib/wait-until.server";
import type { GraphqlClient } from "~/shopify/graphql";
import { syncWidgetConfig } from "~/shopify/widget-config.server";
import { failNextCall, hasTestDatabase, resetDatabase, restoreFailedCalls } from "./helpers/database";

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
  const result = await route.action({ request, params: {}, context: {} } as never);
  // A 400 comes back wrapped by data()
  if (result && typeof result === "object" && "type" in result && (result as { type: string }).type === "DataWithResponseInit") {
    const wrapped = result as unknown as { data: { ok: boolean; error?: string }; init: { status?: number } };
    return { ...wrapped.data, status: wrapped.init.status };
  }
  return result as { ok: boolean; error?: string; status?: number };
}

async function seedShop(shop = SHOP): Promise<ConnectionContext> {
  await ensureMerchant({ shop, name: "Home Test", currency: "GBP", timezone: TZ, now: INSTALLED });
  return (await findConnection(shop))!;
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

/** What the connection records of the widget's last write. */
const widgetRecord = (conn: ConnectionContext) =>
  prisma.connection.findUniqueOrThrow({
    where: { id: conn.connectionId },
    select: { widgetConfigSyncedAt: true, widgetConfigValue: true, widgetConfigFailedAt: true, widgetConfigTriedAt: true },
  });

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

  // OPERATIONS-10: one merchant never reads another's numbers
  it("gives a store the same numbers, state and lists whatever a second store holds", async () => {
    /**
     * Something of everything Home, Customers and Orders read, this month:
     * tier members, a buyer who earned in October and came back with store
     * credit, a take-back, a credit that needs a look, an imported order and
     * an open data request. Both stores' buyers share Shopify ids.
     */
    const seedBusyStore = async (conn: ConnectionContext) => {
      const everyone = await seedTier(conn, "Everyone", "0", "5", 0);
      const gold = await seedTier(conn, "Gold", "500", "10", 1);
      const ann = await seedBuyer(conn, "7001", everyone.id);
      const bo = await seedBuyer(conn, "7002", gold.id);
      const october = await seedOrder(conn, ann.id, { orderedAt: new Date("2026-10-05T09:00:00Z") });
      await seedPayout(conn, await seedEntry(conn, { customerId: ann.id, orderId: october.id, kind: "cashback", amount: "2.00", createdAt: new Date("2026-10-05T09:00:00Z") }), "sent");
      await seedOrder(conn, ann.id, { orderedAt: new Date("2026-11-03T09:00:00Z"), creditUsed: "4.00" });
      const back = await seedEntry(conn, { customerId: ann.id, orderId: october.id, kind: "reversal", amount: "-0.50", createdAt: new Date("2026-11-04T09:00:00Z") });
      await seedPayout(conn, back, "sent", { direction: "debit", debitedAmount: "0.50" });
      const stuck = await seedOrder(conn, bo.id, { orderedAt: new Date("2026-11-06T09:00:00Z") });
      await seedPayout(conn, await seedEntry(conn, { customerId: bo.id, orderId: stuck.id, kind: "cashback", amount: "3.00", createdAt: new Date("2026-11-06T09:00:00Z") }), "needs_look");
      await seedOrder(conn, bo.id, { orderedAt: new Date("2026-09-01T09:00:00Z"), source: "import" });
      await prisma.privacyRequest.create({
        data: {
          merchantId: conn.merchantId,
          connectionId: conn.connectionId,
          externalCustomerId: "7001",
          shopifyRequestId: "1",
          ordersRequested: [],
          status: "open",
          receivedAt: new Date("2026-11-10T10:00:00Z"),
          dueAt: new Date("2026-12-10T10:00:00Z"),
          expiresAt: new Date("2026-12-25T10:00:00Z"),
        },
      });
    };
    // Everything the pages read for a store, as plain data
    const pagesOf = async (conn: ConnectionContext) =>
      JSON.parse(
        JSON.stringify({
          stats: await homeStats(conn, NOW),
          state: await homeState(conn, NOW),
          customers: await customerRows(conn, { page: 1, now: NOW }),
          orders: await orderRows(conn, { page: 1 }),
          needsALook: await orderRows(conn, { page: 1, needsLook: true }),
        }),
      ) as Record<string, unknown>;

    const conn = await seedShop();
    await seedBusyStore(conn);
    const alone = await pagesOf(conn);
    const other = await seedShop("home-test-other.myshopify.com");
    await seedBusyStore(other);

    expect(await pagesOf(conn)).toEqual(alone);
    // The second store's rows are there, in the same windows, to be miscounted
    const otherStats = await homeStats(other, NOW);
    expect([otherStats.cashbackGiven.toFixed(2), otherStats.creditSpent.toFixed(2), otherStats.cameBack, otherStats.needsLook]).toEqual(["2.50", "4.00", 1, 1]);
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
        { orderId: order.id, orderName: order.name, buyer: "Sam K.", tierName: "Gold", ratePercent: "5", amount: "£3.00", status: "Needs a look", tone: "warning", detail: null },
        { orderId: order.id, orderName: order.name, buyer: "Sam K.", tierName: "Everyone", ratePercent: "5", amount: "£4.00", status: "Waiting", tone: "info", detail: null },
        { orderId: order.id, orderName: order.name, buyer: "Sam K.", tierName: "Everyone", ratePercent: "5", amount: "-£1.00", status: "Needs a look", tone: "warning", detail: null },
        { orderId: order.id, orderName: order.name, buyer: "Sam K.", tierName: "Everyone", ratePercent: "5", amount: "£2.50", status: "Issued", tone: "success", detail: null },
        { orderId: second.id, orderName: second.name, buyer: "Sam K.", tierName: "Everyone", ratePercent: "5", amount: "£1.00", status: "Needs a look", tone: "warning", detail: null },
      ]);
      expect(data.stats.tiers).toEqual([
        { id: everyone.id, name: "Everyone", percent: "5", members: 2 },
        { id: gold.id, name: "Gold", percent: "10", members: 1 },
      ]);
      // Ruling 56: three payouts need a look, on two orders, as the Orders page counts them
      expect(data.bannerFacts.needsLook).toBe(2);
      expect(homeBanners(data.bannerFacts, true).map((b) => b.text)).toEqual(["2 orders need a look."]);
      // DESIGN-12: two orders, so the banner opens Orders showing only those
      expect(data.bannerFacts.needsLookOrderId).toBeNull();
    });

    // DESIGN-12: with one order that needs a look, the banner goes straight to it
    it("names the order that needs a look when there is only one", async () => {
      const conn = await seedShop();
      const buyer = await seedBuyer(conn, "7001");
      const order = await seedOrder(conn, buyer.id, { orderedAt: new Date("2026-11-02T09:00:00Z") });
      // Two payouts of one order need a look: still one order
      const credit = await seedEntry(conn, { customerId: buyer.id, orderId: order.id, kind: "cashback", amount: "2.00", createdAt: new Date("2026-11-02T09:00:00Z") });
      await seedPayout(conn, credit, "needs_look");
      const back = await seedEntry(conn, { customerId: buyer.id, orderId: order.id, kind: "reversal", amount: "-1.00", createdAt: new Date("2026-11-03T09:00:00Z") });
      await seedPayout(conn, back, "needs_look", { direction: "debit", lookReason: "could_not_confirm" });

      const data = await load();

      expect(data.bannerFacts).toMatchObject({ needsLook: 1, needsLookOrderId: order.id });
      expect(homeBanners(data.bannerFacts, true)[0].link).toEqual({ label: "Open the order", href: `/app/orders/${order.id}` });
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

    // OPERATIONS-2: the cashback entries are read only while the request can still be due
    it("reads the cashback entries only until the request was shown or dismissed", async () => {
      const conn = await seedShop();
      await sevenDaysOld(conn);
      await seedCashbackEntries(conn, 3);
      const read = new Error("homeState read the ledger");
      const withLedgerRefused = async () => {
        failNextCall("ledgerEntry", "findMany", read);
        try {
          return await homeState(conn, new Date()).catch((error: unknown) => error);
        } finally {
          restoreFailedCalls();
        }
      };

      await expect(withLedgerRefused()).resolves.toBe(read);

      for (const field of ["reviewPromptShownAt", "reviewPromptDismissedAt"] as const) {
        await prisma.merchant.update({ where: { id: conn.merchantId }, data: { reviewPromptShownAt: null, reviewPromptDismissedAt: null, [field]: new Date() } });
        await expect(withLedgerRefused(), field).resolves.toMatchObject({ reviewDue: false });
      }
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
    expect(banners[2].link).toEqual({ label: "Open orders", href: "/app/orders?look=1" });
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
      // What the nightly step reads: the last value written, and when (OPERATIONS-4)
      await expect(widgetRecord(conn)).resolves.toMatchObject({
        widgetConfigSyncedAt: expect.any(Date),
        widgetConfigValue: JSON.stringify({ running: false, basePercent: 5.5 }),
      });
    });

    // OPERATIONS-4: two writes in flight together may reach Shopify in either order
    it("records no time for a write another write of the store finished during, so the nightly step rewrites it", async () => {
      const conn = await seedShop();
      await seedTier(conn, "Everyone", "0", "5", 0);
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const slow = fakeAdmin();
      const ask = slow.graphql.bind(slow);
      slow.graphql = async (query, options) => {
        if (query.includes("mutation RewardsWidgetConfig")) await held;
        return ask(query, options);
      };

      const first = syncWidgetConfig(slow, conn);
      await syncWidgetConfig(fakeAdmin(), conn);
      await expect(widgetRecord(conn)).resolves.toMatchObject({ widgetConfigSyncedAt: expect.any(Date) });
      release();
      await first;

      await expect(widgetRecord(conn)).resolves.toMatchObject({ widgetConfigSyncedAt: null, widgetConfigValue: JSON.stringify({ running: false, basePercent: 5 }) });
      // A write on its own is recorded again
      await syncWidgetConfig(fakeAdmin(), conn);
      await expect(widgetRecord(conn)).resolves.toMatchObject({ widgetConfigSyncedAt: expect.any(Date) });
    });

    // M3e-F1: a write that started before a failure can't say Shopify holds its value
    it("records no value for a write a failure of the store came after the start of", async () => {
      const conn = await seedShop();
      await seedTier(conn, "Everyone", "0", "5", 0);
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const slow = fakeAdmin();
      const ask = slow.graphql.bind(slow);
      slow.graphql = async (query, options) => {
        if (query.includes("mutation RewardsWidgetConfig")) await held;
        return ask(query, options);
      };
      const refused = { data: { metafieldsSet: { metafields: [], userErrors: [{ field: ["metafields"], message: "Try again", code: "INTERNAL_ERROR" }] } } };

      const first = syncWidgetConfig(slow, conn);
      // Started after the held write, and failed while it was still in flight
      await expect(syncWidgetConfig(fakeAdmin({ RewardsWidgetConfig: refused }), conn)).rejects.toThrow(/refused/);
      const failed = await widgetRecord(conn);
      expect(failed).toMatchObject({ widgetConfigSyncedAt: null, widgetConfigFailedAt: expect.any(Date), widgetConfigTriedAt: expect.any(Date) });
      release();
      await first;

      // Shopify may hold either value: nothing is recorded as current
      await expect(widgetRecord(conn)).resolves.toMatchObject({ widgetConfigSyncedAt: null, widgetConfigFailedAt: failed.widgetConfigFailedAt });
      // A write started after the failure is recorded
      await syncWidgetConfig(fakeAdmin(), conn);
      await expect(widgetRecord(conn)).resolves.toMatchObject({ widgetConfigSyncedAt: expect.any(Date), widgetConfigValue: JSON.stringify({ running: false, basePercent: 5 }) });
    });

    // M3e-F3: a record that can't be written is traced to its store
    it("names the store's connection when the record of a write can't be kept", async () => {
      const conn = await seedShop();
      await seedTier(conn, "Everyone", "0", "5", 0);
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      // vi.spyOn's restore would leave the model method undefined, so it is patched by hand
      const delegate = prisma.connection as unknown as Record<string, (args: { data: object }) => Promise<unknown>>;
      const updateMany = delegate.updateMany;
      delegate.updateMany = async (args) => ("widgetConfigValue" in args.data ? Promise.reject(new Error("Connection reset")) : updateMany(args));
      try {
        await syncWidgetConfig(fakeAdmin(), conn);
      } finally {
        delegate.updateMany = updateMany;
      }

      expect(errors.mock.calls.map((args) => args.join(" "))).toEqual([`[widget] Could not record a widget write for connection ${conn.connectionId}: Connection reset`]);
      errors.mockRestore();
    });

    // BOUNDARY-6: only on or off moves the switch
    it("answers 400 to a switch post that says neither on nor off, and changes nothing", async () => {
      const conn = await seedShop();
      await seedTier(conn, "Everyone", "0", "5", 0);
      await expect(act({ intent: "running", running: "on" })).resolves.toEqual({ ok: true });
      const admin = fakeAdmin();

      for (const fields of [{ intent: "running", running: "true" }, { intent: "running", running: "" }, { intent: "running" }] as Record<string, string>[]) {
        await expect(act(fields, admin), JSON.stringify(fields)).resolves.toEqual({ ok: false, error: "Unknown action.", status: 400 });
      }
      expect((await merchantOf(conn)).running).toBe(true);
      expect(widgetConfigs(admin)).toEqual([]);
    });

    // A19-F5: the widget is told the newest state, read right before the write
    it("tells the widget the state as it is when the write goes out", async () => {
      const conn = await seedShop();
      await seedTier(conn, "Everyone", "0", "5", 0);
      const admin = fakeAdmin();
      const ask = admin.graphql.bind(admin);
      // Another tab switches cashback off while this one is reading the installation
      admin.graphql = async (query, options) => {
        if (query.includes("RewardsAppInstallation")) await prisma.merchant.update({ where: { id: conn.merchantId }, data: { running: false } });
        return ask(query, options);
      };

      await expect(act({ intent: "running", running: "on" }, admin)).resolves.toEqual({ ok: true });

      expect(widgetConfigs(admin).map((config) => config.value)).toEqual([{ running: false, basePercent: 5 }]);
    });

    it("keeps the switch when the widget can't be told, and says why in the log", async () => {
      const conn = await seedShop();
      await seedTier(conn, "Everyone", "0", "5", 0);
      const admin = fakeAdmin({
        RewardsWidgetConfig: { data: { metafieldsSet: { metafields: [], userErrors: [{ field: ["metafields", "0", "value"], message: "Value is invalid", code: "INVALID_VALUE" }] } } },
      });
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});

      await prisma.connection.update({ where: { id: conn.connectionId }, data: { widgetConfigSyncedAt: new Date(), widgetConfigValue: "{}" } });

      await expect(act({ intent: "running", running: "on" }, admin)).resolves.toEqual({ ok: true });

      expect((await merchantOf(conn)).running).toBe(true);
      expect(errors.mock.calls.map((args) => args.join(" "))).toEqual([expect.stringContaining("INVALID_VALUE")]);
      // Shopify may hold either value now: the nightly step visits it first (OPERATIONS-4)
      expect((await widgetRecord(conn)).widgetConfigSyncedAt).toBeNull();
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

  // Ruling 76 (TRUTH-2): the buyers it brought in, whatever their tier; Ruling 74: never the raw error
  it("counts the orders and buyers the past-orders import brought in, and never sends its raw error to the page", async () => {
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

    expect(data.setup).toEqual({
      completed: false,
      importState: "done",
      importDismissed: false,
      importHorizonDays: 365,
      // The erased buyer's order was brought in too; the buyers are the two still someone
      importedOrders: 3,
      importedBuyers: 2,
      unreadable: true,
      placing: false,
    });
    expect(JSON.stringify(data)).not.toContain("could not be read");
    expect(importOutcomeLines({ ...data.setup, state: "done", hasTiers: true })).toEqual([
      "Brought in 3 of your past orders; the rest couldn't be read.",
      "Done: 2 buyers placed in tiers",
    ]);
  });

  it("names the buyers an import done with no tiers brought in, and counts them placed once the base rate's pass has run", async () => {
    const conn = await seedShop();
    for (const externalId of ["7001", "7002"]) {
      const buyer = await seedBuyer(conn, externalId);
      await seedOrder(conn, buyer.id, { orderedAt: new Date("2026-09-01T09:00:00Z"), source: "import" });
    }
    await prisma.connection.update({ where: { id: conn.connectionId }, data: { importState: "done", importedCount: 2 } });
    const outcome = (data: Awaited<ReturnType<typeof load>>) =>
      importOutcomeLines({ ...data.setup, state: "done", hasTiers: data.stats.tiers.length > 0 });

    const before = await load();
    expect(before.setup).toMatchObject({ importedBuyers: 2, placing: false });
    expect(outcome(before)).toEqual(["Brought in 2 buyers' past orders. They're placed in tiers when you save your base rate."]);

    await expect(act({ intent: "base-rate", percent: "5" })).resolves.toEqual({ ok: true });
    await flushWaitUntil();

    const after = await load();
    expect(after.setup).toMatchObject({ importedBuyers: 2, placing: false });
    expect(outcome(after)).toEqual(["Done: 2 buyers placed in tiers"]);
    const [everyone] = await prisma.tier.findMany({ where: { merchantId: conn.merchantId } });
    expect(await prisma.customer.count({ where: { connectionId: conn.connectionId, tierId: everyone.id } })).toBe(2);
  });

  it("says the buyers are being placed while a requested pass hasn't reached them", async () => {
    const conn = await seedShop();
    await seedTier(conn, "Everyone", "0", "5", 0);
    const buyer = await seedBuyer(conn, "7001");
    await seedOrder(conn, buyer.id, { orderedAt: new Date("2026-09-01T09:00:00Z"), source: "import" });
    // A pass asked for after the buyer was seen, not yet run
    await prisma.connection.update({ where: { id: conn.connectionId }, data: { importState: "done", tierPassRequestedAt: new Date(Date.now() + DAY) } });

    const data = await load();

    expect(data.setup.placing).toBe(true);
    expect(importOutcomeLines({ ...data.setup, state: "done", hasTiers: true })).toEqual(["Brought in 1 buyer's past orders. They're being placed in tiers."]);
  });

  // Ruling 74 (BOUNDARY-4, TRUTH-12)
  it("gives a failed import a plain sentence with what it brought in, and keeps its error off the page", async () => {
    const conn = await seedShop();
    const buyer = await seedBuyer(conn, "7001");
    await seedOrder(conn, buyer.id, { orderedAt: new Date("2026-09-01T09:00:00Z"), source: "import" });
    const raw = "HttpResponseError: Received an error response (502 Bad Gateway) from Shopify: please include this id: 7c1e";
    await prisma.connection.update({ where: { id: conn.connectionId }, data: { importState: "failed", importError: raw } });

    const data = await load();

    expect(JSON.stringify(data)).not.toContain("7c1e");
    expect(data.setup).toMatchObject({ importState: "failed", importedOrders: 1, unreadable: false });
    expect(importOutcomeLines({ ...data.setup, state: "failed", hasTiers: false })).toEqual([
      "Brought in 1 of your past orders; the rest couldn't be read.",
    ]);
    // The error stays where support reads it
    expect((await prisma.connection.findUniqueOrThrow({ where: { id: conn.connectionId } })).importError).toBe(raw);
  });

  // Ruling 60
  describe("setup completed", () => {
    it("is recorded once a tier exists and cashback is on, and keeps its first time", async () => {
      const conn = await seedShop();
      const completedAt = async () => (await merchantOf(conn)).setupCompletedAt;

      // No tier, then a tier with cashback off: nothing to record
      await expect(act({ intent: "setup-done" })).resolves.toEqual({ ok: true });
      expect(await completedAt()).toBeNull();
      await seedTier(conn, "Everyone", "0", "5", 0);
      await expect(act({ intent: "setup-done" })).resolves.toEqual({ ok: true });
      expect(await completedAt()).toBeNull();
      expect((await load()).setup.completed).toBe(false);

      await act({ intent: "running", running: "on" });
      await expect(act({ intent: "setup-done" })).resolves.toEqual({ ok: true });
      const first = await completedAt();
      expect(first).toBeInstanceOf(Date);
      expect((await load()).setup.completed).toBe(true);

      // A pause later leaves setup completed, and a second post keeps the first time
      await act({ intent: "running", running: "off" });
      await act({ intent: "running", running: "on" });
      await act({ intent: "setup-done" });
      expect(await completedAt()).toEqual(first);
      await act({ intent: "running", running: "off" });
      expect((await load()).setup.completed).toBe(true);
    });
  });

  // Ruling 64 (A23-F5): a request past its expiry can't be downloaded, so Home doesn't ask for it
  it("asks for a data request only while it is open and not past its expiry", async () => {
    const conn = await seedShop();
    const expiresAt = new Date("2026-12-20T10:00:00Z");
    await prisma.privacyRequest.create({
      data: {
        merchantId: conn.merchantId,
        connectionId: conn.connectionId,
        externalCustomerId: "7001",
        shopifyRequestId: "1",
        ordersRequested: [],
        status: "open",
        receivedAt: new Date("2026-11-05T10:00:00Z"),
        dueAt: new Date("2026-12-05T10:00:00Z"),
        expiresAt,
      },
    });

    const at = (now: Date) => homeState(conn, now);
    expect((await at(new Date(expiresAt.getTime() - 1))).privacyDueAt).toEqual(new Date("2026-12-05T10:00:00Z"));
    // Not yet marked expired by housekeeping, but past its expiry
    expect((await at(expiresAt)).privacyDueAt).toBeNull();
    expect((await at(new Date(expiresAt.getTime() + DAY))).privacyDueAt).toBeNull();
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
