// Market watchlists + price alerts.
//
// Watches: lightweight "star this card" relation. The user's watchlist
// shows current best bid/ask + last trade price so they can scan their
// list for movement.
//
// Alerts: user defines a threshold + direction. The cron sweep checks each
// active alert once a minute; when the condition crosses, it fires an email
// and stamps last_fired_at to enforce a 24-hour cooldown.

import { query } from "@/lib/db";
import { logWatchAlertTransition } from "./watch-alert-lifecycle-log";

export interface WatchEntry {
  sku: string;
  card_name: string | null;
  image_url: string | null;
  best_bid: string | null;
  best_ask: string | null;
  last_trade_price: string | null;
  created_at: string;
}

export interface PriceAlert {
  id: string;
  user_id: string;
  sku: string;
  threshold_price: string;
  direction: "below" | "above";
  active: boolean;
  last_fired_at: string | null;
  created_at: string;
}

export async function addWatch(userId: string, sku: string): Promise<void> {
  // RETURNING — only emit a lifecycle row on a genuine insert; the
  // ON CONFLICT path means re-watching is a no-op and shouldn't
  // pollute the audit trail.
  const r = await query(
    `INSERT INTO market_watches (user_id, sku) VALUES ($1, $2)
       ON CONFLICT (user_id, sku) DO NOTHING
       RETURNING sku`,
    [userId, sku]
  );
  if (r.rows.length > 0) {
    void logWatchAlertTransition({
      userId, subjectKind: "watch", sku,
      action: "watch_added",
      actorLabel: "user",
      reason: `Watching ${sku}`,
    });
  }
}

export async function removeWatch(userId: string, sku: string): Promise<void> {
  const r = await query(
    `DELETE FROM market_watches WHERE user_id = $1 AND sku = $2 RETURNING sku`,
    [userId, sku]
  );
  if (r.rows.length > 0) {
    void logWatchAlertTransition({
      userId, subjectKind: "watch", sku,
      action: "watch_removed",
      actorLabel: "user",
      reason: `Unwatched ${sku}`,
    });
  }
}

export async function isWatching(userId: string, sku: string): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM market_watches WHERE user_id = $1 AND sku = $2`,
    [userId, sku]
  );
  return r.rows.length > 0;
}

// Watch list with live market context. One query per user — joins live order
// aggregates so the user sees current bid/ask alongside each watched card.
export async function listWatches(userId: string): Promise<WatchEntry[]> {
  const r = await query(
    `SELECT w.sku, w.created_at,
            -- card name + image: take the most recent order for this sku
            (SELECT card_name FROM market_orders
              WHERE sku = w.sku AND card_name IS NOT NULL
              ORDER BY created_at DESC LIMIT 1) AS card_name,
            (SELECT image_url FROM market_orders
              WHERE sku = w.sku AND image_url IS NOT NULL
              ORDER BY created_at DESC LIMIT 1) AS image_url,
            -- current bid/ask
            (SELECT MAX(price) FROM market_orders
              WHERE sku = w.sku AND side = 'bid' AND status IN ('open','partially_filled')) AS best_bid,
            (SELECT MIN(price) FROM market_orders
              WHERE sku = w.sku AND side = 'ask' AND status IN ('open','partially_filled')) AS best_ask,
            -- last trade
            (SELECT price FROM market_trades
              WHERE sku = w.sku AND escrow_status <> 'cancelled'
              ORDER BY created_at DESC LIMIT 1) AS last_trade_price
       FROM market_watches w
      WHERE w.user_id = $1
      ORDER BY w.created_at DESC`,
    [userId]
  );
  return r.rows as WatchEntry[];
}

export async function createAlert(data: {
  userId: string;
  sku: string;
  thresholdPrice: number;
  direction: "below" | "above";
}): Promise<PriceAlert> {
  const r = await query(
    `INSERT INTO price_alerts (user_id, sku, threshold_price, direction)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.userId, data.sku, data.thresholdPrice.toFixed(2), data.direction]
  );
  const alert = r.rows[0] as PriceAlert;

  void logWatchAlertTransition({
    userId: data.userId,
    subjectKind: "alert",
    alertId: alert.id,
    sku: data.sku,
    action: "alert_created",
    actorLabel: "user",
    reason: `Alert: ${data.sku} ${data.direction} £${data.thresholdPrice.toFixed(2)}`,
    metadata: {
      threshold_price: data.thresholdPrice.toFixed(2),
      direction: data.direction,
    },
  });

  return alert;
}

