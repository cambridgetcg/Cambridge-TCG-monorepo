/**
 * Raffle Psychology Service
 *
 * Orchestrates all psychology features for raffle engagement.
 * This service is the main entry point for applying psychological
 * mechanics during raffle entry purchases.
 *
 * Entry Bonus Calculation Flow:
 * Base entries → Tier multiplier → Streak multiplier →
 * Event multiplier → Early bird bonus → Lucky number bonus
 * → Final entries
 *
 * Features Orchestrated:
 * - Streak tracking and bonuses
 * - Instant win micro-prizes
 * - Activity feed (social proof)
 * - Bonus events (happy hours, flash sales)
 * - Lucky numbers
 * - Early bird bonuses
 */

import db from "../db.server";

import {
  getRaffleStreakInfo,
  updateRaffleStreak,
  isStreakMilestone,
  getStreakTier,
  type RaffleStreakInfo,
} from "./raffle-streak.server";

import {
  processInstantWin,
  deliverInstantWinPrize,
  type InstantWinResult,
} from "./raffle-instant-win.server";

import {
  logEntryPurchase,
  logInstantWin,
  logStreakMilestone,
  logEarlyBird,
  logLuckyNumber,
  getActivityFeed,
  type ActivityFeedItem,
} from "./raffle-activity-feed.server";

import {
  getBestBonusEvent,
  recordBonusEventUsage,
  getActiveBonusEvents,
  formatTimeRemaining,
  type BonusEventInfo,
  type AppliedBonus,
} from "./raffle-bonus-events.server";

import {
  checkLuckyNumber,
  getUpcomingMilestones,
  type LuckyNumberResult,
} from "./raffle-lucky-numbers.server";

const LOG_PREFIX = "[RafflePsychology]";

// ============================================
// TYPES
// ============================================

export interface PsychologyContext {
  shop: string;
  customerId: string;
  raffleId: string;
  raffleName: string;
  currentTotalEntries: number; // Raffle's current total entries
}

export interface AppliedBonuses {
  // Streak
  streak: {
    applied: boolean;
    multiplier: number;
    days: number;
    emoji: string;
    isMilestone: boolean;
  };
  // Bonus Event
  bonusEvent: {
    applied: boolean;
    eventId: string | null;
    eventName: string | null;
    multiplier: number;
    flatBonus: number;
    timeRemaining: string | null;
  };
  // Early Bird
  earlyBird: {
    applied: boolean;
    bonusPercent: number;
  };
  // Lucky Number
  luckyNumber: {
    applied: boolean;
    number: number | null;
    bonusEntries: number;
    type: string | null;
  };
}

export interface EntryPurchaseResult {
  // Entry details
  baseEntries: number;
  finalEntries: number;
  pointsSpent: number;

  // Bonuses breakdown
  bonuses: AppliedBonuses;

  // Instant wins
  instantWins: InstantWinResult[];

  // Updated streak info
  streakInfo: RaffleStreakInfo;

  // For animations/celebrations
  celebrations: CelebrationEvent[];
}

export interface CelebrationEvent {
  type: "STREAK_MILESTONE" | "INSTANT_WIN" | "LUCKY_NUMBER" | "EARLY_BIRD";
  data: Record<string, unknown>;
  message: string;
  emoji: string;
}

export interface PsychologyDashboard {
  streak: RaffleStreakInfo;
  activeBonusEvents: BonusEventInfo[];
  activityFeed: ActivityFeedItem[];
  upcomingMilestones: {
    nextMilestone: number | null;
    entriesToNext: number;
  };
}

// ============================================
// MAIN ENTRY PROCESSING
// ============================================

/**
 * Process psychology bonuses for a raffle entry purchase
 * This is the main entry point called by raffle-entry.server.ts
 */
