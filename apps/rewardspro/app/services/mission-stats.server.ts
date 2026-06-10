/**
 * Mission Stats Service
 *
 * Orchestrates mission completion flow and provides comprehensive
 * player statistics for the storefront widget.
 *
 * This service coordinates:
 * - XP awards and level progression
 * - Streak tracking
 * - Combo bonuses
 * - Event creation for animations
 */

import prisma from "../db.server";
import type { MissionCadence, MissionRarity, MissionCategory } from "@prisma/client";

import {
  awardMissionXp,
  getOrCreateMissionStats,
  getBaseXpForRarity,
  calculateLevelFromXp,
  getXpConfig,
  type XpAwardResult,
} from "./mission-xp.server";

import {
  updateStreak,
  getStreakInfo,
  type StreakInfo,
} from "./mission-streak.server";

import {
  incrementCombo,
  getComboInfo,
  type ComboInfo,
} from "./mission-combo.server";

import {
  createCompletionEvent,
  getUnacknowledgedEvents,
  type MissionEvent,
} from "./mission-events.server";

const LOG_PREFIX = "[MissionStats]";

// ============================================
// TYPES
// ============================================

export interface PlayerStats {
  // XP & Level
  xp: number;
  level: number;
  xpProgress: number; // XP into current level
  xpToNextLevel: number;
  xpProgressPercent: number; // 0-100

  // Streak
  streak: number;
  streakEmoji: string;
  streakLabel: string;
  streakBonus: number; // Percentage
  hoursUntilStreakLoss: number;

  // Combo
  todayComboCount: number;
  comboBonus: number; // Percentage
  nextComboBonus: number;
  isMaxCombo: boolean;

  // Totals
  totalCompleted: number;
  dailyCompleted: number;
  weeklyCompleted: number;
  monthlyCompleted: number;
}

export interface MissionData {
  id: string;
  name: string;
  description: string | null;
  iconEmoji: string | null;
  imageUrl: string | null;
  cadence: MissionCadence;
  rarity: MissionRarity;
  category: MissionCategory;
  objective: {
    type: string;
    target: number;
    current: number;
    percent: number;
  };
  reward: {
    type: string;
    description: string;
  };
  xpReward: number;
  endsAt: Date | null;
  timeRemaining: string | null;
  status: "AVAILABLE" | "IN_PROGRESS" | "COMPLETED" | "CLAIMED";
  isEligible: boolean;
}

export interface MissionsResponse {
  player: PlayerStats;
  missions: {
    daily: MissionData[];
    weekly: MissionData[];
    monthly: MissionData[];
    special: MissionData[];
  };
  pendingEvents: MissionEvent[];
}

export interface MissionCompletionResult {
  success: boolean;
  xpResult: XpAwardResult;
  streakInfo: StreakInfo;
  comboInfo: ComboInfo;
  event: MissionEvent;
}

// ============================================
// PLAYER STATS FUNCTIONS
// ============================================

/**
 * Get comprehensive player stats for storefront display
 */
export async function getPlayerStats(
  shop: string,
  customerId: string
): Promise<PlayerStats> {
  const stats = await getOrCreateMissionStats(shop, customerId);
  const config = await getXpConfig(shop);
  const streakInfo = await getStreakInfo(shop, customerId);
  const comboInfo = await getComboInfo(shop, customerId);

  // Calculate XP progress
  const { xpIntoLevel, xpToNextLevel } = calculateLevelFromXp(
    stats.totalXp,
    config.xpPerLevel,
    config.xpLevelScaling
  );

  const xpProgressPercent = xpToNextLevel > 0
    ? Math.round((xpIntoLevel / xpToNextLevel) * 100)
    : 100;

  // Get full stats including mission counts
  const fullStats = await prisma.customerMissionStats.findUnique({
    where: { customerId },
    select: {
      totalCompleted: true,
      dailyCompleted: true,
      weeklyCompleted: true,
      monthlyCompleted: true,
    },
  });

  return {
    xp: stats.totalXp,
    level: stats.currentLevel,
    xpProgress: xpIntoLevel,
    xpToNextLevel,
    xpProgressPercent,
    streak: streakInfo.currentStreak,
    streakEmoji: streakInfo.streakEmoji,
    streakLabel: streakInfo.streakLabel,
    streakBonus: streakInfo.bonusPercent,
    hoursUntilStreakLoss: streakInfo.daysUntilStreakLoss,
    todayComboCount: comboInfo.todayComboCount,
    comboBonus: comboInfo.bonusPercent,
    nextComboBonus: comboInfo.nextBonusPercent,
    isMaxCombo: comboInfo.isMaxCombo,
    totalCompleted: fullStats?.totalCompleted ?? 0,
    dailyCompleted: fullStats?.dailyCompleted ?? 0,
    weeklyCompleted: fullStats?.weeklyCompleted ?? 0,
    monthlyCompleted: fullStats?.monthlyCompleted ?? 0,
  };
}

/**
 * Get missions organized by cadence for storefront display
 */
