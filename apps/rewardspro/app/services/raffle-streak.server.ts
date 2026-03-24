/**
 * Raffle Streak Service
 *
 * Tracks consecutive days of raffle participation.
 * Rewards customers with bonus entries for maintaining streaks.
 *
 * Streak Icon Progression (using vector icons):
 * - Days 1-2: sparkle - Building
 * - Days 3-6: star - 10% bonus
 * - Days 7-13: flame - 25% bonus
 * - Days 14-29: zap - 50% bonus
 * - Days 30+: gem - 100% bonus
 *
 * Also handles daily free entries for habit formation.
 */

import prisma from "../db.server";
import { getStreakIconInfo } from "../utils/points-icon-library";

const LOG_PREFIX = "[RaffleStreak]";

// ============================================
// TYPES
// ============================================

export interface RaffleStreakInfo {
  currentStreak: number;
  longestStreak: number;
  /** @deprecated Use streakIconId instead */
  streakEmoji: string;
  /** Icon ID from the points-icon-library (e.g., "sparkle", "flame", "gem") */
  streakIconId: string | null;
  streakLabel: string;
  bonusMultiplier: number; // e.g., 1.25 for 25% bonus
  bonusPercent: number; // e.g., 25 for display
  isNewStreak: boolean;
  streakBroken: boolean;
  lastEntryDate: Date | null;
  hoursUntilStreakLoss: number;
  // Free entry tracking
  freeEntriesAvailable: number;
  freeEntriesUsedToday: number;
  canClaimFreeEntry: boolean;
}

export interface RaffleStreakConfig {
  streakBonusEnabled: boolean;
  maxStreakBonus: number; // Max bonus percentage (e.g., 100)
  dailyFreeEntries: number; // Free entries per day
  resetHour: number; // Hour of day when streaks reset (0-23)
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
  /** @deprecated Use iconId instead */
  emoji: string;
  iconId: string | null;
  label: string;
  bonusPercent: number;
} {
  for (const tier of STREAK_TIERS) {
    if (streakDays >= tier.minDays) {
      return {
        emoji: "", // Deprecated - always empty
        iconId: tier.iconId,
        label: tier.label,
        bonusPercent: tier.bonusPercent,
      };
    }
  }
  const lastTier = STREAK_TIERS[STREAK_TIERS.length - 1];
  return {
    emoji: "",
    iconId: lastTier.iconId,
    label: lastTier.label,
    bonusPercent: lastTier.bonusPercent,
  };
}

/**
 * Calculate streak bonus multiplier (e.g., 1.25 for 25% bonus)
 */
export function calculateStreakMultiplier(
  streakDays: number,
  maxBonus: number
): number {
  const tier = getStreakTier(streakDays);
  const bonusPercent = Math.min(tier.bonusPercent, maxBonus);
  return 1 + bonusPercent / 100;
}

/**
 * Check if date is "today" based on reset hour
 */
export function isToday(date: Date, resetHour: number): boolean {
  const now = new Date();
  const resetTime = getResetTimeForDate(now, resetHour);
  const previousReset = new Date(resetTime.getTime() - 24 * 60 * 60 * 1000);

  return date >= previousReset && date < resetTime;
}

/**
 * Check if date is "yesterday" based on reset hour
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
  lastEntryDate: Date | null,
  resetHour: number
): number {
  if (!lastEntryDate) return 0;

  const now = new Date();
  const resetTime = getResetTimeForDate(now, resetHour);

  if (isToday(lastEntryDate, resetHour)) {
    const lossTime = new Date(resetTime.getTime() + 24 * 60 * 60 * 1000);
    return Math.max(0, Math.floor((lossTime.getTime() - now.getTime()) / (60 * 60 * 1000)));
  }

  if (isYesterday(lastEntryDate, resetHour)) {
    return Math.max(0, Math.floor((resetTime.getTime() - now.getTime()) / (60 * 60 * 1000)));
  }

  return 0;
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Get default streak configuration
 * In the future, this could be shop-configurable
 */
export async function getStreakConfig(shop: string): Promise<RaffleStreakConfig> {
  // Could be extended to read from PointsConfig or a dedicated RaffleConfig
  return {
    streakBonusEnabled: true,
    maxStreakBonus: 100, // Max 100% bonus
    dailyFreeEntries: 1, // 1 free entry per day by default
    resetHour: 0, // Midnight UTC
  };
}

/**
 * Get or create streak record for a customer
 */
