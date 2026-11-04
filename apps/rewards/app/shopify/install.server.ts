/**
 * What happens when a merchant opens the app.
 *
 * Wired as shopifyApp's `hooks.afterAuth`, so it runs after every token
 * exchange, not only at install: with expiring offline tokens that is about
 * hourly. It must stay idempotent and cheap: one 1-point shop read and one
 * transaction that creates or refreshes the merchant and its connection.
 */
import type { AdminApiContext, Session } from "@shopify/shopify-app-react-router/server";
import { ensureMerchant } from "~/lib/merchant.server";
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

export async function onAppOpened({ session, admin }: { session: Session; admin: AdminApiContext }): Promise<void> {
  try {
    const response = await admin.graphql(RewardsShopDetails);
    const shop = shopDetailsFrom(await response.json());
    await ensureMerchant({
      shop: session.shop,
      name: shop.name,
      currency: shop.currencyCode,
      timezone: shop.ianaTimezone,
    });
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
