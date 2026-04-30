/**
 * Mission XP Service
 *
 * Handles experience points (XP) calculations, level progression,
 * and awards for the mission gamification system.
 *
 * XP System Design:
 * - Base XP per level: 100
 * - Level scaling: +20% per level (configurable)
 * - Level 1: 0-99 XP, Level 2: 100-219 XP, Level 3: 220-383 XP, etc.
 */

import prisma from "../db.server";
import type { MissionRarity } from "@prisma/client";

const LOG_PREFIX = "[MissionXP]";

// ============================================
// TYPES
// ============================================

export interface XpAwardResult {
  xpEarned: number; // Base XP from mission
  bonusXp: number; // Bonus from streak + combo
  totalXp: number; // Total after this award
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
  xpToNextLevel: number;
  xpProgress: number; // XP progress within current level
}

export interface XpConfig {
  xpEnabled: boolean;
  xpPerLevel: number;
  xpLevelScaling: number;
}

export interface BonusMultipliers {
  streakBonus: number; // Percentage bonus from streak (0-100)
  comboBonus: number; // Percentage bonus from combo (0-100)
}

// XP rewards by rarity (base values, can be overridden per mission)
const RARITY_BASE_XP: Record<MissionRarity, number> = {
  COMMON: 10,
  UNCOMMON: 20,
  RARE: 35,
  EPIC: 50,
  LEGENDARY: 100,
};

// ============================================
// XP CALCULATION FUNCTIONS
// ============================================

/**
 * Calculate XP required for a specific level
 * Formula: baseXp * (scaling ^ (level - 1))
 */
export function calculateXpForLevel(
  level: number,
  baseXp: number = 100,
  scaling: number = 1.2
): number {
  if (level <= 1) return 0;
  return Math.floor(baseXp * Math.pow(scaling, level - 1));
}

/**
 * Calculate cumulative XP required to reach a level
 */
export function calculateCumulativeXp(
  level: number,
  baseXp: number = 100,
  scaling: number = 1.2
): number {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += calculateXpForLevel(i + 1, baseXp, scaling);
  }
  return total;
}

/**
 * Determine level from total XP
 */
export function calculateLevelFromXp(
  totalXp: number,
  baseXp: number = 100,
  scaling: number = 1.2
): { level: number; xpIntoLevel: number; xpToNextLevel: number } {
  let level = 1;
  let cumulativeXp = 0;

  while (true) {
    const xpForNextLevel = calculateXpForLevel(level + 1, baseXp, scaling);
    if (cumulativeXp + xpForNextLevel > totalXp) {
      break;
    }
    cumulativeXp += xpForNextLevel;
    level++;
  }

  const xpIntoLevel = totalXp - cumulativeXp;
  const xpToNextLevel = calculateXpForLevel(level + 1, baseXp, scaling);

  return { level, xpIntoLevel, xpToNextLevel };
}

/**
 * Calculate XP with bonuses applied
 */
export function calculateBonusXp(
  baseXp: number,
  bonuses: BonusMultipliers
): { bonusXp: number; totalXp: number } {
  const totalBonusPercent = bonuses.streakBonus + bonuses.comboBonus;
  const bonusXp = Math.floor(baseXp * (totalBonusPercent / 100));
  return {
    bonusXp,
    totalXp: baseXp + bonusXp,
  };
}

/**
 * Get base XP for a mission rarity
 */
