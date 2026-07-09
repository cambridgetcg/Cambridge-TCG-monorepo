import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

// GET — participant view of a single trade, shaped for the review flow
// (/account/trades/[id]/review fetches this before rendering the form).
// Deliberately lean: card, price, status, and the counterparty as a
// username — no shipping address, no emails (global free trade §2.3),
// nothing the review form doesn't need.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await params;
  const result = await query(
    `SELECT t.id, t.sku, t.buyer_id, t.seller_id, t.price, t.quantity,
            t.escrow_status, t.escrow_tier, t.created_at, t.completed_at,
            t.completed_via,
            bu.username AS buyer_username, bu.name AS buyer_name,
            su.username AS seller_username, su.name AS seller_name,
            COALESCE(o.card_name, t.sku) AS card_name, o.image_url
       FROM market_trades t
       LEFT JOIN users bu ON bu.id = t.buyer_id
       LEFT JOIN users su ON su.id = t.seller_id
       LEFT JOIN market_orders o ON o.id = t.bid_order_id
      WHERE t.id = $1`,
    [id],
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }
  const t = result.rows[0];
  if (t.buyer_id !== session.user.id && t.seller_id !== session.user.id) {
    return NextResponse.json({ error: "Not your trade." }, { status: 403 });
  }

  const isBuyer = t.buyer_id === session.user.id;
  const counterpartyName = isBuyer
    ? t.seller_username || t.seller_name
    : t.buyer_username || t.buyer_name;

  return NextResponse.json({
    trade: {
      id: t.id,
      sku: t.sku,
      card_name: t.card_name,
      image_url: t.image_url,
      price: t.price,
      quantity: t.quantity,
      escrow_status: t.escrow_status,
      escrow_tier: t.escrow_tier,
      created_at: t.created_at,
      completed_at: t.completed_at,
      completed_via: t.completed_via,
      current_user_role: isBuyer ? ("buyer" as const) : ("seller" as const),
      counterparty_name: counterpartyName,
    },
  });
}
