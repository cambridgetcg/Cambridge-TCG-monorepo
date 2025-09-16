/**
 * Subscription Pricing Manager Service
 * Handles pricing updates, history tracking, and synchronization with Shopify
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";
import type { BillingInterval, Decimal } from "@prisma/client";
import { GraphqlQueryError } from "@shopify/shopify-api";

interface UpdatePricingInput {
  shop: string;
  admin: AdminApiContext;
  sellingPlanId: string;
  newPrice: number;
  discountPercentage: number;
  changeReason?: string;
  effectiveDate?: Date;
  applyToActive?: boolean;
  changedBy: string;
}

interface BulkUpdateInput {
  shop: string;
  admin: AdminApiContext;
  tierId: string;
  pricesByInterval: Map<BillingInterval, { price: number; discount: number }>;
  changeReason?: string;
  effectiveDate?: Date;
  changedBy: string;
}

interface UpdateResult {
  success: boolean;
  message?: string;
  error?: string;
  affectedSubscriptions?: number;
  revenueImpact?: number;
  historyId?: string;
}

interface PricingHistory {
  id: string;
  billingInterval: BillingInterval;
  previousPrice: number;
  newPrice: number;
  previousDiscount: number;
  newDiscount: number;
  changedBy: string;
  changeReason: string | null;
  effectiveDate: Date;
  createdAt: Date;
}

interface ProrationDetails {
  originalAmount: number;
  newAmount: number;
  daysRemaining: number;
  totalDays: number;
  creditAmount: number;
  chargeAmount: number;
  netAmount: number;
}

export class SubscriptionPricingManager {
  /**
   * Update selling plan pricing in Shopify and local database
   */
  static async updateSellingPlanPricing({
    shop,
    admin,
    sellingPlanId,
    newPrice,
    discountPercentage,
    changeReason,
    effectiveDate = new Date(),
    applyToActive = false,
    changedBy,
  }: UpdatePricingInput): Promise<UpdateResult> {
    try {
      // Get current selling plan
      const sellingPlan = await db.sellingPlan.findUnique({
        where: { id: sellingPlanId },
        include: { group: true },
      });

      if (!sellingPlan) {
        return {
          success: false,
          error: "Selling plan not found",
        };
      }

      // Validate pricing configuration
      const config = await this.getPricingConfig(shop);
      if (!config.allowPriceEditing) {
        return {
          success: false,
          error: "Price editing is disabled for this shop",
        };
      }

      // Validate discount percentage
      if (discountPercentage < Number(config.minDiscountPercent) || 
          discountPercentage > Number(config.maxDiscountPercent)) {
        return {
          success: false,
          error: `Discount must be between ${config.minDiscountPercent}% and ${config.maxDiscountPercent}%`,
        };
      }

      // Store previous values for history
      const previousPrice = Number(sellingPlan.basePrice || 0);
      const previousDiscount = Number(sellingPlan.currentDiscount || 0);

      // Update Shopify selling plan
      const shopifyResult = await this.updateShopifySellingPlan({
        admin,
        shopifyPlanId: sellingPlan.shopifyPlanId,
        discountPercentage,
      });

      if (!shopifyResult.success) {
        return {
          success: false,
          error: shopifyResult.error || "Failed to update Shopify selling plan",
        };
      }

      // Count affected subscriptions
      const affectedCount = await db.tierSubscription.count({
        where: {
          shop,
          sellingPlanId: sellingPlan.shopifyPlanId,
          status: { in: ["ACTIVE", "PAUSED"] },
        },
      });

      // Calculate revenue impact
      const revenueImpact = affectedCount * (newPrice - previousPrice);

      // Create pricing history record
      const history = await db.subscriptionPricingHistory.create({
        data: {
          shop,
          sellingPlanId,
          billingInterval: sellingPlan.billingInterval,
          previousPrice,
          newPrice,
          previousDiscount,
          newDiscount: discountPercentage,
          changedBy,
          changeReason,
          effectiveDate,
          appliedToActive: applyToActive,
          affectedCount,
          revenueImpact,
          metadata: {
            groupId: sellingPlan.groupId,
            groupName: sellingPlan.group.name,
            planName: sellingPlan.name,
          },
        },
      });

      // Update selling plan in database
      await db.sellingPlan.update({
        where: { id: sellingPlanId },
        data: {
          basePrice: newPrice,
          currentDiscount: discountPercentage,
          lastPriceUpdate: new Date(),
        },
      });

      // Apply to active subscriptions if requested
      if (applyToActive && !config.allowGrandfathering) {
        await this.applyToActiveSubscriptions({
          shop,
          admin,
          sellingPlanId: sellingPlan.shopifyPlanId,
          newPrice,
          effectiveDate,
        });
      }

      // Send notifications if enabled
      if (config.notifyCustomers && affectedCount > 0) {
        // Queue notification job (implement notification service)
        console.log(`Queuing price change notifications for ${affectedCount} customers`);
      }

      return {
        success: true,
        message: `Successfully updated pricing for ${sellingPlan.name}`,
        affectedSubscriptions: affectedCount,
        revenueImpact,
        historyId: history.id,
      };
    } catch (error) {
      console.error("[PricingManager] Error updating selling plan pricing:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Bulk update all selling plans for a tier
   */
  static async updateTierPricing({
    shop,
    admin,
    tierId,
    pricesByInterval,
    changeReason,
    effectiveDate = new Date(),
    changedBy,
  }: BulkUpdateInput): Promise<UpdateResult> {
    try {
      // Get all selling plans for this tier
      const tier = await db.tier.findUnique({
        where: { id: tierId },
      });

      if (!tier) {
        return {
          success: false,
          error: "Tier not found",
        };
      }

      // Get selling plan group
      const sellingPlanGroup = await db.sellingPlanGroup.findFirst({
        where: { shop },
        include: { sellingPlans: true },
      });

      if (!sellingPlanGroup) {
        return {
          success: false,
          error: "No selling plan group found",
        };
      }

      let totalAffected = 0;
      let totalRevenueImpact = 0;
      const errors: string[] = [];

      // Update each selling plan
      for (const sellingPlan of sellingPlanGroup.sellingPlans) {
        const pricing = pricesByInterval.get(sellingPlan.billingInterval);
        if (!pricing) continue;

        const result = await this.updateSellingPlanPricing({
          shop,
          admin,
          sellingPlanId: sellingPlan.id,
          newPrice: pricing.price,
          discountPercentage: pricing.discount,
          changeReason,
          effectiveDate,
          changedBy,
        });

        if (result.success) {
          totalAffected += result.affectedSubscriptions || 0;
          totalRevenueImpact += result.revenueImpact || 0;
        } else {
          errors.push(`${sellingPlan.name}: ${result.error}`);
        }
      }

      if (errors.length > 0) {
        return {
          success: false,
          error: `Some updates failed: ${errors.join(", ")}`,
          affectedSubscriptions: totalAffected,
          revenueImpact: totalRevenueImpact,
        };
      }

      return {
        success: true,
        message: `Successfully updated pricing for tier ${tier.name}`,
        affectedSubscriptions: totalAffected,
        revenueImpact: totalRevenueImpact,
      };
    } catch (error) {
      console.error("[PricingManager] Error updating tier pricing:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Get pricing history for a selling plan
   */
  static async getPricingHistory({
    shop,
    sellingPlanId,
    limit = 10,
  }: {
    shop: string;
    sellingPlanId?: string;
    limit?: number;
  }): Promise<PricingHistory[]> {
    const where: any = { shop };
    if (sellingPlanId) {
      where.sellingPlanId = sellingPlanId;
    }

    const history = await db.subscriptionPricingHistory.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return history.map(h => ({
      id: h.id,
      billingInterval: h.billingInterval,
      previousPrice: Number(h.previousPrice),
      newPrice: Number(h.newPrice),
      previousDiscount: Number(h.previousDiscount),
      newDiscount: Number(h.newDiscount),
      changedBy: h.changedBy,
      changeReason: h.changeReason,
      effectiveDate: h.effectiveDate,
      createdAt: h.createdAt,
    }));
  }

  /**
   * Calculate proration for mid-cycle price changes
   */
  static async calculateProration({
    subscriptionId,
    oldPrice,
    newPrice,
    effectiveDate,
  }: {
    subscriptionId: string;
    oldPrice: number;
    newPrice: number;
    effectiveDate: Date;
  }): Promise<ProrationDetails> {
    // Get subscription details
    const subscription = await db.tierSubscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    const currentPeriodStart = subscription.currentPeriodStart;
    const currentPeriodEnd = subscription.currentPeriodEnd;
    const totalDays = Math.ceil(
      (currentPeriodEnd.getTime() - currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysUsed = Math.ceil(
      (effectiveDate.getTime() - currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysRemaining = totalDays - daysUsed;

    // Calculate prorated amounts
    const dailyOldRate = oldPrice / totalDays;
    const dailyNewRate = newPrice / totalDays;
    
    const creditAmount = dailyOldRate * daysRemaining; // Credit for unused time at old price
    const chargeAmount = dailyNewRate * daysRemaining; // Charge for remaining time at new price
    const netAmount = chargeAmount - creditAmount; // Net amount to charge/credit

    return {
      originalAmount: oldPrice,
      newAmount: newPrice,
      daysRemaining,
      totalDays,
      creditAmount,
      chargeAmount,
      netAmount,
    };
  }

  /**
   * Preview the impact of a price change
   */
  static async previewPriceChange({
    shop,
    sellingPlanId,
    newPrice,
    discountPercentage,
  }: {
    shop: string;
    sellingPlanId: string;
    newPrice: number;
    discountPercentage: number;
  }): Promise<{
    affectedSubscriptions: number;
    currentRevenue: number;
    projectedRevenue: number;
    revenueChange: number;
    churnRisk: "LOW" | "MEDIUM" | "HIGH";
  }> {
    // Get current selling plan
    const sellingPlan = await db.sellingPlan.findUnique({
      where: { id: sellingPlanId },
    });

    if (!sellingPlan) {
      throw new Error("Selling plan not found");
    }

    // Count affected subscriptions
    const activeSubscriptions = await db.tierSubscription.findMany({
      where: {
        shop,
        sellingPlanId: sellingPlan.shopifyPlanId,
        status: "ACTIVE",
      },
    });

    const affectedCount = activeSubscriptions.length;
    const currentPrice = Number(sellingPlan.basePrice || 0);
    const currentRevenue = affectedCount * currentPrice;
    const projectedRevenue = affectedCount * newPrice;
    const revenueChange = projectedRevenue - currentRevenue;
    const percentChange = currentPrice > 0 ? ((newPrice - currentPrice) / currentPrice) * 100 : 0;

    // Estimate churn risk based on price increase percentage
    let churnRisk: "LOW" | "MEDIUM" | "HIGH" = "LOW";
    if (percentChange > 20) churnRisk = "HIGH";
    else if (percentChange > 10) churnRisk = "MEDIUM";

    return {
      affectedSubscriptions: affectedCount,
      currentRevenue,
      projectedRevenue,
      revenueChange,
      churnRisk,
    };
  }

  /**
   * Get or create pricing configuration for a shop
   */
  static async getPricingConfig(shop: string) {
    let config = await db.subscriptionPricingConfig.findUnique({
      where: { shop },
    });

    if (!config) {
      // Create default configuration
      config = await db.subscriptionPricingConfig.create({
        data: {
          shop,
          allowPriceEditing: true,
          requireApproval: false,
          minDiscountPercent: 0,
          maxDiscountPercent: 50,
          priceChangeNotice: 30,
          allowGrandfathering: true,
          autoSyncPrices: true,
          notifyCustomers: true,
        },
      });
    }

    return config;
  }

  /**
   * Update pricing configuration
   */
  static async updatePricingConfig(
    shop: string,
    updates: Partial<{
      allowPriceEditing: boolean;
      requireApproval: boolean;
      minDiscountPercent: number;
      maxDiscountPercent: number;
      priceChangeNotice: number;
      allowGrandfathering: boolean;
      autoSyncPrices: boolean;
      notifyCustomers: boolean;
    }>
  ) {
    return await db.subscriptionPricingConfig.upsert({
      where: { shop },
      update: updates,
      create: {
        shop,
        ...updates,
      },
    });
  }

  /**
   * Update Shopify selling plan via GraphQL
   */
  private static async updateShopifySellingPlan({
    admin,
    shopifyPlanId,
    discountPercentage,
  }: {
    admin: AdminApiContext;
    shopifyPlanId: string;
    discountPercentage: number;
  }): Promise<{ success: boolean; error?: string }> {
    const mutation = `
      mutation UpdateSellingPlan($id: ID!, $input: SellingPlanInput!) {
        sellingPlanUpdate(id: $id, input: $input) {
          sellingPlan {
            id
            name
            pricingPolicies {
              ... on SellingPlanPricingPolicyBase {
                adjustmentType
                adjustmentValue {
                  ... on SellingPlanPricingPolicyPercentageValue {
                    percentage
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(mutation, {
        variables: {
          id: shopifyPlanId,
          input: {
            pricingPolicies: [
              {
                fixed: {
                  adjustmentType: "PERCENTAGE",
                  adjustmentValue: {
                    percentage: discountPercentage,
                  },
                },
              },
            ],
          },
        },
      });

      const data = await response.json();

      if (data.data?.sellingPlanUpdate?.userErrors?.length > 0) {
        return {
          success: false,
          error: data.data.sellingPlanUpdate.userErrors
            .map((e: any) => e.message)
            .join(", "),
        };
      }

      return { success: true };
    } catch (error) {
      console.error("[PricingManager] GraphQL error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "GraphQL mutation failed",
      };
    }
  }

  /**
   * Apply price changes to active subscriptions
   */
  private static async applyToActiveSubscriptions({
    shop,
    admin,
    sellingPlanId,
    newPrice,
    effectiveDate,
  }: {
    shop: string;
    admin: AdminApiContext;
    sellingPlanId: string;
    newPrice: number;
    effectiveDate: Date;
  }): Promise<void> {
    // Get active subscriptions
    const subscriptions = await db.tierSubscription.findMany({
      where: {
        shop,
        sellingPlanId,
        status: "ACTIVE",
      },
    });

    // Update each subscription contract in Shopify
    for (const subscription of subscriptions) {
      try {
        await this.updateSubscriptionContract({
          admin,
          contractId: subscription.shopifyContractId,
          newPrice,
          effectiveDate,
        });

        // Update local subscription record
        await db.tierSubscription.update({
          where: { id: subscription.id },
          data: {
            finalPrice: newPrice,
            updatedAt: new Date(),
          },
        });
      } catch (error) {
        console.error(
          `[PricingManager] Failed to update subscription ${subscription.id}:`,
          error
        );
      }
    }
  }

  /**
   * Update individual subscription contract in Shopify
   */
  private static async updateSubscriptionContract({
    admin,
    contractId,
    newPrice,
    effectiveDate,
  }: {
    admin: AdminApiContext;
    contractId: string;
    newPrice: number;
    effectiveDate: Date;
  }): Promise<void> {
    // This would use Shopify's subscription contract update mutation
    // Implementation depends on Shopify's specific API requirements
    console.log(
      `[PricingManager] Would update contract ${contractId} to price ${newPrice} effective ${effectiveDate}`
    );
  }
}