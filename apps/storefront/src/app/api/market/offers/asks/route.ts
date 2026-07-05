import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getTrustTier } from "@/lib/escrow/trust-engine";

// GET /api/market/offers/asks?sku=SKU — the open P2P asks a buyer can
// negotiate against. The unified order-book view aggregates by price and
// drops order ids, so the offer composer needs this: each ask's id (the
// makeOffer target), remaining quantity, whether the seller allows
// offers, its return terms, and the seller's reputation (global free
// trade: reputation replaces identity at the point of trade).
//
// Public read, like the order book itself — usernames and listing terms
// are already visible on the card page; no emails or user internals.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sku = url.searchParams.get("sku")?.trim();
  if (!sku) {
    return NextResponse.json({ error: "sku required." }, { status: 400 });
  }

  const r = await query(
    `SELECT o.id, o.price, o.quantity, o.filled_quantity, o.condition,
            o.allow_offers, o.accepts_returns, o.return_window_days,
            o.created_at, o.user_id AS seller_id,
            u.username AS seller_username,
            tp.trust_score, tp.avg_rating, tp.total_reviews
       FROM market_orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN trust_profiles tp ON tp.user_id = o.user_id
      WHERE o.sku = $1 AND o.side = 'ask'
        AND o.status IN ('open', 'partially_filled')
      ORDER BY o.price ASC, o.created_at ASC
      LIMIT 20`,
    [sku],
  );

  const asks = r.rows.map((row) => {
    const score = row.trust_score != null ? Number(row.trust_score) : null;
    return {
      id: row.id as string,
      price: row.price as string,
      remaining: (row.quantity as number) - (row.filled_quantity as number),
      condition: row.condition as string,
      allow_offers: !!row.allow_offers,
      accepts_returns: !!row.accepts_returns,
      return_window_days: row.return_window_days as number,
      created_at: row.created_at as string,
      seller: {
        id: row.seller_id as string,
        username: (row.seller_username as string | null) ?? null,
        trust_score: score,
        // Tier name derived in TS — same derivation the unified view uses.
        tier: score !== null ? getTrustTier(score).name : null,
        review_count: row.total_reviews != null ? Number(row.total_reviews) : 0,
        avg_rating: row.avg_rating != null ? parseFloat(row.avg_rating) : null,
      },
    };
  });

  return NextResponse.json({ sku, asks });
}
