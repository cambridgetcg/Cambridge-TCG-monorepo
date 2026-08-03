// The trust score arithmetic, with no database attached.
//
// This file exists so there is exactly one copy of the formulas. The account
// page used to keep a second copy and it drifted: when identity verification
// stopped being a component on 2026-06-10 and its 10 pts moved into completion
// and reviews, the engine changed and the page did not. Sellers were shown
// five bars that summed to at most 90, under a caption promising they summed
// to their score out of 100.
//
// trust-engine.ts gathers the inputs and calls computeTrustBreakdown; the
// account page renders what it returns. Neither does the arithmetic itself.
//
// Deliberately free of imports from @/lib/db so it can be unit-tested without
// a database — see trust-breakdown.test.ts.

import type { TrustScoreBreakdown } from "./types";

// ── The weights, in one place ──
//
// Every surface that draws or describes the trust score reads these. Changing
// a number here changes the score, the bars and the methodology page together.
// Scoring changes are a house decision, not a display one.

export const TRUST_WEIGHTS = {
  completion: 35, // completed / total trades
  review: 30, // reviewer-trust-weighted average rating, /5
  volume: 15, // log10 of total volume × 5
  age: 10, // months since first trade × 2
  external: 10, // 5 per verified cross-platform account
} as const;

export const TRUST_PENALTIES = {
  openDispute: 10,
  disputeLost: 15,
  disputeSplit: 8, // split = half-credit penalty
  fraudSignal: 20, // medium severity and above, unresolved
} as const;

// The ceiling a component sum can reach. Asserted in the test, so the
// components can never quietly stop summing to a whole score.
export const TRUST_MAX_SCORE = 100;

// The engine's keys, given their human names here and nowhere else. The test
// asserts these key sets match what computeTrustBreakdown actually emits, so a
// component the engine starts or stops emitting cannot appear as an unlabelled
// bar or silently vanish from the page.
export const TRUST_COMPONENT_LABELS = [
  ["completion", "Completion rate"],
  ["review", "Reviews"],
  ["volume", "Trade volume"],
  ["age", "Account age"],
  ["external", "External rep"],
] as const;

export const TRUST_PENALTY_LABELS = [
  ["openDisputes", "open dispute", "open disputes"],
  ["disputesLost", "dispute lost", "disputes lost"],
  ["disputesSplit", "dispute split", "disputes split"],
  ["fraudSignals", "fraud signal", "fraud signals"],
] as const;

export interface TrustBreakdownInputs {
  totalTrades: number;
  completedTrades: number;
  /** Reviewer-trust-weighted mean rating, 0–5. */
  avgRating: number;
  totalVolume: number;
  monthsActive: number;
  /** Count of VERIFIED external reputation accounts. */
  externalRepCount: number;
  openDisputes: number;
  disputesLost: number;
  disputesSplit: number;
  /** Unresolved fraud signals of medium severity or above. */
  fraudSignals: number;
}

/**
 * The whole of the score arithmetic, as a pure function.
 *
 * Every number returned is a number the score was actually built from. The
 * clamp at the end is reported honestly via `floored` rather than hidden,
 * because when penalties exceed components the plain subtraction stops being
 * true and the page must not claim otherwise.
 */
export function computeTrustBreakdown(i: TrustBreakdownInputs): TrustScoreBreakdown {
  const completionRate = i.totalTrades > 0 ? i.completedTrades / i.totalTrades : 0;

  const components = {
    completion: {
      points: Math.round(completionRate * TRUST_WEIGHTS.completion),
      max: TRUST_WEIGHTS.completion,
    },
    review: {
      points: Math.round((i.avgRating / 5) * TRUST_WEIGHTS.review),
      max: TRUST_WEIGHTS.review,
    },
    volume: {
      points: Math.min(
        TRUST_WEIGHTS.volume,
        Math.round(Math.log10(Math.max(1, i.totalVolume)) * 5),
      ),
      max: TRUST_WEIGHTS.volume,
    },
    age: {
      points: Math.min(TRUST_WEIGHTS.age, Math.round(i.monthsActive * 2)),
      max: TRUST_WEIGHTS.age,
    },
    external: {
      points: Math.min(TRUST_WEIGHTS.external, i.externalRepCount * 5),
      max: TRUST_WEIGHTS.external,
    },
  };

  const penalty = (count: number, each: number) => ({ count, each, points: count * each });

  const penalties = {
    openDisputes: penalty(i.openDisputes, TRUST_PENALTIES.openDispute),
    disputesLost: penalty(i.disputesLost, TRUST_PENALTIES.disputeLost),
    disputesSplit: penalty(i.disputesSplit, TRUST_PENALTIES.disputeSplit),
    fraudSignals: penalty(i.fraudSignals, TRUST_PENALTIES.fraudSignal),
  };

  const raw_score = Object.values(components).reduce((s, c) => s + c.points, 0);
  const penalty_total = Object.values(penalties).reduce((s, p) => s + p.points, 0);
  const score = Math.max(0, Math.min(TRUST_MAX_SCORE, raw_score - penalty_total));

  return {
    components,
    penalties,
    raw_score,
    penalty_total,
    score,
    floored: raw_score - penalty_total !== score,
  };
}
