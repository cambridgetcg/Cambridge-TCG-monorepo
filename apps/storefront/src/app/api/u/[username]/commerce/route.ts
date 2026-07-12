import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { TRUST_TIERS } from "@/lib/escrow/types";
import { getActiveVacation } from "@/lib/market/vacation";

// GET — public commerce stats for a user profile.
// Returns narrow, aggregate trust evidence for an explicitly public profile.
// Exact money totals, dispute counts and free-form vacation messages remain
// private; a public profile is not permission to publish a financial dossier.
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
    `SELECT u.id, u.username, u.trust_score, u.created_at
       FROM users u
       LEFT JOIN trust_profiles tp ON tp.user_id = u.id
      WHERE u.username = $1
        AND u.is_public = TRUE
        AND COALESCE(tp.is_suspended, FALSE) = FALSE`,
    [username]
  );
  if (userRes.rows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const user = userRes.rows[0];

  // All counts in one round trip. Completed trades (escrow_status in the
  // terminal completed state defines public activity. Paid, shipping and
  // verification rows are still live private workflows.
  const statsRes = await query(
    `SELECT
       (SELECT COUNT(*) FROM market_trades
          WHERE seller_id = $1 AND escrow_status = 'completed') AS trades_sold,
       (SELECT COUNT(*) FROM market_trades
          WHERE buyer_id = $1  AND escrow_status = 'completed') AS trades_bought,
       (SELECT COUNT(*) FROM auctions
          WHERE seller_user_id = $1 AND status IN ('paid','ended')) AS auctions_sold`,
    [user.id]
  );
  const stats = statsRes.rows[0];
  const tradesSold = parseInt(stats.trades_sold, 10);
  const tradesBought = parseInt(stats.trades_bought, 10);
  const auctionsSold = parseInt(stats.auctions_sold, 10);

  const trustScore = user.trust_score || 0;
  const tier =
    [...TRUST_TIERS].reverse().find((t) => trustScore >= t.minScore) || TRUST_TIERS[0];

  // Surface the active vacation so the public profile + listing pages
  // can render an "On vacation until X" banner. Null when the seller
  // is reachable normally.
  const vacation = await getActiveVacation(user.id);

  return NextResponse.json({
    username: user.username,
    tradesSold,
    tradesBought,
    auctionsSold,
    trustScore,
    trustTier: { name: tier.name, color: tier.color, minScore: tier.minScore },
    memberSince: user.created_at,
    vacation: vacation
      ? {
          ends_at: vacation.ends_at,
        }
      : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
