/**
 * Points Configuration Service
 *
 * Manages the shop-level configuration for the Points Engagement System.
 * This service handles:
 * - Enabling/disabling the points system
 * - Currency branding (name, icon)
 * - Earning rules (points per dollar)
 * - Expiration settings
 * - Feature toggles (raffles, mystery boxes, etc.)
 */

import db from "../db.server";
import type { PointsConfig, PointsRoundingMode } from "@prisma/client";

// ============================================
// TYPES
// ============================================

export interface PointsConfigData {
  isEnabled: boolean;
  currencyName: string;
  currencyNamePlural: string;
  currencyIcon: string;
  pointsPerDollar: number;
  roundingMode: PointsRoundingMode;
  pointsExpire: boolean;
  expirationDays: number;
  expirationWarningDays: number;
  rafflesEnabled: boolean;
  mysteryBoxesEnabled: boolean;
  spinWheelEnabled: boolean;
  challengesEnabled: boolean;
  scratchCardsEnabled: boolean;
  givebackPoolsEnabled: boolean;
  dailySpinEnabled: boolean;
  dailySpinResetHour: number;
  premiumSpinCost: number;
  streakBonusEnabled: boolean;
  streakBonusMultiplier: number;
}

export interface UpdatePointsConfigInput {
  isEnabled?: boolean;
  currencyName?: string;
  currencyNamePlural?: string;
  currencyIcon?: string;
  pointsPerDollar?: number;
  roundingMode?: PointsRoundingMode;
  pointsExpire?: boolean;
  expirationDays?: number;
  expirationWarningDays?: number;
  rafflesEnabled?: boolean;
  mysteryBoxesEnabled?: boolean;
  spinWheelEnabled?: boolean;
  challengesEnabled?: boolean;
  scratchCardsEnabled?: boolean;
  givebackPoolsEnabled?: boolean;
  dailySpinEnabled?: boolean;
  dailySpinResetHour?: number;
  premiumSpinCost?: number;
  streakBonusEnabled?: boolean;
  streakBonusMultiplier?: number;
}

// ============================================
// DEFAULT VALUES
// ============================================

const DEFAULT_CONFIG: PointsConfigData = {
  isEnabled: false,
  currencyName: "Points",
  currencyNamePlural: "Points",
  currencyIcon: "⭐",
  pointsPerDollar: 10,
  roundingMode: "FLOOR",
  pointsExpire: false,
  expirationDays: 365,
  expirationWarningDays: 30,
  rafflesEnabled: false,
  mysteryBoxesEnabled: false,
  spinWheelEnabled: false,
  challengesEnabled: false,
  scratchCardsEnabled: false,
  givebackPoolsEnabled: false,
  dailySpinEnabled: true,
  dailySpinResetHour: 0,
  premiumSpinCost: 500,
  streakBonusEnabled: false,
  streakBonusMultiplier: 0.1,
};

// ============================================
// CONFIGURATION FUNCTIONS
// ============================================

/**
 * Get the points configuration for a shop
 *
 * @param shop - Shop domain
 * @returns Points configuration (with defaults if not configured)
 */
export async function getPointsConfig(shop: string): Promise<PointsConfigData> {
  const config = await db.pointsConfig.findUnique({
    where: { shop },
  });

  if (!config) {
    return DEFAULT_CONFIG;
  }

  return {
    isEnabled: config.isEnabled,
    currencyName: config.currencyName,
    currencyNamePlural: config.currencyNamePlural,
    currencyIcon: config.currencyIcon,
    pointsPerDollar: config.pointsPerDollar,
    roundingMode: config.roundingMode,
    pointsExpire: config.pointsExpire,
    expirationDays: config.expirationDays,
    expirationWarningDays: config.expirationWarningDays,
    rafflesEnabled: config.rafflesEnabled,
    mysteryBoxesEnabled: config.mysteryBoxesEnabled,
    spinWheelEnabled: config.spinWheelEnabled,
    challengesEnabled: config.challengesEnabled,
    scratchCardsEnabled: config.scratchCardsEnabled,
    givebackPoolsEnabled: config.givebackPoolsEnabled,
    dailySpinEnabled: config.dailySpinEnabled,
    dailySpinResetHour: config.dailySpinResetHour,
    premiumSpinCost: config.premiumSpinCost,
    streakBonusEnabled: config.streakBonusEnabled,
    streakBonusMultiplier: Number(config.streakBonusMultiplier),
  };
}

