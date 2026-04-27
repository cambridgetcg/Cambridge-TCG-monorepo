// Liquidity mining: reward sellers who post honest asks and leave them
// resting. The marketplace pays them small store-credit bonuses — credit
// is non-withdrawable, so the cost is capped at the value of future
// CTCG purchases the seller makes.
//
// Rules (tunable below):
//   - Seller has completed ≥ MIN_SELLER_TRADES (prevents farm accounts).
//   - Ask has been open ≥ MIN_REST_HOURS uninterrupted.
//   - Ask price is within MAX_VWAP_DEVIATION of the sku's 30d VWAP (tight,
//     not aspirational — spammy high asks don't qualify).
//   - One reward per (order, UTC day) via unique index on liquidity_rewards.
//   - Per user, at most MAX_ORDERS_PER_USER_PER_DAY rewards per run.
//
// Runs from the minute cron; the UTC-day key on liquidity_rewards means
// re-running within the same day is idempotent.

import { query } from "@/lib/db";

const MIN_SELLER_TRADES = 10;
const MIN_REST_HOURS = 6;
const MAX_VWAP_DEVIATION = 0.05;  // ±5%
const REWARD_PER_ORDER_PER_DAY = 0.10; // £0.10 store credit
const MAX_ORDERS_PER_USER_PER_DAY = 10;
const MAX_AWARDS_PER_RUN = 200;   // global safety bound

export interface LiquidityMiningResult {
  awards: number;
  amountGbp: number;
  throttled: boolean;
}

export async function runLiquidityMining(): Promise<LiquidityMiningResult> {
  // Single query: find qualifying (order, seller) pairs that haven't been
  // rewarded today. VWAP is computed inline per sku from the last 30d of
  // non-cancelled trades — small N per sku, acceptable cost.
  const qualifying = await query(
    `WITH vwap AS (
       SELECT sku,
              (SUM(price::numeric * quantity) / NULLIF(SUM(quantity), 0))::numeric AS vwap
         FROM market_trades
        WHERE created_at > NOW() - INTERVAL '30 days'
          AND escrow_status <> 'cancelled'
        GROUP BY sku
     ),
     seller_activity AS (
       SELECT seller_id, COUNT(*)::int AS completed_trades
         FROM market_trades
        WHERE escrow_status IN ('completed','paid','shipped_to_buyer','verified','received_by_ctcg','shipped_to_ctcg')
        GROUP BY seller_id
     ),
     today AS (SELECT (NOW() AT TIME ZONE 'UTC')::date AS d)
     SELECT o.id AS order_id, o.user_id, o.sku, o.price::numeric AS ask_price,
            v.vwap, (SELECT d FROM today) AS award_date
       FROM market_orders o
       JOIN vwap           v  ON v.sku = o.sku
       JOIN seller_activity s ON s.seller_id = o.user_id
      WHERE o.side = 'ask'
        AND o.status IN ('open','partially_filled')
        AND o.created_at <= NOW() - make_interval(hours => $1)
        AND s.completed_trades >= $2
        AND v.vwap IS NOT NULL AND v.vwap > 0
        AND ABS(o.price::numeric - v.vwap) / v.vwap <= $3
        AND NOT EXISTS (
          SELECT 1 FROM liquidity_rewards r
           WHERE r.order_id = o.id
             AND r.awarded_for_date = (SELECT d FROM today)
        )
      ORDER BY o.created_at ASC
      LIMIT $4`,
    [MIN_REST_HOURS, MIN_SELLER_TRADES, MAX_VWAP_DEVIATION, MAX_AWARDS_PER_RUN + 1]
  );

  const throttled = qualifying.rows.length > MAX_AWARDS_PER_RUN;
  if (throttled) qualifying.rows.length = MAX_AWARDS_PER_RUN;

  if (qualifying.rows.length === 0) {
    return { awards: 0, amountGbp: 0, throttled };
  }

  // Per-user counters. Respect MAX_ORDERS_PER_USER_PER_DAY even though the
  // cron may run multiple minutes — use liquidity_rewards as the source of
  // truth (count today's rewards per user, not this run's).
  const todayCountsRes = await query(
    `SELECT user_id, COUNT(*)::int AS c
       FROM liquidity_rewards
      WHERE awarded_for_date = (NOW() AT TIME ZONE 'UTC')::date
      GROUP BY user_id`
  );
  const userCountToday = new Map<string, number>();
  for (const r of todayCountsRes.rows) {
    userCountToday.set(r.user_id, r.c);
  }

  let awards = 0;
  let totalGbp = 0;

  // Sequential txns per award — simpler reasoning; cron is a single worker
  // so no concurrency concern. Each award is its own transaction so one
  // failure doesn't block the batch.
  const { default: pg } = await import("pg");
  const raw = process.env.DATABASE_URL || "";
  const cleaned = raw.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
  const pool = new pg.Pool({ connectionString: cleaned, ssl: { rejectUnauthorized: false } });

  try {
    for (const row of qualifying.rows) {
      const currentCount = userCountToday.get(row.user_id) ?? 0;
      if (currentCount >= MAX_ORDERS_PER_USER_PER_DAY) continue;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Try to claim — unique (order_id, awarded_for_date) makes this safe
        // under concurrent runs.
        const claim = await client.query(
          `INSERT INTO liquidity_rewards
             (user_id, order_id, sku, ask_price, vwap_at_reward, amount_gbp, awarded_for_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [row.user_id, row.order_id, row.sku, row.ask_price, row.vwap,
           REWARD_PER_ORDER_PER_DAY.toFixed(2), row.award_date]
        );
        if (claim.rows.length === 0) {
          await client.query("ROLLBACK");
          continue;
        }

        // Bump the balance and write a ledger entry referencing the reward row.
        const balanceRes = await client.query(
          `UPDATE users SET store_credit_balance = store_credit_balance + $2
            WHERE id = $1 RETURNING store_credit_balance::numeric AS balance`,
          [row.user_id, REWARD_PER_ORDER_PER_DAY.toFixed(2)]
        );
        const newBalance = balanceRes.rows[0]?.balance;

        await client.query(
          `INSERT INTO store_credit_ledger (user_id, amount, balance, type, description, reference_id)
           VALUES ($1, $2, $3, 'liquidity_bonus',
                   'Resting ask within 5% of VWAP', $4)`,
          [row.user_id, REWARD_PER_ORDER_PER_DAY.toFixed(2),
           newBalance ?? "0", claim.rows[0].id]
        );

        await client.query("COMMIT");

        awards++;
        totalGbp += REWARD_PER_ORDER_PER_DAY;
        userCountToday.set(row.user_id, currentCount + 1);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(`[liquidity] award failed for order ${row.order_id}:`, err);
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }

  return { awards, amountGbp: Math.round(totalGbp * 100) / 100, throttled };
}
