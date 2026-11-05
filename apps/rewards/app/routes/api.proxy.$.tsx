/**
 * The app proxy (spec 5 and 7): Shopify forwards `/apps/rewardspro/*` here.
 * Only `GET membership` is served, the one call the released widget makes,
 * in the JSON shape it reads (plan Decision 9); any other path is 404.
 *
 * Every request is verified first (verifyProxyRequest), so the shop is the
 * signed one and the buyer the signed `logged_in_customer_id`. A guest gets
 * no personal data and Shopify is not asked anything for them. A buyer
 * RewardsPro hasn't seen yet gets the lowest tier, computed on read; nothing
 * is written for a widget view. The balance is Shopify's own, read live
 * (2.5 s), or null when Shopify can't say; RewardsPro keeps no copy.
 * Nothing from the query string is logged.
 */
import type { LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { type ConnectionContext, findConnection } from "~/lib/merchant.server";
import { fromDb, roundMoney } from "~/lib/money";
import { type TierRow, progress, qualify, tierSpend, tiersOf } from "~/lib/tiers.server";
import { widgetBalance } from "~/shopify/live-balance.server";
import { verifyProxyRequest, type VerifiedProxyRequest } from "~/shopify/proxy.server";
import { customerAccountsVersion } from "~/shopify/shop-checks.server";

// Never cached (Ruling 44): the widget's URL holds no buyer (Shopify adds the
// signed id on its side), so a browser cache would show one buyer's tier and
// balance to the next on a shared computer.
const HEADERS = { "Cache-Control": "private, no-store" };

// The released widget's default look (apps/rewardspro's fallbacks). The new
// widget's look lives in its theme block settings (spec 4.7), not here.
const THEME = {
  mode: "LIGHT",
  primaryColor: "#FFD700",
  backgroundColor: "#1a1a2e",
  textColor: "#FFFFFF",
  accentColor: "#008060",
  borderRadius: 12,
  fontFamily: "inherit",
  secondaryTextColor: null,
} as const;

const CURRENCY_PARAM = /^[A-Za-z]{3}$/;

const answer = (body: unknown, status = 200) => Response.json(body, { status, headers: HEADERS });

/** The signed-in buyer's membership: their tier, live balance and progress. */
async function membership(conn: ConnectionContext, tiers: TierRow[], visitor: VerifiedProxyRequest & { customerId: string }, url: URL) {
  const asked = url.searchParams.get("currency");
  const balanceCurrency = asked && CURRENCY_PARAM.test(asked) ? asked.toUpperCase() : conn.currency;

  const [customer, balance, accountsVersion] = await Promise.all([
    prisma.customer.findUnique({
      where: { connectionId_externalCustomerId: { connectionId: conn.connectionId, externalCustomerId: visitor.customerId } },
      select: { id: true, tierId: true, lockedTierId: true },
    }),
    widgetBalance(conn.shop, visitor.customerId, balanceCurrency, visitor.admin),
    customerAccountsVersion(conn.shop, visitor.admin),
  ]);

  // Unseen: no orders, so no spend, and the lowest tier
  const spend = customer ? await tierSpend(customer.id, conn.tierWindow, new Date()) : fromDb(0);
  const locked = tiers.find((t) => t.id === customer?.lockedTierId);
  const tier = locked ?? tiers.find((t) => t.id === customer?.tierId) ?? qualify(spend, tiers);
  const next = progress(spend, tier.id, tiers);
  const shown = (v: Parameters<typeof roundMoney>[0]) => roundMoney(v, conn.currency).toNumber();

  return {
    success: true,
    membership: {
      tier: { id: tier.id, name: tier.name, cashbackPercent: tier.cashbackPercent.toNumber() },
      tierSource: locked ? "MANUAL_OVERRIDE" : "SPENDING_BASED",
      configured: true,
    },
    balance: { storeCredit: balance === null ? null : balance.toNumber(), currency: balanceCurrency },
    tierProgress: {
      progressPercent: next.percent,
      nextTierName: next.nextTierName,
      nextTierCashbackPercent: next.nextTierPercent?.toNumber() ?? null,
      isMaxTier: next.isTop,
      amountRemaining: shown(next.amountRemaining),
      nextTierTarget: next.nextTierMin ? shown(next.nextTierMin) : null,
      currentSpending: shown(spend),
    },
    settings: { currency: conn.currency, customerAccountsVersion: accountsVersion },
    theme: THEME,
    running: conn.running,
  };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const visitor = await verifyProxyRequest(request);
  if (visitor instanceof Response) return visitor;
  if (params["*"] !== "membership") {
    return Response.json({ success: false, message: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const conn = await findConnection(visitor.shop);
  const tiers = conn ? await tiersOf(conn.merchantId) : [];
  if (!conn || tiers.length === 0) return answer({ success: false, message: "Rewards are not set up yet" });

  const { customerId } = visitor;
  if (customerId === null) {
    return answer({ success: false, requiresLogin: true, message: "Sign in to see your rewards", running: conn.running });
  }
  return answer(await membership(conn, tiers, { ...visitor, customerId }, new URL(request.url)));
}