export function getBaseXpForRarity(rarity: MissionRarity): number {
  return RARITY_BASE_XP[rarity] || RARITY_BASE_XP.COMMON;
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Get XP configuration for a shop
 */
export async function getXpConfig(shop: string): Promise<XpConfig> {
  const config = await prisma.pointsConfig.findUnique({
    where: { shop },
    select: {
      xpEnabled: true,
      xpPerLevel: true,
      xpLevelScaling: true,
    },
  });

  return {
    xpEnabled: config?.xpEnabled ?? true,
    xpPerLevel: config?.xpPerLevel ?? 100,
    xpLevelScaling: config?.xpLevelScaling ? Number(config.xpLevelScaling) : 1.2,
  };
}

/**
 * Get or create CustomerMissionStats for a customer
 */
export async function getOrCreateMissionStats(
  shop: string,
  customerId: string
): Promise<{
  id: string;
  totalXp: number;
  currentLevel: number;
  xpToNextLevel: number;
  currentStreak: number;
  todayComboCount: number;
}> {
  let stats = await prisma.customerMissionStats.findUnique({
    where: { customerId },
    select: {
      id: true,
      totalXp: true,
      currentLevel: true,
      xpToNextLevel: true,
      currentStreak: true,
      todayComboCount: true,
    },
  });

  if (!stats) {
    // Create new stats record (Data API doesn't support select on create)
    const config = await getXpConfig(shop);
    const xpToNextLevelValue = calculateXpForLevel(2, config.xpPerLevel, config.xpLevelScaling);

    // The Aurora Data API adapter doesn't honor Prisma's @default(uuid())
    // — explicitly generate the id, matching the pattern used elsewhere
    // (tier-resolution, tier-calculation, etc).
    const created = await prisma.customerMissionStats.create({
      data: {
        id: crypto.randomUUID(),
        shop,
        customerId,
        totalXp: 0,
        currentLevel: 1,
        xpToNextLevel: xpToNextLevelValue,
        currentStreak: 0,
        longestStreak: 0,
        todayComboCount: 0,
      },
    });

    stats = {
      id: created.id,
      totalXp: 0,
      currentLevel: 1,
      xpToNextLevel: xpToNextLevelValue,
      currentStreak: 0,
      todayComboCount: 0,
    };

    console.log(`${LOG_PREFIX} Created mission stats for customer ${customerId}`);
  }

  return stats;
}

/**
 * Award XP to a customer for completing a mission
 */
export async function awardMissionXp(
  shop: string,
  customerId: string,
  baseXp: number,
  bonuses: BonusMultipliers
): Promise<XpAwardResult> {
  const config = await getXpConfig(shop);

  if (!config.xpEnabled) {
    console.log(`${LOG_PREFIX} XP disabled for shop ${shop}`);
    return {
      xpEarned: 0,
      bonusXp: 0,
      totalXp: 0,
      previousLevel: 1,
      newLevel: 1,
      leveledUp: false,
      xpToNextLevel: config.xpPerLevel,
      xpProgress: 0,
    };
  }

  // Get current stats
  const stats = await getOrCreateMissionStats(shop, customerId);
  const previousLevel = stats.currentLevel;
  const previousXp = stats.totalXp;

  // Calculate XP with bonuses
  const { bonusXp, totalXp: xpToAdd } = calculateBonusXp(baseXp, bonuses);

  // Calculate new level
  const newTotalXp = previousXp + xpToAdd;
  const { level: newLevel, xpIntoLevel, xpToNextLevel } = calculateLevelFromXp(
    newTotalXp,
    config.xpPerLevel,
    config.xpLevelScaling
  );

  const leveledUp = newLevel > previousLevel;

  // Update stats
  await prisma.customerMissionStats.update({
    where: { customerId },
    data: {
      totalXp: newTotalXp,
      currentLevel: newLevel,
      xpToNextLevel,
    },
  });

  console.log(
    `${LOG_PREFIX} Awarded ${xpToAdd} XP (base: ${baseXp}, bonus: ${bonusXp}) to customer ${customerId}. ` +
      `Level: ${previousLevel} -> ${newLevel}${leveledUp ? " (LEVEL UP!)" : ""}`
  );

  return {
    xpEarned: baseXp,
    bonusXp,
    totalXp: newTotalXp,
    previousLevel,
    newLevel,
    leveledUp,
    xpToNextLevel,
    xpProgress: xpIntoLevel,
  };
}

/**
 * Get XP leaderboard for a shop
 */
export async function getXpLeaderboard(
  shop: string,
  limit: number = 10
): Promise<
  Array<{
    customerId: string;
    totalXp: number;
    currentLevel: number;
    customer: { email: string; firstName: string | null; lastName: string | null } | null;
  }>
> {
  const leaderboard = await prisma.customerMissionStats.findMany({
    where: { shop },
    orderBy: { totalXp: "desc" },
    take: limit,
    select: {
      customerId: true,
      totalXp: true,
      currentLevel: true,
      customer: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  return leaderboard;
}

/**
 * Get XP statistics for a shop (analytics)
 */
export async function getXpStats(shop: string): Promise<{
  totalXpAwarded: number;
  averageLevel: number;
  maxLevel: number;
  customersWithXp: number;
}> {
  const stats = await prisma.customerMissionStats.aggregate({
    where: { shop },
    _sum: { totalXp: true },
    _avg: { currentLevel: true },
    _max: { currentLevel: true },
    _count: { id: true },
  });

  return {
    totalXpAwarded: stats._sum.totalXp || 0,
    averageLevel: Math.round((stats._avg.currentLevel || 1) * 10) / 10,
    maxLevel: stats._max.currentLevel || 1,
    customersWithXp: stats._count.id || 0,
  };
}
