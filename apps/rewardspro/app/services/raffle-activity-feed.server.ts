/**
 * Raffle Activity Feed Service
 *
 * Provides social proof through real-time activity displays.
 * Shows other customers' actions to create FOMO and social validation.
 *
 * Activity Types:
 * - Entry purchases ("J***n S. purchased 5 entries")
 * - Instant wins ("M***a K. won Lucky Points Bonus!")
 * - Grand winners ("Entry #100 - Lucky Number Bonus!")
 * - Streak milestones ("S***h R. hit a 7-day streak!")
 *
 * Key Psychology:
 * - Social proof (others are participating)
 * - FOMO (missing out on activity)
 * - Bandwagon effect (join the crowd)
 * - Urgency (activity is happening now)
 */

import prisma from "../db.server";
import type { RaffleActivityType } from "@prisma/client";

const LOG_PREFIX = "[RaffleActivityFeed]";

// ============================================
// TYPES
// ============================================

export interface ActivityFeedItem {
  id: string;
  activityType: RaffleActivityType;
  displayName: string;
  data: ActivityData;
  createdAt: Date;
  timeAgo: string;
  /** @deprecated Use iconId instead */
  emoji: string;
  iconId: string;
}

export type ActivityData =
  | EntryPurchasedData
  | InstantWinData
  | GrandWinnerData
  | StreakMilestoneData
  | EarlyBirdData
  | LuckyNumberData;

export interface EntryPurchasedData {
  entriesCount: number;
  raffleName: string;
}

export interface InstantWinData {
  prizeName: string;
  rarity: string;
}

export interface GrandWinnerData {
  prizeName: string;
  position: number;
  raffleName: string;
}

export interface StreakMilestoneData {
  streakDays: number;
  /** @deprecated Use streakIconId instead */
  streakEmoji: string;
  streakIconId: string | null;
}

export interface EarlyBirdData {
  entryNumber: number;
  bonusPercent: number;
}

export interface LuckyNumberData {
  luckyNumber: number;
  bonusEntries: number;
}

// Activity type configuration
const ACTIVITY_CONFIG: Record<RaffleActivityType, { iconId: string; template: string }> = {
  ENTRY_PURCHASED: {
    iconId: "ticket",
    template: "purchased {entriesCount} entries",
  },
  INSTANT_WIN: {
    iconId: "sparkle",
    template: "won {prizeName}!",
  },
  GRAND_WINNER: {
    iconId: "trophy",
    template: "won {prizeName} in {raffleName}!",
  },
  STREAK_MILESTONE: {
    iconId: "flame",
    template: "hit a {streakDays}-day streak!",
  },
  EARLY_BIRD: {
    iconId: "clock",
    template: "got early bird bonus!",
  },
  LUCKY_NUMBER: {
    iconId: "star",
    template: "hit lucky number #{luckyNumber}!",
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Anonymize customer name (e.g., "John Smith" -> "J***n S.")
 */
export function anonymizeName(
  firstName: string | null,
  lastName: string | null
): string {
  if (!firstName && !lastName) {
    return "Anonymous";
  }

  let displayName = "";

  if (firstName) {
    if (firstName.length <= 2) {
      displayName = firstName;
    } else {
      displayName = firstName[0] + "***" + firstName[firstName.length - 1];
    }
  }

  if (lastName) {
    displayName += " " + lastName[0] + ".";
  }

  return displayName;
}

/**
 * Calculate "time ago" string
 */
export function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Format activity message from template
 */
function formatActivityMessage(
  activityType: RaffleActivityType,
  data: ActivityData
): string {
  const config = ACTIVITY_CONFIG[activityType];
  let message = config.template;

  for (const [key, value] of Object.entries(data)) {
    message = message.replace(`{${key}}`, String(value));
  }

  return message;
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Log a new activity
 */
export async function logActivity(
  raffleId: string,
  shop: string,
  activityType: RaffleActivityType,
  data: ActivityData,
  customerId?: string,
  displayName?: string
): Promise<string> {
  let finalDisplayName = displayName || "Anonymous";

  // Fetch customer name if customerId provided but no displayName
  if (customerId && !displayName) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { firstName: true, lastName: true },
    });
    if (customer) {
      finalDisplayName = anonymizeName(customer.firstName, customer.lastName);
    }
  }

  // Set expiration (activities expire after 24 hours by default)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const activity = await prisma.raffleActivity.create({
    data: {
      raffleId,
      shop,
      activityType,
      customerId,
      displayName: finalDisplayName,
      data: data as unknown as Record<string, unknown>,
      isPublic: true,
      expiresAt,
    },
  });

  console.log(
    `${LOG_PREFIX} Logged activity: ${activityType} for raffle ${raffleId} (${finalDisplayName})`
  );

  return activity.id;
}

/**
 * Get recent activity feed for a raffle
 */