/**
 * Check if the points system is enabled for a shop
 *
 * @param shop - Shop domain
 * @returns Whether the points system is enabled
 */
export async function isPointsEnabled(shop: string): Promise<boolean> {
  const config = await db.pointsConfig.findUnique({
    where: { shop },
    select: { isEnabled: true },
  });

  return config?.isEnabled ?? false;
}

/**
 * Get the points earning rate for a shop (points per dollar)
 *
 * @param shop - Shop domain
 * @returns Points per dollar
 */
export async function getPointsPerDollar(shop: string): Promise<number> {
  const config = await db.pointsConfig.findUnique({
    where: { shop },
    select: { pointsPerDollar: true },
  });

  return config?.pointsPerDollar ?? DEFAULT_CONFIG.pointsPerDollar;
}

/**
 * Get the currency branding for a shop
 *
 * @param shop - Shop domain
 * @returns Currency branding (name, plural, icon)
 */
export async function getCurrencyBranding(shop: string): Promise<{
  name: string;
  plural: string;
  icon: string;
}> {
  const config = await db.pointsConfig.findUnique({
    where: { shop },
    select: {
      currencyName: true,
      currencyNamePlural: true,
      currencyIcon: true,
    },
  });

  return {
    name: config?.currencyName ?? DEFAULT_CONFIG.currencyName,
    plural: config?.currencyNamePlural ?? DEFAULT_CONFIG.currencyNamePlural,
    icon: config?.currencyIcon ?? DEFAULT_CONFIG.currencyIcon,
  };
}

// ============================================
// UPDATE FUNCTIONS
// ============================================

/**
 * Update the points configuration for a shop
 *
 * Creates the configuration if it doesn't exist.
 *
 * @param shop - Shop domain
 * @param input - Fields to update
 * @returns Updated configuration
 */
export async function updatePointsConfig(
  shop: string,
  input: UpdatePointsConfigInput
): Promise<PointsConfigData> {
  const updateData: Record<string, unknown> = {};

  // Only include defined fields
  if (input.isEnabled !== undefined) updateData.isEnabled = input.isEnabled;
  if (input.currencyName !== undefined) updateData.currencyName = input.currencyName;
  if (input.currencyNamePlural !== undefined) updateData.currencyNamePlural = input.currencyNamePlural;
  if (input.currencyIcon !== undefined) updateData.currencyIcon = input.currencyIcon;
  if (input.pointsPerDollar !== undefined) updateData.pointsPerDollar = input.pointsPerDollar;
  if (input.roundingMode !== undefined) updateData.roundingMode = input.roundingMode;
  if (input.pointsExpire !== undefined) updateData.pointsExpire = input.pointsExpire;
  if (input.expirationDays !== undefined) updateData.expirationDays = input.expirationDays;
  if (input.expirationWarningDays !== undefined) updateData.expirationWarningDays = input.expirationWarningDays;
  if (input.rafflesEnabled !== undefined) updateData.rafflesEnabled = input.rafflesEnabled;
  if (input.mysteryBoxesEnabled !== undefined) updateData.mysteryBoxesEnabled = input.mysteryBoxesEnabled;
  if (input.spinWheelEnabled !== undefined) updateData.spinWheelEnabled = input.spinWheelEnabled;
  if (input.challengesEnabled !== undefined) updateData.challengesEnabled = input.challengesEnabled;
  if (input.scratchCardsEnabled !== undefined) updateData.scratchCardsEnabled = input.scratchCardsEnabled;
  if (input.givebackPoolsEnabled !== undefined) updateData.givebackPoolsEnabled = input.givebackPoolsEnabled;
  if (input.dailySpinEnabled !== undefined) updateData.dailySpinEnabled = input.dailySpinEnabled;
  if (input.dailySpinResetHour !== undefined) updateData.dailySpinResetHour = input.dailySpinResetHour;
  if (input.premiumSpinCost !== undefined) updateData.premiumSpinCost = input.premiumSpinCost;
  if (input.streakBonusEnabled !== undefined) updateData.streakBonusEnabled = input.streakBonusEnabled;
  if (input.streakBonusMultiplier !== undefined) updateData.streakBonusMultiplier = input.streakBonusMultiplier;

  await db.pointsConfig.upsert({
    where: { shop },
    update: updateData,
    create: {
      shop,
      ...DEFAULT_CONFIG,
      ...updateData,
    },
  });

  console.log(`[PointsConfig] Updated configuration for shop ${shop}`, updateData);

  return getPointsConfig(shop);
}

