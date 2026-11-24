import { Session } from "@shopify/shopify-app-react-router/server";
import { graphql, http, HttpResponse } from "msw";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma, { createPrismaClient } from "~/db.server";
import { ensureMerchant, findConnection } from "~/lib/merchant.server";
import { monitoring } from "~/lib/telemetry.server";
import { EncryptedPrismaSessionStorage } from "~/shopify/session-storage.server";
import { widgetConfig, widgetConfigJson } from "~/shopify/widget-config.server";
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

/**
 * The two documents the widget's settings are written with for `shop`
 * (RewardsAppInstallation, then RewardsWidgetConfig). Returns each written
 * value, parsed; with `refuse`, Shopify answers the write with a userError.
 * `onWrite` runs as each write arrives, before Shopify answers it.
 */
function mockWidgetConfig(shop: string, o: { refuse?: boolean; onWrite?: () => unknown } = {}) {
  const written: unknown[] = [];
  const link = graphql.link(adminGraphqlUrl(shop));
  server.use(
    link.query("RewardsAppInstallation", () => HttpResponse.json({ data: { currentAppInstallation: { id: "gid://shopify/AppInstallation/42" } } })),
    link.mutation("RewardsWidgetConfig", async ({ variables }) => {
      const [metafield] = variables.metafields as Array<{ namespace: string; key: string; value: string }>;
      written.push({ namespace: metafield.namespace, key: metafield.key, value: JSON.parse(metafield.value) });
      await o.onWrite?.();
      const userErrors = o.refuse ? [{ field: ["metafields"], message: "Too many metafields", code: "LIMIT_EXCEEDED" }] : [];
      return HttpResponse.json({ data: { metafieldsSet: { metafields: o.refuse ? [] : [{ id: "gid://shopify/Metafield/1" }], userErrors } } });
    }),
  );
  return written;
}

/** A store with an offline session that needs no refresh, `running` as given, and a 5% lowest tier. */
async function seedStore(shop: string, o: { running?: boolean } = {}) {
  await ensureMerchant({ shop, name: shop, currency: "GBP", timezone: "Europe/London" });
  const conn = (await findConnection(shop))!;
  await prisma.tier.create({ data: { merchantId: conn.merchantId, name: "Everyone", minSpend: "0", cashbackPercent: "5", position: 0 } });
  if (o.running) await prisma.merchant.update({ where: { id: conn.merchantId }, data: { running: true } });
  await storeOfflineSession(shop, { expires: new Date(Date.now() + HOUR), refreshTokenExpires: new Date(Date.now() + 60 * DAY) });
  return conn;
}

/** What the connection records of the widget's last write (OPERATIONS-4). */
const widgetRecord = (shop: string) =>
  prisma.connection.findFirstOrThrow({ where: { externalAccountId: shop }, select: { widgetConfigSyncedAt: true, widgetConfigValue: true } });

/**
 * While `run` runs, the clock the budget reads passes 240 s once `cut()` is
 * called (the rest of the job keeps the real time).
 */
