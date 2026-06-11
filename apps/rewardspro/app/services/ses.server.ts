/**
 * Amazon SES email service.
 *
 * Drop-in alternative to sendgrid.server.ts for transactional email. Uses the
 * existing AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY credentials — no separate
 * API key needed.
 *
 * STATUS — sandbox (200 emails/day, 1 email/sec). To use in production:
 *   1. Verify a sender domain or address: AWS Console → SES → Identities
 *   2. Request production access: AWS Console → SES → Account dashboard
 *      → "Request production access" (review takes ~24h)
 *   3. Set EMAIL_PROVIDER=ses in Vercel env to route email through SES
 *
 * Mirrors the SendEmailParams shape of sendgrid.server.ts so callers can be
 * swapped without code changes — the email-provider.server.ts shim picks the
 * backend based on EMAIL_PROVIDER.
 */

import { SendEmailCommand } from "@aws-sdk/client-ses";
import { getSESClient } from "~/utils/aws-clients.server";

// Mirror sendgrid.server.ts shape so this is a drop-in replacement.
interface EmailRecipient {
  email: string;
  name?: string;
}

export interface SESEmailParams {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  html: string;
  text?: string;
  from?: EmailRecipient;
  replyTo?: EmailRecipient;
}

export interface SESResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

const DEFAULT_SENDER: EmailRecipient = {
  email: process.env.SES_FROM_EMAIL?.trim() || "rewards@rewardspro.io",
  name: "Rewards Pro",
};

function formatAddress(r: EmailRecipient): string {
  return r.name ? `${r.name} <${r.email}>` : r.email;
}

/**
 * Send a transactional email via Amazon SES.
 *
 * Returns the same SendGridResponse-compatible shape so callers can rely on
 * the `{ success, messageId, error }` contract regardless of backend.
 */
export async function sendEmail(
  _shop: string,
  params: SESEmailParams
): Promise<SESResponse> {
  const client = getSESClient();

  const recipients = Array.isArray(params.to) ? params.to : [params.to];
  const sender = params.from || DEFAULT_SENDER;

  try {
    const cmd = new SendEmailCommand({
      Source: formatAddress(sender),
      Destination: {
        ToAddresses: recipients.map(formatAddress),
      },
      Message: {
        Subject: { Data: params.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: params.html, Charset: "UTF-8" },
          ...(params.text
            ? { Text: { Data: params.text, Charset: "UTF-8" } }
            : {}),
        },
      },
      ...(params.replyTo
        ? { ReplyToAddresses: [formatAddress(params.replyTo)] }
        : {}),
    });

    const result = await client.send(cmd);

    return {
      success: true,
      messageId: result.MessageId,
    };
  } catch (error: any) {
    console.error("[SES] Send error:", error?.name, error?.message);
    return {
      success: false,
      error: error?.message || "Unknown SES error",
    };
  }
}
