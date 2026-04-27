import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { getPriceChanges } from "@/lib/portfolio/price-history";

// GET — returns per-SKU 7d and 30d spot price changes for the signed-in
// user's portfolio. Pulled separately from /api/portfolio to keep the main
// valuation endpoint fast + cacheable — this one is cheap (one DB query
// per window against the indexed history table).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const skusRes = await query(
    `SELECT DISTINCT sku FROM portfolio_cards WHERE user_id = $1`,
    [session.user.id],
  );
  const skus: string[] = skusRes.rows.map((r) => r.sku);
  if (skus.length === 0) {
    return NextResponse.json({ trends: {} });
  }

  const [week, month] = await Promise.all([
    getPriceChanges(skus, 7),
    getPriceChanges(skus, 30),
  ]);

  const trends: Record<string, { d7: number | null; d30: number | null }> = {};
  for (const sku of skus) {
    trends[sku] = {
      d7: week.get(sku)?.deltaPct ?? null,
      d30: month.get(sku)?.deltaPct ?? null,
    };
  }
  return NextResponse.json({ trends });
}
