/**
 * A shopper's store credit balance as Shopify holds it now (Admin API
 * Customer.storeCreditAccounts).
 *
 * RewardsPro's copy (Customer.storeCredit) changes when the app itself
 * credits or debits, or the merchant runs Sync Store Credit in Settings, so
 * credit the shopper spends at checkout, or the merchant changes in Shopify
 * admin, doesn't reach it. The membership proxy returns this balance instead,
 * and the copy only when Shopify can't say.
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

// Brief, like the widget's own 30 seconds, so credit spent at checkout shows soon
const CACHE_TTL_MS = 30 * 1000;
const cache = new Map<string, { balance: number; fetchedAt: number }>();

function remember(key: string, balance: number) {
  const now = Date.now();
  // One entry per shopper who opened the widget: drop the stale ones
  for (const [k, entry] of cache) {
    if (now - entry.fetchedAt >= CACHE_TTL_MS) cache.delete(k);
  }
  cache.set(key, { balance, fetchedAt: now });
}

/**
 * The shopper's balance in the shop's currency (0 with no account in it), or
 * null when it can't be told: no Admin API client (no offline session),
 * Shopify can't be reached, or an answer this code can't read. Only answers
 * Shopify gave are cached.
 */
export async function getLiveStoreCreditBalance(
  shop: string,
  customerId: string,
  admin: AdminApiContext | undefined,
): Promise<number | null> {
  const key = `${shop}:${customerId}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.balance;
  if (!admin) return null;

  try {
    const response = await admin.graphql(QUERY_STORE_CREDIT_BALANCE, {
      variables: { customerId: `gid://shopify/Customer/${customerId}` },
    });
    const body = await response.json();
    const currency = body?.data?.shop?.currencyCode;
    const accounts = body?.data?.customer?.storeCreditAccounts;
    if (typeof currency !== "string" || !Array.isArray(accounts?.nodes)) return null;

    const account = accounts.nodes.find(
      (node: { balance?: { currencyCode?: unknown } } | null) => node?.balance?.currencyCode === currency,
    );
    // Not among the first accounts, and there are more: it can't be told
    if (!account && accounts.pageInfo?.hasNextPage !== false) return null;
    const balance = account ? Number.parseFloat(account.balance.amount) : 0;
    if (!Number.isFinite(balance)) return null;

    remember(key, balance);
    return balance;
  } catch (error) {
    logger.warn("Could not read the shopper's store credit balance", {
      shop,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
