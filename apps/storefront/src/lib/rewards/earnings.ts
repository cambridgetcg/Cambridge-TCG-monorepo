// Reward-flow points earning with tier + streak multipliers applied.
//
// Orders go through processOrderRewards() which already applies the tier
// multiplier. The non-order earning paths (mystery box, pack, spin) used
// to write the raw amount, leaving Platinum members and high-streak
// players with no extra reward — fix that by passing them through this
// helper instead of calling earnPoints() directly.
//
// Multiplier composition:
//   final = base × tier.points_multiplier × streak.streak_multiplier
//
// Both multipliers are capped to sane bounds upstream (tier 1-7×, streak
// 1.00-1.50×). The product is floored to int.

import { earnPoints } from "@/lib/membership/db";
import { getStreakMultiplier } from "@/lib/membership/streak";

export interface RewardEarningResult {
  baseAmount: number;
  tierMultiplier: number;
  streakMultiplier: number;
  finalAmount: number;
  entry: Awaited<ReturnType<typeof earnPoints>>;
}

export async function earnRewardPoints(opts: {
  userId: string;
  baseAmount: number;
  type: string;            // 'manual_credit' for reward awards (existing convention)
  description: string;
  referenceId?: string;
  referenceType?: string;
}): Promise<RewardEarningResult> {
  // Membership tiers were removed (2026-07-21) — Berries earn at one flat rate
  // for everyone, still boosted by the daily streak (which is tier-independent).
  const streakMult = await getStreakMultiplier(opts.userId).catch(() => 1);
  const tierMult = 1;
  const streak = streakMult || 1;

  const finalAmount = Math.max(0, Math.floor(opts.baseAmount * tierMult * streak));

  // Annotate description so the customer's history shows why it's higher
  // than the raw reward value.
  const multNote = streak > 1 ? ` (×${streak.toFixed(2)} streak)` : "";
  const description = opts.description + multNote;

  const entry = await earnPoints(
    opts.userId,
    finalAmount,
    opts.type,
    description,
    opts.referenceId,
    opts.referenceType,
  );

  return {
    baseAmount: opts.baseAmount,
    tierMultiplier: tierMult,
    streakMultiplier: streak,
    finalAmount,
    entry,
  };
}
