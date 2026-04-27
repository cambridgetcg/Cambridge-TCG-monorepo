// Weekly market digests. Two flavours:
//
//   runSellerRestockDigest — to users who've completed at least one sale
//     in the last 90 days. Surfaces the top-opportunity cards (high buyer
//     demand + low supply) they might want to list.
//
//   runBuyerWatchlistDigest — to users with at least one watched card.
//     Summarises price moves, fresh asks, and recent trades across their
//     watchlist over the last 7 days.
//
// Both are claim-gated via the digest_runs table so the per-minute cron
// can call them safely — the conditional UPDATE only succeeds once per
// RUN_INTERVAL_HOURS window.

import { query } from "@/lib/db";
import {
  sendSellerRestockDigest,
  sendBuyerWatchlistDigest,
} from "./email";

const RUN_INTERVAL_HOURS = 23; // < 24 so clock drift doesn't skip a week
const MAX_OPPORTUNITIES_PER_SELLER = 10;
const MAX_MOVES_PER_BUYER = 15;

// Returns true if THIS call successfully claimed the run window.
async function claim(kind: string): Promise<boolean> {
  const r = await query(
    `INSERT INTO digest_runs (kind, last_run_at)
     VALUES ($1, NOW())
     ON CONFLICT (kind) DO UPDATE
        SET last_run_at = NOW(),
            updated_at  = NOW()
      WHERE digest_runs.last_run_at IS NULL
         OR digest_runs.last_run_at < NOW() - make_interval(hours => $2)
     RETURNING kind`,
    [kind, RUN_INTERVAL_HOURS]
  );
  return r.rows.length > 0;
}

async function recordSent(kind: string, count: number): Promise<void> {
  await query(
    `UPDATE digest_runs SET last_sent = $2, updated_at = NOW() WHERE kind = $1`,
    [kind, count]
  );
}

// Gate: only runs on Monday 09:00 UTC. The cron tick lands on this minute
// once per week; the digest_runs claim prevents retries.
function isWindow(now = new Date()): boolean {
  return now.getUTCDay() === 1 && now.getUTCHours() === 9;
}

// ── Sellers: restock opportunities ──

export async function runSellerRestockDigest(opts?: { force?: boolean }): Promise<{ sent: number; skipped: boolean }> {
  if (!opts?.force && !isWindow()) return { sent: 0, skipped: true };
  if (!(await claim("seller_restock"))) return { sent: 0, skipped: true };

  // Active sellers = at least one non-cancelled trade in 90d
  const sellers = await query(
    `SELECT DISTINCT t.seller_id, u.email, u.name
       FROM market_trades t
       JOIN users u ON u.id = t.seller_id
      WHERE t.escrow_status <> 'cancelled'
        AND t.created_at > NOW() - INTERVAL '90 days'
        AND u.email IS NOT NULL`
  );

  // One query for everyone's opportunities — demand signals aggregated by sku.
  // Each seller gets the same top-N list; per-seller personalisation (only
  // cards they've sold before) is a richer v2.
  const top = await query(
    `WITH watch_agg AS (
       SELECT sku, COUNT(*)::int AS watch_count
         FROM market_watches GROUP BY sku
     ),
     alert_agg AS (
       SELECT sku, COUNT(*) FILTER (WHERE direction='below' AND active)::int AS alert_count
         FROM price_alerts GROUP BY sku
     ),
     asks AS (
       SELECT sku, MIN(price)::numeric AS best_ask,
              SUM(quantity - filled_quantity)::int AS ask_depth
         FROM market_orders
        WHERE side='ask' AND status IN ('open','partially_filled')
        GROUP BY sku
     ),
     card_meta AS (
       SELECT DISTINCT ON (sku) sku, card_name
         FROM market_orders
        WHERE card_name IS NOT NULL
        ORDER BY sku, created_at DESC
     )
     SELECT w.sku, cm.card_name, a.best_ask,
            w.watch_count,
            COALESCE(al.alert_count, 0) AS alert_count,
            COALESCE(a.ask_depth, 0)    AS ask_depth
       FROM watch_agg w
       LEFT JOIN alert_agg al ON al.sku = w.sku
       LEFT JOIN asks      a  ON a.sku  = w.sku
       LEFT JOIN card_meta cm ON cm.sku = w.sku
      WHERE cm.card_name IS NOT NULL
        AND w.watch_count > 0
      ORDER BY (w.watch_count + COALESCE(al.alert_count, 0) * 2) DESC,
               a.ask_depth ASC NULLS FIRST
      LIMIT $1`,
    [MAX_OPPORTUNITIES_PER_SELLER]
  );

  const opportunities = top.rows.map((r) => {
    const w = r.watch_count as number;
    const a = r.alert_count as number;
    const d = r.ask_depth as number;
    const score = w + a * 2;
    const opportunity = d > 0 ? score / d : score * 2;
    return {
      cardName: r.card_name as string,
      sku: r.sku as string,
      bestAsk: r.best_ask ? parseFloat(r.best_ask) : null,
      watchCount: w,
      alertCount: a,
      opportunityScore: Math.round(opportunity * 10) / 10,
    };
  });

  if (opportunities.length === 0) {
    await recordSent("seller_restock", 0);
    return { sent: 0, skipped: false };
  }

  let sent = 0;
  for (const s of sellers.rows) {
    try {
      await sendSellerRestockDigest({
        email: s.email,
        name: s.name,
        opportunities,
      });
      sent++;
    } catch (err) {
      console.error(`[digest] restock to ${s.email} failed:`, err);
    }
  }
  await recordSent("seller_restock", sent);
  return { sent, skipped: false };
}

// ── Buyers: watchlist movement ──

