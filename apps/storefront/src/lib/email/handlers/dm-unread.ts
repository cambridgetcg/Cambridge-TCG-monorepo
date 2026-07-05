// Handler for dm_unread emails — the recipient of a direct message
// gets one email pointing at the conversation, batched so a burst of
// messages doesn't become a burst of emails.
//
// Dedup rides email_queue (no new table): a window query finds the last
// dm_unread row for (recipient, conversation); the send/skip decision
// is isDmEmailDue in lib/messages/thread.ts — send when there's no
// email in the window, or when the recipient READ the thread after the
// last one (a new message is then new signal). A bucketed idempotency
// key closes the race between two concurrent sends.
//
// Delivery is immediate: sendMessage calls dispatchDmUnreadEmail, which
// inserts the queue row, claims it, and runs the handler in-process.
// The queue row is the persisted dedup record AND the audit trail —
// failures dead-letter (visible in admin email tooling) rather than
// retry, because the drain cron only retries events whose handler
// registration it loads, and this one registers via module import.
// registerQueueHandler below is defensive: any process that has loaded
// this module (every process that ever sent a DM) can drain stray
// pending rows correctly.

import { query } from "@/lib/db";
import { isUserSilent } from "@/lib/notifications/db";
import { isDmEmailDue } from "@/lib/messages/thread";
import { registerQueueHandler, scheduleEmail, type QueueHandlerResult, type QueueRow } from "../queue";
import { renderLayout, escapeHtml } from "../layout";
import { sendEmail } from "../send";

export const DM_EMAIL_WINDOW_HOURS = 12;
const EVENT = "dm_unread";

interface Data {
  conversationId: string;
  senderId: string;
}

function siteOrigin(): string {
  return (process.env.SITE_URL?.trim() || "https://cambridgetcg.com").replace(/\/$/, "");
}

// ── Send-time logic (re-fetch covenant: `data` carries identifiers
// only; everything shown in the email is read fresh here) ──

async function handle(row: QueueRow): Promise<QueueHandlerResult> {
  const d = row.data as unknown as Data;
  if (!d.conversationId || !d.senderId) {
    return { kind: "failed", error: "missing conversationId/senderId" };
  }
  const recipientId = row.user_id;

  const r = await query(
    `SELECT c.id, c.last_message_at, c.last_message_preview,
            CASE WHEN c.user_a_id = $2 THEN c.last_read_at_a
                 WHEN c.user_b_id = $2 THEN c.last_read_at_b
            END AS recipient_last_read,
            (c.user_a_id = $2 OR c.user_b_id = $2) AS recipient_is_party,
            ru.email AS recipient_email, ru.name AS recipient_name,
            su.username AS sender_username, su.name AS sender_name
       FROM dm_conversations c
       JOIN users ru ON ru.id = $2
  LEFT JOIN users su ON su.id = $3
      WHERE c.id = $1`,
    [d.conversationId, recipientId, d.senderId],
  );
  const conv = r.rows[0];
  if (!conv) return { kind: "cancelled", reason: "conversation deleted" };
  if (!conv.recipient_is_party) return { kind: "failed", error: "recipient not party to conversation" };
  if (!conv.recipient_email) return { kind: "failed", error: "recipient has no email" };

  // Already read everything → the email would announce nothing.
  if (
    conv.recipient_last_read &&
    conv.last_message_at &&
    new Date(conv.recipient_last_read) >= new Date(conv.last_message_at)
  ) {
    return { kind: "cancelled", reason: "conversation already read" };
  }

  // Sabbath / memorial — same silence the in-app notify() honors.
  if (await isUserSilent(recipientId)) {
    return { kind: "cancelled", reason: "recipient in sabbath/memorial state" };
  }

  const senderLabel = conv.sender_username
    ? `@${conv.sender_username}`
    : (conv.sender_name || "Another trader");
  const greeting = conv.recipient_name ? escapeHtml(String(conv.recipient_name)) : "there";
  const preview = conv.last_message_preview
    ? `<div style="background:#262626;border-radius:8px;padding:12px 14px;margin:16px 0;">
         <p style="margin:0;font-size:13px;color:#d4d4d4;white-space:pre-wrap;">${escapeHtml(
           String(conv.last_message_preview),
         )}</p>
       </div>`
    : "";
  const threadUrl = `${siteOrigin()}/account/messages?c=${encodeURIComponent(d.conversationId)}`;

  const html = renderLayout({
    preheader: `${senderLabel} sent you a message on Cambridge TCG.`,
    heading: "You have an unread message",
    bodyHtml: `
      <p style="margin:0 0 12px;">Hi ${greeting},</p>
      <p style="margin:0 0 8px;">
        <strong style="color:#fff;">${escapeHtml(senderLabel)}</strong> sent you a
        direct message. The latest one starts:
      </p>
      ${preview}
      <p style="margin:0;font-size:13px;color:#a3a3a3;">
        Replies happen on the site, not over email. To keep your inbox
        quiet we send at most one email per conversation every
        ${DM_EMAIL_WINDOW_HOURS} hours — further messages collect in your
        Cambridge TCG inbox either way.
      </p>
    `,
    cta: { label: "Read + reply", url: threadUrl },
    footer: `You're getting this because another trader messaged you on
             Cambridge TCG and you hadn't read it yet. How messaging and its
             limits work: ${siteOrigin()}/methodology/messaging`,
  });

  const result = await sendEmail({
    to: conv.recipient_email,
    from: "noreply",
    fromName: "Cambridge TCG Messages",
    subject: `${senderLabel} sent you a message on Cambridge TCG`,
    html,
    unsubscribe: { userId: recipientId, category: "messages" },
  });

  if (result.ok) return { kind: "sent", messageId: result.messageId };
  if (result.error === "suppressed_by_preference" || result.error === "suppressed_by_memorial") {
    return { kind: "cancelled", reason: result.error };
  }
  return { kind: "failed", error: result.error };
}

