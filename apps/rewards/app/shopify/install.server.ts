/**
 * What happens when a merchant opens the app.
 *
 * Wired as shopifyApp's `hooks.afterAuth`, so it runs after every token
 * exchange, not only at install: with expiring offline tokens that is about
 * hourly. It must stay idempotent and cheap: one 1-point shop read and one
 * transaction that creates or refreshes the merchant and its connection,
 * then, only while the connection's past-orders import has not started
 * (the first open, or the first after shop/redact erased it; spec 6.5), the
 * import's start: two more calls. Last, the widget's settings are written
 * (syncWidgetConfig, two calls), so a store reinstalled with cashback on
 * shows guests the earn line at once rather than after the nightly rewrite
 * (OPERATIONS-7). That write runs after the response (waitUntil), so an open
 * never waits on it (Ruling 80); a failed write is logged, and the nightly
 * step and the admin's own writes back it.
 */
import type { AdminApiContext, Session } from "@shopify/shopify-app-react-router/server";
import { ensureMerchant } from "~/lib/merchant.server";
import { waitUntil } from "~/lib/wait-until.server";
import { startImport } from "./bulk-import.server";
import { RewardsShopDetails } from "./graphql";
import { syncWidgetConfig } from "./widget-config.server";

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
async function startPastOrders(
  admin: AdminApiContext,
  connection: { connectionId: string; importState: string; installedAt: Date },
  shop: string,
): Promise<void> {
  if (connection.importState !== "not_started") return;
  try {
    await startImport(admin, connection.connectionId, connection.installedAt);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error(`[install] Could not start the past-orders import for ${shop}:`, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Write the widget's settings, best effort, after the open has answered:
 * a failure is logged with the store and the reason (never a buyer's
 * details), a thrown Response (the library's re-auth answer) included, since
 * nothing is left to pass it to; it never throws. The nightly rewrite visits
 * the store again.
 */
async function tellWidget(admin: AdminApiContext, connection: { merchantId: string; connectionId: string }, shop: string): Promise<void> {
  try {
    await syncWidgetConfig(admin, connection);
  } catch (error) {
    const reason = error instanceof Response ? `HTTP ${error.status}` : error instanceof Error ? error.message : String(error);
    console.error(`[install] Could not write the widget's settings for ${shop}: ${reason}`);
  }
}

export async function onAppOpened({ session, admin }: { session: Session; admin: AdminApiContext }): Promise<void> {
  try {
    const response = await admin.graphql(RewardsShopDetails);
    const shop = shopDetailsFrom(await response.json());
    const connection = await ensureMerchant({
      shop: session.shop,
      name: shop.name,
      currency: shop.currencyCode,
      timezone: shop.ianaTimezone,
    });
    await startPastOrders(admin, connection, session.shop);
    // After the response: an open never waits on the widget (Ruling 80)
    waitUntil(tellWidget(admin, connection, session.shop));
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
