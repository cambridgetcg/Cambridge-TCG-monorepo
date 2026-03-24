/**
 * Mission Combo Service
 *
 * Tracks daily mission completion combos.
 * Completing multiple missions in the same day grants XP bonuses.
 *
 * Combo Progression (default):
 * - Mission 1: No bonus
 * - Mission 2: +25% XP
 * - Mission 3: +50% XP
 * - Mission 4: +75% XP
 * - Mission 5+: +100% XP (max)
 *
 * Combos reset daily at the shop's configured reset hour.
 */

import prisma from "../db.server";

const LOG_PREFIX = "[MissionCombo]";

// ============================================
// TYPES
// ============================================

export interface ComboInfo {
  todayComboCount: number;
  bonusPercent: number;
  nextBonusPercent: number;
  isMaxCombo: boolean;
  lastComboResetAt: Date | null;
}

export interface ComboConfig {
  comboEnabled: boolean;
  comboBonusPercent: number;
  maxComboBonus: number;
  missionResetHour: number;
}

// ============================================
// COMBO CALCULATION FUNCTIONS
// ============================================

/**
 * Calculate combo bonus percentage
 * First mission = 0%, each additional = +comboBonusPercent (capped at maxComboBonus)
 */
export function calculateComboBonus(
  comboCount: number,
  comboBonusPercent: number,
  maxComboBonus: number
): number {
  if (comboCount <= 1) return 0;

  // Each additional mission after the first adds comboBonusPercent
  const bonus = (comboCount - 1) * comboBonusPercent;
  return Math.min(bonus, maxComboBonus);
}

/**
 * Calculate what the next combo bonus would be
 */
export function calculateNextComboBonus(
  currentComboCount: number,
  comboBonusPercent: number,
  maxComboBonus: number
): number {
  return calculateComboBonus(currentComboCount + 1, comboBonusPercent, maxComboBonus);
}

/**
 * Check if we're still in the same "combo day" based on reset hour
 */
export function isSameComboDay(
  lastReset: Date | null,
  resetHour: number
): boolean {
  if (!lastReset) return false;

  const now = new Date();
  const currentResetTime = getResetTimeForDate(now, resetHour);
  const previousResetTime = new Date(currentResetTime.getTime() - 24 * 60 * 60 * 1000);

  // If last reset was after the previous reset boundary, we're in the same day
  return lastReset >= previousResetTime;
}

/**
 * Get reset time for a given date
 */
