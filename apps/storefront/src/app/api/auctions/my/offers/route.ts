import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

// GET — open best-offer bids on auctions the current user is selling
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const result = await query(
    `SELECT b.id            AS bid_id,
            b.amount,
            b.created_at,
            b.user_id       AS bidder_id,
            u.name          AS bidder_name,
            u.email         AS bidder_email,
            a.id            AS auction_id,
            a.title         AS auction_title,
            a.buy_now_price
       FROM auction_bids b
       JOIN auctions a ON a.id = b.auction_id
       JOIN users    u ON u.id = b.user_id
      WHERE a.seller_user_id = $1
        AND a.status = 'live'
        AND b.is_best_offer = true
        AND b.status = 'active'
      ORDER BY b.created_at DESC`,
    [session.user.id]
  );

  return NextResponse.json({ offers: result.rows });
}
