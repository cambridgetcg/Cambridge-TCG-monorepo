/**
 * A shopper's store credit balance as Shopify holds it now (Admin API
 * Customer.storeCreditAccounts).
 *
 * RewardsPro's copy (Customer.storeCredit) is refreshed when the app itself
 * credits or debits, on each orders/create (webhooks.orders.create.tsx, so a
 * spend at checkout reaches it once that webhook lands) and when the merchant
 * runs Sync Store Credit in Settings. Credit changed in Shopify admin, by
 * another app or by expiry doesn't reach it until then, and it adds every
 * currency together. Shopify's balance is the one the shopper can spend, so
 * the membership proxy returns it instead, and the copy only when Shopify
 * can't say.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { createLogger } from "~/services/logger.server";

const logger = createLogger("StoreCreditBalance");

// A shopper holds one account per currency. The widget formats the balance in
// the shop's currency (Liquid shop.currency), which shop.currencyCode is.
const QUERY_STORE_CREDIT_BALANCE = `#graphql
  query MembershipStoreCreditBalance($customerId: ID!) {
    shop {
      currencyCode
    }
    customer(id: $customerId) {
      storeCreditAccounts(first: 10) {
        nodes {
          balance {
            amount
            currencyCode
          }
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  }
`;

// Brief, like the widget's own 30 seconds, so a change made in Shopify shows soon
const CACHE_TTL_MS = 30 * 1000;
const cache = new Map<string, { balance: number; fetchedAt: number }>();

// The widget gives up after 10 seconds and shows nothing; the copy is better
const TIMEOUT_MS = 2500;

// The app's own credits and debits draw on the shop's Admin API budget too, so
// after Shopify fails or is slow, or the budget falls below half, storefront
// reads give way for a while and the copy stands
const BACK_OFF_MS = 10 * 1000;
const backOffUntil = new Map<string, number>();

function remember(key: string, balance: number) {
  const now = Date.now();
  // One entry per shopper who opened the widget: drop the stale ones
  for (const [k, entry] of cache) {
    if (now - entry.fetchedAt >= CACHE_TTL_MS) cache.delete(k);
  }
  cache.set(key, { balance, fetchedAt: now });
}

/**
 * The shopper's balance in the shop's currency (0 with no credit at all), or
 * null when it can't be told: no Admin API client (no offline session),
 * Shopify can't be reached in time or is being given way to, the shopper's
 * only credit is in another currency, or an answer this code can't read. Only
 * answers Shopify gave are cached.
 */
export async function getLiveStoreCreditBalance(
  shop: string,
  customerId: string,
  admin: AdminApiContext | undefined,
): Promise<number | null> {
  const key = `${shop}:${customerId}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.balance;
  if (!admin || Date.now() < (backOffUntil.get(shop) ?? 0)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await admin.graphql(QUERY_STORE_CREDIT_BALANCE, {
      variables: { customerId: `gid://shopify/Customer/${customerId}` },
      signal: controller.signal,
    });
    const body = await response.json();
    const throttle = body?.extensions?.cost?.throttleStatus;
    if (throttle?.currentlyAvailable < throttle?.maximumAvailable / 2) backOffUntil.set(shop, Date.now() + BACK_OFF_MS);

    const currency = body?.data?.shop?.currencyCode;
    const accounts = body?.data?.customer?.storeCreditAccounts;
    if (typeof currency !== "string" || !Array.isArray(accounts?.nodes)) return null;

    type Account = { balance?: { amount?: unknown; currencyCode?: unknown } } | null;
    const account = accounts.nodes.find((node: Account) => node?.balance?.currencyCode === currency);
    const balance = account ? Number.parseFloat(account.balance.amount) : 0;
    if (!Number.isFinite(balance)) return null;
    // None to show in the shop's currency, but there may be credit the widget
    // can't show: in another currency (the app issues cashback in Settings >
    // Currency, which can differ), or on a later page. Not 0 then
    const elsewhere = accounts.nodes.some((node: Account) => Number.parseFloat(String(node?.balance?.amount)) > 0);
    if (balance === 0 && (elsewhere || accounts.pageInfo?.hasNextPage !== false)) return null;

    remember(key, balance);
    return balance;
  } catch (error) {
    backOffUntil.set(shop, Date.now() + BACK_OFF_MS);
    logger.warn("Could not read the shopper's store credit balance", {
      shop,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
