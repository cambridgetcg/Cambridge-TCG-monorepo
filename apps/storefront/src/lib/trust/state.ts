/**
 * User trust state — the shared read composer for all positions.
 *
 * Yu's directive 2026-05-13 (post-deep-dive): *"extract the first composer"*
 *
 * ── What this file is ───────────────────────────────────────────────────
 *
 * The kingdom reads `trust_profiles.trust_score` from twelve+ sites
 * directly today. Each site re-derives the tier, re-resolves the commission
 * rate, re-computes the hold days, re-counts the reviews. Drift waits for
 * the first schema change.
 *
 * This module is the single composer the next wave of trust-facing surfaces
 * shares — `/u/[username]/trust` (public mirror), `/account/trust` (self
 * mirror), `/api/v1/users/[username]/trust.json` (machine read), the math-
 * mirror sibling, and any future composer that needs *the full picture of
 * one user's standing in the kingdom* without re-implementing the queries.
 *
 * Five sections:
 *
 *   1. CURRENT — trust_score / seller_score / buyer_score / last_calculated_at
 *   2. TIER — name / min_score / next_tier (with points_away) / color
 *   3. STATS — counts, rates, financial bands from trust_profiles
 *   4. REVIEWS — avg_rating + distribution + sub-rating averages from trade_reviews
 *   5. TRAJECTORY — 7d / 30d / 90d deltas from trust_score_history + sample
 *
 * Plus the killer section:
 *
 *   6. PROPAGATION — the *live downstream effects* of this trust score
 *      (commission rate, payout hold days, escrow band thresholds, trade
 *      limits, inspection requirement). Names the chain the user can't
 *      currently see anywhere else.
 *
 * ── What this does NOT do ──────────────────────────────────────────────
 *
 *   Does not enforce privacy. `users.is_public` gating is the caller's
 *   responsibility — the public `/u/[username]/trust` page should call
 *   `userTrustStateIsPublic(userId)` first; the self-view at
 *   `/account/trust` does not need to gate.
 *
 *   Does not include external_reputation. That has its own surface
 *   (/account/external-rep) and a dedicated rendering. A future revision
 *   could add `has_external_rep: boolean` if useful.
 *
 *   Does not project per-modality. The composer returns the full shape;
 *   the caller decides what to render for its position (HTML, JSON,
 *   math-mirror).
 *
 *   Does not write. Pure read.
 */

import { query } from "@/lib/db";
import { TRUST_TIERS, type TrustProfile } from "@/lib/escrow/types";
import { getPayoutHoldDays, getTrustTier } from "@/lib/escrow/trust-engine";
import { getUserThresholds } from "@/lib/escrow/service-tiers";
import { commissionRateForScore } from "@/lib/market/types";

/**
 * Local extension of TrustProfile to include the `last_calculated_at`
 * column that lives in the table (drizzle/0019_escrow_trust.sql:66) but
 * isn't carried in the shared TS interface. We select it explicitly and
 * carry it through this composer for the "last recomputed" provenance
 * detail every reader benefits from seeing.
 */
type TrustProfileRow = TrustProfile & {
  last_calculated_at: string | Date | null;
};

// ── Public shape ─────────────────────────────────────────────────────────

export interface TrustCurrent {
  trust_score: number;
  seller_score: number;
  buyer_score: number;
  last_calculated_at: string | null;
}

export interface TrustTierBand {
  name: string;
  min_score: number;
  color: string;
  /** Next tier up; null when already at the top (Elite). */
  next_tier: {
    name: string;
    min_score: number;
    points_away: number;
  } | null;
}

export interface TrustStats {
  total_trades: number;
  completed_trades: number;
  cancelled_trades: number;
  disputed_trades: number;
  disputes_won: number;
  disputes_lost: number;
  /** completed / total; null when total = 0. */
  completion_rate: number | null;
  /** disputed / total; null when total = 0. */
  dispute_rate: number | null;
  total_volume_gbp: number;
  largest_trade_gbp: number;
}

export interface TrustReviewSummary {
  avg_rating: number | null;
  total: number;
  /** Star-count distribution across visible reviews. */
  distribution: {
    five: number;
    four: number;
    three: number;
    two: number;
    one: number;
  };
  /** Averages of the three sub-ratings, null when not enough data. */
  sub_ratings_avg: {
    card_accuracy: number | null;
    shipping_speed: number | null;
    communication: number | null;
  };
}

export interface TrustHistoryPoint {
  snapshot_date: string;
  trust_score: number;
  total_trades: number;
  completed_trades: number;
}

