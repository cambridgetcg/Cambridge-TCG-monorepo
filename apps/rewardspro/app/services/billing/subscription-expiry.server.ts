/**
 * Subscription Expiry Check Service
 *
 * Detects and handles expired subscriptions that may have been missed by webhooks.
 * Shopify doesn't always fire webhooks for natural subscription expiry.
 *
 * @module subscription-expiry.server
 */

import prisma from "../../db.server";

// ============================================
// TYPES
// ============================================

export interface ExpiredSubscription {
  shop: string;
  subscriptionId: string | null;
  currentPeriodEnd: Date;
  status: string;
  daysPastExpiry: number;
}

export interface ExpiryCheckResult {
  checked: number;
  expired: number;
  updated: number;
  errors: string[];
}

// ============================================
// EXPIRY CHECK FUNCTIONS
// ============================================

/**
 * Check if a single shop's subscription has expired
 *
 * @param shop - Shop domain
 * @returns True if subscription is expired, false otherwise
 */
export async function isSubscriptionExpired(shop: string): Promise<boolean> {
  try {
    const subscription = await prisma.appSubscription.findUnique({
      where: { shop },
      select: {
        status: true,
        currentPeriodEnd: true,
      },
    });

    if (!subscription) {
      return true; // No subscription = expired
    }

    if (subscription.status !== "ACTIVE") {
      return true; // Not active = expired
    }

    if (!subscription.currentPeriodEnd) {
      return false; // No end date = assume active (perpetual or error)
    }

    const now = new Date();
    return now > new Date(subscription.currentPeriodEnd);
  } catch (error) {
    console.error(`[SubscriptionExpiry] Error checking ${shop}:`, error);
    return false; // On error, assume active (safer)
  }
}

/**
 * Get subscription status with expiry details
 *
 * @param shop - Shop domain
 * @returns Detailed subscription status
 */
export async function getSubscriptionStatus(shop: string): Promise<{
  isActive: boolean;
  isExpired: boolean;
  status: string;
  currentPeriodEnd: Date | null;
  daysUntilExpiry: number | null;
  gracePeriodRemaining: number | null;
}> {
  try {
    const subscription = await prisma.appSubscription.findUnique({
      where: { shop },
      select: {
        status: true,
        currentPeriodEnd: true,
      },
    });

    if (!subscription) {
      return {
        isActive: false,
        isExpired: true,
        status: "NO_SUBSCRIPTION",
        currentPeriodEnd: null,
        daysUntilExpiry: null,
        gracePeriodRemaining: null,
      };
    }

    const now = new Date();
    const endDate = subscription.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd)
      : null;

    let daysUntilExpiry: number | null = null;
    let gracePeriodRemaining: number | null = null;
    let isExpired = false;

    if (endDate) {
      const msUntilExpiry = endDate.getTime() - now.getTime();
      daysUntilExpiry = Math.ceil(msUntilExpiry / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry < 0) {
        isExpired = true;
        // Grace period of 3 days after expiry
        const gracePeriodEnd = new Date(endDate.getTime() + 3 * 24 * 60 * 60 * 1000);
        if (now < gracePeriodEnd) {
          gracePeriodRemaining = Math.ceil(
            (gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
        } else {
          gracePeriodRemaining = 0;
        }
      }
    }

    const isActive = subscription.status === "ACTIVE" && !isExpired;

    return {
      isActive,
      isExpired,
      status: subscription.status,
      currentPeriodEnd: endDate,
      daysUntilExpiry,
      gracePeriodRemaining,
    };
  } catch (error) {
    console.error(`[SubscriptionExpiry] Error getting status for ${shop}:`, error);
    return {
      isActive: false,
      isExpired: true,
      status: "ERROR",
      currentPeriodEnd: null,
      daysUntilExpiry: null,
      gracePeriodRemaining: null,
    };
  }
}

/**
 * Find all expired subscriptions
 *
 * @returns List of expired subscriptions
 */
export async function findExpiredSubscriptions(): Promise<ExpiredSubscription[]> {
  try {
    const now = new Date();

    // Find subscriptions that are marked ACTIVE but have passed their period end
    const subscriptions = await prisma.appSubscription.findMany({
      where: {
        status: "ACTIVE",
        currentPeriodEnd: {
          lt: now,
        },
      },
      select: {
        shop: true,
        shopifySubscriptionId: true,
        currentPeriodEnd: true,
        status: true,
      },
    });

    return subscriptions.map((sub) => ({
      shop: sub.shop,
      subscriptionId: sub.shopifySubscriptionId,
      currentPeriodEnd: sub.currentPeriodEnd!,
      status: sub.status,
      daysPastExpiry: Math.ceil(
        (now.getTime() - sub.currentPeriodEnd!.getTime()) / (1000 * 60 * 60 * 24)
      ),
    }));
  } catch (error) {
    console.error("[SubscriptionExpiry] Error finding expired:", error);
    return [];
  }
}

/**
 * Update expired subscription status
 *
 * Marks a subscription as EXPIRED and updates related records.
 *
 * @param shop - Shop domain
 * @returns True if updated, false otherwise
 */
export async function markSubscriptionExpired(shop: string): Promise<boolean> {
  try {
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // Update AppSubscription
      await tx.appSubscription.update({
        where: { shop },
        data: {
          status: "EXPIRED",
          lastWebhookUpdate: now,
        },
      });

      // Update ShopSettings
      await tx.shopSettings.update({
        where: { shop },
        data: {
          subscriptionStatus: "EXPIRED",
          subscriptionUpdatedAt: now,
          billingStatus: "INACTIVE",
        },
      });

      // Update BillingSubscription
      await tx.billingSubscription.update({
        where: { shop },
        data: {
          subscriptionStatus: "EXPIRED",
        },
      });

      // Log the expiry
      await tx.billingHistory.create({
        data: {
          shop,
          eventType: "SUBSCRIPTION_EXPIRED_AUTO",
          planName: "Unknown",
          status: "EXPIRED",
          metadata: {
            reason: "Auto-detected expired subscription",
            detectedAt: now.toISOString(),
          },
        },
      });
    });

    console.log(`[SubscriptionExpiry] Marked ${shop} as EXPIRED`);
    return true;
  } catch (error) {
    console.error(`[SubscriptionExpiry] Failed to mark ${shop} as expired:`, error);
    return false;
  }
}