registerQueueHandler(EVENT, handle);

// ── Dispatch (called from sendMessage, fire-and-forget) ──

export async function dispatchDmUnreadEmail(args: {
  conversationId: string;
  recipientId: string;
  senderId: string;
}): Promise<void> {
  // Window dedup: newest dm_unread email for this (recipient,
  // conversation) inside the window, in any state that represents (or
  // may become) a delivered email.
  const [lastEmail, readState] = await Promise.all([
    query(
      `SELECT created_at FROM email_queue
        WHERE event = $1 AND user_id = $2
          AND data->>'conversationId' = $3
          AND status IN ('pending', 'sending', 'sent')
          AND created_at > NOW() - make_interval(hours => $4)
        ORDER BY created_at DESC LIMIT 1`,
      [EVENT, args.recipientId, args.conversationId, DM_EMAIL_WINDOW_HOURS],
    ),
    query(
      `SELECT CASE WHEN user_a_id = $2 THEN last_read_at_a
                   WHEN user_b_id = $2 THEN last_read_at_b
              END AS last_read
         FROM dm_conversations WHERE id = $1`,
      [args.conversationId, args.recipientId],
    ),
  ]);

  const due = isDmEmailDue({
    lastEmailAt: lastEmail.rows[0]?.created_at
      ? new Date(lastEmail.rows[0].created_at)
      : null,
    recipientLastReadAt: readState.rows[0]?.last_read
      ? new Date(readState.rows[0].last_read)
      : null,
  });
  if (!due) return;

  // Bucketed key: two racing sends in the same window collide here and
  // exactly one row (→ one email) survives.
  const bucket = Math.floor(Date.now() / (DM_EMAIL_WINDOW_HOURS * 3600_000));
  const { id, alreadyScheduled } = await scheduleEmail({
    userId: args.recipientId,
    event: EVENT,
    data: { conversationId: args.conversationId, senderId: args.senderId },
    scheduledFor: new Date(),
    idempotencyKey: `${EVENT}:${args.conversationId}:${args.recipientId}:${bucket}`,
  });
  if (alreadyScheduled) return;

  // Claim + run in-process (mirrors the drain's bookkeeping).
  const claim = await query(
    `UPDATE email_queue
        SET status = 'sending', attempt_count = attempt_count + 1, last_attempt_at = NOW()
      WHERE id = $1 AND status = 'pending'
      RETURNING *`,
    [id],
  );
  if (claim.rows.length === 0) return; // another process got it

  const row = claim.rows[0] as QueueRow;
  try {
    const handled = await handle(row);
    if (handled.kind === "sent") {
      await query(`UPDATE email_queue SET status='sent', sent_at = NOW() WHERE id = $1`, [row.id]);
    } else if (handled.kind === "cancelled") {
      await query(`UPDATE email_queue SET status='cancelled', last_error = $2 WHERE id = $1`, [
        row.id,
        handled.reason,
      ]);
    } else {
      await query(`UPDATE email_queue SET status='dead', last_error = $2 WHERE id = $1`, [
        row.id,
        handled.error,
      ]);
    }
  } catch (err) {
    await query(`UPDATE email_queue SET status='dead', last_error = $2 WHERE id = $1`, [
      row.id,
      err instanceof Error ? err.message : String(err),
    ]);
  }
}