async function withDeadline<T>(run: (cut: () => void) => Promise<T>): Promise<T> {
  const realNow = Date.now.bind(Date);
  let passed = false;
  const now = vi.spyOn(Date, "now").mockImplementation(() => realNow() + (passed ? 241_000 : 0));
  try {
    return await run(() => (passed = true));
  } finally {
    now.mockRestore();
  }
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

    // Sorted here, not by the database: its collation decides where "-" and "." fall
    const left = await prisma.session.findMany({ select: { id: true } });
    expect(left.map((s) => s.id).sort()).toEqual([`offline_${QUIET_SHOP}`, `offline_${SHOP}`, "online-no-expiry", "online-recent"]);
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

  it("rewrites the widget's settings for every active store, and counts one Shopify refuses as a problem", async () => {
    await seedStore(SHOP, { running: true });
    await seedStore(QUIET_SHOP);
    const gone = "housekeeping-gone.myshopify.com";
    await ensureMerchant({ shop: gone, name: gone, currency: "GBP", timezone: "Europe/London" });
    await prisma.connection.updateMany({ where: { externalAccountId: gone }, data: { status: "uninstalled" } });
    const written = mockWidgetConfig(SHOP);
    const refused = mockWidgetConfig(QUIET_SHOP, { refuse: true });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(run()).resolves.toMatchObject({ status: 200, body: { widgetsChecked: 2, widgetsLeft: 0, problems: 1 } });

    expect(written).toEqual([{ namespace: "rewards", key: "config", value: { running: true, basePercent: 5 } }]);
    expect(refused).toEqual([{ namespace: "rewards", key: "config", value: { running: false, basePercent: 5 } }]);
    expect(errors.mock.calls.map((args) => args.join(" "))).toEqual([expect.stringMatching(/housekeeping-quiet\.myshopify\.com.*LIMIT_EXCEEDED/)]);
    const partial = await prisma.cronRun.findUniqueOrThrow({ where: { job_outcome: { job: "housekeeping", outcome: "partial" } } });
    expect(partial.errorMessage).toMatch(/^1 failed; first: Error: Shopify refused the widget config: LIMIT_EXCEEDED/);
    errors.mockRestore();
  });

  it("stops writing widget settings at its 240 s budget, and counts the stores left", async () => {
    await seedStore(SHOP);
    const written = mockWidgetConfig(SHOP);
    const realNow = Date.now.bind(Date);
    const now = vi.spyOn(Date, "now").mockImplementation(() => realNow() + 241_000);

    let result;
    try {
      result = await run();
    } finally {
      now.mockRestore();
    }

    expect(result).toMatchObject({ status: 200, body: { widgetsChecked: 0, widgetsLeft: 1, problems: 0 } });
    expect(written).toEqual([]);
    const partial = await prisma.cronRun.findUniqueOrThrow({ where: { job_outcome: { job: "housekeeping", outcome: "partial" } } });
    expect(partial.errorMessage).toBe("1 failed; first: Error: 1 stores' widget settings were not written before the deadline");
  });

  // A19-F8: both kinds of store left, both named
  it("names both the token stores and the widget stores the deadline left", async () => {
    await seedStore(SHOP);
    await storeOfflineSession(QUIET_SHOP, { expires: new Date(Date.now() - HOUR), refreshTokenExpires: new Date(Date.now() + 2 * DAY) });

    const result = await withDeadline((cut) => {
      cut();
      return run();
    });

    expect(result).toMatchObject({ status: 200, body: { tokensChecked: 0, storesLeft: 1, widgetsChecked: 0, widgetsLeft: 1, problems: 0 } });
    const partial = await prisma.cronRun.findUniqueOrThrow({ where: { job_outcome: { job: "housekeeping", outcome: "partial" } } });
    expect(partial.errorMessage).toBe(
      "2 failed; first: Error: 1 stores' tokens were not checked and 1 stores' widget settings were not written before the deadline",
    );
  });

  // A19-F8: a store whose session can't be loaded is a problem, and the others carry on
  it("counts a store it can't reach through unauthenticated.admin as a problem, and writes the next", async () => {
    await seedStore(SHOP);
    await seedStore(QUIET_SHOP);
    // SHOP has no session left to load
    await prisma.session.delete({ where: { id: `offline_${SHOP}` } });
    const written = mockWidgetConfig(QUIET_SHOP);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(run()).resolves.toMatchObject({ status: 200, body: { widgetsChecked: 2, widgetsLeft: 0, problems: 1 } });

    expect(written).toHaveLength(1);
    expect(errors.mock.calls.map((args) => args.join(" "))).toEqual([expect.stringContaining(`Could not write the widget settings of ${SHOP}`)]);
    errors.mockRestore();
  });

  // A19-F8: uninstalled after the list was read, so there is nothing to write
  it("skips a store uninstalled since the list was read, as no problem", async () => {
    await seedStore(SHOP);
    await seedStore(QUIET_SHOP);
    // QUIET_SHOP was tried before, so SHOP (never tried) comes first
    await prisma.connection.updateMany({ where: { externalAccountId: QUIET_SHOP }, data: { widgetConfigTriedAt: new Date(Date.now() - 30 * DAY) } });
    // QUIET_SHOP is uninstalled while SHOP's settings are written; no answer is mocked for it, so any call to it fails the run
    const written = mockWidgetConfig(SHOP, {
      onWrite: () => prisma.connection.updateMany({ where: { externalAccountId: QUIET_SHOP }, data: { status: "uninstalled" } }),
    });

    await expect(run()).resolves.toMatchObject({ status: 200, body: { widgetsChecked: 2, widgetsLeft: 0, problems: 0 } });

    expect(written).toHaveLength(1);
    await expect(prisma.cronRun.count({ where: { job: "housekeeping", outcome: "succeeded" } })).resolves.toBe(1);
  });

  // OPERATIONS-4: what was written, and when, is what the next night reads
  it("records each write's value and time on the connection, and clears the time when a write fails", async () => {
    await seedStore(SHOP, { running: true });
    await seedStore(QUIET_SHOP);
    mockWidgetConfig(SHOP);
    mockWidgetConfig(QUIET_SHOP);
    const before = Date.now();

    await run();

    const written = await widgetRecord(SHOP);
    expect(written.widgetConfigValue).toBe(JSON.stringify({ running: true, basePercent: 5 }));
    expect(written.widgetConfigSyncedAt!.getTime()).toBeGreaterThanOrEqual(before);

    // The next write of QUIET_SHOP fails: Shopify may hold either value, so the time is cleared and the value kept
    await prisma.connection.updateMany({ where: { externalAccountId: QUIET_SHOP }, data: { widgetConfigSyncedAt: new Date(Date.now() - 8 * DAY) } });
    server.resetHandlers();
    mockWidgetConfig(QUIET_SHOP, { refuse: true });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await run();
    errors.mockRestore();

    await expect(widgetRecord(QUIET_SHOP)).resolves.toEqual({
      widgetConfigSyncedAt: null,
      widgetConfigValue: JSON.stringify({ running: false, basePercent: 5 }),
    });
    // M3e-F1, F2: when it failed and when it was tried
    await expect(prisma.connection.findFirstOrThrow({ where: { externalAccountId: QUIET_SHOP } })).resolves.toMatchObject({
      widgetConfigFailedAt: expect.any(Date),
      widgetConfigTriedAt: expect.any(Date),
    });
    // SHOP was written within the week and still holds today's value: left alone
    await expect(widgetRecord(SHOP)).resolves.toEqual(written);
  });

  // OPERATIONS-4: unchanged within a week is skipped; older or changed is written
  it("skips a store still holding today's settings written within a week, and rewrites one written longer ago or changed since", async () => {
    const fresh = "housekeeping-fresh.myshopify.com";
    const stale = "housekeeping-stale.myshopify.com";
    const changed = "housekeeping-changed.myshopify.com";
    for (const shop of [fresh, stale, changed]) {
      await seedStore(shop);
      mockWidgetConfig(shop);
    }
    await run();
    await prisma.connection.updateMany({ where: { externalAccountId: stale }, data: { widgetConfigSyncedAt: new Date(Date.now() - 8 * DAY) } });
    const changedConn = (await findConnection(changed))!;
    await prisma.merchant.update({ where: { id: changedConn.merchantId }, data: { running: true } });

    server.resetHandlers();
    const written = Object.fromEntries([fresh, stale, changed].map((shop) => [shop, mockWidgetConfig(shop)]));
    await expect(run()).resolves.toMatchObject({ status: 200, body: { widgetsChecked: 3, widgetsUnchanged: 1, widgetsLeft: 0, problems: 0 } });

    expect(written[fresh]).toEqual([]);
    expect(written[stale]).toEqual([{ namespace: "rewards", key: "config", value: { running: false, basePercent: 5 } }]);
    expect(written[changed]).toEqual([{ namespace: "rewards", key: "config", value: { running: true, basePercent: 5 } }]);
  });

  // M3e-F2: a store that keeps failing can't use up the deadline night after night
  it("visits a store whose write failed last night after a store never written", async () => {
    const failing = "housekeeping-failing.myshopify.com";
    const fresh = "housekeeping-new.myshopify.com";
    await seedStore(failing);
    mockWidgetConfig(failing, { refuse: true });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await run();
    errors.mockRestore();
    await expect(prisma.connection.findFirstOrThrow({ where: { externalAccountId: failing } })).resolves.toMatchObject({
      widgetConfigSyncedAt: null,
      widgetConfigFailedAt: expect.any(Date),
      widgetConfigTriedAt: expect.any(Date),
    });

    // A store installed since, never written; the run is cut short by its first write
    await seedStore(fresh);
    server.resetHandlers();
    const written = { [failing]: [] as unknown[], [fresh]: [] as unknown[] };
    const result = await withDeadline((cut) => {
      written[failing] = mockWidgetConfig(failing, { onWrite: cut });
      written[fresh] = mockWidgetConfig(fresh, { onWrite: cut });
      return run();
    });

    expect(result).toMatchObject({ status: 200, body: { widgetsChecked: 1, widgetsLeft: 1 } });
    expect(written[fresh]).toHaveLength(1);
    expect(written[failing]).toEqual([]);
  });

  // OPERATIONS-4: a run cut short never leaves the same stores behind every night
  it("visits the stores written longest ago first, so the next run writes a store the last one left", async () => {
    const shops = ["housekeeping-a.myshopify.com", "housekeeping-b.myshopify.com", "housekeeping-c.myshopify.com"];
    for (const shop of shops) await seedStore(shop);
    // Each run is cut short by its first write
    const nightly = async () => {
      server.resetHandlers();
      const written = new Map<string, unknown[]>();
      const result = await withDeadline((cut) => {
        for (const shop of shops) written.set(shop, mockWidgetConfig(shop, { onWrite: cut }));
        return run();
      });
      expect(result).toMatchObject({ status: 200, body: { widgetsChecked: 1 } });
      return shops.filter((shop) => written.get(shop)!.length > 0);
    };

    const [first] = await nightly();
    // The first store's settings change, so it can't be skipped as unchanged
    const firstConn = (await findConnection(first))!;
    await prisma.merchant.update({ where: { id: firstConn.merchantId }, data: { running: true } });

    const [second] = await nightly();
    const [third] = await nightly();
    expect(new Set([first, second, third])).toEqual(new Set(shops));
    // Then the changed one, now the longest ago
    await expect(nightly()).resolves.toEqual([first]);
  });

  // Ruling 85: a store whose token another call is renewing is left for the next run, as no problem
  it("skips a store whose token another call is still renewing, as no problem, and reaches the next", async () => {
    await seedStore(SHOP);
    await seedStore(QUIET_SHOP);
    // SHOP's token has expired and its refresh token runs out soon; a slow renewal of it holds the lease on another instance
    await prisma.session.delete({ where: { id: `offline_${SHOP}` } });
    await storeOfflineSession(SHOP, { expires: new Date(Date.now() - MINUTE), refreshTokenExpires: new Date(Date.now() + 2 * DAY) });
    const holder = createPrismaClient(process.env.REWARDS_DATABASE_URL);
    try {
      await new EncryptedPrismaSessionStorage(holder).loadSession(`offline_${SHOP}`);
      const seen = mockTokenRefresh(SHOP);
      const written = mockWidgetConfig(QUIET_SHOP);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(monitoring, "captureMessage").mockReturnValue(true);

      await expect(run()).resolves.toMatchObject({ status: 200, body: { tokensChecked: 1, widgetsChecked: 2, busySkips: 2, problems: 0 } });

      // Neither a refresh nor a write beside the running renewal
      expect(seen.refreshes).toEqual([]);
      expect(written).toHaveLength(1);
      expect(warn.mock.calls.map((args) => args.join(" ")).filter((line) => line.startsWith("[housekeeping]"))).toEqual([
        `[housekeeping] Another renewal of ${SHOP}'s token is running; its token check waits for the next run`,
        `[housekeeping] Another renewal of ${SHOP}'s token is running; its widget settings wait for the next run`,
      ]);
      await expect(prisma.cronRun.count({ where: { job: "housekeeping", outcome: "succeeded" } })).resolves.toBe(1);
    } finally {
      await holder.$disconnect();
    }
  });

  // Ruling 86 (SECURITY-3): the erasure a lost shop/redact owed is done anyway
  it("erases a store uninstalled more than 30 days ago, never one uninstalled 29 days ago or an active one", async () => {
    const OLD = "housekeeping-left-31.myshopify.com";
    const RECENT = "housekeeping-left-29.myshopify.com";
    for (const [shop, days] of [
      [OLD, 31],
      [RECENT, 29],
    ] as const) {
      const conn = await seedStore(shop);
      await prisma.connection.update({ where: { id: conn.connectionId }, data: { status: "uninstalled", uninstalledAt: new Date(Date.now() - days * DAY) } });
      await prisma.session.deleteMany({ where: { shop } });
    }
    // Active again after an uninstall long ago (Ruling 41)
    const active = await seedStore(SHOP);
    await prisma.connection.update({ where: { id: active.connectionId }, data: { uninstalledAt: new Date(Date.now() - 90 * DAY) } });
    mockWidgetConfig(SHOP);
    vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(run()).resolves.toMatchObject({ status: 200, body: { storesErased: 1, erasuresLeft: 0, problems: 0 } });

    const left = await prisma.connection.findMany({ select: { externalAccountId: true } });
    expect(left.map((c) => c.externalAccountId).sort()).toEqual([RECENT, SHOP].sort());
    await expect(prisma.merchant.count()).resolves.toBe(2);
    await expect(prisma.tier.count()).resolves.toBe(2);
    await expect(prisma.cronRun.count({ where: { job: "housekeeping", outcome: "succeeded" } })).resolves.toBe(1);
  });

  it("leaves an owed erasure for the next run once its 240 s budget has passed, and counts it", async () => {
    const OLD = "housekeeping-left-31.myshopify.com";
    await ensureMerchant({ shop: OLD, name: OLD, currency: "GBP", timezone: "Europe/London" });
    await prisma.connection.updateMany({ where: { externalAccountId: OLD }, data: { status: "uninstalled", uninstalledAt: new Date(Date.now() - 31 * DAY) } });

    const result = await withDeadline((cut) => {
      cut();
      return run();
    });

    expect(result).toMatchObject({ status: 200, body: { storesErased: 0, erasuresLeft: 1, problems: 0 } });
    await expect(prisma.connection.count()).resolves.toBe(1);
    const partial = await prisma.cronRun.findUniqueOrThrow({ where: { job_outcome: { job: "housekeeping", outcome: "partial" } } });
    expect(partial.errorMessage).toBe("1 failed; first: Error: 1 uninstalled stores were not erased before the deadline");
  });

  it("expires privacy reports past their time, and clears expired locks", async () => {
    const conn = await seedStore(SHOP);
    mockWidgetConfig(SHOP);
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

  describe("failed past-orders imports", () => {
    /**
     * Shopify's answers to a bulk query's launch for `shop`: the app's scopes,
     * then the query, refused while `access.refused` (as Shopify refuses a
     * public app with no IP allowlist since 12 Nov 2026). Counts each launch asked for.
     */
    function mockBulkLaunch(shop: string, o: { onLaunch?: () => unknown } = {}) {
      const access = { refused: true, asked: 0 };
      const link = graphql.link(adminGraphqlUrl(shop));
      server.use(
        link.query("RewardsAccessScopes", () =>
          HttpResponse.json({ data: { currentAppInstallation: { accessScopes: [{ handle: "read_orders" }, { handle: "read_all_orders" }] } } }),
        ),
        link.mutation("RewardsBulkOrders", async () => {
          access.asked++;
          await o.onLaunch?.();
          if (access.refused) return HttpResponse.json({ errors: [{ message: "Bulk queries are not available to this app" }] });
          return HttpResponse.json({
            data: { bulkOperationRunQuery: { bulkOperation: { id: "gid://shopify/BulkOperation/77", status: "CREATED" }, userErrors: [] } },
          });
        }),
      );
      return access;
    }

    /** A store whose import failed, its last launch claimed `launchedAgo` ms ago, installed `installedAgo` ms ago. */
    async function seedFailedImport(shop: string, o: { launchedAgo: number; installedAgo: number }) {
      await seedStore(shop);
      await prisma.connection.updateMany({
        where: { externalAccountId: shop },
        data: {
          installedAt: new Date(Date.now() - o.installedAgo),
          importState: "failed",
          importAttempts: 4,
          importError: "Shopify answered with errors: Bulk queries are not available to this app",
          importLaunchedAt: new Date(Date.now() - o.launchedAgo),
        },
      });
    }

    /** Every store's widget settings as written tonight, so the widget step skips them all. */
    async function widgetsCurrent() {
      for (const connection of await prisma.connection.findMany({ select: { id: true, merchantId: true } })) {
        const value = widgetConfigJson(await widgetConfig(connection.merchantId));
        await prisma.connection.update({ where: { id: connection.id }, data: { widgetConfigSyncedAt: new Date(), widgetConfigValue: value } });
      }
    }

    const importRow = (shop: string) => prisma.connection.findFirstOrThrow({ where: { externalAccountId: shop } });

    it("tries one again once a night, counts a try Shopify refuses as no problem, and starts it once Shopify allows it", async () => {
      await seedFailedImport(SHOP, { launchedAgo: DAY, installedAgo: 2 * DAY });
      // Installed 31 days ago: past the time a failed import is tried again
      await seedFailedImport(QUIET_SHOP, { launchedAgo: DAY, installedAgo: 31 * DAY });
      mockWidgetConfig(SHOP);
      mockWidgetConfig(QUIET_SHOP);
      const access = mockBulkLaunch(SHOP);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      await expect(run()).resolves.toMatchObject({ status: 200, body: { importsTried: 1, importsStarted: 0, importsLeft: 0, problems: 0 } });

      expect(access.asked).toBe(1);
      expect(warn.mock.calls.map((args) => args.join(" "))).toEqual([
        `[housekeeping] Shopify did not start the past-orders import of ${SHOP}; it is tried again tomorrow`,
      ]);
      await expect(importRow(SHOP)).resolves.toMatchObject({ importState: "failed", importOperationId: null });
      await expect(importRow(QUIET_SHOP)).resolves.toMatchObject({ importState: "failed" });
      await expect(prisma.cronRun.count({ where: { job: "housekeeping", outcome: "succeeded" } })).resolves.toBe(1);

      // A second run the same night tries nothing
      await expect(run()).resolves.toMatchObject({ status: 200, body: { importsTried: 0 } });
      expect(access.asked).toBe(1);

      // The next night Shopify runs bulk queries again
      access.refused = false;
      await prisma.connection.updateMany({ where: { externalAccountId: SHOP }, data: { importLaunchedAt: new Date(Date.now() - DAY) } });
      await expect(run()).resolves.toMatchObject({ status: 200, body: { importsTried: 1, importsStarted: 1, problems: 0 } });
      await expect(importRow(SHOP)).resolves.toMatchObject({ importState: "running", importOperationId: "gid://shopify/BulkOperation/77" });
      warn.mockRestore();
    });

    it("tries the store tried longest ago first, so a run the budget cuts short leaves the other for the next night", async () => {
      // By name QUIET_SHOP ("housekeeping-quiet") sorts first; SHOP was tried longer ago, so it comes first
      await seedFailedImport(SHOP, { launchedAgo: 3 * DAY, installedAgo: 5 * DAY });
      await seedFailedImport(QUIET_SHOP, { launchedAgo: 2 * DAY, installedAgo: 5 * DAY });
      await widgetsCurrent();
      mockWidgetConfig(SHOP);
      mockWidgetConfig(QUIET_SHOP);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await withDeadline((cut) => {
        const longestAgo = mockBulkLaunch(SHOP, { onLaunch: cut });
        const lately = mockBulkLaunch(QUIET_SHOP);
        return run().then((r) => ({ ...r, asked: [longestAgo.asked, lately.asked] }));
      });

      expect(result).toMatchObject({ status: 200, body: { importsTried: 1, importsLeft: 1 }, asked: [1, 0] });
      warn.mockRestore();
    });

    it("counts a store whose session can't be loaded as a problem, and tries the next", async () => {
      await seedFailedImport(SHOP, { launchedAgo: DAY, installedAgo: 2 * DAY });
      await seedFailedImport(QUIET_SHOP, { launchedAgo: DAY, installedAgo: 2 * DAY });
      await widgetsCurrent();
      // SHOP has no session left to load
      await prisma.session.delete({ where: { id: `offline_${SHOP}` } });
      const access = mockBulkLaunch(QUIET_SHOP);
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      await expect(run()).resolves.toMatchObject({ status: 200, body: { importsTried: 2, importsLeft: 0, problems: 1 } });

      expect(access.asked).toBe(1);
      expect(errors.mock.calls.map((args) => args.join(" "))).toEqual([expect.stringContaining(`Could not try the past-orders import of ${SHOP} again`)]);
      errors.mockRestore();
      warn.mockRestore();
    });

    it("leaves a failed import for the next night once its 240 s budget has passed, and counts it", async () => {
      await seedFailedImport(SHOP, { launchedAgo: DAY, installedAgo: 2 * DAY });
      const access = mockBulkLaunch(SHOP);

      const result = await withDeadline((cut) => {
        cut();
        return run();
      });

      expect(result).toMatchObject({ status: 200, body: { importsTried: 0, importsLeft: 1 } });
      expect(access.asked).toBe(0);
      const partial = await prisma.cronRun.findUniqueOrThrow({ where: { job_outcome: { job: "housekeeping", outcome: "partial" } } });
      expect(partial.errorMessage).toMatch(/1 stores' failed past-orders imports were not tried again/);
    });
  });
});
