import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { getTrustTier } from "@/lib/escrow/trust-engine";

// GET /api/market/offers/asks?sku=SKU — the open P2P asks a buyer can
// negotiate against. The unified order-book view aggregates by price and
// drops order ids, so the offer composer needs this: each ask's id (the
// makeOffer target), remaining quantity, whether the seller allows
// offers and its return terms. A listing id is the transaction handle;
// the seller's internal account id never leaves this route. Username and
// narrow trust evidence appear only when the seller's profile is public.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sku = url.searchParams.get("sku")?.trim();
  if (!sku) {
    return NextResponse.json({ error: "sku required." }, { status: 400 });
  }

  // Owner flag: a signed-in viewer's own asks are marked so the surface
  // can label them "yours" and never offer a Buy/Make-offer affordance on
  // a listing the viewer owns (you can't offer on your own ask). Public
  // reads (no session) simply get is_own: false everywhere.
  const session = await auth();
  const viewerId = session?.user?.id ?? null;

  const r = await query(
    `SELECT o.id, o.price, o.quantity, o.filled_quantity, o.condition,
            o.allow_offers, o.accepts_returns, o.return_window_days,
            o.created_at, o.user_id AS seller_id,
            CASE WHEN u.is_public THEN u.username END AS seller_username,
            CASE WHEN u.is_public THEN tp.trust_score END AS trust_score,
            CASE WHEN u.is_public THEN tp.avg_rating END AS avg_rating,
            CASE WHEN u.is_public THEN tp.total_reviews END AS total_reviews
       FROM market_orders o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN trust_profiles tp ON tp.user_id = o.user_id
      WHERE o.sku = $1 AND o.side = 'ask'
        AND o.status IN ('open', 'partially_filled')
        AND COALESCE(tp.is_suspended, FALSE) = FALSE
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
      is_own: viewerId != null && row.seller_id === viewerId,
      seller: {
        username: (row.seller_username as string | null) ?? null,
        trust_score: score,
        // Tier name derived in TS — same derivation the unified view uses.
        tier: score !== null ? getTrustTier(score).name : null,
        review_count: row.total_reviews != null ? Number(row.total_reviews) : 0,
        avg_rating: row.avg_rating != null ? parseFloat(row.avg_rating) : null,
      },
    };
  });

  return NextResponse.json({ sku, asks }, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, noarchive",
    },
  });
}
