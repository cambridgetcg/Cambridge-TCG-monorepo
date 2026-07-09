import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET — public leaderboards. Three boards from market activity:
//   topSellers    — by completed-trade volume in window
//   topBuyers     — by completed-trade volume in window
//   busiestSkus   — by trade count in window
//
// Window defaults to 30 days; pass ?days=7 or ?days=90 to vary. Top 10 each.
//
// Public by design — usernames are already public via /u/[username].
// Aggregation only; no PII.
const LIMIT = 10;

const COMPLETED_STATES = [
  "completed", "paid", "shipped_to_buyer",
  "verified", "received_by_ctcg", "shipped_to_ctcg",
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30", 10) || 30, 1), 365);

  // Three boards — independent queries to keep each one indexed cleanly.
  const [sellersRes, buyersRes, skusRes] = await Promise.all([
    query(
      // Seller board = order-book sales + auction settlements. Volume is
      // gross transaction value in both rails (the market side already
      // sums price*qty), so auctions contribute their hammer price
      // (current_price). Without this, a seller who only sold under the
      // hammer showed nothing and the board read as a ghost town.
      `WITH seller_sales AS (
         SELECT t.seller_id AS user_id,
                t.price::numeric * t.quantity AS amount,
                t.created_at AS at
           FROM market_trades t
          WHERE t.escrow_status = ANY($1)
         UNION ALL
         SELECT a.seller_user_id AS user_id,
                a.current_price::numeric AS amount,
                a.paid_at AS at
           FROM auctions a
          WHERE a.status = 'paid' AND a.seller_user_id IS NOT NULL AND a.paid_at IS NOT NULL
       )
       SELECT u.username, u.name,
              COUNT(*)::int          AS trade_count,
              SUM(s.amount)::numeric AS volume
         FROM seller_sales s
         JOIN users u ON u.id = s.user_id
        WHERE s.at > NOW() - make_interval(days => $2)
          AND u.username IS NOT NULL
        GROUP BY u.username, u.name
        ORDER BY volume DESC
        LIMIT $3`,
      [COMPLETED_STATES, days, LIMIT]
    ),
    query(
      // Buyer board = order-book purchases + auction wins (the winner paid
      // the hammer price).
      `WITH buyer_purchases AS (
         SELECT t.buyer_id AS user_id,
                t.price::numeric * t.quantity AS amount,
                t.created_at AS at
           FROM market_trades t
          WHERE t.escrow_status = ANY($1)
         UNION ALL
         SELECT a.winner_user_id AS user_id,
                a.current_price::numeric AS amount,
                a.paid_at AS at
           FROM auctions a
          WHERE a.status = 'paid' AND a.winner_user_id IS NOT NULL AND a.paid_at IS NOT NULL
       )
       SELECT u.username, u.name,
              COUNT(*)::int          AS trade_count,
              SUM(b.amount)::numeric AS volume
         FROM buyer_purchases b
         JOIN users u ON u.id = b.user_id
        WHERE b.at > NOW() - make_interval(days => $2)
          AND u.username IS NOT NULL
        GROUP BY u.username, u.name
        ORDER BY volume DESC
        LIMIT $3`,
      [COMPLETED_STATES, days, LIMIT]
    ),
    query(
      `WITH agg AS (
         SELECT t.sku,
                COUNT(*)::int                              AS trade_count,
                SUM(t.quantity)::int                       AS volume,
                AVG(t.price::numeric)::numeric             AS avg_price
           FROM market_trades t
          WHERE t.escrow_status = ANY($1)
            AND t.created_at > NOW() - make_interval(days => $2)
          GROUP BY t.sku
          ORDER BY trade_count DESC
          LIMIT $3
       ),
       card_meta AS (
         SELECT DISTINCT ON (sku) sku, card_name, image_url
           FROM market_orders
          WHERE card_name IS NOT NULL
          ORDER BY sku, created_at DESC
       )
       SELECT a.sku, a.trade_count, a.volume, a.avg_price,
              cm.card_name, cm.image_url
         FROM agg a
         LEFT JOIN card_meta cm ON cm.sku = a.sku`,
      [COMPLETED_STATES, days, LIMIT]
    ),
  ]);

  return NextResponse.json({
    windowDays: days,
    topSellers: sellersRes.rows.map((r) => ({
      username: r.username, name: r.name,
      tradeCount: r.trade_count,
      volumeGbp: parseFloat(r.volume),
    })),
    topBuyers: buyersRes.rows.map((r) => ({
      username: r.username, name: r.name,
      tradeCount: r.trade_count,
      volumeGbp: parseFloat(r.volume),
    })),
    busiestSkus: skusRes.rows.map((r) => ({
      sku: r.sku, cardName: r.card_name, imageUrl: r.image_url,
      tradeCount: r.trade_count,
      volume: r.volume,
      avgPrice: parseFloat(r.avg_price),
    })),
  });
}