function getResetTimeForDate(date: Date, resetHour: number): Date {
  const reset = new Date(date);
  reset.setHours(resetHour, 0, 0, 0);

  // If we're before reset hour, use today's reset
  // If we're after reset hour, we're past today's reset
  if (date.getHours() < resetHour) {
    return reset;
  }
  reset.setDate(reset.getDate() + 1);
  return reset;
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Get combo configuration for a shop
 */
export async function getComboConfig(shop: string): Promise<ComboConfig> {
  const config = await prisma.pointsConfig.findUnique({
    where: { shop },
    select: {
      comboEnabled: true,
      comboBonusPercent: true,
      maxComboBonus: true,
      missionResetHour: true,
    },
  });

  return {
    comboEnabled: config?.comboEnabled ?? true,
    comboBonusPercent: config?.comboBonusPercent ?? 25,
    maxComboBonus: config?.maxComboBonus ?? 100,
    missionResetHour: config?.missionResetHour ?? 0,
  };
}

/**
 * Get current combo info for a customer
 */
export async function getComboInfo(
  shop: string,
  customerId: string
): Promise<ComboInfo> {
  const config = await getComboConfig(shop);

  const stats = await prisma.customerMissionStats.findUnique({
    where: { customerId },
    select: {
      todayComboCount: true,
      lastComboResetAt: true,
    },
  });

  if (!stats) {
    return {
      todayComboCount: 0,
      bonusPercent: 0,
      nextBonusPercent: 0,
      isMaxCombo: false,
      lastComboResetAt: null,
    };
  }

  // Check if combo needs reset (new day)
  let todayComboCount = stats.todayComboCount;
  if (!isSameComboDay(stats.lastComboResetAt, config.missionResetHour)) {
    todayComboCount = 0;
  }

  const bonusPercent = config.comboEnabled
    ? calculateComboBonus(todayComboCount, config.comboBonusPercent, config.maxComboBonus)
    : 0;

  const nextBonusPercent = config.comboEnabled
    ? calculateNextComboBonus(todayComboCount, config.comboBonusPercent, config.maxComboBonus)
    : 0;

  const isMaxCombo = bonusPercent >= config.maxComboBonus;

  return {
    todayComboCount,
    bonusPercent,
    nextBonusPercent,
    isMaxCombo,
    lastComboResetAt: stats.lastComboResetAt,
  };
}

/**
 * Increment combo count after mission completion
 * Returns the combo info BEFORE incrementing (for calculating the bonus on current mission)
 */
export async function incrementCombo(
  shop: string,
  customerId: string
): Promise<{
  previousCombo: ComboInfo;
  newCombo: ComboInfo;
  comboIncremented: boolean;
}> {
  const config = await getComboConfig(shop);

  const stats = await prisma.customerMissionStats.findUnique({
    where: { customerId },
    select: {
      todayComboCount: true,
      lastComboResetAt: true,
    },
  });

  if (!stats) {
    // Should not happen - stats should be created when XP is awarded
    console.warn(`${LOG_PREFIX} No mission stats found for customer ${customerId}`);
    const emptyCombo: ComboInfo = {
      todayComboCount: 0,
      bonusPercent: 0,
      nextBonusPercent: 0,
      isMaxCombo: false,
      lastComboResetAt: null,
    };
    return { previousCombo: emptyCombo, newCombo: emptyCombo, comboIncremented: false };
  }

  const now = new Date();
  let currentComboCount = stats.todayComboCount;
  let resetOccurred = false;

  // Check if combo needs reset (new day)
  if (!isSameComboDay(stats.lastComboResetAt, config.missionResetHour)) {
    currentComboCount = 0;
    resetOccurred = true;
  }

  // Calculate previous combo bonus (what was earned on last mission)
  const previousBonusPercent = config.comboEnabled
    ? calculateComboBonus(currentComboCount, config.comboBonusPercent, config.maxComboBonus)
    : 0;

  const previousCombo: ComboInfo = {
    todayComboCount: currentComboCount,
    bonusPercent: previousBonusPercent,
    nextBonusPercent: config.comboEnabled
      ? calculateNextComboBonus(currentComboCount, config.comboBonusPercent, config.maxComboBonus)
      : 0,
    isMaxCombo: previousBonusPercent >= config.maxComboBonus,
    lastComboResetAt: stats.lastComboResetAt,
  };

  // Increment combo
  const newComboCount = currentComboCount + 1;

  // Update database
  await prisma.customerMissionStats.update({
    where: { customerId },
    data: {
      todayComboCount: newComboCount,
      lastComboResetAt: now,
    },
  });

  // Calculate new combo bonus
  const newBonusPercent = config.comboEnabled
    ? calculateComboBonus(newComboCount, config.comboBonusPercent, config.maxComboBonus)
    : 0;

  const newCombo: ComboInfo = {
    todayComboCount: newComboCount,
    bonusPercent: newBonusPercent,
    nextBonusPercent: config.comboEnabled
      ? calculateNextComboBonus(newComboCount, config.comboBonusPercent, config.maxComboBonus)
      : 0,
    isMaxCombo: newBonusPercent >= config.maxComboBonus,
    lastComboResetAt: now,
  };

  console.log(
    `${LOG_PREFIX} Combo updated for customer ${customerId}: ${currentComboCount} -> ${newComboCount} ` +
      `(+${newBonusPercent}% bonus)${resetOccurred ? " [reset occurred]" : ""}`
  );

  return {
    previousCombo,
    newCombo,
    comboIncremented: true,
  };
}

/**
 * Reset all combos for a shop (run daily via cron)
 * This is optional - combos reset automatically when missions are completed after reset hour
 */
export async function resetAllCombos(shop: string): Promise<number> {
  const result = await prisma.customerMissionStats.updateMany({
    where: {
      shop,
      todayComboCount: { gt: 0 },
    },
    data: {
      todayComboCount: 0,
    },
  });

  if (result.count > 0) {
    console.log(`${LOG_PREFIX} Reset ${result.count} combos for shop ${shop}`);
  }

  return result.count;
}

/**
 * Get combo leaderboard for a shop (today's top combo achievers)
 */
export async function getComboLeaderboard(
  shop: string,
  limit: number = 10
): Promise<
  Array<{
    customerId: string;
    todayComboCount: number;
    bonusPercent: number;
    customer: { email: string; firstName: string | null; lastName: string | null } | null;
  }>
> {
  const config = await getComboConfig(shop);

  const leaderboard = await prisma.customerMissionStats.findMany({
    where: { shop, todayComboCount: { gt: 0 } },
    orderBy: { todayComboCount: "desc" },
    take: limit,
    select: {
      customerId: true,
      todayComboCount: true,
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
    bonusPercent: calculateComboBonus(
      entry.todayComboCount,
      config.comboBonusPercent,
      config.maxComboBonus
    ),
  }));
}
