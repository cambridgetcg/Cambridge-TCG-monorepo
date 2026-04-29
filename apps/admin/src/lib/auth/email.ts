/**
 * Magic link email sender for the admin dashboard.
 *
 * Only admins can receive sign-in emails — the auth.ts signIn callback
 * gates on role='admin' before this ever creates a session.
 */

import { createSESClient } from "@cambridge-tcg/aws/ses";
import { SendEmailCommand } from "@aws-sdk/client-ses";

const FROM_EMAIL = process.env.AUTH_FROM_EMAIL ?? "admin@cambridgetcg.com";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendVerificationRequest(params: any) {
  const email = params.identifier as string;
  const url = params.url as string;

  // Dev-only transport — print the magic-link URL to the dev server log
  // instead of calling SES. Gated on NODE_ENV so production always sends
  // a real email. Useful when you're running locally without AWS creds.
  if (process.env.NODE_ENV !== "production") {
    const bar = "─".repeat(72);
    // eslint-disable-next-line no-console
    console.log(
      `\n${bar}\n[admin/auth] dev console transport — magic link for ${email}:\n\n  ${url}\n\n${bar}\n`,
    );
    return;
  }

  const ses = createSESClient();
  if (!ses) {
    throw new Error("SES client unavailable — check AWS_REGION and credentials");
  }
  await ses.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: "Sign in to Cambridge TCG Admin" },
        Body: {
          Text: {
            Data: `Sign in to Cambridge TCG Admin:\n\n${url}\n\nThis link expires in 24 hours.\n\nIf you didn't request this, someone entered your email by mistake — you can ignore it.`,
          },
          Html: {
            Data: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;padding:32px;background:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;">
    <p style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 16px;">Cambridge TCG</p>
    <h1 style="color:#f9fafb;font-size:22px;font-weight:600;margin:0 0 8px;">Admin sign-in</h1>
    <p style="color:#9ca3af;font-size:14px;margin:0 0 28px;">Click the button below to sign in to the admin dashboard.</p>
    <a href="${url}" style="display:inline-block;padding:11px 28px;background:#3b82f6;color:#fff;font-weight:600;text-decoration:none;border-radius:8px;font-size:14px;">
      Sign In →
    </a>
    <p style="color:#4b5563;font-size:12px;margin:28px 0 0;border-top:1px solid #2a2a2a;padding-top:20px;">
      This link expires in 24 hours.<br>
      If you didn't request this, you can safely ignore this email.
    </p>
  </div>
</body>
</html>`,
          },
        },
      },
    }),
  );
}
