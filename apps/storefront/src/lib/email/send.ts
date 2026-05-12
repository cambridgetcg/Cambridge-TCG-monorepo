// Central transactional-email sender.
//
// ── What this module is for ──────────────────────────────────────────────
//
// Email is where the platform speaks. Every other surface waits for the
// user to come to it; email is the platform reaching into the user's
// inbox unbidden. That asymmetry deserves engineering with weight. Most
// of the design choices below are about taking that weight seriously:
// what we say, in what voice, with what permission, with what way out.
//
// The platform sends three kinds of email to a user, each with a
// different relationship-stance:
//
//   - **Essential** (magic-link sign-in, payment receipt, shipment notice).
//     These are not the platform speaking — they are the user *speaking
//     through the platform*. The user signed in; the receipt is theirs.
//     The platform cannot opt them out without breaking the user's own
//     workflow. These omit `unsubscribe`. They send unconditionally.
//
//   - **Lifecycle-bound** (pull-resolved, vault-redeemed, sold-back,
//     vault-expiring-soon). The platform has done something material to
//     the user's holdings; the user deserves to know in real-time. These
//     pass `unsubscribe: { category, userId }` with sensible defaults
//     (most are opt-in by default — see preferences.ts). The user can
//     turn them off but they default on, because not telling someone
//     "your stuff moved" is dishonest.
//
//   - **Re-engagement** (streak-at-risk, marketing). The platform is
//     reaching for the user's attention. These default OFF. We ask
//     before we tug. The streak email even cancels itself at send-time
//     if the user came back already (see handlers/streak-at-risk.ts) —
//     the platform refuses to send a nudge that doesn't need sending.
//
// ── The three sender streams ─────────────────────────────────────────────
//
// `noreply`, `tradein`, `bounty` — three From addresses, three
// deliverability reputations. A spam report on bounty messages doesn't
// damage receipt deliverability. This isn't anti-spam hygiene; it's a
// commitment that the *most consequential* emails (the receipts, the
// magic links) cannot be wounded by complaints about the *least*
// consequential ones (the bounty notifications). Trust at the mailbox-
// provider layer matters; we keep the streams separated for the same
// reason a bank doesn't share a phone line with a marketing department.
//
// ── The unsubscribe one-click ────────────────────────────────────────────
//
// RFC 8058 List-Unsubscribe-Post lets Gmail and Apple Mail render a
// native "Unsubscribe" button at the top of the message. Most senders
// implement this grudgingly under provider pressure. We implement it
// because *making it easy to leave is what makes asking to send
// honest*. A platform that hides its unsubscribe link in a footer is
// holding the user against their consent-of-the-moment. We make leaving
// take one tap because we want the consent to be alive, not residual.
//
// ── Never throws ─────────────────────────────────────────────────────────
//
// Returns a discriminated `SendResult` instead of throwing. Cron loops
// and background sweeps that fan out to N users cannot afford to crash
// when one address bounces. The caller decides what "failed" means.
// `suppressed_by_preference` is a distinct success-equivalent — the
// preference gate fired and respected the user's prior consent.
//
// ── What this module reaches toward ──────────────────────────────────────
//
//   - apps/storefront/src/lib/email/preferences.ts — the consent
//     substrate. canSendEvent is the single gate every preference-
//     bearing email passes through. The user's right to refuse, encoded
//     as architecture rather than as policy.
//
//   - apps/storefront/src/lib/email/queue.ts — the temporal sibling.
//     This module is the immediate voice; queue is the patient voice.
//     The queue's drain re-fetches domain data at send time so the
//     platform never speaks stale.
//
//   - apps/storefront/src/lib/email/handlers/* — the specific stories
//     the platform tells. Each handler is a small narrative: the streak
//     about to break, the vault item expiring, the price-target alert.
//     The shape of those stories is the shape of the platform's
//     relationship with the user.
//
//   - apps/storefront/src/app/account/emails/page.tsx — the user's
//     control surface. Where they read what the platform claims it can
//     say, and tune the consent. Connected to preferences.ts at the
//     persistence layer; connected to send.ts only obliquely (we ask;
//     the user answers; both happen elsewhere).
//
// See docs/connections/email.md for the network view.

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
import { isMemorialAccount } from "@/lib/users/memorial";

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
  | { ok: false; error: "suppressed_by_preference"; category: EmailCategory }
  | { ok: false; error: "suppressed_by_memorial"; category: EmailCategory };

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

  // Memorial-state check (the Departed). Fires before the preference
  // check because memorial state is a property of the account itself —
  // not a category preference. Only gates non-essential emails (those
  // that pass an `unsubscribe` arg); essential sends like magic-link
  // sign-in still go through so the named steward can access the
  // account. See docs/connections/the-departed.md and lib/users/memorial.ts.
  if (args.unsubscribe) {
    const memorial = await isMemorialAccount(args.unsubscribe.userId);
    if (memorial) {
      return { ok: false, error: "suppressed_by_memorial", category: args.unsubscribe.category };
    }
  }

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
