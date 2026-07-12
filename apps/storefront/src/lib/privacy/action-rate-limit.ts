/**
 * Privacy-preserving rate limits for sensitive public or account actions.
 *
 * The database receives only a window-specific HMAC. It never receives the
 * raw subject (an IP for public feedback, an account id for an authenticated
 * action), and expired buckets are removed by the maintenance sweep.
 */

import { query } from "@/lib/db";
import { hashActionRateLimitSubject } from "./action-rate-hash";

const ACTION_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const WINDOW_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

export interface ActionRateLimitWindow {
  name: string;
  seconds: number;
  limit: number;
  /** Defaults to two complete windows. */
  retainForSeconds?: number;
}

export interface ActionRateLimitWindowResult {
  name: string;
  limit: number;
  used: number;
  remaining: number;
  resetsInSeconds: number;
}

export type ActionRateLimitResult =
  | { ok: false; reason: "missing-secret" | "storage-unavailable" }
  | {
      ok: true;
      allowed: boolean;
      remaining: number;
      retryAfterSeconds: number;
      windows: ActionRateLimitWindowResult[];
    };

function configuredHashSecret(): string | null {
  // A weak secret would make the small IP address space guessable offline.
  // Prefer the dedicated secret, but a malformed optional override must not
  // hide a strong AUTH_SECRET fallback.
  return (
    [
      process.env.RATE_LIMIT_HASH_SECRET?.trim(),
      process.env.AUTH_SECRET?.trim(),
    ].find((value): value is string => Boolean(value && value.length >= 32)) ??
    null
  );
}

function validWindow(window: ActionRateLimitWindow): boolean {
  return (
    WINDOW_RE.test(window.name) &&
    Number.isSafeInteger(window.seconds) &&
    window.seconds >= 60 &&
    window.seconds <= 31_536_000 &&
    Number.isSafeInteger(window.limit) &&
    window.limit >= 1 &&
    window.limit <= 1_000_000 &&
    (window.retainForSeconds === undefined ||
      (Number.isSafeInteger(window.retainForSeconds) &&
        window.retainForSeconds >= window.seconds &&
        window.retainForSeconds <= 63_072_000))
  );
}

/**
 * Atomically consumes every supplied window in one SQL statement.
 *
 * If the hash secret is absent or shorter than 32 characters, no subject is
 * stored and the caller can fail closed with an honest 503.
 */
export async function consumeActionRateLimit(args: {
  action: string;
  subject: string;
  windows: readonly ActionRateLimitWindow[];
  now?: Date;
}): Promise<ActionRateLimitResult> {
  if (!ACTION_RE.test(args.action)) {
    throw new Error("Invalid privacy action rate-limit name.");
  }
  if (!args.subject || args.subject.length > 512) {
    throw new Error("Invalid privacy action rate-limit subject.");
  }
  if (
    args.windows.length === 0 ||
    args.windows.length > 4 ||
    new Set(args.windows.map((window) => window.name)).size !== args.windows.length ||
    args.windows.some((window) => !validWindow(window))
  ) {
    throw new Error("Invalid privacy action rate-limit window.");
  }

  const secret = configuredHashSecret();
  if (!secret) return { ok: false, reason: "missing-secret" };

  const now = args.now ?? new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const rows = args.windows.map((window) => {
    const windowStart = Math.floor(nowSeconds / window.seconds) * window.seconds;
    const retainFor = window.retainForSeconds ?? window.seconds * 2;
    return {
      window,
      windowStart,
      expiresAt: windowStart + retainFor,
      subjectHash: hashActionRateLimitSubject({
        secret,
        action: args.action,
        subject: args.subject,
        windowName: window.name,
        windowStartEpochSeconds: windowStart,
      }),
    };
  });

  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    const first = params.length + 1;
    params.push(
      args.action,
      row.subjectHash,
      row.window.name,
      new Date(row.windowStart * 1000).toISOString(),
      new Date(row.expiresAt * 1000).toISOString(),
    );
    return `($${first}, $${first + 1}, $${first + 2}, $${first + 3}::timestamptz, 1, $${first + 4}::timestamptz)`;
  });

  let consumed: Awaited<ReturnType<typeof query>>;
  try {
    consumed = await query(
      `INSERT INTO privacy_action_rate_buckets
       (action, subject_hash, window_name, window_start, request_count, expires_at)
     VALUES ${tuples.join(", ")}
     ON CONFLICT (action, subject_hash, window_name, window_start)
       DO UPDATE
         SET request_count = LEAST(
               privacy_action_rate_buckets.request_count + 1,
               1000000
             ),
             expires_at = GREATEST(
               privacy_action_rate_buckets.expires_at,
               EXCLUDED.expires_at
             )
       RETURNING window_name, request_count`,
      params,
    );
  } catch {
    // Callers need a fail-closed result, not a database error string they may
    // accidentally return to a public form.
    return { ok: false, reason: "storage-unavailable" };
  }

  const usedByName = new Map<string, number>(
    consumed.rows.map((row) => [
      String(row.window_name),
      Number(row.request_count),
    ]),
  );
  const windows: ActionRateLimitWindowResult[] = rows.map((row) => {
    const used = usedByName.get(row.window.name) ?? row.window.limit + 1;
    return {
      name: row.window.name,
      limit: row.window.limit,
      used,
      remaining: Math.max(0, row.window.limit - used),
      resetsInSeconds: Math.max(
        1,
        row.windowStart + row.window.seconds - nowSeconds,
      ),
    };
  });
  const blocked = windows.filter((window) => window.used > window.limit);

  return {
    ok: true,
    allowed: blocked.length === 0,
    remaining: Math.min(...windows.map((window) => window.remaining)),
    retryAfterSeconds:
      blocked.length === 0
        ? 0
        : Math.max(...blocked.map((window) => window.resetsInSeconds)),
    windows,
  };
}