export async function processPsychologyBonuses(
  context: PsychologyContext,
  baseEntries: number,
  tierMultiplier: number
): Promise<EntryPurchaseResult> {
  const { shop, customerId, raffleId, raffleName, currentTotalEntries } = context;

  console.log(`${LOG_PREFIX} Processing psychology bonuses for customer ${customerId}`);

  // Get raffle settings
  const raffle = await db.raffle.findUnique({
    where: { id: raffleId },
    select: {
      enableStreakBonuses: true,
      enableLuckyNumbers: true,
      enableInstantWins: true,
      enableActivityFeed: true,
      earlyBirdBonusPercent: true,
      earlyBirdEntryLimit: true,
    },
  });

  if (!raffle) {
    throw new Error(`Raffle ${raffleId} not found`);
  }

  const celebrations: CelebrationEvent[] = [];
  const bonuses: AppliedBonuses = {
    streak: { applied: false, multiplier: 1, days: 0, emoji: "", isMilestone: false },
    bonusEvent: { applied: false, eventId: null, eventName: null, multiplier: 1, flatBonus: 0, timeRemaining: null },
    earlyBird: { applied: false, bonusPercent: 0 },
    luckyNumber: { applied: false, number: null, bonusEntries: 0, type: null },
  };

  let currentEntries = baseEntries * tierMultiplier;

  // 1. STREAK BONUS
  if (raffle.enableStreakBonuses) {
    const streakInfo = await updateRaffleStreak(shop, customerId);

    if (streakInfo.bonusMultiplier > 1) {
      bonuses.streak = {
        applied: true,
        multiplier: streakInfo.bonusMultiplier,
        days: streakInfo.currentStreak,
        emoji: streakInfo.streakEmoji,
        isMilestone: isStreakMilestone(streakInfo.currentStreak),
      };
      currentEntries = Math.floor(currentEntries * streakInfo.bonusMultiplier);

      // Log streak milestone for activity feed
      if (bonuses.streak.isMilestone && raffle.enableActivityFeed) {
        await logStreakMilestone(
          raffleId,
          shop,
          customerId,
          streakInfo.currentStreak,
          streakInfo.streakEmoji
        );

        celebrations.push({
          type: "STREAK_MILESTONE",
          data: { days: streakInfo.currentStreak, emoji: streakInfo.streakEmoji },
          message: `${streakInfo.currentStreak}-day streak!`,
          emoji: streakInfo.streakEmoji,
        });
      }
    }
  }

  // 2. BONUS EVENT
  const bonusEvent = await getBestBonusEvent(shop, customerId, raffleId);
  if (bonusEvent) {
    bonuses.bonusEvent = {
      applied: true,
      eventId: bonusEvent.eventId,
      eventName: bonusEvent.eventName,
      multiplier: bonusEvent.multiplier,
      flatBonus: bonusEvent.flatBonus,
      timeRemaining: null, // Will be filled by client
    };

    // Apply multiplier
    if (bonusEvent.multiplier > 1) {
      currentEntries = Math.floor(currentEntries * bonusEvent.multiplier);
    }

    // Apply flat bonus
    if (bonusEvent.flatBonus > 0) {
      currentEntries += bonusEvent.flatBonus;
    }

    // Record usage
    await recordBonusEventUsage(bonusEvent.eventId, customerId, shop);
  }

  // 3. EARLY BIRD BONUS
  if (
    raffle.earlyBirdBonusPercent > 0 &&
    raffle.earlyBirdEntryLimit > 0 &&
    currentTotalEntries < raffle.earlyBirdEntryLimit
  ) {
    bonuses.earlyBird = {
      applied: true,
      bonusPercent: raffle.earlyBirdBonusPercent,
    };

    const earlyBirdBonus = Math.floor(currentEntries * (raffle.earlyBirdBonusPercent / 100));
    currentEntries += earlyBirdBonus;

    if (raffle.enableActivityFeed) {
      await logEarlyBird(
        raffleId,
        shop,
        customerId,
        currentTotalEntries + 1,
        raffle.earlyBirdBonusPercent
      );
    }

    celebrations.push({
      type: "EARLY_BIRD",
      data: { entryNumber: currentTotalEntries + 1, bonusPercent: raffle.earlyBirdBonusPercent },
      message: `Early bird bonus! +${raffle.earlyBirdBonusPercent}%`,
      emoji: "🐦",
    });
  }

  // 4. LUCKY NUMBER CHECK
  if (raffle.enableLuckyNumbers) {
    const luckyResult = await checkLuckyNumber(
      raffleId,
      shop,
      customerId,
      currentTotalEntries + 1 // Next entry number
    );

    if (luckyResult.isLucky) {
      bonuses.luckyNumber = {
        applied: true,
        number: luckyResult.luckyNumber,
        bonusEntries: luckyResult.bonusEntries,
        type: luckyResult.bonusType,
      };
      currentEntries += luckyResult.bonusEntries;

      if (raffle.enableActivityFeed) {
        await logLuckyNumber(
          raffleId,
          shop,
          customerId,
          luckyResult.luckyNumber!,
          luckyResult.bonusEntries
        );
      }

      celebrations.push({
        type: "LUCKY_NUMBER",
        data: {
          number: luckyResult.luckyNumber,
          bonusEntries: luckyResult.bonusEntries,
          type: luckyResult.bonusType,
        },
        message: luckyResult.message!,
        emoji: "🎉",
      });
    }
  }

  // 5. INSTANT WIN PROCESSING
  let instantWins: InstantWinResult[] = [];
  if (raffle.enableInstantWins) {
    // Process instant wins for each entry
    for (let i = 0; i < currentEntries; i++) {
      const wins = await processInstantWin(raffleId, shop, customerId, ""); // Entry ID will be added after creation
      instantWins = instantWins.concat(wins);
    }

    // Log instant wins to activity feed and create celebrations
    for (const win of instantWins.filter((w) => w.won)) {
      if (raffle.enableActivityFeed) {
        await logInstantWin(
          raffleId,
          shop,
          customerId,
          win.prize!.name,
          win.prize!.rarity
        );
      }

      celebrations.push({
        type: "INSTANT_WIN",
        data: {
          prizeName: win.prize!.name,
          rarity: win.prize!.rarity,
          prizeType: win.prize!.prizeType,
        },
        message: win.message,
        emoji: "✨",
      });

      // Deliver prize immediately for points/credit types
      // Other types will need manual delivery
    }
  }

  // 6. LOG ENTRY TO ACTIVITY FEED
  if (raffle.enableActivityFeed) {
    await logEntryPurchase(raffleId, shop, customerId, currentEntries, raffleName);
  }

  // Get updated streak info for return
  const streakInfo = await getRaffleStreakInfo(shop, customerId);

  console.log(
    `${LOG_PREFIX} Processed entry: ${baseEntries} base → ${currentEntries} final ` +
      `(tier: ${tierMultiplier}x, streak: ${bonuses.streak.multiplier}x, event: ${bonuses.bonusEvent.multiplier}x, ` +
      `early bird: +${bonuses.earlyBird.bonusPercent}%, lucky: +${bonuses.luckyNumber.bonusEntries})`
  );

  return {
    baseEntries,
    finalEntries: Math.floor(currentEntries),
    pointsSpent: 0, // Will be calculated by caller
    bonuses,
    instantWins,
    streakInfo,
    celebrations,
  };
}

