import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { guideDue, guideSwitchedOnAt } from "~/lib/guide.server";
import { type ConnectionContext, ensureMerchant, findConnection } from "~/lib/merchant.server";
import { reviewRequestDue } from "~/lib/stats.server";
import { TIER_ERRORS, TIER_NAME_MAX, requestTierPass } from "~/lib/tiers.server";
import { flushWaitUntil } from "~/lib/wait-until.server";
import { pollImport } from "~/shopify/bulk-import.server";
import type { GraphqlClient } from "~/shopify/graphql";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

/**
 * The first-time setup guide's loader and actions (RP-24): which step each
 * store is served, what each step reads, the import followed as Home follows
 * it, and the ladder save, the switch and "Finish later", each followed by
 * the widget's app metafield. The admin session is the library's job
 * (requireMerchant), so it is replaced here by the store's connection and a
 * stand-in Admin API client that answers by operation name, as in the Home
 * and Tiers tests.
 */

vi.mock("~/admin/require-merchant.server", () => ({ requireMerchant: vi.fn() }));
// The real pollImport, watched for the guide's follow of a running import
vi.mock("~/shopify/bulk-import.server", async (original) => {
  const actual = await original<typeof import("~/shopify/bulk-import.server")>();
  return { ...actual, pollImport: vi.fn(actual.pollImport) };
});
// The real guideSwitchedOnAt, watched for step 3's reads (8-F3)
vi.mock("~/lib/guide.server", async (original) => {
  const actual = await original<typeof import("~/lib/guide.server")>();
  return { ...actual, guideSwitchedOnAt: vi.fn(actual.guideSwitchedOnAt) };
});
// The real requestTierPass, watched for one tier pass per saved ladder (8-F4)
vi.mock("~/lib/tiers.server", async (original) => {
  const actual = await original<typeof import("~/lib/tiers.server")>();
  return { ...actual, requestTierPass: vi.fn(actual.requestTierPass) };
});

