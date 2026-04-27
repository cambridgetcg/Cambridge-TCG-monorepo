// Central transactional-email sender.
//
// Design principles:
// - One sender key per product stream ("noreply", "tradein", "bounty", ...).
//   Each has its own From address so a spam report on one stream doesn't
//   damage the others' deliverability reputation.
// - Never throws. The caller decides what "failed" means — this returns a
//   discriminated object so cron loops and background jobs don't have to
//   try/catch every call.
// - Preference-aware: if the caller passes `unsubscribe: { userId, category
//   }`, the send is skipped when the user has opted out, and the resulting
//   email automatically carries:
//     • a footer unsubscribe link (CAN-SPAM / GDPR visible)
//     • List-Unsubscribe + List-Unsubscribe-Post headers (RFC 2369 +
//       RFC 8058 one-click), which makes Gmail and Apple Mail render a
//       native "Unsubscribe" button at the top of the message
//   Essential emails (magic links, receipts) omit the param and send
//   unconditionally.
// - No queueing, no retries yet. Good enough for immediate-trigger
//   transactional emails. See scheduleEmail()/drainEmailQueue() for the
//   scheduled variant.

import { SendRawEmailCommand } from "@aws-sdk/client-ses";
import MailComposer from "nodemailer/lib/mail-composer";
import type Mail from "nodemailer/lib/mailer";
import { sesClient } from "./client";
import {
  canSendEvent,
  makeUnsubscribeToken,
  type EmailCategory,
} from "./preferences";
import { escapeHtml } from "./layout";

export type SenderKey = "noreply" | "tradein" | "bounty";

const FROM_ADDRESS: Record<SenderKey, { email: string; displayName: string }> = {
  noreply: {
    email: (process.env.AUTH_FROM_EMAIL || "noreply@cambridgetcg.com").trim(),
    displayName: "Cambridge TCG",
  },
  tradein: {
    email: (process.env.TRADEIN_FROM_EMAIL || "tradein@cambridgetcg.com").trim(),
    displayName: "Cambridge TCG Trade-In",
  },
  bounty: {
    email: (process.env.BOUNTY_FROM_EMAIL || "bounty@cambridgetcg.com").trim(),
    displayName: "Cambridge TCG Bounty Board",
  },
};

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text body. If omitted, a naive strip of the HTML is used. */
  text?: string;
  /** Selects the From address. Defaults to "noreply". */
  from?: SenderKey;
  /** Override the display name for this specific send. */
  fromName?: string;
  /** Reply-To override (useful when you want replies routed somewhere other than the From stream). */
  replyTo?: string;
  /**
   * When provided: send is skipped if the user has opted out of the category,
   * and List-Unsubscribe headers + a footer link are added. Omit for
   * essential emails (sign-in links, payment receipts, shipment notices).
   */
  unsubscribe?: { userId: string; category: EmailCategory };
}

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string }
  | { ok: false; error: "suppressed_by_preference"; category: EmailCategory };

function stripTags(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function siteOrigin(): string {
  return (process.env.SITE_URL || "https://cambridgetcg.com").replace(/\/$/, "");
}

function unsubscribeUrl(token: string): string {
  return `${siteOrigin()}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

function appendUnsubscribeFooter(html: string, token: string, categoryLabel: string): string {
  const url = unsubscribeUrl(token);
  const fragment = `
    <p style="color:#525252;font-size:11px;margin:20px 0 0;text-align:center;line-height:1.6;">
      Don't want ${escapeHtml(categoryLabel)}?
      <a href="${escapeHtml(url)}" style="color:#737373;text-decoration:underline;">Unsubscribe</a> ·
      <a href="${escapeHtml(siteOrigin())}/account/emails" style="color:#737373;text-decoration:underline;">Manage all emails</a>
    </p>
  `;
  // Insert just before the closing </body> so it sits under the content card.
  if (html.includes("</body>")) return html.replace("</body>", `${fragment}</body>`);
  return html + fragment;
}

export async function sendEmail(args: SendEmailArgs): Promise<SendResult> {
  const senderKey: SenderKey = args.from ?? "noreply";
  const sender = FROM_ADDRESS[senderKey];
  const displayName = args.fromName ?? sender.displayName;

  // Preference check
  if (args.unsubscribe) {
    const allowed = await canSendEvent(args.unsubscribe.userId, args.unsubscribe.category);
    if (!allowed) {
      return { ok: false, error: "suppressed_by_preference", category: args.unsubscribe.category };
    }
  }

  // Guard against AWS credentials being missing (e.g. local dev without env)
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return { ok: false, error: "AWS credentials not configured" };
  }

  // Embed footer unsubscribe link + compute the one-click URL for the
  // RFC 8058 header. Both use the same signed token so copy-paste of
  // either path produces identical behaviour.
  let html = args.html;
  let oneClickUrl: string | null = null;
  if (args.unsubscribe) {
    const { CATEGORY_LABELS } = await import("./preferences");
    const token = makeUnsubscribeToken(args.unsubscribe.userId, args.unsubscribe.category);
    html = appendUnsubscribeFooter(
      args.html,
      token,
      CATEGORY_LABELS[args.unsubscribe.category],
    );
    oneClickUrl = unsubscribeUrl(token);
  }

  // Assemble MIME via nodemailer, then hand the raw buffer to SES. This is
  // the canonical way to attach List-Unsubscribe headers in AWS SES; the
  // simpler SendEmailCommand path does not support custom headers.
  const mailOptions: Mail.Options = {
    from: `${displayName} <${sender.email}>`,
    to: args.to,
    subject: args.subject,
    html,
    text: args.text ?? stripTags(html),
    replyTo: args.replyTo,
  };
  if (oneClickUrl) {
    // RFC 8058: the Post header tells Gmail/Apple they can POST to the URL
    // with body "List-Unsubscribe=One-Click" to unsubscribe in one tap.
    mailOptions.headers = {
      "List-Unsubscribe": `<${oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
  }
  const composer = new MailComposer(mailOptions);

  let raw: Buffer;
  try {
    raw = await new Promise<Buffer>((resolve, reject) => {
      composer.compile().build((err, message) => {
        if (err) reject(err);
        else resolve(message);
      });
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    const result = await sesClient.send(
      new SendRawEmailCommand({
        Source: `${displayName} <${sender.email}>`,
        Destinations: [args.to],
        RawMessage: { Data: raw },
      }),
    );
    return { ok: true, messageId: result.MessageId ?? "" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