export async function getOrCreateStreakRecord(
  shop: string,
  customerId: string
): Promise<{
  id: string;
  currentStreak: number;
  longestStreak: number;
  lastEntryDate: Date | null;
  streakStartDate: Date | null;
  freeEntriesUsedToday: number;
  freeEntryLastUsedAt: Date | null;
}> {
  let streak = await prisma.raffleStreak.findUnique({
    where: { customerId },
    select: {
      id: true,
      currentStreak: true,
      longestStreak: true,
      lastEntryDate: true,
      streakStartDate: true,
      freeEntriesUsedToday: true,
      freeEntryLastUsedAt: true,
    },
  });

  if (!streak) {
    streak = await prisma.raffleStreak.create({
      data: {
        shop,
        customerId,
        currentStreak: 0,
        longestStreak: 0,
      },
    } as any);
    console.log(`${LOG_PREFIX} Created streak record for customer ${customerId}`);
  }

  return streak;
}

/**
 * Get current streak info for a customer
 */
export async function getRaffleStreakInfo(
  shop: string,
  customerId: string
): Promise<RaffleStreakInfo> {
  const config = await getStreakConfig(shop);
  const streak = await getOrCreateStreakRecord(shop, customerId);

  // Check if streak is still valid
  let currentStreak = streak.currentStreak;
  let streakBroken = false;

  if (streak.lastEntryDate) {
    const wasToday = isToday(streak.lastEntryDate, config.resetHour);
    const wasYesterday = isYesterday(streak.lastEntryDate, config.resetHour);

    if (!wasToday && !wasYesterday) {
      currentStreak = 0;
      streakBroken = true;
    }
  }

  const tier = getStreakTier(currentStreak);
  const bonusPercent = config.streakBonusEnabled
    ? Math.min(tier.bonusPercent, config.maxStreakBonus)
    : 0;

  // Check free entry availability
  const freeEntriesUsedToday = streak.freeEntryLastUsedAt
    ? isToday(streak.freeEntryLastUsedAt, config.resetHour)
      ? streak.freeEntriesUsedToday
      : 0
    : 0;

  const freeEntriesAvailable = Math.max(0, config.dailyFreeEntries - freeEntriesUsedToday);
  const canClaimFreeEntry = freeEntriesAvailable > 0;

  return {
    currentStreak,
    longestStreak: streak.longestStreak,
    streakEmoji: "", // Deprecated
    streakIconId: tier.iconId,
    streakLabel: tier.label,
    bonusMultiplier: 1 + bonusPercent / 100,
    bonusPercent,
    isNewStreak: false,
    streakBroken,
    lastEntryDate: streak.lastEntryDate,
    hoursUntilStreakLoss: calculateHoursUntilStreakLoss(
      streak.lastEntryDate,
      config.resetHour
    ),
    freeEntriesAvailable,
    freeEntriesUsedToday,
    canClaimFreeEntry,
  };
}

/**
 * Update streak after raffle entry
 */
export async function updateRaffleStreak(
  shop: string,
  customerId: string
): Promise<RaffleStreakInfo> {
  const config = await getStreakConfig(shop);
  const streak = await getOrCreateStreakRecord(shop, customerId);

  const now = new Date();
  let newStreak = streak.currentStreak;
  let isNewStreak = false;
  let streakBroken = false;
  let newStreakStartDate = streak.streakStartDate;

  if (!streak.lastEntryDate) {
    // First entry ever - start streak at 1
    newStreak = 1;
    isNewStreak = true;
    newStreakStartDate = now;
  } else {
    const wasToday = isToday(streak.lastEntryDate, config.resetHour);
    const wasYesterday = isYesterday(streak.lastEntryDate, config.resetHour);

    if (wasToday) {
      // Already entered today - streak stays same
    } else if (wasYesterday) {
      // Entered yesterday - increment streak
      newStreak = streak.currentStreak + 1;
      isNewStreak = newStreak === 1;
    } else {
      // Gap in entries - streak resets to 1
      streakBroken = streak.currentStreak > 0;
      newStreak = 1;
      isNewStreak = true;
      newStreakStartDate = now;

      if (streakBroken) {
        console.log(
          `${LOG_PREFIX} Streak broken for customer ${customerId}. ` +
            `Was ${streak.currentStreak} days, now reset to 1.`
        );
      }
    }
  }

  // Update longest streak if needed
  const newLongestStreak = Math.max(streak.longestStreak, newStreak);

  // Update database
  await prisma.raffleStreak.update({
    where: { customerId },
    data: {
      currentStreak: newStreak,
      longestStreak: newLongestStreak,
      lastEntryDate: now,
      streakStartDate: newStreakStartDate,
    },
  });

  const tier = getStreakTier(newStreak);
  const bonusPercent = config.streakBonusEnabled
    ? Math.min(tier.bonusPercent, config.maxStreakBonus)
    : 0;

  console.log(
    `${LOG_PREFIX} Updated streak for customer ${customerId}: ${streak.currentStreak} -> ${newStreak} ` +
      `(${tier.label}, +${bonusPercent}% bonus)`
  );

  // Recalculate free entry status
  const freeEntriesUsedToday = streak.freeEntryLastUsedAt
    ? isToday(streak.freeEntryLastUsedAt, config.resetHour)
      ? streak.freeEntriesUsedToday
      : 0
    : 0;

  return {
    currentStreak: newStreak,
    longestStreak: newLongestStreak,
    streakEmoji: "", // Deprecated
    streakIconId: tier.iconId,
    streakLabel: tier.label,
    bonusMultiplier: 1 + bonusPercent / 100,
    bonusPercent,
    isNewStreak,
    streakBroken,
    lastEntryDate: now,
    hoursUntilStreakLoss: calculateHoursUntilStreakLoss(now, config.resetHour),
    freeEntriesAvailable: Math.max(0, config.dailyFreeEntries - freeEntriesUsedToday),
    freeEntriesUsedToday,
    canClaimFreeEntry: config.dailyFreeEntries > freeEntriesUsedToday,
  };
}

