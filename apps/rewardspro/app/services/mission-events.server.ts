/**
 * Mission Events Service
 *
 * Creates and manages mission completion events for triggering
 * storefront animations (confetti, level-ups, streak fire, etc.)
 *
 * Events are consumed by the storefront widget and acknowledged
 * after being displayed to the customer.
 */

import db from "../db.server";
import type { MissionEventType } from "@prisma/client";
import type { XpAwardResult } from "./mission-xp.server";
import type { StreakInfo } from "./mission-streak.server";
import type { ComboInfo } from "./mission-combo.server";

const LOG_PREFIX = "[MissionEvents]";

// ============================================
// TYPES
// ============================================

export interface MissionEvent {
  id: string;
  eventType: MissionEventType;
  xpEarned: number;
  bonusXp: number;
  triggersConfetti: boolean;
  triggersLevelUp: boolean;
  triggersStreakFire: boolean;
  payload: EventPayload | null;
  createdAt: Date;
}

export interface EventPayload {
  // XP & Level info
  totalXp?: number;
  previousLevel?: number;
  newLevel?: number;
  xpProgress?: number;
  xpToNextLevel?: number;

  // Streak info
  streakCount?: number;
  streakEmoji?: string;
  streakLabel?: string;
  streakBonus?: number;
  isNewStreak?: boolean;
  streakBroken?: boolean;

  // Combo info
  comboCount?: number;
  comboBonus?: number;
  isMaxCombo?: boolean;

  // Mission info
  missionName?: string;
  missionRarity?: string;
  rewardDescription?: string;

  // Milestone info
  milestoneType?: string;
  milestoneValue?: number;
}

export interface CreateEventInput {
  shop: string;
  customerId: string;
  challengeId: string;
  eventType: MissionEventType;
  xpEarned?: number;
  bonusXp?: number;
  triggersConfetti?: boolean;
  triggersLevelUp?: boolean;
  triggersStreakFire?: boolean;
  payload?: EventPayload;
}

// Animation trigger thresholds
const STREAK_FIRE_THRESHOLD = 3; // Show fire animation at 3+ day streak
const CONFETTI_XP_THRESHOLD = 50; // Show confetti for 50+ XP gains

// ============================================
// EVENT CREATION FUNCTIONS
// ============================================

/**
 * Create a mission completion event with all associated data
 */
export async function createCompletionEvent(
  shop: string,
  customerId: string,
  challengeId: string,
  missionName: string,
  missionRarity: string,
  rewardDescription: string,
  xpResult: XpAwardResult,
  streakInfo: StreakInfo,
  comboInfo: ComboInfo
): Promise<MissionEvent> {
  const totalXpEarned = xpResult.xpEarned + xpResult.bonusXp;

  // Determine animation triggers
  const triggersConfetti = totalXpEarned >= CONFETTI_XP_THRESHOLD || xpResult.leveledUp;
  const triggersLevelUp = xpResult.leveledUp;
  const triggersStreakFire =
    streakInfo.currentStreak >= STREAK_FIRE_THRESHOLD && streakInfo.isNewStreak;

  const payload: EventPayload = {
    // XP info
    totalXp: xpResult.totalXp,
    previousLevel: xpResult.previousLevel,
    newLevel: xpResult.newLevel,
    xpProgress: xpResult.xpProgress,
    xpToNextLevel: xpResult.xpToNextLevel,

    // Streak info
    streakCount: streakInfo.currentStreak,
    streakEmoji: streakInfo.streakEmoji,
    streakLabel: streakInfo.streakLabel,
    streakBonus: streakInfo.bonusPercent,
    isNewStreak: streakInfo.isNewStreak,
    streakBroken: streakInfo.streakBroken,

    // Combo info
    comboCount: comboInfo.todayComboCount,
    comboBonus: comboInfo.bonusPercent,
    isMaxCombo: comboInfo.isMaxCombo,

    // Mission info
    missionName,
    missionRarity,
    rewardDescription,
  };

  const event = await db.missionCompletionEvent.create({
    data: {
      shop,
      customerId,
      challengeId,
      eventType: "COMPLETE",
      xpEarned: xpResult.xpEarned,
      bonusXp: xpResult.bonusXp,
      triggersConfetti,
      triggersLevelUp,
      triggersStreakFire,
      payload,
    },
  });

  console.log(
    `${LOG_PREFIX} Created completion event for customer ${customerId}: ` +
      `+${totalXpEarned} XP, confetti=${triggersConfetti}, levelUp=${triggersLevelUp}, ` +
      `streakFire=${triggersStreakFire}`
  );

  return {
    id: event.id,
    eventType: event.eventType,
    xpEarned: event.xpEarned,
    bonusXp: event.bonusXp,
    triggersConfetti: event.triggersConfetti,
    triggersLevelUp: event.triggersLevelUp,
    triggersStreakFire: event.triggersStreakFire,
    payload: event.payload as EventPayload | null,
    createdAt: event.createdAt,
  };
}

