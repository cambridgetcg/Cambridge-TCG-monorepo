import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

// GET — auctions the signed-in user has won. Includes the full
// fulfilment-chain state + tracking so the /account/auctions/won
// index can render a timeline per row without a secondary fetch.
//
// Ordered by which auctions need the user's attention first:
// awaiting_payment (pay now) → shipped_to_buyer (mark received) →
// in-progress → completed.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const r = await query(
    `SELECT a.id, a.title, a.sku, a.condition, a.auction_type, a.status, a.escrow_status,
            a.current_price, a.paid_at, a.payment_expires_at,
            a.is_consignment,
            a.seller_shipped_at, a.received_by_ctcg_at, a.shipped_to_buyer_at,
            a.buyer_received_at,
            a.tracking_to_buyer, a.carrier_to_buyer,
            a.actual_end_at, a.created_at,
            (SELECT ai.url FROM auction_images ai
              WHERE ai.auction_id = a.id ORDER BY ai.display_order LIMIT 1) AS image_url
       FROM auctions a
      WHERE a.winner_user_id = $1
        AND a.status IN ('ended', 'paid')
      ORDER BY
        CASE
          WHEN a.status = 'ended' THEN 0
          WHEN a.escrow_status = 'shipped_to_buyer' THEN 1
          WHEN a.escrow_status = 'completed' THEN 3
          ELSE 2
        END,
        a.actual_end_at DESC NULLS LAST`,
    [session.user.id],
  );

  return NextResponse.json({ auctions: r.rows });
}
