// Magic link email sender.
//
// Rides the platform transport seam (@cambridge-tcg/email) under the
// "auth" stream. Auth mail is login-critical — a spam-foldered magic
// link is a locked-out user — so this stream cuts over to new
// infrastructure LAST and falls back FIRST (EMAIL_TRANSPORT_AUTH).

import { sendMail } from "@cambridge-tcg/email";
import { reserveMagicLinkForDelivery } from "./adapter";

const FROM_EMAIL = (process.env.AUTH_FROM_EMAIL || "noreply@cambridgetcg.com").trim();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendVerificationRequest(params: any) {
  const email = params.identifier as string;
  const rawToken = params.token as string;
  const expires = params.expires as Date;
  // auth/index pins this provider secret to the exact value Auth.js hashes
  // with. Without it we cannot reserve the exact stored token, so delivery
  // fails closed before the external email provider is called.
  const secret = params.provider?.secret as string | undefined;
  if (!secret) throw new Error("Magic-link token secret is unavailable");
  await reserveMagicLinkForDelivery({
    identifier: email,
    rawToken,
    expires,
    secret,
  });

  // Wrap the raw callback URL in the scanner-proof interstitial at
  // /login/verify: email scanners GET every link and a magic link is
  // single-use, so linking the callback directly let scanners consume
  // the token before the human clicked (observed in prod 2026-06-10).
  const rawUrl = params.url as string;
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://cambridgetcg.com").trim().replace(/\/$/, "");
  const url = `${origin}/login/verify?u=${encodeURIComponent(rawUrl)}`;
  const result = await sendMail(
    {
      from: `Cambridge TCG <${FROM_EMAIL}>`,
      to: email,
      subject: "Sign in to Cambridge TCG",
      text: `Sign in to your Cambridge TCG account:\n\n${url}\n\nThis link expires in 24 hours. If you didn't request this, you can ignore this email.`,
      html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;padding:32px;background:#171717;border-radius:16px;">
    <h1 style="color:#fff;font-size:20px;margin:0 0 8px;">Cambridge <span style="color:#34d399;">TCG</span></h1>
    <p style="color:#a3a3a3;font-size:14px;margin:0 0 24px;">Sign in to your account</p>
    <a href="${url}" style="display:inline-block;padding:12px 32px;background:#f59e0b;color:#000;font-weight:700;text-decoration:none;border-radius:8px;font-size:14px;">
      Sign In
    </a>
    <p style="color:#525252;font-size:12px;margin:24px 0 0;">This link expires in 24 hours.<br>If you didn't request this, you can safely ignore this email.</p>
  </div>
</body>
</html>`,
    },
    { stream: "auth" },
  );
  // The previous SES call threw on failure and next-auth surfaced it as
  // "could not send"; sendMail never throws, so re-raise to keep that
  // contract intact. Do not pass provider detail into Auth.js logging: it may
  // contain the recipient address or other transport metadata.
  if (!result.ok) {
    throw new Error("Magic-link send failed");
  }
}
