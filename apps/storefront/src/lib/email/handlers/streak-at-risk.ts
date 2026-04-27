// Handler for the scheduled "your streak is about to break" email.
//
// Queued once per at-risk user per streak-length by the nightly
// runStreakAtRiskSweep(). At drain time we re-check the streak —
// if the user has already visited today, the email is cancelled.

import { query } from "@/lib/db";
import { registerQueueHandler, type QueueHandlerResult, type QueueRow } from "../queue";
import { renderLayout, escapeHtml } from "../layout";
import { sendEmail } from "../send";

// `data.originalStreak` is stored for logging/debugging but is not read at
// send time — we always re-fetch the current streak so the subject/body
// reflects reality, not whatever the streak was when we queued.

async function handle(row: QueueRow): Promise<QueueHandlerResult> {
  // Re-fetch streak + user. Cancel if the user has already visited today.
  const result = await query(
    `SELECT s.current_streak, s.last_visit_date, u.email, u.name
     FROM user_streaks s JOIN users u ON u.id = s.user_id
     WHERE s.user_id = $1`,
    [row.user_id],
  );
  if (result.rows.length === 0) {
    return { kind: "cancelled", reason: "user/streak missing" };
  }
  const r = result.rows[0];
  if (!r.email) return { kind: "failed", error: "user has no email" };

  // Already visited today → nudge is unnecessary.
  const lastVisit = new Date(r.last_visit_date);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (lastVisit >= today) {
    return { kind: "cancelled", reason: "user already visited today" };
  }

  const streak = r.current_streak as number;
  // If streak already broke (gap > 1 day), don't send — they'll see for
  // themselves tomorrow.
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (lastVisit < yesterday) {
    return { kind: "cancelled", reason: "streak already broke" };
  }

  const greeting = r.name ? escapeHtml(String(r.name)) : "there";

  const html = renderLayout({
    preheader: `Your ${streak}-day streak breaks at midnight unless you play.`,
    heading: `Your ${streak}-day streak is about to break`,
    bodyHtml: `
      <p style="margin:0 0 12px;">Hi ${greeting},</p>
      <p style="margin:0 0 16px;">
        You&apos;ve played <strong style="color:#f59e0b;">${streak} day${streak === 1 ? "" : "s"} in a row</strong>.
        If you don&apos;t play today, the streak resets to 1 — and with it the
        Berries multiplier it&apos;s been earning you.
      </p>
      <div style="background:#262626;border-radius:8px;padding:14px 16px;margin:16px 0;">
        <p style="margin:0 0 6px;color:#fff;font-weight:600;font-size:13px;">What you&apos;d lose</p>
        <p style="margin:0;font-size:13px;color:#a3a3a3;">
          Current multiplier: <span style="color:#34d399;font-weight:600;">${(1 + (streak - 1) * 0.02).toFixed(2)}×</span>
          ${streak >= 26 ? " (capped)" : " · +0.02 more tomorrow"}
        </p>
      </div>
      <p style="margin:0;font-size:13px;color:#a3a3a3;">
        One adventure clear counts as a visit. See you out there.
      </p>
    `,
    cta: { label: "Keep the streak alive", url: "https://cambridgetcg.com/play/adventure" },
    footer: `You opted in to streak-at-risk reminders. Turn this off any time
             in your email preferences.`,
  });

  const sendResult = await sendEmail({
    to: r.email,
    from: "bounty",
    subject: `${streak}-day streak ends tonight`,
    html,
    unsubscribe: { userId: row.user_id, category: "streak_at_risk" },
  });

  if (sendResult.ok) return { kind: "sent", messageId: sendResult.messageId };
  if (sendResult.error === "suppressed_by_preference") {
    return { kind: "cancelled", reason: "suppressed by preference" };
  }
  return { kind: "failed", error: sendResult.error };
}

registerQueueHandler("streak_at_risk", handle);
