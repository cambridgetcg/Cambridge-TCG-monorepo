// Weekly admin digest — ops summary delivered once per ISO week.
//
// Doesn't use the email_queue because:
//   - The queue's FK to users(id) isn't applicable for admin-only emails.
//   - Retry is low-value: if the send fails, next Monday works.
//   - Scheduling is purely cadence-based — no queue needed.
//
// Idempotency is enforced at the cron layer (Monday 09:00 UTC, 2-minute
// window). A second call inside the window would re-send; we log the
// attempt in the cron response so accidental duplicates are visible.

import { query } from "@/lib/db";
import { renderLayout, escapeHtml } from "./layout";
import { sendEmail, type SendResult } from "./send";

export interface DigestStats {
  pullsTotal: number;
  pullsByTier: Record<string, number>;
  vault: { acquired: number; redeemed: number; sold_back: number; expired: number };
  creditOutGbp: number;
  merges: number;
  queue: Record<string, number>;
  dead: number;
  streaks: { active: number; week_plus: number; month_plus: number; longest: number };
  topEarners: Array<{ email: string; name: string | null; earned: number }>;
}

export async function collectDigestStats(): Promise<DigestStats> {
  const pullsRow = await query(
    `SELECT tier, count(*)::int AS n FROM bounty_pulls
     WHERE resolved_at >= NOW() - INTERVAL '7 days'
     GROUP BY tier`,
  );
  const vaultRow = await query(
    `SELECT
       count(*) FILTER (WHERE source LIKE 'pve%' AND acquired_at >= NOW() - INTERVAL '7 days')::int AS acquired,
       count(*) FILTER (WHERE status = 'redeemed' AND fulfilled_at >= NOW() - INTERVAL '7 days')::int AS redeemed,
       count(*) FILTER (WHERE status = 'sold_back' AND sold_back_at >= NOW() - INTERVAL '7 days')::int AS sold_back,
       count(*) FILTER (WHERE status = 'expired' AND sold_back_at >= NOW() - INTERVAL '7 days')::int AS expired
     FROM vault_items`,
  );
  const creditOut = await query(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS total
     FROM store_credit_ledger
     WHERE type IN ('bounty_sellback', 'bounty_expiry')
       AND created_at >= NOW() - INTERVAL '7 days'`,
  );
  const mergesRow = await query(
    `SELECT count(*)::int AS n FROM bounty_merges
     WHERE created_at >= NOW() - INTERVAL '7 days'`,
  );
  const queueRow = await query(
    `SELECT status, count(*)::int AS n FROM email_queue
     WHERE created_at >= NOW() - INTERVAL '7 days'
     GROUP BY status`,
  );
  const deadRow = await query(
    `SELECT count(*)::int AS n FROM email_queue WHERE status = 'dead'`,
  );
  const streakRow = await query(
    `SELECT
       count(*) FILTER (WHERE current_streak >= 2)::int AS active,
       count(*) FILTER (WHERE current_streak >= 7)::int AS week_plus,
       count(*) FILTER (WHERE current_streak >= 30)::int AS month_plus,
       COALESCE(MAX(longest_streak), 0)::int AS longest
     FROM user_streaks`,
  );
  const topEarners = await query(
    `SELECT u.email, u.name, SUM(p.amount)::int AS earned
     FROM points_ledger p JOIN users u ON u.id = p.user_id
     WHERE p.amount > 0 AND p.created_at >= NOW() - INTERVAL '7 days'
     GROUP BY u.email, u.name
     ORDER BY earned DESC
     LIMIT 5`,
  );

  return {
    pullsTotal: pullsRow.rows.reduce((s, r) => s + r.n, 0),
    pullsByTier: Object.fromEntries(pullsRow.rows.map((r) => [r.tier, r.n])),
    vault: vaultRow.rows[0] as DigestStats["vault"],
    creditOutGbp: parseFloat(creditOut.rows[0]?.total ?? "0"),
    merges: mergesRow.rows[0]?.n ?? 0,
    queue: Object.fromEntries(queueRow.rows.map((r) => [r.status, r.n])),
    dead: deadRow.rows[0]?.n ?? 0,
    streaks: streakRow.rows[0] as DigestStats["streaks"],
    topEarners: topEarners.rows as DigestStats["topEarners"],
  };
}

function stat(label: string, value: string | number, color = "#fff"): string {
  return `
    <div style="display:inline-block;width:48%;margin:4px 0;vertical-align:top;">
      <p style="margin:0;color:#737373;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(label)}</p>
      <p style="margin:2px 0 0;color:${color};font-size:18px;font-weight:700;">${escapeHtml(String(value))}</p>
    </div>
  `;
}

export async function sendAdminWeeklyDigest(): Promise<SendResult | { ok: false; error: string }> {
  const adminEmail =
    process.env.ADMIN_DIGEST_EMAIL?.trim() ||
    process.env.STORE_NOTIFICATION_EMAIL?.trim() ||
    "";
  if (!adminEmail) {
    return { ok: false, error: "no admin email configured (set ADMIN_DIGEST_EMAIL)" };
  }

  const s = await collectDigestStats();

  const tierChips = Object.entries(s.pullsByTier)
    .map(([t, n]) => `${t}=${n}`)
    .join("  ·  ");

  const topRows = s.topEarners.length === 0
    ? `<p style="color:#737373;font-size:12px;margin:4px 0 0;">No activity.</p>`
    : s.topEarners
        .map(
          (u) => `<tr>
            <td style="padding:4px 8px 4px 0;color:#a3a3a3;font-size:12px;">${escapeHtml(u.name ?? u.email.split("@")[0])}</td>
            <td style="padding:4px 0;color:#fff;font-size:12px;font-family:ui-monospace,monospace;text-align:right;">${u.earned.toLocaleString()}</td>
          </tr>`,
        )
        .join("");

  const bodyHtml = `
    <p style="margin:0 0 12px;color:#a3a3a3;">Last 7 days at a glance.</p>

    <h3 style="margin:16px 0 6px;color:#f59e0b;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;">Bounty flow</h3>
    <div>
      ${stat("Pulls resolved", s.pullsTotal, "#f59e0b")}
      ${stat("Vault acquired", s.vault.acquired)}
      ${stat("Redemptions shipped", s.vault.redeemed, "#34d399")}
      ${stat("Sell-backs", s.vault.sold_back)}
      ${stat("Auto-expired", s.vault.expired, s.vault.expired > 0 ? "#fbbf24" : "#a3a3a3")}
      ${stat("Token merges", s.merges)}
    </div>
    <p style="margin:10px 0 0;color:#737373;font-size:12px;">
      Credit paid out (sell-back + expiry):
      <span style="color:#34d399;font-weight:600;">£${s.creditOutGbp.toFixed(2)}</span>
    </p>
    ${tierChips
      ? `<p style="margin:4px 0 0;color:#737373;font-size:11px;font-family:ui-monospace,monospace;">${escapeHtml(tierChips)}</p>`
      : ""}

    <h3 style="margin:20px 0 6px;color:#f59e0b;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;">Email queue</h3>
    <div>
      ${stat("Sent", s.queue.sent ?? 0, "#34d399")}
      ${stat("Cancelled", s.queue.cancelled ?? 0)}
      ${stat("Failed (retrying)", s.queue.failed ?? 0, (s.queue.failed ?? 0) > 0 ? "#fbbf24" : "#a3a3a3")}
      ${stat("Dead (needs review)", s.dead, s.dead > 0 ? "#ef4444" : "#a3a3a3")}
    </div>
    ${s.dead > 0
      ? `<p style="margin:8px 0 0;font-size:12px;">
           <a href="https://cambridgetcg.com/admin/emails" style="color:#ef4444;text-decoration:underline;">
             Review dead-letter queue &rarr;
           </a>
         </p>`
      : ""}

    <h3 style="margin:20px 0 6px;color:#f59e0b;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;">Streaks</h3>
    <div>
      ${stat("≥ 2-day", s.streaks.active)}
      ${stat("≥ 7-day", s.streaks.week_plus)}
      ${stat("≥ 30-day", s.streaks.month_plus)}
      ${stat("Longest ever", s.streaks.longest)}
    </div>

    <h3 style="margin:20px 0 6px;color:#f59e0b;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;">Top Berries earners (7d)</h3>
    <table style="width:100%;border-collapse:collapse;margin-top:4px;">
      ${topRows}
    </table>
  `;

  const html = renderLayout({
    preheader: `Bounty: ${s.pullsTotal} pulls · ${s.vault.acquired} vault · £${s.creditOutGbp.toFixed(2)} out · ${s.dead} dead.`,
    heading: "Cambridge TCG — Weekly Digest",
    bodyHtml,
    footer: `Generated ${new Date().toUTCString()}. Recipient controlled by
             ADMIN_DIGEST_EMAIL.`,
  });

  const subject = `Weekly digest — ${s.pullsTotal} pulls, £${s.creditOutGbp.toFixed(2)} out, ${s.dead} dead`;

  return sendEmail({
    to: adminEmail,
    from: "noreply",
    fromName: "Cambridge TCG Ops",
    subject,
    html,
    // Essential admin-ops email — no unsubscribe param.
  });
}
