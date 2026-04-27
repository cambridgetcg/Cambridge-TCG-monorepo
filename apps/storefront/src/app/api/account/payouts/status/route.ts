import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getConnectStatus } from "@/lib/payouts/stripe-connect";
import { getPendingPayouts } from "@/lib/payouts/aggregation";
import { query } from "@/lib/db";
import { formatPrice } from "@/lib/format";

// GET — current Connect status + outstanding payouts the seller is owed
// across all four payout sources. Pending-payout aggregation is in
// @/lib/payouts/aggregation so the E2E test exercises the same query
// logic the UI sees.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const userId = session.user.id;

  const status = await getConnectStatus(userId);
  const pending = await getPendingPayouts(userId);

  // Liquidity rewards earned to date — store-credit bonuses from resting asks
  const liquidity = await query(
    `SELECT COUNT(*)::int AS award_count,
            COALESCE(SUM(amount_gbp::numeric), 0)::numeric AS total
       FROM liquidity_rewards WHERE user_id = $1`,
    [userId]
  );
  const liqRow = liquidity.rows[0];

  return NextResponse.json({
    status,
    pending: {
      trades: pending.trades,
      auctions: pending.auctions,
      tradeins: pending.tradeins,
      quotes: pending.quotes,
      totalOwedFormatted: pending.totalOwedFormatted,
    },
    liquidity: {
      awardCount: liqRow?.award_count ?? 0,
      totalFormatted: formatPrice(parseFloat(liqRow?.total ?? "0")),
    },
  });
}
