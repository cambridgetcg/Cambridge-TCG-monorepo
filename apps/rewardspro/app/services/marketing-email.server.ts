/**
 * The one path for marketing email: campaigns and merchant automations.
 *
 * - Recipients are re-checked here, at send time, against
 *   MARKETING_AUDIENCE (Shopify SUBSCRIBED consent, not unsubscribed since,
 *   not bounced or reported as spam); anyone else is skipped.
 * - Every message carries the recipient's own one-click unsubscribe link and
 *   List-Unsubscribe / List-Unsubscribe-Post headers (RFC 8058), both served
 *   by routes/email.unsubscribe.tsx.
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
import { checkEmailLimit, recordEmailSent } from "./email-usage-control.server";
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
  errors: string[];
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
 */
export async function sendMarketingEmail(
  shop: string,
  recipients: MarketingRecipient[],
  email: MarketingEmail,
): Promise<MarketingSendResult> {
  const refused = (error: string): MarketingSendResult => ({ sent: 0, skipped: 0, failed: recipients.length, errors: [error] });

  const blocked = marketingEmailBlockedReason();
  if (blocked) return refused(blocked);
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

  const usage = await checkEmailLimit(shop, customers.length);
  if (usage.capacityExceeded) console.warn(`[MarketingEmail] ${usage.message}`);

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

  const result = await sendPersonalizedEmails(shop, personalizations, {
    subject: email.subject,
    html: withUnsubscribeFooter(email.html, storeName),
    categories: email.categories,
  });
  if (result.sent > 0) await recordEmailSent(shop, result.sent, "campaign");

  return { sent: result.sent, skipped, failed: result.failed, errors: result.errors };
}
