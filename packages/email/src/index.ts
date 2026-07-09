// @cambridge-tcg/email — the delivery seam.
//
// packages/aws/src/ses.ts has carried a note since it was written:
// "every email-sending module should import from here (or from
// packages/email once that exists)". This is that package.
//
// ── Why a seam ───────────────────────────────────────────────────────────
//
// The platform is moving email delivery from AWS SES onto self-hosted
// infrastructure. A magic link IS the login, so that move cannot be a
// big-bang swap: each sender stream cuts over independently, proves its
// deliverability, and can fall back with one env flip. The seam is the
// env contract below; nothing else in the codebase knows which wire a
// message rides.
//
// ── The env contract ─────────────────────────────────────────────────────
//
//   EMAIL_TRANSPORT            default for all streams: "ses" (default) | "smtp"
//                              | "console" (dev: prints to stdout, sends nothing)
//   EMAIL_TRANSPORT_AUTH       per-stream overrides; same values. AUTH is
//   EMAIL_TRANSPORT_NOREPLY    expected to be the LAST one flipped to smtp
//   EMAIL_TRANSPORT_TRADEIN    (magic links are login-critical) and the
//   EMAIL_TRANSPORT_BOUNTY     FIRST one flipped back if deliverability dips.
//   SMTP_URL                   submission endpoint for the smtp transport
//
// Cutover sequence and DNS prerequisites: docs/ops-email-selfhost.md.
//
// ── Degradation ──────────────────────────────────────────────────────────
//
// sendMail never throws. A misconfigured transport yields
// `{ ok: false, error, transport }`, preserving the storefront's
// build-without-credentials property (the dev server must boot with no
// AWS or SMTP env at all; sends fail as values at send-time).

import { sesTransport } from "./ses";
import { smtpTransport } from "./smtp";
import { consoleTransport } from "./console";
import type {
  EmailStream,
  MailEnvelope,
  MailSendResult,
  MailTransport,
  TransportName,
} from "./types";

export type {
  EmailStream,
  MailEnvelope,
  MailSendResult,
  MailTransport,
  TransportName,
} from "./types";

const TRANSPORTS: Record<TransportName, () => MailTransport> = {
  ses: sesTransport,
  smtp: smtpTransport,
  console: consoleTransport,
};

function isTransportName(value: string): value is TransportName {
  return value === "ses" || value === "smtp" || value === "console";
}

/**
 * Resolve which transport a stream rides, per the env contract above.
 * Unknown values are treated as unset (and fall through to the default)
 * rather than throwing — a typo'd env var must not take email down.
 */
export function resolveTransportName(stream?: EmailStream): TransportName {
  if (stream) {
    const override = (process.env[`EMAIL_TRANSPORT_${stream.toUpperCase()}`] || "")
      .trim()
      .toLowerCase();
    if (isTransportName(override)) return override;
  }
  const fallback = (process.env.EMAIL_TRANSPORT || "").trim().toLowerCase();
  return isTransportName(fallback) ? fallback : "ses";
}

export function getTransport(stream?: EmailStream): MailTransport {
  return TRANSPORTS[resolveTransportName(stream)]();
}

/** True when the transport this stream resolves to can actually send. */
export function isMailConfigured(stream?: EmailStream): boolean {
  return getTransport(stream).isConfigured();
}

/**
 * Send one email over whichever transport the stream resolves to.
 * Never throws; the result names the carrying transport.
 */
export async function sendMail(
  envelope: MailEnvelope,
  opts?: { stream?: EmailStream },
): Promise<MailSendResult> {
  return getTransport(opts?.stream).send(envelope);
}
