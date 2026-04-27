// Shared AWS SES client. Every email-sending module in the app used to
// instantiate its own — this one replaces that pattern for new code. The
// existing sites (auth/email.ts, tradein/email.ts, og/claim/route.ts) keep
// their own clients for now; they can be migrated in a later sweep.
//
// Credentials follow the CLAUDE.md rule: always .trim() env values, since
// Vercel silently appends whitespace on some env setups.

import { SESClient } from "@aws-sdk/client-ses";

export const sesClient = new SESClient({
  region: (process.env.AWS_REGION || "us-east-1").trim(),
  credentials: {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
  },
});
