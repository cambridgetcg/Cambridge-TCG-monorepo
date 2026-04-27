// Handler for the portfolio_price_alert scheduled email.
//
// Re-fetches the latest spot at send time so the email always shows the
// freshest number (the sweep that queued it may have run hours ago).
// If the alert was disabled or deleted between queue + send, cancel.

import { query } from "@/lib/db";
import { registerQueueHandler, type QueueHandlerResult, type QueueRow } from "../queue";
import { renderLayout, escapeHtml } from "../layout";
import { sendEmail } from "../send";

interface Data {
  alertId: string;
  sku: string;
  direction: "above" | "below";
  thresholdGbp: number;
  currentSpotGbp: number;
  cardName: string | null;
  cardNumber: string | null;
  imageUrl: string | null;
}

async function handle(row: QueueRow): Promise<QueueHandlerResult> {
  const d = row.data as unknown as Data;
  if (!d.alertId || !d.sku) return { kind: "failed", error: "missing alertId/sku" };

  // Confirm the alert still exists + is enabled.
  const alertRow = await query(
    `SELECT a.id, a.enabled, a.threshold_gbp, a.direction,
            a.card_name, a.card_number, a.image_url,
            u.email, u.name
     FROM portfolio_price_alerts a JOIN users u ON u.id = a.user_id
     WHERE a.id = $1`,
    [d.alertId],
  );
  if (alertRow.rows.length === 0) {
    return { kind: "cancelled", reason: "alert deleted" };
  }
  const a = alertRow.rows[0];
  if (!a.enabled) return { kind: "cancelled", reason: "alert disabled" };
  if (!a.email) return { kind: "failed", error: "user has no email" };

  // Refresh spot — the queued value may be stale.
  const latest = await query(
    `SELECT spot_gbp FROM card_price_history
     WHERE sku = $1 ORDER BY captured_on DESC LIMIT 1`,
    [d.sku],
  );
  const spot = latest.rows[0] ? parseFloat(latest.rows[0].spot_gbp) : d.currentSpotGbp;
  const threshold = parseFloat(a.threshold_gbp);
  const directionLabel = a.direction === "above" ? "risen above" : "dropped below";
  const name = a.card_name || d.cardName || d.sku;
  const greeting = a.name ? escapeHtml(String(a.name)) : "there";

  const imageBlock = (a.image_url || d.imageUrl)
    ? `<div style="text-align:center;margin:16px 0;">
         <img src="${escapeHtml(a.image_url ?? d.imageUrl ?? "")}" alt="${escapeHtml(name)}"
              width="140" style="border-radius:10px;border:2px solid #f59e0b;max-width:140px;height:auto;" />
       </div>`
    : "";

  const subject = `${name} ${a.direction === "above" ? "up" : "down"} to £${spot.toFixed(2)}`;

  const html = renderLayout({
    preheader: `Your ${a.direction} £${threshold.toFixed(2)} alert for ${name} just triggered.`,
    heading: `Price alert triggered`,
    bodyHtml: `
      <p style="margin:0 0 12px;">Hi ${greeting},</p>
      <p style="margin:0 0 16px;">
        <strong style="color:#fff;">${escapeHtml(name)}</strong>
        ${a.card_number || d.cardNumber ? `<span style="color:#737373;"> (${escapeHtml(a.card_number ?? d.cardNumber ?? "")})</span>` : ""}
        has <strong style="color:#f59e0b;">${directionLabel} £${threshold.toFixed(2)}</strong>.
      </p>
      ${imageBlock}
      <div style="background:#262626;border-radius:8px;padding:14px 16px;margin:16px 0;">
        <p style="margin:0 0 4px;font-size:13px;color:#a3a3a3;">Current spot price</p>
        <p style="margin:0;font-size:22px;color:${a.direction === "above" ? "#34d399" : "#fbbf24"};font-weight:700;">
          £${spot.toFixed(2)}
        </p>
        <p style="margin:6px 0 0;font-size:12px;color:#737373;">
          Your threshold: ${a.direction === "above" ? "above" : "below"} £${threshold.toFixed(2)}
        </p>
      </div>
      <p style="margin:0;font-size:13px;color:#a3a3a3;">
        We won&apos;t re-send this alert for 7 days. Disable or adjust it
        from your portfolio page.
      </p>
    `,
    cta: { label: "Open Portfolio", url: "https://cambridgetcg.com/account/portfolio" },
    footer: `You're getting this because you set a price alert on ${escapeHtml(name)}.
             Toggle alert emails off under Email Preferences.`,
  });

  const result = await sendEmail({
    to: a.email,
    from: "bounty",
    fromName: "Cambridge TCG Alerts",
    subject,
    html,
    // Alerts reuse the vault_expired preference category for now — they're
    // value-preservation nudges, same bucket. A dedicated 'price_alert'
    // category could be added later.
    unsubscribe: { userId: row.user_id, category: "vault_expired" },
  });

  if (result.ok) return { kind: "sent", messageId: result.messageId };
  if (result.error === "suppressed_by_preference") {
    return { kind: "cancelled", reason: "suppressed by preference" };
  }
  return { kind: "failed", error: result.error };
}

registerQueueHandler("portfolio_price_alert", handle);
