import type { Decimal } from "decimal.js";
import { Money, currencyDecimals } from "~/lib/money";
import type { GraphqlClient } from "./graphql";
import { type BalanceAccounts, accountIn, readBalance } from "./store-credit-rail.server";

/**
 * A buyer's store credit as Shopify holds it now, for the widget (spec 5)
 * and the buyer panel (spec 4.4). RewardsPro keeps no copy of the balance
 * (spec 6.2), so when Shopify can't say, the answer is null: the widget says
 * "Your store credit shows at checkout", and the panel that Shopify couldn't
 * say. One read gives every account the buyer has, one per currency
 * (Ruling 66). Carried from
 * apps/rewardspro/app/services/store-credit-balance.server.ts (PR #134), with
 * the account picked by the currency asked for instead of the shop's.
 */

export type { BalanceAccounts };

// Brief, like the widget's own 30 seconds, so a change made in Shopify shows soon
const CACHE_TTL_MS = 30 * 1000;
const cache = new Map<string, { read: BalanceAccounts; fetchedAt: number }>();

// The app's own credits and debits draw on the shop's Admin API budget too, so
// after Shopify fails or is slow, or the budget falls below half, storefront
// reads give way for a while
const BACK_OFF_MS = 10 * 1000;
const backOffUntil = new Map<string, number>();

function remember(key: string, read: BalanceAccounts) {
  const now = Date.now();
  // One entry per buyer: drop the stale ones
  for (const [k, entry] of cache) {
    if (now - entry.fetchedAt >= CACHE_TTL_MS) cache.delete(k);
  }
  cache.set(key, { read, fetchedAt: now });
}

/**
 * Every store credit account the buyer has, or null when it can't be told:
 * no Admin API client (no offline session), Shopify can't be reached within
 * 2.5 s or is being given way to, or an answer this code can't read (a
 * customer Shopify doesn't know included). Only answers Shopify gave are
 * cached. `fresh` reads Shopify whatever the cache holds and without giving
 * way, for the buyer panel, which says the balance is "now" (A21-F6); a
 * failed or costly fresh read still makes storefront reads give way.
 */
export async function liveBalance(
  shop: string,
  externalCustomerId: string,
  admin: GraphqlClient | undefined,
  o: { fresh?: boolean } = {},
): Promise<BalanceAccounts | null> {
  const key = `${shop}:${externalCustomerId}`;
  if (!o.fresh) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.read;
  }
  if (!admin || (!o.fresh && Date.now() < (backOffUntil.get(shop) ?? 0))) return null;

  try {
    const { budgetLow, read } = await readBalance(admin, externalCustomerId);
    if (budgetLow) backOffUntil.set(shop, Date.now() + BACK_OFF_MS);
    if (!read) return null;
    remember(key, read);
    return read;
  } catch (error) {
    backOffUntil.set(shop, Date.now() + BACK_OFF_MS);
    console.warn(`[live-balance] Could not read a buyer's store credit balance for ${shop}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * The widget's balance: the buyer's in `currency` (0 with no credit at all),
 * or null when it can't be told, which liveBalance's cases include, and also
 * when the buyer's only credit is in another currency or may be on a later
 * page, or `currency` isn't one (then Shopify isn't asked).
 */
export async function widgetBalance(
  shop: string,
  externalCustomerId: string,
  currency: string,
  admin: GraphqlClient | undefined,
): Promise<Decimal | null> {
  // Not a currency code ("gbp"): no account could match it, so it is not 0
  try {
    currencyDecimals(currency);
  } catch {
    return null;
  }
  const read = await liveBalance(shop, externalCustomerId, admin);
  const here = read && accountIn(read, currency);
  if (!read || !here) return null;
  const balance = here.account ?? new Money(0);
  // None to show in this currency, but there may be credit the widget can't
  // show: in another currency, or on a later page. Not 0 then
  if (balance.isZero() && (here.creditElsewhere || !read.complete)) return null;
  return balance;
}

/** Whether the admin can show an amount in `code`: formatMoney throws otherwise. */
function showable(code: string): boolean {
  try {
    currencyDecimals(code);
    return true;
  } catch {
    return false;
  }
}

/**
 * The buyer panel's balance (Ruling 66): one line for each of `currencies`
 * (the shop's and those RewardsPro issued the buyer, in that order, each
 * once), then any other account that holds credit, so nothing the buyer
 * holds is left out. A currency with no account reads 0 when every account
 * was read, and is left out when more may be on a later page. An account the
 * admin can't show (a code that isn't a currency, or an unreadable amount in
 * a currency nobody asked for) is left out (M3a-F1, F2). Null for a read that
 * failed, an unreadable amount in a currency asked for, or a read with none
 * of those currencies on its page, so the panel never shows a section with
 * no figure (M3a-F3).
 */
export function balanceLines(read: BalanceAccounts | null, currencies: readonly string[]): Array<{ currency: string; amount: Decimal }> | null {
  if (!read) return null;
  const asked = [...new Set(currencies)].filter(showable);
  const lines: Array<{ currency: string; amount: Decimal }> = [];
  for (const currency of asked) {
    const account = read.accounts.find((a) => a.currency === currency);
    if (account?.amount === null) return null;
    if (account) lines.push({ currency, amount: account.amount });
    else if (read.complete) lines.push({ currency, amount: new Money(0) });
  }
  if (lines.length === 0) return null;
  for (const { currency, amount } of read.accounts) {
    if (!asked.includes(currency) && amount?.gt(0) && showable(currency)) lines.push({ currency, amount });
  }
  return lines;
}
