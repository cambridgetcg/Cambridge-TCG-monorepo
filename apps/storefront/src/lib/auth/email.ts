// Magic link email sender.
//
// Rides the platform transport seam (@cambridge-tcg/email) under the
// "auth" stream. Auth mail is login-critical — a spam-foldered magic
// link is a locked-out user — so this stream cuts over to new
// infrastructure LAST and falls back FIRST (EMAIL_TRANSPORT_AUTH).

import { sendMail } from "@cambridge-tcg/email";

const FROM_EMAIL = (process.env.AUTH_FROM_EMAIL || "noreply@cambridgetcg.com").trim();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendVerificationRequest(params: any) {
  const email = params.identifier as string;
  const url = params.url as string;
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
  // contract intact.
  if (!result.ok) {
    throw new Error(`magic-link send failed (${result.transport}): ${result.error}`);
  }
}
