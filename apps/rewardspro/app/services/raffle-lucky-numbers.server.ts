/**
 * Raffle Lucky Numbers Service
 *
 * Detects and rewards "lucky" entry numbers for extra engagement.
 * Creates excitement and unpredictability.
 *
 * Lucky Number Types:
 * - MILESTONE: Round numbers (100, 500, 1000, etc.)
 * - SEQUENCE: Sequential patterns (111, 222, 333, etc.)
 * - RANDOM: Randomly selected lucky numbers
 * - CUSTOM: Admin-defined lucky numbers
 *
 * Key Psychology:
 * - Anticipation (watching entry count approach milestones)
 * - Surprise reward (unexpected bonus)
 * - Gamification (game-like elements)
 */

import db from "../db.server";

const LOG_PREFIX = "[RaffleLuckyNumbers]";

// ============================================
// TYPES
// ============================================

export interface LuckyNumberResult {
  isLucky: boolean;
  luckyNumber: number | null;
  bonusType: string | null;
  bonusEntries: number;
  message: string | null;
}

export interface LuckyNumberConfig {
  enabled: boolean;
  milestoneNumbers: number[]; // [100, 250, 500, 1000]
  sequenceNumbers: number[]; // [111, 222, 333, 444, 555, 666, 777, 888, 999]
  randomChance: number; // Probability of random lucky number (0-1)
  customNumbers: number[]; // Admin-defined numbers
  milestoneBonus: number; // Bonus entries for milestones
  sequenceBonus: number; // Bonus entries for sequences
  randomBonus: number; // Bonus entries for random
  customBonus: number; // Bonus entries for custom
}

// Default configuration
const DEFAULT_CONFIG: LuckyNumberConfig = {
  enabled: true,
  milestoneNumbers: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
  sequenceNumbers: [111, 222, 333, 444, 555, 666, 777, 888, 999, 1111],
  randomChance: 0.01, // 1% chance of random lucky number
  customNumbers: [],
  milestoneBonus: 10,
  sequenceBonus: 7,
  randomBonus: 5,
  customBonus: 15,
};

// ============================================
// DETECTION FUNCTIONS
// ============================================

/**
 * Check if a number is a milestone (round number)
 */
export function isMilestone(
  entryNumber: number,
  milestones: number[]
): boolean {
  return milestones.includes(entryNumber);
}

/**
 * Check if a number is a repeating sequence (111, 222, etc.)
 */
export function isSequence(
  entryNumber: number,
  sequences: number[]
): boolean {
  return sequences.includes(entryNumber);
}

/**
 * Check if a number is a custom lucky number
 */
export function isCustomLucky(
  entryNumber: number,
  customNumbers: number[]
): boolean {
  return customNumbers.includes(entryNumber);
}

/**
 * Roll for random lucky number
 */
export function rollRandomLucky(chance: number): boolean {
  return Math.random() < chance;
}

/**
 * Get the type of lucky number
 */
