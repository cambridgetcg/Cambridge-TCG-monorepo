/**
 * Usage Tracker Service
 * Tracks order usage and manages usage-based billing
 */

import db from "../../db.server";
import { GraphQLBillingService } from "./graphql-billing.service";
import { getPlanConfig } from "../../utils/billing-config";
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
   */
  async trackOrder(shop: string, orderId: string): Promise<void> {
    try {
      const billingSubscription = await db.billingSubscription.findUnique({
        where: { shop }
      });

      if (!billingSubscription) {
        console.log(`[UsageTracker] No billing subscription for ${shop}`);
        return;
      }

      // Check if we need to reset usage for new period
      await this.checkAndResetPeriod(shop, billingSubscription);

      // Increment order count
      await db.billingSubscription.update({
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
      const billingSubscription = await db.billingSubscription.findUnique({
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
        overageFee = overage * parseFloat(planConfig.usageRate);
      }

      // Check if cap reached
      const capReached = planConfig.usageCap
        ? billingSubscription.currentPeriodUsageFee >= parseFloat(planConfig.usageCap)
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
      const billingSubscription = await db.billingSubscription.findUnique({
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
        const capAmount = parseFloat(planConfig.usageCap);
        if (billingSubscription.currentPeriodUsageFee >= capAmount) {
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
      await db.billingSubscription.update({
        where: { shop },
        data: {
          currentPeriodOrders: 0,
          currentPeriodUsageFee: 0,
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

      await db.billingSubscription.update({
        where: { shop },
        data: {
          currentPeriodEnd: newPeriodEnd
        }
      });
    }
  }

  /**
   * Charge usage if needed
   */
  private async chargeUsageIfNeeded(shop: string): Promise<void> {
    try {
      const billingSubscription = await db.billingSubscription.findUnique({
        where: { shop }
      });

      if (!billingSubscription || !billingSubscription.usageLineItemId) {
        return;
      }

      const planConfig = getPlanConfig(billingSubscription.planType || 'free');
      if (!planConfig || !planConfig.usageRate) {
        return;
      }

      // Calculate overage to charge
      const overage = billingSubscription.currentPeriodOrders - planConfig.orderLimit;
      if (overage <= 0) {
        return;
      }

      // Charge in batches of 100 orders to avoid many small charges
      const batchSize = 100;
      if (overage % batchSize !== 0) {
        return; // Wait for full batch
      }

      const chargeAmount = batchSize * parseFloat(planConfig.usageRate);

      // Check if would exceed cap
      if (planConfig.usageCap) {
        const capAmount = parseFloat(planConfig.usageCap);
        const newTotal = billingSubscription.currentPeriodUsageFee + chargeAmount;

        if (newTotal > capAmount) {
          // Charge only up to cap
          const remainingCap = capAmount - billingSubscription.currentPeriodUsageFee;
          if (remainingCap <= 0) {
            return; // Cap already reached
          }

          // Create usage record for remaining cap amount
          await this.graphqlBilling.createUsageRecord(
            shop,
            remainingCap,
            `Usage charge for orders (capped)`
          );
          return;
        }
      }

      // Create usage record
      const description = `Usage charge for ${batchSize} orders over limit`;
      await this.graphqlBilling.createUsageRecord(shop, chargeAmount, description);

      console.log(`[UsageTracker] Charged ${chargeAmount} for ${shop}`);

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