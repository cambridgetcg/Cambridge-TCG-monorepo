/**
 * Mission Streak Service
 *
 * Tracks consecutive days of mission completion.
 * Rewards customers with XP bonuses for maintaining streaks.
 *
 * Streak Icon Progression:
 * - Days 1-2: sparkle - Building
 * - Days 3-6: star - 10% bonus
 * - Days 7-13: flame - 25% bonus
 * - Days 14-29: zap - 50% bonus (Blazing)
 * - Days 30+: gem - 100% bonus (Legendary)
 */

import prisma from "../db.server";

const LOG_PREFIX = "[MissionStreak]";

// ============================================
// TYPES
// ============================================

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  /** @deprecated Use streakIconId instead */
  streakEmoji: string;
  streakIconId: string | null;
  streakLabel: string;
  bonusPercent: number;
  isNewStreak: boolean;
  streakBroken: boolean;
  lastMissionDate: Date | null;
  daysUntilStreakLoss: number; // Hours until streak expires
}

export interface StreakConfig {
  missionStreakBonusEnabled: boolean;
  missionStreakBonusPercent: number;
  maxMissionStreakBonus: number;
  missionResetHour: number;
}

// Streak icon and bonus tiers
const STREAK_TIERS = [
  { minDays: 30, iconId: "gem", label: "Legendary", bonusPercent: 100 },
  { minDays: 14, iconId: "zap", label: "Blazing", bonusPercent: 50 },
  { minDays: 7, iconId: "flame", label: "On Fire", bonusPercent: 25 },
  { minDays: 3, iconId: "star", label: "Star Streak", bonusPercent: 10 },
  { minDays: 1, iconId: "sparkle", label: "Building", bonusPercent: 0 },
  { minDays: 0, iconId: null, label: "No Streak", bonusPercent: 0 },
];

// ============================================
// STREAK CALCULATION FUNCTIONS
// ============================================

/**
 * Get streak tier info for a given streak count
 */
export function getStreakTier(streakDays: number): {
  iconId: string | null;
  label: string;
  bonusPercent: number;
} {
  for (const tier of STREAK_TIERS) {
    if (streakDays >= tier.minDays) {
      return tier;
    }
  }
  return STREAK_TIERS[STREAK_TIERS.length - 1];
}

/**
 * Calculate streak bonus percentage (capped by maxBonus)
 */
export function calculateStreakBonus(
  streakDays: number,
  basePercent: number,
  maxBonus: number
): number {
  if (streakDays <= 2) return 0;

  const tier = getStreakTier(streakDays);
  return Math.min(tier.bonusPercent, maxBonus);
}

/**
 * Check if date is "today" based on shop's reset hour
 */
export function isToday(
  date: Date,
  resetHour: number,
  _timezone: string = "UTC"
): boolean {
  const now = new Date();
  const resetTime = getResetTimeForDate(now, resetHour);
  const previousReset = new Date(resetTime.getTime() - 24 * 60 * 60 * 1000);

  return date >= previousReset && date < resetTime;
}

/**
 * Check if date is "yesterday" based on shop's reset hour
 */
export function isYesterday(date: Date, resetHour: number): boolean {
  const now = new Date();
  const resetTime = getResetTimeForDate(now, resetHour);
  const previousReset = new Date(resetTime.getTime() - 24 * 60 * 60 * 1000);
  const dayBeforeReset = new Date(previousReset.getTime() - 24 * 60 * 60 * 1000);

  return date >= dayBeforeReset && date < previousReset;
}

/**
 * Get reset time for a given date
 */
function getResetTimeForDate(date: Date, resetHour: number): Date {
  const reset = new Date(date);
  reset.setHours(resetHour, 0, 0, 0);

  // If we're before reset hour, use today's reset
  // If we're after reset hour, use tomorrow's reset
  if (date.getHours() < resetHour) {
    return reset;
  }
  reset.setDate(reset.getDate() + 1);
  return reset;
}

/**
 * Calculate hours until streak would be lost
 */
