// External reputation primitives.
//
// generateVerificationCode + safeFetch shared by the verification flow
// (Phase C) and the daily decay cron (Phase D). Pattern mirrors
// @/lib/bounty/rng (random-seed primitive) and @/lib/wholesale/client
// (AbortController-bounded fetch).

import crypto from "crypto";

const FETCH_TIMEOUT_MS = 8_000;

/**
 * Issue a fresh verification code. Format `verify-cambridgetcg-XXXXXXXX`
 * — branded so a user pasting it onto an external profile is obviously
 * for our verification, not noise. 8 hex chars = 32 bits of randomness;
 * collision risk across pending codes is negligible.
 */
export function generateVerificationCode(): string {
  const nonce = crypto.randomBytes(4).toString("hex");
  return `verify-cambridgetcg-${nonce}`;
}

/**
 * Fetch a public URL with an AbortController-bounded timeout. The
 * external-rep verifier must not hang on a slow eBay/Cardmarket page.
 * Returns the body text on success; throws a typed error on timeout
 * or non-2xx status so the caller can map to the user-facing message.
 */
export async function safeFetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // Identify as the verifier — some hosts block stripped-UA bots.
      headers: { "User-Agent": "CambridgeTCG-Verifier/1.0 (+https://cambridgetcg.com/verify)" },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.text();
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"))) {
      throw new Error(`Verification fetch timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Decay window — 90 days. After this, the daily cron re-fetches the
 * profile URL to confirm the code is still present. If 3 consecutive
 * checks fail (page deleted, code removed, account deactivated), the
 * verified flag drops.
 */
export const DECAY_DAYS = 90;
export const FAILED_CHECK_LIMIT = 3;
