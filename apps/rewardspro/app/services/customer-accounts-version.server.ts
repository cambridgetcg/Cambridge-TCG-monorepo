/**
 * Which customer accounts a shop uses (Admin API Shop.customerAccountsV2).
 *
 * Shopify lets a shopper spend store credit at checkout only when signed in
 * through new customer accounts or using Shop Pay, and "Store credit isn't
 * available for legacy customer accounts"
 * (help.shopify.com/en/manual/customers/store-credit). The membership proxy
 * returns this so the widget explains spending only where it holds.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { createLogger } from "~/services/logger.server";

const logger = createLogger("CustomerAccountsVersion");

export type CustomerAccountsVersion = "CLASSIC" | "NEW_CUSTOMER_ACCOUNTS";

const VERSIONS: ReadonlySet<string> = new Set(["CLASSIC", "NEW_CUSTOMER_ACCOUNTS"]);

const QUERY_CUSTOMER_ACCOUNTS_VERSION = `#graphql
  query CustomerAccountsVersion {
    shop {
      customerAccountsV2 {
        customerAccountsVersion
      }
    }
  }
`;

// Merchants rarely switch, so one answer per shop per instance is enough.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { version: CustomerAccountsVersion; fetchedAt: number }>();

/**
 * The shop's customer-account version, or null when it can't be told: no
 * Admin API client (no offline session), Shopify can't be reached, or an
 * answer this code doesn't know. Only answers Shopify gave are cached.
 */
export async function getCustomerAccountsVersion(
  shop: string,
  admin: AdminApiContext | undefined,
): Promise<CustomerAccountsVersion | null> {
  const cached = cache.get(shop);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.version;
  if (!admin) return null;

  try {
    const response = await admin.graphql(QUERY_CUSTOMER_ACCOUNTS_VERSION);
    const body = await response.json();
    const version = body?.data?.shop?.customerAccountsV2?.customerAccountsVersion;
    if (typeof version !== "string" || !VERSIONS.has(version)) return null;

    cache.set(shop, { version: version as CustomerAccountsVersion, fetchedAt: Date.now() });
    return version as CustomerAccountsVersion;
  } catch (error) {
    logger.warn("Could not read the shop's customer accounts version", {
      shop,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
