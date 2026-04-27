/**
 * Shared SES client factory.
 *
 * Replaces the 11 separate SES client instantiations in storefront.
 * Every email-sending module should import from here (or from packages/email
 * once that exists) instead of creating its own SESClient.
 */

import { SESClient, SendEmailCommand, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { resolveAwsConfig, type AwsConfig } from "./credentials";

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

let _sharedClient: SESClient | null = null;

export interface CreateSESClientOpts {
  /** Override the default region (default: us-east-1) */
  defaultRegion?: string;
  /** Force a new client instead of reusing the singleton */
  fresh?: boolean;
}

/**
 * Get a configured SESClient. Returns a singleton by default.
 *
 * Returns `null` if credentials are missing, so callers can degrade
 * gracefully (matching the sendEmail() pattern from storefront's send.ts).
 */
export function createSESClient(opts?: CreateSESClientOpts): SESClient | null {
  if (_sharedClient && !opts?.fresh) return _sharedClient;

  const result = resolveAwsConfig(opts?.defaultRegion);
  if (!result.ok) {
    console.warn(`[packages/aws] SES unavailable: ${result.error}`);
    return null;
  }

  const client = new SESClient({
    region: result.config.region,
    credentials: result.config.credentials,
  });

  if (!opts?.fresh) {
    _sharedClient = client;
  }

  return client;
}

/**
 * Get a configured SESClient or throw. For code paths where email is required.
 */
export function createSESClientOrThrow(opts?: CreateSESClientOpts): SESClient {
  const client = createSESClient(opts);
  if (!client) throw new Error("SES client unavailable — AWS credentials not configured");
  return client;
}

// ---------------------------------------------------------------------------
// Re-exports (so consumers don't need direct @aws-sdk/client-ses dependency)
// ---------------------------------------------------------------------------

export { SESClient, SendEmailCommand, SendRawEmailCommand } from "@aws-sdk/client-ses";