/**
 * Create a level-up specific event
 */
export async function createLevelUpEvent(
  shop: string,
  customerId: string,
  challengeId: string,
  previousLevel: number,
  newLevel: number,
  totalXp: number
): Promise<MissionEvent> {
  const payload: EventPayload = {
    previousLevel,
    newLevel,
    totalXp,
    milestoneType: "LEVEL_UP",
    milestoneValue: newLevel,
  };

  const event = await db.missionCompletionEvent.create({
    data: {
      shop,
      customerId,
      challengeId,
      eventType: "LEVEL_UP",
      xpEarned: 0,
      bonusXp: 0,
      triggersConfetti: true,
      triggersLevelUp: true,
      triggersStreakFire: false,
      payload,
    },
  });

  console.log(
    `${LOG_PREFIX} Created level-up event for customer ${customerId}: Level ${previousLevel} -> ${newLevel}`
  );

  return formatEvent(event);
}

/**
 * Create a streak milestone event
 */
export async function createStreakMilestoneEvent(
  shop: string,
  customerId: string,
  challengeId: string,
  streakInfo: StreakInfo
): Promise<MissionEvent> {
  const payload: EventPayload = {
    streakCount: streakInfo.currentStreak,
    streakEmoji: streakInfo.streakEmoji,
    streakLabel: streakInfo.streakLabel,
    streakBonus: streakInfo.bonusPercent,
    milestoneType: "STREAK",
    milestoneValue: streakInfo.currentStreak,
  };

  const event = await db.missionCompletionEvent.create({
    data: {
      shop,
      customerId,
      challengeId,
      eventType: "STREAK",
      xpEarned: 0,
      bonusXp: 0,
      triggersConfetti: streakInfo.currentStreak >= 7,
      triggersLevelUp: false,
      triggersStreakFire: true,
      payload,
    },
  });

  console.log(
    `${LOG_PREFIX} Created streak milestone event for customer ${customerId}: ` +
      `${streakInfo.currentStreak}-day streak ${streakInfo.streakEmoji}`
  );

  return formatEvent(event);
}

/**
 * Create a combo milestone event
 */
export async function createComboMilestoneEvent(
  shop: string,
  customerId: string,
  challengeId: string,
  comboInfo: ComboInfo
): Promise<MissionEvent> {
  const payload: EventPayload = {
    comboCount: comboInfo.todayComboCount,
    comboBonus: comboInfo.bonusPercent,
    isMaxCombo: comboInfo.isMaxCombo,
    milestoneType: "COMBO",
    milestoneValue: comboInfo.todayComboCount,
  };

  const event = await db.missionCompletionEvent.create({
    data: {
      shop,
      customerId,
      challengeId,
      eventType: "COMBO",
      xpEarned: 0,
      bonusXp: 0,
      triggersConfetti: comboInfo.isMaxCombo,
      triggersLevelUp: false,
      triggersStreakFire: false,
      payload,
    },
  });

  console.log(
    `${LOG_PREFIX} Created combo milestone event for customer ${customerId}: ` +
      `${comboInfo.todayComboCount}x combo (+${comboInfo.bonusPercent}% bonus)`
  );

  return formatEvent(event);
}