const SHOP = "welcome-test.myshopify.com";
const INSTALLED = new Date("2026-10-01T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const APP_INSTALLATION = "gid://shopify/AppInstallation/24";
const BASE = "https://test.example.com";

type Call = { operation: string; variables: Record<string, unknown> };

/**
 * An Admin API client that answers the documents the guide sends (the
 * store-credit questions and the widget's two), by operation name, and
 * records each call. `answers` replaces the default answer of an operation;
 * any other operation fails the test.
 */
function fakeAdmin(answers: Record<string, unknown> = {}): GraphqlClient & { calls: Call[] } {
  const calls: Call[] = [];
  const defaults: Record<string, unknown> = {
    RewardsCustomerAccounts: { data: { shop: { customerAccountsV2: { customerAccountsVersion: "NEW_CUSTOMER_ACCOUNTS", loginLinksVisibleOnStorefrontAndCheckout: true } } } },
    RewardsStoreCreditConfig: { data: { storeCreditConfiguration: { storeCreditEnabled: true } } },
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

/** The widget config each RewardsWidgetConfig call wrote. */
const widgetValues = (admin: { calls: Call[] }) =>
  admin.calls
    .filter((call) => call.operation === "RewardsWidgetConfig")
    .map((call) => JSON.parse((call.variables.metafields as Array<{ value: string }>)[0].value));

type WelcomeRoute = typeof import("~/routes/app.welcome");
let route: WelcomeRoute;
let requireMerchant: ReturnType<typeof vi.fn>;
let conn: ConnectionContext;

/** The guide's loader and action as the signed-in store, through `admin`. */
async function signIn(admin: GraphqlClient) {
  const signedIn = (await findConnection(SHOP))!;
  requireMerchant.mockResolvedValue({ admin, session: { shop: SHOP }, conn: signedIn });
  return signedIn;
}

async function load(path: string, admin: GraphqlClient = fakeAdmin()) {
  await signIn(admin);
  return (await route.loader({ request: new Request(`${BASE}${path}`), params: {}, context: {} } as never)) as Exclude<
    Awaited<ReturnType<WelcomeRoute["loader"]>>,
    Response
  >;
}

type Result = { ok: boolean; error?: string; errors?: { rows: Array<Record<string, string>>; form?: string }; status?: number };

async function act(fields: Record<string, string>, admin: GraphqlClient = fakeAdmin(), url = `${BASE}/app/welcome?step=3`): Promise<Result> {
  await signIn(admin);
  const request = new Request(url, { method: "POST", body: new URLSearchParams(fields) });
  const result = await route.action({ request, params: {}, context: {} } as never);
  // A 4xx comes back wrapped by data()
  if (result && typeof result === "object" && "type" in result && (result as { type: string }).type === "DataWithResponseInit") {
    const wrapped = result as unknown as { data: Result; init: { status?: number } };
    return { ...wrapped.data, status: wrapped.init.status };
  }
  return result as Result;
}

/** Runs the action and returns the redirect it throws. */
async function actExpectingRedirect(fields: Record<string, string>, admin: GraphqlClient, url: string): Promise<Response> {
  try {
    await act(fields, admin, url);
  } catch (thrown) {
    if (thrown instanceof Response) return thrown;
    throw thrown;
  }
  throw new Error("the action did not redirect");
}

const LADDER = { intent: "save-ladder", name0: "Bronze", percent0: "3", name1: "Silver", minSpend1: "200", percent1: "5", name2: "Gold", minSpend2: "500", percent2: "8" };

/** Save the guide's ladder as step 2 posts it, and follow the tier pass it asks for. */
async function saveLadder(admin: GraphqlClient = fakeAdmin()) {
  const redirect = await actExpectingRedirect(LADDER, admin, `${BASE}/app/welcome?step=2`);
  await flushWaitUntil();
  return redirect;
}

async function seedShop(shop = SHOP): Promise<ConnectionContext> {
  await ensureMerchant({ shop, name: "Welcome Test", currency: "GBP", timezone: "Europe/London", now: INSTALLED });
  return (await findConnection(shop))!;
}

async function seedTier(c: ConnectionContext, name: string, minSpend: string, percent: string, position: number, createdAt?: Date) {
  return prisma.tier.create({ data: { merchantId: c.merchantId, name, minSpend, cashbackPercent: percent, position, createdAt } });
}

async function seedBuyer(c: ConnectionContext, externalCustomerId: string) {
  return prisma.customer.create({ data: { merchantId: c.merchantId, connectionId: c.connectionId, externalCustomerId } });
}

let orderNumber = 1000;

async function seedOrder(c: ConnectionContext, customerId: string, o: { orderedAt: Date; amount?: string; source?: "live" | "import" }) {
  orderNumber++;
  const amount = o.amount ?? "50";
  return prisma.order.create({
    data: {
      merchantId: c.merchantId,
      connectionId: c.connectionId,
      customerId,
      externalOrderId: `gid://shopify/Order/${orderNumber}`,
      name: `#${orderNumber}`,
      source: o.source ?? "live",
      currency: "GBP",
      totalAmount: amount,
      productAmount: amount,
      shopProductAmount: amount,
      storeCreditUsed: "0",
      shopStoreCreditUsed: "0",
      giftCardUsed: "0",
      cashbackBase: amount,
      orderedAt: o.orderedAt,
      paidAt: o.orderedAt,
      test: false,
      noCashbackReason: o.source === "import" ? "import" : null,
    },
  });
}

const setImport = (data: { importState: "not_started" | "running" | "done" | "failed"; importError?: string | null; importHorizonDays?: number }) =>
  prisma.connection.update({ where: { id: conn.connectionId }, data: { importOperationId: null, ...data } });

const merchantOf = () => prisma.merchant.findUniqueOrThrow({ where: { id: conn.merchantId } });
const passRequestedAt = async () => (await prisma.connection.findUniqueOrThrow({ where: { id: conn.connectionId } })).tierPassRequestedAt;

describe.skipIf(!hasTestDatabase)("the setup guide's page", () => {
  beforeEach(async () => {
    await resetDatabase();
    process.env.SHOPIFY_API_KEY = "test-api-key";
    conn = await seedShop();
    if (!route) {
      route = await import("~/routes/app.welcome");
      ({ requireMerchant } = (await import("~/admin/require-merchant.server")) as unknown as { requireMerchant: ReturnType<typeof vi.fn> });
    }
  });

  afterEach(async () => {
    await flushWaitUntil();
    requireMerchant?.mockReset();
    vi.mocked(pollImport).mockClear();
    vi.mocked(requestTierPass).mockClear();
    vi.mocked(guideSwitchedOnAt).mockClear();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    delete process.env.SHOPIFY_API_KEY;
    await prisma.$disconnect();
  });

  describe("the loader", () => {
    // Review Focus 1: a ladder this guide didn't make is never rewritten, yet a store with tiers can go live
    it("serves each step only to the stores it is for", async () => {
      expect(await load("/app/welcome")).toMatchObject({ step: 1, editable: true, canGoLive: false });
      expect(await load("/app/welcome?step=2")).toMatchObject({ step: 2, editable: true, canGoLive: false }); // no tiers
      expect(await load("/app/welcome?step=3")).toMatchObject({ step: 2 }); // no tiers yet
      expect(await load("/app/welcome?step=2&read=1")).toMatchObject({ step: 1, editable: false }); // reading from Settings
      expect(await load("/app/welcome?step=4")).toMatchObject({ step: 1 });
      await seedTier(conn, "Bronze", "0", "3", 0);
      await seedTier(conn, "Gold", "500", "8", 1); // a ladder made on the Tiers page
      // Step 2 is refused: the furthest step it may see is 3, which writes no tiers (R23)
      expect(await load("/app/welcome?step=2")).toMatchObject({ step: 3, editable: false, ladder: null });
      expect(await load("/app/welcome?step=3")).toMatchObject({ step: 3, canGoLive: true });
      expect(await load("/app/welcome?step=1")).toMatchObject({ step: 1, editable: false });
    });

    // R23: a step the store may not see falls back to the furthest it may, so Back from step 3 never loops on step 1
    it("falls back to the furthest step the store may see, and reading is always step 1", async () => {
      // A fresh store may see steps 1 and 2
      expect(await load("/app/welcome?step=3")).toMatchObject({ step: 2, editable: true, canGoLive: false });
      expect(await load("/app/welcome?step=3&read=1")).toMatchObject({ step: 1, reading: true });
      // Once the guide has saved its ladder: steps 1 and 3
      await saveLadder();
      expect(await load("/app/welcome?step=2")).toMatchObject({ step: 3, editable: false, canGoLive: true, ladder: null });
      expect(await load("/app/welcome?step=1")).toMatchObject({ step: 1 });
      for (const path of ["/app/welcome?step=1&read=1", "/app/welcome?step=2&read=1", "/app/welcome?step=3&read=1"]) {
        expect(await load(path), path).toMatchObject({ step: 1, reading: true });
      }
    });

    // I-3: Settings' "How RewardsPro works" link opens step 1 to read, and the page is told so
    it("says the merchant is reading for Settings' link, and only then", async () => {
      expect(await load("/app/welcome?step=1&read=1")).toMatchObject({ reading: true, step: 1, editable: false });
      for (const path of ["/app/welcome", "/app/welcome?step=1", "/app/welcome?step=2", "/app/welcome?step=1&read=0"]) {
        expect(await load(path), path).toMatchObject({ reading: false });
      }
      await seedTier(conn, "Bronze", "0", "3", 0);
      await prisma.merchant.update({ where: { id: conn.merchantId }, data: { running: true } });
      expect(await load("/app/welcome?step=1&read=1")).toMatchObject({ reading: true, step: 1 });
      expect(await load("/app/welcome?step=1")).toMatchObject({ reading: false, step: 1 });
    });

    it("lets a store with only Home's paused Everyone tier build its ladder, but not once cashback is on", async () => {
      await seedTier(conn, "Everyone", "0", "6", 0);
      expect(await load("/app/welcome?step=2")).toMatchObject({ step: 2, editable: true, canGoLive: true });
      await prisma.merchant.update({ where: { id: conn.merchantId }, data: { running: true } });
      // Step 2 refused, so the furthest step it may see (R23)
      expect(await load("/app/welcome?step=2")).toMatchObject({ step: 3, editable: false, running: true, ladder: null });
    });

    it("gives steps 1 and 2 the store's median order and currency mix", async () => {
      const buyer = await seedBuyer(conn, "7001");
      for (const amount of ["40", "50", "60"]) {
        await seedOrder(conn, buyer.id, { orderedAt: new Date(Date.now() - 30 * DAY), amount, source: "import" });
      }
      expect(await load("/app/welcome")).toMatchObject({ step: 1, medianOrder: "50", multiCurrency: false, currency: "GBP" });
      const step2 = await load("/app/welcome?step=2");
      expect(step2).toMatchObject({ step: 2, medianOrder: "50", multiCurrency: false });
      expect(step2.ladder).toMatchObject({ medianOrder: "50", multiCurrency: false, spenders: 1 });
      // Step 3 reads neither
      await seedTier(conn, "Everyone", "0", "3", 0);
      expect(await load("/app/welcome?step=3")).toMatchObject({ step: 3, medianOrder: null, multiCurrency: false, ladder: null });
    });

    it("moves the running import on while the guide is open", async () => {
      await setImport({ importState: "running" });
      const admin = fakeAdmin();
      const before = Date.now();
      expect(await load("/app/welcome", admin)).toMatchObject({ importState: "running" });
      const after = Date.now();
      expect(pollImport).toHaveBeenCalledTimes(1);
      const [polledWith, connectionId, deadline] = vi.mocked(pollImport).mock.calls[0];
      expect(polledWith).toBe(admin);
      expect(connectionId).toBe(conn.connectionId);
      expect(deadline).toBeGreaterThanOrEqual(before + 8_000);
      expect(deadline).toBeLessThanOrEqual(after + 8_000);
    });

    it("leaves an import that isn't running to the hourly job", async () => {
      await setImport({ importState: "done" });
      await load("/app/welcome");
      expect(pollImport).not.toHaveBeenCalled();
    });

    it("logs a failed follow of the import and still serves the step", async () => {
      await setImport({ importState: "running" });
      vi.mocked(pollImport).mockRejectedValueOnce(new Error("HTTP 503"));
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await load("/app/welcome")).toMatchObject({ step: 1, importState: "running" });
      expect(logged).toHaveBeenCalledWith(`[guide] Could not poll the past-orders import of ${SHOP}: HTTP 503`);
    });

    it("hands the page the suggestions with the fallbacks in", async () => {
      await setImport({ importState: "running" });
      const data = await load("/app/welcome?step=2");
      expect(data.ladder).toMatchObject({ suggested: [200, 500], fromData: false });
      expect(data).toMatchObject({ period: "12 months", importedOrders: 0 });
    });

    it("passes on only a failed or partial import's sentence", async () => {
      await setImport({ importState: "done", importError: null });
      expect((await load("/app/welcome")).importLines).toEqual([]);
      await setImport({ importState: "failed", importError: "Shopify's bulk query ended FAILED" });
      expect((await load("/app/welcome")).importLines).toEqual(["Your past orders couldn't be brought in, so buyers start in the lowest tier."]);
      // A partial import: its first sentence only, never the raw error
      const buyer = await seedBuyer(conn, "7001");
      await seedOrder(conn, buyer.id, { orderedAt: new Date(Date.now() - 30 * DAY), source: "import" });
      await setImport({ importState: "done", importError: "1 of 2 past orders could not be read, so their spend is not counted: #1" });
      expect((await load("/app/welcome")).importLines).toEqual(["Brought in 1 of your past orders; the rest couldn't be read."]);
      await setImport({ importState: "running" });
      expect((await load("/app/welcome")).importLines).toEqual([]);
    });

    it("says the import's own period", async () => {
      await setImport({ importState: "done", importHorizonDays: 60 });
      expect(await load("/app/welcome")).toMatchObject({ period: "60 days" });
    });

    // M-6: the Tiers page's limit on a name, as its loader gives it
    it("gives step 2 the Tiers page's longest name", async () => {
      expect(await load("/app/welcome?step=2")).toMatchObject({ step: 2, nameMax: TIER_NAME_MAX });
    });

    it("starts row 1 at the lone Everyone tier's rate", async () => {
      expect(await load("/app/welcome?step=2")).toMatchObject({ everyonePercent: null, firstPercent: null });
      await seedTier(conn, "Everyone", "0", "6", 0);
      expect(await load("/app/welcome?step=2")).toMatchObject({ everyonePercent: 6, firstPercent: 6 });
    });

    // 8-F3: steps 1 and 2 show neither the store-credit check nor the try-it, so they don't ask for them
    it("asks Shopify about store credit and reads the switch-on only on step 3", async () => {
      const storeCreditCalls = (admin: { calls: Call[] }) =>
        admin.calls.filter((call) => call.operation === "RewardsCustomerAccounts" || call.operation === "RewardsStoreCreditConfig");
      await seedTier(conn, "Everyone", "0", "3", 0);
      for (const path of ["/app/welcome", "/app/welcome?step=2", "/app/welcome?step=1&read=1"]) {
        const admin = fakeAdmin();
        const data = await load(path, admin);
        expect(data.step, path).not.toBe(3);
        expect(data.goLive, path).toBeNull();
        expect(storeCreditCalls(admin), path).toEqual([]);
      }
      expect(guideSwitchedOnAt).not.toHaveBeenCalled();

      const admin = fakeAdmin();
      const data = await load("/app/welcome?step=3", admin);
      expect(data.goLive).toMatchObject({ storeCredit: true, switchedOnAt: null, tryIt: [] });
      expect(storeCreditCalls(admin).map((call) => call.operation).sort()).toEqual(["RewardsCustomerAccounts", "RewardsStoreCreditConfig"]);
      expect(guideSwitchedOnAt).toHaveBeenCalledTimes(1);
    });

    it("gives step 3 its checks and links", async () => {
      await seedTier(conn, "Everyone", "0", "3", 0);
      const data = await load("/app/welcome?step=3");
      expect(data).toMatchObject({
        step: 3,
        goLive: { storeCredit: true, storeCreditBanner: null, storeCreditLink: null, switchedOnAt: null, tryIt: [] },
        draftOrderUrl: `https://${SHOP}/admin/draft_orders/new`,
        placing: false,
      });
      expect(data.themeEditorUrl).toContain(`https://${SHOP}/admin/themes/current/editor`);
    });

    it("says when store credit can't be spent, in Home's words with Home's settings link, and when Shopify didn't say", async () => {
      await seedTier(conn, "Everyone", "0", "3", 0);
      const off = fakeAdmin({ RewardsStoreCreditConfig: { data: { storeCreditConfiguration: { storeCreditEnabled: false } } } });
      expect((await load("/app/welcome?step=3", off)).goLive).toMatchObject({
        storeCredit: false,
        storeCreditBanner: "Buyers can't spend their store credit yet: store credit is turned off in Settings > Customer accounts.",
        storeCreditLink: { label: "Open customer account settings", href: "shopify://admin/settings/customer_accounts" },
      });
      const unsure = fakeAdmin({ RewardsStoreCreditConfig: { errors: [{ message: "Throttled" }] } });
      expect((await load("/app/welcome?step=3", unsure)).goLive).toMatchObject({ storeCredit: null, storeCreditBanner: null, storeCreditLink: null });
    });
  });

  describe("the actions", () => {
    it("saves the ladder, places buyers once, tells the widget and goes to step 3", async () => {
      const admin = fakeAdmin();
      const redirect = await actExpectingRedirect(LADDER, admin, `${BASE}/app/welcome?step=2&shop=s&host=h`);
      expect(redirect.status).toBe(302);
      expect(redirect.headers.get("Location")).toBe("/app/welcome?step=3&shop=s&host=h");
      expect(await passRequestedAt()).toBeInstanceOf(Date);
      // One tier pass for the one save
      expect(requestTierPass).toHaveBeenCalledTimes(1);
      expect(requestTierPass).toHaveBeenCalledWith(conn.connectionId);
      expect(widgetValues(admin)).toEqual([{ running: false, basePercent: 3 }]);
      await flushWaitUntil();
      const tiers = await prisma.tier.findMany({ where: { merchantId: conn.merchantId }, orderBy: { position: "asc" } });
      expect(tiers.map((t) => [t.name, t.minSpend.toFixed(0), t.cashbackPercent.toFixed(0)])).toEqual([
        ["Bronze", "0", "3"],
        ["Silver", "200", "5"],
        ["Gold", "500", "8"],
      ]);
      expect(await load("/app/welcome?step=3")).toMatchObject({ step: 3, canGoLive: true, running: false, firstPercent: 3 });
    });

    it("goes to step 3 from a save with no other search parameters", async () => {
      const redirect = await saveLadder();
      expect(redirect.headers.get("Location")).toBe("/app/welcome?step=3");
    });

    it("hands back every row's problems and writes nothing", async () => {
      const admin = fakeAdmin();
      const result = await act({ ...LADDER, name1: "", percent2: "101" }, admin, `${BASE}/app/welcome?step=2`);
      expect(result.ok).toBe(false);
      // A 4xx, so React Router keeps step 2 and its errors rather than reloading the page (M-1)
      expect(result.status).toBe(422);
      expect(result.errors?.rows[1].name).toBeTruthy();
      expect(result.errors?.rows[2].percent).toBeTruthy();
      expect(await prisma.tier.count({ where: { merchantId: conn.merchantId } })).toBe(0);
      expect(await passRequestedAt()).toBeNull();
      expect(requestTierPass).not.toHaveBeenCalled();
      expect(widgetValues(admin)).toEqual([]);
    });

    // Review Focus 1: a save from a stale tab
    it("refuses a save over a ladder made elsewhere, writing nothing", async () => {
      await seedTier(conn, "Bronze", "0", "4", 0);
      await seedTier(conn, "Gold", "500", "9", 1);
      const admin = fakeAdmin();
      const result = await act(LADDER, admin, `${BASE}/app/welcome?step=2`);
      expect(result).toMatchObject({ ok: false, errors: { form: TIER_ERRORS.ladderStale }, status: 409 });
      expect((await prisma.tier.findMany({ where: { merchantId: conn.merchantId } })).map((t) => t.name).sort()).toEqual(["Bronze", "Gold"]);
      expect(await passRequestedAt()).toBeNull();
      expect(requestTierPass).not.toHaveBeenCalled();
      expect(widgetValues(admin)).toEqual([]);
    });

    it("switches on with the widget seen on, records setup done, tells the widget, and stays on step 3 with the try-it", async () => {
      await saveLadder();
      expect(requestTierPass).toHaveBeenCalledTimes(1);
      const admin = fakeAdmin();
      expect(await act({ intent: "running", running: "on", widget: "on" }, admin)).toEqual({ ok: true });
      // Switching on moves no one: still the save's one pass
      expect(requestTierPass).toHaveBeenCalledTimes(1);
      const merchant = await merchantOf();
      expect(merchant.running).toBe(true);
      expect(merchant.setupCompletedAt).toBeInstanceOf(Date);
      expect(widgetValues(admin)).toEqual([{ running: true, basePercent: 3 }]);

      const buyer = await seedBuyer(conn, "7001");
      const order = await seedOrder(conn, buyer.id, { orderedAt: new Date() });
      const data = await load("/app/welcome?step=3");
      expect(data).toMatchObject({ step: 3, running: true });
      expect(data.goLive?.switchedOnAt).not.toBeNull();
      expect(data.goLive?.tryIt).toMatchObject([{ orderId: order.id, name: order.name, externalCustomerId: "7001" }]);
    });

    // Since #229 the review request falls due 30 days after setupCompletedAt: Home stamps it only once the
    // browser has seen the widget on, so the guide's switch doesn't either
    it("switches on with the widget not seen on, leaving setup open and the try-it working", async () => {
      await saveLadder();
      const admin = fakeAdmin();
      expect(await act({ intent: "running", running: "on" }, admin)).toEqual({ ok: true });
      const merchant = await merchantOf();
      expect(merchant.running).toBe(true);
      expect(merchant.setupCompletedAt).toBeNull();
      expect(widgetValues(admin)).toEqual([{ running: true, basePercent: 3 }]);
      expect(await reviewRequestDue(conn.merchantId, new Date(Date.now() + 31 * DAY))).toBe(false);

      const buyer = await seedBuyer(conn, "7001");
      const order = await seedOrder(conn, buyer.id, { orderedAt: new Date() });
      const data = await load("/app/welcome?step=3");
      expect(data).toMatchObject({ step: 3, running: true });
      expect(data.goLive?.switchedOnAt).not.toBeNull();
      expect(data.goLive?.tryIt).toMatchObject([{ orderId: order.id, name: order.name, externalCustomerId: "7001" }]);
    });

    it("lists only orders since this guide's switch-on, even after an old Home setup", async () => {
      const monthAgo = new Date(Date.now() - 30 * DAY);
      // Home's old card: a lone Everyone tier, setup completed, then cashback paused
      await seedTier(conn, "Everyone", "0", "3", 0, monthAgo);
      await prisma.merchant.update({ where: { id: conn.merchantId }, data: { running: false, setupCompletedAt: monthAgo } });
      const buyer = await seedBuyer(conn, "7001");
      await seedOrder(conn, buyer.id, { orderedAt: new Date(monthAgo.getTime() + DAY) });

      await saveLadder();
      expect(await act({ intent: "running", running: "on" })).toEqual({ ok: true });
      // The first completion is kept
      expect((await merchantOf()).setupCompletedAt).toEqual(monthAgo);
      const fresh = await seedOrder(conn, buyer.id, { orderedAt: new Date() });

      const data = await load("/app/welcome?step=3");
      expect(new Date(data.goLive!.switchedOnAt!).getTime()).toBeGreaterThan(monthAgo.getTime() + DAY);
      expect(data.goLive!.tryIt.map((o) => o.orderId)).toEqual([fresh.id]);
    });

    it("refuses switching on with no tiers, whatever the browser says of the widget", async () => {
      const admin = fakeAdmin();
      expect(await act({ intent: "running", running: "on", widget: "on" }, admin)).toEqual({ ok: false, error: "Save your tiers first." });
      const merchant = await merchantOf();
      expect(merchant.running).toBe(false);
      expect(merchant.setupCompletedAt).toBeNull();
      expect(widgetValues(admin)).toEqual([]);
    });

    it("only ever switches on", async () => {
      await seedTier(conn, "Everyone", "0", "3", 0);
      await prisma.merchant.update({ where: { id: conn.merchantId }, data: { running: true } });
      for (const running of ["off", ""]) {
        expect(await act({ intent: "running", running })).toEqual({ ok: false, error: "Unknown action.", status: 400 });
      }
      expect((await merchantOf()).running).toBe(true);
    });

    it("remembers Finish later, for the signed-in store only", async () => {
      const other = await seedShop("other-welcome.myshopify.com");
      expect(await act({ intent: "finish-later", merchantId: other.merchantId })).toEqual({ ok: true });
      expect((await merchantOf()).guideDismissedAt).toBeInstanceOf(Date);
      expect(await guideDue(conn.merchantId)).toBe(false);
      expect(await guideDue(other.merchantId)).toBe(true);
    });

    it("answers an unknown post with 400", async () => {
      expect(await act({ intent: "nope" })).toMatchObject({ ok: false, status: 400 });
    });
  });
});
