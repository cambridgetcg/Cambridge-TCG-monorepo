// The console transport — email for rooms with no postal service.
//
// Local development has no SES credentials and no SMTP relay, which
// used to make every magic-link login impossible off-production. This
// transport "delivers" by writing the whole envelope to stdout, where
// a developer (or a flow-testing agent) can read the verification URL
// straight out of the dev-server log.
//
// It is always configured, never fails, and never leaves the machine.
// If it ever runs where NODE_ENV=production it shouts on every send —
// deliberate operators may live with the noise; accidents get noticed.

import type { MailEnvelope, MailSendResult, MailTransport } from "./types";

export function consoleTransport(): MailTransport {
  return {
    name: "console",
    isConfigured() {
      return true;
    },
    async send(envelope: MailEnvelope): Promise<MailSendResult> {
      if (process.env.NODE_ENV === "production") {
        console.warn(
          "[email:console] WARNING — console transport active in production; this email was NOT delivered to anyone",
        );
      }
      const body = envelope.text ?? envelope.html ?? "";
      console.log(
        `[email:console] to=${envelope.to} subject=${JSON.stringify(envelope.subject)}\n${body}`,
      );
      return { ok: true, messageId: `console-${Date.now()}`, transport: "console" };
    },
  };
}
