/**
 * Mystery Box Psychology Service
 *
 * Orchestrates all psychology features during mystery box interactions.
 * This is the main entry point for psychology-enhanced box opening.
 *
 * Features orchestrated:
 * - Daily streak bonuses (reward multiplier)
 * - Lucky streak (consecutive session opens)
 * - Pity system (guaranteed non-common after N commons)
 * - Bonus events (happy hours, flash discounts)
 * - Activity feed (social proof)
 * - Near-miss calculations
 * - Celebration events
 */

import type { MysteryBoxRarity } from "@prisma/client";
import {
  getMysteryBoxStreak,
  updateMysteryBoxStreak,
  getLuckyStreakInfo,
  getPityInfo,
  canClaimFreeOpen,
  claimFreeOpen,
  calculatePityMinimumRarity,
  type MysteryBoxStreakInfo,
  type LuckyStreakInfo,
  type PityInfo,
} from "./mystery-box-streak.server";
import {
  getActiveBonusEvents,
  getBestBonusEvent,
  recordBonusEventUsage,
  calculateDiscountedCost,
  type BonusEventInfo,
} from "./mystery-box-bonus-events.server";
import {
  getActivityFeed,
  logBoxOpen,
  logStreakMilestone,
  logLuckyStreak,
  logPityTriggered,
  logFreeOpenClaimed,
  type ActivityFeedItem,
} from "./mystery-box-activity-feed.server";

const LOG_PREFIX = "[MysteryBoxPsychology]";

// ============================================
// TYPES
// ============================================

export interface PsychologyContext {
  shop: string;
  customerId: string;
  boxId: string;
  boxName: string;
  firstName: string | null;
  lastName: string | null;
  originalCost: number;
  dailyFreeOpens: number;
  pityThreshold: number;
  enableStreakBonuses: boolean;
  enablePitySystem: boolean;
  enableLuckyStreak: boolean;
  enableActivityFeed: boolean;
}

export interface NearMissInfo {
  rewardId: string;
  rewardName: string;
  rarity: string;
  percentageAway: number;
  message: string;
}

export interface CelebrationEvent {
  type:
    | "STREAK_MILESTONE"
    | "LUCKY_STREAK"
    | "PITY_TRIGGERED"
    | "RARE_WIN"
    | "EPIC_WIN"
    | "LEGENDARY_WIN";
  data: Record<string, unknown>;
  message: string;
  /** @deprecated Use iconId instead */
  emoji: string;
  iconId: string;
}

export interface PsychologyBonuses {
  streak: {
    applied: boolean;
    multiplier: number;
    days: number;
  };
  luckyStreak: {
    applied: boolean;
    multiplier: number;
    count: number;
  };
  event: {
    applied: boolean;
    name: string;
    discount: number;
    multiplier: number;
  } | null;
  totalMultiplier: number;
}

export interface BoxOpenResult {
  // Cost modifications
  originalCost: number;
  discountedCost: number;
  discountApplied: number;

  // Bonuses applied
  bonuses: PsychologyBonuses;

  // Pity system
  pityTriggered: boolean;
  minimumRarity: "COMMON" | "UNCOMMON" | "RARE";

  // Celebrations to show
  celebrations: CelebrationEvent[];

  // Near miss (populated after reward selection)
  nearMiss: NearMissInfo | null;

  // Updated streak info
  streakInfo: MysteryBoxStreakInfo;

  // Pity progress
  pityProgress: {
    current: number;
    threshold: number;
    message: string;
  };

  // Bonus event used (if any)
  bonusEventId: string | null;
}

export interface PsychologyDashboard {
  streak: MysteryBoxStreakInfo;
  luckyStreak: LuckyStreakInfo;
  pity: PityInfo;
  bonusEvents: BonusEventInfo[];
  bestBonusEvent: BonusEventInfo | null;
  activities: ActivityFeedItem[];
}

// ============================================
// PRE-OPEN: Calculate bonuses and cost
// ============================================

/**
 * Calculate all bonuses before opening a box
 * Called to show customer what bonuses will apply
 */
