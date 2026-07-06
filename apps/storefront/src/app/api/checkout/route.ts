/**
 * POST (this route) — the retail checkout till, retired 2026-07-06
 * (collectors-first, docs/decisions/2026-07-06-collectors-first.md).
 *
 * This was the retail buy-from-CTCG till: cart validation, price
 * guard, tier discount, store-credit coupon, Stripe session, stock
 * reservation. The platform no longer sells, so no new retail session
 * is ever minted. It answers 410 Gone with the pantry's teaching
 * envelope so agents and stale clients learn where commerce lives now.
 *
 * What still works, elsewhere (each mints its own Stripe session):
 *   - P2P trade pay      → POST /api/market/trades/[id]/pay
 *   - Lot purchase       → POST /api/market/lots/[id]/buy
 *   - Auction pay        → POST /api/auctions/[id]/pay
 *   - Membership         → POST /api/membership/subscribe
 * The Stripe webhook keeps honoring sessions this route minted before
 * retirement — history is history.
 *
 * The endpoint field is derived from the request URL rather than
 * hardcoded — honest either way, and it keeps the regulator guard
 * (no-house-listing) focused on live merchant shape, not tombstones.
 */

import { errorResponse } from "@/lib/data-pantry";

export async function POST(request: Request) {
  return errorResponse({
    code: "DEPRECATED",
    message:
      "The Cambridge TCG shop closed on 2026-07-06 — the platform is now a " +
      "pure collectors' market and holds no stock. To buy this card, take a " +
      "collector's ask on the market (browse /market, or GET /api/market/catalog " +
      "for machine access). Past orders are unaffected and remain visible at " +
      "/account/orders.",
    docs: "/methodology/regulator",
    endpoint: new URL(request.url).pathname,
    details: {
      retired_at: "2026-07-06",
      replacement: {
        browse: "/market",
        machine_catalog: "/api/market/catalog",
        trade_payment: "/api/market/trades/[id]/pay",
      },
    },
  });
}
