import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

// GET /api/social/wishlist/suggest?sku=...
// For a given SKU, returns a suggested target price based on 30 days of
// captured spot history: the median, 25th-percentile, and current. Helps
// users pick a realistic max_price instead of a wish that will never
// clear.
//
// Auth-gated simply so we don't expose this as a public pricing oracle.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const url = new URL(request.url);
  const sku = url.searchParams.get("sku");
  if (!sku) return NextResponse.json({ error: "sku required" }, { status: 400 });

  const r = await query(
    `SELECT spot_gbp FROM card_price_history
     WHERE sku = $1 AND captured_on >= CURRENT_DATE - 30
     ORDER BY spot_gbp ASC`,
    [sku],
  );
  if (r.rows.length === 0) {
    return NextResponse.json({ sku, samples: 0, suggestion: null });
  }
  const prices = r.rows.map((row) => parseFloat(row.spot_gbp));
  const n = prices.length;
  const at = (p: number) => prices[Math.min(n - 1, Math.max(0, Math.floor(p * (n - 1))))];
  const q25 = at(0.25);
  const median = at(0.5);
  const max = prices[n - 1];
  const min = prices[0];

  // "Smart" suggestion: p25 is a soft buyer-friendly target — clears about
  // a quarter of historical days. Undercut a shade to make it sticky.
  const suggested = Math.max(0.01, Math.round(q25 * 100) / 100);

  return NextResponse.json({
    sku,
    samples: n,
    min,
    q25,
    median,
    max,
    suggestion: suggested,
    explanation: `~${Math.round((prices.filter((p) => p <= suggested).length / n) * 100)}% of the last ${n} observed days traded at or under £${suggested.toFixed(2)}.`,
  });
}
