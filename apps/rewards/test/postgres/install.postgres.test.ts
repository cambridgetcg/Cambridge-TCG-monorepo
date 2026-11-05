import { Session } from "@shopify/shopify-app-react-router/server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
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

/**
 * An Admin API client that answers the shop read with `body` and the
 * past-orders import's start (its scopes read and bulk query, A17) as
 * Shopify would, and records each query.
 */
function adminAnswering(body: unknown) {
  const graphql = vi.fn<(query: string) => Promise<Response>>(async (query) => {
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
  return { admin: { graphql } as unknown as AdminApiContext, graphql };
}

function shopAnswer(name: string) {
  return { data: { shop: { name, currencyCode: "JPY", ianaTimezone: "Asia/Tokyo" } } };
}

describe.skipIf(!hasTestDatabase)("onAppOpened", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates the merchant and connection from Shopify's shop details", async () => {
    const { admin, graphql } = adminAnswering(shopAnswer("Install Test"));

    await onAppOpened({ session, admin });

    // The shop read, then the past-orders import's start (first open only)
    expect(graphql.mock.calls.map(([query]) => /(?:query|mutation) (\w+)/.exec(query)?.[1])).toEqual([
      "RewardsShopDetails",
      "RewardsAccessScopes",
      "RewardsBulkOrders",
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

    // A later open costs the one shop read: the import has started
    expect(later.graphql).toHaveBeenCalledTimes(1);

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

    await onAppOpened({ session, admin: { graphql } as unknown as AdminApiContext });

    await expect(prisma.connection.findFirstOrThrow()).resolves.toMatchObject({
      status: "active",
      importState: "running",
      importOperationId: null,
      importError: expect.stringContaining("INVALID"),
    });
    expect(errors).toHaveBeenCalledWith(expect.stringContaining(SHOP), expect.stringContaining("Invalid bulk query"));
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
