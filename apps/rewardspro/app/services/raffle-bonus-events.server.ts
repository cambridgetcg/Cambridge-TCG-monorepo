/**
 * Raffle Bonus Events Service
 *
 * Implements urgency mechanics through time-limited bonus events.
 * Creates FOMO and encourages immediate action.
 *
 * Event Types:
 * - HAPPY_HOUR: Time-limited bonus (e.g., 2x entries 6-8pm)
 * - FLASH_BONUS: Short flash sale bonus (15-30 min)
 * - EARLY_BIRD: First N entries get bonus
 * - LAST_CHANCE: Final hours bonus
 * - MILESTONE: Entry milestone bonus (100th entry, etc.)
 *
 * Key Psychology:
 * - Urgency (limited time)
 * - Scarcity (limited uses)
 * - Fear of missing out (countdown timers)
 * - Social proof (show how many have used it)
 */

import db from "../db.server";
import type { RaffleBonusEventType, Prisma } from "@prisma/client";

const LOG_PREFIX = "[RaffleBonusEvents]";

// ============================================
// TYPES
// ============================================

export interface BonusEventInfo {
  id: string;
  name: string;
  description: string | null;
  eventType: RaffleBonusEventType;
  bonusMultiplier: number;
  bonusEntriesFlat: number;
  discountPercent: number;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  // Calculated fields
  isCurrentlyActive: boolean;
  timeRemaining: string | null;
  secondsRemaining: number;
  usesRemaining: number | null;
  currentUses: number;
}

export interface AppliedBonus {
  eventId: string;
  eventName: string;
  eventType: RaffleBonusEventType;
  multiplier: number;
  flatBonus: number;
  discountPercent: number;
}

