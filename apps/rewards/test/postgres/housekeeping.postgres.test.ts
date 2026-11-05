import { Session } from "@shopify/shopify-app-react-router/server";
import { graphql, http, HttpResponse } from "msw";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { ensureMerchant, findConnection } from "~/lib/merchant.server";
import { server } from "../setup";
import { hasTestDatabase, resetDatabase } from "./helpers/database";
import { adminGraphqlUrl } from "./helpers/shopify";

/**
 * Nightly housekeeping through its cron route (api.cron.housekeeping):
 * expired locks, privacy reports past their time, online sessions long
 * expired, and a token refresh for every store whose refresh token runs out
 * within 14 days (plan Decision 12). Offline sessions are never deleted here
 * (spec 7): only an uninstall deletes them.
 */

const SHOP = "housekeeping.myshopify.com";
const QUIET_SHOP = "housekeeping-quiet.myshopify.com";
const CRON_SECRET = "cron-secret-for-tests";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** An offline session stored through the app's own (encrypting) storage. */
async function storeOfflineSession(shop: string, o: { expires: Date; refreshTokenExpires: Date }) {
  const { sessionStorage } = await import("~/shopify.server");
  await sessionStorage.storeSession(
    new Session({
      id: `offline_${shop}`,
      shop,
      state: "",
      isOnline: false,
      scope: "read_customers,read_orders",
      accessToken: "old-access-token",
      expires: o.expires,
      refreshToken: "old-refresh-token",
      refreshTokenExpires: o.refreshTokenExpires,
    }),
  );
}

/**
 * Shopify's token endpoint for `shop`, as the library's refresh calls it,
 * and the RewardsTokenPing it sends with the token. Returns what each saw.
 */
function mockTokenRefresh(shop: string, o: { refuse?: boolean } = {}) {
  const seen = { refreshes: [] as Array<Record<string, unknown>>, pings: [] as Array<string | null> };
  server.use(
    http.post(`https://${shop}/admin/oauth/access_token`, async ({ request }) => {
      seen.refreshes.push((await request.json()) as Record<string, unknown>);
      if (o.refuse) return HttpResponse.json({ error: "invalid_request", error_description: "refresh token revoked" }, { status: 400 });
      return HttpResponse.json({
        access_token: "new-access-token",
        expires_in: 3600,
        refresh_token: "new-refresh-token",
        refresh_token_expires_in: 90 * 24 * 3600,
        scope: "read_customers,read_orders",
      });
    }),
    graphql.link(adminGraphqlUrl(shop)).query("RewardsTokenPing", ({ request }) => {
      seen.pings.push(request.headers.get("X-Shopify-Access-Token"));
      return HttpResponse.json({ data: { shop: { id: "gid://shopify/Shop/1" } } });
    }),
  );
  return seen;
}