export async function getMissionsForCustomer(
  shop: string,
  customerId: string
): Promise<MissionsResponse> {
  // Get player stats
  const player = await getPlayerStats(shop, customerId);

  // Get pending events for animations
  const pendingEvents = await getUnacknowledgedEvents(shop, customerId);

  // Get customer's current tier for eligibility checks
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });

  // Get active challenges (Data API doesn't support include, so fetch separately)
  const now = new Date();
  const challenges = await prisma.challenge.findMany({
    where: {
      shop,
      status: "ACTIVE",
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    orderBy: { sortOrder: "asc" },
  });

  // Fetch rewards and participants for each challenge
  const challengeIds = challenges.map((c: { id: string }) => c.id);

  const [rewards, participants] = await Promise.all([
    challengeIds.length > 0
      ? prisma.challengeReward.findMany({
          where: { challengeId: { in: challengeIds } },
        })
      : [],
    challengeIds.length > 0
      ? prisma.challengeParticipant.findMany({
          where: { challengeId: { in: challengeIds }, customerId },
        })
      : [],
  ]);

  // Create lookup maps with explicit types
  type RewardLookup = { challengeId: string; rewardType: string; description: string };
  type ParticipantLookup = { challengeId: string; status: string; currentProgress: number };

  const rewardMap = new Map<string, RewardLookup>(
    (rewards as RewardLookup[]).map((r) => [r.challengeId, r])
  );
  const participantMap = new Map<string, ParticipantLookup>(
    (participants as ParticipantLookup[]).map((p) => [p.challengeId, p])
  );

  // Transform to MissionData format
  const transformMission = (challenge: {
    id: string;
    name: string;
    description: string | null;
    iconEmoji: string | null;
    imageUrl: string | null;
    cadence: MissionCadence;
    rarity: MissionRarity;
    category: MissionCategory;
    objectiveType: string;
    targetValue: number;
    xpReward: number;
    endsAt: Date | null;
    tierRestrictions: unknown;
  }): MissionData => {
    const reward = rewardMap.get(challenge.id);
    const participant = participantMap.get(challenge.id);
    const timeRemaining = challenge.endsAt
      ? formatTimeRemaining(challenge.endsAt)
      : null;

    // Check tier eligibility
    let isEligible = true;
    if (challenge.tierRestrictions) {
      const restrictions = challenge.tierRestrictions as { allowedTierIds?: string[] };
      if (restrictions.allowedTierIds && restrictions.allowedTierIds.length > 0) {
        isEligible = customer?.currentTierId
          ? restrictions.allowedTierIds.includes(customer.currentTierId)
          : false;
      }
    }

    let status: MissionData["status"] = "AVAILABLE";
    let currentProgress = 0;

    if (participant) {
      switch (participant.status) {
        case "IN_PROGRESS":
          status = "IN_PROGRESS";
          currentProgress = participant.currentProgress;
          break;
        case "COMPLETED":
          status = "COMPLETED";
          currentProgress = challenge.targetValue;
          break;
        case "CLAIMED":
          status = "CLAIMED";
          currentProgress = challenge.targetValue;
          break;
      }
    }

    return {
      id: challenge.id,
      name: challenge.name,
      description: challenge.description,
      iconEmoji: challenge.iconEmoji,
      imageUrl: challenge.imageUrl,
      cadence: challenge.cadence,
      rarity: challenge.rarity,
      category: challenge.category,
      objective: {
        type: challenge.objectiveType,
        target: challenge.targetValue,
        current: currentProgress,
        percent: Math.round((currentProgress / challenge.targetValue) * 100),
      },
      reward: {
        type: reward?.rewardType ?? "POINTS",
        description: reward?.description ?? "Reward",
      },
      xpReward: challenge.xpReward,
      endsAt: challenge.endsAt,
      timeRemaining,
      status,
      isEligible,
    };
  };

  // Group by cadence
  const missions: MissionsResponse["missions"] = {
    daily: [],
    weekly: [],
    monthly: [],
    special: [],
  };

  for (const challenge of challenges) {
    const mission = transformMission(challenge);
    switch (challenge.cadence) {
      case "DAILY":
        missions.daily.push(mission);
        break;
      case "WEEKLY":
        missions.weekly.push(mission);
        break;
      case "MONTHLY":
        missions.monthly.push(mission);
        break;
      case "SPECIAL":
        missions.special.push(mission);
        break;
    }
  }

  return {
    player,
    missions,
    pendingEvents,
  };
}

// ============================================
// MISSION COMPLETION FLOW
// ============================================

/**
 * Process mission completion - awards XP, updates streak/combo, creates event
 *
 * This is called AFTER a challenge is marked as completed (objective met).
 * It handles all the gamification aspects.
 */
