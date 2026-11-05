import { Prisma } from "@prisma/client";
import { delay, graphql, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { type ConnectionContext, ensureMerchant, findConnection, setRunning } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import { lockTier, resolveTier, tierSpend } from "~/lib/tiers.server";
import { signedProxyRequest } from "../helpers/app-proxy";
import { server } from "../setup";
import { hasTestDatabase, resetDatabase } from "./helpers/database";
import { adminGraphqlUrl, seedOfflineSession } from "./helpers/shopify";

/**
 * The app proxy on Postgres, adapted from apps/rewardspro's
 * app-proxy.integration.test.ts: requests signed as Shopify signs them, the
 * real authenticate.public.appProxy and offline session, the real route
 * (`/apps/rewardspro/membership` reaches `/api/proxy/membership`), and Admin
 * GraphQL answered by MSW by operation name (RewardsCustomerAccounts,
 * RewardsBalance). The old suite's guest, second-copy, own-data and live
 * balance cases are kept; its customer-summary case has no counterpart (only
 * membership is served), and a buyer's email no longer exists to leak.
 */

type Route = typeof import("~/routes/api.proxy.$");

const SHOP = "proxy-test.myshopify.com";
const VICTIM = "9876543210";
const NOW = new Date();
const DAY = 24 * 60 * 60 * 1000;

let route: Route;
let conn: ConnectionContext;
let tiers: { bronze: { id: string }; silver: { id: string }; gold: { id: string } };

const get = (request: Request, path = "membership") => route.loader({ request, params: { "*": path }, context: {} } as never);
const membership = (buyer: string, extra: Array<[string, string]> = []) => get(signedProxyRequest("membership", SHOP, buyer, extra));

const addTier = (name: string, minSpend: string, percent: string, position: number) =>
  prisma.tier.create({
    data: { merchantId: conn.merchantId, name, minSpend: new Prisma.Decimal(minSpend), cashbackPercent: new Prisma.Decimal(percent), position },
    select: { id: true },
  });

/** A running GBP shop with three tiers and its offline session. */
async function seedShop(o: { tiers?: boolean; running?: boolean } = {}) {
  await ensureMerchant({ shop: SHOP, name: "Proxy", currency: "GBP", timezone: "Europe/London", now: new Date(NOW.getTime() - 400 * DAY) });
  const found = await findConnection(SHOP);
  if (!found) throw new Error("no connection");
  conn = found;
  if (o.tiers !== false) {
    tiers = {
      bronze: await addTier("Bronze", "0", "5.00", 0),
      silver: await addTier("Silver", "100", "7.50", 1),
      gold: await addTier("Gold", "500", "10.00", 2),
    };
    if (o.running !== false) expect(await setRunning(conn.merchantId, true)).toEqual({ ok: true });
  }
  await seedOfflineSession(SHOP);
}

const addBuyer = (externalCustomerId: string) =>
  prisma.customer.create({
    data: { merchantId: conn.merchantId, connectionId: conn.connectionId, externalCustomerId, tierId: tiers.bronze.id },
    select: { id: true },
  });

let orderNumber = 0;
/** An order of `shopAmount` of products in GBP, `daysAgo` days ago. */
async function addOrder(customerId: string, shopAmount: string, daysAgo: number, o: { refunded?: string; test?: boolean } = {}) {
  orderNumber++;
  const orderedAt = new Date(NOW.getTime() - daysAgo * DAY);
  await prisma.order.create({
    data: {
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      customerId,
      externalOrderId: `gid://shopify/Order/${8000 + orderNumber}`,
      name: `#${8000 + orderNumber}`,
      source: "live",
      currency: "GBP",
      totalAmount: shopAmount,
      productAmount: shopAmount,
      shopProductAmount: shopAmount,
      storeCreditUsed: "0",
      shopStoreCreditUsed: "0",
      giftCardUsed: "0",
      cashbackBase: shopAmount,
      refundedProductAmount: o.refunded ?? "0",
      shopRefundedProductAmount: o.refunded ?? "0",
      orderedAt,
      paidAt: orderedAt,
      test: o.test ?? false,
    },
  });
}

type Balance = { amount: string; currencyCode: string };

/**
 * Answer the shop's customer accounts version and the buyers' balances
 * (customer id → accounts). `balanceDelay` holds back the balance answer
 * ("infinite": never). Returns how many balance reads Shopify got.
 */
function answerShopify(accounts: Record<string, Balance[]>, o: { version?: string; balanceDelay?: number | "infinite" } = {}) {
  const reads = { balance: 0, accounts: 0 };
  const link = graphql.link(adminGraphqlUrl(SHOP));
  server.use(
    link.query("RewardsCustomerAccounts", () => {
      reads.accounts++;
      return HttpResponse.json({
        data: { shop: { customerAccountsV2: { customerAccountsVersion: o.version ?? "NEW_CUSTOMER_ACCOUNTS", loginLinksVisibleOnStorefrontAndCheckout: true } } },
      });
    }),
    link.query("RewardsBalance", async ({ variables }) => {
      reads.balance++;
      if (o.balanceDelay !== undefined) await delay(o.balanceDelay);
      const id = String(variables.customerId).split("/").pop()!;
      const nodes = (accounts[id] ?? []).map((balance) => ({ balance }));
      return HttpResponse.json({ data: { customer: { storeCreditAccounts: { nodes, pageInfo: { hasNextPage: false } } } } });
    }),
  );
  return reads;
}

const THEME = {
  mode: "LIGHT",
  primaryColor: "#FFD700",
  backgroundColor: "#1a1a2e",
  textColor: "#FFFFFF",
  accentColor: "#008060",
  borderRadius: 12,
  fontFamily: "inherit",
  secondaryTextColor: null,
};

async function rowCounts() {
  const [customers, orders, ledger, payouts, tierRows, merchants, connections] = await Promise.all([
    prisma.customer.count(),
    prisma.order.count(),
    prisma.ledgerEntry.count(),
    prisma.payout.count(),
    prisma.tier.count(),
    prisma.merchant.count(),
    prisma.connection.count(),
  ]);
  return { customers, orders, ledger, payouts, tierRows, merchants, connections };
}

// Every test asks as a buyer of its own: the proxy rate-limits per buyer and
// keeps each balance and the shop's accounts version for a while.
let buyerNumber = 100;
const freshBuyer = () => String(++buyerNumber);

describe.skipIf(!hasTestDatabase)("app proxy on Postgres", () => {
  beforeAll(async () => {
    // ~/shopify.server builds its session storage at import, which checks the
    // Session table at once, so the route is imported only with a test
    // database. The library logs its version, and each proxy request.
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.SHOPIFY_API_KEY = "test-api-key";
    route = await import("~/routes/api.proxy.$");
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    delete process.env.SHOPIFY_API_KEY;
    vi.restoreAllMocks();
    await prisma.$disconnect();
  });

  it("a signed-in buyer gets their tier, live balance, progress, settings and the released widget's theme", async () => {
    await seedShop();
    const buyer = freshBuyer();
    const { id } = await addBuyer(buyer);
    await addOrder(id, "150.00", 10);
    await resolveTier(id);
    answerShopify({ [buyer]: [{ amount: "12.50", currencyCode: "GBP" }] });

    const response = await membership(buyer);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=30");
    expect(await response.json()).toEqual({
      success: true,
      membership: { tier: { id: tiers.silver.id, name: "Silver", cashbackPercent: 7.5 }, tierSource: "SPENDING_BASED", configured: true },
      balance: { storeCredit: 12.5, currency: "GBP" },
      tierProgress: {
        progressPercent: 12,
        nextTierName: "Gold",
        nextTierCashbackPercent: 10,
        isMaxTier: false,
        amountRemaining: 350,
        nextTierTarget: 500,
        currentSpending: 150,
      },
      settings: { currency: "GBP", customerAccountsVersion: "NEW_CUSTOMER_ACCOUNTS" },
      theme: THEME,
      running: true,
    });
  });

  // Review Focus 1: the released widget appends its own shop and
  // logged_in_customer_id, which the library alone refuses
  it("repeated parameters: the released widget's own shop and logged_in_customer_id get that buyer's membership", async () => {
    await seedShop();
    const buyer = freshBuyer();
    await addBuyer(buyer);
    answerShopify({ [buyer]: [{ amount: "3.00", currencyCode: "GBP" }] });

    const response = await membership(buyer, [
      ["logged_in_customer_id", buyer],
      ["shop", SHOP],
    ]);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      membership: { tier: { name: "Bronze" } },
      balance: { storeCredit: 3, currency: "GBP" },
    });
  });

  it("repeated parameters: differing logged_in_customer_id gets the guest answer", async () => {
    await seedShop();
    const buyer = freshBuyer();
    await addBuyer(VICTIM);
    const response = await membership(buyer, [
      ["logged_in_customer_id", VICTIM],
      ["shop", SHOP],
    ]);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: false, requiresLogin: true, message: "Sign in to see your rewards", running: true });
  });

  it("a guest gets no personal data whatever id is added", async () => {
    await seedShop();
    const { id } = await addBuyer(VICTIM);
    await addOrder(id, "600.00", 5);
    await resolveTier(id);
    // No Shopify answers: a guest's request must not ask Shopify anything

    for (const extra of [
      [["customer_id", VICTIM], ["customerId", VICTIM], ["cid", VICTIM]],
      // A second, visitor-supplied copy beside Shopify's empty one
      [["logged_in_customer_id", VICTIM]],
    ] as Array<Array<[string, string]>>) {
      const response = await membership("", extra);

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(JSON.parse(body)).toEqual({ success: false, requiresLogin: true, message: "Sign in to see your rewards", running: true });
      expect(body).not.toContain(VICTIM);
      expect(body).not.toContain("Gold");
    }
  });

  it("an unseen buyer sees the lowest tier and nothing is written", async () => {
    await seedShop();
    const buyer = freshBuyer();
    answerShopify({});
    const before = await rowCounts();

    const response = await membership(buyer);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      membership: { tier: { id: tiers.bronze.id, name: "Bronze", cashbackPercent: 5 }, tierSource: "SPENDING_BASED", configured: true },
      // Shopify says the buyer has no credit
      balance: { storeCredit: 0, currency: "GBP" },
      tierProgress: { progressPercent: 0, nextTierName: "Silver", nextTierCashbackPercent: 7.5, isMaxTier: false, amountRemaining: 100, nextTierTarget: 100, currentSpending: 0 },
    });
    await expect(rowCounts()).resolves.toEqual(before);
    await expect(prisma.customer.count({ where: { externalCustomerId: buyer } })).resolves.toBe(0);
  });

  it("progress equals tier spend", async () => {
    await seedShop();
    const buyer = freshBuyer();
    const { id } = await addBuyer(buyer);
    // Spend is rule 10's: refunds come off, test orders and orders outside
    // the 12 months count nowhere
    await addOrder(id, "300.00", 30);
    await addOrder(id, "80.00", 60, { refunded: "30.00" });
    await addOrder(id, "1000.00", 20, { test: true });
    await addOrder(id, "1000.00", 400);
    await resolveTier(id);
    answerShopify({});

    const spend = await tierSpend(id, "rolling_12_months", new Date());
    expect(spend.toFixed(2)).toBe("350.00");
    const body = await (await membership(buyer)).json();

    expect(body.membership.tier.name).toBe("Silver");
    expect(body.tierProgress).toEqual({
      currentSpending: spend.toNumber(),
      // (350 − 100) × 100 ÷ (500 − 100), floored
      progressPercent: 62,
      nextTierName: "Gold",
      nextTierCashbackPercent: 10,
      isMaxTier: false,
      amountRemaining: new Money(500).minus(spend).toNumber(),
      nextTierTarget: 500,
    });

    // At the top tier there is nothing further to reach
    await addOrder(id, "200.00", 1);
    await resolveTier(id);
    const top = await (await membership(buyer)).json();
    expect(top.membership.tier.name).toBe("Gold");
    expect(top.tierProgress).toEqual({
      currentSpending: 550,
      progressPercent: 100,
      nextTierName: null,
      nextTierCashbackPercent: null,
      isMaxTier: true,
      amountRemaining: 0,
      nextTierTarget: null,
    });
  });

  it("a tier the merchant locked the buyer to is shown as set by hand", async () => {
    await seedShop();
    const buyer = freshBuyer();
    const { id } = await addBuyer(buyer);
    expect(await lockTier(conn.merchantId, id, tiers.gold.id)).toEqual({ ok: true });
    answerShopify({});

    const body = await (await membership(buyer)).json();

    expect(body.membership).toEqual({ tier: { id: tiers.gold.id, name: "Gold", cashbackPercent: 10 }, tierSource: "MANUAL_OVERRIDE", configured: true });
    expect(body.tierProgress).toMatchObject({ isMaxTier: true, currentSpending: 0 });
  });

  it("?currency= picks which of the buyer's own balances to show", async () => {
    await seedShop();
    const buyer = freshBuyer();
    await addBuyer(buyer);
    answerShopify({
      [buyer]: [
        { amount: "4.00", currencyCode: "GBP" },
        { amount: "6.50", currencyCode: "EUR" },
      ],
    });

    const eur = await (await membership(buyer, [["currency", "EUR"]])).json();
    expect(eur.balance).toEqual({ storeCredit: 6.5, currency: "EUR" });
    // Tier amounts stay in the shop's currency
    expect(eur.settings.currency).toBe("GBP");
    const usd = await (await membership(buyer, [["currency", "USD"]])).json();
    // Only EUR credit beside the GBP: none to show in USD, but not 0 either
    expect(usd.balance).toEqual({ storeCredit: null, currency: "USD" });
    // Not three letters: the shop's currency
    const odd = await (await membership(buyer, [["currency", "EURO"]])).json();
    expect(odd.balance).toEqual({ storeCredit: 4, currency: "GBP" });
  });

  it("a shop with no connection or no tiers gets 'Rewards are not set up yet'", async () => {
    const notSetUp = { success: false, message: "Rewards are not set up yet" };
    // Never installed
    await expect((await membership(freshBuyer())).json()).resolves.toEqual(notSetUp);

    await seedShop({ tiers: false });
    const buyer = freshBuyer();
    await expect((await membership(buyer)).json()).resolves.toEqual(notSetUp);
    await expect((await membership("")).json()).resolves.toEqual(notSetUp);
    await expect(prisma.customer.count()).resolves.toBe(0);

    // Uninstalled
    await prisma.connection.update({ where: { id: conn.connectionId }, data: { status: "uninstalled" } });
    await expect((await membership(freshBuyer())).json()).resolves.toEqual(notSetUp);
  });

  it("a shop with cashback switched off says so", async () => {
    await seedShop({ running: false });
    const buyer = freshBuyer();
    answerShopify({});

    await expect((await membership(buyer)).json()).resolves.toMatchObject({ success: true, running: false });
    await expect((await membership("")).json()).resolves.toMatchObject({ requiresLogin: true, running: false });
  });

  it("only membership is served; any other path is 404", async () => {
    await seedShop();
    const buyer = freshBuyer();
    for (const path of ["test", "customer-summary", "raffles", "membership/extra", ""]) {
      const response = await get(signedProxyRequest(path, SHOP, buyer), path);
      expect(response.status).toBe(404);
    }
  });

  it("refuses an unsigned request", async () => {
    await seedShop();
    const request = new Request(`https://test.example.com/api/proxy/membership?shop=${SHOP}&logged_in_customer_id=${VICTIM}`);
    const response = await get(request);

    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(VICTIM);
  });

  it("the 31st request in a minute from one buyer gets 429", async () => {
    await seedShop();
    const buyer = freshBuyer();
    answerShopify({});

    for (let i = 0; i < 30; i++) expect((await membership(buyer)).status).toBe(200);
    const limited = await membership(buyer);

    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);
    // Another buyer is still served
    expect((await membership(freshBuyer())).status).toBe(200);
  });

  // Last: after an unanswered read the balance gives way at this shop for 10 s
  it("balance is null when Shopify takes longer than 2.5 s", async () => {
    await seedShop();
    const buyer = freshBuyer();
    await addBuyer(buyer);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const reads = answerShopify({ [buyer]: [{ amount: "9.00", currencyCode: "GBP" }] }, { balanceDelay: "infinite" });

    const pending = membership(buyer);
    await vi.waitFor(() => expect(reads.balance).toBe(1), { interval: 5 });
    await vi.advanceTimersByTimeAsync(2499);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const response = await pending;
    vi.useRealTimers();

    expect(response.status).toBe(200);
    const body = await response.json();
    // Unknown, never a stored copy or 0: the widget says the credit shows at checkout
    expect(body.success).toBe(true);
    expect(body.balance).toEqual({ storeCredit: null, currency: "GBP" });
    // Logged by shop, with no buyer id or query string
    expect(warn).toHaveBeenCalledWith(`[live-balance] Could not read a buyer's store credit balance for ${SHOP}:`, "Shopify did not answer within 2.5 s");
  });
});
