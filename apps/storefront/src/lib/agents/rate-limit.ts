/**
 * Agent rate limit — per-key, per-minute, three tiers.
 *
 * The substrate is the smallest possible thing: an UPSERT into
 * `agent_rate_buckets` keyed by (key_id, bucket_minute). A successful
 * insert increments the count; reaching the tier cap returns a 429.
 * The bucket key is truncated to the minute, so buckets roll naturally
 * with wall-clock time and the bucket table stays bounded by an external
 * prune sweep.
 *
 * If this becomes hot enough to want Redis or Upstash, swap this module —
 * everywhere else calls `checkAndConsume` and trusts the result.
 */

import { query } from "@/lib/db";

export type RateLimitTier = "free" | "standard" | "partner";

interface TierLimits {
  perMinute: number;
  perDayMatches: number;
}

const TIER_LIMITS: Record<RateLimitTier, TierLimits> = {
  free:     { perMinute: 30,  perDayMatches: 50   },
  standard: { perMinute: 120, perDayMatches: 500  },
  partner:  { perMinute: 600, perDayMatches: 5000 },
};

export function tierLimits(tier: RateLimitTier): TierLimits {
  return TIER_LIMITS[tier] ?? TIER_LIMITS.free;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

/**
 * Atomically increment this key's current-minute bucket and decide
 * whether the request is allowed.
 *
 * The UPSERT runs in a single SQL statement so two concurrent requests
 * for the same key cannot both see "count=N-1" and both insert "count=N".
 * The returned `request_count` is the post-increment value; the request
 * is allowed iff that value is ≤ tier.perMinute.
 */
export async function checkAndConsume(
  keyId: string,
  tier: RateLimitTier,
): Promise<RateLimitDecision> {
  const limit = tierLimits(tier).perMinute;

  const result = await query(
    `INSERT INTO agent_rate_buckets (key_id, bucket_minute, request_count)
       VALUES ($1, date_trunc('minute', NOW()), 1)
     ON CONFLICT (key_id, bucket_minute)
       DO UPDATE SET request_count = agent_rate_buckets.request_count + 1
     RETURNING request_count,
               EXTRACT(EPOCH FROM (date_trunc('minute', NOW()) + interval '1 minute' - NOW()))::int AS reset_seconds`,
    [keyId],
  );

  const count = result.rows[0].request_count as number;
  const resetSeconds = result.rows[0].reset_seconds as number;
  const remaining = Math.max(0, limit - count);

  return {
    allowed: count <= limit,
    remaining,
    resetSeconds,
  };
}

/** Lightweight peek without consuming — for /agent.self and similar reads. */
export async function peekRemaining(keyId: string, tier: RateLimitTier): Promise<number> {
  const limit = tierLimits(tier).perMinute;
  const result = await query(
    `SELECT request_count
       FROM agent_rate_buckets
      WHERE key_id = $1
        AND bucket_minute = date_trunc('minute', NOW())`,
    [keyId],
  );
  const used = (result.rows[0]?.request_count as number | undefined) ?? 0;
  return Math.max(0, limit - used);
}
