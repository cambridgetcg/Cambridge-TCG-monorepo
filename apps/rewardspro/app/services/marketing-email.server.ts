/**
 * The one path for marketing email: campaigns and merchant automations.
 *
 * - Recipients are re-checked here, at send time, against
 *   MARKETING_AUDIENCE (Shopify SUBSCRIBED consent, not unsubscribed since,
 *   not bounced or reported as spam); anyone else is skipped.
 * - Every message carries the recipient's own unsubscribe link and
 *   List-Unsubscribe / List-Unsubscribe-Post headers (RFC 8058 one-click),
 *   both served by routes/email.unsubscribe.tsx.
 * - Nothing is sent past the shop's monthly email limit: the free app pays
 *   for every email, so the emails are counted against it before they are
 *   sent (reserveEmails), and a send that would go past it is refused whole.
 * - Nothing is sent while SendGrid's signed event webhook is unconfigured,
 *   because bounces, spam reports and SendGrid-side unsubscribes would then
 *   be lost (routes/webhooks.sendgrid.tsx refuses unsigned events).
 *
 * Transactional mail about a shopper's own account (tier changes, cashback,
 * points notices) is sent by email-notifications.server.ts and never comes
 * here.
 */

import prisma from "~/db.server";
import { sanitizeText } from "~/utils/html-sanitizer";
import { shouldUseKlaviyoForMarketing } from "./email-provider.server";
import { type EmailReservation, releaseEmails, reserveEmails } from "./email-usage-control.server";
import { MARKETING_AUDIENCE, unsubscribeUrl } from "./marketing-consent.server";
import { sendPersonalizedEmails, type SendGridPersonalization } from "./sendgrid.server";

/** SendGrid substitution replaced by each recipient's unsubscribe link. */
const UNSUBSCRIBE_URL_TAG = "-rp_unsubscribe_url-";

export type MarketingRecipient = { customerId: string } | { email: string };

export interface MarketingEmail {
  subject: string;
  /** Sanitised HTML; the unsubscribe footer is added here */
  html: string;
  categories?: string[];
  customArgs?: Record<string, string>;
}

export interface MarketingSendResult {
  sent: number;
  /** Recipients without consent (or unknown), not sent */
  skipped: number;
  failed: number;
  /** Of `failed`, those the email service gave no answer for, so they may have gone out */
  uncertain?: number;
  errors: string[];
  /** Why RewardsPro refused the whole send (switched off, Klaviyo, the monthly limit), in words for the merchant */
  refused?: string;
}

/** Why marketing email cannot be sent at all right now, or null. */
export function marketingEmailBlockedReason(): string | null {
  if (!process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY?.trim()) {
    return "Marketing email is off until SendGrid's signed event webhook is configured (SENDGRID_WEBHOOK_VERIFICATION_KEY), so bounces, spam reports and unsubscribes are recorded.";
  }
  if (!process.env.SHOPIFY_APP_URL) {
    return "Marketing email is off until SHOPIFY_APP_URL is set, so unsubscribe links work.";
  }
  return null;
}

/** What merchants are told while marketing email is off; the reason itself (marketingEmailBlockedReason) is for logs and operators. */
export const MARKETING_EMAIL_OFF =
  "RewardsPro can't send marketing email yet. You can write campaigns and save them as drafts, and send them once sending is switched on.";

function limitReached(requested: number, remaining: number, limit: number): string {
  const n = (count: number) => count.toLocaleString("en-US");
  if (requested > limit) {
    return `This audience is ${n(requested)} customers who agreed to marketing, more than the shop's limit of ${n(limit)} emails a month, so it can't go out as one campaign. Choose a smaller audience, such as one tier.`;
  }
  return `Sending this would use ${n(requested)} email${requested === 1 ? "" : "s"}, and the shop has ${n(remaining)} of its ${n(limit)} emails left this month. The limit starts again next month.`;
}