// Event type emojis
const EVENT_EMOJIS: Record<RaffleBonusEventType, string> = {
  HAPPY_HOUR: "🎉",
  FLASH_BONUS: "⚡",
  EARLY_BIRD: "🐦",
  LAST_CHANCE: "⏰",
  MILESTONE: "🎯",
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format time remaining as human-readable string
 */
export function formatTimeRemaining(endDate: Date): { text: string; seconds: number } {
  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();

  if (diffMs <= 0) {
    return { text: "Ended", seconds: 0 };
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours > 0) {
    const mins = diffMinutes % 60;
    return { text: `${diffHours}h ${mins}m left`, seconds: diffSeconds };
  }
  if (diffMinutes > 0) {
    const secs = diffSeconds % 60;
    return { text: `${diffMinutes}m ${secs}s left`, seconds: diffSeconds };
  }
  return { text: `${diffSeconds}s left`, seconds: diffSeconds };
}

/**
 * Check if current time matches recurring schedule
 */
function matchesRecurringSchedule(
  recurringDays: number[] | null,
  recurringHours: { start: number; end: number } | null
): boolean {
  if (!recurringDays && !recurringHours) return true;

  const now = new Date();
  const currentDay = now.getDay(); // 0-6 (Sun-Sat)
  const currentHour = now.getHours();

  if (recurringDays && !recurringDays.includes(currentDay)) {
    return false;
  }

  if (recurringHours) {
    if (currentHour < recurringHours.start || currentHour >= recurringHours.end) {
      return false;
    }
  }

  return true;
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Get active bonus events for a raffle (or all raffles)
 */
export async function getActiveBonusEvents(
  shop: string,
  raffleId?: string
): Promise<BonusEventInfo[]> {
  const now = new Date();

  const events = await db.raffleBonusEvent.findMany({
    where: {
      shop,
      isActive: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
      ...(raffleId && { OR: [{ raffleId }, { raffleId: null }] }),
    },
    orderBy: [
      { bonusMultiplier: "desc" },
      { endsAt: "asc" },
    ],
  });

  return events
    .filter((event) => {
      // Filter by recurring schedule if applicable
      if (event.isRecurring) {
        const recurringDays = event.recurringDays as number[] | null;
        const recurringHours = event.recurringHours as { start: number; end: number } | null;
        return matchesRecurringSchedule(recurringDays, recurringHours);
      }
      return true;
    })
    .map((event) => {
      const { text: timeRemaining, seconds: secondsRemaining } = formatTimeRemaining(event.endsAt);

      return {
        id: event.id,
        name: event.name,
        description: event.description,
        eventType: event.eventType,
        bonusMultiplier: Number(event.bonusMultiplier),
        bonusEntriesFlat: event.bonusEntriesFlat,
        discountPercent: event.discountPercent,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        isActive: event.isActive,
        isCurrentlyActive: secondsRemaining > 0,
        timeRemaining,
        secondsRemaining,
        usesRemaining: event.maxUses ? event.maxUses - event.currentUses : null,
        currentUses: event.currentUses,
      };
    });
}

/**
 * Get the best active bonus event for a customer
 */
export async function getBestBonusEvent(
  shop: string,
  customerId: string,
  raffleId?: string
): Promise<AppliedBonus | null> {
  const events = await getActiveBonusEvents(shop, raffleId);

  if (events.length === 0) return null;

  // Filter out events that customer has maxed out usage on
  const eligibleEvents: BonusEventInfo[] = [];

  for (const event of events) {
    // Check per-customer limit if set
    const usage = await db.raffleBonusEventUsage.findUnique({
      where: {
        bonusEventId_customerId: {
          bonusEventId: event.id,
          customerId,
        },
      },
      select: { usageCount: true },
    });

    const maxUsesPerCustomer = await getMaxUsesPerCustomer(event.id);
    if (maxUsesPerCustomer !== null && usage && usage.usageCount >= maxUsesPerCustomer) {
      continue; // Customer has reached their limit
    }

    // Check total uses limit
    if (event.usesRemaining !== null && event.usesRemaining <= 0) {
      continue; // Event has reached total limit
    }

    eligibleEvents.push(event);
  }

  if (eligibleEvents.length === 0) return null;

  // Return the best event (highest multiplier)
  const best = eligibleEvents.reduce((a, b) =>
    a.bonusMultiplier > b.bonusMultiplier ? a : b
  );

  return {
    eventId: best.id,
    eventName: best.name,
    eventType: best.eventType,
    multiplier: best.bonusMultiplier,
    flatBonus: best.bonusEntriesFlat,
    discountPercent: best.discountPercent,
  };
}

/**
 * Get max uses per customer for an event
 */
async function getMaxUsesPerCustomer(eventId: string): Promise<number | null> {
  const event = await db.raffleBonusEvent.findUnique({
    where: { id: eventId },
    select: { maxUsesPerCustomer: true },
  });
  return event?.maxUsesPerCustomer ?? null;
}

/**
 * Record usage of a bonus event
 */
export async function recordBonusEventUsage(
  eventId: string,
  customerId: string,
  shop: string
): Promise<void> {
  // Upsert usage record
  await db.raffleBonusEventUsage.upsert({
    where: {
      bonusEventId_customerId: {
        bonusEventId: eventId,
        customerId,
      },
    },
    update: {
      usageCount: { increment: 1 },
    },
    create: {
      bonusEventId: eventId,
      customerId,
      shop,
      usageCount: 1,
    },
  });

  // Increment total uses
  await db.raffleBonusEvent.update({
    where: { id: eventId },
    data: {
      currentUses: { increment: 1 },
    },
  });

  console.log(`${LOG_PREFIX} Recorded usage of bonus event ${eventId} by customer ${customerId}`);
}

/**
 * Check if event usage limits are reached
 */
export async function checkEventLimits(
  eventId: string,
  customerId: string
): Promise<{
  canUse: boolean;
  reason: string | null;
}> {
  const event = await db.raffleBonusEvent.findUnique({
    where: { id: eventId },
    select: {
      maxUses: true,
      currentUses: true,
      maxUsesPerCustomer: true,
    },
  });

  if (!event) {
    return { canUse: false, reason: "Event not found" };
  }

  // Check total limit
  if (event.maxUses !== null && event.currentUses >= event.maxUses) {
    return { canUse: false, reason: "Event has reached maximum uses" };
  }

  // Check per-customer limit
  if (event.maxUsesPerCustomer !== null) {
    const usage = await db.raffleBonusEventUsage.findUnique({
      where: {
        bonusEventId_customerId: {
          bonusEventId: eventId,
          customerId,
        },
      },
      select: { usageCount: true },
    });

    if (usage && usage.usageCount >= event.maxUsesPerCustomer) {
      return { canUse: false, reason: "You've reached the maximum uses for this event" };
    }
  }

  return { canUse: true, reason: null };
}

// ============================================
// ADMIN FUNCTIONS
// ============================================

/**
 * Create a new bonus event
 */
export async function createBonusEvent(
  shop: string,
  data: {
    raffleId?: string;
    name: string;
    description?: string;
    eventType: RaffleBonusEventType;
    bonusMultiplier?: number;
    bonusEntriesFlat?: number;
    discountPercent?: number;
    startsAt: Date;
    endsAt: Date;
    isRecurring?: boolean;
    recurringDays?: number[];
    recurringHours?: { start: number; end: number };
    maxUses?: number;
    maxUsesPerCustomer?: number;
  }
): Promise<BonusEventInfo> {
  const event = await db.raffleBonusEvent.create({
    data: {
      shop,
      raffleId: data.raffleId,
      name: data.name,
      description: data.description,
      eventType: data.eventType,
      bonusMultiplier: data.bonusMultiplier || 1.5,
      bonusEntriesFlat: data.bonusEntriesFlat || 0,
      discountPercent: data.discountPercent || 0,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      isRecurring: data.isRecurring || false,
      recurringDays: data.recurringDays as Prisma.JsonValue,
      recurringHours: data.recurringHours as Prisma.JsonValue,
      maxUses: data.maxUses,
      maxUsesPerCustomer: data.maxUsesPerCustomer,
      isActive: true,
    },
  });

  console.log(
    `${LOG_PREFIX} Created bonus event: ${event.name} (${event.eventType}, ${Number(event.bonusMultiplier)}x)`
  );

  const { text: timeRemaining, seconds: secondsRemaining } = formatTimeRemaining(event.endsAt);

  return {
    id: event.id,
    name: event.name,
    description: event.description,
    eventType: event.eventType,
    bonusMultiplier: Number(event.bonusMultiplier),
    bonusEntriesFlat: event.bonusEntriesFlat,
    discountPercent: event.discountPercent,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    isActive: event.isActive,
    isCurrentlyActive: secondsRemaining > 0,
    timeRemaining,
    secondsRemaining,
    usesRemaining: event.maxUses,
    currentUses: 0,
  };
}

/**
 * Create a quick happy hour event
 */
export async function createHappyHour(
  shop: string,
  durationMinutes: number = 120,
  multiplier: number = 2,
  raffleId?: string
): Promise<BonusEventInfo> {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

  return createBonusEvent(shop, {
    raffleId,
    name: `Happy Hour (${multiplier}x Entries!)`,
    description: `Get ${multiplier}x entries for the next ${durationMinutes} minutes!`,
    eventType: "HAPPY_HOUR",
    bonusMultiplier: multiplier,
    startsAt,
    endsAt,
  });
}

/**
 * Create a flash bonus event
 */
export async function createFlashBonus(
  shop: string,
  durationMinutes: number = 15,
  flatBonus: number = 5,
  raffleId?: string
): Promise<BonusEventInfo> {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

  return createBonusEvent(shop, {
    raffleId,
    name: `Flash Bonus (+${flatBonus} Free Entries!)`,
    description: `Get ${flatBonus} bonus entries with every purchase!`,
    eventType: "FLASH_BONUS",
    bonusEntriesFlat: flatBonus,
    startsAt,
    endsAt,
  });
}

/**
 * Update bonus event
 */
export async function updateBonusEvent(
  eventId: string,
  data: Partial<{
    name: string;
    description: string;
    bonusMultiplier: number;
    bonusEntriesFlat: number;
    discountPercent: number;
    startsAt: Date;
    endsAt: Date;
    maxUses: number | null;
    maxUsesPerCustomer: number | null;
    isActive: boolean;
  }>
): Promise<void> {
  await db.raffleBonusEvent.update({
    where: { id: eventId },
    data,
  });
}

/**
 * Delete bonus event
 */
export async function deleteBonusEvent(eventId: string): Promise<void> {
  await db.raffleBonusEvent.delete({
    where: { id: eventId },
  });
}

/**
 * Get emoji for event type
 */
export function getEventEmoji(eventType: RaffleBonusEventType): string {
  return EVENT_EMOJIS[eventType] || "🎁";
}

/**
 * Get bonus event statistics
 */
export async function getBonusEventStats(
  shop: string,
  eventId?: string
): Promise<{
  totalEvents: number;
  activeEvents: number;
  totalUses: number;
  byType: Record<RaffleBonusEventType, number>;
}> {
  const now = new Date();

  const events = await db.raffleBonusEvent.findMany({
    where: {
      shop,
      ...(eventId && { id: eventId }),
    },
    select: {
      eventType: true,
      currentUses: true,
      isActive: true,
      startsAt: true,
      endsAt: true,
    },
  });

  const byType: Record<string, number> = {};
  let totalUses = 0;
  let activeEvents = 0;

  for (const event of events) {
    byType[event.eventType] = (byType[event.eventType] || 0) + event.currentUses;
    totalUses += event.currentUses;

    if (event.isActive && event.startsAt <= now && event.endsAt >= now) {
      activeEvents++;
    }
  }

  return {
    totalEvents: events.length,
    activeEvents,
    totalUses,
    byType: byType as Record<RaffleBonusEventType, number>,
  };
}
