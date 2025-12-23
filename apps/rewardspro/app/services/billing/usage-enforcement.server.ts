/**
 * Usage Cap Enforcement Service
 *
 * Enforces usage limits at the request boundary.
 * Prevents merchants from exceeding their plan limits.
 *
 * @module usage-enforcement.server
 */

import db from "../../db.server";
import { getPlanConfig } from "./plan-subscription.server";

// ============================================
// TYPES
// ============================================

export interface UsageEnforcementResult {
  allowed: boolean;
  reason?: UsageBlockReason;
  currentUsage: number;
  limit: number;
  percentage: number;
  overage: number;
  message: string;
  upgradeRequired?: boolean;
}

export type UsageBlockReason =
  | "USAGE_CAP_EXCEEDED"       // Hard cap reached
  | "ORDER_LIMIT_EXCEEDED"     // Monthly order limit reached
  | "NO_SUBSCRIPTION"          // No active subscription
  | "SUBSCRIPTION_INACTIVE"    // Subscription cancelled/expired
  | "FREE_PLAN_LIMIT";         // Free plan limit reached

export interface UsageThresholdAlert {
  shop: string;
  threshold: number;       // 50, 75, 90, 100
  currentUsage: number;
  limit: number;
  percentage: number;
  alertType: "WARNING" | "CRITICAL" | "EXCEEDED";
}

// ============================================
// ENFORCEMENT FUNCTIONS
// ============================================

/**
 * Check if a shop can process more orders
 *
 * This should be called BEFORE processing any order to enforce limits.
 *
 * @param shop - Shop domain
 * @returns Enforcement result with allowed status and details
 */
export async function enforceUsageCap(shop: string): Promise<UsageEnforcementResult> {
  try {
    // 1. Get current subscription and usage
    const [billingSubscription, shopSettings] = await Promise.all([
      db.billingSubscription.findUnique({
        where: { shop },
        select: {
          subscriptionStatus: true,
          currentPeriodOrders: true,
          currentPeriodUsageFee: true,
          usageCappedAmount: true,
          planType: true,
        },
      }),
      db.shopSettings.findUnique({
        where: { shop },
        select: {
          subscriptionStatus: true,
          currentPlan: true,
        },
      }),
    ]);

    // 2. Check for active subscription
    if (!billingSubscription) {
      return {
        allowed: false,
        reason: "NO_SUBSCRIPTION",
        currentUsage: 0,
        limit: 0,
        percentage: 0,
        overage: 0,
        message: "No billing subscription found for this shop",
        upgradeRequired: true,
      };
    }

    if (billingSubscription.subscriptionStatus !== "ACTIVE" &&
        billingSubscription.subscriptionStatus !== "PENDING") {
      return {
        allowed: false,
        reason: "SUBSCRIPTION_INACTIVE",
        currentUsage: billingSubscription.currentPeriodOrders,
        limit: 0,
        percentage: 100,
        overage: billingSubscription.currentPeriodOrders,
        message: `Subscription is ${billingSubscription.subscriptionStatus}. Please reactivate to continue.`,
        upgradeRequired: true,
      };
    }

    // 3. Get plan configuration
    const planType = billingSubscription.planType || shopSettings?.currentPlan || "free";
    const planConfig = getPlanConfig(planType);

    if (!planConfig) {
      // Unknown plan - allow with warning
      console.warn(`[UsageEnforcement] Unknown plan type: ${planType} for shop: ${shop}`);
      return {
        allowed: true,
        currentUsage: billingSubscription.currentPeriodOrders,
        limit: 100,
        percentage: 0,
        overage: 0,
        message: "Unknown plan - allowing with default limits",
      };
    }

    const currentUsage = billingSubscription.currentPeriodOrders;
    const limit = planConfig.orderLimit;
    const percentage = limit > 0 ? (currentUsage / limit) * 100 : 0;
    const overage = Math.max(0, currentUsage - limit);

    // 4. Check order limit
    if (currentUsage >= limit) {
      // Check if overage is allowed for this plan
      if (planConfig.usageRate && planConfig.usageRate > 0) {
        // Overage is allowed but may be capped
        if (planConfig.usageCap) {
          const currentUsageFee = Number(billingSubscription.currentPeriodUsageFee) || 0;

          if (currentUsageFee >= planConfig.usageCap) {
            // Usage cap reached - block further orders
            return {
              allowed: false,
              reason: "USAGE_CAP_EXCEEDED",
              currentUsage,
              limit,
              percentage,
              overage,
              message: `Usage cap of $${planConfig.usageCap}/month reached. Upgrade to continue processing orders.`,
              upgradeRequired: true,
            };
          }
        }

        // Overage allowed and not capped - allow with overage charges
        return {
          allowed: true,
          currentUsage,
          limit,
          percentage,
          overage,
          message: `Over limit by ${overage} orders. Overage charges will apply.`,
        };
      }

      // No overage allowed - check if free plan
      if (planType === "free") {
        return {
          allowed: false,
          reason: "FREE_PLAN_LIMIT",
          currentUsage,
          limit,
          percentage: 100,
          overage,
          message: `Free plan limit of ${limit} orders/month reached. Upgrade to Pro to continue.`,
          upgradeRequired: true,
        };
      }

      // Paid plan with no overage - block
      return {
        allowed: false,
        reason: "ORDER_LIMIT_EXCEEDED",
        currentUsage,
        limit,
        percentage: 100,
        overage,
        message: `Order limit of ${limit}/month reached. Please upgrade your plan.`,
        upgradeRequired: true,
      };
    }

    // 5. Within limits - allowed
    return {
      allowed: true,
      currentUsage,
      limit,
      percentage,
      overage: 0,
      message: percentage >= 90
        ? `${Math.round(percentage)}% of monthly limit used (${currentUsage}/${limit})`
        : "Within usage limits",
    };

  } catch (error: any) {
    console.error("[UsageEnforcement] Error checking usage:", error);

    // On error, allow but log warning
    // Better to allow an order than block due to infrastructure issue
    return {
      allowed: true,
      currentUsage: 0,
      limit: 0,
      percentage: 0,
      overage: 0,
      message: "Usage check failed - allowing by default",
    };
  }
}

