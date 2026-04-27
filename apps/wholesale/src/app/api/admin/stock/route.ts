import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { syncUkStock } from "@/lib/sync-uk-stock";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Stock on hand = received/shipped purchased qty - fulfilled qty
  // Using raw SQL for the aggregation join
  const rows = await db.execute(sql`
    WITH purchased AS (
      SELECT
        pi.card_id,
        pi.condition,
        SUM(pi.quantity) AS qty_purchased
      FROM purchase_items pi
      JOIN purchases p ON p.id = pi.purchase_id
      WHERE p.status IN ('received', 'shipped')
      GROUP BY pi.card_id, pi.condition
    ),
    fulfilled AS (
      SELECT
        oi.card_id,
        SUM(fe.fulfilled_qty) AS qty_fulfilled
      FROM fulfillment_entries fe
      JOIN order_items oi ON oi.id = fe.order_item_id AND oi.removed_at IS NULL
      GROUP BY oi.card_id
    )
    SELECT
      c.id AS card_id,
      c.card_number,
      c.name,
      c.set_code,
      c.image_url,
      c.sku,
      p.condition,
      p.qty_purchased::int AS qty_purchased,
      COALESCE(f.qty_fulfilled, 0)::int AS qty_fulfilled,
      (p.qty_purchased - COALESCE(f.qty_fulfilled, 0))::int AS qty_on_hand
    FROM purchased p
    JOIN cards c ON c.id = p.card_id
    LEFT JOIN fulfilled f ON f.card_id = c.id
    ORDER BY c.card_number, p.condition
  `);

  return NextResponse.json(rows);
}

/** POST /api/admin/stock — Sync UK stock into cards.stock */
export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await syncUkStock();
  return NextResponse.json({ ok: true });
}
