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

/** An Admin API client that answers the shop read with `body`, and records each query. */
function adminAnswering(body: unknown) {
  const graphql = vi.fn<(query: string) => Promise<Response>>(async () => Response.json(body));
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

    expect(graphql).toHaveBeenCalledTimes(1);
    expect(graphql.mock.calls[0][0]).toMatch(/query RewardsShopDetails\b/);
    const connection = await prisma.connection.findUniqueOrThrow({
      where: { platform_externalAccountId: { platform: "shopify", externalAccountId: SHOP } },
      include: { merchant: true },
    });
    expect(connection.status).toBe("active");
    expect(connection.merchant).toMatchObject({ name: "Install Test", currency: "JPY", timezone: "Asia/Tokyo" });
  });

  it("is idempotent: every later token exchange keeps one merchant and refreshes its details", async () => {
    await onAppOpened({ session, admin: adminAnswering(shopAnswer("Install Test")).admin });
    await onAppOpened({ session, admin: adminAnswering(shopAnswer("Install Test Renamed")).admin });

    await expect(prisma.connection.count()).resolves.toBe(1);
    const merchants = await prisma.merchant.findMany();
    expect(merchants).toHaveLength(1);
    expect(merchants[0].name).toBe("Install Test Renamed");
  });

  it("writes nothing and fails the open when Shopify's answer has no shop", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin } = adminAnswering({ errors: [{ message: "Internal error" }] });

    await expect(onAppOpened({ session, admin })).rejects.toThrow(/RewardsShopDetails/);

    await expect(prisma.merchant.count()).resolves.toBe(0);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining(SHOP), expect.any(Error));
  });
});
