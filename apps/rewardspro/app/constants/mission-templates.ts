/**
 * Mission Templates - Shared Constants
 *
 * These types and templates can be used on both client and server.
 * Server-only utilities are in mission-templates.server.ts
 */

import type {
  ChallengeObjectiveType,
  ChallengeRewardType,
} from "../services/challenge-management.server";

// ============================================
// TYPES
// ============================================

export type MissionCadence = "DAILY" | "WEEKLY" | "MONTHLY" | "SPECIAL";
export type MissionRarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
export type MissionCategory = "SHOPPING" | "DISCOVERY" | "SOCIAL" | "STREAK" | "CHALLENGE";

export interface MissionTemplate {
  id: string;
  name: string;
  description: string;
  cadence: MissionCadence;
  rarity: MissionRarity;
  category: MissionCategory;
  objectiveType: ChallengeObjectiveType;
  targetValue: number;
  objectiveConfig?: Record<string, unknown>;
  rewardType: ChallengeRewardType;
  rewardValue: Record<string, unknown>;
  rewardDescription: string;
  xpReward: number;
  iconEmoji: string;
  durationDays: number;
}

// ============================================
// DAILY MISSION TEMPLATES
// ============================================

export const DAILY_TEMPLATES: MissionTemplate[] = [
  {
    id: "daily-first-purchase",
    name: "Daily Shopper",
    description: "Make any purchase today to earn bonus points",
    cadence: "DAILY",
    rarity: "COMMON",
    category: "SHOPPING",
    objectiveType: "ORDER_COUNT",
    targetValue: 1,
    rewardType: "POINTS",
    rewardValue: { amount: 50 },
    rewardDescription: "50 bonus points",
    xpReward: 10,
    iconEmoji: "🛒",
    durationDays: 1,
  },
  {
    id: "daily-spend-25",
    name: "Quick Spend",
    description: "Spend $25 or more in a single order",
    cadence: "DAILY",
    rarity: "COMMON",
    category: "SHOPPING",
    objectiveType: "SPENDING",
    targetValue: 25,
    rewardType: "POINTS",
    rewardValue: { amount: 75 },
    rewardDescription: "75 bonus points",
    xpReward: 15,
    iconEmoji: "💰",
    durationDays: 1,
  },
  {
    id: "daily-spend-50",
    name: "Big Spender",
    description: "Spend $50 or more in a single order",
    cadence: "DAILY",
    rarity: "UNCOMMON",
    category: "SHOPPING",
    objectiveType: "SPENDING",
    targetValue: 50,
    rewardType: "POINTS",
    rewardValue: { amount: 150 },
    rewardDescription: "150 bonus points",
    xpReward: 25,
    iconEmoji: "💎",
    durationDays: 1,
  },
  {
    id: "daily-double-order",
    name: "Double Down",
    description: "Place 2 orders today",
    cadence: "DAILY",
    rarity: "UNCOMMON",
    category: "SHOPPING",
    objectiveType: "ORDER_COUNT",
    targetValue: 2,
    rewardType: "POINTS",
    rewardValue: { amount: 100 },
    rewardDescription: "100 bonus points",
    xpReward: 20,
    iconEmoji: "✌️",
    durationDays: 1,
  },
  {
    id: "daily-review",
    name: "Voice Heard",
    description: "Leave a product review today",
    cadence: "DAILY",
    rarity: "COMMON",
    category: "SOCIAL",
    objectiveType: "REVIEW",
    targetValue: 1,
    rewardType: "POINTS",
    rewardValue: { amount: 50 },
    rewardDescription: "50 bonus points",
    xpReward: 15,
    iconEmoji: "⭐",
    durationDays: 1,
  },
];

// ============================================
// WEEKLY MISSION TEMPLATES
// ============================================

