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
      c.id AS card_id,
      c.card_number,
      c.name,
      c.set_code,
      c.image_url,
      COALESCE(c.price, 0)::float AS price,
      c.stock,
      c.pending_stock,
      COALESCE(st.target_qty, 0) AS target_qty,
      GREATEST(COALESCE(st.target_qty, 0) - c.stock - c.pending_stock, 0) AS to_order
    FROM cards c
    LEFT JOIN stock_targets st
      ON c.price >= st.price_min AND c.price < st.price_max
    WHERE c.category = 'singles'
      AND c.price IS NOT NULL
      AND c.price > 0
    ORDER BY
      GREATEST(COALESCE(st.target_qty, 0) - c.stock - c.pending_stock, 0) DESC,
      c.card_number ASC
  `);

  // Map to camelCase for the frontend
  const mapped = (rows as any[]).map((r: any) => ({
    cardId: r.card_id,
    cardNumber: r.card_number,
    name: r.name,
    setCode: r.set_code,
    imageUrl: r.image_url,
    price: r.price,
    stock: r.stock,
    pendingStock: r.pending_stock,
    targetQty: r.target_qty,
    toOrder: r.to_order,
  }));

  return NextResponse.json(mapped);
}
