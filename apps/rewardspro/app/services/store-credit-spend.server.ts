/**
 * What stops a shop's shoppers spending store credit at checkout.
 *
 * Cashback reaches customers as Shopify store credit. Shopify lets a shopper
 * spend it only when signed in through new customer accounts or using Shop
 * Pay ("Store credit isn't available for legacy customer accounts"), and only
 * while Store credit is turned on in Settings > Customer accounts
 * (help.shopify.com/en/manual/customers/store-credit). The dashboard warns
 * about each of these that Shopify confirms.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { createLogger } from "~/services/logger.server";

const logger = createLogger("StoreCreditSpend");

/** In the order the merchant fixes them in Settings > Customer accounts */
export type StoreCreditSpendProblem = "legacy-accounts" | "sign-in-links-hidden" | "store-credit-off";

const QUERY_CUSTOMER_ACCOUNTS = `#graphql
  query StoreCreditSpendCustomerAccounts {
    shop {
      customerAccountsV2 {
        customerAccountsVersion
        loginLinksVisibleOnStorefrontAndCheckout
      }
    }
  }
`;

const QUERY_STORE_CREDIT = `#graphql
  query StoreCreditSpendConfiguration {
    storeCreditConfiguration {
      storeCreditEnabled
    }
  }
`;

// Two requests, so one Shopify can't answer doesn't hide what the other shows
async function ask(admin: AdminApiContext, query: string, shop: string) {
  try {
    const response = await admin.graphql(query);
    const body = await response.json();
    return body?.data;
  } catch (error) {
    logger.warn("Could not read the shop's store credit setup", {
      shop,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * The problems Shopify confirms, asked fresh on every call so the warning
 * goes as soon as the merchant fixes it. An answer Shopify couldn't give, or
 * one this code doesn't know, reports nothing.
 */
export async function getStoreCreditSpendProblems(
  admin: AdminApiContext,
  shop: string,
): Promise<StoreCreditSpendProblem[]> {
  const [accounts, storeCredit] = await Promise.all([
    ask(admin, QUERY_CUSTOMER_ACCOUNTS, shop),
    ask(admin, QUERY_STORE_CREDIT, shop),
  ]);
  const settings = accounts?.shop?.customerAccountsV2;

  const problems: StoreCreditSpendProblem[] = [];
  if (settings?.customerAccountsVersion === "CLASSIC") problems.push("legacy-accounts");
  if (settings?.loginLinksVisibleOnStorefrontAndCheckout === false) problems.push("sign-in-links-hidden");
  if (storeCredit?.storeCreditConfiguration?.storeCreditEnabled === false) problems.push("store-credit-off");
  return problems;
}
