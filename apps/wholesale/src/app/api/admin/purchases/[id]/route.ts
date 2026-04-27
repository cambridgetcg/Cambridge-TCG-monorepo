import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const purchaseId = parseInt(id);

  const items = await db.execute(sql`
    SELECT
      pi.id,
      pi.card_id,
      pi.order_item_id,
      pi.condition,
      pi.quantity,
      pi.unit_price_jpy,
      pi.cardrush_url,
      c.card_number,
      c.sku,
      c.image_url,
      c.name AS card_name,
      oi.order_id
    FROM purchase_items pi
    JOIN cards c ON c.id = pi.card_id
    LEFT JOIN order_items oi ON oi.id = pi.order_item_id
    WHERE pi.purchase_id = ${purchaseId}
    ORDER BY c.card_number, pi.condition
  `);

  return NextResponse.json(items);
}
