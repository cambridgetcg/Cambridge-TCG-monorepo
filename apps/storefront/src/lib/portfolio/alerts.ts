// Price-alert domain logic.
//
// Life cycle:
//   create (POST /api/portfolio/alerts) → row saved with enabled=true
//   evaluate (runPriceAlertSweep, called from cron) → compare latest
//     spot_gbp with threshold; if crossed, queue an email and stamp
//     last_notified_at
//   user toggles or deletes (PATCH/DELETE /api/portfolio/alerts/[id])
//
// Re-notification policy: once an alert fires, it won't re-fire within 7
// days for the same alert row — prevents flapping if the price oscillates
// around the threshold.

import { query } from "@/lib/db";
import { scheduleEmail } from "@/lib/email/queue";

export type AlertDirection = "above" | "below";

export interface PriceAlert {
  id: string;
  user_id: string;
  sku: string;
  direction: AlertDirection;
  threshold_gbp: string;
  enabled: boolean;
  last_notified_at: string | null;
  card_name: string | null;
  card_number: string | null;
  image_url: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAlertArgs {
  userId: string;
  sku: string;
  direction: AlertDirection;
  thresholdGbp: number;
  cardName?: string | null;
  cardNumber?: string | null;
  imageUrl?: string | null;
  note?: string | null;
}

export async function listAlerts(userId: string): Promise<PriceAlert[]> {
  const r = await query(
    `SELECT * FROM portfolio_price_alerts WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return r.rows as PriceAlert[];
}

export async function createAlert(a: CreateAlertArgs): Promise<PriceAlert> {
  const r = await query(
    `INSERT INTO portfolio_price_alerts
       (user_id, sku, direction, threshold_gbp, card_name, card_number, image_url, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, sku, direction) DO UPDATE SET
       threshold_gbp = EXCLUDED.threshold_gbp,
       card_name = COALESCE(EXCLUDED.card_name, portfolio_price_alerts.card_name),
       card_number = COALESCE(EXCLUDED.card_number, portfolio_price_alerts.card_number),
       image_url = COALESCE(EXCLUDED.image_url, portfolio_price_alerts.image_url),
       note = EXCLUDED.note,
       enabled = true,
       last_notified_at = NULL,
       updated_at = NOW()
     RETURNING *`,
    [
      a.userId, a.sku, a.direction, a.thresholdGbp.toFixed(2),
      a.cardName ?? null, a.cardNumber ?? null, a.imageUrl ?? null, a.note ?? null,
    ],
  );
  return r.rows[0];
}

export async function setAlertEnabled(id: string, userId: string, enabled: boolean): Promise<boolean> {
  const r = await query(
    `UPDATE portfolio_price_alerts SET enabled = $3, updated_at = NOW(),
       last_notified_at = CASE WHEN $3 THEN NULL ELSE last_notified_at END
     WHERE id = $1 AND user_id = $2`,
    [id, userId, enabled],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function deleteAlert(id: string, userId: string): Promise<boolean> {
  const r = await query(
    `DELETE FROM portfolio_price_alerts WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

// ── sweep ────────────────────────────────────────────────────────────────

export interface AlertSweepResult {
  considered: number;
  fired: number;
  skipped: number;
}

const REFIRE_COOLDOWN_DAYS = 7;

export async function runPriceAlertSweep(): Promise<AlertSweepResult> {
  // Join enabled alerts with each SKU's latest captured price.
  const rows = await query(
    `WITH latest AS (
       SELECT DISTINCT ON (sku) sku, captured_on, spot_gbp
       FROM card_price_history
       ORDER BY sku, captured_on DESC
     )
     SELECT
       a.id, a.user_id, a.sku, a.direction, a.threshold_gbp,
       a.last_notified_at, a.card_name, a.card_number, a.image_url,
       l.spot_gbp, l.captured_on
     FROM portfolio_price_alerts a
     JOIN latest l ON l.sku = a.sku
     WHERE a.enabled = true`,
  );

  let fired = 0;
  let skipped = 0;

  for (const r of rows.rows) {
    const spot = parseFloat(r.spot_gbp);
    const threshold = parseFloat(r.threshold_gbp);
    const cross =
      (r.direction === "above" && spot >= threshold) ||
      (r.direction === "below" && spot <= threshold);
    if (!cross) { skipped++; continue; }

    // Cooldown: don't re-fire within 7 days.
    if (r.last_notified_at) {
      const since = Date.now() - new Date(r.last_notified_at).getTime();
      if (since < REFIRE_COOLDOWN_DAYS * 86400 * 1000) {
        skipped++;
        continue;
      }
    }

    try {
      await scheduleEmail({
        userId: r.user_id,
        event: "portfolio_price_alert",
        data: {
          alertId: r.id,
          sku: r.sku,
          direction: r.direction,
          thresholdGbp: threshold,
          currentSpotGbp: spot,
          cardName: r.card_name,
          cardNumber: r.card_number,
          imageUrl: r.image_url,
        },
        // Schedule for ~now; the drain will pick it up on the next tick.
        scheduledFor: new Date(Date.now() + 30 * 1000),
        idempotencyKey: `portfolio_price_alert:${r.id}:${r.captured_on}`,
      });
      await query(
        `UPDATE portfolio_price_alerts SET last_notified_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [r.id],
      );
      fired++;
    } catch (err) {
      console.error(`[price-alerts] failed to queue for ${r.id}:`, err);
      skipped++;
    }
  }

  return { considered: rows.rows.length, fired, skipped };
}
