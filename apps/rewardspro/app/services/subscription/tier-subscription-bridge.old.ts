/**
 * Tier Subscription Bridge Service
 * Manages the connection between tier subscriptions and tier access
 * Handles purchase flow, status changes, and tier assignment
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";
import type { 
  TierSubscription, 
  BillingInterval,
  SubscriptionStatus,
  TierChangeType,
  TierTriggerType 
} from "@prisma/client";
import { randomUUID } from 'crypto';

const uuidv4 = () => randomUUID();

interface TierSubscriptionPurchaseInput {
  shop: string;
  admin: AdminApiContext;
  customerId: string;
  customerShopifyId: string;
  lineItem: any;
  orderId: string;
  sellingPlanId: string;
  contractId: string;
}

interface StatusChangeInput {
  shop: string;
  subscriptionId: string;
  newStatus: SubscriptionStatus;
  reason?: string;
}

interface SubscriptionCreateResult {
  success: boolean;
  subscription?: TierSubscription;
  error?: string;
}

// Configuration
const REVOKE_ON_PAUSE = false; // Keep tier access when paused
const GRACE_PERIOD_DAYS = 3; // Days to maintain access after failure

export class TierSubscriptionBridge {
  /**
   * Handle tier subscription purchase from order webhook
   */
  static async handleTierSubscriptionPurchase({
    shop,
    admin,
    customerId,
    customerShopifyId,
    lineItem,
    orderId,
    sellingPlanId,
    contractId,
  }: TierSubscriptionPurchaseInput): Promise<SubscriptionCreateResult> {
    try {
      console.log(`[TierSubscriptionBridge] Processing subscription purchase for contract ${contractId}`);

      // 1. Find the tier product from the line item
      const tierProduct = await db.tierProduct.findFirst({
        where: {
          shop,
          shopifyProductId: `gid://shopify/Product/${lineItem.product_id}`,
        },
        include: { tier: true },
      });

      if (!tierProduct) {
        // Try without gid prefix
        const tierProductAlt = await db.tierProduct.findFirst({
          where: {
            shop,
            shopifyProductId: lineItem.product_id.toString(),
          },
          include: { tier: true },
        });

        if (!tierProductAlt) {
          console.error(`[TierSubscriptionBridge] Tier product not found for product ID ${lineItem.product_id}`);
          return {
            success: false,
            error: `Tier product not found for product ID ${lineItem.product_id}`,
          };
        }
        
        Object.assign(tierProduct, tierProductAlt);
      }

      // 2. Determine billing interval from selling plan
      const billingInterval = await this.getBillingIntervalFromPlan(shop, sellingPlanId);

      // 3. Calculate subscription dates
      const now = new Date();
      const periodEnd = this.calculatePeriodEnd(now, billingInterval);
      const nextBilling = this.calculateNextBilling(now, billingInterval);

      // 4. Create or update TierSubscription
      const subscription = await db.tierSubscription.upsert({
        where: {
          subscriptionContractId: contractId,
        },
        update: {
          status: "ACTIVE",
          lastBillingDate: now,
          shopifyOrderId: orderId,
          updatedAt: now,
        },
        create: {
          id: uuidv4(),
          shop,
          customerId,
          tierId: tierProduct.tierId,
          tierProductId: tierProduct.id,
          subscriptionContractId: contractId,
          sellingPlanId,
          sellingPlanGroupId: tierProduct.sellingPlanGroupId || "",
          productVariantId: lineItem.variant_id?.toString() || tierProduct.shopifyVariantId,
          status: "ACTIVE",
          billingInterval,
          deliveryInterval: billingInterval,
          basePrice: lineItem.price,
          discountPercentage: lineItem.discount_allocations?.[0]?.amount 
            ? Math.round((lineItem.discount_allocations[0].amount / lineItem.price) * 100)
            : 0,
          finalPrice: lineItem.price - (lineItem.discount_allocations?.[0]?.amount || 0),
          currency: lineItem.price_set?.shop_money?.currency_code || "USD",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          nextBillingDate: nextBilling,
          lastBillingDate: now,
          startedAt: now,
          shopifyOrderId: orderId,
          createdAt: now,
          updatedAt: now,
        },
      });

      console.log(`[TierSubscriptionBridge] Created/updated subscription ${subscription.id}`);

      // 5. Ensure customer exists
      let customer = await db.customer.findFirst({
        where: {
          shop,
          shopifyCustomerId: customerShopifyId,
        },
      });

      if (!customer) {
        // Create customer if doesn't exist
        const shopifyCustomer = await this.fetchShopifyCustomer(admin, customerShopifyId);
        customer = await db.customer.create({
          data: {
            id: uuidv4(),
            shop,
            shopifyCustomerId: customerShopifyId,
            email: shopifyCustomer?.email || lineItem.email || "unknown@example.com",
            firstName: shopifyCustomer?.firstName || "",
            lastName: shopifyCustomer?.lastName || "",
            storeCredit: 0,
            currentTierId: tierProduct.tierId,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      // 6. Assign tier to customer with subscription flag
      await db.customer.update({
        where: { id: customer.id },
        data: {
          currentTierId: tierProduct.tierId,
          updatedAt: new Date(),
        }
      });

      // 7. Log tier change
      await db.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId: customer.id,
          shop,
          fromTierId: customer.currentTierId,
          fromTierName: null,
          toTierId: tierProduct.tierId,
          toTierName: null,
          changeType: customer.currentTierId ? "UPGRADE" : "INITIAL_ASSIGNMENT",
          triggerType: "SUBSCRIPTION_STARTED",
          subscriptionId: subscription.id,
          metadata: {
            orderId,
            contractId,
            sellingPlanId,
            productName: lineItem.name,
          },
          createdAt: now,
        },
      });

      console.log(`[TierSubscriptionBridge] Successfully processed subscription for customer ${customer.id}`);

      return {
        success: true,
        subscription,
      };
    } catch (error) {
      console.error("[TierSubscriptionBridge] Error handling subscription purchase:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Handle subscription status changes (from webhooks or manual actions)
   */
  static async handleSubscriptionStatusChange({
    shop,
    subscriptionId,
    newStatus,
    reason,
  }: StatusChangeInput): Promise<void> {
    try {
      const subscription = await db.tierSubscription.findUnique({
        where: { id: subscriptionId },
        include: { customer: true, tier: true },
      });

      if (!subscription || subscription.shop !== shop) {
        console.error(`[TierSubscriptionBridge] Subscription ${subscriptionId} not found`);
        return;
      }

      const now = new Date();
      const oldStatus = subscription.status;

      // Update subscription status
      const updateData: any = {
        status: newStatus,
        updatedAt: now,
      };

      // Add status-specific fields
      switch (newStatus) {
        case "CANCELLED":
          updateData.cancelledAt = now;
          updateData.cancellationReason = reason || "Customer requested";
          break;
        case "PAUSED":
          updateData.pausedAt = now;
          break;
        case "ACTIVE":
          if (oldStatus === "PAUSED") {
            updateData.resumedAt = now;
          }
          break;
        case "FAILED":
          updateData.failureCount = subscription.failureCount + 1;
          break;
      }

      await db.tierSubscription.update({
        where: { id: subscriptionId },
        data: updateData,
      });

      // Handle tier access based on status
      await this.handleTierAccessForStatus(subscription, newStatus, reason);

      console.log(`[TierSubscriptionBridge] Updated subscription ${subscriptionId} status from ${oldStatus} to ${newStatus}`);
    } catch (error) {
      console.error("[TierSubscriptionBridge] Error handling status change:", error);
      throw error;
    }
  }

  /**
   * Handle tier access based on subscription status
   */
  private static async handleTierAccessForStatus(
    subscription: any,
    newStatus: SubscriptionStatus,
    reason?: string
  ): Promise<void> {
    const now = new Date();

    switch (newStatus) {
      case "CANCELLED":
      case "EXPIRED":
        await this.revokeTierAccess(subscription, reason || "Subscription ended");
        break;

      case "FAILED":
        // Check if within grace period
        if (subscription.failureCount >= 3) {
          await this.revokeTierAccess(subscription, "Payment failures exceeded limit");
        }
        break;

      case "ACTIVE":
        await this.grantTierAccess(subscription);
        break;

      case "PAUSED":
        if (REVOKE_ON_PAUSE) {
          await this.revokeTierAccess(subscription, "Subscription paused");
        }
        // Otherwise maintain access during pause
        break;
    }
  }

  /**
   * Grant tier access for active subscription
   */
  private static async grantTierAccess(subscription: any): Promise<void> {
    const now = new Date();

    // Update customer tier if different
    if (subscription.customer.currentTierId !== subscription.tierId) {
      await db.customer.update({
        where: { id: subscription.customerId },
        data: {
          currentTierId: subscription.tierId,
          updatedAt: now,
        },
      });

      // Log tier change
      await db.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId: subscription.customerId,
          shop: subscription.shop,
          fromTierId: subscription.customer.currentTierId,
          toTierId: subscription.tierId,
          toTierName: subscription.tier.name,
          changeType: "UPGRADE",
          triggerType: "SUBSCRIPTION_RENEWED",
          subscriptionId: subscription.id,
          metadata: {
            reason: "Subscription reactivated",
          },
          createdAt: now,
        },
      });
    }
  }

  /**
   * Revoke tier access when subscription ends
   */
  private static async revokeTierAccess(
    subscription: any,
    reason: string
  ): Promise<void> {
    const now = new Date();

    // Check if customer has other active paths to this tier
    const hasAlternativeAccess = await this.checkAlternativeTierAccess(
      subscription.customerId,
      subscription.tierId
    );

    if (!hasAlternativeAccess) {
      // Calculate fallback tier based on spending
      const fallbackTier = await this.calculateFallbackTier(
        subscription.shop,
        subscription.customerId
      );

      // Update customer tier
      await db.customer.update({
        where: { id: subscription.customerId },
        data: {
          currentTierId: fallbackTier?.id || null,
          updatedAt: now,
        },
      });

      // Log tier change
      await db.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId: subscription.customerId,
          shop: subscription.shop,
          fromTierId: subscription.tierId,
          fromTierName: subscription.tier.name,
          toTierId: fallbackTier?.id || null,
          toTierName: fallbackTier?.name || null,
          changeType: fallbackTier ? "DOWNGRADE" : "INITIAL_ASSIGNMENT",
          triggerType: "SUBSCRIPTION_ENDED",
          subscriptionId: subscription.id,
          metadata: {
            reason,
            fallbackMethod: "spending_based",
          },
          createdAt: now,
        },
      });

      console.log(`[TierSubscriptionBridge] Revoked tier access for customer ${subscription.customerId}: ${reason}`);
    } else {
      console.log(`[TierSubscriptionBridge] Customer ${subscription.customerId} has alternative tier access, maintaining tier`);
    }
  }

  /**
   * Check if customer has alternative access to the tier
   */
  private static async checkAlternativeTierAccess(
    customerId: string,
    tierId: string
  ): Promise<boolean> {
    // Check for other active subscriptions
    const otherActiveSubscriptions = await db.tierSubscription.count({
      where: {
        customerId,
        tierId,
        status: "ACTIVE",
      },
    });

    if (otherActiveSubscriptions > 1) {
      return true;
    }

    // Check for one-time purchase override
    const customer = await db.customer.findUnique({
      where: { id: customerId },
    });

    if (customer?.tierOverrideUntil && customer.tierOverrideUntil > new Date()) {
      return true;
    }

    return false;
  }

  /**
   * Calculate fallback tier based on customer spending
   */
  private static async calculateFallbackTier(
    shop: string,
    customerId: string
  ): Promise<{ id: string; name: string } | null> {
    // Get customer's total spending
    const customer = await db.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) return null;

    // For now, return to base tier or null
    // In production, calculate based on actual spending history
    const baseTier = await db.tier.findFirst({
      where: {
        shop,
        minSpend: 0,
      },
      orderBy: {
        minSpend: "asc",
      },
    });

    return baseTier ? { id: baseTier.id, name: baseTier.name } : null;
  }

  /**
   * Get billing interval from selling plan
   */
  private static async getBillingIntervalFromPlan(
    shop: string,
    sellingPlanId: string
  ): Promise<BillingInterval> {
    const sellingPlan = await db.sellingPlan.findFirst({
      where: {
        shopifyPlanId: sellingPlanId,
      },
    });

    if (sellingPlan) {
      return sellingPlan.billingInterval;
    }

    // Default to monthly if not found
    console.warn(`[TierSubscriptionBridge] Selling plan ${sellingPlanId} not found, defaulting to MONTHLY`);
    return "MONTHLY";
  }

  /**
   * Calculate period end date based on billing interval
   */
  private static calculatePeriodEnd(
    startDate: Date,
    interval: BillingInterval
  ): Date {
    const endDate = new Date(startDate);

    switch (interval) {
      case "WEEKLY":
        endDate.setDate(endDate.getDate() + 7);
        break;
      case "MONTHLY":
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case "QUARTERLY":
        endDate.setMonth(endDate.getMonth() + 3);
        break;
      case "SEMIANNUAL":
        endDate.setMonth(endDate.getMonth() + 6);
        break;
      case "ANNUAL":
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
    }

    return endDate;
  }

  /**
   * Calculate next billing date
   */
  private static calculateNextBilling(
    currentDate: Date,
    interval: BillingInterval
  ): Date {
    // Next billing is typically at the end of the current period
    return this.calculatePeriodEnd(currentDate, interval);
  }

  /**
   * Fetch customer from Shopify
   */
  private static async fetchShopifyCustomer(
    admin: AdminApiContext,
    customerId: string
  ): Promise<any> {
    try {
      const query = `
        query GetCustomer($id: ID!) {
          customer(id: $id) {
            id
            email
            firstName
            lastName
            phone
            acceptsMarketing
          }
        }
      `;

      const response = await admin.graphql(query, {
        variables: {
          id: customerId.includes("gid://") ? customerId : `gid://shopify/Customer/${customerId}`,
        },
      });

      const data = await response.json();
      return data.data?.customer;
    } catch (error) {
      console.error("[TierSubscriptionBridge] Error fetching customer from Shopify:", error);
      return null;
    }
  }

  /**
   * Sync subscription with Shopify contract
   */
  static async syncWithShopifyContract({
    shop,
    admin,
    contractId,
  }: {
    shop: string;
    admin: AdminApiContext;
    contractId: string;
  }): Promise<void> {
    try {
      const query = `
        query GetSubscriptionContract($id: ID!) {
          subscriptionContract(id: $id) {
            id
            status
            nextBillingDate
            customer {
              id
              email
            }
            lines(first: 1) {
              edges {
                node {
                  id
                  title
                  variantId
                  quantity
                  pricingPolicy {
                    basePrice {
                      amount
                      currencyCode
                    }
                    cycleDiscounts {
                      adjustmentType
                      adjustmentValue {
                        ... on MoneyV2 {
                          amount
                          currencyCode
                        }
                        ... on SellingPlanPricingPolicyPercentageValue {
                          percentage
                        }
                      }
                    }
                  }
                }
              }
            }
            billingPolicy {
              interval
              intervalCount
            }
          }
        }
      `;

      const response = await admin.graphql(query, {
        variables: {
          id: contractId.includes("gid://") ? contractId : `gid://shopify/SubscriptionContract/${contractId}`,
        },
      });

      const data = await response.json();
      const contract = data.data?.subscriptionContract;

      if (contract) {
        // Update local subscription with Shopify data
        await db.tierSubscription.update({
          where: { subscriptionContractId: contractId },
          data: {
            status: this.mapShopifyStatus(contract.status),
            nextBillingDate: contract.nextBillingDate ? new Date(contract.nextBillingDate) : null,
            updatedAt: new Date(),
          },
        });
      }
    } catch (error) {
      console.error("[TierSubscriptionBridge] Error syncing with Shopify contract:", error);
    }
  }

  /**
   * Map Shopify subscription status to our enum
   */
  private static mapShopifyStatus(shopifyStatus: string): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      ACTIVE: "ACTIVE",
      PAUSED: "PAUSED",
      CANCELLED: "CANCELLED",
      EXPIRED: "EXPIRED",
      FAILED: "FAILED",
    };

    return statusMap[shopifyStatus] || "PENDING";
  }
}