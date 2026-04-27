import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { syncUkStock } from "@/lib/sync-uk-stock";
import { auth } from "@/lib/auth";

// GET: list all A- condition purchase items needing review
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db.execute(sql`
    SELECT
      pi.id,
      pi.purchase_id,
      pi.card_id,
      pi.condition,
      pi.quantity,
      pi.unit_price_jpy,
      pi.cardrush_url,
      c.card_number,
      c.sku,
      c.image_url,
      c.name AS card_name,
      c.stock,
      c.pending_stock,
      pu.remambo_order_id,
      pu.status AS purchase_status,
      pu.parcel_id
    FROM purchase_items pi
    JOIN cards c ON c.id = pi.card_id
    JOIN purchases pu ON pu.id = pi.purchase_id
    WHERE pi.condition LIKE '状態%'
    ORDER BY pu.ordered_at DESC, c.card_number
  `);
  return NextResponse.json(rows);
}

// PATCH: approve (set condition to Mint) or reject (delete) an A- item
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, action } = await req.json();

  if (action === "approve") {
    // Flip condition to Mint — stock sync will pick it up
    const [item] = await db.execute(sql`
      UPDATE purchase_items SET condition = 'Mint'
      WHERE id = ${id} AND condition LIKE '状態%'
      RETURNING card_id
    `);
    if (item) {
      await syncUkStock([(item as any).card_id]);
    }
    return NextResponse.json({ ok: true, action: "approved" });
  }

  if (action === "reject") {
    // Remove the item from the purchase
    const [item] = await db.execute(sql`
      DELETE FROM purchase_items WHERE id = ${id} AND condition LIKE '状態%'
      RETURNING card_id
    `);
    if (item) {
      await syncUkStock([(item as any).card_id]);
    }
    return NextResponse.json({ ok: true, action: "rejected" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
