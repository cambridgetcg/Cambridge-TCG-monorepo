/** Narrow public trust evidence for an explicitly-public, unsuspended user. */

import { query } from "@/lib/db";
import { TRUST_TIERS } from "@/lib/escrow/types";

export interface PublishedTrustState {
  username: string;
  display_name: string | null;
  member_since: string | null;
  trust_score: number;
  tier: { name: string; min_score: number };
  completed_trades: number;
  reviews: {
    average: number | null;
    total: number;
    five_star: number;
  };
  as_of: string;
}
function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function loadPublishedTrustState(
  username: string,
): Promise<PublishedTrustState | null> {
  const clean = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(clean)) return null;

  const user = await query(
    `SELECT u.id, u.username, u.name, u.created_at,
            COALESCE(tp.trust_score, u.trust_score, 0) AS trust_score,
            COALESCE(tp.completed_trades, u.trade_count, 0) AS completed_trades,
            tp.last_calculated_at
       FROM users u
       LEFT JOIN trust_profiles tp ON tp.user_id=u.id
      WHERE LOWER(u.username)=$1
        AND u.is_public=TRUE
        AND COALESCE(tp.is_suspended,FALSE)=FALSE
      LIMIT 1`,
    [clean],
  );
  const row = user.rows[0];
  if (!row) return null;

  const reviews = await query(
    `SELECT AVG(rating)::float8 AS average,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE rating=5)::int AS five_star
       FROM trade_reviews
      WHERE reviewee_id=$1
        AND is_public=TRUE
        AND admin_hidden=FALSE`,
    [row.id],
  );
  const review = reviews.rows[0] ?? {};
  const trustScore = num(row.trust_score);
  const tier =
    [...TRUST_TIERS].reverse().find((candidate) => trustScore >= candidate.minScore) ??
    TRUST_TIERS[0];

  return {
    username: row.username,
    display_name: row.name ?? null,
    member_since: row.created_at ? new Date(row.created_at).toISOString() : null,
    trust_score: trustScore,
    tier: { name: tier.name, min_score: tier.minScore },
    completed_trades: num(row.completed_trades),
    reviews: {
      average: review.average == null ? null : num(review.average),
      total: num(review.total),
      five_star: num(review.five_star),
    },
    as_of: row.last_calculated_at
      ? new Date(row.last_calculated_at).toISOString()
      : new Date().toISOString(),
  };
}