export async function calculatePreOpenBonuses(
  context: PsychologyContext
): Promise<{
  discountedCost: number;
  discountPercent: number;
  bonusMultiplier: number;
  streakBonus: number;
  luckyStreakBonus: number;
  eventBonus: BonusEventInfo | null;
  pityWillTrigger: boolean;
  minimumRarity: "COMMON" | "UNCOMMON" | "RARE";
}> {
  const { shop, customerId, boxId, originalCost, pityThreshold } = context;

  // Get streak info
  const streakInfo = await getMysteryBoxStreak(shop, customerId);

  // Get lucky streak
  const luckyStreakInfo = await getLuckyStreakInfo(customerId);

  // Get best bonus event
  const bonusResult = await getBestBonusEvent({ shop, boxId, customerId });

  // Get pity info
  const pityInfo = await getPityInfo(customerId, pityThreshold);

  // Calculate total multiplier
  const streakMultiplier = context.enableStreakBonuses
    ? streakInfo.bonusMultiplier
    : 1;
  const luckyStreakMultiplier =
    context.enableLuckyStreak && luckyStreakInfo.isActive
      ? luckyStreakInfo.multiplier
      : 1;
  const eventMultiplier = bonusResult.bonusMultiplier;

  const totalMultiplier = streakMultiplier * luckyStreakMultiplier * eventMultiplier;

  // Calculate discounted cost
  const discountedCost = calculateDiscountedCost(
    originalCost,
    bonusResult.discountPercent
  );

  return {
    discountedCost,
    discountPercent: bonusResult.discountPercent,
    bonusMultiplier: totalMultiplier,
    streakBonus: Math.round((streakMultiplier - 1) * 100),
    luckyStreakBonus: Math.round((luckyStreakMultiplier - 1) * 100),
    eventBonus: bonusResult.event,
    pityWillTrigger: pityInfo.willTrigger,
    minimumRarity: pityInfo.minimumRarity,
  };
}

// ============================================
// OPEN: Process psychology during box open
// ============================================

/**
 * Process all psychology features when a box is opened
 * Returns bonuses to apply and celebrations to show
 */