/**
 * Run expiry check job
 *
 * Finds and updates all expired subscriptions.
 * Should be run as a daily cron job.
 *
 * @returns Summary of check results
 */
export async function runExpiryCheckJob(): Promise<ExpiryCheckResult> {
  console.log("[SubscriptionExpiry] Starting expiry check job...");

  const result: ExpiryCheckResult = {
    checked: 0,
    expired: 0,
    updated: 0,
    errors: [],
  };

  try {
    // Find all potentially expired subscriptions
    const expired = await findExpiredSubscriptions();
    result.checked = expired.length;
    result.expired = expired.length;

    console.log(`[SubscriptionExpiry] Found ${expired.length} expired subscriptions`);

    // Update each expired subscription
    for (const sub of expired) {
      try {
        // Skip if only 1 day past (give webhook time to arrive)
        if (sub.daysPastExpiry <= 1) {
          console.log(`[SubscriptionExpiry] Skipping ${sub.shop} - only ${sub.daysPastExpiry} day(s) past`);
          continue;
        }

        const updated = await markSubscriptionExpired(sub.shop);
        if (updated) {
          result.updated++;
        }
      } catch (error: any) {
        result.errors.push(`${sub.shop}: ${error.message}`);
      }
    }

    console.log(`[SubscriptionExpiry] Job complete. Updated: ${result.updated}/${result.expired}`);
    return result;

  } catch (error: any) {
    console.error("[SubscriptionExpiry] Job failed:", error);
    result.errors.push(`Job error: ${error.message}`);
    return result;
  }
}

/**
 * Check if shop should have access based on subscription status
 *
 * Considers both status and expiry date with grace period.
 *
 * @param shop - Shop domain
 * @returns True if shop should have access
 */
export async function hasActiveAccess(shop: string): Promise<boolean> {
  const status = await getSubscriptionStatus(shop);

  // Active subscription = access
  if (status.isActive) {
    return true;
  }

  // Expired but in grace period = limited access
  if (status.isExpired && status.gracePeriodRemaining && status.gracePeriodRemaining > 0) {
    console.log(`[SubscriptionExpiry] ${shop} in grace period (${status.gracePeriodRemaining} days remaining)`);
    return true;
  }

  return false;
}