function calculateHoursUntilStreakLoss(
  lastMissionDate: Date | null,
  resetHour: number
): number {
  if (!lastMissionDate) return 0;

  const now = new Date();
  const resetTime = getResetTimeForDate(now, resetHour);

  // If last mission was today, streak loss is at next reset + 24 hours
  if (isToday(lastMissionDate, resetHour)) {
    const lossTime = new Date(resetTime.getTime() + 24 * 60 * 60 * 1000);
    return Math.max(0, Math.floor((lossTime.getTime() - now.getTime()) / (60 * 60 * 1000)));
  }

  // If last mission was yesterday, streak loss is at current reset
  if (isYesterday(lastMissionDate, resetHour)) {
    return Math.max(0, Math.floor((resetTime.getTime() - now.getTime()) / (60 * 60 * 1000)));
  }

  // Streak already lost
  return 0;
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Get streak configuration for a shop
 */
export async function getStreakConfig(shop: string): Promise<StreakConfig> {
  const config = await prisma.pointsConfig.findUnique({
    where: { shop },
    select: {
      missionStreakBonusEnabled: true,
      missionStreakBonusPercent: true,
      maxMissionStreakBonus: true,
      missionResetHour: true,
    },
  });

  return {
    missionStreakBonusEnabled: config?.missionStreakBonusEnabled ?? true,
    missionStreakBonusPercent: config?.missionStreakBonusPercent ?? 10,
    maxMissionStreakBonus: config?.maxMissionStreakBonus ?? 100,
    missionResetHour: config?.missionResetHour ?? 0,
  };
}

/**
 * Get current streak info for a customer
 */
export async function getStreakInfo(
  shop: string,
  customerId: string
): Promise<StreakInfo> {
  const config = await getStreakConfig(shop);

  const stats = await prisma.customerMissionStats.findUnique({
    where: { customerId },
    select: {
      currentStreak: true,
      longestStreak: true,
      lastMissionDate: true,
    },
  });

  if (!stats) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      streakEmoji: "", // Deprecated
      streakIconId: null,
      streakLabel: "No Streak",
      bonusPercent: 0,
      isNewStreak: false,
      streakBroken: false,
      lastMissionDate: null,
      daysUntilStreakLoss: 0,
    };
  }

  // Check if streak is still valid
  let currentStreak = stats.currentStreak;
  let streakBroken = false;

  if (stats.lastMissionDate) {
    const wasToday = isToday(stats.lastMissionDate, config.missionResetHour);
    const wasYesterday = isYesterday(stats.lastMissionDate, config.missionResetHour);

    if (!wasToday && !wasYesterday) {
      // Streak is broken (more than 1 day gap)
      currentStreak = 0;
      streakBroken = true;
    }
  }

  const tier = getStreakTier(currentStreak);
  const bonusPercent = config.missionStreakBonusEnabled
    ? calculateStreakBonus(
        currentStreak,
        config.missionStreakBonusPercent,
        config.maxMissionStreakBonus
      )
    : 0;

  return {
    currentStreak,
    longestStreak: stats.longestStreak,
    streakEmoji: "", // Deprecated
    streakIconId: tier.iconId,
    streakLabel: tier.label,
    bonusPercent,
    isNewStreak: false,
    streakBroken,
    lastMissionDate: stats.lastMissionDate,
    daysUntilStreakLoss: calculateHoursUntilStreakLoss(
      stats.lastMissionDate,
      config.missionResetHour
    ),
  };
}

/**
 * Update streak after mission completion
 */
