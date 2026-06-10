// SES transport — the incumbent.
//
// Delivery goes out as raw MIME (composed with nodemailer's MailComposer)
// through SendRawEmailCommand, because that is the only SES path that
// carries custom headers (List-Unsubscribe et al.). This mirrors what
// apps/storefront/src/lib/email/send.ts did inline before this package
// took the job over.

import MailComposer from "nodemailer/lib/mail-composer";
import { createSESClient, SendRawEmailCommand } from "@cambridge-tcg/aws/ses";
import type { MailEnvelope, MailSendResult, MailTransport } from "./types";

function composeRaw(envelope: MailEnvelope): Promise<Buffer> {
  const composer = new MailComposer({
    from: envelope.from,
    to: envelope.to,
    subject: envelope.subject,
    text: envelope.text,
    html: envelope.html,
    replyTo: envelope.replyTo,
    headers: envelope.headers,
  });
  return new Promise<Buffer>((resolve, reject) => {
    composer.compile().build((err, message) => {
      if (err) reject(err);
      else resolve(message);
    });
  });
}

export function sesTransport(): MailTransport {
  return {
    name: "ses",

    isConfigured() {
      return createSESClient() !== null;
    },

    async send(envelope): Promise<MailSendResult> {
      const client = createSESClient();
      if (!client) {
        return { ok: false, error: "SES transport not configured (AWS credentials missing)", transport: "ses" };
      }
      try {
        const raw = await composeRaw(envelope);
        const result = await client.send(
          new SendRawEmailCommand({
            Source: envelope.from,
            Destinations: Array.isArray(envelope.to) ? envelope.to : [envelope.to],
            RawMessage: { Data: raw },
          }),
        );
        return { ok: true, messageId: result.MessageId ?? "", transport: "ses" };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message, transport: "ses" };
      }
    },
  };
}