/**
 * Check usage thresholds and return alerts if needed
 *
 * @param shop - Shop domain
 * @returns Alert if threshold reached, null otherwise
 */
export async function checkUsageThresholds(
  shop: string
): Promise<UsageThresholdAlert | null> {
  try {
    const result = await enforceUsageCap(shop);

    // Define thresholds
    const thresholds = [
      { value: 100, type: "EXCEEDED" as const },
      { value: 90, type: "CRITICAL" as const },
      { value: 75, type: "WARNING" as const },
      { value: 50, type: "WARNING" as const },
    ];

    for (const threshold of thresholds) {
      if (result.percentage >= threshold.value) {
        return {
          shop,
          threshold: threshold.value,
          currentUsage: result.currentUsage,
          limit: result.limit,
          percentage: result.percentage,
          alertType: threshold.type,
        };
      }
    }

    return null;
  } catch (error) {
    console.error("[UsageEnforcement] Error checking thresholds:", error);
    return null;
  }
}

/**
 * Record a usage threshold alert (for deduplication)
 */
export async function recordThresholdAlert(
  shop: string,
  threshold: number
): Promise<boolean> {
  try {
    const key = `usage_alert_${shop}_${threshold}`;
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Check if alert already sent this period
    const existing = await db.notification.findFirst({
      where: {
        shop,
        type: "USAGE_THRESHOLD_ALERT",
        createdAt: { gte: periodStart },
        metadata: {
          path: ["threshold"],
          equals: threshold,
        },
      },
    });

    if (existing) {
      return false; // Already sent
    }

    // Create alert notification
    await db.notification.create({
      data: {
        id: `${key}_${now.getTime()}`,
        shop,
        type: "USAGE_THRESHOLD_ALERT",
        title: threshold >= 100
          ? "Usage Limit Exceeded"
          : `${threshold}% Usage Threshold Reached`,
        message: threshold >= 100
          ? "You've reached your monthly order limit. Upgrade your plan to continue."
          : `You've used ${threshold}% of your monthly order limit.`,
        severity: threshold >= 90 ? "WARNING" : "INFO",
        metadata: {
          threshold,
          alertedAt: now.toISOString(),
        },
      },
    });

    return true;
  } catch (error) {
    console.error("[UsageEnforcement] Error recording alert:", error);
    return false;
  }
}

/**
 * Get usage summary for a shop
 */
export async function getUsageSummary(shop: string): Promise<{
  currentUsage: number;
  limit: number;
  percentage: number;
  planType: string;
  daysRemaining: number;
  projectedUsage: number;
  onTrackToExceed: boolean;
}> {
  try {
    const billingSubscription = await db.billingSubscription.findUnique({
      where: { shop },
      select: {
        currentPeriodOrders: true,
        currentPeriodEnd: true,
        planType: true,
      },
    });

    if (!billingSubscription) {
      return {
        currentUsage: 0,
        limit: 50,
        percentage: 0,
        planType: "free",
        daysRemaining: 30,
        projectedUsage: 0,
        onTrackToExceed: false,
      };
    }

    const planConfig = getPlanConfig(billingSubscription.planType || "free");
    const limit = planConfig?.orderLimit || 50;
    const currentUsage = billingSubscription.currentPeriodOrders;
    const percentage = (currentUsage / limit) * 100;

    // Calculate days remaining in period
    const now = new Date();
    const periodEnd = billingSubscription.currentPeriodEnd
      ? new Date(billingSubscription.currentPeriodEnd)
      : new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysRemaining = Math.max(0, Math.ceil(
      (periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    ));

    // Project usage based on current rate
    const daysPassed = 30 - daysRemaining;
    const dailyRate = daysPassed > 0 ? currentUsage / daysPassed : 0;
    const projectedUsage = Math.round(currentUsage + (dailyRate * daysRemaining));
    const onTrackToExceed = projectedUsage > limit;

    return {
      currentUsage,
      limit,
      percentage: Math.round(percentage * 10) / 10,
      planType: billingSubscription.planType || "free",
      daysRemaining,
      projectedUsage,
      onTrackToExceed,
    };
  } catch (error) {
    console.error("[UsageEnforcement] Error getting summary:", error);
    return {
      currentUsage: 0,
      limit: 50,
      percentage: 0,
      planType: "free",
      daysRemaining: 30,
      projectedUsage: 0,
      onTrackToExceed: false,
    };
  }
}

/**
 * Wrapper function to enforce usage before order processing
 *
 * Returns 402 Payment Required if usage exceeded
 */
export async function requireUsageCapacity(shop: string): Promise<void> {
  const result = await enforceUsageCap(shop);

  if (!result.allowed) {
    const error = new Error(result.message) as any;
    error.code = "USAGE_CAP_EXCEEDED";
    error.status = 402; // Payment Required
    error.upgradeRequired = result.upgradeRequired;
    error.usageDetails = {
      currentUsage: result.currentUsage,
      limit: result.limit,
      percentage: result.percentage,
    };
    throw error;
  }
}
