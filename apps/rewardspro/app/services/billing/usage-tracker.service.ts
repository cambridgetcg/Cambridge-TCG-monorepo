/**
 * Usage Tracker Service
 * Tracks legacy order usage for reporting. Current plans never charge usage.
 */

import prisma from "../../db.server";
import { getPlanConfig } from "./plan-subscription.server";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface UsageStatus {
  currentUsage: number;
  limit: number;
  percentage: number;
  overage: number;
  overageFee: number;
  capReached: boolean;
  shouldWarn: boolean;
}

export class UsageTrackerService {
  constructor(private readonly _admin: AdminApiContext) {}

  /**
   * Track an order and update usage
   *
   * Uses idempotency to prevent duplicate counting of the same order.
   * The atomic increment is safe for concurrent requests.
   */
  async trackOrder(shop: string, orderId: string): Promise<void> {
    try {
      // 1. Check if order already tracked (idempotency)
      const existingOrder = await prisma.order.findFirst({
        where: {
          shop,
          shopifyOrderId: orderId,
        },
        select: { id: true },
      });

      if (existingOrder) {
        console.log(`[UsageTracker] Order ${orderId} already tracked for ${shop}, skipping`);
        return;
      }

      const billingSubscription = await prisma.billingSubscription.findUnique({
        where: { shop }
      });

      if (!billingSubscription) {
        console.log(`[UsageTracker] No billing subscription for ${shop}`);
        return;
      }

      // Check if we need to reset usage for new period
      await this.checkAndResetPeriod(shop, billingSubscription);

      // 2. Increment order count atomically
      // The { increment: 1 } operation is atomic at the database level
      // This prevents race conditions in concurrent order processing
      await prisma.billingSubscription.update({
        where: { shop },
        data: {
          currentPeriodOrders: {
            increment: 1
          }
        }
      });

    } catch (error) {
      console.error("[UsageTracker] Error tracking order:", error);
    }
  }

  /**
   * Get current usage status
   */
  async getCurrentUsage(shop: string): Promise<UsageStatus | null> {
    try {
      const billingSubscription = await prisma.billingSubscription.findUnique({
        where: { shop }
      });

      if (!billingSubscription) {
        return null;
      }

      const planConfig = getPlanConfig(billingSubscription.planType || 'free');
      if (!planConfig) {
        return null;
      }

      const currentUsage = billingSubscription.currentPeriodOrders;
      const limit = planConfig.orderLimit;
      const percentage = (currentUsage / limit) * 100;

      // Calculate overage
      const overage = Math.max(0, currentUsage - limit);
      // Should warn at 80% and 90%
      const shouldWarn = percentage >= 80 && percentage < 100;

      return {
        currentUsage,
        limit,
        percentage,
        overage,
        overageFee: 0,
        capReached: false,
        shouldWarn
      };

    } catch (error) {
      console.error("[UsageTracker] Error getting usage:", error);
      return null;
    }
  }

  /**
   * Check if usage should be charged (overage)
   */
  async shouldChargeUsage(_shop: string): Promise<false> {
    return false;
  }

  /**
   * Reset usage for new billing period
   */
  async resetUsageForNewPeriod(shop: string): Promise<void> {
    try {
      await prisma.billingSubscription.update({
        where: { shop },
        data: {
          currentPeriodOrders: 0,
          currentPeriodUsageFee: 0,
          lastChargedBatch: 0,
          lastUsageReset: new Date()
        }
      });

      console.log(`[UsageTracker] Reset usage for ${shop}`);

    } catch (error) {
      console.error("[UsageTracker] Error resetting usage:", error);
    }
  }

  /**
   * Check and reset period if needed
   */
  private async checkAndResetPeriod(shop: string, billingSubscription: any): Promise<void> {
    if (!billingSubscription.currentPeriodEnd) {
      return;
    }

    const now = new Date();
    const periodEnd = new Date(billingSubscription.currentPeriodEnd);

    // If current period has ended, reset usage
    if (now > periodEnd) {
      await this.resetUsageForNewPeriod(shop);

      // Update period end (add 30 days)
      const newPeriodEnd = new Date(periodEnd);
      newPeriodEnd.setDate(newPeriodEnd.getDate() + 30);

      await prisma.billingSubscription.update({
        where: { shop },
        data: {
          currentPeriodEnd: newPeriodEnd
        }
      });
    }
  }

  /**
   * Get usage warning messages
   */
  async getUsageWarnings(shop: string): Promise<string[]> {
    const warnings: string[] = [];
    const usage = await this.getCurrentUsage(shop);

    if (!usage) {
      return warnings;
    }

    if (usage.percentage >= 90 && usage.percentage < 100) {
      warnings.push(
        `You've used ${usage.currentUsage} of ${usage.limit} orders (${Math.round(usage.percentage)}%). Consider upgrading soon.`
      );
    } else if (usage.percentage >= 80 && usage.percentage < 90) {
      warnings.push(
        `You've used ${usage.currentUsage} of ${usage.limit} orders (${Math.round(usage.percentage)}%) this month.`
      );
    }

    if (usage.capReached) {
      warnings.push(
        `You've reached this plan's monthly capacity. RewardsPro remains available; consider a larger fixed-price plan.`
      );
    } else if (usage.overage > 0) {
      warnings.push(
        `You're ${usage.overage} orders over this plan's monthly capacity. There is no automatic overage charge.`
      );
    }

    return warnings;
  }

  /**
   * Check if features should be blocked due to usage
   */
  async shouldBlockFeatures(shop: string): Promise<boolean> {
    const usage = await this.getCurrentUsage(shop);

    if (!usage) {
      return false;
    }

    return false;
  }
}