export async function updateStreak(
  shop: string,
  customerId: string
): Promise<StreakInfo> {
  const config = await getStreakConfig(shop);

  const stats = await prisma.customerMissionStats.findUnique({
    where: { customerId },
    select: {
      currentStreak: true,
      longestStreak: true,
      lastMissionDate: true,
    },
  });

  if (!stats) {
    // Should not happen - stats should be created when XP is awarded
    console.warn(`${LOG_PREFIX} No mission stats found for customer ${customerId}`);
    return getStreakInfo(shop, customerId);
  }

  const now = new Date();
  let newStreak = stats.currentStreak;
  let isNewStreak = false;
  let streakBroken = false;

  if (!stats.lastMissionDate) {
    // First mission ever - start streak at 1
    newStreak = 1;
    isNewStreak = true;
  } else {
    const wasToday = isToday(stats.lastMissionDate, config.missionResetHour);
    const wasYesterday = isYesterday(stats.lastMissionDate, config.missionResetHour);

    if (wasToday) {
      // Already completed a mission today - streak stays same
      // (No need to update)
    } else if (wasYesterday) {
      // Completed yesterday - increment streak
      newStreak = stats.currentStreak + 1;
      isNewStreak = newStreak === 1;
    } else {
      // Gap in completion - streak resets to 1
      streakBroken = stats.currentStreak > 0;
      newStreak = 1;
      isNewStreak = true;

      if (streakBroken) {
        console.log(
          `${LOG_PREFIX} Streak broken for customer ${customerId}. ` +
            `Was ${stats.currentStreak} days, now reset to 1.`
        );
      }
    }
  }

  // Update longest streak if needed
  const newLongestStreak = Math.max(stats.longestStreak, newStreak);

  // Update database
  await prisma.customerMissionStats.update({
    where: { customerId },
    data: {
      currentStreak: newStreak,
      longestStreak: newLongestStreak,
      lastMissionDate: now,
    },
  });

  const tier = getStreakTier(newStreak);
  const bonusPercent = config.missionStreakBonusEnabled
    ? calculateStreakBonus(
        newStreak,
        config.missionStreakBonusPercent,
        config.maxMissionStreakBonus
      )
    : 0;

  console.log(
    `${LOG_PREFIX} Updated streak for customer ${customerId}: ${stats.currentStreak} -> ${newStreak} ` +
      `(${tier.label}, +${bonusPercent}% bonus)`
  );

  return {
    currentStreak: newStreak,
    longestStreak: newLongestStreak,
    streakEmoji: "", // Deprecated
    streakIconId: tier.iconId,
    streakLabel: tier.label,
    bonusPercent,
    isNewStreak,
    streakBroken,
    lastMissionDate: now,
    daysUntilStreakLoss: calculateHoursUntilStreakLoss(now, config.missionResetHour),
  };
}

/**
 * Reset broken streaks (run daily via cron)
 * This is a maintenance job to update stats for customers who lost their streak
 */
export async function resetBrokenStreaks(shop: string): Promise<number> {
  const config = await getStreakConfig(shop);
  const now = new Date();

  // Calculate the cutoff time - if lastMissionDate is before this, streak is broken
  const resetTime = getResetTimeForDate(now, config.missionResetHour);
  const cutoffTime = new Date(resetTime.getTime() - 24 * 60 * 60 * 1000);

  const result = await prisma.customerMissionStats.updateMany({
    where: {
      shop,
      currentStreak: { gt: 0 },
      lastMissionDate: { lt: cutoffTime },
    },
    data: {
      currentStreak: 0,
    },
  });

  if (result.count > 0) {
    console.log(`${LOG_PREFIX} Reset ${result.count} broken streaks for shop ${shop}`);
  }

  return result.count;
}

/**
 * Get streak leaderboard for a shop
 */
export async function getStreakLeaderboard(
  shop: string,
  limit: number = 10
): Promise<
  Array<{
    customerId: string;
    currentStreak: number;
    longestStreak: number;
    /** @deprecated Use streakIconId instead */
    streakEmoji: string;
    streakIconId: string | null;
    customer: { email: string; firstName: string | null; lastName: string | null } | null;
  }>
> {
  const leaderboard = await prisma.customerMissionStats.findMany({
    where: { shop, currentStreak: { gt: 0 } },
    orderBy: { currentStreak: "desc" },
    take: limit,
    select: {
      customerId: true,
      currentStreak: true,
      longestStreak: true,
      customer: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  return leaderboard.map((entry) => ({
    ...entry,
    streakEmoji: "", // Deprecated
    streakIconId: getStreakTier(entry.currentStreak).iconId,
  }));
}
