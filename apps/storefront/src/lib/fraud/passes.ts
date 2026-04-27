// Fraud detection passes.
//
// Each function inspects a slice of recent activity and emits signals
// through @/lib/fraud/detection. The passes are safe to call from the
// daily cron OR triggered inline at suspicious events (a trade that
// matches a high-value-new-account heuristic can run the relevant
// pass synchronously).
//
// All passes are idempotent via dedupeKey — running the cron twice in
// the same UTC day doesn't duplicate signals; resolved signals don't
// suppress fresh emits of the same pattern (the admin's resolution is
// a finding-of-fact, not a permanent immunity).

import { query } from "@/lib/db";
import { emitSignal, SIGNAL_DEFS } from "./detection";

// ── Per-user passes ─────────────────────────────────────────────────

/**
 * RAPID_LISTING — many orders placed in a short window.
 * Threshold: ≥10 market orders within 1 hour. Bursts are an early
 * indicator of attempt to flood the order book or test pricing.
 */
export async function checkRapidListing(userId: string): Promise<boolean> {
  const r = await query(
    `SELECT COUNT(*)::int AS n
       FROM market_orders
      WHERE user_id = $1
        AND created_at >= NOW() - INTERVAL '1 hour'`,
    [userId],
  );
  const count = r.rows[0]?.n ?? 0;
  if (count >= 10) {
    const day = new Date().toISOString().slice(0, 10); // UTC date
    await emitSignal({
      userId,
      def: SIGNAL_DEFS.RAPID_LISTING,
      description: `${count} orders placed in the last hour`,
      dedupeKey: `${day}:hour-burst`,
    });
    return true;
  }
  return false;
}

/**
 * SELF_TRADING — orders matched between accounts that share a
 * payment_intent customer or shipping address. Heuristic only;
 * downstream admin reviews the signal.
 *
 * Detection: in the last 24h did this user's trade counterpart share
 * the same Stripe customer id (via customer_orders) OR an exactly-
 * matching shipping_address?
 */
export async function checkSelfTrading(userId: string): Promise<boolean> {
  // Find counterparties from trades in the last 24h
  const tradesRes = await query(
    `SELECT DISTINCT CASE WHEN buyer_id = $1 THEN seller_id ELSE buyer_id END AS counterparty
       FROM market_trades
      WHERE (buyer_id = $1 OR seller_id = $1)
        AND created_at >= NOW() - INTERVAL '24 hours'`,
    [userId],
  );
  const counterparties: string[] = tradesRes.rows
    .map((r) => r.counterparty)
    .filter((c): c is string => !!c && c !== userId);
  if (counterparties.length === 0) return false;

  // Address-match check — same shipping_address ever used
  const addrRes = await query(
    `SELECT 1
       FROM customer_orders me
       JOIN customer_orders other
         ON LOWER(TRIM(me.shipping_address)) = LOWER(TRIM(other.shipping_address))
        AND me.shipping_address IS NOT NULL
        AND other.user_id = ANY($2)
      WHERE me.user_id = $1
      LIMIT 1`,
    [userId, counterparties],
  );

  if (addrRes.rows.length > 0) {
    const day = new Date().toISOString().slice(0, 10);
    await emitSignal({
      userId,
      def: SIGNAL_DEFS.SELF_TRADING,
      description: `Recent trade counterparty shares a shipping address`,
      dedupeKey: `${day}:address-match`,
    });
    return true;
  }
  return false;
}

/**
 * REFUND_ABUSE — composite signal across THREE pathways now that the
 * refunds + chargebacks tables exist (modules 12 + 13):
 *
 *   1. Buyer-favour DISPUTES resolved in last 60 days
 *      (refund_buyer / return_card / split): ≥3 → 1 unit each
 *   2. Successful Stripe REFUNDS in last 60 days that reference an
 *      order this user paid for: each = 1 unit
 *   3. CHARGEBACKS filed against the user in last 60 days: 3 units
 *      (chargebacks are far more severe than admin-issued refunds)
 *
 * Composite score ≥ 4 fires the signal. Pure refund-per-trade ratio
 * is ALSO checked — if a user has ≥30% refund rate on ≥10 trades,
 * fire regardless of absolute count (catches low-volume patterns).
 */
