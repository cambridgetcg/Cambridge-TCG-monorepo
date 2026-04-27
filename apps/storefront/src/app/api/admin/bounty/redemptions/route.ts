import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

// List pending + recently-fulfilled redemptions for the admin queue.
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await query(
      `SELECT
         v.id, v.user_id, v.sku, v.card_name, v.card_number, v.set_code,
         v.rarity, v.image_url, v.spot_price_gbp, v.status, v.acquired_at,
         v.redemption_order_id, v.fulfilled_at,
         co.shipping_name, co.shipping_address, co.customer_email,
         co.status AS order_status, co.created_at AS order_created_at,
         u.email AS user_email, u.name AS user_name
       FROM vault_items v
       JOIN customer_orders co ON co.id = v.redemption_order_id
       LEFT JOIN users u ON u.id = v.user_id
       WHERE v.redemption_order_id IS NOT NULL
         AND v.status IN ('reserved', 'redeemed')
       ORDER BY
         CASE WHEN v.status = 'reserved' THEN 0 ELSE 1 END,
         co.created_at DESC
       LIMIT 200`,
    );
    return NextResponse.json({ redemptions: result.rows });
  } catch (err) {
    console.error("[admin/bounty] list failed", err);
    return NextResponse.json({ error: "Database error." }, { status: 500 });
  }
}
