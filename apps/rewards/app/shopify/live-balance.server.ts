import type { Decimal } from "decimal.js";
import { Money } from "~/lib/money";
import type { GraphqlClient } from "./graphql";
import { readBalance } from "./store-credit-rail.server";

/**
 * A buyer's store credit balance as Shopify holds it now, for the widget
 * (spec 5). RewardsPro keeps no copy of the balance (spec 6.2), so when
 * Shopify can't say, the answer is null and the widget says "Your store
 * credit shows at checkout". Carried from
 * apps/rewardspro/app/services/store-credit-balance.server.ts (PR #134), with
 * the account picked by the currency asked for instead of the shop's.
 */

// Brief, like the widget's own 30 seconds, so a change made in Shopify shows soon
const CACHE_TTL_MS = 30 * 1000;
const cache = new Map<string, { balance: Decimal; fetchedAt: number }>();

// The app's own credits and debits draw on the shop's Admin API budget too, so
// after Shopify fails or is slow, or the budget falls below half, storefront
// reads give way for a while
const BACK_OFF_MS = 10 * 1000;
const backOffUntil = new Map<string, number>();

function remember(key: string, balance: Decimal) {
  const now = Date.now();
  // One entry per buyer and currency asked for: drop the stale ones
  for (const [k, entry] of cache) {
    if (now - entry.fetchedAt >= CACHE_TTL_MS) cache.delete(k);
  }
  cache.set(key, { balance, fetchedAt: now });
}

/**
 * The buyer's balance in `currency` (0 with no credit at all), or null when
 * it can't be told: no Admin API client (no offline session), Shopify can't
 * be reached within 2.5 s or is being given way to, the buyer's only credit
 * is in another currency or may be on a later page, or an answer this code
 * can't read. Only answers Shopify gave are cached.
 */
export async function liveBalance(
  shop: string,
  externalCustomerId: string,
  currency: string,
  admin: GraphqlClient | undefined,
): Promise<Decimal | null> {
  const key = `${shop}:${externalCustomerId}:${currency}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.balance;
  if (!admin || Date.now() < (backOffUntil.get(shop) ?? 0)) return null;

  try {
    const { budgetLow, read } = await readBalance(admin, externalCustomerId, currency);
    if (budgetLow) backOffUntil.set(shop, Date.now() + BACK_OFF_MS);
    if (!read) return null;

    const balance = read.account ?? new Money(0);
    // None to show in this currency, but there may be credit the widget can't
    // show: in another currency, or on a later page. Not 0 then
    if (balance.isZero() && (read.creditElsewhere || !read.complete)) return null;

    remember(key, balance);
    return balance;
  } catch (error) {
    backOffUntil.set(shop, Date.now() + BACK_OFF_MS);
    console.warn(`[live-balance] Could not read a buyer's store credit balance for ${shop}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}