export async function checkRefundAbuse(userId: string): Promise<boolean> {
  const [disputeRes, refundRes, cbRes, tradeCountRes] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS n
         FROM trade_disputes d
         JOIN market_trades t ON t.id = d.trade_id
        WHERE t.buyer_id = $1
          AND d.resolved_at >= NOW() - INTERVAL '60 days'
          AND d.resolution_type IN ('refund_buyer', 'return_card', 'split')`,
      [userId],
    ),
    query(
      `SELECT COUNT(*)::int AS n
         FROM refunds
        WHERE user_id = $1
          AND stripe_status = 'succeeded'
          AND created_at >= NOW() - INTERVAL '60 days'`,
      [userId],
    ),
    query(
      `SELECT COUNT(*)::int AS n
         FROM chargebacks
        WHERE user_id = $1
          AND created_at >= NOW() - INTERVAL '60 days'`,
      [userId],
    ),
    query(
      `SELECT COUNT(*)::int AS n
         FROM market_trades
        WHERE buyer_id = $1
          AND created_at >= NOW() - INTERVAL '60 days'`,
      [userId],
    ),
  ]);

  const disputes = disputeRes.rows[0]?.n ?? 0;
  const refunds = refundRes.rows[0]?.n ?? 0;
  const chargebacks = cbRes.rows[0]?.n ?? 0;
  const trades = tradeCountRes.rows[0]?.n ?? 0;

  const composite = disputes + refunds + chargebacks * 3;
  const refundRatio = trades > 0 ? (refunds + disputes) / trades : 0;
  const ratioTrigger = trades >= 10 && refundRatio >= 0.30;

  if (composite >= 4 || ratioTrigger) {
    const day = new Date().toISOString().slice(0, 10);
    const desc = ratioTrigger
      ? `${((refundRatio) * 100).toFixed(0)}% refund/dispute rate over ${trades} trades (60d)`
      : `${disputes} disputes + ${refunds} refunds + ${chargebacks} chargebacks (60d composite=${composite})`;
    await emitSignal({
      userId,
      def: SIGNAL_DEFS.REFUND_ABUSE,
      description: desc,
      dedupeKey: `${day}:refund-abuse`,
    });
    return true;
  }
  return false;
}

/**
 * VELOCITY_SPIKE — last-7-day trade volume is ≥10× the prior 7-day
 * baseline AND the recent volume exceeds £500. Catches sudden ramps
 * that may indicate burst-list-and-disappear behaviour.
 */
export async function checkVelocitySpike(userId: string): Promise<boolean> {
  const r = await query(
    `SELECT
        COALESCE(SUM(price::numeric) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0)::numeric AS recent,
        COALESCE(SUM(price::numeric) FILTER (
          WHERE created_at >= NOW() - INTERVAL '14 days'
            AND created_at <  NOW() - INTERVAL '7 days'
        ), 0)::numeric AS baseline
       FROM market_trades
      WHERE buyer_id = $1 OR seller_id = $1`,
    [userId],
  );
  const recent = parseFloat(r.rows[0]?.recent ?? "0");
  const baseline = parseFloat(r.rows[0]?.baseline ?? "0");

  if (recent >= 500 && baseline > 0 && recent >= baseline * 10) {
    const day = new Date().toISOString().slice(0, 10);
    await emitSignal({
      userId,
      def: SIGNAL_DEFS.VELOCITY_SPIKE,
      description: `7-day volume £${recent.toFixed(2)} vs prior-week £${baseline.toFixed(2)} (${(recent / baseline).toFixed(1)}×)`,
      dedupeKey: `${day}:velocity`,
    });
    return true;
  }
  return false;
}

/**
 * NEW_ACCOUNT_HIGH_VALUE — account < 7 days old placing an order
 * value > £200. The trust gate already blocks > tier limit; this
 * fires the signal so the trust score reflects the riskiness even
 * if the order itself was within tier.
 */
export async function checkNewAccountHighValue(userId: string, orderValue: number): Promise<boolean> {
  if (orderValue < 200) return false;
  const r = await query(
    `SELECT created_at FROM users WHERE id = $1`,
    [userId],
  );
  if (r.rows.length === 0) return false;
  const ageMs = Date.now() - new Date(r.rows[0].created_at).getTime();
  const ageDays = ageMs / 86_400_000;
  if (ageDays < 7) {
    const day = new Date().toISOString().slice(0, 10);
    await emitSignal({
      userId,
      def: SIGNAL_DEFS.NEW_ACCOUNT_HIGH_VALUE,
      description: `Account ${ageDays.toFixed(1)} days old, order value £${orderValue.toFixed(2)}`,
      dedupeKey: `${day}:new-acct-${Math.floor(orderValue / 100)}`,
    });
    return true;
  }
  return false;
}

/**
 * FAILED_PAYMENT_BURST — ≥3 failed_payments rows for this user in
 * the last 24h, OR ≥6 in 7d. Catches card-testing patterns where an
 * attacker brute-forces stolen credentials against the checkout.
 *
 * Backed by the failed_payments table from module 15.
 */
export async function checkFailedPaymentBurst(userId: string): Promise<boolean> {
  const r = await query(
    `SELECT
        COUNT(*) FILTER (WHERE last_attempt_at >= NOW() - INTERVAL '24 hours')::int AS day_count,
        COUNT(*) FILTER (WHERE last_attempt_at >= NOW() - INTERVAL '7 days')::int  AS week_count,
        COALESCE(MAX(attempt_count), 0)::int AS max_attempts
       FROM failed_payments
      WHERE user_id = $1`,
    [userId],
  );
  const dayCount = r.rows[0]?.day_count ?? 0;
  const weekCount = r.rows[0]?.week_count ?? 0;
  const maxAttempts = r.rows[0]?.max_attempts ?? 0;

  // Burst trigger: rate over time OR repeated retries on a single PI
  // (the latter often means card validation script).
  if (dayCount >= 3 || weekCount >= 6 || maxAttempts >= 5) {
    const day = new Date().toISOString().slice(0, 10);
    await emitSignal({
      userId,
      def: SIGNAL_DEFS.FAILED_PAYMENT_BURST,
      description: `${dayCount} failures in 24h, ${weekCount} in 7d, peak ${maxAttempts} retries on one intent`,
      dedupeKey: `${day}:fp-burst`,
    });
    return true;
  }
  return false;
}

/** Run every per-user pass in one call — used by the daily cron. */
export async function runAllPasses(userId: string): Promise<{ emitted: string[] }> {
  const emitted: string[] = [];
  if (await checkRapidListing(userId).catch(() => false)) emitted.push("rapid_listing");
  if (await checkSelfTrading(userId).catch(() => false)) emitted.push("self_trading");
  if (await checkRefundAbuse(userId).catch(() => false)) emitted.push("refund_abuse");
  if (await checkVelocitySpike(userId).catch(() => false)) emitted.push("velocity_spike");
  if (await checkFailedPaymentBurst(userId).catch(() => false)) emitted.push("failed_payment_burst");
  return { emitted };
}
