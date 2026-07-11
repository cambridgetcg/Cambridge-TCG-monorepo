import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import type { PublicAskListing } from "@/lib/market/types";

// GET /api/market/offers/asks?sku=SKU — the open P2P asks a buyer can
// negotiate against. The unified order-book view aggregates by price and
// drops order ids, so the offer composer needs each ask's id (the makeOffer
// target), remaining quantity, offer setting, and return terms. Publishing an
// ask does not also publish the seller's account, UUID, or trust dossier.
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
            o.created_at, o.user_id AS owner_user_id
       FROM market_orders o
      WHERE o.sku = $1 AND o.side = 'ask'
        AND o.status IN ('open', 'partially_filled')
        AND NOT EXISTS (
          SELECT 1 FROM trust_profiles suspended
           WHERE suspended.user_id = o.user_id
             AND suspended.is_suspended = TRUE
        )
      ORDER BY o.price ASC, o.created_at ASC
      LIMIT 20`,
    [sku],
  );

  const asks: PublicAskListing[] = r.rows.map((row) => {
    return {
      id: row.id as string,
      price: row.price as string,
      remaining: (row.quantity as number) - (row.filled_quantity as number),
      condition: row.condition as string,
      allow_offers: !!row.allow_offers,
      accepts_returns: !!row.accepts_returns,
      return_window_days: row.return_window_days as number,
      created_at: row.created_at as string,
      is_own: viewerId != null && row.owner_user_id === viewerId,
      seller: {
        contact_available: true,
      },
    };
  });

  return NextResponse.json(
    { sku, asks },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