describe.skipIf(!hasTestDatabase)("nightly housekeeping", () => {
  let loader: typeof import("~/routes/api.cron.housekeeping").loader;

  const run = async (authorization: string | null = `Bearer ${CRON_SECRET}`) => {
    const response = await loader({
      request: new Request("https://test.example.com/api/cron/housekeeping", { headers: authorization ? { Authorization: authorization } : {} }),
      params: {},
      context: {},
    } as never);
    const text = await response.text();
    return { status: response.status, body: (text.startsWith("{") ? JSON.parse(text) : {}) as Record<string, unknown> };
  };

  beforeAll(async () => {
    // ~/shopify.server checks the Session table when it loads, so the route
    // is imported only with a test database. The library logs its version.
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.SHOPIFY_API_KEY = "test-api-key";
    ({ loader } = await import("~/routes/api.cron.housekeeping"));
  });

  beforeEach(async () => {
    await resetDatabase();
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterAll(async () => {
    delete process.env.SHOPIFY_API_KEY;
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it("requires the cron bearer token", async () => {
    await expect(run(null)).resolves.toMatchObject({ status: 401 });
  });

  it("deletes online sessions expired over 24 hours ago, and never an offline one", async () => {
    const now = Date.now();
    const session = (id: string, isOnline: boolean, expires: Date | null) => ({
      id,
      shop: SHOP,
      state: "",
      isOnline,
      accessToken: "stored-token",
      expires,
    });
    await prisma.session.createMany({
      data: [
        session("online-old", true, new Date(now - 25 * HOUR)),
        session("online-recent", true, new Date(now - 23 * HOUR)),
        session("online-no-expiry", true, null),
        // An offline token expired days ago, whose refresh token still has long to run
        { ...session(`offline_${SHOP}`, false, new Date(now - 3 * DAY)), refreshTokenExpires: new Date(now + 60 * DAY) },
        session(`offline_${QUIET_SHOP}`, false, new Date(now - 30 * DAY)),
      ],
    });

    await expect(run()).resolves.toMatchObject({ status: 200, body: { success: true, sessionsDeleted: 1, tokensChecked: 0 } });

    const left = await prisma.session.findMany({ select: { id: true }, orderBy: { id: "asc" } });
    expect(left.map((s) => s.id)).toEqual([`offline_${QUIET_SHOP}`, `offline_${SHOP}`, "online-no-expiry", "online-recent"]);
  });

  it("refreshes the token of a store whose refresh token runs out in 10 days", async () => {
    await storeOfflineSession(SHOP, { expires: new Date(Date.now() - HOUR), refreshTokenExpires: new Date(Date.now() + 10 * DAY) });
    // 30 days left: not yet
    await storeOfflineSession(QUIET_SHOP, { expires: new Date(Date.now() - HOUR), refreshTokenExpires: new Date(Date.now() + 30 * DAY) });
    const seen = mockTokenRefresh(SHOP);

    await expect(run()).resolves.toMatchObject({ status: 200, body: { tokensChecked: 1, problems: 0 } });

    expect(seen.refreshes).toEqual([expect.objectContaining({ grant_type: "refresh_token", refresh_token: "old-refresh-token" })]);
    expect(seen.pings).toEqual(["new-access-token"]);
    const { sessionStorage } = await import("~/shopify.server");
    const refreshed = await sessionStorage.loadSession(`offline_${SHOP}`);
    expect(refreshed).toMatchObject({ accessToken: "new-access-token", refreshToken: "new-refresh-token" });
    expect(refreshed!.refreshTokenExpires!.getTime()).toBeGreaterThan(Date.now() + 89 * DAY);
    const quiet = await sessionStorage.loadSession(`offline_${QUIET_SHOP}`);
    expect(quiet).toMatchObject({ accessToken: "old-access-token" });
  });

  it("counts a store whose token can't be refreshed as a problem, and keeps its session", async () => {
    await storeOfflineSession(SHOP, { expires: new Date(Date.now() - HOUR), refreshTokenExpires: new Date(Date.now() + 2 * DAY) });
    const seen = mockTokenRefresh(SHOP, { refuse: true });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(run()).resolves.toMatchObject({ status: 200, body: { tokensChecked: 1, problems: 1 } });

    expect(seen.refreshes).toHaveLength(1);
    expect(seen.pings).toEqual([]);
    expect(errors.mock.calls.map((args) => args.join(" "))).toEqual([expect.stringContaining(SHOP)]);
    await expect(prisma.session.count({ where: { id: `offline_${SHOP}` } })).resolves.toBe(1);
    // The monitor records the run as partial (OPERATIONS-8)
    const partial = await prisma.cronRun.findUniqueOrThrow({ where: { job_outcome: { job: "housekeeping", outcome: "partial" } } });
    expect(partial.errorMessage).toMatch(/^1 failed; first: Error: Token refresh for housekeeping\.myshopify\.com: HTTP 500/);
    await expect(prisma.cronRun.count({ where: { job: "housekeeping", outcome: "succeeded" } })).resolves.toBe(0);
    errors.mockRestore();
  });

  it("stops reaching stores at its 240 s budget, and records the run as partial with the stores left (A15-F1)", async () => {
    await storeOfflineSession(SHOP, { expires: new Date(Date.now() - HOUR), refreshTokenExpires: new Date(Date.now() + 2 * DAY) });
    await storeOfflineSession(QUIET_SHOP, { expires: new Date(Date.now() - HOUR), refreshTokenExpires: new Date(Date.now() + 3 * DAY) });
    const seen = mockTokenRefresh(SHOP);
    const quiet = mockTokenRefresh(QUIET_SHOP);
    // The clock the budget reads has run past 240 s (the rest of the job keeps the real time)
    const realNow = Date.now.bind(Date);
    const now = vi.spyOn(Date, "now").mockImplementation(() => realNow() + 241_000);

    let result;
    try {
      result = await run();
    } finally {
      now.mockRestore();
    }

    expect(result).toMatchObject({ status: 200, body: { tokensChecked: 0, storesLeft: 2, problems: 0 } });
    expect(seen.refreshes).toEqual([]);
    expect(quiet.refreshes).toEqual([]);
    const partial = await prisma.cronRun.findUniqueOrThrow({ where: { job_outcome: { job: "housekeeping", outcome: "partial" } } });
    expect(partial.errorMessage).toBe("2 failed; first: Error: 2 stores' tokens were not checked before the deadline");
  });

  it("expires privacy reports past their time, and clears expired locks", async () => {
    await ensureMerchant({ shop: SHOP, name: "Housekeeping", currency: "GBP", timezone: "Europe/London" });
    const conn = (await findConnection(SHOP))!;
    const request = (shopifyRequestId: string, status: "open" | "downloaded", expiresAt: Date) => ({
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      externalCustomerId: "7001",
      shopifyRequestId,
      ordersRequested: [],
      status,
      receivedAt: new Date(Date.now() - 50 * DAY),
      dueAt: new Date(Date.now() - 20 * DAY),
      expiresAt,
    });
    await prisma.privacyRequest.createMany({
      data: [
        request("1", "open", new Date(Date.now() - MINUTE)),
        request("2", "downloaded", new Date(Date.now() - DAY)),
        request("3", "open", new Date(Date.now() + DAY)),
      ],
    });
    await prisma.cronLock.createMany({
      data: [
        { jobName: "payouts", expiresAt: new Date(Date.now() - MINUTE) },
        { jobName: "tiers", expiresAt: new Date(Date.now() + 10 * MINUTE) },
      ],
    });

    await expect(run()).resolves.toMatchObject({ status: 200, body: { reportsExpired: 2, locksCleared: 1 } });

    const statuses = await prisma.privacyRequest.findMany({ select: { shopifyRequestId: true, status: true }, orderBy: { shopifyRequestId: "asc" } });
    expect(statuses).toEqual([
      { shopifyRequestId: "1", status: "expired" },
      { shopifyRequestId: "2", status: "expired" },
      { shopifyRequestId: "3", status: "open" },
    ]);
    const locks = await prisma.cronLock.findMany({ select: { jobName: true } });
    expect(locks).toEqual([{ jobName: "tiers" }]);
  });
});