/**
 * Enable the points system for a shop
 *
 * @param shop - Shop domain
 * @returns Updated configuration
 */
export async function enablePoints(shop: string): Promise<PointsConfigData> {
  return updatePointsConfig(shop, { isEnabled: true });
}

/**
 * Disable the points system for a shop
 *
 * @param shop - Shop domain
 * @returns Updated configuration
 */
export async function disablePoints(shop: string): Promise<PointsConfigData> {
  return updatePointsConfig(shop, { isEnabled: false });
}

// ============================================
// FEATURE TOGGLE FUNCTIONS
// ============================================

/**
 * Check if a specific feature is enabled
 *
 * @param shop - Shop domain
 * @param feature - Feature name
 * @returns Whether the feature is enabled
 */
export async function isFeatureEnabled(
  shop: string,
  feature: 'raffles' | 'mysteryBoxes' | 'spinWheel' | 'challenges' | 'scratchCards' | 'givebackPools'
): Promise<boolean> {
  const config = await db.pointsConfig.findUnique({
    where: { shop },
    select: {
      isEnabled: true,
      rafflesEnabled: true,
      mysteryBoxesEnabled: true,
      spinWheelEnabled: true,
      challengesEnabled: true,
      scratchCardsEnabled: true,
      givebackPoolsEnabled: true,
    },
  });

  // If points system is disabled, all features are disabled
  if (!config?.isEnabled) {
    return false;
  }

  const featureMap: Record<typeof feature, boolean | undefined> = {
    raffles: config.rafflesEnabled,
    mysteryBoxes: config.mysteryBoxesEnabled,
    spinWheel: config.spinWheelEnabled,
    challenges: config.challengesEnabled,
    scratchCards: config.scratchCardsEnabled,
    givebackPools: config.givebackPoolsEnabled,
  };

  return featureMap[feature] ?? false;
}

/**
 * Get all enabled features for a shop
 *
 * @param shop - Shop domain
 * @returns Object with feature enabled states
 */
export async function getEnabledFeatures(shop: string): Promise<{
  pointsSystem: boolean;
  raffles: boolean;
  mysteryBoxes: boolean;
  spinWheel: boolean;
  challenges: boolean;
  scratchCards: boolean;
  givebackPools: boolean;
  dailySpin: boolean;
  streakBonus: boolean;
}> {
  const config = await db.pointsConfig.findUnique({
    where: { shop },
    select: {
      isEnabled: true,
      rafflesEnabled: true,
      mysteryBoxesEnabled: true,
      spinWheelEnabled: true,
      challengesEnabled: true,
      scratchCardsEnabled: true,
      givebackPoolsEnabled: true,
      dailySpinEnabled: true,
      streakBonusEnabled: true,
    },
  });

  const isEnabled = config?.isEnabled ?? false;

  return {
    pointsSystem: isEnabled,
    raffles: isEnabled && (config?.rafflesEnabled ?? false),
    mysteryBoxes: isEnabled && (config?.mysteryBoxesEnabled ?? false),
    spinWheel: isEnabled && (config?.spinWheelEnabled ?? false),
    challenges: isEnabled && (config?.challengesEnabled ?? false),
    scratchCards: isEnabled && (config?.scratchCardsEnabled ?? false),
    givebackPools: isEnabled && (config?.givebackPoolsEnabled ?? false),
    dailySpin: isEnabled && (config?.dailySpinEnabled ?? false),
    streakBonus: isEnabled && (config?.streakBonusEnabled ?? false),
  };
}

