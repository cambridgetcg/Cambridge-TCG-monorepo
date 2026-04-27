import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET — "users who watch X also watch Y" collaborative recommendations.
// Pure SQL over market_watches; no training, no model. Works well even
// with modest watchlist counts since co-occurrence is the only signal.
//
// Ranks by co-watcher count (how many users who watch the target also
// watch this other card). Ties broken by alphabetical sku for stable
// ordering in the UI.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;
  const url = new URL(_req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "8", 10) || 8, 20);

  const r = await query(
    `WITH co_watchers AS (
       SELECT w2.sku, COUNT(DISTINCT w2.user_id)::int AS co_watch_count
         FROM market_watches w1
         JOIN market_watches w2 ON w2.user_id = w1.user_id AND w2.sku <> w1.sku
        WHERE w1.sku = $1
        GROUP BY w2.sku
     ),
     card_meta AS (
       SELECT DISTINCT ON (sku) sku, card_name, image_url
         FROM market_orders
        WHERE card_name IS NOT NULL
        ORDER BY sku, created_at DESC
     ),
     asks AS (
       SELECT sku, MIN(price)::numeric AS best_ask
         FROM market_orders
        WHERE side = 'ask' AND status IN ('open','partially_filled')
        GROUP BY sku
     )
     SELECT c.sku, c.co_watch_count,
            cm.card_name, cm.image_url,
            a.best_ask
       FROM co_watchers c
       LEFT JOIN card_meta cm ON cm.sku = c.sku
       LEFT JOIN asks      a  ON a.sku  = c.sku
      ORDER BY c.co_watch_count DESC, c.sku ASC
      LIMIT $2`,
    [sku, limit]
  );

  return NextResponse.json({
    related: r.rows.map((row) => ({
      sku: row.sku,
      cardName: row.card_name,
      imageUrl: row.image_url,
      bestAsk: row.best_ask ? parseFloat(row.best_ask) : null,
      coWatchCount: row.co_watch_count,
    })),
  });
}