/**
 * Create a reward claim event
 */
export async function createClaimEvent(
  shop: string,
  customerId: string,
  challengeId: string,
  missionName: string,
  rewardDescription: string
): Promise<MissionEvent> {
  const payload: EventPayload = {
    missionName,
    rewardDescription,
  };

  const event = await db.missionCompletionEvent.create({
    data: {
      shop,
      customerId,
      challengeId,
      eventType: "CLAIM",
      xpEarned: 0,
      bonusXp: 0,
      triggersConfetti: true,
      triggersLevelUp: false,
      triggersStreakFire: false,
      payload,
    },
  });

  console.log(
    `${LOG_PREFIX} Created claim event for customer ${customerId}: ${missionName}`
  );

  return formatEvent(event);
}

// ============================================
// EVENT RETRIEVAL FUNCTIONS
// ============================================

/**
 * Get unacknowledged events for a customer (for storefront polling)
 */
export async function getUnacknowledgedEvents(
  shop: string,
  customerId: string,
  limit: number = 10
): Promise<MissionEvent[]> {
  const events = await db.missionCompletionEvent.findMany({
    where: {
      shop,
      customerId,
      acknowledged: false,
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  return events.map(formatEvent);
}

/**
 * Get recent events for a customer (for activity feed)
 */
export async function getRecentEvents(
  shop: string,
  customerId: string,
  limit: number = 20
): Promise<MissionEvent[]> {
  const events = await db.missionCompletionEvent.findMany({
    where: { shop, customerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return events.map(formatEvent);
}

/**
 * Acknowledge events (mark as displayed to customer)
 */
export async function acknowledgeEvents(eventIds: string[]): Promise<number> {
  const result = await db.missionCompletionEvent.updateMany({
    where: { id: { in: eventIds } },
    data: { acknowledged: true },
  });

  console.log(`${LOG_PREFIX} Acknowledged ${result.count} events`);
  return result.count;
}

/**
 * Acknowledge a single event
 */
export async function acknowledgeEvent(eventId: string): Promise<boolean> {
  try {
    await db.missionCompletionEvent.update({
      where: { id: eventId },
      data: { acknowledged: true },
    });
    return true;
  } catch {
    return false;
  }
}

// ============================================
// CLEANUP FUNCTIONS
// ============================================

/**
 * Clean up old acknowledged events (run periodically)
 */
export async function cleanupOldEvents(
  shop: string,
  daysOld: number = 30
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await db.missionCompletionEvent.deleteMany({
    where: {
      shop,
      acknowledged: true,
      createdAt: { lt: cutoffDate },
    },
  });

  if (result.count > 0) {
    console.log(`${LOG_PREFIX} Cleaned up ${result.count} old events for shop ${shop}`);
  }

  return result.count;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatEvent(event: {
  id: string;
  eventType: MissionEventType;
  xpEarned: number;
  bonusXp: number;
  triggersConfetti: boolean;
  triggersLevelUp: boolean;
  triggersStreakFire: boolean;
  payload: unknown;
  createdAt: Date;
}): MissionEvent {
  return {
    id: event.id,
    eventType: event.eventType,
    xpEarned: event.xpEarned,
    bonusXp: event.bonusXp,
    triggersConfetti: event.triggersConfetti,
    triggersLevelUp: event.triggersLevelUp,
    triggersStreakFire: event.triggersStreakFire,
    payload: event.payload as EventPayload | null,
    createdAt: event.createdAt,
  };
}