export async function processPsychologyOnOpen(
  context: PsychologyContext,
  wonRarity: MysteryBoxRarity,
  wonRewardName: string
): Promise<BoxOpenResult> {
  const {
    shop,
    customerId,
    boxId,
    boxName,
    firstName,
    lastName,
    originalCost,
    pityThreshold,
    enableStreakBonuses,
    enablePitySystem,
    enableLuckyStreak,
    enableActivityFeed,
  } = context;

  const celebrations: CelebrationEvent[] = [];
  let bonusEventId: string | null = null;

  // 1. Get bonus event and calculate cost
  const bonusResult = await getBestBonusEvent({ shop, boxId, customerId });
  const discountedCost = calculateDiscountedCost(
    originalCost,
    bonusResult.discountPercent
  );

  if (bonusResult.event) {
    bonusEventId = bonusResult.event.id;
    await recordBonusEventUsage({
      eventId: bonusResult.event.id,
      customerId,
      shop,
    });
  }

  // 2. Update streak and get info
  const { streakInfo, streakMilestone, luckyStreakInfo, pityTriggered } =
    await updateMysteryBoxStreak(shop, customerId, wonRarity);

  // 3. Build celebrations
  // Streak milestone celebration
  if (streakMilestone && enableStreakBonuses) {
    celebrations.push({
      type: "STREAK_MILESTONE",
      data: { days: streakMilestone },
      message: `${streakMilestone}-day streak!`,
      emoji: "", // Deprecated
      iconId: "flame",
    });

    if (enableActivityFeed) {
      await logStreakMilestone({
        boxId,
        shop,
        customerId,
        firstName,
        lastName,
        streakDays: streakMilestone,
      });
    }
  }

  // Lucky streak celebration
  if (luckyStreakInfo.count >= 2 && enableLuckyStreak) {
    celebrations.push({
      type: "LUCKY_STREAK",
      data: { count: luckyStreakInfo.count },
      message: luckyStreakInfo.message,
      emoji: "", // Deprecated
      iconId: "zap",
    });

    if (enableActivityFeed && luckyStreakInfo.count === 3) {
      await logLuckyStreak({
        boxId,
        shop,
        customerId,
        firstName,
        lastName,
        luckyStreakCount: luckyStreakInfo.count,
      });
    }
  }

  // Pity triggered celebration
  if (pityTriggered && enablePitySystem) {
    celebrations.push({
      type: "PITY_TRIGGERED",
      data: { rarity: wonRarity },
      message: "Luck protection activated!",
      emoji: "", // Deprecated
      iconId: "gift",
    });

    if (enableActivityFeed) {
      await logPityTriggered({
        boxId,
        shop,
        customerId,
        firstName,
        lastName,
        rewardName: wonRewardName,
        rarity: wonRarity,
      });
    }
  }

  // Rarity-based celebration
  if (wonRarity === "LEGENDARY") {
    celebrations.push({
      type: "LEGENDARY_WIN",
      data: { rewardName: wonRewardName },
      message: `LEGENDARY: ${wonRewardName}!`,
      emoji: "", // Deprecated
      iconId: "gem",
    });
  } else if (wonRarity === "EPIC") {
    celebrations.push({
      type: "EPIC_WIN",
      data: { rewardName: wonRewardName },
      message: `EPIC: ${wonRewardName}!`,
      emoji: "", // Deprecated
      iconId: "sparkle",
    });
  } else if (wonRarity === "RARE") {
    celebrations.push({
      type: "RARE_WIN",
      data: { rewardName: wonRewardName },
      message: `RARE: ${wonRewardName}!`,
      emoji: "", // Deprecated
      iconId: "star",
    });
  }

  // 4. Log activity for social proof
  if (enableActivityFeed) {
    await logBoxOpen({
      boxId,
      shop,
      customerId,
      firstName,
      lastName,
      rewardName: wonRewardName,
      rarity: wonRarity,
      boxName,
    });
  }

  // 5. Build bonuses summary
  const streakMultiplier = enableStreakBonuses ? streakInfo.bonusMultiplier : 1;
  const luckyMultiplier =
    enableLuckyStreak && luckyStreakInfo.isActive
      ? luckyStreakInfo.multiplier
      : 1;

  const bonuses: PsychologyBonuses = {
    streak: {
      applied: enableStreakBonuses && streakInfo.bonusPercent > 0,
      multiplier: streakMultiplier,
      days: streakInfo.currentStreak,
    },
    luckyStreak: {
      applied: enableLuckyStreak && luckyStreakInfo.count >= 2,
      multiplier: luckyMultiplier,
      count: luckyStreakInfo.count,
    },
    event: bonusResult.event
      ? {
          applied: true,
          name: bonusResult.event.name,
          discount: bonusResult.discountPercent,
          multiplier: bonusResult.bonusMultiplier,
        }
      : null,
    totalMultiplier: streakMultiplier * luckyMultiplier * bonusResult.bonusMultiplier,
  };

  // 6. Get pity progress for display
  const pityInfo = await getPityInfo(customerId, pityThreshold);
  const opensUntilPity = Math.max(0, pityThreshold - pityInfo.commonsSinceRare);

  return {
    originalCost,
    discountedCost,
    discountApplied: originalCost - discountedCost,
    bonuses,
    pityTriggered,
    minimumRarity: calculatePityMinimumRarity(
      pityInfo.commonsSinceRare,
      pityThreshold
    ),
    celebrations,
    nearMiss: null, // Populated by caller
    streakInfo,
    pityProgress: {
      current: pityInfo.commonsSinceRare,
      threshold: pityThreshold,
      message:
        opensUntilPity > 0
          ? `${opensUntilPity} more opens until guaranteed Uncommon+`
          : "Next open guarantees Uncommon+!",
    },
    bonusEventId,
  };
}