export function getLuckyType(
  entryNumber: number,
  config: LuckyNumberConfig
): {
  isLucky: boolean;
  type: string | null;
  bonus: number;
} {
  // Check custom first (highest priority)
  if (isCustomLucky(entryNumber, config.customNumbers)) {
    return { isLucky: true, type: "CUSTOM", bonus: config.customBonus };
  }

  // Check milestone
  if (isMilestone(entryNumber, config.milestoneNumbers)) {
    return { isLucky: true, type: "MILESTONE", bonus: config.milestoneBonus };
  }

  // Check sequence
  if (isSequence(entryNumber, config.sequenceNumbers)) {
    return { isLucky: true, type: "SEQUENCE", bonus: config.sequenceBonus };
  }

  // Check random
  if (rollRandomLucky(config.randomChance)) {
    return { isLucky: true, type: "RANDOM", bonus: config.randomBonus };
  }

  return { isLucky: false, type: null, bonus: 0 };
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Get lucky number configuration for a raffle
 * Can be extended to read from database per-raffle config
 */
export async function getLuckyConfig(
  shop: string,
  raffleId: string
): Promise<LuckyNumberConfig> {
  // Future: Read from database configuration
  // For now, return default config
  return DEFAULT_CONFIG;
}

/**
 * Check entry number for lucky status and record if lucky
 */
export async function checkLuckyNumber(
  raffleId: string,
  shop: string,
  customerId: string,
  entryNumber: number
): Promise<LuckyNumberResult> {
  const config = await getLuckyConfig(shop, raffleId);

  if (!config.enabled) {
    return {
      isLucky: false,
      luckyNumber: null,
      bonusType: null,
      bonusEntries: 0,
      message: null,
    };
  }

  const { isLucky, type, bonus } = getLuckyType(entryNumber, config);

  if (!isLucky) {
    return {
      isLucky: false,
      luckyNumber: null,
      bonusType: null,
      bonusEntries: 0,
      message: null,
    };
  }

  // Record the lucky number hit
  await db.raffleLuckyNumber.create({
    data: {
      raffleId,
      shop,
      customerId,
      luckyNumber: entryNumber,
      bonusType: type!,
      bonusEntries: bonus,
    },
  });

  const message = getLuckyMessage(entryNumber, type!, bonus);

  console.log(
    `${LOG_PREFIX} Customer ${customerId} hit lucky number #${entryNumber} (${type}, +${bonus} entries)`
  );

  return {
    isLucky: true,
    luckyNumber: entryNumber,
    bonusType: type,
    bonusEntries: bonus,
    message,
  };
}

/**
 * Generate lucky message based on type
 */
function getLuckyMessage(
  entryNumber: number,
  type: string,
  bonus: number
): string {
  switch (type) {
    case "MILESTONE":
      return `Entry #${entryNumber} - Milestone Bonus! +${bonus} entries!`;
    case "SEQUENCE":
      return `Lucky #${entryNumber}! +${bonus} bonus entries!`;
    case "RANDOM":
      return `Random Lucky Number! +${bonus} bonus entries!`;
    case "CUSTOM":
      return `Special Lucky Number #${entryNumber}! +${bonus} bonus entries!`;
    default:
      return `Lucky Number! +${bonus} bonus entries!`;
  }
}

/**
 * Get upcoming milestones for a raffle
 * Used to display "Next milestone at #100" type messages
 */
export async function getUpcomingMilestones(
  raffleId: string,
  shop: string,
  currentEntries: number
): Promise<{
  nextMilestone: number | null;
  entriesToNext: number;
  upcomingMilestones: number[];
}> {
  const config = await getLuckyConfig(shop, raffleId);

  // Find milestones above current entry count
  const upcoming = config.milestoneNumbers
    .filter((m) => m > currentEntries)
    .sort((a, b) => a - b);

  const nextMilestone = upcoming[0] || null;
  const entriesToNext = nextMilestone ? nextMilestone - currentEntries : 0;

  return {
    nextMilestone,
    entriesToNext,
    upcomingMilestones: upcoming.slice(0, 3), // Next 3 milestones
  };
}

/**
 * Get lucky number history for a customer
 */
export async function getCustomerLuckyHistory(
  shop: string,
  customerId: string,
  limit: number = 10
): Promise<
  Array<{
    id: string;
    luckyNumber: number;
    bonusType: string;
    bonusEntries: number;
    createdAt: Date;
  }>
> {
  return db.raffleLuckyNumber.findMany({
    where: { shop, customerId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      luckyNumber: true,
      bonusType: true,
      bonusEntries: true,
      createdAt: true,
    },
  });
}

/**
 * Get lucky number statistics for a raffle
 */
export async function getLuckyNumberStats(raffleId: string): Promise<{
  totalLuckyHits: number;
  totalBonusEntries: number;
  byType: Record<string, { count: number; entries: number }>;
  recentHits: Array<{
    luckyNumber: number;
    bonusType: string;
    createdAt: Date;
  }>;
}> {
  const hits = await db.raffleLuckyNumber.findMany({
    where: { raffleId },
    orderBy: { createdAt: "desc" },
    select: {
      luckyNumber: true,
      bonusType: true,
      bonusEntries: true,
      createdAt: true,
    },
  });

  const byType: Record<string, { count: number; entries: number }> = {};
  let totalBonusEntries = 0;

  for (const hit of hits) {
    if (!byType[hit.bonusType]) {
      byType[hit.bonusType] = { count: 0, entries: 0 };
    }
    byType[hit.bonusType].count++;
    byType[hit.bonusType].entries += hit.bonusEntries;
    totalBonusEntries += hit.bonusEntries;
  }

  return {
    totalLuckyHits: hits.length,
    totalBonusEntries,
    byType,
    recentHits: hits.slice(0, 5).map((h) => ({
      luckyNumber: h.luckyNumber,
      bonusType: h.bonusType,
      createdAt: h.createdAt,
    })),
  };
}

/**
 * Get all lucky numbers that have been hit in a raffle
 * Useful for displaying "Numbers already hit" section
 */
export async function getHitLuckyNumbers(
  raffleId: string
): Promise<number[]> {
  const hits = await db.raffleLuckyNumber.findMany({
    where: { raffleId },
    select: { luckyNumber: true },
    distinct: ["luckyNumber"],
  });

  return hits.map((h) => h.luckyNumber);
}

/**
 * Check if a specific lucky number has already been hit
 */
export async function isLuckyNumberAlreadyHit(
  raffleId: string,
  luckyNumber: number
): Promise<boolean> {
  const hit = await db.raffleLuckyNumber.findFirst({
    where: { raffleId, luckyNumber },
    select: { id: true },
  });

  return hit !== null;
}

// ============================================
// ADMIN FUNCTIONS
// ============================================

/**
 * Add custom lucky number for a raffle
 * Note: This would require extending the schema with a RaffleLuckyConfig model
 * For now, this is a placeholder that could be implemented
 */
export function addCustomLuckyNumber(
  _raffleId: string,
  _luckyNumber: number
): void {
  // Future implementation: Save to database
  console.log(`${LOG_PREFIX} addCustomLuckyNumber not yet implemented`);
}

/**
 * Remove custom lucky number from a raffle
 */
export function removeCustomLuckyNumber(
  _raffleId: string,
  _luckyNumber: number
): void {
  // Future implementation: Remove from database
  console.log(`${LOG_PREFIX} removeCustomLuckyNumber not yet implemented`);
}

/**
 * Get emoji for lucky type
 */
export function getLuckyEmoji(type: string): string {
  switch (type) {
    case "MILESTONE":
      return "🎯";
    case "SEQUENCE":
      return "🔢";
    case "RANDOM":
      return "🎲";
    case "CUSTOM":
      return "⭐";
    default:
      return "🎉";
  }
}
