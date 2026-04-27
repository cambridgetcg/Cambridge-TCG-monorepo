/**
 * Shared SES client for storefront email.
 *
 * Delegates to @cambridge-tcg/aws for client construction. This module
 * re-exports the singleton so existing consumers (send.ts, etc.) don't
 * need to change their imports.
 *
 * Uses the nullable factory (not OrThrow) because storefront must be able
 * to build and start without AWS credentials — the graceful sendEmail()
 * checks for missing creds at send-time, not at import-time.
 */

import { SESClient } from "@aws-sdk/client-ses";
import { createSESClient } from "@cambridge-tcg/aws/ses";

// If credentials are configured, use the shared client.
// If not, create a bare client (will fail at send-time, same as before).
export const sesClient: SESClient = createSESClient() ?? new SESClient({
  region: (process.env.AWS_REGION || "us-east-1").trim(),
});
