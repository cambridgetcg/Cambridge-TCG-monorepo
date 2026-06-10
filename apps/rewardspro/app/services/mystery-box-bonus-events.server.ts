/**
 * Mystery Box Bonus Events Service
 *
 * Manages time-limited bonus events that encourage engagement.
 *
 * Event Types:
 * - HAPPY_HOUR: Discount on point cost during specific hours
 * - FLASH_DISCOUNT: Short-duration big discount
 * - DOUBLE_REWARDS: 2x multiplier on reward values
 * - LUCKY_HOUR: Increased rare drop rates
 * - LAST_CHANCE: Final hours before box closes
 *
 * Events can be:
 * - One-time (specific start/end dates)
 * - Recurring (same hours on specific days)
 */

import prisma from "../db.server";
import { MysteryBoxBonusEventType } from "@prisma/client";

const LOG_PREFIX = "[MysteryBoxBonusEvents]";

// ============================================
// TYPES
// ============================================

export interface BonusEventInfo {
  id: string;
  name: string;
  description: string | null;
  eventType: MysteryBoxBonusEventType;
  discountPercent: number;
  bonusMultiplier: number;
  extraRewardChance: number;
  endsAt: Date;
  timeRemaining: string | null;
  secondsRemaining: number;
}

export interface ActiveBonusResult {
  event: BonusEventInfo | null;
  discountPercent: number;
  bonusMultiplier: number;
  extraRewardChance: number;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format time remaining string
 */
export function formatTimeRemaining(endsAt: Date): string | null {
  const now = new Date();
  const diffMs = endsAt.getTime() - now.getTime();

  if (diffMs <= 0) return null;

  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((diffMs % (60 * 1000)) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Calculate seconds remaining
 */
export function calculateSecondsRemaining(endsAt: Date): number {
  const now = new Date();
  const diffMs = endsAt.getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / 1000));
}

/**
 * Get iconId for event type
 */
export function getEventIconId(eventType: MysteryBoxBonusEventType): string {
  switch (eventType) {
    case "HAPPY_HOUR":
      return "clock";
    case "FLASH_DISCOUNT":
      return "zap";
    case "DOUBLE_REWARDS":
      return "sparkle";
    case "LUCKY_HOUR":
      return "star";
    case "LAST_CHANCE":
      return "alert-circle";
    default:
      return "gift";
  }
}

/**
 * @deprecated Use getEventIconId instead
 */
export function getEventEmoji(eventType: MysteryBoxBonusEventType): string {
  return ""; // Deprecated
}

/**
 * Check if current time matches recurring schedule
 */
export function isWithinRecurringWindow(
  recurringDays: number[] | null,
  recurringHours: { start: number; end: number } | null
): boolean {
  if (!recurringDays || !recurringHours) return false;

  const now = new Date();
  const currentDay = now.getUTCDay(); // 0 = Sunday
  const currentHour = now.getUTCHours();

  if (!recurringDays.includes(currentDay)) return false;

  return (
    currentHour >= recurringHours.start && currentHour < recurringHours.end
  );
}

/**
 * Calculate effective end time for recurring events
 */
export function getRecurringEventEndTime(
  recurringHours: { start: number; end: number }
): Date {
  const now = new Date();
  const endTime = new Date(now);
  endTime.setUTCHours(recurringHours.end, 0, 0, 0);

  // If end time has passed today, it's for tomorrow
  if (endTime <= now) {
    endTime.setUTCDate(endTime.getUTCDate() + 1);
  }

  return endTime;
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Get active bonus events for a mystery box
 */
export async function getActiveBonusEvents(params: {
  shop: string;
  boxId?: string;
}): Promise<BonusEventInfo[]> {
  const { shop, boxId } = params;
  const now = new Date();

  // Get active events — use AND to combine two OR conditions
  const allEvents = await prisma.mysteryBoxBonusEvent.findMany({
    where: {
      shop,
      isActive: true,
      startsAt: { lte: now },
      endsAt: { gt: now },
      AND: [
        {
          OR: [
            { boxId: null }, // Global events
            ...(boxId ? [{ boxId }] : []),
          ],
        },
      ],
    },
    orderBy: [{ discountPercent: "desc" }, { bonusMultiplier: "desc" }] as any,
  });

  // Filter out events that have exceeded maxUses (can't compare two columns in Prisma/Data API)
  const events = allEvents.filter((e: any) =>
    e.maxUses === null || e.currentUses < e.maxUses
  );

  const result: BonusEventInfo[] = [];

  for (const event of events) {
    // Check recurring schedule if applicable
    if (event.isRecurring) {
      const recurringDays = event.recurringDays as number[] | null;
      const recurringHours = event.recurringHours as {
        start: number;
        end: number;
      } | null;

      if (!isWithinRecurringWindow(recurringDays, recurringHours)) {
        continue; // Skip if not within recurring window
      }

      // Use recurring end time
      const effectiveEndTime = recurringHours
        ? getRecurringEventEndTime(recurringHours)
        : event.endsAt;

      result.push({
        id: event.id,
        name: event.name,
        description: event.description,
        eventType: event.eventType,
        discountPercent: event.discountPercent,
        bonusMultiplier: Number(event.bonusMultiplier),
        extraRewardChance: event.extraRewardChance,
        endsAt: effectiveEndTime,
        timeRemaining: formatTimeRemaining(effectiveEndTime),
        secondsRemaining: calculateSecondsRemaining(effectiveEndTime),
      });
    } else {
      result.push({
        id: event.id,
        name: event.name,
        description: event.description,
        eventType: event.eventType,
        discountPercent: event.discountPercent,
        bonusMultiplier: Number(event.bonusMultiplier),
        extraRewardChance: event.extraRewardChance,
        endsAt: event.endsAt,
        timeRemaining: formatTimeRemaining(event.endsAt),
        secondsRemaining: calculateSecondsRemaining(event.endsAt),
      });
    }
  }

  return result;
}

/**
 * Get the best active bonus event for a customer
 * Returns the event with highest discount + multiplier combo
 */
export async function getBestBonusEvent(params: {
  shop: string;
  boxId?: string;
  customerId?: string;
}): Promise<ActiveBonusResult> {
  const { shop, boxId, customerId } = params;

  const events = await getActiveBonusEvents({ shop, boxId });

  if (events.length === 0) {
    return {
      event: null,
      discountPercent: 0,
      bonusMultiplier: 1,
      extraRewardChance: 0,
    };
  }

  // If customer provided, check per-customer usage limits
  let eligibleEvents = events;
  if (customerId) {
    const customerUsages = await prisma.mysteryBoxBonusEventUsage.findMany({
      where: {
        customerId,
        eventId: { in: events.map((e) => e.id) },
      },
    });

    const usageCounts = new Map<string, number>();
    for (const usage of customerUsages) {
      usageCounts.set(usage.eventId, (usageCounts.get(usage.eventId) || 0) + 1);
    }

    // Get events with per-customer limits
    const eventsWithLimits = await prisma.mysteryBoxBonusEvent.findMany({
      where: {
        id: { in: events.map((e) => e.id) },
        maxUsesPerCustomer: { not: null },
      },
      select: { id: true, maxUsesPerCustomer: true },
    });

    const limitMap = new Map(
      eventsWithLimits.map((e) => [e.id, e.maxUsesPerCustomer!])
    );

    eligibleEvents = events.filter((e) => {
      const limit = limitMap.get(e.id);
      if (!limit) return true;
      const used = usageCounts.get(e.id) || 0;
      return used < limit;
    });
  }

  if (eligibleEvents.length === 0) {
    return {
      event: null,
      discountPercent: 0,
      bonusMultiplier: 1,
      extraRewardChance: 0,
    };
  }

  // Pick the best event (highest value combination)
  const bestEvent = eligibleEvents.reduce((best, current) => {
    const bestValue = best.discountPercent + (best.bonusMultiplier - 1) * 100;
    const currentValue =
      current.discountPercent + (current.bonusMultiplier - 1) * 100;
    return currentValue > bestValue ? current : best;
  }, eligibleEvents[0]);

  return {
    event: bestEvent,
    discountPercent: bestEvent.discountPercent,
    bonusMultiplier: bestEvent.bonusMultiplier,
    extraRewardChance: bestEvent.extraRewardChance,
  };
}

/**
 * Record bonus event usage
 */
export async function recordBonusEventUsage(params: {
  eventId: string;
  customerId: string;
  shop: string;
}): Promise<void> {
  const { eventId, customerId, shop } = params;

  try {
    // Create usage record
    await prisma.mysteryBoxBonusEventUsage.create({
      data: {
        eventId,
        customerId,
        shop,
      },
    });

    // Increment current uses
    await prisma.mysteryBoxBonusEvent.update({
      where: { id: eventId },
      data: { currentUses: { increment: 1 } },
    });

    console.log(
      `${LOG_PREFIX} Recorded bonus event usage: event=${eventId}, customer=${customerId}`
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to record bonus event usage:`, error);
    // Don't throw - usage tracking is non-critical
  }
}

/**
 * Calculate discounted cost after applying bonus event
 */
export function calculateDiscountedCost(
  originalCost: number,
  discountPercent: number
): number {
  if (discountPercent <= 0) return originalCost;
  const discount = Math.floor(originalCost * (discountPercent / 100));
  return Math.max(0, originalCost - discount);
}

// ============================================
// EVENT MANAGEMENT
// ============================================

/**
 * Create a happy hour event
 */
export async function createHappyHour(params: {
  shop: string;
  boxId?: string;
  name: string;
  description?: string;
  discountPercent: number;
  startsAt: Date;
  durationHours: number;
  maxUses?: number;
  maxUsesPerCustomer?: number;
}): Promise<{ id: string }> {
  const endsAt = new Date(
    params.startsAt.getTime() + params.durationHours * 60 * 60 * 1000
  );

  const event = await prisma.mysteryBoxBonusEvent.create({
    data: {
      shop: params.shop,
      boxId: params.boxId,
      name: params.name,
      description: params.description,
      eventType: "HAPPY_HOUR",
      discountPercent: params.discountPercent,
      bonusMultiplier: 1.0,
      extraRewardChance: 0,
      startsAt: params.startsAt,
      endsAt,
      isRecurring: false,
      maxUses: params.maxUses,
      maxUsesPerCustomer: params.maxUsesPerCustomer,
      isActive: true,
    },
  });

  console.log(
    `${LOG_PREFIX} Created happy hour: ${params.name} (${params.discountPercent}% off)`
  );

  return { id: event.id };
}

/**
 * Create a flash discount event
 */
export async function createFlashDiscount(params: {
  shop: string;
  boxId?: string;
  name: string;
  description?: string;
  discountPercent: number;
  durationMinutes: number;
  maxUses?: number;
}): Promise<{ id: string }> {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + params.durationMinutes * 60 * 1000);

  const event = await prisma.mysteryBoxBonusEvent.create({
    data: {
      shop: params.shop,
      boxId: params.boxId,
      name: params.name,
      description: params.description,
      eventType: "FLASH_DISCOUNT",
      discountPercent: params.discountPercent,
      bonusMultiplier: 1.0,
      extraRewardChance: 0,
      startsAt,
      endsAt,
      isRecurring: false,
      maxUses: params.maxUses,
      isActive: true,
    },
  });

  console.log(
    `${LOG_PREFIX} Created flash discount: ${params.name} (${params.discountPercent}% off for ${params.durationMinutes}m)`
  );

  return { id: event.id };
}

/**
 * Create a double rewards event
 */
export async function createDoubleRewards(params: {
  shop: string;
  boxId?: string;
  name: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  maxUses?: number;
}): Promise<{ id: string }> {
  const event = await prisma.mysteryBoxBonusEvent.create({
    data: {
      shop: params.shop,
      boxId: params.boxId,
      name: params.name,
      description: params.description,
      eventType: "DOUBLE_REWARDS",
      discountPercent: 0,
      bonusMultiplier: 2.0,
      extraRewardChance: 0,
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      isRecurring: false,
      maxUses: params.maxUses,
      isActive: true,
    },
  });

  console.log(`${LOG_PREFIX} Created double rewards event: ${params.name}`);

  return { id: event.id };
}

/**
 * Create a recurring happy hour
 */
export async function createRecurringHappyHour(params: {
  shop: string;
  boxId?: string;
  name: string;
  description?: string;
  discountPercent: number;
  days: number[]; // 0=Sunday, 1=Monday, etc.
  startHour: number; // UTC hour (0-23)
  endHour: number; // UTC hour (0-23)
  validUntil: Date;
}): Promise<{ id: string }> {
  const event = await prisma.mysteryBoxBonusEvent.create({
    data: {
      shop: params.shop,
      boxId: params.boxId,
      name: params.name,
      description: params.description,
      eventType: "HAPPY_HOUR",
      discountPercent: params.discountPercent,
      bonusMultiplier: 1.0,
      extraRewardChance: 0,
      startsAt: new Date(),
      endsAt: params.validUntil,
      isRecurring: true,
      recurringDays: params.days,
      recurringHours: { start: params.startHour, end: params.endHour },
      isActive: true,
    },
  });

  console.log(
    `${LOG_PREFIX} Created recurring happy hour: ${params.name} on days [${params.days.join(", ")}] ${params.startHour}:00-${params.endHour}:00 UTC`
  );

  return { id: event.id };
}

/**
 * Deactivate a bonus event
 */
export async function deactivateBonusEvent(eventId: string): Promise<void> {
  await prisma.mysteryBoxBonusEvent.update({
    where: { id: eventId },
    data: { isActive: false },
  });

  console.log(`${LOG_PREFIX} Deactivated bonus event: ${eventId}`);
}