// ============================================
// EXPIRATION FUNCTIONS
// ============================================

/**
 * Get expiration settings for a shop
 *
 * @param shop - Shop domain
 * @returns Expiration settings
 */
export async function getExpirationSettings(shop: string): Promise<{
  enabled: boolean;
  days: number;
  warningDays: number;
}> {
  const config = await db.pointsConfig.findUnique({
    where: { shop },
    select: {
      pointsExpire: true,
      expirationDays: true,
      expirationWarningDays: true,
    },
  });

  return {
    enabled: config?.pointsExpire ?? DEFAULT_CONFIG.pointsExpire,
    days: config?.expirationDays ?? DEFAULT_CONFIG.expirationDays,
    warningDays: config?.expirationWarningDays ?? DEFAULT_CONFIG.expirationWarningDays,
  };
}

/**
 * Calculate the expiration date for points earned today
 *
 * @param shop - Shop domain
 * @returns Expiration date or null if points don't expire
 */
export async function calculateExpirationDate(shop: string): Promise<Date | null> {
  const settings = await getExpirationSettings(shop);

  if (!settings.enabled) {
    return null;
  }

  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + settings.days);
  return expirationDate;
}

// ============================================
// STATISTICS FUNCTIONS
// ============================================

/**
 * Get points system statistics for a shop
 *
 * @param shop - Shop domain
 * @returns Statistics
 */
export async function getPointsStats(shop: string): Promise<{
  isEnabled: boolean;
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  totalPointsExpired: number;
  activePointsBalance: number;
  customersWithPoints: number;
}> {
  const [config, stats] = await Promise.all([
    db.pointsConfig.findUnique({
      where: { shop },
      select: { isEnabled: true },
    }),
    // Get aggregated stats from ledger
    db.pointsLedger.groupBy({
      by: ['type'],
      where: { shop },
      _sum: { amount: true },
    }),
  ]);

  // Calculate totals from grouped stats
  let totalPointsIssued = 0;
  let totalPointsRedeemed = 0;
  let totalPointsExpired = 0;

  const earningTypes = [
    'ORDER_EARNED',
    'CHALLENGE_COMPLETED',
    'SPIN_WHEEL_WIN',
    'SCRATCH_CARD_WIN',
    'MYSTERY_BOX_WIN',
    'BONUS_EVENT',
    'REFERRAL_BONUS',
    'MANUAL_CREDIT',
    'STREAK_BONUS',
  ];

  const spendingTypes = [
    'RAFFLE_ENTRY',
    'MYSTERY_BOX_OPEN',
    'PREMIUM_SPIN',
    'GIVEBACK_DONATION',
    'MANUAL_DEBIT',
  ];

  for (const stat of stats) {
    const amount = stat._sum.amount ?? 0;
    if (earningTypes.includes(stat.type)) {
      totalPointsIssued += amount;
    } else if (spendingTypes.includes(stat.type)) {
      totalPointsRedeemed += Math.abs(amount);
    } else if (stat.type === 'EXPIRATION') {
      totalPointsExpired += Math.abs(amount);
    }
  }

  // Get count of customers with points
  const customersWithPoints = await db.customer.count({
    where: {
      shop,
      pointsBalance: { gt: 0 },
    },
  });

  // Get active points balance (sum of all customer balances)
  const balanceResult = await db.customer.aggregate({
    where: { shop },
    _sum: { pointsBalance: true },
  });

  const activePointsBalance = Number(balanceResult._sum.pointsBalance ?? 0);

  return {
    isEnabled: config?.isEnabled ?? false,
    totalPointsIssued,
    totalPointsRedeemed,
    totalPointsExpired,
    activePointsBalance,
    customersWithPoints,
  };
}