// ============================================
// NEAR-MISS CALCULATION
// ============================================

/**
 * Calculate near-miss reward for psychology effect
 * Shows what customer "almost" won to encourage retry
 */
export function calculateNearMiss(
  wonRarity: MysteryBoxRarity,
  availableRewards: Array<{
    id: string;
    name: string;
    rarity: MysteryBoxRarity;
    probability: number;
  }>,
  randomValue: number
): NearMissInfo | null {
  // Only show near-miss if won a lower rarity
  const rarityOrder: MysteryBoxRarity[] = [
    "COMMON",
    "UNCOMMON",
    "RARE",
    "EPIC",
    "LEGENDARY",
  ];
  const wonIndex = rarityOrder.indexOf(wonRarity);

  // Find the next higher rarity reward
  const higherRarityRewards = availableRewards.filter(
    (r) => rarityOrder.indexOf(r.rarity) > wonIndex
  );

  if (higherRarityRewards.length === 0) return null;

  // Sort by probability (most likely higher rarity first)
  higherRarityRewards.sort((a, b) => b.probability - a.probability);

  // Calculate how close they were to winning the next tier
  const nextReward = higherRarityRewards[0];

  // Calculate cumulative probability up to the won reward
  let cumulativeToWon = 0;
  for (const reward of availableRewards) {
    if (rarityOrder.indexOf(reward.rarity) <= wonIndex) {
      cumulativeToWon += reward.probability;
    }
  }

  // If random value was close to the threshold, show near-miss
  const threshold = cumulativeToWon / 100;
  const percentageAway = Math.round((threshold - randomValue) * 100 * 10) / 10;

  // Only show if within 10%
  if (percentageAway > 10) return null;

  return {
    rewardId: nextReward.id,
    rewardName: nextReward.name,
    rarity: nextReward.rarity,
    percentageAway: Math.abs(percentageAway),
    message: `So close! You were ${Math.abs(percentageAway).toFixed(1)}% away from ${nextReward.rarity}!`,
  };
}

// ============================================
// DASHBOARD: Get all psychology state
// ============================================

/**
 * Get complete psychology dashboard for a customer
 */
export async function getPsychologyDashboard(params: {
  shop: string;
  customerId: string;
  boxId?: string;
  pityThreshold?: number;
}): Promise<PsychologyDashboard> {
  const { shop, customerId, boxId, pityThreshold = 10 } = params;

  const [streakInfo, luckyStreakInfo, pityInfo, bonusEvents, bonusResult, activities] =
    await Promise.all([
      getMysteryBoxStreak(shop, customerId),
      getLuckyStreakInfo(customerId),
      getPityInfo(customerId, pityThreshold),
      getActiveBonusEvents({ shop, boxId }),
      getBestBonusEvent({ shop, boxId, customerId }),
      getActivityFeed({ shop, boxId, limit: 10 }),
    ]);

  return {
    streak: streakInfo,
    luckyStreak: luckyStreakInfo,
    pity: pityInfo,
    bonusEvents,
    bestBonusEvent: bonusResult.event,
    activities,
  };
}

// ============================================
// FREE OPEN
// ============================================

/**
 * Process a free box open
 */
export async function processFreeOpen(
  context: PsychologyContext
): Promise<{ success: boolean; error?: string }> {
  const { shop, customerId, boxId, firstName, lastName, dailyFreeOpens, enableActivityFeed } =
    context;

  // Check eligibility
  const canClaim = await canClaimFreeOpen(customerId, dailyFreeOpens);
  if (!canClaim) {
    return { success: false, error: "No free opens available today" };
  }

  // Claim the free open
  const result = await claimFreeOpen(shop, customerId, dailyFreeOpens);
  if (!result.success) {
    return result;
  }

  // Log activity
  if (enableActivityFeed) {
    await logFreeOpenClaimed({
      boxId,
      shop,
      customerId,
      firstName,
      lastName,
    });
  }

  console.log(`${LOG_PREFIX} Customer ${customerId} claimed free open`);

  return { success: true };
}
