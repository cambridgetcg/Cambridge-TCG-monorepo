/**
 * Mystery Box Streak Service
 *
 * Tracks consecutive days of mystery box engagement.
 * Rewards customers with bonus multipliers on rewards for maintaining streaks.
 *
 * Streak Icon Progression:
 * - Days 1-2: sparkle - Building
 * - Days 3-6: star - 10% bonus
 * - Days 7-13: flame - 25% bonus
 * - Days 14-29: zap - 50% bonus (Blazing)
 * - Days 30+: gem - 100% bonus (Legendary)
 *
 * Also handles:
 * - Daily free opens for habit formation
 * - Lucky streak (consecutive opens in session)
 * - Pity system (guaranteed non-common after N commons)
 */

import prisma from "../db.server";

const LOG_PREFIX = "[MysteryBoxStreak]";

// ============================================
// TYPES
// ============================================

export interface MysteryBoxStreakInfo {
  currentStreak: number;
  longestStreak: number;
  /** @deprecated Use streakIconId instead */
  streakEmoji: string;
  streakIconId: string | null;
  streakLabel: string;
  bonusMultiplier: number; // e.g., 1.25 for 25% bonus
  bonusPercent: number; // e.g., 25 for display
  isNewStreak: boolean;
  streakBroken: boolean;
  lastOpenDate: Date | null;
  hoursUntilStreakLoss: number;
  // Free open tracking
  freeOpensAvailable: number;
  freeOpensUsedToday: number;
  canClaimFreeOpen: boolean;
  // Lucky streak (session-based)
  luckyStreakCount: number;
  luckyStreakMultiplier: number;
  luckyStreakActive: boolean;
  // Pity system
  commonsSinceRare: number;
  pityThreshold: number;
  pityProgress: number; // 0-100%
  pityTriggered: boolean;
}

export interface LuckyStreakInfo {
  count: number;
  multiplier: number;
  isActive: boolean;
  message: string;
}

export interface PityInfo {
  commonsSinceRare: number;
  threshold: number;
  progress: number;
  willTrigger: boolean;
  minimumRarity: 'COMMON' | 'UNCOMMON' | 'RARE';
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

// Lucky streak bonuses (consecutive opens in session)
const LUCKY_STREAK_TIERS = [
  { minOpens: 5, multiplier: 1.5, message: "On fire! Max bonus!" },
  { minOpens: 4, multiplier: 1.35, message: "Lucky streak x4!" },
  { minOpens: 3, multiplier: 1.2, message: "Lucky streak x3!" },
  { minOpens: 2, multiplier: 1.1, message: "Lucky streak x2!" },
  { minOpens: 1, multiplier: 1.0, message: "" },
];

// Lucky streak timeout (30 minutes)
const LUCKY_STREAK_TIMEOUT_MS = 30 * 60 * 1000;

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
 * Calculate streak bonus multiplier (e.g., 1.25 for 25% bonus)
 */
export function calculateStreakMultiplier(
  streakDays: number,
  maxBonus: number = 100
): number {
  const tier = getStreakTier(streakDays);
  const bonusPercent = Math.min(tier.bonusPercent, maxBonus);
  return 1 + bonusPercent / 100;
}

/**
 * Get lucky streak info for consecutive opens
 */
export function getLuckyStreakTier(openCount: number): {
  multiplier: number;
  message: string;
} {
  for (const tier of LUCKY_STREAK_TIERS) {
    if (openCount >= tier.minOpens) {
      return tier;
    }
  }
  return LUCKY_STREAK_TIERS[LUCKY_STREAK_TIERS.length - 1];
}

/**
 * Check if date is "today" based on UTC midnight
 */
export function isToday(date: Date): boolean {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

  return date >= todayStart && date < tomorrowStart;
}

/**
 * Check if date was "yesterday" based on UTC midnight
 */
export function isYesterday(date: Date): boolean {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

  return date >= yesterdayStart && date < todayStart;
}

/**
 * Calculate hours until streak is lost (next midnight UTC + 24h grace)
 */
export function calculateHoursUntilStreakLoss(lastOpenDate: Date | null): number {
  if (!lastOpenDate) return 0;

  const now = new Date();
  const nextMidnight = new Date(lastOpenDate);
  nextMidnight.setUTCHours(0, 0, 0, 0);
  nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 2); // 24h grace period

