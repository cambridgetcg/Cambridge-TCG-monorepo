import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { TRUST_TIERS } from "@/lib/escrow/types";
import { commissionRateForScore } from "@/lib/market/types";
import { getActiveVacation } from "@/lib/market/vacation";

// GET — public commerce stats for a user profile.
// Returns seller/buyer activity counts, volume, dispute rate, trust tier,
// and member-since date. Intentionally narrow — no PII beyond what the
// /u/[username] profile already reveals.
//
// Used by the public profile page and (via the username) by market order
// book entries that link trades to their buyer/seller profiles.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  // Resolve username → user row
  const userRes = await query(
    `SELECT id, name, username, trust_score, created_at FROM users WHERE username = $1`,
    [username]
  );
  if (userRes.rows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const user = userRes.rows[0];

  // All counts in one round trip. Completed trades (escrow_status in the
  // terminal-success set) define "real" activity.
  const COMPLETED_STATES = ["completed", "paid", "shipped_to_buyer", "verified", "received_by_ctcg", "shipped_to_ctcg"];
  const statsRes = await query(
    `SELECT
       (SELECT COUNT(*) FROM market_trades
          WHERE seller_id = $1 AND escrow_status = ANY($2)) AS trades_sold,
       (SELECT COUNT(*) FROM market_trades
          WHERE buyer_id = $1  AND escrow_status = ANY($2)) AS trades_bought,
       (SELECT COUNT(*) FROM auctions
          WHERE seller_user_id = $1 AND status IN ('paid','ended')) AS auctions_sold,
       (SELECT COALESCE(SUM(seller_payout::numeric), 0) FROM market_trades
          WHERE seller_id = $1 AND seller_paid_at IS NOT NULL)
       -- Count auction settlements the moment the buyer has paid (status
       -- 'paid'), not only after the seller-payout stamp lands — that
       -- stamp lags, so gating on it read a real GBP 70.50 sale as zero.
       -- Use the realized payout when known, else the settlement price
       -- (current_price) so a settled auction is never invisible.
       + (SELECT COALESCE(SUM(COALESCE(seller_payout, current_price)::numeric), 0) FROM auctions
          WHERE seller_user_id = $1 AND status = 'paid') AS total_volume,
       (SELECT COUNT(*) FROM trade_disputes d
          JOIN market_trades t ON t.id = d.trade_id
         WHERE t.seller_id = $1) AS disputes_against_seller`,
    [user.id, COMPLETED_STATES]
  );
  const stats = statsRes.rows[0];
  const tradesSold = parseInt(stats.trades_sold, 10);
  const tradesBought = parseInt(stats.trades_bought, 10);
  const auctionsSold = parseInt(stats.auctions_sold, 10);
  const totalVolume = parseFloat(stats.total_volume);
  const disputes = parseInt(stats.disputes_against_seller, 10);
  // Dispute rate is against trades as seller; 0/0 reads as 0, not NaN.
  const disputeRate = tradesSold > 0 ? (disputes / tradesSold) * 100 : 0;

  const trustScore = user.trust_score || 0;
  const tier =
    [...TRUST_TIERS].reverse().find((t) => trustScore >= t.minScore) || TRUST_TIERS[0];

  // Surface the active vacation so the public profile + listing pages
  // can render an "On vacation until X" banner. Null when the seller
  // is reachable normally.
  const vacation = await getActiveVacation(user.id);

  return NextResponse.json({
    username: user.username,
    name: user.name,
    tradesSold,
    tradesBought,
    auctionsSold,
    totalVolumeGbp: totalVolume,
    disputeRate,
    disputes,
    trustScore,
    trustTier: { name: tier.name, color: tier.color, minScore: tier.minScore },
    // Commission rate the seller currently pays. Surfaced so buyers see
    // the trust flywheel (elite sellers earn a lower effective rate) and
    // so the seller can see what reputation has earned them.
    commissionRate: commissionRateForScore(trustScore),
    memberSince: user.created_at,
    vacation: vacation
      ? {
          ends_at: vacation.ends_at,
          message: vacation.message,
        }
      : null,
  });
}
