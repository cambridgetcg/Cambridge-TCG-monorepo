/**
 * Mystery Box Activity Feed Service
 *
 * Provides social proof by showing recent activity from other customers.
 * Creates FOMO and encourages participation through visible wins.
 *
 * Activity Types:
 * - BOX_OPENED: Customer opened a mystery box
 * - RARE_WIN: Customer won a rare reward
 * - EPIC_WIN: Customer won an epic reward
 * - LEGENDARY_WIN: Customer won a legendary reward
 * - STREAK_MILESTONE: Customer hit a streak milestone
 * - PITY_TRIGGERED: Customer got guaranteed reward
 * - LUCKY_STREAK: Customer hit a lucky streak bonus
 * - FREE_OPEN_CLAIMED: Customer claimed a free open
 */

import prisma from "../db.server";
import { MysteryBoxActivityType, MysteryBoxRarity } from "@prisma/client";

const LOG_PREFIX = "[MysteryBoxActivityFeed]";

// Activity expiration (24 hours)
const ACTIVITY_EXPIRATION_MS = 24 * 60 * 60 * 1000;

// ============================================
// TYPES
// ============================================

export interface ActivityFeedItem {
  id: string;
  activityType: MysteryBoxActivityType;
  displayName: string;
  data: {
    rewardName?: string;
    rarity?: string;
    pointsWon?: number;
    streakDays?: number;
    luckyStreakCount?: number;
    boxName?: string;
  };
  timeAgo: string;
  /** @deprecated Use iconId instead */
  emoji: string;
  iconId: string;
  createdAt: Date;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Anonymize customer name for privacy
 * "John Smith" -> "J***n S."
 */
export function anonymizeCustomerName(
  firstName: string | null,
  lastName: string | null
): string {
  const first = firstName?.trim() || "Anonymous";
  const last = lastName?.trim() || "";

  if (first.length <= 2) {
    return last ? `${first} ${last.charAt(0)}.` : first;
  }

  const anonymizedFirst =
    first.charAt(0) + "***" + first.charAt(first.length - 1);
  const lastInitial = last ? ` ${last.charAt(0)}.` : "";

  return anonymizedFirst + lastInitial;
}

/**
 * Format time ago string
 */
export function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

/**
 * Get iconId for activity type
 */
export function getActivityIconId(
  activityType: MysteryBoxActivityType,
  rarity?: string
): string {
  switch (activityType) {
    case "BOX_OPENED":
      return "gift";
    case "RARE_WIN":
      return "star";
    case "EPIC_WIN":
      return "sparkle";
    case "LEGENDARY_WIN":
      return "gem";
    case "STREAK_MILESTONE":
      return "flame";
    case "PITY_TRIGGERED":
      return "gift";
    case "LUCKY_STREAK":
      return "zap";
    case "FREE_OPEN_CLAIMED":
      return "ticket";
    default:
      return "gift";
  }
}

/**
 * @deprecated Use getActivityIconId instead
 */
export function getActivityEmoji(
  activityType: MysteryBoxActivityType,
  rarity?: string
): string {
  return ""; // Deprecated - use iconId
}

/**
 * Get iconId for rarity level
 */
export function getRarityIconId(rarity: string): string {
  switch (rarity) {
    case "LEGENDARY":
      return "gem";
    case "EPIC":
      return "sparkle";
    case "RARE":
      return "star";
    case "UNCOMMON":
      return "circle";
    case "COMMON":
    default:
      return "circle";
  }
}

/**
 * @deprecated Use getRarityIconId instead
 */
export function getRarityEmoji(rarity: string): string {
  return ""; // Deprecated - use iconId
}

// ============================================
// ACTIVITY LOGGING
// ============================================

/**
 * Log a mystery box activity
 */
export async function logActivity(params: {
  boxId: string;
  shop: string;
  activityType: MysteryBoxActivityType;
  customerId: string;
  displayName: string;
  data: Record<string, unknown>;
  isPublic?: boolean;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + ACTIVITY_EXPIRATION_MS);

  try {
    await prisma.mysteryBoxActivity.create({
      data: {
        boxId: params.boxId,
        shop: params.shop,
        activityType: params.activityType,
        customerId: params.customerId,
        displayName: params.displayName,
        data: params.data,
        isPublic: params.isPublic ?? true,
        expiresAt,
      },
    });

    console.log(
      `${LOG_PREFIX} Logged ${params.activityType} for box ${params.boxId}`
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to log activity:`, error);
    // Don't throw - activity logging is non-critical
  }
}

/**
 * Log a box open event
 */
export async function logBoxOpen(params: {
  boxId: string;
  shop: string;
  customerId: string;
  firstName: string | null;
  lastName: string | null;
  rewardName: string;
  rarity: MysteryBoxRarity;
  boxName: string;
}): Promise<void> {
  const displayName = anonymizeCustomerName(params.firstName, params.lastName);

  // Determine activity type based on rarity
  let activityType: MysteryBoxActivityType = "BOX_OPENED";
  if (params.rarity === "LEGENDARY") {
    activityType = "LEGENDARY_WIN";
  } else if (params.rarity === "EPIC") {
    activityType = "EPIC_WIN";
  } else if (params.rarity === "RARE") {
    activityType = "RARE_WIN";
  }

  await logActivity({
    boxId: params.boxId,
    shop: params.shop,
    activityType,
    customerId: params.customerId,
    displayName,
    data: {
      rewardName: params.rewardName,
      rarity: params.rarity,
      boxName: params.boxName,
    },
  });
}

/**
 * Log a streak milestone
 */
export async function logStreakMilestone(params: {
  boxId: string;
  shop: string;
  customerId: string;
  firstName: string | null;
  lastName: string | null;
  streakDays: number;
}): Promise<void> {
  const displayName = anonymizeCustomerName(params.firstName, params.lastName);

  await logActivity({
    boxId: params.boxId,
    shop: params.shop,
    activityType: "STREAK_MILESTONE",
    customerId: params.customerId,
    displayName,
    data: {
      streakDays: params.streakDays,
    },
  });
}

/**
 * Log a lucky streak bonus
 */
export async function logLuckyStreak(params: {
  boxId: string;
  shop: string;
  customerId: string;
  firstName: string | null;
  lastName: string | null;
  luckyStreakCount: number;
}): Promise<void> {
  const displayName = anonymizeCustomerName(params.firstName, params.lastName);

  await logActivity({
    boxId: params.boxId,
    shop: params.shop,
    activityType: "LUCKY_STREAK",
    customerId: params.customerId,
    displayName,
    data: {
      luckyStreakCount: params.luckyStreakCount,
    },
  });
}

/**
 * Log a pity system trigger
 */
export async function logPityTriggered(params: {
  boxId: string;
  shop: string;
  customerId: string;
  firstName: string | null;
  lastName: string | null;
  rewardName: string;
  rarity: string;
}): Promise<void> {
  const displayName = anonymizeCustomerName(params.firstName, params.lastName);

  await logActivity({
    boxId: params.boxId,
    shop: params.shop,
    activityType: "PITY_TRIGGERED",
    customerId: params.customerId,
    displayName,
    data: {
      rewardName: params.rewardName,
      rarity: params.rarity,
    },
  });
}

/**
 * Log a free open claim
 */
export async function logFreeOpenClaimed(params: {
  boxId: string;
  shop: string;
  customerId: string;
  firstName: string | null;
  lastName: string | null;
}): Promise<void> {
  const displayName = anonymizeCustomerName(params.firstName, params.lastName);

  await logActivity({
    boxId: params.boxId,
    shop: params.shop,
    activityType: "FREE_OPEN_CLAIMED",
    customerId: params.customerId,
    displayName,
    data: {},
  });
}

// ============================================
// ACTIVITY RETRIEVAL
// ============================================

/**
 * Get activity feed for a mystery box
 */
export async function getActivityFeed(params: {
  boxId?: string;
  shop: string;
  limit?: number;
  includeExpired?: boolean;
}): Promise<ActivityFeedItem[]> {
  const { boxId, shop, limit = 10, includeExpired = false } = params;

  const now = new Date();

  const activities = await prisma.mysteryBoxActivity.findMany({
    where: {
      shop,
      ...(boxId && { boxId }),
      isPublic: true,
      ...(!includeExpired && {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return activities.map((activity) => {
    const data = activity.data as Record<string, unknown>;
    const rarity = data.rarity as string | undefined;

    return {
      id: activity.id,
      activityType: activity.activityType,
      displayName: activity.displayName,
      data: {
        rewardName: data.rewardName as string | undefined,
        rarity,
        pointsWon: data.pointsWon as number | undefined,
        streakDays: data.streakDays as number | undefined,
        luckyStreakCount: data.luckyStreakCount as number | undefined,
        boxName: data.boxName as string | undefined,
      },
      timeAgo: formatTimeAgo(activity.createdAt),
      emoji: "", // Deprecated
      iconId: getActivityIconId(activity.activityType, rarity),
      createdAt: activity.createdAt,
    };
  });
}

/**
 * Get recent winners for a specific box (for display on box card)
 */
export async function getRecentWinners(params: {
  boxId: string;
  shop: string;
  limit?: number;
  minRarity?: MysteryBoxRarity;
}): Promise<ActivityFeedItem[]> {
  const { boxId, shop, limit = 5, minRarity } = params;

  const now = new Date();
  const rarityFilter =
    minRarity === "UNCOMMON"
      ? ["RARE_WIN", "EPIC_WIN", "LEGENDARY_WIN"]
      : minRarity === "RARE"
        ? ["RARE_WIN", "EPIC_WIN", "LEGENDARY_WIN"]
        : minRarity === "EPIC"
          ? ["EPIC_WIN", "LEGENDARY_WIN"]
          : minRarity === "LEGENDARY"
            ? ["LEGENDARY_WIN"]
            : ["BOX_OPENED", "RARE_WIN", "EPIC_WIN", "LEGENDARY_WIN"];

  const activities = await prisma.mysteryBoxActivity.findMany({
    where: {
      boxId,
      shop,
      isPublic: true,
      activityType: { in: rarityFilter as MysteryBoxActivityType[] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return activities.map((activity) => {
    const data = activity.data as Record<string, unknown>;
    const rarity = data.rarity as string | undefined;

    return {
      id: activity.id,
      activityType: activity.activityType,
      displayName: activity.displayName,
      data: {
        rewardName: data.rewardName as string | undefined,
        rarity,
        boxName: data.boxName as string | undefined,
      },
      timeAgo: formatTimeAgo(activity.createdAt),
      emoji: "", // Deprecated
      iconId: getActivityIconId(activity.activityType, rarity),
      createdAt: activity.createdAt,
    };
  });
}

/**
 * Clean up expired activities (can be run periodically)
 */
export async function cleanupExpiredActivities(shop?: string): Promise<number> {
  const now = new Date();

  const result = await prisma.mysteryBoxActivity.deleteMany({
    where: {
      ...(shop && { shop }),
      expiresAt: { lt: now },
    },
  });

  if (result.count > 0) {
    console.log(
      `${LOG_PREFIX} Cleaned up ${result.count} expired activities${shop ? ` for shop ${shop}` : ""}`
    );
  }

  return result.count;
}
