// Magic link email sender using AWS SES

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({
  region: (process.env.AWS_REGION || "us-east-1").trim(),
  credentials: {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
  },
});

const FROM_EMAIL = process.env.AUTH_FROM_EMAIL || "noreply@cambridgetcg.com";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendVerificationRequest(params: any) {
  const email = params.identifier as string;
  const url = params.url as string;
  await ses.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: "Sign in to Cambridge TCG" },
        Body: {
          Text: {
            Data: `Sign in to your Cambridge TCG account:\n\n${url}\n\nThis link expires in 24 hours. If you didn't request this, you can ignore this email.`,
          },
          Html: {
            Data: `
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
        },
      },
    })
  );
}