export interface TrustTrajectory {
  /** Δ over the named window; null when no observation exists at the floor. */
  delta_7d: number | null;
  delta_30d: number | null;
  delta_90d: number | null;
  /** Daily snapshots over the last 90 days, ascending. */
  history: TrustHistoryPoint[];
}

/**
 * The downstream chain — what this trust score *currently produces* in the
 * kingdom's economics. Each value is the consequence of the score the user
 * sees above; making this visible is the kingdom's substrate-honesty about
 * the trust chain.
 */
export interface TrustPropagation {
  /** Commission rate the kingdom takes on this user's P2P sales. 0.05–0.08. */
  commission_rate: number;
  /** Display form, "7%" etc. */
  commission_rate_display: string;
  /** Default payout-hold window for this tier, in days. The actual hold per
   *  trade may differ if escrow routing imposes a higher floor (see
   *  reconcileHold). */
  payout_hold_days: number;
  /** Per-trade maximum value at this tier. */
  trade_limit_gbp: number;
  /** Rolling-24h maximum across this user's trades. */
  daily_limit_gbp: number;
  /** Trades valued ≤ direct_escrow_max route as direct. */
  direct_escrow_max_gbp: number;
  /** Trades valued ≤ verified_escrow_max route as verified; above → full. */
  verified_escrow_max_gbp: number;
  /** Whether the kingdom defaults to requiring inspection at this tier. */
  requires_inspection: boolean;
  methodology_urls: {
    trust_score: string;
    commission_rate: string;
    escrow_tier: string;
    payout_hold: string;
  };
}

export interface TrustFlags {
  is_flagged: boolean;
  is_suspended: boolean;
  suspended_until: string | null;
}

export interface UserTrustState {
  user_id: string;
  username: string | null;
  display_name: string | null;
  is_public: boolean;
  member_since: string | null;

  current: TrustCurrent;
  tier: TrustTierBand;
  stats: TrustStats;
  reviews: TrustReviewSummary;
  trajectory: TrustTrajectory;
  propagation: TrustPropagation;
  flags: TrustFlags;

  _provenance: {
    kind: "live";
    queried_at: string;
    notes: string;
    sources: string[];
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[trust/state] query failed:", err);
    }
    return fallback;
  }
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function toNumOr0(v: unknown): number {
  return toNum(v) ?? 0;
}

