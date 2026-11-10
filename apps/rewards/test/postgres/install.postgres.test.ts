import { Session } from "@shopify/shopify-app-react-router/server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { flushWaitUntil } from "~/lib/wait-until.server";
import { onAppOpened } from "~/shopify/install.server";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

const SHOP = "install-test.myshopify.com";

const session = new Session({
  id: `offline_${SHOP}`,
  shop: SHOP,
  state: "state",
  isOnline: false,
  accessToken: "shpat_install_test_token",
});

/** Each widget settings value an Admin API client below wrote, parsed. */
type Written = Array<{ namespace: string; key: string; value: unknown }>;

/**
 * An Admin API client that answers the shop read with `body`, the
 * past-orders import's start (its scopes read and bulk query, A17) and the
 * widget's settings write (OPERATIONS-7) as Shopify would, and records each
 * query and each widget value written. `widget` replaces the answer to the
 * write.
 */
function adminAnswering(body: unknown, o: { widget?: unknown } = {}) {
  const written: Written = [];
  const graphql = vi.fn<(query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>>(async (query, options) => {
    if (/query RewardsAppInstallation\b/.test(query)) {
      return Response.json({ data: { currentAppInstallation: { id: "gid://shopify/AppInstallation/42" } } });
    }
    if (/mutation RewardsWidgetConfig\b/.test(query)) {
      const [metafield] = options!.variables!.metafields as Array<{ namespace: string; key: string; value: string }>;
      written.push({ namespace: metafield.namespace, key: metafield.key, value: JSON.parse(metafield.value) });
      return Response.json(o.widget ?? { data: { metafieldsSet: { metafields: [{ id: "gid://shopify/Metafield/1" }], userErrors: [] } } });
    }
    if (/query RewardsAccessScopes\b/.test(query)) {
      return Response.json({ data: { currentAppInstallation: { accessScopes: [{ handle: "read_orders" }, { handle: "read_all_orders" }] } } });
    }
    if (/mutation RewardsBulkOrders\b/.test(query)) {
      return Response.json({
        data: { bulkOperationRunQuery: { bulkOperation: { id: "gid://shopify/BulkOperation/1", status: "CREATED" }, userErrors: [] } },
      });
    }
    return Response.json(body);
  });
  return { admin: { graphql } as unknown as AdminApiContext, graphql, written };
}

function shopAnswer(name: string) {
  return { data: { shop: { name, currencyCode: "JPY", ianaTimezone: "Asia/Tokyo" } } };
}

describe.skipIf(!hasTestDatabase)("onAppOpened", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    await flushWaitUntil();
    vi.restoreAllMocks();
  });

  it("creates the merchant and connection from Shopify's shop details", async () => {
    const { admin, graphql } = adminAnswering(shopAnswer("Install Test"));

    await onAppOpened({ session, admin });
    await flushWaitUntil();

    // The shop read, the past-orders import's start (first open only), then the widget's settings
    expect(graphql.mock.calls.map(([query]) => /(?:query|mutation) (\w+)/.exec(query)?.[1])).toEqual([
      "RewardsShopDetails",
      "RewardsAccessScopes",
      "RewardsBulkOrders",
      "RewardsAppInstallation",
      "RewardsWidgetConfig",
    ]);
    const connection = await prisma.connection.findUniqueOrThrow({
      where: { platform_externalAccountId: { platform: "shopify", externalAccountId: SHOP } },
      include: { merchant: true },
    });
    expect(connection.status).toBe("active");
    expect(connection.merchant).toMatchObject({ name: "Install Test", currency: "JPY", timezone: "Asia/Tokyo" });
  });

  it("is idempotent: every later token exchange keeps one merchant and refreshes its details", async () => {
    await onAppOpened({ session, admin: adminAnswering(shopAnswer("Install Test")).admin });
    const later = adminAnswering(shopAnswer("Install Test Renamed"));
    await onAppOpened({ session, admin: later.admin });
    await flushWaitUntil();

    // A later open costs the shop read and the widget's write: the import has started
    expect(later.graphql).toHaveBeenCalledTimes(3);

    await expect(prisma.connection.count()).resolves.toBe(1);
    const merchants = await prisma.merchant.findMany();
    expect(merchants).toHaveLength(1);
    expect(merchants[0].name).toBe("Install Test Renamed");
  });

  it("records the time of every token exchange on the connection, so an older uninstall can't undo it (Ruling 13)", async () => {
    const before = Date.now();
    await onAppOpened({ session, admin: adminAnswering(shopAnswer("Install Test")).admin });
    const first = await prisma.connection.findFirstOrThrow();
    expect(first.lastAuthAt!.getTime()).toBeGreaterThanOrEqual(before);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await onAppOpened({ session, admin: adminAnswering(shopAnswer("Install Test")).admin });

    const second = await prisma.connection.findFirstOrThrow();
    expect(second.lastAuthAt!.getTime()).toBeGreaterThan(first.lastAuthAt!.getTime());
    expect(second.activatedAt).toEqual(first.activatedAt);
  });

  it("opens the app when Shopify refuses to start the past-orders import, keeping the error for the next poll", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const graphql = vi.fn<(query: string) => Promise<Response>>(async (query) => {
      if (/query RewardsAccessScopes\b/.test(query)) {
        return Response.json({ data: { currentAppInstallation: { accessScopes: [{ handle: "read_orders" }] } } });
      }
      if (/mutation RewardsBulkOrders\b/.test(query)) {
        return Response.json({
          data: { bulkOperationRunQuery: { bulkOperation: null, userErrors: [{ field: ["query"], message: "Invalid bulk query", code: "INVALID" }] } },
        });
      }
      return Response.json(shopAnswer("Install Test"));
    });

    const before = Date.now();
    await onAppOpened({ session, admin: { graphql } as unknown as AdminApiContext });

    const connection = await prisma.connection.findFirstOrThrow();
    expect(connection).toMatchObject({
      status: "active",
      importState: "running",
      importOperationId: null,
      importError: expect.stringContaining("INVALID"),
      importLaunchedAt: expect.any(Date),
    });
    // The next poll restarts it 5 minutes after this launch
    expect(connection.importLaunchedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining(SHOP), expect.stringContaining("Invalid bulk query"));
  });

  // OPERATIONS-7: a reinstall keeps the merchant's switch and tiers, but its guests need the widget's settings now, not at 03:00
  it("writes the widget's settings on every open, as the database holds them, and records the write", async () => {
    const first = adminAnswering(shopAnswer("Install Test"));
    await onAppOpened({ session, admin: first.admin });
    await flushWaitUntil();
    expect(first.written).toEqual([{ namespace: "rewards", key: "config", value: { running: false, basePercent: null } }]);

    // Cashback on with a 5% base rate, then an uninstall and a reinstall
    const connection = await prisma.connection.findFirstOrThrow();
    await prisma.tier.create({ data: { merchantId: connection.merchantId, name: "Everyone", minSpend: "0", cashbackPercent: "5", position: 0 } });
    await prisma.merchant.update({ where: { id: connection.merchantId }, data: { running: true } });
    await prisma.connection.update({ where: { id: connection.id }, data: { status: "uninstalled", uninstalledAt: new Date() } });

    const reopened = adminAnswering(shopAnswer("Install Test"));
    await onAppOpened({ session, admin: reopened.admin });
    await flushWaitUntil();

    expect(reopened.written).toEqual([{ namespace: "rewards", key: "config", value: { running: true, basePercent: 5 } }]);
    await expect(prisma.connection.findFirstOrThrow()).resolves.toMatchObject({
      status: "active",
      widgetConfigSyncedAt: expect.any(Date),
      widgetConfigValue: JSON.stringify({ running: true, basePercent: 5 }),
    });
  });

  it("opens the app when the widget's settings can't be written, logging the store and the reason", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const refused = { data: { metafieldsSet: { metafields: [], userErrors: [{ field: ["metafields"], message: "Too many metafields", code: "LIMIT_EXCEEDED" }] } } };
    const { admin } = adminAnswering(shopAnswer("Install Test"), { widget: refused });

    await onAppOpened({ session, admin });
    await flushWaitUntil();

    await expect(prisma.connection.findFirstOrThrow()).resolves.toMatchObject({ status: "active", importState: "running", widgetConfigSyncedAt: null });
    expect(errors.mock.calls.map((args) => args.join(" "))).toEqual([
      `[install] Could not write the widget's settings for ${SHOP}: Shopify refused the widget config: LIMIT_EXCEEDED: Too many metafields`,
    ]);
  });

  // Ruling 80: an open never waits on the widget
  it("answers the open without waiting for the widget's write, which still lands after it", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const { admin, graphql, written } = adminAnswering(shopAnswer("Install Test"));
    const answer = graphql.getMockImplementation()!;
    graphql.mockImplementation(async (query, options) => {
      if (/query RewardsAppInstallation\b/.test(query)) await held;
      return answer(query, options);
    });

    await onAppOpened({ session, admin });

    expect(written).toEqual([]);
    await expect(prisma.connection.findFirstOrThrow()).resolves.toMatchObject({ status: "active", widgetConfigSyncedAt: null });
    release();
    await flushWaitUntil();
    expect(written).toEqual([{ namespace: "rewards", key: "config", value: { running: false, basePercent: null } }]);
    await expect(prisma.connection.findFirstOrThrow()).resolves.toMatchObject({ widgetConfigSyncedAt: expect.any(Date) });
  });

  it("logs a re-auth answer to the widget's write after the open, and never throws it", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin, graphql } = adminAnswering(shopAnswer("Install Test"));
    const answer = graphql.getMockImplementation()!;
    graphql.mockImplementation(async (query, options) => {
      if (/query RewardsAppInstallation\b/.test(query)) throw new Response(null, { status: 401 });
      return answer(query, options);
    });

    await onAppOpened({ session, admin });
    await flushWaitUntil();

    expect(errors.mock.calls.map((args) => args.join(" "))).toEqual([`[install] Could not write the widget's settings for ${SHOP}: HTTP 401`]);
  });

  it("writes nothing and fails the open when Shopify's answer has no shop", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin } = adminAnswering({ errors: [{ message: "Internal error" }] });

    await expect(onAppOpened({ session, admin })).rejects.toThrow(/RewardsShopDetails/);

    await expect(prisma.merchant.count()).resolves.toBe(0);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining(SHOP), expect.any(Error));
  });

  it("passes the library's re-auth redirect on unchanged and does not log it", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const reauth = new Response(null, { status: 302 });
    const graphql = vi.fn<(query: string) => Promise<Response>>(async () => {
      throw reauth;
    });
    const admin = { graphql } as unknown as AdminApiContext;

    const thrown = await onAppOpened({ session, admin }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(thrown).toBe(reauth);
    expect(errors).not.toHaveBeenCalled();
    await expect(prisma.merchant.count()).resolves.toBe(0);
  });
});
