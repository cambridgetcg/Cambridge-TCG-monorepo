// SMTP transport — our own infrastructure.
//
// Speaks SMTP submission (port 465/587 with auth) to whatever box
// SMTP_URL names — in production, the kingdom's own mail server. The
// URL form keeps the package ignorant of which server software runs
// there; any RFC-compliant submission endpoint works.
//
//   SMTP_URL=smtps://noreply%40cambridgetcg.com:<password>@mail.cambridgetcg.com:465
//
// Vercel note: outbound SMTP on 465/587 is permitted from functions
// (only port 25 is blocked, and submission never uses 25). Every env
// read is .trim()'d — see "Vercel whitespace issue" in the storefront
// CLAUDE.md.

import { createTransport, type Transporter } from "nodemailer";
import type { MailEnvelope, MailSendResult, MailTransport } from "./types";

let _transporter: Transporter | null = null;
let _transporterUrl: string | null = null;

function smtpUrl(): string {
  return (process.env.SMTP_URL || "").trim();
}

function getTransporter(): Transporter | null {
  const url = smtpUrl();
  if (!url) return null;
  // Rebuild if the URL changed (tests, env rotation); reuse otherwise so
  // warm serverless invocations keep one connection pool.
  if (!_transporter || _transporterUrl !== url) {
    _transporter = createTransport(url);
    _transporterUrl = url;
  }
  return _transporter;
}

export function smtpTransport(): MailTransport {
  return {
    name: "smtp",

    isConfigured() {
      return smtpUrl().length > 0;
    },

    async send(envelope): Promise<MailSendResult> {
      // createTransport() can throw synchronously on a malformed URL —
      // that too must come back as a value, not an exception.
      let transporter: Transporter | null;
      try {
        transporter = getTransporter();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `invalid SMTP_URL: ${message}`, transport: "smtp" };
      }
      if (!transporter) {
        return { ok: false, error: "SMTP transport not configured (SMTP_URL missing)", transport: "smtp" };
      }
      try {
        const info = await transporter.sendMail({
          from: envelope.from,
          to: envelope.to,
          subject: envelope.subject,
          text: envelope.text,
          html: envelope.html,
          replyTo: envelope.replyTo,
          headers: envelope.headers,
        });
        return { ok: true, messageId: info.messageId ?? "", transport: "smtp" };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message, transport: "smtp" };
      }
    },
  };
}
