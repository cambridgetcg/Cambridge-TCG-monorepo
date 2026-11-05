/**
 * What the shop's settings allow buyers to do with store credit.
 *
 * Cashback reaches buyers as Shopify store credit. Shopify lets a buyer
 * spend it only when signed in through new customer accounts or using Shop
 * Pay ("Store credit isn't available for legacy customer accounts"), and only
 * while Store credit is turned on in Settings > Customer accounts
 * (help.shopify.com/en/manual/customers/store-credit). The proxy tells the
 * widget which accounts the shop uses, so it explains spending only where it
 * holds; Home warns about each problem Shopify confirms.
 *
 * Carried from apps/rewardspro/app/services/customer-accounts-version.server.ts
 * (getCustomerAccountsVersion) and store-credit-spend.server.ts
 * (getStoreCreditSpendProblems), with one change: each call to Shopify has a
 * time limit, so a store that doesn't answer can't hold up the widget.
 */
import { askShopify } from "./ask.server";
import { RewardsCustomerAccounts, RewardsStoreCreditConfig, type GraphqlClient } from "./graphql";

export type CustomerAccountsVersion = "CLASSIC" | "NEW_CUSTOMER_ACCOUNTS";

/** In the order the merchant fixes them in Settings > Customer accounts. */
export type StoreCreditSpendProblem = "legacy-accounts" | "sign-in-links-hidden" | "store-credit-off";

/** How long a shop check waits for Shopify: the widget's balance read's 2.5 s. */
export const SHOP_CHECK_TIMEOUT_MS = 2500;

const VERSIONS: ReadonlySet<string> = new Set(["CLASSIC", "NEW_CUSTOMER_ACCOUNTS"]);

// Merchants rarely switch, so one answer per shop per instance is enough
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { version: CustomerAccountsVersion; fetchedAt: number }>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One document's `data`, or undefined when Shopify couldn't be asked or answered without it (logged). */
async function ask(admin: GraphqlClient, query: string, shop: string): Promise<Record<string, unknown> | undefined> {
  try {
    const body = await askShopify(admin, query, {}, SHOP_CHECK_TIMEOUT_MS);
    return isRecord(body) && isRecord(body.data) ? body.data : undefined;
  } catch (error) {
    console.warn(`[shop-checks] Could not read the store credit setup of ${shop}:`, error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

function accountSettings(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const shop = data?.shop;
  const settings = isRecord(shop) ? shop.customerAccountsV2 : undefined;
  return isRecord(settings) ? settings : undefined;
}

/**
 * The shop's customer accounts version, or null when it can't be told: no
 * Admin API client (no offline session), Shopify can't be reached in time,
 * or an answer this code doesn't know. Only answers Shopify gave are cached.
 */
export async function customerAccountsVersion(
  shop: string,
  admin: GraphqlClient | undefined,
): Promise<CustomerAccountsVersion | null> {
  const cached = cache.get(shop);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.version;
  if (!admin) return null;

  const version = accountSettings(await ask(admin, RewardsCustomerAccounts, shop))?.customerAccountsVersion;
  if (typeof version !== "string" || !VERSIONS.has(version)) return null;
  cache.set(shop, { version: version as CustomerAccountsVersion, fetchedAt: Date.now() });
  return version as CustomerAccountsVersion;
}

/**
 * The problems Shopify confirms, asked fresh on every call so a warning goes
 * as soon as the merchant fixes it. Two requests, so one Shopify can't
 * answer doesn't hide what the other shows; an answer Shopify couldn't give,
 * or one this code doesn't know, reports nothing.
 */
export async function storeCreditSpendProblems(admin: GraphqlClient, shop: string): Promise<StoreCreditSpendProblem[]> {
  const [accounts, storeCredit] = await Promise.all([ask(admin, RewardsCustomerAccounts, shop), ask(admin, RewardsStoreCreditConfig, shop)]);
  const settings = accountSettings(accounts);
  const configuration = storeCredit?.storeCreditConfiguration;

  const problems: StoreCreditSpendProblem[] = [];
  if (settings?.customerAccountsVersion === "CLASSIC") problems.push("legacy-accounts");
  if (settings?.loginLinksVisibleOnStorefrontAndCheckout === false) problems.push("sign-in-links-hidden");
  if (isRecord(configuration) && configuration.storeCreditEnabled === false) problems.push("store-credit-off");
  return problems;
}