  const msRemaining = nextMidnight.getTime() - now.getTime();
  return Math.max(0, Math.ceil(msRemaining / (60 * 60 * 1000)));
}

/**
 * Calculate pity system minimum rarity
 */
export function calculatePityMinimumRarity(
  commonsSinceRare: number,
  threshold: number
): 'COMMON' | 'UNCOMMON' | 'RARE' {
  if (commonsSinceRare >= threshold * 2) {
    return 'RARE';
  }
  if (commonsSinceRare >= threshold) {
    return 'UNCOMMON';
  }
  return 'COMMON';
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Get or create mystery box streak record for customer
 */
export async function getMysteryBoxStreak(
  shop: string,
  customerId: string
): Promise<MysteryBoxStreakInfo> {
  let streak = await prisma.mysteryBoxStreak.findUnique({
    where: { customerId },
  });

  if (!streak) {
    streak = await prisma.mysteryBoxStreak.create({
      data: {
        shop,
        customerId,
        currentStreak: 0,
        longestStreak: 0,
        luckyStreakCount: 0,
        commonsSinceRare: 0,
        freeOpensUsedToday: 0,
      },
    });
  }

  // Check if lucky streak has timed out
  const luckyStreakActive = streak.luckyStreakUpdatedAt
    ? Date.now() - streak.luckyStreakUpdatedAt.getTime() < LUCKY_STREAK_TIMEOUT_MS
    : false;

  const currentLuckyStreak = luckyStreakActive ? streak.luckyStreakCount : 0;
  const luckyTier = getLuckyStreakTier(currentLuckyStreak);

  // Check if streak was broken
  const streakBroken =
    streak.lastOpenDate &&
    !isToday(streak.lastOpenDate) &&
    !isYesterday(streak.lastOpenDate);

  const effectiveStreak = streakBroken ? 0 : streak.currentStreak;
  const tier = getStreakTier(effectiveStreak);

  // Check free opens (reset if last used was not today)
  const freeOpensUsedToday =
    streak.freeOpenLastUsedAt && isToday(streak.freeOpenLastUsedAt)
      ? streak.freeOpensUsedToday
      : 0;

  // Default daily free opens (will be overridden by box config)
  const dailyFreeOpens = 1;
  const freeOpensAvailable = Math.max(0, dailyFreeOpens - freeOpensUsedToday);

  // Pity system
  const pityThreshold = 10; // Default, will be overridden by box config
  const pityProgress = Math.min(100, (streak.commonsSinceRare / pityThreshold) * 100);

  return {
    currentStreak: effectiveStreak,
    longestStreak: streak.longestStreak,
    streakEmoji: "", // Deprecated
    streakIconId: tier.iconId,
    streakLabel: tier.label,
    bonusMultiplier: 1 + tier.bonusPercent / 100,
    bonusPercent: tier.bonusPercent,
    isNewStreak: effectiveStreak === 1,
    streakBroken: !!streakBroken,
    lastOpenDate: streak.lastOpenDate,
    hoursUntilStreakLoss: calculateHoursUntilStreakLoss(streak.lastOpenDate),
    freeOpensAvailable,
    freeOpensUsedToday,
    canClaimFreeOpen: freeOpensAvailable > 0,
    luckyStreakCount: currentLuckyStreak,
    luckyStreakMultiplier: luckyTier.multiplier,
    luckyStreakActive,
    commonsSinceRare: streak.commonsSinceRare,
    pityThreshold,
    pityProgress,
    pityTriggered: streak.commonsSinceRare >= pityThreshold,
  };
}

/**
 * Get lucky streak info for a customer
 */
export async function getLuckyStreakInfo(
  customerId: string
): Promise<LuckyStreakInfo> {
  const streak = await prisma.mysteryBoxStreak.findUnique({
    where: { customerId },
  });

  if (!streak) {
    return {
      count: 0,
      multiplier: 1.0,
      isActive: false,
      message: "",
    };
  }

  const isActive = streak.luckyStreakUpdatedAt
    ? Date.now() - streak.luckyStreakUpdatedAt.getTime() < LUCKY_STREAK_TIMEOUT_MS
    : false;

  const count = isActive ? streak.luckyStreakCount : 0;
  const tier = getLuckyStreakTier(count);

  return {
    count,
    multiplier: tier.multiplier,
    isActive,
    message: tier.message,
  };
}

/**
 * Get pity system info for a customer
 */
export async function getPityInfo(
  customerId: string,
  pityThreshold: number = 10
): Promise<PityInfo> {
  const streak = await prisma.mysteryBoxStreak.findUnique({
    where: { customerId },
  });

  const commonsSinceRare = streak?.commonsSinceRare ?? 0;
  const progress = Math.min(100, (commonsSinceRare / pityThreshold) * 100);
  const willTrigger = commonsSinceRare >= pityThreshold;
  const minimumRarity = calculatePityMinimumRarity(commonsSinceRare, pityThreshold);

  return {
    commonsSinceRare,
    threshold: pityThreshold,
    progress,
    willTrigger,
    minimumRarity,
  };
}

/**
 * Update streak after opening a mystery box
 */
export async function updateMysteryBoxStreak(
  shop: string,
  customerId: string,
  wonRarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'
): Promise<{
  streakInfo: MysteryBoxStreakInfo;
  streakMilestone: number | null;
  luckyStreakInfo: LuckyStreakInfo;
  pityTriggered: boolean;
}> {
  const now = new Date();

  // Get or create streak record
  let streak = await prisma.mysteryBoxStreak.findUnique({
    where: { customerId },
  });

  if (!streak) {
    streak = await prisma.mysteryBoxStreak.create({
      data: {
        shop,
        customerId,
        currentStreak: 0,
        longestStreak: 0,
        luckyStreakCount: 0,
        commonsSinceRare: 0,
        freeOpensUsedToday: 0,
      },
    });
  }

  // Calculate new daily streak
  let newStreak = streak.currentStreak;
  let isNewDay = false;

  if (!streak.lastOpenDate) {
    // First ever open
    newStreak = 1;
    isNewDay = true;
  } else if (isToday(streak.lastOpenDate)) {
    // Already opened today - no change to daily streak
    isNewDay = false;
  } else if (isYesterday(streak.lastOpenDate)) {
    // Opened yesterday - continue streak
    newStreak = streak.currentStreak + 1;
    isNewDay = true;
  } else {
    // Streak broken - start over
    newStreak = 1;
    isNewDay = true;
  }

  // Check for streak milestone
  const streakMilestones = [3, 7, 14, 30, 50, 100];
  const streakMilestone = isNewDay && streakMilestones.includes(newStreak) ? newStreak : null;

  // Update lucky streak (session-based)
  const luckyStreakActive = streak.luckyStreakUpdatedAt
    ? Date.now() - streak.luckyStreakUpdatedAt.getTime() < LUCKY_STREAK_TIMEOUT_MS
    : false;

  const newLuckyStreak = luckyStreakActive ? streak.luckyStreakCount + 1 : 1;

  // Update pity counter
  const isCommon = wonRarity === 'COMMON';
  const newCommonsSinceRare = isCommon ? streak.commonsSinceRare + 1 : 0;
  const pityWasTriggered = streak.commonsSinceRare >= 10 && !isCommon;

  // Update database
  const updatedStreak = await prisma.mysteryBoxStreak.update({
    where: { customerId },
    data: {
      currentStreak: newStreak,
      longestStreak: Math.max(newStreak, streak.longestStreak),
      lastOpenDate: now,
      streakStartDate: newStreak === 1 ? now : streak.streakStartDate,
      luckyStreakCount: newLuckyStreak,
      luckyStreakUpdatedAt: now,
      commonsSinceRare: newCommonsSinceRare,
    },
  });

  // Build response
  const tier = getStreakTier(newStreak);
  const luckyTier = getLuckyStreakTier(newLuckyStreak);

  const streakInfo: MysteryBoxStreakInfo = {
    currentStreak: newStreak,
    longestStreak: updatedStreak.longestStreak,
    streakEmoji: "", // Deprecated
    streakIconId: tier.iconId,
    streakLabel: tier.label,
    bonusMultiplier: 1 + tier.bonusPercent / 100,
    bonusPercent: tier.bonusPercent,
    isNewStreak: newStreak === 1,
    streakBroken: false,
    lastOpenDate: now,
    hoursUntilStreakLoss: calculateHoursUntilStreakLoss(now),
    freeOpensAvailable: 0, // Will be calculated separately
    freeOpensUsedToday: updatedStreak.freeOpensUsedToday,
    canClaimFreeOpen: false,
    luckyStreakCount: newLuckyStreak,
    luckyStreakMultiplier: luckyTier.multiplier,
    luckyStreakActive: true,
    commonsSinceRare: newCommonsSinceRare,
    pityThreshold: 10,
    pityProgress: Math.min(100, (newCommonsSinceRare / 10) * 100),
    pityTriggered: false,
  };

  const luckyStreakInfo: LuckyStreakInfo = {
    count: newLuckyStreak,
    multiplier: luckyTier.multiplier,
    isActive: true,
    message: luckyTier.message,
  };

  return {
    streakInfo,
    streakMilestone,
    luckyStreakInfo,
    pityTriggered: pityWasTriggered,
  };
}

/**
 * Claim a free mystery box open
 */
export async function claimFreeOpen(
  shop: string,
  customerId: string,
  dailyFreeOpens: number
): Promise<{ success: boolean; error?: string }> {
  const streak = await prisma.mysteryBoxStreak.findUnique({
    where: { customerId },
  });

  if (!streak) {
    // Create streak record if it doesn't exist
    await prisma.mysteryBoxStreak.create({
      data: {
        shop,
        customerId,
        currentStreak: 0,
        longestStreak: 0,
        luckyStreakCount: 0,
        commonsSinceRare: 0,
        freeOpensUsedToday: 1,
        freeOpenLastUsedAt: new Date(),
      },
    });
    return { success: true };
  }

  // Check if free opens were used today
  const freeOpensUsedToday =
    streak.freeOpenLastUsedAt && isToday(streak.freeOpenLastUsedAt)
      ? streak.freeOpensUsedToday
      : 0;

  if (freeOpensUsedToday >= dailyFreeOpens) {
    return { success: false, error: "No free opens available today" };
  }

  // Update free opens counter
  await prisma.mysteryBoxStreak.update({
    where: { customerId },
    data: {
      freeOpensUsedToday: freeOpensUsedToday + 1,
      freeOpenLastUsedAt: new Date(),
    },
  });

  console.log(
    `${LOG_PREFIX} Customer ${customerId} claimed free open (${freeOpensUsedToday + 1}/${dailyFreeOpens})`
  );

  return { success: true };
}

/**
 * Check if customer is eligible for a free open
 */
export async function canClaimFreeOpen(
  customerId: string,
  dailyFreeOpens: number
): Promise<boolean> {
  if (dailyFreeOpens <= 0) return false;

  const streak = await prisma.mysteryBoxStreak.findUnique({
    where: { customerId },
  });

  if (!streak) return true; // New customers can claim

  const freeOpensUsedToday =
    streak.freeOpenLastUsedAt && isToday(streak.freeOpenLastUsedAt)
      ? streak.freeOpensUsedToday
      : 0;

  return freeOpensUsedToday < dailyFreeOpens;
}

/**
 * Check if streak is a milestone
 */
export function isStreakMilestone(streakDays: number): boolean {
  const milestones = [3, 7, 14, 30, 50, 100];
  return milestones.includes(streakDays);
}

/**
 * Reset pity counter (called when customer wins non-common)
 */
export async function resetPityCounter(customerId: string): Promise<void> {
  await prisma.mysteryBoxStreak.updateMany({
    where: { customerId },
    data: { commonsSinceRare: 0 },
  });
}

/**
 * Increment pity counter (called when customer wins common)
 */
export async function incrementPityCounter(customerId: string): Promise<number> {
  await prisma.mysteryBoxStreak.updateMany({
    where: { customerId },
    data: { commonsSinceRare: { increment: 1 } },
  });

  const streak = await prisma.mysteryBoxStreak.findUnique({
    where: { customerId },
  });

  return streak?.commonsSinceRare ?? 0;
}