export const WEEKLY_TEMPLATES: MissionTemplate[] = [
  {
    id: "weekly-triple-order",
    name: "Loyal Customer",
    description: "Place 3 orders this week",
    cadence: "WEEKLY",
    rarity: "COMMON",
    category: "SHOPPING",
    objectiveType: "ORDER_COUNT",
    targetValue: 3,
    rewardType: "POINTS",
    rewardValue: { amount: 200 },
    rewardDescription: "200 bonus points",
    xpReward: 50,
    iconEmoji: "🏆",
    durationDays: 7,
  },
  {
    id: "weekly-spend-100",
    name: "Weekly Spender",
    description: "Spend $100 or more this week",
    cadence: "WEEKLY",
    rarity: "COMMON",
    category: "SHOPPING",
    objectiveType: "SPENDING",
    targetValue: 100,
    rewardType: "POINTS",
    rewardValue: { amount: 250 },
    rewardDescription: "250 bonus points",
    xpReward: 60,
    iconEmoji: "💵",
    durationDays: 7,
  },
  {
    id: "weekly-spend-200",
    name: "Power Shopper",
    description: "Spend $200 or more this week",
    cadence: "WEEKLY",
    rarity: "UNCOMMON",
    category: "SHOPPING",
    objectiveType: "SPENDING",
    targetValue: 200,
    rewardType: "STORE_CREDIT",
    rewardValue: { amount: 1000 },
    rewardDescription: "$10 store credit",
    xpReward: 100,
    iconEmoji: "🔥",
    durationDays: 7,
  },
  {
    id: "weekly-referral",
    name: "Friend Finder",
    description: "Refer a friend who makes a purchase",
    cadence: "WEEKLY",
    rarity: "UNCOMMON",
    category: "SOCIAL",
    objectiveType: "REFERRAL",
    targetValue: 1,
    objectiveConfig: { requirePurchase: true },
    rewardType: "STORE_CREDIT",
    rewardValue: { amount: 500 },
    rewardDescription: "$5 store credit",
    xpReward: 75,
    iconEmoji: "👥",
    durationDays: 7,
  },
  {
    id: "weekly-reviews",
    name: "Review Champion",
    description: "Leave 3 product reviews this week",
    cadence: "WEEKLY",
    rarity: "UNCOMMON",
    category: "SOCIAL",
    objectiveType: "REVIEW",
    targetValue: 3,
    rewardType: "POINTS",
    rewardValue: { amount: 300 },
    rewardDescription: "300 bonus points",
    xpReward: 80,
    iconEmoji: "📝",
    durationDays: 7,
  },
  {
    id: "weekly-5-orders",
    name: "Shopping Streak",
    description: "Place 5 orders this week",
    cadence: "WEEKLY",
    rarity: "RARE",
    category: "SHOPPING",
    objectiveType: "ORDER_COUNT",
    targetValue: 5,
    rewardType: "DISCOUNT",
    rewardValue: { type: "percentage", value: 15, maxUses: 1 },
    rewardDescription: "15% off your next order",
    xpReward: 125,
    iconEmoji: "⚡",
    durationDays: 7,
  },
];

// ============================================
// MONTHLY MISSION TEMPLATES
// ============================================

