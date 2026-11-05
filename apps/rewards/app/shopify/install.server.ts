/**
 * What happens when a merchant opens the app.
 *
 * Wired as shopifyApp's `hooks.afterAuth`, so it runs after every token
 * exchange, not only at install: with expiring offline tokens that is about
 * hourly. It must stay idempotent and cheap: one 1-point shop read and one
 * transaction that creates or refreshes the merchant and its connection,
 * then, only while the connection's past-orders import has not started
 * (the first open, or the first after shop/redact erased it; spec 6.5), the
 * import's start: two more calls.
 */
import type { AdminApiContext, Session } from "@shopify/shopify-app-react-router/server";
import prisma from "~/db.server";
import { ensureMerchant } from "~/lib/merchant.server";
import { startImport } from "./bulk-import.server";
import { RewardsShopDetails } from "./graphql";

interface ShopDetails {
  name: string;
  currencyCode: string;
  ianaTimezone: string;
}

function shopDetailsFrom(body: unknown): ShopDetails {
  const shop = (body as { data?: { shop?: Partial<ShopDetails> | null } } | null)?.data?.shop;
  if (
    typeof shop?.name !== "string" ||
    typeof shop.currencyCode !== "string" ||
    typeof shop.ianaTimezone !== "string"
  ) {
    throw new Error("RewardsShopDetails answered without the shop's name, currency and time zone");
  }
  return { name: shop.name, currencyCode: shop.currencyCode, ianaTimezone: shop.ianaTimezone };
}

/**
 * Start the past-orders import if it has not started. Shopify failing to
 * start it doesn't fail the open: it is logged, and the import (now running
 * with no operation) is started again by a later poll. The library's re-auth
 * redirect passes on.
 */
async function startPastOrders(admin: AdminApiContext, connectionId: string, shop: string): Promise<void> {
  const connection = await prisma.connection.findUniqueOrThrow({
    where: { id: connectionId },
    select: { importState: true, installedAt: true },
  });
  if (connection.importState !== "not_started") return;
  try {
    await startImport(admin, connectionId, connection.installedAt);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error(`[install] Could not start the past-orders import for ${shop}:`, error instanceof Error ? error.message : String(error));
  }
}

export async function onAppOpened({ session, admin }: { session: Session; admin: AdminApiContext }): Promise<void> {
  try {
    const response = await admin.graphql(RewardsShopDetails);
    const shop = shopDetailsFrom(await response.json());
    const { connectionId } = await ensureMerchant({
      shop: session.shop,
      name: shop.name,
      currency: shop.currencyCode,
      timezone: shop.ianaTimezone,
    });
    await startPastOrders(admin, connectionId, session.shop);
  } catch (error) {
    // The library answers a failed afterAuth with a bare 500 and logs
    // nothing, so the cause is logged here before the open fails. A thrown
    // Response is the library's own answer (a re-auth redirect) and passes on.
    if (!(error instanceof Response)) {
      console.error(`[install] Opening the app failed for ${session.shop}:`, error);
    }
    throw error;
  }
}