export async function getActivityFeed(
  raffleId: string,
  limit: number = 10
): Promise<ActivityFeedItem[]> {
  const now = new Date();

  const activities = await prisma.raffleActivity.findMany({
    where: {
      raffleId,
      isPublic: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gte: now } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      activityType: true,
      displayName: true,
      data: true,
      createdAt: true,
    },
  });

  return activities.map((activity) => {
    const activityType = activity.activityType as RaffleActivityType;
    return {
      id: activity.id,
      activityType,
      displayName: activity.displayName,
      data: activity.data as ActivityData,
      createdAt: activity.createdAt,
      timeAgo: getTimeAgo(activity.createdAt),
      emoji: "", // Deprecated
      iconId: ACTIVITY_CONFIG[activityType].iconId,
    };
  });
}

/**
 * Get activity feed for all active raffles in a shop
 */
export async function getShopActivityFeed(
  shop: string,
  limit: number = 20
): Promise<ActivityFeedItem[]> {
  const now = new Date();

  const activities = await prisma.raffleActivity.findMany({
    where: {
      shop,
      isPublic: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gte: now } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      activityType: true,
      displayName: true,
      data: true,
      createdAt: true,
    },
  });

  return activities.map((activity) => {
    const activityType = activity.activityType as RaffleActivityType;
    return {
      id: activity.id,
      activityType,
      displayName: activity.displayName,
      data: activity.data as ActivityData,
      createdAt: activity.createdAt,
      timeAgo: getTimeAgo(activity.createdAt),
      emoji: "", // Deprecated
      iconId: ACTIVITY_CONFIG[activityType].iconId,
    };
  });
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Log entry purchase activity
 */
export async function logEntryPurchase(
  raffleId: string,
  shop: string,
  customerId: string,
  entriesCount: number,
  raffleName: string
): Promise<string> {
  return logActivity(
    raffleId,
    shop,
    "ENTRY_PURCHASED",
    { entriesCount, raffleName } as EntryPurchasedData,
    customerId
  );
}

/**
 * Log instant win activity
 */
export async function logInstantWin(
  raffleId: string,
  shop: string,
  customerId: string,
  prizeName: string,
  rarity: string
): Promise<string> {
  return logActivity(
    raffleId,
    shop,
    "INSTANT_WIN",
    { prizeName, rarity } as InstantWinData,
    customerId
  );
}

/**
 * Log grand winner activity
 */
export async function logGrandWinner(
  raffleId: string,
  shop: string,
  customerId: string,
  prizeName: string,
  position: number,
  raffleName: string
): Promise<string> {
  return logActivity(
    raffleId,
    shop,
    "GRAND_WINNER",
    { prizeName, position, raffleName } as GrandWinnerData,
    customerId
  );
}

/**
 * Log streak milestone activity
 */
export async function logStreakMilestone(
  raffleId: string,
  shop: string,
  customerId: string,
  streakDays: number,
  streakIconId: string | null
): Promise<string> {
  return logActivity(
    raffleId,
    shop,
    "STREAK_MILESTONE",
    { streakDays, streakEmoji: "", streakIconId } as StreakMilestoneData,
    customerId
  );
}

/**
 * Log early bird activity
 */
export async function logEarlyBird(
  raffleId: string,
  shop: string,
  customerId: string,
  entryNumber: number,
  bonusPercent: number
): Promise<string> {
  return logActivity(
    raffleId,
    shop,
    "EARLY_BIRD",
    { entryNumber, bonusPercent } as EarlyBirdData,
    customerId
  );
}

/**
 * Log lucky number activity
 */
export async function logLuckyNumber(
  raffleId: string,
  shop: string,
  customerId: string,
  luckyNumber: number,
  bonusEntries: number
): Promise<string> {
  return logActivity(
    raffleId,
    shop,
    "LUCKY_NUMBER",
    { luckyNumber, bonusEntries } as LuckyNumberData,
    customerId
  );
}

// ============================================
// MAINTENANCE
// ============================================

/**
 * Clean up expired activities
 */
export async function cleanupExpiredActivities(shop: string): Promise<number> {
  const now = new Date();

  const result = await prisma.raffleActivity.deleteMany({
    where: {
      shop,
      expiresAt: { lt: now },
    },
  });

  if (result.count > 0) {
    console.log(`${LOG_PREFIX} Cleaned up ${result.count} expired activities for shop ${shop}`);
  }

  return result.count;
}

/**
 * Get activity statistics for a raffle
 */
export async function getActivityStats(raffleId: string): Promise<{
  totalActivities: number;
  byType: Record<RaffleActivityType, number>;
  lastActivityAt: Date | null;
}> {
  const activities = await prisma.raffleActivity.groupBy({
    by: ["activityType"],
    where: { raffleId },
    _count: true,
  });

  const byType: Record<string, number> = {};
  let totalActivities = 0;

  for (const activity of activities) {
    byType[activity.activityType] = activity._count;
    totalActivities += activity._count;
  }

  const lastActivity = await prisma.raffleActivity.findFirst({
    where: { raffleId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return {
    totalActivities,
    byType: byType as Record<RaffleActivityType, number>,
    lastActivityAt: lastActivity?.createdAt || null,
  };
}
