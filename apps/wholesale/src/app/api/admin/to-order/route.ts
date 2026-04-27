import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

/**
 * Pipeline: deduce "to be ordered" items from supplier.
 *
 * Two sources:
 *   ?source=orders  (default) — client order fulfillment gaps
 *   ?source=targets — stock target shortfalls
 *
 * Orders source:
 *   For each order_item in paid+ orders:
 *     remaining_to_fulfill = ordered_qty - fulfilled_qty
 *     already_purchased    = SUM(purchase_items.quantity) linked to this order_item
 *     to_order             = remaining_to_fulfill - already_purchased  (clamped ≥ 0)
 *
 * Targets source:
 *   For each card with a price matching a stock_targets tier:
 *     to_order = target_qty - stock - pending_stock  (clamped ≥ 0)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const source = req.nextUrl.searchParams.get("source") || "orders";

  if (source === "targets") {
    const rows = await db.execute(sql`
      SELECT
        c.id AS card_id,
        c.card_number,
        c.sku,
        c.image_url,
        c.name AS card_name,
        c.set_code,
        COALESCE(c.price, 0)::float AS price,
        c.stock,
        c.pending_stock,
        COALESCE(st.target_qty, 0) AS target_qty,
        GREATEST(COALESCE(st.target_qty, 0) - c.stock - c.pending_stock, 0) AS to_order_qty
      FROM cards c
      LEFT JOIN stock_targets st
        ON c.price >= st.price_min AND c.price < st.price_max
      WHERE c.category = 'singles'
        AND c.price IS NOT NULL
        AND c.price > 0
        AND COALESCE(st.target_qty, 0) - c.stock - c.pending_stock > 0
      ORDER BY
        GREATEST(COALESCE(st.target_qty, 0) - c.stock - c.pending_stock, 0) DESC,
        c.card_number ASC
    `);
    return NextResponse.json(rows);
  }

  // Default: orders source
  const rows = await db.execute(sql`
    WITH order_scope AS (
      SELECT
        oi.id AS item_id,
        oi.order_id,
        oi.card_id,
        oi.quantity AS ordered_qty,
        oi.unit_price,
        oi.remambo_submitted_at
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status IN ('paid', 'ordered', 'shipped', 'delivered')
        AND oi.removed_at IS NULL
    ),
    fulfilled AS (
      SELECT order_item_id, SUM(fulfilled_qty)::int AS qty
      FROM fulfillment_entries
      GROUP BY order_item_id
    ),
    purchased AS (
      SELECT pi.order_item_id, SUM(pi.quantity)::int AS qty
      FROM purchase_items pi
      JOIN purchases p ON p.id = pi.purchase_id
      GROUP BY pi.order_item_id
    )
    SELECT
      os.item_id,
      os.order_id,
      os.card_id,
      c.card_number,
      c.sku,
      c.image_url,
      os.ordered_qty,
      os.unit_price::float AS unit_price,
      COALESCE(f.qty, 0) AS fulfilled_qty,
      COALESCE(p.qty, 0) AS purchased_qty,
      os.remambo_submitted_at,
      os.ordered_qty - COALESCE(f.qty, 0) AS remaining_qty,
      GREATEST(os.ordered_qty - COALESCE(f.qty, 0) - COALESCE(p.qty, 0), 0) AS to_order_qty
    FROM order_scope os
    JOIN cards c ON c.id = os.card_id
    LEFT JOIN fulfilled f ON f.order_item_id = os.item_id
    LEFT JOIN purchased p ON p.order_item_id = os.item_id
    WHERE os.ordered_qty - COALESCE(f.qty, 0) > 0
    ORDER BY os.order_id, c.card_number
  `);

  return NextResponse.json(rows);
}
