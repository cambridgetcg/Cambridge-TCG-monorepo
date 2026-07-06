/**
 * Spending-based tier resolution — the pure core, extracted so it can be
 * tested without a database.
 *
 * ── The bug this file closes ─────────────────────────────────────────────
 *
 * `recalculateTier` loads ALL tiers (including hidden ones) so that a manual
 * OG grant can still resolve its tier row by id. But the spending-based
 * fallback then iterated that same list and picked the *last* free tier a
 * user's annual_spend qualified for. OG is a FREE tier (is_paid=false) with
 * `min_annual_spend = 0` and the highest `sort_order` (99, so it sorts last),
 * and it is HIDDEN because it is grant-only. The result: every brand-new
 * account with £0 spend silently resolved to OG — auto-granting the crown
 * badge and posting "Reached OG tier!" — directly contradicting /og, which
 * promises OG "cannot be bought... cannot be earned through spending... is
 * reserved exclusively" for pre-hype customers.
 *
 * The fix: spending only ever resolves FREE, VISIBLE tiers. Hidden tiers are
 * grant-only and are assigned through the manual claim path
 * (`tier_source='manual'`), never by a spend threshold.
 *
 * Input ordering: callers pass tiers sorted ascending by `sort_order`
 * (as `getAllTiers` returns them), which for the free/visible ladder
 * coincides with ascending `min_annual_spend` (Bronze → Silver → Gold).
 */

import type { Tier } from "./types";

/**
 * Given all tiers and a user's annual spend, return the highest FREE,
 * VISIBLE tier the spend qualifies for. Hidden tiers (OG) and paid tiers
 * (Platinum, Pro) never participate — they are resolved by grant and
 * subscription respectively. Returns null only when no free, visible tier
 * exists at all.
 */
export function selectSpendingTier(tiers: Tier[], annualSpend: number): Tier | null {
  const eligible = tiers.filter((t) => !t.is_paid && !t.is_hidden);

  let qualified: Tier | null = null;
  for (const tier of eligible) {
    if (annualSpend >= parseFloat(tier.min_annual_spend)) {
      qualified = tier;
    }
  }

  // Below every threshold → fall back to the base (lowest-threshold) free
  // tier. `eligible[0]` is the lowest sort_order = the entry tier (Bronze).
  if (!qualified) qualified = eligible[0] ?? null;

  return qualified;
}
