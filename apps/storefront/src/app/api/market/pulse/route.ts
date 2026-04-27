import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET — Market Pulse dashboard data in a single round trip.
// Five ranked buckets, each ~10 rows:
//   hot          — most trade activity in the last 24h
//   movers       — biggest price movers, last 24h
//   mostWatched  — highest buyer-side watch count
//   tightSpreads — lowest spread % (tight markets; healthy liquidity)
//   recentTrades — cross-sku live feed
//
// All buckets are aggregated on the same Postgres round — the client
// renders them in parallel without follow-up calls. Public; safe to
// serve from an edge cache if needed.
const LIMIT = 10;

export async function GET() {
  const result = await query(
    `-- shared card metadata (sku → name/image)
     WITH card_meta AS (
       SELECT DISTINCT ON (sku) sku, card_name, image_url
         FROM market_orders
        WHERE card_name IS NOT NULL
        ORDER BY sku, created_at DESC
     )
     SELECT 'hot' AS bucket, h.sku, cm.card_name, cm.image_url,
            h.volume::int   AS n1,
            h.trades::int   AS n2,
            NULL::numeric   AS v1,
            NULL::numeric   AS v2
       FROM (
         SELECT sku,
                COALESCE(SUM(quantity), 0) AS volume,
                COUNT(*)                   AS trades
           FROM market_trades
          WHERE created_at > NOW() - INTERVAL '24 hours'
            AND escrow_status <> 'cancelled'
          GROUP BY sku
          ORDER BY volume DESC, trades DESC
          LIMIT ${LIMIT}
       ) h
       LEFT JOIN card_meta cm ON cm.sku = h.sku
     UNION ALL
     SELECT 'movers' AS bucket, m.sku, cm.card_name, cm.image_url,
            NULL::int     AS n1,
            NULL::int     AS n2,
            m.last_price  AS v1,
            m.change_pct  AS v2
       FROM (
         -- Subquery owns ORDER BY + LIMIT so they don't bubble to the outer union
         SELECT x.sku, x.last_price, x.change_pct
           FROM (
             SELECT inner_t.sku, inner_t.last_price,
                    CASE WHEN inner_t.prior_price IS NULL OR inner_t.prior_price = 0 THEN NULL
                         ELSE ((inner_t.last_price - inner_t.prior_price) / inner_t.prior_price) * 100
                    END AS change_pct
               FROM (
                 SELECT t1.sku,
                        (SELECT price::numeric FROM market_trades t2
                          WHERE t2.sku = t1.sku AND t2.escrow_status <> 'cancelled'
                          ORDER BY created_at DESC LIMIT 1) AS last_price,
                        (SELECT price::numeric FROM market_trades t2
                          WHERE t2.sku = t1.sku AND t2.escrow_status <> 'cancelled'
                            AND created_at <= NOW() - INTERVAL '24 hours'
                          ORDER BY created_at DESC LIMIT 1) AS prior_price
                   FROM market_trades t1
                  WHERE t1.created_at > NOW() - INTERVAL '24 hours'
                    AND t1.escrow_status <> 'cancelled'
                  GROUP BY t1.sku
               ) inner_t
           ) x
          WHERE x.change_pct IS NOT NULL
          ORDER BY ABS(x.change_pct) DESC
          LIMIT ${LIMIT}
       ) m
       LEFT JOIN card_meta cm ON cm.sku = m.sku
   `
  );

  // Second query — three buckets the first query doesn't cover cleanly
  // (window functions + watch count don't fit in the same CTE shape without
  // getting ugly; two focused round trips stay readable and each hits
  // different indexes).
  const aux = await query(
    `WITH card_meta AS (
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
     ),
     bids AS (
       SELECT sku, MAX(price)::numeric AS best_bid
         FROM market_orders
        WHERE side = 'bid' AND status IN ('open','partially_filled')
        GROUP BY sku
     )
     SELECT 'mostWatched' AS bucket, w.sku, cm.card_name, cm.image_url,
            w.watch_count::int AS n1,
            NULL::int          AS n2,
            a.best_ask         AS v1,
            NULL::numeric      AS v2
       FROM (
         SELECT sku, COUNT(*) AS watch_count
           FROM market_watches
          GROUP BY sku
          ORDER BY watch_count DESC
          LIMIT ${LIMIT}
       ) w
       LEFT JOIN card_meta cm ON cm.sku = w.sku
       LEFT JOIN asks      a  ON a.sku  = w.sku
     UNION ALL
     SELECT 'tightSpreads' AS bucket, s.sku, cm.card_name, cm.image_url,
            NULL::int       AS n1,
            NULL::int       AS n2,
            s.best_bid      AS v1,
            s.best_ask      AS v2
       FROM (
         SELECT b.sku, b.best_bid, a.best_ask,
                (a.best_ask - b.best_bid) / NULLIF(a.best_ask, 0) AS spread_pct
           FROM bids b
           JOIN asks a USING (sku)
          WHERE a.best_ask > b.best_bid
          ORDER BY spread_pct ASC
          LIMIT ${LIMIT}
       ) s
       LEFT JOIN card_meta cm ON cm.sku = s.sku
     UNION ALL
     SELECT 'recentTrades' AS bucket, rt.sku, cm.card_name, cm.image_url,
            NULL::int           AS n1,
            NULL::int           AS n2,
            rt.price::numeric   AS v1,
            EXTRACT(EPOCH FROM rt.created_at)::numeric AS v2
       FROM (
         SELECT sku, price, created_at
           FROM market_trades
          WHERE escrow_status <> 'cancelled'
          ORDER BY created_at DESC
          LIMIT ${LIMIT}
       ) rt
       LEFT JOIN card_meta cm ON cm.sku = rt.sku`
  );

  // Pivot flat rows into named buckets for the client
  type PulseRow = {
    bucket: string; sku: string; card_name: string | null; image_url: string | null;
    n1: number | null; n2: number | null;
    v1: string | number | null; v2: string | number | null;
  };
  const all: PulseRow[] = [...result.rows, ...aux.rows];
  const by: Record<string, PulseRow[]> = {};
  for (const r of all) {
    (by[r.bucket] ??= []).push(r);
  }

  return NextResponse.json({
    hot: (by.hot || []).map((r) => ({
      sku: r.sku, cardName: r.card_name, imageUrl: r.image_url,
      volume24h: r.n1 ?? 0, tradeCount24h: r.n2 ?? 0,
    })),
    movers: (by.movers || []).map((r) => ({
      sku: r.sku, cardName: r.card_name, imageUrl: r.image_url,
      lastPrice: r.v1 !== null ? parseFloat(String(r.v1)) : null,
      change24hPct: r.v2 !== null ? parseFloat(String(r.v2)) : null,
    })),
    mostWatched: (by.mostWatched || []).map((r) => ({
      sku: r.sku, cardName: r.card_name, imageUrl: r.image_url,
      watchCount: r.n1 ?? 0,
      bestAsk: r.v1 !== null ? parseFloat(String(r.v1)) : null,
    })),
    tightSpreads: (by.tightSpreads || []).map((r) => ({
      sku: r.sku, cardName: r.card_name, imageUrl: r.image_url,
      bestBid: r.v1 !== null ? parseFloat(String(r.v1)) : null,
      bestAsk: r.v2 !== null ? parseFloat(String(r.v2)) : null,
    })),
    recentTrades: (by.recentTrades || []).map((r) => ({
      sku: r.sku, cardName: r.card_name, imageUrl: r.image_url,
      price: r.v1 !== null ? parseFloat(String(r.v1)) : null,
      tradedAt: r.v2 !== null ? new Date(parseFloat(String(r.v2)) * 1000).toISOString() : null,
    })),
  });
}
