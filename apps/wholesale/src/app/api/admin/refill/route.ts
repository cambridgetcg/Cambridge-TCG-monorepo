import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

const TIERS: Record<string, { min: number; max: number; label: string }> = {
  low: { min: 5, max: 20, label: "Low-value (£5–£20) — EMS shipping" },
  high: { min: 20, max: 100, label: "High-value (£20–£100) — DHL shipping" },
};

/**
 * GET /api/admin/refill?tier=low|high|all&set=OP13
 *
 * Returns refill-eligible shortfall data with CardRush fields and set summaries.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tierParam = req.nextUrl.searchParams.get("tier") || "all";
  const setParam = req.nextUrl.searchParams.get("set") || "";

  const tierDef = TIERS[tierParam] ?? null;
  const minP = tierDef?.min ?? 0;
  const maxP = tierDef?.max ?? 999999;

  const rows = setParam
    ? await db.execute(sql`
        SELECT
          c.id AS card_id,
          c.card_number,
          c.name AS card_name,
          c.set_code,
          c.image_url,
          c.cardrush_url,
          c.cardrush_jpy,
          COALESCE(c.price, 0)::float AS price_gbp,
          c.stock,
          c.pending_stock,
          st.target_qty,
          GREATEST(st.target_qty - c.stock - c.pending_stock, 0) AS refill_qty
        FROM cards c
        JOIN stock_targets st
          ON c.price >= st.price_min AND c.price < st.price_max
        WHERE c.category = 'singles'
          AND c.cardrush_url IS NOT NULL AND c.cardrush_url != ''
          AND c.cardrush_jpy > 0
          AND c.set_code = ${setParam}
          AND c.price >= ${minP}
          AND c.price < ${maxP}
          AND st.target_qty - c.stock - c.pending_stock > 0
        ORDER BY (c.stock::float / NULLIF(st.target_qty, 0)) ASC, c.cardrush_jpy DESC
      `)
    : await db.execute(sql`
        SELECT
          c.id AS card_id,
          c.card_number,
          c.name AS card_name,
          c.set_code,
          c.image_url,
          c.cardrush_url,
          c.cardrush_jpy,
          COALESCE(c.price, 0)::float AS price_gbp,
          c.stock,
          c.pending_stock,
          st.target_qty,
          GREATEST(st.target_qty - c.stock - c.pending_stock, 0) AS refill_qty
        FROM cards c
        JOIN stock_targets st
          ON c.price >= st.price_min AND c.price < st.price_max
        WHERE c.category = 'singles'
          AND c.cardrush_url IS NOT NULL AND c.cardrush_url != ''
          AND c.cardrush_jpy > 0
          AND c.price >= ${minP}
          AND c.price < ${maxP}
          AND st.target_qty - c.stock - c.pending_stock > 0
        ORDER BY (c.stock::float / NULLIF(st.target_qty, 0)) ASC, c.cardrush_jpy DESC
      `);

  // Aggregate set summaries
  const setMap = new Map<string, { set_code: string; card_count: number; total_units: number; total_jpy: number }>();
  for (const r of rows as any[]) {
    const sc = r.set_code || "unknown";
    const qty = Number(r.refill_qty);
    const jpy = Number(r.cardrush_jpy);
    const existing = setMap.get(sc);
    if (existing) {
      existing.card_count++;
      existing.total_units += qty;
      existing.total_jpy += qty * jpy;
    } else {
      setMap.set(sc, { set_code: sc, card_count: 1, total_units: qty, total_jpy: qty * jpy });
    }
  }

  const sets = [...setMap.values()].sort((a, b) => b.total_jpy - a.total_jpy);

  return NextResponse.json({
    cards: rows,
    sets,
    tier: tierDef ? { ...tierDef, key: tierParam } : null,
  });
}
