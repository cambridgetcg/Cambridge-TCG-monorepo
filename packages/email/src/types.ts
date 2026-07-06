// Transport-neutral mail types.
//
// The platform's email used to speak one dialect (SES). This package
// exists so the *what* of an email (envelope) is separated from the
// *how* of its delivery (transport) — the precondition for moving
// delivery onto our own infrastructure one stream at a time.
//
// Substrate honesty: a MailSendResult names the transport that carried
// (or refused) the message. "Sent" is not one fact — sent-via-SES and
// sent-via-our-own-box are different claims with different failure
// modes, and the caller deserves to know which one it got.

export interface MailEnvelope {
  /** Full RFC 5322 From — `Display Name <addr@domain>` or bare address. */
  from: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  /** Extra headers (List-Unsubscribe, etc.). Supported by both transports. */
  headers?: Record<string, string>;
}

export type TransportName = "ses" | "smtp" | "console";

/**
 * Streams are deliverability identities, not just From addresses.
 * They map 1:1 onto the platform's sender reputations (see
 * apps/storefront/src/lib/email/send.ts — "the three sender streams")
 * plus "auth" for magic-link sign-in mail, which cuts over to a new
 * transport *last* because a spam-foldered magic link is a locked-out
 * user, not a missed notification.
 */
export type EmailStream = "auth" | "noreply" | "tradein" | "bounty";

export type MailSendResult =
  | { ok: true; messageId: string; transport: TransportName }
  | { ok: false; error: string; transport: TransportName | "none" };

export interface MailTransport {
  readonly name: TransportName;
  /** True when this transport has the credentials/config it needs to send. */
  isConfigured(): boolean;
  /** Never throws — failure is a value, matching send.ts's SendResult ethos. */
  send(envelope: MailEnvelope): Promise<MailSendResult>;
}