export async function listUserAlerts(userId: string): Promise<PriceAlert[]> {
  const r = await query(
    `SELECT * FROM price_alerts WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return r.rows as PriceAlert[];
}

export async function deleteAlert(userId: string, alertId: string): Promise<boolean> {
  // RETURNING sku so the lifecycle row carries the SKU even though
  // the row itself is gone (FK cascade nulls alert_id, which is fine
  // — the audit row stays via the user_id index).
  const r = await query(
    `DELETE FROM price_alerts WHERE id = $1 AND user_id = $2 RETURNING id, sku`,
    [alertId, userId]
  );
  if (r.rows.length > 0) {
    void logWatchAlertTransition({
      userId, subjectKind: "alert",
      sku: r.rows[0].sku,
      action: "alert_deleted",
      actorLabel: "user",
      reason: `Deleted alert on ${r.rows[0].sku}`,
    });
  }
  return r.rows.length > 0;
}

// ── Cron: scan active alerts and fire any that just crossed threshold ──
//
// 'below' direction: best_ask <= threshold (someone is now selling at or
//   under your target). Falls back to last_trade_price if there's no ask.
// 'above' direction: last_trade_price >= threshold (the card sold at or
//   above your target).
//
// Per-alert 24h cooldown. Bounded MAX_FIRES_PER_RUN to keep email cost
// predictable in pathological backlogs.

const MAX_FIRES_PER_RUN = 100;

export interface AlertSweepResult {
  fired: number;
  failures: number;
  throttled: boolean;
}

export async function runAlertSweep(): Promise<AlertSweepResult> {
  const result: AlertSweepResult = { fired: 0, failures: 0, throttled: false };

  // Resolve current price points per SKU in one pass to keep the query count
  // bounded as alerts grow.
  const alerts = await query(
    `WITH live AS (
       SELECT a.id, a.user_id, a.sku, a.threshold_price::numeric AS threshold,
              a.direction,
              u.email AS user_email,
              (SELECT MIN(price)::numeric FROM market_orders
                WHERE sku = a.sku AND side = 'ask' AND status IN ('open','partially_filled')
              ) AS best_ask,
              (SELECT price::numeric FROM market_trades
                WHERE sku = a.sku AND escrow_status <> 'cancelled'
                ORDER BY created_at DESC LIMIT 1
              ) AS last_trade_price,
              (SELECT card_name FROM market_orders
                WHERE sku = a.sku AND card_name IS NOT NULL
                ORDER BY created_at DESC LIMIT 1
              ) AS card_name
         FROM price_alerts a
         JOIN users u ON u.id = a.user_id
        WHERE a.active = true
          AND (a.last_fired_at IS NULL OR a.last_fired_at < NOW() - INTERVAL '24 hours') -- audit:cadence-platform — alert throttling, not a user deadline.
     )
     SELECT * FROM live
      WHERE (direction = 'below' AND COALESCE(best_ask, last_trade_price) IS NOT NULL
              AND COALESCE(best_ask, last_trade_price) <= threshold)
         OR (direction = 'above' AND last_trade_price IS NOT NULL
              AND last_trade_price >= threshold)
      ORDER BY id
      LIMIT $1`,
    [MAX_FIRES_PER_RUN + 1]
  );

  if (alerts.rows.length > MAX_FIRES_PER_RUN) {
    result.throttled = true;
    alerts.rows.length = MAX_FIRES_PER_RUN;
    // One throttle row per sweep tick — admins can spot back-pressure
    // by querying action='alert_throttled' over time. user_id is the
    // first throttled alert's owner; the metadata.run_size carries the
    // total count so the row's still useful as a signal.
    const first = alerts.rows[0];
    void logWatchAlertTransition({
      userId: first.user_id,
      subjectKind: "alert",
      action: "alert_throttled",
      actorLabel: "system:alert-sweep",
      reason: `Sweep hit MAX_FIRES_PER_RUN=${MAX_FIRES_PER_RUN}`,
      metadata: { run_size: alerts.rows.length, max: MAX_FIRES_PER_RUN },
    });
  }

  if (alerts.rows.length === 0) return result;

  const { sendPriceAlertEmail } = await import("./email");
  const { formatPrice } = await import("@/lib/format");

  for (const a of alerts.rows) {
    const currentPrice = a.direction === "below"
      ? (a.best_ask ?? a.last_trade_price)
      : a.last_trade_price;
    try {
      await sendPriceAlertEmail({
        email: a.user_email,
        cardName: a.card_name || a.sku,
        sku: a.sku,
        currentPrice: formatPrice(parseFloat(currentPrice)),
        threshold: formatPrice(parseFloat(a.threshold)),
        direction: a.direction,
      });
      // Stamp cooldown only on successful send so transient SES failures
      // don't silently mute the alert for 24 hours.
      await query(
        `UPDATE price_alerts SET last_fired_at = NOW() WHERE id = $1`,
        [a.id]
      );
      void logWatchAlertTransition({
        userId: a.user_id,
        subjectKind: "alert",
        alertId: a.id,
        sku: a.sku,
        action: "alert_fired",
        actorLabel: "system:alert-sweep",
        reason: `${a.card_name || a.sku} crossed ${a.direction} £${a.threshold}`,
        metadata: {
          direction: a.direction,
          threshold: a.threshold.toString(),
          current_price: currentPrice?.toString() ?? null,
        },
      });
      result.fired++;
    } catch (err) {
      console.error(`[alerts] fire failed for ${a.id}:`, err);
      result.failures++;
    }
  }

  return result;
}
