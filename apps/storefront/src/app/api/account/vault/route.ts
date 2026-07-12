import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

// Customer-facing vault history. Returns every vault item the user
// has ever owned (across all terminal states: reserved, sold_back,
// expired, redeemed, gifted, traded), plus aggregate counts so the
// page can render a summary header without a second round trip.

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const itemsRes = await query(
    `SELECT v.id, v.sku, v.card_name, v.card_number, v.set_code, v.rarity,
            NULL::text AS image_url, NULL::numeric AS spot_price_gbp, v.status, v.source,
            v.bounty_pull_id,
            v.acquired_at, v.expires_at, v.fulfilled_at,
            v.sold_back_credit, v.sold_back_at,
            v.redemption_order_id,
            co.tracking_number, co.carrier, co.shipped_at
       FROM vault_items v
       LEFT JOIN customer_orders co ON co.id = v.redemption_order_id
      WHERE v.user_id = $1
      ORDER BY v.acquired_at DESC
      LIMIT 500`,
    [session.user.id],
  );

  const summaryRes = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status='reserved')::int  AS reserved,
       COUNT(*) FILTER (WHERE status='redeemed')::int  AS redeemed,
       COUNT(*) FILTER (WHERE status='sold_back')::int AS sold_back,
       COUNT(*) FILTER (WHERE status='expired')::int   AS expired,
       COUNT(*) FILTER (WHERE status IN ('gifted','traded'))::int AS transferred,
       NULL::numeric AS total_spot,
       COALESCE(SUM(sold_back_credit::numeric)::numeric, 0) AS total_credit_received
     FROM vault_items WHERE user_id = $1`,
    [session.user.id],
  );

  return NextResponse.json({
    items: itemsRes.rows,
    summary: summaryRes.rows[0],
    publication_boundary: {
      prices: "withheld_pending_field_level_source_rights",
      images: "withheld_pending_field_level_source_rights",
    },
  });
}