function withUnsubscribeFooter(html: string, storeName: string): string {
  const store = sanitizeText(storeName);
  return `${html}
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-family:sans-serif;font-size:12px;line-height:1.5;color:#6b6b6b;text-align:center">
  <p style="margin:0">You are receiving this because you agreed to marketing emails from ${store}.</p>
  <p style="margin:4px 0 0"><a clicktracking="off" href="${UNSUBSCRIBE_URL_TAG}" style="color:#6b6b6b">Unsubscribe</a> from ${store} marketing emails.</p>
</div>`;
}

/**
 * Send one marketing email to the consenting customers among `recipients`.
 * Recipients are customers of `shop`, named by internal id or by email.
 * `onHandOff` is called just before the email goes to the email service:
 * anything thrown before it means nothing was sent.
 */
export async function sendMarketingEmail(
  shop: string,
  recipients: MarketingRecipient[],
  email: MarketingEmail,
  onHandOff?: () => void,
): Promise<MarketingSendResult> {
  const refused = (reason: string, error = reason): MarketingSendResult => ({
    sent: 0,
    skipped: 0,
    failed: recipients.length,
    errors: [error],
    refused: reason,
  });

  const blocked = marketingEmailBlockedReason();
  if (blocked) return refused(MARKETING_EMAIL_OFF, blocked);
  if (await shouldUseKlaviyoForMarketing(shop)) {
    return refused("This shop sends marketing through Klaviyo; send the campaign from Klaviyo.");
  }

  const ids = recipients.flatMap((r) => ("customerId" in r ? [r.customerId] : []));
  const emails = recipients.flatMap((r) => ("email" in r ? [r.email.toLowerCase()] : []));
  const customers = await prisma.customer.findMany({
    where: {
      shop,
      ...MARKETING_AUDIENCE,
      OR: [{ id: { in: ids } }, { email: { in: emails, mode: "insensitive" } }],
    },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const skipped = recipients.length - customers.length;
  if (customers.length === 0) return { sent: 0, skipped, failed: 0, errors: [] };

  // Everything that can fail is read before the emails are counted, so a
  // failure here leaves the shop's limit as it was
  const settings = await prisma.shopSettings.findUnique({ where: { shop }, select: { storeName: true } });
  const storeName = settings?.storeName || shop.replace(/\.myshopify\.com$/, "");

  const personalizations: SendGridPersonalization[] = customers.map((c) => {
    const unsubscribe = unsubscribeUrl(shop, c.id);
    return {
      to: { email: c.email, name: [c.firstName, c.lastName].filter(Boolean).join(" ") || undefined },
      headers: {
        "List-Unsubscribe": `<${unsubscribe}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      substitutions: { [UNSUBSCRIBE_URL_TAG]: unsubscribe },
      customArgs: email.customArgs,
    };
  });
  const html = withUnsubscribeFooter(email.html, storeName);

  // The free app pays for every email it sends, so marketing stops at the
  // shop's monthly limit: the emails are counted before they are sent, and a
  // send that would go past it, even at the same moment as another, is
  // refused whole. Nothing is sent while the usage can't be read.
  let reservation: EmailReservation;
  try {
    reservation = await reserveEmails(shop, customers.length);
  } catch (error) {
    console.error(`[MarketingEmail] Couldn't read this month's email usage for ${shop}; sending nothing:`, error);
    return { sent: 0, skipped, failed: customers.length, errors: ["Couldn't read this month's email usage"] };
  }
  if (!reservation.reserved) return refused(limitReached(customers.length, reservation.remaining, reservation.limit));

  // From here nothing throws (sendPersonalizedEmails catches its own errors),
  // so the reservation is always settled below
  onHandOff?.();
  const result = await sendPersonalizedEmails(shop, personalizations, {
    subject: email.subject,
    html,
    categories: email.categories,
  });
  // Give back the emails that didn't go out. Those the email service gave no
  // answer for stay counted, as do all of them if the send threw, since some
  // of them may have gone.
  const unsent = customers.length - result.sent - result.uncertain;
  try {
    await releaseEmails(reservation.usageId, unsent);
  } catch (error) {
    console.error(`[MarketingEmail] Couldn't give back ${unsent} unsent emails for ${shop}:`, error);
  }

  return { sent: result.sent, skipped, failed: result.failed, uncertain: result.uncertain, errors: result.errors };
}