/**
 * Claim a daily free entry
 * Returns the number of free entries claimed (0 if none available)
 */
export async function claimFreeEntry(
  shop: string,
  customerId: string
): Promise<{
  success: boolean;
  entriesClaimed: number;
  message: string;
}> {
  const config = await getStreakConfig(shop);

  if (config.dailyFreeEntries <= 0) {
    return {
      success: false,
      entriesClaimed: 0,
      message: "Free entries are not enabled",
    };
  }

  const streak = await getOrCreateStreakRecord(shop, customerId);
  const now = new Date();

  // Check how many free entries have been used today
  let freeEntriesUsedToday = 0;
  if (streak.freeEntryLastUsedAt && isToday(streak.freeEntryLastUsedAt, config.resetHour)) {
    freeEntriesUsedToday = streak.freeEntriesUsedToday;
  }

  if (freeEntriesUsedToday >= config.dailyFreeEntries) {
    return {
      success: false,
      entriesClaimed: 0,
      message: "You've already claimed your free entry today",
    };
  }

  // Claim the free entry
  await prisma.raffleStreak.update({
    where: { customerId },
    data: {
      freeEntriesUsedToday: freeEntriesUsedToday + 1,
      freeEntryLastUsedAt: now,
    },
  });

  console.log(
    `${LOG_PREFIX} Customer ${customerId} claimed free entry ` +
      `(${freeEntriesUsedToday + 1}/${config.dailyFreeEntries} today)`
  );

  return {
    success: true,
    entriesClaimed: 1,
    message: "Free entry claimed!",
  };
}

/**
 * Check if milestone was reached (for activity feed)
 */
export function isStreakMilestone(streak: number): boolean {
  return [7, 14, 30, 50, 100].includes(streak);
}

/**
 * Reset broken streaks (maintenance job)
 */
export async function resetBrokenStreaks(shop: string): Promise<number> {
  const config = await getStreakConfig(shop);
  const now = new Date();

  const resetTime = getResetTimeForDate(now, config.resetHour);
  const cutoffTime = new Date(resetTime.getTime() - 24 * 60 * 60 * 1000);

  const result = await prisma.raffleStreak.updateMany({
    where: {
      shop,
      currentStreak: { gt: 0 },
      lastEntryDate: { lt: cutoffTime },
    },
    data: {
      currentStreak: 0,
    },
  });

  if (result.count > 0) {
    console.log(`${LOG_PREFIX} Reset ${result.count} broken raffle streaks for shop ${shop}`);
  }

  return result.count;
}

/**
 * Get streak leaderboard for a shop
 */
export async function getRaffleStreakLeaderboard(
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
  const leaderboard = await prisma.raffleStreak.findMany({
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

  return leaderboard.map((entry) => {
    const tier = getStreakTier(entry.currentStreak);
    return {
      ...entry,
      streakEmoji: "", // Deprecated
      streakIconId: tier.iconId,
    };
  });
}
