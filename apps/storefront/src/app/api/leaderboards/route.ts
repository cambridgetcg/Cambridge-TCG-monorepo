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
      `SELECT u.username, u.name,
              COUNT(*)::int                              AS trade_count,
              SUM(t.price::numeric * t.quantity)::numeric AS volume
         FROM market_trades t
         JOIN users u ON u.id = t.seller_id
        WHERE t.escrow_status = ANY($1)
          AND t.created_at > NOW() - make_interval(days => $2)
          AND u.username IS NOT NULL
        GROUP BY u.username, u.name
        ORDER BY volume DESC
        LIMIT $3`,
      [COMPLETED_STATES, days, LIMIT]
    ),
    query(
      `SELECT u.username, u.name,
              COUNT(*)::int                              AS trade_count,
              SUM(t.price::numeric * t.quantity)::numeric AS volume
         FROM market_trades t
         JOIN users u ON u.id = t.buyer_id
        WHERE t.escrow_status = ANY($1)
          AND t.created_at > NOW() - make_interval(days => $2)
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