export async function runBuyerWatchlistDigest(opts?: { force?: boolean }): Promise<{ sent: number; skipped: boolean }> {
  if (!opts?.force && !isWindow()) return { sent: 0, skipped: true };
  if (!(await claim("buyer_watchlist"))) return { sent: 0, skipped: true };

  // Find users with at least one watch
  const watchers = await query(
    `SELECT DISTINCT w.user_id, u.email, u.name
       FROM market_watches w
       JOIN users u ON u.id = w.user_id
      WHERE u.email IS NOT NULL`
  );

  // Collect all users-with-follows in one pass so the per-user loop below
  // can cheaply enrich its digest with followed-seller asks.
  const followed = await query(
    `SELECT follower_id, following_id FROM follows`
  );
  const followedBy = new Map<string, string[]>();
  for (const f of followed.rows) {
    const arr = followedBy.get(f.follower_id) ?? [];
    arr.push(f.following_id);
    followedBy.set(f.follower_id, arr);
  }

  let sent = 0;
  for (const w of watchers.rows) {
    // Per-user: find price moves on their watches over last 7d.
    // "Note" is whichever of (new ask / ask dropped / sold low) applies.
    // We cap to MAX_MOVES_PER_BUYER so the email stays scannable.
    const moves = await query(
      `WITH me AS (
         SELECT sku FROM market_watches WHERE user_id = $1
       ),
       cur_ask AS (
         SELECT sku, MIN(price)::numeric AS best_ask
           FROM market_orders
          WHERE sku IN (SELECT sku FROM me)
            AND side='ask' AND status IN ('open','partially_filled')
          GROUP BY sku
       ),
       week_ago_ask AS (
         -- Cheapest ask from more than 7d ago that's still/was open. Best
         -- available approximation without time-series snapshots.
         SELECT sku, MIN(price)::numeric AS best_ask
           FROM market_orders
          WHERE sku IN (SELECT sku FROM me)
            AND side='ask'
            AND created_at <= NOW() - INTERVAL '7 days'
          GROUP BY sku
       ),
       last_low AS (
         SELECT sku, MIN(price::numeric) AS low_price
           FROM market_trades
          WHERE sku IN (SELECT sku FROM me)
            AND created_at > NOW() - INTERVAL '7 days'
            AND escrow_status <> 'cancelled'
          GROUP BY sku
       ),
       meta AS (
         SELECT DISTINCT ON (sku) sku, card_name
           FROM market_orders
          WHERE card_name IS NOT NULL
          ORDER BY sku, created_at DESC
       )
       SELECT m.sku, mt.card_name,
              cur.best_ask                AS cur_ask,
              prev.best_ask               AS prev_ask,
              lo.low_price                AS week_low
         FROM me m
         LEFT JOIN cur_ask       cur  ON cur.sku  = m.sku
         LEFT JOIN week_ago_ask  prev ON prev.sku = m.sku
         LEFT JOIN last_low      lo   ON lo.sku   = m.sku
         LEFT JOIN meta          mt   ON mt.sku   = m.sku
        WHERE mt.card_name IS NOT NULL
          AND (
                cur.best_ask IS NOT NULL AND prev.best_ask IS NULL  -- new ask appeared
             OR cur.best_ask IS NOT NULL AND prev.best_ask > cur.best_ask  -- ask dropped
             OR lo.low_price IS NOT NULL                               -- trade happened
          )
        LIMIT $2`,
      [w.user_id, MAX_MOVES_PER_BUYER]
    );

    const digested = moves.rows.map((r) => {
      const cur = r.cur_ask ? parseFloat(r.cur_ask) : null;
      const prev = r.prev_ask ? parseFloat(r.prev_ask) : null;
      const low = r.week_low ? parseFloat(r.week_low) : null;

      let note: string;
      let before: number | null = null;
      let after: number | null = null;

      if (prev !== null && cur !== null && cur < prev) {
        note = "Ask dropped";
        before = prev;
        after = cur;
      } else if (cur !== null && prev === null) {
        note = "New ask";
        after = cur;
      } else if (low !== null) {
        note = `Traded at ${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(low)}`;
        after = low;
      } else {
        note = "Update";
        after = cur;
      }

      return { cardName: r.card_name as string, sku: r.sku as string, before, after, note };
    });

    // Enrich with "seller you follow" activity: fresh asks from followed
    // sellers over the last 7d. Keeps follower signal in the digest without
    // a separate email type.
    const followedIds = followedBy.get(w.user_id);
    if (followedIds && followedIds.length > 0) {
      const followedAsks = await query(
        `SELECT o.sku, o.card_name, o.price::numeric AS ask_price,
                o.created_at, u.username AS seller_username
           FROM market_orders o
           JOIN users u ON u.id = o.user_id
          WHERE o.side = 'ask'
            AND o.status IN ('open','partially_filled')
            AND o.user_id = ANY($1)
            AND o.created_at > NOW() - INTERVAL '7 days'
            AND o.card_name IS NOT NULL
          ORDER BY o.created_at DESC
          LIMIT 5`,
        [followedIds]
      );
      for (const a of followedAsks.rows) {
        if (digested.length >= MAX_MOVES_PER_BUYER) break;
        digested.push({
          cardName: a.card_name as string,
          sku: a.sku as string,
          before: null,
          after: parseFloat(a.ask_price),
          note: `@${a.seller_username} listed`,
        });
      }
    }

    if (digested.length === 0) continue;

    try {
      await sendBuyerWatchlistDigest({
        email: w.email,
        name: w.name,
        moves: digested,
      });
      sent++;
    } catch (err) {
      console.error(`[digest] watchlist to ${w.email} failed:`, err);
    }
  }
  await recordSent("buyer_watchlist", sent);
  return { sent, skipped: false };
}
