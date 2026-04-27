import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db.execute(sql`
    SELECT
      p.id,
      p.remambo_order_id,
      p.supplier,
      p.parcel_id,
      p.ordered_at,
      p.shipped_at,
      p.received_at,
      p.status,
      p.items_total_jpy,
      p.service_fee_jpy,
      p.shipping_jpy,
      p.notes,
      (SELECT count(*) FROM purchase_items pi WHERE pi.purchase_id = p.id)::int AS item_count,
      (SELECT sum(pi.quantity) FROM purchase_items pi WHERE pi.purchase_id = p.id)::int AS total_qty,
      (SELECT count(DISTINCT pi.order_item_id) FROM purchase_items pi
       WHERE pi.purchase_id = p.id AND pi.order_item_id IS NOT NULL)::int AS linked_order_items
    FROM purchases p
    ORDER BY p.ordered_at DESC
  `);

  return NextResponse.json(rows);
}