export const MONTHLY_TEMPLATES: MissionTemplate[] = [
  {
    id: "monthly-10-orders",
    name: "Monthly Maven",
    description: "Place 10 orders this month",
    cadence: "MONTHLY",
    rarity: "UNCOMMON",
    category: "SHOPPING",
    objectiveType: "ORDER_COUNT",
    targetValue: 10,
    rewardType: "STORE_CREDIT",
    rewardValue: { amount: 2000 },
    rewardDescription: "$20 store credit",
    xpReward: 200,
    iconEmoji: "👑",
    durationDays: 30,
  },
  {
    id: "monthly-spend-500",
    name: "VIP Spender",
    description: "Spend $500 or more this month",
    cadence: "MONTHLY",
    rarity: "RARE",
    category: "SHOPPING",
    objectiveType: "SPENDING",
    targetValue: 500,
    rewardType: "STORE_CREDIT",
    rewardValue: { amount: 2500 },
    rewardDescription: "$25 store credit",
    xpReward: 250,
    iconEmoji: "💎",
    durationDays: 30,
  },
  {
    id: "monthly-spend-1000",
    name: "Elite Shopper",
    description: "Spend $1,000 or more this month",
    cadence: "MONTHLY",
    rarity: "EPIC",
    category: "SHOPPING",
    objectiveType: "SPENDING",
    targetValue: 1000,
    rewardType: "STORE_CREDIT",
    rewardValue: { amount: 7500 },
    rewardDescription: "$75 store credit",
    xpReward: 500,
    iconEmoji: "🏅",
    durationDays: 30,
  },
  {
    id: "monthly-3-referrals",
    name: "Social Butterfly",
    description: "Refer 3 friends who make purchases",
    cadence: "MONTHLY",
    rarity: "RARE",
    category: "SOCIAL",
    objectiveType: "REFERRAL",
    targetValue: 3,
    objectiveConfig: { requirePurchase: true },
    rewardType: "STORE_CREDIT",
    rewardValue: { amount: 2000 },
    rewardDescription: "$20 store credit",
    xpReward: 200,
    iconEmoji: "🦋",
    durationDays: 30,
  },
  {
    id: "monthly-5-reviews",
    name: "Voice of the Community",
    description: "Leave 5 product reviews this month",
    cadence: "MONTHLY",
    rarity: "UNCOMMON",
    category: "SOCIAL",
    objectiveType: "REVIEW",
    targetValue: 5,
    rewardType: "POINTS",
    rewardValue: { amount: 500 },
    rewardDescription: "500 bonus points",
    xpReward: 150,
    iconEmoji: "📣",
    durationDays: 30,
  },
  {
    id: "monthly-15-orders",
    name: "Super Shopper",
    description: "Place 15 orders this month",
    cadence: "MONTHLY",
    rarity: "EPIC",
    category: "SHOPPING",
    objectiveType: "ORDER_COUNT",
    targetValue: 15,
    rewardType: "DISCOUNT",
    rewardValue: { type: "percentage", value: 25, maxUses: 1 },
    rewardDescription: "25% off your next order",
    xpReward: 400,
    iconEmoji: "🚀",
    durationDays: 30,
  },
];

// ============================================
// SPECIAL MISSION TEMPLATES
// ============================================

