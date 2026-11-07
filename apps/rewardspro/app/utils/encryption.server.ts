/**
 * Encryption utilities for storing third-party secrets at rest
 * (today: the merchant's Klaviyo private API key).
 *
 * Uses the app's fail-closed AES-256-GCM helper in ./encryption.ts, keyed by
 * ENCRYPTION_SECRET and ENCRYPTION_SALT. If either is missing, encryptSecret
 * throws, so a secret is never stored in plaintext.
 *
 * Format: "enc:v2:<base64 payload from encrypt()>"
 */

import { decrypt, encrypt } from "./encryption";

const ENCRYPTION_PREFIX = "enc:v2:";

/**
 * Encrypt a plaintext secret for storage.
 * Throws if encryption is not configured; there is no plaintext fallback.
 */
export function encryptSecret(plaintext: string): string {
  return `${ENCRYPTION_PREFIX}${encrypt(plaintext)}`;
}

/**
 * Decrypt a stored secret.
 *
 * Returns null for anything encryptSecret did not write: a legacy plaintext
 * value, the old EMAIL_ENCRYPTION_KEY "enc:v1:" format, a tampered value, or a
 * value that can't be read because the key is missing. Callers treat null as
 * "no key saved", so a legacy value is never used or sent anywhere.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) {
    return null;
  }

  if (!stored.startsWith(ENCRYPTION_PREFIX)) {
    console.warn("[Encryption] Ignoring a stored secret that was not written by encryptSecret");
    return null;
  }

  try {
    return decrypt(stored.slice(ENCRYPTION_PREFIX.length));
  } catch {
    console.error("[Encryption] Could not decrypt a stored secret");
    return null;
  }
}

/**
 * EmailSettings columns that hold Klaviyo credentials. Pass as Prisma `omit`
 * when a loader sends the settings row to the browser.
 */
export const EMAIL_SETTINGS_SECRET_FIELDS = {
  klaviyoApiKey: true,
  klaviyoAccessToken: true,
  klaviyoRefreshToken: true,
  klaviyoWebhookSecret: true,
} as const;