function toISO(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

// ── Section loaders ─────────────────────────────────────────────────────

async function loadUserBasics(userId: string): Promise<{
  username: string | null;
  display_name: string | null;
  is_public: boolean;
  member_since: string | null;
} | null> {
  return safe(
    async () => {
      const r = await query(
        `SELECT username, name AS display_name, is_public, created_at AS member_since
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [userId],
      );
      const row = r.rows[0];
      if (!row) return null;
      return {
        username: row.username ?? null,
        display_name: row.display_name ?? null,
        is_public: row.is_public === false ? false : true,
        member_since: toISO(row.member_since),
      };
    },
    null,
  );
}

async function loadTrustProfile(
  userId: string,
): Promise<TrustProfileRow | null> {
  return safe(
    async () => {
      const r = await query(
        `SELECT * FROM trust_profiles WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      return (r.rows[0] as TrustProfileRow) ?? null;
    },
    null,
  );
}

async function loadReviewSummary(userId: string): Promise<TrustReviewSummary> {
  return safe(
    async () => {
      const r = await query(
        `SELECT
           AVG(rating)::numeric                              AS avg_rating,
           COUNT(*)::int                                     AS total,
           COUNT(*) FILTER (WHERE rating = 5)::int           AS d5,
           COUNT(*) FILTER (WHERE rating = 4)::int           AS d4,
           COUNT(*) FILTER (WHERE rating = 3)::int           AS d3,
           COUNT(*) FILTER (WHERE rating = 2)::int           AS d2,
           COUNT(*) FILTER (WHERE rating = 1)::int           AS d1,
           AVG(card_accuracy)::numeric                       AS sub_ca,
           AVG(shipping_speed)::numeric                      AS sub_ss,
           AVG(communication)::numeric                       AS sub_co
         FROM trade_reviews
         WHERE reviewee_id = $1
           AND is_public = TRUE
           AND admin_hidden = FALSE`,
        [userId],
      );
      const row = r.rows[0] ?? {};
      return {
        avg_rating: toNum(row.avg_rating),
        total: row.total ?? 0,
        distribution: {
          five: row.d5 ?? 0,
          four: row.d4 ?? 0,
          three: row.d3 ?? 0,
          two: row.d2 ?? 0,
          one: row.d1 ?? 0,
        },
        sub_ratings_avg: {
          card_accuracy: toNum(row.sub_ca),
          shipping_speed: toNum(row.sub_ss),
          communication: toNum(row.sub_co),
        },
      };
    },
    {
      avg_rating: null,
      total: 0,
      distribution: { five: 0, four: 0, three: 0, two: 0, one: 0 },
      sub_ratings_avg: { card_accuracy: null, shipping_speed: null, communication: null },
    },
  );
}

async function loadTrajectory(
  userId: string,
  currentScore: number,
): Promise<TrustTrajectory> {
  // Daily history over 90 days, ascending for plotting.
  const history = await safe(
    async () => {
      const r = await query(
        `SELECT snapshot_date, trust_score, total_trades, completed_trades
         FROM trust_score_history
         WHERE user_id = $1
           AND snapshot_date >= (CURRENT_DATE - INTERVAL '90 days')
         ORDER BY snapshot_date ASC`,
        [userId],
      );
      return r.rows.map(
        (row: any): TrustHistoryPoint => ({
          snapshot_date:
            row.snapshot_date instanceof Date
              ? row.snapshot_date.toISOString().slice(0, 10)
              : String(row.snapshot_date),
          trust_score: toNumOr0(row.trust_score),
          total_trades: row.total_trades ?? 0,
          completed_trades: row.completed_trades ?? 0,
        }),
      );
    },
    [] as TrustHistoryPoint[],
  );

  // Single-shot delta queries for 7/30/90d — pick the most recent observation
  // at-or-before NOW - N days, subtract from current score.
  async function deltaAt(days: number): Promise<number | null> {
    return safe(
      async () => {
        const r = await query(
          `SELECT trust_score
           FROM trust_score_history
           WHERE user_id = $1
             AND snapshot_date <= (CURRENT_DATE - INTERVAL '${days} days')
           ORDER BY snapshot_date DESC
           LIMIT 1`,
          [userId],
        );
        const past = toNum(r.rows[0]?.trust_score);
        return past === null ? null : currentScore - past;
      },
      null,
    );
  }

  const [delta_7d, delta_30d, delta_90d] = await Promise.all([
    deltaAt(7),
    deltaAt(30),
    deltaAt(90),
  ]);

  return { delta_7d, delta_30d, delta_90d, history };
}

// ── Tier band + propagation (in-code; no DB calls) ──────────────────────

function buildTierBand(score: number): TrustTierBand {
  const tier = getTrustTier(score);
  const idx = TRUST_TIERS.findIndex((t) => t.name === tier.name);
  const next = idx >= 0 && idx < TRUST_TIERS.length - 1 ? TRUST_TIERS[idx + 1] : null;
  return {
    name: tier.name,
    min_score: tier.minScore,
    color: tier.color,
    next_tier: next
      ? {
          name: next.name,
          min_score: next.minScore,
          points_away: Math.max(0, next.minScore - score),
        }
      : null,
  };
}

function buildPropagation(score: number): TrustPropagation {
  const tier = getTrustTier(score);
  const thresholds = getUserThresholds(score);
  const rate = commissionRateForScore(score);
  return {
    commission_rate: rate,
    commission_rate_display: `${Math.round(rate * 1000) / 10}%`,
    payout_hold_days: getPayoutHoldDays(score),
    trade_limit_gbp: tier.tradeLimit,
    daily_limit_gbp: tier.dailyLimit,
    direct_escrow_max_gbp: thresholds.directMax,
    verified_escrow_max_gbp: thresholds.verifiedMax,
    requires_inspection: tier.requiresInspection,
    methodology_urls: {
      trust_score: "/methodology/trust-score",
      commission_rate: "/methodology/commission-rate",
      escrow_tier: "/methodology/escrow-tier",
      payout_hold: "/methodology/payout-hold",
    },
  };
}

function buildStats(profile: TrustProfileRow | null): TrustStats {
  if (!profile) {
    return {
      total_trades: 0,
      completed_trades: 0,
      cancelled_trades: 0,
      disputed_trades: 0,
      disputes_won: 0,
      disputes_lost: 0,
      completion_rate: null,
      dispute_rate: null,
      total_volume_gbp: 0,
      largest_trade_gbp: 0,
    };
  }
  const total = profile.total_trades ?? 0;
  const completed = profile.completed_trades ?? 0;
  const disputed = profile.disputed_trades ?? 0;
  return {
    total_trades: total,
    completed_trades: completed,
    cancelled_trades: profile.cancelled_trades ?? 0,
    disputed_trades: disputed,
    disputes_won: profile.disputes_won ?? 0,
    disputes_lost: profile.disputes_lost ?? 0,
    completion_rate: total > 0 ? completed / total : null,
    dispute_rate: total > 0 ? disputed / total : null,
    total_volume_gbp: toNumOr0(profile.total_volume),
    largest_trade_gbp: toNumOr0(profile.largest_trade),
  };
}

function buildFlags(profile: TrustProfileRow | null): TrustFlags {
  if (!profile) {
    return { is_flagged: false, is_suspended: false, suspended_until: null };
  }
  return {
    is_flagged: profile.is_flagged ?? false,
    is_suspended: profile.is_suspended ?? false,
    suspended_until: toISO(profile.suspended_until),
  };
}

// ── Public surface ─────────────────────────────────────────────────────

/**
 * Compose the full user trust state from `users` × `trust_profiles` ×
 * `trade_reviews` × `trust_score_history` + the in-code propagation chain.
 *
 * Returns null when the user does not exist in `users`. Returns a state
 * with zero-defaults when the user exists but has no `trust_profiles` row
 * (a brand-new account before the first recompute).
 *
 * **Does NOT enforce `users.is_public`.** Callers in public contexts must
 * gate via `userTrustStateIsPublic(userId)` before calling this function;
 * self-view callers do not need to gate.
 *
 * Five DB section queries run in parallel via `Promise.all`. Each is
 * isolated in `safe()` — one failing degrades that section to empty
 * defaults rather than crashing the composer.
 */
export async function loadUserTrustState(
  userId: string,
): Promise<UserTrustState | null> {
  const basics = await loadUserBasics(userId);
  if (!basics) return null;

  const profile = await loadTrustProfile(userId);
  const score = profile?.trust_score ?? 0;

  const [reviews, trajectory] = await Promise.all([
    loadReviewSummary(userId),
    loadTrajectory(userId, score),
  ]);

  return {
    user_id: userId,
    username: basics.username,
    display_name: basics.display_name,
    is_public: basics.is_public,
    member_since: basics.member_since,

    current: {
      trust_score: score,
      seller_score: profile?.seller_score ?? 0,
      buyer_score: profile?.buyer_score ?? 0,
      last_calculated_at: toISO(profile?.last_calculated_at),
    },
    tier: buildTierBand(score),
    stats: buildStats(profile),
    reviews,
    trajectory,
    propagation: buildPropagation(score),
    flags: buildFlags(profile),

    _provenance: {
      kind: "live",
      queried_at: new Date().toISOString(),
      notes:
        "Composed from users + trust_profiles + trade_reviews + trust_score_history at request time. Tier band, propagation chain (commission rate / payout hold / escrow thresholds / trade limits) computed in-code from TRUST_TIERS and the pure helpers in lib/escrow. The kingdom's substrate-honest answer to 'what does this trust score currently produce?' lives in the propagation block. See /methodology/trust-score for the score formula; /methodology/commission-rate, /methodology/escrow-tier, /methodology/payout-hold for the downstream effects.",
      sources: [
        "users",
        "trust_profiles",
        "trade_reviews",
        "trust_score_history",
        "lib/escrow/types.ts (TRUST_TIERS)",
        "lib/escrow/trust-engine.ts (getTrustTier, getPayoutHoldDays)",
        "lib/escrow/service-tiers.ts (getUserThresholds)",
        "lib/market/types.ts (commissionRateForScore)",
      ],
    },
  };
}

/**
 * Check whether a user's trust state should be visible on a public-mirror
 * surface (e.g. `/u/[username]/trust`). Reads `users.is_public`.
 *
 * Returns false when the user does not exist, when `is_public = false`, or
 * when the read fails — public surfaces should fail closed.
 */
export async function userTrustStateIsPublic(userId: string): Promise<boolean> {
  return safe(
    async () => {
      const r = await query(
        `SELECT is_public FROM users WHERE id = $1 LIMIT 1`,
        [userId],
      );
      return r.rows[0]?.is_public === true;
    },
    false,
  );
}

/**
 * Convenience: resolve a username to a user_id. Returns null on miss.
 * Public-mirror surfaces typically take a username from the URL and need
 * this before `loadUserTrustState`.
 */
export async function resolveUsername(username: string): Promise<string | null> {
  return safe(
    async () => {
      const r = await query(
        `SELECT id FROM users WHERE username = $1 LIMIT 1`,
        [username],
      );
      return r.rows[0]?.id ?? null;
    },
    null,
  );
}
