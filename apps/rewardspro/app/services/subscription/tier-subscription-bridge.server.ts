/**
 * Tier Subscription Bridge Service V2
 * Enhanced version with transactions, idempotency, and comprehensive error handling
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";
import type {
  TierSubscription,
  BillingInterval,
  SubscriptionStatus,
  TierChangeType,
  TierTriggerType,
  Prisma
} from "@prisma/client";
import { randomUUID } from 'crypto';
import { withRetry } from "~/utils/retry";
import { validatePrice } from "~/utils/price-validation";
import { updateCustomerToEffectiveTier } from "../tier-resolution.server";

const uuidv4 = () => randomUUID();

// Configuration
const GRACE_PERIOD_DAYS = 3;
const REVOKE_ON_PAUSE = false;

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
  metadata?: Record<string, any>;
}

interface SubscriptionCreateResult {
  success: boolean;
  subscription?: TierSubscription;
  error?: string;
}

// Comprehensive status transition rules
const STATUS_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  PENDING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['PAUSED', 'CANCELLED', 'FAILED', 'EXPIRED'],
  PAUSED: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  CANCELLED: [], // Terminal state
  EXPIRED: [], // Terminal state
  FAILED: ['ACTIVE', 'CANCELLED'], // Can retry or cancel
};

// Status handlers with specific business logic
// These now use the tier resolution system to respect priority order:
// MANUAL_OVERRIDE > TIER_SUBSCRIPTION > TIER_PURCHASE > SPENDING_BASED
const STATUS_HANDLERS: Record<SubscriptionStatus, (subscription: any) => Promise<void>> = {
  PENDING: async (subscription) => {
    console.log(`[Subscription] Pending activation for ${subscription.id}`);
  },

  ACTIVE: async (subscription) => {
    // Use tier resolution to determine effective tier (respects manual overrides)
    console.log(`[Subscription] Subscription ${subscription.id} became ACTIVE, resolving tier`);
    const result = await updateCustomerToEffectiveTier(subscription.shop, subscription.customerId, {
      triggeredBy: "subscription_activated",
      subscriptionId: subscription.id,
    });
    console.log(`[Subscription] Tier resolution result:`, {
      changed: result.changed,
      newTierId: result.newTierId,
      source: result.source,
    });
  },

  PAUSED: async (subscription) => {
    if (REVOKE_ON_PAUSE) {
      // Re-resolve tier - customer might have other tier sources
      console.log(`[Subscription] Subscription ${subscription.id} PAUSED, re-resolving tier`);
      const result = await updateCustomerToEffectiveTier(subscription.shop, subscription.customerId, {
        triggeredBy: "subscription_paused",
        subscriptionId: subscription.id,
      });
      console.log(`[Subscription] Tier resolution after pause:`, {
        changed: result.changed,
        newTierId: result.newTierId,
        source: result.source,
      });
    }
  },

  CANCELLED: async (subscription) => {
    // Re-resolve tier - customer might have other tier sources (purchases, spending, etc.)
    console.log(`[Subscription] Subscription ${subscription.id} CANCELLED, re-resolving tier`);
    const result = await updateCustomerToEffectiveTier(subscription.shop, subscription.customerId, {
      triggeredBy: "subscription_cancelled",
      subscriptionId: subscription.id,
    });
    console.log(`[Subscription] Tier resolution after cancellation:`, {
      changed: result.changed,
      newTierId: result.newTierId,
      source: result.source,
    });
  },

  EXPIRED: async (subscription) => {
    // Re-resolve tier - customer might have other tier sources
    console.log(`[Subscription] Subscription ${subscription.id} EXPIRED, re-resolving tier`);
    const result = await updateCustomerToEffectiveTier(subscription.shop, subscription.customerId, {
      triggeredBy: "subscription_expired",
      subscriptionId: subscription.id,
    });
    console.log(`[Subscription] Tier resolution after expiry:`, {
      changed: result.changed,
      newTierId: result.newTierId,
      source: result.source,
    });
  },

  FAILED: async (subscription) => {
    // Start grace period
    const gracePeriodEnd = new Date();
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);

    // Check if model exists before using
    if (!db.tierSubscription) {
      console.warn('[TierSubscriptionBridgeV2] tierSubscription model not available');
      return;
    }

    await db.tierSubscription.update({
      where: { id: subscription.id },
      data: {
        metadata: {
          ...subscription.metadata,
          gracePeriodEnd: gracePeriodEnd.toISOString(),
          failureReason: 'Payment failed'
        }
      }
    });
  },
};

export class TierSubscriptionBridgeV2 {
  /**
   * Handle new tier subscription purchase with full transaction support
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
      const now = new Date();
      
      // Generate idempotency key
      const idempotencyKey = `${orderId}-${contractId}-${sellingPlanId}`;
      
      // Validate price
      const priceValidation = validatePrice(lineItem.price, 'USD');
      if (!priceValidation.valid) {
        throw new Error(`Invalid price: ${priceValidation.error}`);
      }

      // Execute with retry logic for transient failures
      const result = await withRetry(
        async () => {
          // Use transaction for atomic operations
          return await db.$transaction(async (tx) => {
            // 1. Check for existing subscription using idempotency
            const existingSubscription = await tx.tierSubscription.findFirst({
              where: {
                OR: [
                  { shopifyContractId: contractId },
                  { 
                    metadata: {
                      path: ['idempotencyKey'],
                      equals: idempotencyKey
                    }
                  }
                ]
              }
            });

            if (existingSubscription) {
              console.log(`[TierSubscriptionBridge] Idempotent request - subscription exists`);
              return existingSubscription;
            }

            // 2. Get tier product
            const tierProduct = await tx.tierProduct.findFirst({
              where: {
                shop,
                OR: [
                  { shopifyProductId: lineItem.product_id?.toString() },
                  { shopifyVariantId: lineItem.variant_id?.toString() },
                  { sku: lineItem.sku },
                ]
              },
              include: { tier: true }
            });

            if (!tierProduct) {
              throw new Error(`Tier product not found for SKU: ${lineItem.sku}`);
            }

            // Validate tier exists (prevent orphaned TierSubscription)
            if (!tierProduct.tier) {
              console.error(`[TierSubscriptionBridge] CRITICAL: TierProduct ${tierProduct.id} references non-existent tier ${tierProduct.tierId}`);
              throw new Error(`Tier ${tierProduct.tierId} not found - TierProduct ${tierProduct.id} is orphaned`);
            }

            // 3. Get or create customer
            let customer = await tx.customer.upsert({
              where: {
                shop_shopifyCustomerId: {
                  shop,
                  shopifyCustomerId: customerShopifyId,
                }
              },
              update: {
                updatedAt: now,
              },
              create: {
                id: uuidv4(),
                shop,
                shopifyCustomerId: customerShopifyId,
                email: lineItem.email || "",
                firstName: "",
                lastName: "",
                storeCredit: 0,
                currentTierId: null,
                createdAt: now,
                updatedAt: now,
              }
            });

            // 4. Determine billing interval from selling plan
            const billingInterval = this.determineBillingInterval(sellingPlanId);

            // 5. Create subscription with idempotency
            const subscription = await tx.tierSubscription.create({
              data: {
                id: uuidv4(),
                shop,
                customerId: customer.id,
                tierId: tierProduct.tierId,
                shopifyContractId: contractId,
                shopifyOrderId: orderId,
                sellingPlanId,
                status: "ACTIVE",
                startDate: now,
                nextBillingDate: this.calculateNextBillingDate(now, billingInterval),
                billingInterval,
                currentPrice: priceValidation.sanitizedPrice!,
                metadata: {
                  idempotencyKey,
                  productId: lineItem.product_id,
                  variantId: lineItem.variant_id,
                  productTitle: lineItem.name,
                  sku: lineItem.sku,
                  originalPrice: lineItem.price,
                } as Prisma.JsonObject,
                createdAt: now,
                updatedAt: now,
              }
            });

            // 6. Return subscription and customer info for tier resolution after transaction
            console.log(`[TierSubscriptionBridge] Transaction completed for subscription ${subscription.id}`);
            return { subscription, customerId: customer.id };
          });
        },
        {
          maxAttempts: 3,
          shouldRetry: (error) => {
            // Don't retry on business logic errors
            if (error.message?.includes('not found') ||
                error.message?.includes('Invalid price')) {
              return false;
            }
            return true;
          }
        }
      );

      // 7. Use tier resolution system AFTER transaction completes
      // This respects priority: MANUAL_OVERRIDE > TIER_SUBSCRIPTION > TIER_PURCHASE > SPENDING_BASED
      console.log(`[TierSubscriptionBridge] Resolving tier for customer ${result.customerId}`);
      const tierResult = await updateCustomerToEffectiveTier(shop, result.customerId, {
        triggeredBy: "subscription_started",
        subscriptionId: result.subscription.id,
      });

      console.log(`[TierSubscriptionBridge] Tier resolution result:`, {
        changed: tierResult.changed,
        previousTierId: tierResult.previousTierId,
        newTierId: tierResult.newTierId,
        source: tierResult.source,
      });

      return {
        success: true,
        subscription: result.subscription,
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
   * Handle subscription status changes with state machine validation
   */
  static async handleStatusChange({
    shop,
    subscriptionId,
    newStatus,
    reason,
    metadata = {},
  }: StatusChangeInput): Promise<void> {
    await db.$transaction(async (tx) => {
      const subscription = await tx.tierSubscription.findUnique({
        where: { id: subscriptionId },
        include: { customer: true, tier: true },
      });

      if (!subscription || subscription.shop !== shop) {
        throw new Error(`Subscription ${subscriptionId} not found`);
      }

      // Validate status transition
      if (!this.canTransition(subscription.status, newStatus)) {
        throw new Error(
          `Invalid status transition from ${subscription.status} to ${newStatus}`
        );
      }

      const now = new Date();

      // Update subscription status
      await tx.tierSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: newStatus,
          endDate: newStatus === 'CANCELLED' || newStatus === 'EXPIRED' ? now : undefined,
          metadata: {
            ...subscription.metadata,
            ...metadata,
            lastStatusChange: {
              from: subscription.status,
              to: newStatus,
              reason,
              timestamp: now.toISOString(),
            }
          } as Prisma.JsonObject,
          updatedAt: now,
        }
      });

      // Execute status-specific handler
      const handler = STATUS_HANDLERS[newStatus];
      if (handler) {
        await handler(subscription);
      }

      // Log the status change
      await tx.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId: subscription.customerId,
          shop,
          fromTierId: subscription.status === 'ACTIVE' ? subscription.tierId : null,
          toTierId: newStatus === 'ACTIVE' ? subscription.tierId : null,
          fromTierName: subscription.status === 'ACTIVE' ? subscription.tier.name : null,
          toTierName: newStatus === 'ACTIVE' ? subscription.tier.name : null,
          changeType: this.getChangeType(subscription.status, newStatus),
          triggerType: this.getTriggerType(newStatus),
          subscriptionId,
          metadata: {
            statusChange: {
              from: subscription.status,
              to: newStatus,
              reason,
            }
          } as Prisma.JsonObject,
          createdAt: now,
          updatedAt: now,
        }
      });

      console.log(`[TierSubscriptionBridge] Status changed from ${subscription.status} to ${newStatus}`);
    });
  }

  /**
   * Check if a status transition is valid
   */
  private static canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
    const allowedTransitions = STATUS_TRANSITIONS[from];
    return allowedTransitions?.includes(to) ?? false;
  }

  /**
   * Determine billing interval from selling plan
   */
  private static determineBillingInterval(sellingPlanId: string): BillingInterval {
    // This would need to fetch from Shopify or database
    // For now, default to MONTHLY
    return "MONTHLY";
  }

  /**
   * Calculate next billing date based on interval
   */
  private static calculateNextBillingDate(from: Date, interval: BillingInterval): Date {
    const next = new Date(from);
    const intervalStr = interval as string;

    switch (intervalStr) {
      case 'WEEKLY':
        next.setDate(next.getDate() + 7);
        break;
      case 'MONTHLY':
        next.setMonth(next.getMonth() + 1);
        break;
      case 'QUARTERLY':
        next.setMonth(next.getMonth() + 3);
        break;
      case 'SEMIANNUAL':
        next.setMonth(next.getMonth() + 6);
        break;
      case 'ANNUAL':
        next.setFullYear(next.getFullYear() + 1);
        break;
      default:
        next.setMonth(next.getMonth() + 1);
    }
    
    return next;
  }

  /**
   * Get change type based on status transition
   */
  private static getChangeType(from: SubscriptionStatus, to: SubscriptionStatus): TierChangeType {
    if (to === 'ACTIVE' && from !== 'ACTIVE') {
      return 'UPGRADE';
    }
    if (from === 'ACTIVE' && to !== 'ACTIVE') {
      return 'DOWNGRADE';
    }
    return 'INITIAL_ASSIGNMENT';
  }

  /**
   * Get trigger type based on new status
   */
  private static getTriggerType(status: SubscriptionStatus): TierTriggerType {
    switch (status) {
      case 'ACTIVE':
        return 'SUBSCRIPTION_STARTED';
      case 'CANCELLED':
        return 'SUBSCRIPTION_CANCELLED';
      case 'PAUSED':
        return 'MANUAL_ADMIN';
      default:
        return 'MANUAL_ADMIN';
    }
  }

  /**
   * Handle payment failures with grace period
   */
  static async handlePaymentFailure(
    shop: string,
    subscriptionId: string,
    failureReason: string
  ): Promise<void> {
    await this.handleStatusChange({
      shop,
      subscriptionId,
      newStatus: 'FAILED',
      reason: failureReason,
      metadata: {
        paymentFailure: {
          reason: failureReason,
          timestamp: new Date().toISOString(),
          gracePeriodDays: GRACE_PERIOD_DAYS,
        }
      }
    });
  }

  /**
   * Check and handle expired grace periods
   */
  static async checkGracePeriods(shop: string): Promise<void> {
    const now = new Date();
    
    const expiredGracePeriods = await db.tierSubscription.findMany({
      where: {
        shop,
        status: 'FAILED',
        metadata: {
          path: ['gracePeriodEnd'],
          lte: now.toISOString(),
        }
      }
    });

    for (const subscription of expiredGracePeriods) {
      await this.handleStatusChange({
        shop,
        subscriptionId: subscription.id,
        newStatus: 'CANCELLED',
        reason: 'Grace period expired',
      });
    }
  }
}