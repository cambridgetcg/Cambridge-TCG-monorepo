/**
 * Usage Tracker Service
 * Tracks order usage and manages usage-based billing
 */

import prisma from "../../db.server";
import { GraphQLBillingService } from "./graphql-billing.service";
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
  private graphqlBilling: GraphQLBillingService;

  constructor(private admin: AdminApiContext) {
    this.graphqlBilling = new GraphQLBillingService(admin);
  }

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

      // Check if we should charge usage
      if (await this.shouldChargeUsage(shop)) {
        await this.chargeUsageIfNeeded(shop);
      }

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
      let overageFee = 0;

      if (overage > 0 && planConfig.usageRate) {
        overageFee = overage * planConfig.usageRate;
      }

      // Check if cap reached
      const capReached = planConfig.usageCap
        ? billingSubscription.currentPeriodUsageFee >= planConfig.usageCap
        : false;

      // Should warn at 80% and 90%
      const shouldWarn = percentage >= 80 && percentage < 100;

      return {
        currentUsage,
        limit,
        percentage,
        overage,
        overageFee,
        capReached,
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
  async shouldChargeUsage(shop: string): Promise<boolean> {
    try {
      const billingSubscription = await prisma.billingSubscription.findUnique({
        where: { shop }
      });

      if (!billingSubscription || !billingSubscription.usageLineItemId) {
        return false; // No usage-based billing configured
      }

      const planConfig = getPlanConfig(billingSubscription.planType || 'free');
      if (!planConfig || !planConfig.usageRate) {
        return false;
      }

      // Check if over limit
      const overage = billingSubscription.currentPeriodOrders - planConfig.orderLimit;
      if (overage <= 0) {
        return false; // Still within limit
      }

      // Check if cap reached
      if (planConfig.usageCap) {
        if (billingSubscription.currentPeriodUsageFee >= planConfig.usageCap) {
          return false; // Cap reached, no more charges
        }
      }

      return true;

    } catch (error) {
      console.error("[UsageTracker] Error checking if should charge:", error);
      return false;
    }
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
   * Charge usage if needed - batches of 100 orders
   */
  private async chargeUsageIfNeeded(shop: string): Promise<void> {
    try {
      const billingSubscription = await prisma.billingSubscription.findUnique({
        where: { shop }
      });

      if (!billingSubscription || !billingSubscription.usageLineItemId) {
        return;
      }

      const planConfig = getPlanConfig(billingSubscription.planType || 'free');
      if (!planConfig || !planConfig.usageRate || !planConfig.usageBatchSize) {
        return;
      }

      // Calculate overage
      const overage = billingSubscription.currentPeriodOrders - planConfig.orderLimit;
      if (overage <= 0) {
        return; // Still within limit
      }

      // Calculate which batch we're in based on overage
      const batchSize = planConfig.usageBatchSize;
      const currentBatch = Math.floor(overage / batchSize);
      const lastChargedBatch = billingSubscription.lastChargedBatch || 0;

      // Only charge if we have new complete batches
      if (currentBatch <= lastChargedBatch) {
        return; // No new batches to charge
      }

      // Calculate how many batches to charge
      const batchesToCharge = currentBatch - lastChargedBatch;
      const chargeAmount = batchesToCharge * batchSize * planConfig.usageRate;

      console.log(`[UsageTracker] Shop ${shop}: ${overage} orders over limit, charging ${batchesToCharge} batch(es) = $${chargeAmount}`);

      // Check if would exceed cap
      if (planConfig.usageCap) {
        const newTotal = billingSubscription.currentPeriodUsageFee + chargeAmount;

        if (newTotal > planConfig.usageCap) {
          // Charge only up to cap
          const remainingCap = planConfig.usageCap - billingSubscription.currentPeriodUsageFee;

          if (remainingCap <= 0) {
            console.log(`[UsageTracker] Cap already reached for ${shop}`);
            return; // Cap already reached
          }

          // Create usage record for remaining cap amount
          const result = await this.graphqlBilling.createUsageRecord(
            shop,
            remainingCap,
            `Usage charge capped at $${planConfig.usageCap}/month`
          );

          if (result.success) {
            // Update lastChargedBatch to current to prevent re-charging
            await prisma.billingSubscription.update({
              where: { shop },
              data: { lastChargedBatch: currentBatch }
            });
            console.log(`[UsageTracker] Charged remaining cap $${remainingCap} for ${shop}`);
          }

          return;
        }
      }

      // Create usage record for full batch amount
      const description = batchesToCharge === 1
        ? `${batchSize} orders over ${planConfig.orderLimit} limit`
        : `${batchesToCharge * batchSize} orders over ${planConfig.orderLimit} limit (${batchesToCharge} batches)`;

      const result = await this.graphqlBilling.createUsageRecord(shop, chargeAmount, description);

      if (result.success) {
        // Update lastChargedBatch to track what we just charged
        await prisma.billingSubscription.update({
          where: { shop },
          data: { lastChargedBatch: currentBatch }
        });

        console.log(`[UsageTracker] Charged $${chargeAmount} for ${shop} (batch ${currentBatch})`);
      } else {
        console.error(`[UsageTracker] Failed to charge usage for ${shop}:`, result.error);
      }

    } catch (error) {
      console.error("[UsageTracker] Error charging usage:", error);
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
        `You've reached your usage cap. Additional orders won't be charged but features may be limited.`
      );
    } else if (usage.overage > 0) {
      warnings.push(
        `You're ${usage.overage} orders over your limit. Additional charges of $${usage.overageFee.toFixed(2)} will apply.`
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

    // Block if cap reached and configured to hard cap
    if (usage.capReached) {
      // Could make this configurable per shop
      return true; // Hard cap - block features
    }

    return false;
  }
}