export async function processMissionCompletion(
  shop: string,
  customerId: string,
  challengeId: string
): Promise<MissionCompletionResult> {
  // Get challenge details (Data API doesn't support include)
  const [challenge, reward] = await Promise.all([
    prisma.challenge.findUnique({ where: { id: challengeId } }),
    prisma.challengeReward.findUnique({ where: { challengeId } }),
  ]);

  if (!challenge) {
    throw new Error(`Challenge not found: ${challengeId}`);
  }

  // Initialize stats if needed
  await getOrCreateMissionStats(shop, customerId);

  // Update streak (if mission is streak-eligible)
  let streakInfo: StreakInfo;
  if (challenge.streakEligible) {
    streakInfo = await updateStreak(shop, customerId);
  } else {
    streakInfo = await getStreakInfo(shop, customerId);
  }

  // Update combo (if mission is combo-eligible)
  let comboInfo: ComboInfo;
  if (challenge.comboEligible) {
    const comboResult = await incrementCombo(shop, customerId);
    // Use the bonus from BEFORE incrementing (for current mission's XP)
    comboInfo = comboResult.previousCombo;
  } else {
    comboInfo = await getComboInfo(shop, customerId);
  }

  // Calculate bonuses
  const bonuses = {
    streakBonus: streakInfo.bonusPercent,
    comboBonus: comboInfo.bonusPercent,
  };

  // Get base XP (from mission or rarity default)
  const baseXp = challenge.xpReward || getBaseXpForRarity(challenge.rarity);

  // Award XP with bonuses
  const xpResult = await awardMissionXp(shop, customerId, baseXp, bonuses);

  // Update mission completion counts
  await updateCompletionCounts(customerId, challenge.cadence);

  // Create completion event for animations
  const event = await createCompletionEvent(
    shop,
    customerId,
    challengeId,
    challenge.name,
    challenge.rarity,
    reward?.description ?? "Reward",
    xpResult,
    streakInfo,
    comboInfo
  );

  console.log(
    `${LOG_PREFIX} Mission completed for customer ${customerId}: ` +
      `${challenge.name} (${challenge.rarity}), +${xpResult.xpEarned + xpResult.bonusXp} XP`
  );

  return {
    success: true,
    xpResult,
    streakInfo,
    comboInfo,
    event,
  };
}

/**
 * Update mission completion counts by cadence
 */
async function updateCompletionCounts(
  customerId: string,
  cadence: MissionCadence
): Promise<void> {
  const updateData: Record<string, { increment: number }> = {
    totalCompleted: { increment: 1 },
  };

  switch (cadence) {
    case "DAILY":
      updateData.dailyCompleted = { increment: 1 };
      break;
    case "WEEKLY":
      updateData.weeklyCompleted = { increment: 1 };
      break;
    case "MONTHLY":
      updateData.monthlyCompleted = { increment: 1 };
      break;
  }

  await prisma.customerMissionStats.update({
    where: { customerId },
    data: updateData,
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format time remaining in human-readable format
 */
function formatTimeRemaining(endDate: Date): string {
  const now = new Date();
  const diff = endDate.getTime() - now.getTime();

  if (diff <= 0) return "Ended";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

// ============================================
// ANALYTICS FUNCTIONS
// ============================================

/**
 * Get mission system analytics for admin dashboard
 */
export async function getMissionAnalytics(shop: string): Promise<{
  totalCustomersWithXp: number;
  totalXpAwarded: number;
  averageLevel: number;
  maxLevel: number;
  activeStreaks: number;
  averageStreak: number;
  longestStreak: number;
  totalMissionsCompleted: number;
  completionsByType: { cadence: string; count: number }[];
}> {
  const [xpStats, streakStats, completionStats] = await Promise.all([
    prisma.customerMissionStats.aggregate({
      where: { shop },
      _sum: { totalXp: true },
      _avg: { currentLevel: true },
      _max: { currentLevel: true },
      _count: { id: true },
    }),
    prisma.customerMissionStats.aggregate({
      where: { shop, currentStreak: { gt: 0 } },
      _count: { id: true },
      _avg: { currentStreak: true },
      _max: { longestStreak: true },
    }),
    prisma.customerMissionStats.aggregate({
      where: { shop },
      _sum: {
        totalCompleted: true,
        dailyCompleted: true,
        weeklyCompleted: true,
        monthlyCompleted: true,
      },
    }),
  ]);

  const specialCompleted =
    (completionStats._sum.totalCompleted ?? 0) -
    (completionStats._sum.dailyCompleted ?? 0) -
    (completionStats._sum.weeklyCompleted ?? 0) -
    (completionStats._sum.monthlyCompleted ?? 0);

  return {
    totalCustomersWithXp: xpStats._count.id ?? 0,
    totalXpAwarded: xpStats._sum.totalXp ?? 0,
    averageLevel: Math.round((xpStats._avg.currentLevel ?? 1) * 10) / 10,
    maxLevel: xpStats._max.currentLevel ?? 1,
    activeStreaks: streakStats._count.id ?? 0,
    averageStreak: Math.round((streakStats._avg.currentStreak ?? 0) * 10) / 10,
    longestStreak: streakStats._max.longestStreak ?? 0,
    totalMissionsCompleted: completionStats._sum.totalCompleted ?? 0,
    completionsByType: [
      { cadence: "DAILY", count: completionStats._sum.dailyCompleted ?? 0 },
      { cadence: "WEEKLY", count: completionStats._sum.weeklyCompleted ?? 0 },
      { cadence: "MONTHLY", count: completionStats._sum.monthlyCompleted ?? 0 },
      { cadence: "SPECIAL", count: specialCompleted },
    ],
  };
}
