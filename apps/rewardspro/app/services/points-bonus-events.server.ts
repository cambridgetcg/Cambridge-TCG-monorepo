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
 * Events were meant to be stored in a ShopSettings metadata column that the
 * schema never had, so none could ever be saved and nothing in the app
 * creates them. Until events get a real table, there are no active events;
 * the storefront and the metafield sync read that as "no bonus".
 */

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
 * Stored bonus events: none (see the header).
 */
async function getStoredEvents(_shop: string): Promise<BonusEvent[]> {
  return [];
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