export const SPECIAL_TEMPLATES: MissionTemplate[] = [
  {
    id: "special-first-purchase",
    name: "Welcome Bonus",
    description: "Make your first purchase and get rewarded!",
    cadence: "SPECIAL",
    rarity: "COMMON",
    category: "SHOPPING",
    objectiveType: "ORDER_COUNT",
    targetValue: 1,
    rewardType: "POINTS",
    rewardValue: { amount: 100 },
    rewardDescription: "100 welcome points",
    xpReward: 25,
    iconEmoji: "🎉",
    durationDays: 30,
  },
  {
    id: "special-spend-250",
    name: "Milestone: $250 Spent",
    description: "Spend $250 to unlock a special reward",
    cadence: "SPECIAL",
    rarity: "UNCOMMON",
    category: "CHALLENGE",
    objectiveType: "SPENDING",
    targetValue: 250,
    rewardType: "STORE_CREDIT",
    rewardValue: { amount: 1500 },
    rewardDescription: "$15 store credit",
    xpReward: 100,
    iconEmoji: "🎯",
    durationDays: 60,
  },
  {
    id: "special-spend-500",
    name: "Milestone: $500 Spent",
    description: "Spend $500 to become a valued customer",
    cadence: "SPECIAL",
    rarity: "RARE",
    category: "CHALLENGE",
    objectiveType: "SPENDING",
    targetValue: 500,
    rewardType: "STORE_CREDIT",
    rewardValue: { amount: 3500 },
    rewardDescription: "$35 store credit",
    xpReward: 200,
    iconEmoji: "⭐",
    durationDays: 90,
  },
  {
    id: "special-spend-1000",
    name: "VIP Achievement",
    description: "Spend $1,000 and achieve VIP status",
    cadence: "SPECIAL",
    rarity: "EPIC",
    category: "CHALLENGE",
    objectiveType: "SPENDING",
    targetValue: 1000,
    rewardType: "STORE_CREDIT",
    rewardValue: { amount: 10000 },
    rewardDescription: "$100 store credit",
    xpReward: 500,
    iconEmoji: "💎",
    durationDays: 180,
  },
  {
    id: "special-5-referrals",
    name: "Ambassador Program",
    description: "Refer 5 friends and become a brand ambassador",
    cadence: "SPECIAL",
    rarity: "EPIC",
    category: "SOCIAL",
    objectiveType: "REFERRAL",
    targetValue: 5,
    objectiveConfig: { requirePurchase: true },
    rewardType: "STORE_CREDIT",
    rewardValue: { amount: 5000 },
    rewardDescription: "$50 store credit",
    xpReward: 300,
    iconEmoji: "🌟",
    durationDays: 90,
  },
  {
    id: "special-10-referrals",
    name: "Super Ambassador",
    description: "Refer 10 friends for legendary rewards",
    cadence: "SPECIAL",
    rarity: "LEGENDARY",
    category: "SOCIAL",
    objectiveType: "REFERRAL",
    targetValue: 10,
    objectiveConfig: { requirePurchase: true },
    rewardType: "STORE_CREDIT",
    rewardValue: { amount: 15000 },
    rewardDescription: "$150 store credit",
    xpReward: 750,
    iconEmoji: "👑",
    durationDays: 180,
  },
  {
    id: "special-review-10",
    name: "Top Reviewer",
    description: "Leave 10 helpful reviews",
    cadence: "SPECIAL",
    rarity: "RARE",
    category: "SOCIAL",
    objectiveType: "REVIEW",
    targetValue: 10,
    rewardType: "STORE_CREDIT",
    rewardValue: { amount: 2500 },
    rewardDescription: "$25 store credit",
    xpReward: 200,
    iconEmoji: "📝",
    durationDays: 90,
  },
  {
    id: "special-20-orders",
    name: "Order Master",
    description: "Complete 20 orders to prove your loyalty",
    cadence: "SPECIAL",
    rarity: "EPIC",
    category: "CHALLENGE",
    objectiveType: "ORDER_COUNT",
    targetValue: 20,
    rewardType: "DISCOUNT",
    rewardValue: { type: "percentage", value: 30, maxUses: 1 },
    rewardDescription: "30% off your next order",
    xpReward: 400,
    iconEmoji: "🏆",
    durationDays: 120,
  },
];

// ============================================
// COMBINED EXPORTS
// ============================================

export const ALL_TEMPLATES: MissionTemplate[] = [
  ...DAILY_TEMPLATES,
  ...WEEKLY_TEMPLATES,
  ...MONTHLY_TEMPLATES,
  ...SPECIAL_TEMPLATES,
];

export const TEMPLATES_BY_CADENCE: Record<MissionCadence, MissionTemplate[]> = {
  DAILY: DAILY_TEMPLATES,
  WEEKLY: WEEKLY_TEMPLATES,
  MONTHLY: MONTHLY_TEMPLATES,
  SPECIAL: SPECIAL_TEMPLATES,
};

/**
 * Get templates by cadence
 */
export function getTemplatesByCadence(cadence: MissionCadence): MissionTemplate[] {
  return TEMPLATES_BY_CADENCE[cadence] || [];
}

/**
 * Get a specific template by ID
 */
export function getTemplateById(id: string): MissionTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.id === id);
}

/**
 * Calculate start and end dates based on cadence (client-safe)
 */
export function calculateMissionDates(cadence: MissionCadence, durationDays: number): { startsAt: Date; endsAt: Date } {
  const now = new Date();
  const startsAt = new Date(now);
  const endsAt = new Date(now);

  switch (cadence) {
    case "DAILY":
      endsAt.setHours(23, 59, 59, 999);
      break;
    case "WEEKLY":
      endsAt.setDate(endsAt.getDate() + 7);
      endsAt.setHours(23, 59, 59, 999);
      break;
    case "MONTHLY":
      endsAt.setMonth(endsAt.getMonth() + 1);
      endsAt.setDate(0);
      endsAt.setHours(23, 59, 59, 999);
      break;
    case "SPECIAL":
    default:
      endsAt.setDate(endsAt.getDate() + durationDays);
      endsAt.setHours(23, 59, 59, 999);
      break;
  }

  return { startsAt, endsAt };
}
