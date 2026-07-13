// Handler for the scheduled "your streak is about to break" email.
//
// ── What this handler is for ─────────────────────────────────────────────
//
// This is one of the platform's most delicate emails. A streak-at-risk
// notification is the platform reaching for the user's attention with
// a tug of mild loss-aversion: *you have something built; come back or
// you'll lose it*. That's a real psychological lever. It is also,
// crucially, **opt-in** by default (see preferences.ts DEFAULTS table:
// `streak_at_risk: false`). The platform will not pull on attention it
// has not been given permission to pull on.
//
// Once the user has opted in, the handler *still* refuses to send when
// the email isn't necessary. The four cancellation paths below are the
// shape of that refusal:
//
//   1. User/streak missing → cancel (no person to nudge)
//   2. No email on file    → fail (architectural, not consent)
//   3. Already visited today → cancel (the nudge succeeded before the
//      email was sent — the platform's job is done)
//   4. Streak already broke (gap > 1 day) → cancel (the nudge has lost
//      its meaning; sending it now would be salt in the wound)
//
// Each cancellation is a small act of care. The platform pays attention
// to whether its own nudge still serves the person. A naive scheduler
// would send all queued emails regardless; this one re-checks reality
// at send-time and bows out gracefully when the world has moved on.
// See queue.ts § "Cancellation as care" for the architectural pattern.
//
// ── The shape of the email is the shape of the relationship ─────────────
//
// The email greets by name when known, "there" when not — small, but
// it's the platform meeting the user where they are. The subject line
// states the stakes plainly (`Your N-day streak is about to break`) —
// no clickbait, no marketing-speak, just the fact. The CTA is a single
// link back to the activity that resets the streak. No funnel, no
// upsell. The platform asked for permission; it should not abuse it.
//
// ── What this handler reaches toward ────────────────────────────────────
//
//   - apps/storefront/src/lib/streaks/* — the domain that maintains
//     `user_streaks`. This handler reads from there at send-time; the
//     sweep that queues these emails is initiated from there as well.
//
//   - apps/storefront/src/lib/email/preferences.ts — the consent
//     gate. send.ts (which we call) routes through canSendEvent before
//     the SES hand-off; if the user has opted out since the queue row
//     was inserted, the email doesn't go out. Two safety nets: the
//     queue's own re-check, and preferences.ts.
//
//   - apps/storefront/src/lib/email/queue.ts — the orchestrator.
//     registerQueueHandler('streak_at_risk', handle) wires this
//     specific story into the platform's general patient-voice
//     mechanism.
//
// See docs/connections/at-midnight.md for the narrative companion —
// one user's evening on day 23, the sweep that finds them, the five-
// minute slack in which this handler decides whether to speak.

import { query } from "@/lib/db";
import { PVE_AVAILABILITY } from "@/lib/game/pve-availability";
import { registerQueueHandler, type QueueHandlerResult, type QueueRow } from "../queue";
import { renderLayout, escapeHtml } from "../layout";
import { sendEmail } from "../send";

// `data.originalStreak` is stored for logging/debugging but is not read at
// send time — we always re-fetch the current streak so the subject/body
// reflects reality, not whatever the streak was when we queued.

async function handle(row: QueueRow): Promise<QueueHandlerResult> {
  if (!PVE_AVAILABILITY.mutations_enabled) {
    return { kind: "cancelled", reason: "PVE streak activity paused" };
  }

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
        Use an activity currently listed as available on your account.
      </p>
    `,
    cta: { label: "Check account activity", url: "https://cambridgetcg.com/account" },
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
