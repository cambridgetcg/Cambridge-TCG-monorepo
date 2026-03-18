/**
 * Points Bonus Events Service
 *
 * Manages bonus multiplier events for the Points Engagement System.
 * Events can be scheduled for specific time periods and offer
 * bonus multipliers on points earned.
 *
 * Event Types:
 * - Double/Triple Points Days
 * - Category-specific multipliers
 * - Tier-exclusive bonuses
 * - Flash events (limited time)
 *
 * Events are stored in ShopSettings metadata to avoid schema changes.
 * This can be migrated to a dedicated table if more features are needed.
 */

import db from "~/db.server";
import type { Prisma } from "@prisma/client";

// ============================================
// TYPES
// ============================================

export type BonusEventType =
  | "DOUBLE_POINTS"
  | "TRIPLE_POINTS"
  | "CUSTOM_MULTIPLIER"
  | "CATEGORY_BONUS"
  | "TIER_EXCLUSIVE"
  | "FLASH_SALE"
  | "HOLIDAY"
  | "WELCOME_BACK";

export interface BonusEvent {
  id: string;
  name: string;
  description: string;
  type: BonusEventType;
  multiplier: number; // e.g., 2.0 for double points
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  conditions?: {
    tierIds?: string[]; // Only for specific tiers
    categoryIds?: string[]; // Only for specific product categories
    minOrderAmount?: number; // Minimum order to qualify
    productIds?: string[]; // Only for specific products
    customerTags?: string[]; // Only for customers with specific tags
  };
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBonusEventInput {
  name: string;
  description: string;
  type: BonusEventType;
  multiplier: number;
  startsAt: Date;
  endsAt: Date;
  conditions?: BonusEvent["conditions"];
  metadata?: Record<string, unknown>;
}

export interface ActiveBonusResult {
  hasActiveEvent: boolean;
  events: BonusEvent[];
  combinedMultiplier: number;
  eventNames: string[];
}

// ============================================
// STORAGE FUNCTIONS
// ============================================

/**
 * Get all bonus events for a shop
 */
async function getStoredEvents(shop: string): Promise<BonusEvent[]> {
  const settings = await db.shopSettings.findUnique({
    where: { shop },
    select: { metadata: true },
  });

  const metadata = settings?.metadata as Record<string, unknown> | null;
  const events = metadata?.pointsBonusEvents as BonusEvent[] | undefined;

  if (!events) return [];

  // Parse dates (they're stored as strings in JSON)
  return events.map((e) => ({
    ...e,
    startsAt: new Date(e.startsAt),
    endsAt: new Date(e.endsAt),
    createdAt: new Date(e.createdAt),
    updatedAt: new Date(e.updatedAt),
  }));
}

/**
 * Save bonus events for a shop
 */
async function saveStoredEvents(shop: string, events: BonusEvent[]): Promise<void> {
  const settings = await db.shopSettings.findUnique({
    where: { shop },
    select: { metadata: true },
  });

  const metadata = (settings?.metadata as Record<string, unknown>) || {};

  await db.shopSettings.update({
    where: { shop },
    data: {
      metadata: {
        ...metadata,
        pointsBonusEvents: events,
      } as unknown as Prisma.JsonValue,
    },
  });
}

// ============================================
// EVENT MANAGEMENT
// ============================================

/**
 * Get all bonus events for a shop
 */
export async function getBonusEvents(
  shop: string,
  options?: {
    includeExpired?: boolean;
    includeInactive?: boolean;
  }
): Promise<BonusEvent[]> {
  let events = await getStoredEvents(shop);

  const now = new Date();

  if (!options?.includeExpired) {
    events = events.filter((e) => e.endsAt > now);
  }

  if (!options?.includeInactive) {
    events = events.filter((e) => e.isActive);
  }

  return events.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * Get a specific bonus event
 */
export async function getBonusEvent(
  shop: string,
  eventId: string
): Promise<BonusEvent | null> {
  const events = await getStoredEvents(shop);
  return events.find((e) => e.id === eventId) || null;
}

/**
 * Create a new bonus event
 */
export async function createBonusEvent(
  shop: string,
  input: CreateBonusEventInput
): Promise<BonusEvent> {
  const events = await getStoredEvents(shop);

  const newEvent: BonusEvent = {
    id: generateEventId(),
    name: input.name,
    description: input.description,
    type: input.type,
    multiplier: input.multiplier,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    isActive: true,
    conditions: input.conditions,
    metadata: input.metadata,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  events.push(newEvent);
  await saveStoredEvents(shop, events);

  console.log(`[BonusEvents] Created event "${newEvent.name}" for shop ${shop}`);

  return newEvent;
}

/**
 * Update a bonus event
 */
export async function updateBonusEvent(
  shop: string,
  eventId: string,
  updates: Partial<Omit<BonusEvent, "id" | "createdAt">>
): Promise<BonusEvent | null> {
  const events = await getStoredEvents(shop);
  const index = events.findIndex((e) => e.id === eventId);

  if (index === -1) return null;

  events[index] = {
    ...events[index],
    ...updates,
    updatedAt: new Date(),
  };

  await saveStoredEvents(shop, events);

  console.log(`[BonusEvents] Updated event "${eventId}" for shop ${shop}`);

  return events[index];
}

/**
 * Delete a bonus event
 */
export async function deleteBonusEvent(
  shop: string,
  eventId: string
): Promise<boolean> {
  const events = await getStoredEvents(shop);
  const filteredEvents = events.filter((e) => e.id !== eventId);

  if (filteredEvents.length === events.length) return false;

  await saveStoredEvents(shop, filteredEvents);

  console.log(`[BonusEvents] Deleted event "${eventId}" for shop ${shop}`);

  return true;
}

/**
 * Activate/deactivate a bonus event
 */
export async function setEventActive(
  shop: string,
  eventId: string,
  isActive: boolean
): Promise<BonusEvent | null> {
  return updateBonusEvent(shop, eventId, { isActive });
}

// ============================================
// ACTIVE EVENT QUERIES
// ============================================

/**
 * Get currently active bonus events
 */
export async function getActiveEvents(
  shop: string,
  context?: {
    tierId?: string;
    categoryIds?: string[];
    productIds?: string[];
    orderAmount?: number;
    customerTags?: string[];
  }
): Promise<ActiveBonusResult> {
  const events = await getStoredEvents(shop);
  const now = new Date();

  // Filter to currently active events
  const activeEvents = events.filter((e) => {
    if (!e.isActive) return false;
    if (e.startsAt > now) return false;
    if (e.endsAt < now) return false;
    return true;
  });

  // Further filter by conditions if context provided
  const applicableEvents = activeEvents.filter((e) => {
    if (!e.conditions) return true;

    // Check tier condition
    if (e.conditions.tierIds?.length && context?.tierId) {
      if (!e.conditions.tierIds.includes(context.tierId)) return false;
    }

    // Check category condition
    if (e.conditions.categoryIds?.length && context?.categoryIds?.length) {
      const hasMatchingCategory = context.categoryIds.some((c) =>
        e.conditions!.categoryIds!.includes(c)
      );
      if (!hasMatchingCategory) return false;
    }

    // Check product condition
    if (e.conditions.productIds?.length && context?.productIds?.length) {
      const hasMatchingProduct = context.productIds.some((p) =>
        e.conditions!.productIds!.includes(p)
      );
      if (!hasMatchingProduct) return false;
    }

    // Check minimum order amount
    if (e.conditions.minOrderAmount && context?.orderAmount) {
      if (context.orderAmount < e.conditions.minOrderAmount) return false;
    }

    // Check customer tags
    if (e.conditions.customerTags?.length && context?.customerTags?.length) {
      const hasMatchingTag = context.customerTags.some((t) =>
        e.conditions!.customerTags!.includes(t)
      );
      if (!hasMatchingTag) return false;
    }

    return true;
  });

  // Calculate combined multiplier (multiply all active event multipliers)
  const combinedMultiplier = applicableEvents.reduce(
    (mult, event) => mult * event.multiplier,
    1.0
  );

  return {
    hasActiveEvent: applicableEvents.length > 0,
    events: applicableEvents,
    combinedMultiplier,
    eventNames: applicableEvents.map((e) => e.name),
  };
}

/**
 * Get the bonus multiplier for an order
 *
 * @deprecated Points are no longer earned from orders. Only caller was processPointsEarning (now removed).
 * Kept for reference only.
 */
export async function getOrderBonusMultiplier(
  shop: string,
  context: {
    tierId?: string;
    categoryIds?: string[];
    productIds?: string[];
    orderAmount: number;
    customerTags?: string[];
  }
): Promise<{
  multiplier: number;
  appliedEvents: string[];
}> {
  const result = await getActiveEvents(shop, context);

  return {
    multiplier: result.combinedMultiplier,
    appliedEvents: result.eventNames,
  };
}

// ============================================
// SCHEDULED EVENT TEMPLATES
// ============================================

/**
 * Create a double points weekend event
 */
export async function createDoublePointsWeekend(
  shop: string,
  startDate: Date
): Promise<BonusEvent> {
  // Set to Friday 6pm
  const startsAt = new Date(startDate);
  startsAt.setHours(18, 0, 0, 0);

  // Set to Sunday 11:59pm
  const endsAt = new Date(startDate);
  endsAt.setDate(endsAt.getDate() + 2);
  endsAt.setHours(23, 59, 59, 999);

  return createBonusEvent(shop, {
    name: "Double Points Weekend",
    description: "Earn 2x points on all purchases this weekend!",
    type: "DOUBLE_POINTS",
    multiplier: 2.0,
    startsAt,
    endsAt,
  });
}

/**
 * Create a flash bonus event
 */
export async function createFlashBonus(
  shop: string,
  options: {
    name: string;
    multiplier: number;
    durationHours: number;
    startsAt?: Date;
  }
): Promise<BonusEvent> {
  const startsAt = options.startsAt || new Date();
  const endsAt = new Date(startsAt);
  endsAt.setHours(endsAt.getHours() + options.durationHours);

  return createBonusEvent(shop, {
    name: options.name,
    description: `Flash bonus: Earn ${options.multiplier}x points for the next ${options.durationHours} hours!`,
    type: "FLASH_SALE",
    multiplier: options.multiplier,
    startsAt,
    endsAt,
  });
}

/**
 * Create a VIP tier exclusive event
 */
export async function createTierExclusiveEvent(
  shop: string,
  options: {
    name: string;
    multiplier: number;
    tierIds: string[];
    startsAt: Date;
    endsAt: Date;
  }
): Promise<BonusEvent> {
  return createBonusEvent(shop, {
    name: options.name,
    description: `Exclusive bonus for our VIP members!`,
    type: "TIER_EXCLUSIVE",
    multiplier: options.multiplier,
    startsAt: options.startsAt,
    endsAt: options.endsAt,
    conditions: {
      tierIds: options.tierIds,
    },
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Clean up expired events (call periodically)
 */
export async function cleanupExpiredEvents(
  shop: string,
  olderThanDays: number = 30
): Promise<number> {
  const events = await getStoredEvents(shop);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const activeEvents = events.filter((e) => e.endsAt > cutoffDate);

  if (activeEvents.length === events.length) return 0;

  const removedCount = events.length - activeEvents.length;
  await saveStoredEvents(shop, activeEvents);

  console.log(`[BonusEvents] Cleaned up ${removedCount} expired events for shop ${shop}`);

  return removedCount;
}
