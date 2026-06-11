/**
 * Event Dispatcher Service
 *
 * High-level service for dispatching loyalty events to integrations.
 * Provides a clean API for emitting events from various parts of the application.
 */

import prisma from "~/db.server";
import { createLogger } from "~/services/logger.server";
import { broadcastEvent, processEventQueue } from "./integration-manager.server";
import type { LoyaltyEventType } from "@prisma/client";
import type { LoyaltyEvent } from "./types";

const logger = createLogger("EventDispatcher");

// ═══════════════════════════════════════════════════════════════════════════
// EVENT BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a loyalty event with standard structure
 */
function buildEvent(
  type: LoyaltyEventType,
  data: Record<string, unknown>,
  options?: {
    customerId?: string;
    shopifyCustomerId?: string;
    orderId?: string;
    metadata?: Record<string, unknown>;
  }
): LoyaltyEvent {
  return {
    type,
    customerId: options?.customerId,
    shopifyCustomerId: options?.shopifyCustomerId,
    orderId: options?.orderId,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      ...options?.metadata,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// POINTS EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export interface PointsEventData {
  customerId: string;
  shopifyCustomerId?: string;
  points: number;
  reason: string;
  orderId?: string;
  previousBalance?: number;
  newBalance?: number;
  multiplier?: number;
  ruleId?: string;
}

/**
 * Dispatch points earned event
 */
export async function dispatchPointsEarned(
  shop: string,
  data: PointsEventData
): Promise<void> {
  const event = buildEvent(
    "POINTS_EARNED",
    {
      points: data.points,
      reason: data.reason,
      previousBalance: data.previousBalance,
      newBalance: data.newBalance,
      multiplier: data.multiplier,
      ruleId: data.ruleId,
    },
    {
      customerId: data.customerId,
      shopifyCustomerId: data.shopifyCustomerId,
      orderId: data.orderId,
    }
  );

  await broadcastEvent(shop, event);

  logger.debug("Points earned event dispatched", {
    shop,
    customerId: data.customerId,
    points: data.points,
  });
}

/**
 * Dispatch points redeemed event
 */
export async function dispatchPointsRedeemed(
  shop: string,
  data: PointsEventData & { redemptionId?: string; rewardType?: string }
): Promise<void> {
  const event = buildEvent(
    "POINTS_REDEEMED",
    {
      points: data.points,
      reason: data.reason,
      previousBalance: data.previousBalance,
      newBalance: data.newBalance,
      redemptionId: data.redemptionId,
      rewardType: data.rewardType,
    },
    {
      customerId: data.customerId,
      shopifyCustomerId: data.shopifyCustomerId,
      orderId: data.orderId,
    }
  );

  await broadcastEvent(shop, event);

  logger.debug("Points redeemed event dispatched", {
    shop,
    customerId: data.customerId,
    points: data.points,
  });
}

/**
 * Dispatch points expired event
 */
export async function dispatchPointsExpired(
  shop: string,
  data: Omit<PointsEventData, "reason"> & { expirationDate: Date }
): Promise<void> {
  const event = buildEvent(
    "POINTS_EXPIRED",
    {
      points: data.points,
      expirationDate: data.expirationDate.toISOString(),
      previousBalance: data.previousBalance,
      newBalance: data.newBalance,
    },
    {
      customerId: data.customerId,
      shopifyCustomerId: data.shopifyCustomerId,
    }
  );

  await broadcastEvent(shop, event);

  logger.debug("Points expired event dispatched", {
    shop,
    customerId: data.customerId,
    points: data.points,
  });
}

/**
 * Dispatch points adjusted event (manual adjustment)
 */
export async function dispatchPointsAdjusted(
  shop: string,
  data: PointsEventData & { adjustedBy?: string; note?: string }
): Promise<void> {
  const event = buildEvent(
    "POINTS_ADJUSTED",
    {
      points: data.points,
      reason: data.reason,
      previousBalance: data.previousBalance,
      newBalance: data.newBalance,
      adjustedBy: data.adjustedBy,
      note: data.note,
    },
    {
      customerId: data.customerId,
      shopifyCustomerId: data.shopifyCustomerId,
    }
  );

  await broadcastEvent(shop, event);

  logger.debug("Points adjusted event dispatched", {
    shop,
    customerId: data.customerId,
    points: data.points,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export interface TierEventData {
  customerId: string;
  shopifyCustomerId?: string;
  tierId: string;
  tierName: string;
  previousTierId?: string;
  previousTierName?: string;
}

/**
 * Dispatch tier upgraded event
 */
export async function dispatchTierUpgraded(
  shop: string,
  data: TierEventData
): Promise<void> {
  const event = buildEvent(
    "TIER_UPGRADED",
    {
      tierId: data.tierId,
      tierName: data.tierName,
      previousTierId: data.previousTierId,
      previousTierName: data.previousTierName,
    },
    {
      customerId: data.customerId,
      shopifyCustomerId: data.shopifyCustomerId,
    }
  );

  await broadcastEvent(shop, event);

  logger.debug("Tier upgraded event dispatched", {
    shop,
    customerId: data.customerId,
    tierName: data.tierName,
  });
}

/**
 * Dispatch tier downgraded event
 */
export async function dispatchTierDowngraded(
  shop: string,
  data: TierEventData
): Promise<void> {
  const event = buildEvent(
    "TIER_DOWNGRADED",
    {
      tierId: data.tierId,
      tierName: data.tierName,
      previousTierId: data.previousTierId,
      previousTierName: data.previousTierName,
    },
    {
      customerId: data.customerId,
      shopifyCustomerId: data.shopifyCustomerId,
    }
  );

  await broadcastEvent(shop, event);

  logger.debug("Tier downgraded event dispatched", {
    shop,
    customerId: data.customerId,
    tierName: data.tierName,
  });
}

/**
 * Dispatch tier purchased event (paid tier subscription)
 */
export async function dispatchTierPurchased(
  shop: string,
  data: TierEventData & { orderId: string; amount: number; currency: string }
): Promise<void> {
  const event = buildEvent(
    "TIER_PURCHASED",
    {
      tierId: data.tierId,
      tierName: data.tierName,
      amount: data.amount,
      currency: data.currency,
    },
    {
      customerId: data.customerId,
      shopifyCustomerId: data.shopifyCustomerId,
      orderId: data.orderId,
    }
  );

  await broadcastEvent(shop, event);

  logger.debug("Tier purchased event dispatched", {
    shop,
    customerId: data.customerId,
    tierName: data.tierName,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export interface SubscriptionEventData {
  customerId: string;
  shopifyCustomerId?: string;
  subscriptionId: string;
  tierId: string;
  tierName: string;
  amount: number;
  currency: string;
  interval: "MONTHLY" | "YEARLY";
}

/**
 * Dispatch tier subscription created event
 */
export async function dispatchSubscriptionCreated(
  shop: string,
  data: SubscriptionEventData
): Promise<void> {
  const event = buildEvent(
    "TIER_SUBSCRIPTION_CREATED",
    {
      subscriptionId: data.subscriptionId,
      tierId: data.tierId,
      tierName: data.tierName,
      amount: data.amount,
      currency: data.currency,
      interval: data.interval,
    },
    {
      customerId: data.customerId,
      shopifyCustomerId: data.shopifyCustomerId,
    }
  );

  await broadcastEvent(shop, event);

  logger.debug("Subscription created event dispatched", {
    shop,
    customerId: data.customerId,
    subscriptionId: data.subscriptionId,
  });
}

/**
 * Dispatch tier subscription cancelled event
 */
export async function dispatchSubscriptionCancelled(
  shop: string,
  data: Omit<SubscriptionEventData, "amount" | "currency" | "interval"> & {
    cancelReason?: string;
    effectiveDate?: Date;
  }
): Promise<void> {
  const event = buildEvent(
    "TIER_SUBSCRIPTION_CANCELLED",
    {
      subscriptionId: data.subscriptionId,
      tierId: data.tierId,
      tierName: data.tierName,
      cancelReason: data.cancelReason,
      effectiveDate: data.effectiveDate?.toISOString(),
    },
    {
      customerId: data.customerId,
      shopifyCustomerId: data.shopifyCustomerId,
    }
  );

  await broadcastEvent(shop, event);

  logger.debug("Subscription cancelled event dispatched", {
    shop,
    customerId: data.customerId,
    subscriptionId: data.subscriptionId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export interface CustomerEventData {
  customerId: string;
  shopifyCustomerId?: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Dispatch customer enrolled event
 */
export async function dispatchCustomerEnrolled(
  shop: string,
  data: CustomerEventData & { enrollmentSource?: string }
): Promise<void> {
  const event = buildEvent(
    "CUSTOMER_ENROLLED",
    {
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      enrollmentSource: data.enrollmentSource || "direct",
    },
    {
      customerId: data.customerId,
      shopifyCustomerId: data.shopifyCustomerId,
    }
  );

  await broadcastEvent(shop, event);

  logger.debug("Customer enrolled event dispatched", {
    shop,
    customerId: data.customerId,
  });
}

/**
 * Dispatch customer profile updated event
 */
export async function dispatchCustomerProfileUpdated(
  shop: string,
  data: CustomerEventData & { updatedFields: string[] }
): Promise<void> {
  const event = buildEvent(
    "CUSTOMER_PROFILE_UPDATED",
    {
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      updatedFields: data.updatedFields,
    },
    {
      customerId: data.customerId,
      shopifyCustomerId: data.shopifyCustomerId,
    }
  );

  await broadcastEvent(shop, event);

  logger.debug("Customer profile updated event dispatched", {
    shop,
    customerId: data.customerId,
    updatedFields: data.updatedFields,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// REFERRAL EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export interface ReferralEventData {
  referrerId: string;
  referrerShopifyCustomerId?: string;
  referralCode: string;
  refereeEmail?: string;
}

/**
 * Dispatch referral sent event
 */
export async function dispatchReferralSent(
  shop: string,
  data: ReferralEventData
): Promise<void> {
  const event = buildEvent(
    "REFERRAL_SENT",
    {
      referralCode: data.referralCode,
      refereeEmail: data.refereeEmail,
    },
    {
      customerId: data.referrerId,
      shopifyCustomerId: data.referrerShopifyCustomerId,
    }
  );

  await broadcastEvent(shop, event);

  logger.debug("Referral sent event dispatched", {
    shop,
    referrerId: data.referrerId,
  });
}

/**
 * Dispatch referral completed event
 */
export async function dispatchReferralCompleted(
  shop: string,
  data: ReferralEventData & {
    refereeId: string;
    refereeShopifyCustomerId?: string;
    referrerPoints: number;
    refereePoints: number;
    orderId?: string;
  }
): Promise<void> {
  const event = buildEvent(
    "REFERRAL_COMPLETED",
    {
      referralCode: data.referralCode,
      refereeId: data.refereeId,
      refereeEmail: data.refereeEmail,
      referrerPoints: data.referrerPoints,
      refereePoints: data.refereePoints,
    },
    {
      customerId: data.referrerId,
      shopifyCustomerId: data.referrerShopifyCustomerId,
      orderId: data.orderId,
    }
  );

  await broadcastEvent(shop, event);

  logger.debug("Referral completed event dispatched", {
    shop,
    referrerId: data.referrerId,
    refereeId: data.refereeId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERIC EVENT DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dispatch a generic loyalty event
 * Use this for custom event types or when the specific helpers don't fit
 */
export async function dispatchEvent(
  shop: string,
  type: LoyaltyEventType,
  data: Record<string, unknown>,
  options?: {
    customerId?: string;
    shopifyCustomerId?: string;
    orderId?: string;
  }
): Promise<{ queued: number; integrations: string[] }> {
  const event = buildEvent(type, data, options);
  return broadcastEvent(shop, event);
}

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process the event queue
 * This should be called by a background job
 */
export async function processEvents(
  batchSize: number = 100
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  return processEventQueue(batchSize);
}

/**
 * Get event queue statistics
 */
export async function getEventQueueStats(shop?: string): Promise<{
  pending: number;
  processing: number;
  delivered: number;
  failed: number;
  skipped: number;
}> {
  const where = shop ? { shop } : {};

  const [pending, processing, delivered, failed, skipped] = await Promise.all([
    prisma.integrationEvent.count({ where: { ...where, status: "PENDING" } }),
    prisma.integrationEvent.count({ where: { ...where, status: "PROCESSING" } }),
    prisma.integrationEvent.count({ where: { ...where, status: "DELIVERED" } }),
    prisma.integrationEvent.count({ where: { ...where, status: "FAILED" } }),
    prisma.integrationEvent.count({ where: { ...where, status: "SKIPPED" } }),
  ]);

  return { pending, processing, delivered, failed, skipped };
}

/**
 * Retry failed events for a shop
 */
export async function retryFailedEvents(shop: string): Promise<number> {
  const result = await prisma.integrationEvent.updateMany({
    where: {
      shop,
      status: "FAILED",
      attempts: { lt: 3 },
    },
    data: {
      status: "PENDING",
      error: null,
    },
  });

  logger.info("Failed events marked for retry", {
    shop,
    count: result.count,
  });

  return result.count;
}

/**
 * Clear old delivered events
 */
export async function clearDeliveredEvents(
  daysOld: number = 30
): Promise<number> {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  const result = await prisma.integrationEvent.deleteMany({
    where: {
      status: "DELIVERED",
      deliveredAt: { lt: cutoff },
    },
  });

  if (result.count > 0) {
    logger.info("Old delivered events cleared", {
      count: result.count,
      cutoffDate: cutoff,
    });
  }

  return result.count;
}
