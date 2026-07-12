import { sql } from "drizzle-orm";
import { db } from "./db";

export const LOGIN_ATTEMPT_POLICY = Object.freeze({
  windowMs: 15 * 60 * 1000,
  retentionMs: 24 * 60 * 60 * 1000,
  perKeyLimit: 5,
  globalLimit: 100,
  retainedRowLimit: 10_000,
  pruneBatchSize: 500,
});

const MIN_AUTH_SECRET_BYTES = 32;
const LOGIN_ATTEMPT_LOCK_KEY = 1_281_974_852;
const LIMITER_UNAVAILABLE_LOG =
  "[AUTH] Credential login limiter unavailable; denying attempt";

export interface LoginAttemptCounts {
  perKey: number;
  global: number;
  retained: number;
}

type CountRow = {
  per_key_attempts: number;
  global_attempts: number;
  retained_attempts: number;
} & Record<string, unknown>;

export async function credentialAttemptKey(
  email: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`cambridge-tcg:wholesale-login-attempt:v1\0${email}`),
  );
  const digest = Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `hmac-sha256:v1:${digest}`;
}

export function canReserveLoginAttempt(counts: LoginAttemptCounts): boolean {
  return (
    counts.perKey < LOGIN_ATTEMPT_POLICY.perKeyLimit &&
    counts.global < LOGIN_ATTEMPT_POLICY.globalLimit &&
    counts.retained < LOGIN_ATTEMPT_POLICY.retainedRowLimit
  );
}

function configuredAuthSecret(): string | null {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret || new TextEncoder().encode(secret).byteLength < MIN_AUTH_SECRET_BYTES) {
    return null;
  }
  return secret;
}

function parseCounts(row: CountRow | undefined): LoginAttemptCounts | null {
  if (!row) return null;

  const counts = {
    perKey: Number(row.per_key_attempts),
    global: Number(row.global_attempts),
    retained: Number(row.retained_attempts),
  };
  return Object.values(counts).every(
    (count) => Number.isSafeInteger(count) && count >= 0,
  )
    ? counts
    : null;
}

/**
 * Atomically reserves capacity for one syntactically valid credential check.
 * Every reservation is counted, including successful logins. The stored row
 * contains only a versioned HMAC key and timestamp: no email, IP, outcome, or
 * error detail. `success` remains false only because the legacy table requires
 * the column; no limiter decision reads it.
 *
 * One transaction-scoped advisory lock serializes prune/count/insert across
 * every app instance. Each call deletes at most 500 expired rows, and the hard
 * 10,000-row ceiling prevents growth even if an expired backlog remains. Any
 * missing/weak Auth.js secret, lock/query failure, or malformed count fails
 * closed. `AUTH_SECRET` is preferred; `NEXTAUTH_SECRET` remains a compatibility
 * alias for the current production deployment.
 */
export async function reserveCredentialLoginAttempt(
  email: string,
): Promise<boolean> {
  const secret = configuredAuthSecret();
  if (!secret) {
    console.error(LIMITER_UNAVAILABLE_LOG);
    return false;
  }

  const attemptKey = await credentialAttemptKey(email, secret);
  const now = new Date();
  const windowStart = new Date(now.getTime() - LOGIN_ATTEMPT_POLICY.windowMs);
  const retentionStart = new Date(
    now.getTime() - LOGIN_ATTEMPT_POLICY.retentionMs,
  );

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${LOGIN_ATTEMPT_LOCK_KEY}::bigint)`,
      );

      await tx.execute(sql`
        WITH expired AS (
          SELECT id
          FROM login_attempts
          WHERE attempted_at < ${retentionStart}
          ORDER BY attempted_at, id
          LIMIT ${LOGIN_ATTEMPT_POLICY.pruneBatchSize}
        )
        DELETE FROM login_attempts
        WHERE id IN (SELECT id FROM expired)
      `);

      const rows = await tx.execute<CountRow>(sql`
        SELECT
          (
            SELECT count(*)::int
            FROM login_attempts
            WHERE email = ${attemptKey}
              AND attempted_at >= ${windowStart}
          ) AS per_key_attempts,
          (
            SELECT count(*)::int
            FROM login_attempts
            WHERE attempted_at >= ${windowStart}
          ) AS global_attempts,
          (SELECT count(*)::int FROM login_attempts) AS retained_attempts
      `);
      const counts = parseCounts(rows[0]);
      if (!counts || !canReserveLoginAttempt(counts)) return false;

      await tx.execute(sql`
        INSERT INTO login_attempts (email, attempted_at, success, ip)
        VALUES (${attemptKey}, ${now}, false, NULL)
      `);
      return true;
    });
  } catch {
    console.error(LIMITER_UNAVAILABLE_LOG);
    return false;
  }
}