// ============================================
// DASHBOARD DATA
// ============================================

/**
 * Get psychology dashboard data for customer UI
 */
export async function getPsychologyDashboard(
  shop: string,
  customerId: string,
  raffleId?: string
): Promise<PsychologyDashboard> {
  const [streakInfo, bonusEvents, activityFeed] = await Promise.all([
    getRaffleStreakInfo(shop, customerId),
    getActiveBonusEvents(shop, raffleId),
    raffleId ? getActivityFeed(raffleId, 10) : Promise.resolve([]),
  ]);

  let upcomingMilestones = { nextMilestone: null as number | null, entriesToNext: 0 };

  if (raffleId) {
    const raffle = await db.raffle.findUnique({
      where: { id: raffleId },
      select: { totalEntries: true },
    });

    if (raffle) {
      const milestones = await getUpcomingMilestones(raffleId, shop, raffle.totalEntries);
      upcomingMilestones = {
        nextMilestone: milestones.nextMilestone,
        entriesToNext: milestones.entriesToNext,
      };
    }
  }

  return {
    streak: streakInfo,
    activeBonusEvents: bonusEvents,
    activityFeed,
    upcomingMilestones,
  };
}

/**
 * Get simplified psychology state for storefront widget
 */
export async function getPsychologyState(
  shop: string,
  customerId: string | null
): Promise<{
  streak: RaffleStreakInfo | null;
  hasActiveBonusEvents: boolean;
  bestBonusEvent: BonusEventInfo | null;
}> {
  if (!customerId) {
    const events = await getActiveBonusEvents(shop);
    return {
      streak: null,
      hasActiveBonusEvents: events.length > 0,
      bestBonusEvent: events[0] || null,
    };
  }

  const [streakInfo, bonusEvents] = await Promise.all([
    getRaffleStreakInfo(shop, customerId),
    getActiveBonusEvents(shop),
  ]);

  return {
    streak: streakInfo,
    hasActiveBonusEvents: bonusEvents.length > 0,
    bestBonusEvent: bonusEvents[0] || null,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Calculate total bonus multiplier for display
 */
export function calculateTotalMultiplier(bonuses: AppliedBonuses): number {
  let multiplier = 1;

  if (bonuses.streak.applied) {
    multiplier *= bonuses.streak.multiplier;
  }

  if (bonuses.bonusEvent.applied) {
    multiplier *= bonuses.bonusEvent.multiplier;
  }

  if (bonuses.earlyBird.applied) {
    multiplier *= 1 + bonuses.earlyBird.bonusPercent / 100;
  }

  return multiplier;
}

/**
 * Format bonus summary for display
 */
export function formatBonusSummary(bonuses: AppliedBonuses): string {
  const parts: string[] = [];

  if (bonuses.streak.applied) {
    parts.push(`${bonuses.streak.emoji} ${bonuses.streak.days}-day streak (${((bonuses.streak.multiplier - 1) * 100).toFixed(0)}%)`);
  }

  if (bonuses.bonusEvent.applied) {
    parts.push(`🎉 ${bonuses.bonusEvent.eventName} (${((bonuses.bonusEvent.multiplier - 1) * 100).toFixed(0)}%)`);
  }

  if (bonuses.earlyBird.applied) {
    parts.push(`🐦 Early bird (+${bonuses.earlyBird.bonusPercent}%)`);
  }

  if (bonuses.luckyNumber.applied) {
    parts.push(`🎯 Lucky #${bonuses.luckyNumber.number} (+${bonuses.luckyNumber.bonusEntries})`);
  }

  return parts.length > 0 ? parts.join(" • ") : "No bonuses";
}

/**
 * Check if any psychology features are enabled for a raffle
 */
export async function hasPsychologyFeatures(raffleId: string): Promise<boolean> {
  const raffle = await db.raffle.findUnique({
    where: { id: raffleId },
    select: {
      enableStreakBonuses: true,
      enableLuckyNumbers: true,
      enableInstantWins: true,
      enableActivityFeed: true,
      earlyBirdBonusPercent: true,
      dailyFreeEntries: true,
    },
  });

  if (!raffle) return false;

  return (
    raffle.enableStreakBonuses ||
    raffle.enableLuckyNumbers ||
    raffle.enableInstantWins ||
    raffle.enableActivityFeed ||
    raffle.earlyBirdBonusPercent > 0 ||
    raffle.dailyFreeEntries > 0
  );
}
