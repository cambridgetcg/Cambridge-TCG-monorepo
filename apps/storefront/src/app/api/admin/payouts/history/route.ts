import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

// GET — unified payout history (trades + auctions).
// Query params: from=ISO, to=ISO, limit=100.
// Returns rows with `kind` column so the client can link back to the source.
export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 500);

  const conds: string[] = ["seller_paid_at IS NOT NULL"];
  const params: unknown[] = [];
  if (from) { params.push(from); conds.push(`seller_paid_at >= $${params.length}`); }
  if (to)   { params.push(to);   conds.push(`seller_paid_at <= $${params.length}`); }
  const where = conds.join(" AND ");

  // Pull from both sources then UNION ALL with a discriminator
  const sql = `
    SELECT 'trade' AS kind, t.id, t.seller_paid_at, t.payout_method, t.payout_reference,
           t.stripe_transfer_id, t.seller_payout::numeric AS amount,
           COALESCE(o.card_name, t.sku) AS label,
           su.email AS seller_email, su.name AS seller_name
      FROM market_trades t
      JOIN users su ON su.id = t.seller_id
      LEFT JOIN market_orders o ON o.id = t.bid_order_id
     WHERE ${where.replace(/seller_paid_at/g, "t.seller_paid_at")}
    UNION ALL
    SELECT 'auction' AS kind, a.id, a.seller_paid_at, a.payout_method, a.payout_reference,
           a.stripe_transfer_id, a.seller_payout::numeric AS amount,
           a.title AS label,
           su.email AS seller_email, su.name AS seller_name
      FROM auctions a
      JOIN users su ON su.id = a.seller_user_id
     WHERE ${where.replace(/seller_paid_at/g, "a.seller_paid_at")}
       AND a.seller_user_id IS NOT NULL
     ORDER BY seller_paid_at DESC
     LIMIT $${params.length + 1}
  `;

  const r = await query(sql, [...params, limit]);
  return NextResponse.json({ history: r.rows });
}
