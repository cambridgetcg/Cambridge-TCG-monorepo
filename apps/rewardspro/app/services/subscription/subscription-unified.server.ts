/**
 * Unified Subscription Service
 *
 * Consolidates all subscription operations into a single service with:
 * - State machine validation
 * - Correlation ID tracing
 * - Idempotency enforcement
 * - Automatic tier resolution
 * - Consistent error handling
 *
 * Part of Neural Network Optimization - Service Consolidation
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";
import type {
  Customer,
  Tier,
  TierProduct,
  TierSubscription,
  SubscriptionStatus,
  Prisma,
} from "@prisma/client";
import { randomUUID } from 'crypto';

import {
  SUBSCRIPTION_NEURAL_CONFIG,
  isValidTransition,
  isTerminalStatus,
  calculateNextBillingDate,
  calculateDiscountedPrice,
  getGracePeriodEndDate,
  type BillingIntervalKey,
} from './subscription-neural-config.server';

import {
  subscriptionLogger,
  withCorrelation,
  generateCorrelationId,
  getCorrelationContext,
  addCorrelationMetadata,
} from './subscription-correlation.server';

import { updateCustomerToEffectiveTier } from '../tier-resolution.server';
import { withRetry } from '~/utils/error-handling.server';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface CreateSubscriptionInput {
  shop: string;
  admin: AdminApiContext;
  customer: Customer;
  tier: Tier;
  tierProduct?: TierProduct;
  sellingPlanId: string;
  variantId: string;
  billingInterval: BillingIntervalKey;
  paymentMethodId?: string;
  orderId?: string;
  idempotencyKey?: string;
}

export interface SubscriptionResult {
  success: boolean;
  subscription?: TierSubscription;
  contractId?: string;
  error?: string;
  errorCode?: string;
}

export interface StatusChangeInput {
  shop: string;
  admin?: AdminApiContext;
  subscriptionId: string;
  newStatus: SubscriptionStatus;
  reason?: string;
  metadata?: Record<string, unknown>;
  skipShopifySync?: boolean;
}

export interface StatusChangeResult {
  success: boolean;
  previousStatus?: SubscriptionStatus;
  newStatus?: SubscriptionStatus;
  tierChanged?: boolean;
  error?: string;
}

export interface BillingResult {
  success: boolean;
  chargeId?: string;
  amount?: number;
  nextBillingDate?: Date;
  error?: string;
}

// ============================================================================
// UNIFIED SUBSCRIPTION SERVICE
// ============================================================================

export class UnifiedSubscriptionService {
  // ════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTION CREATION
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Create a new subscription with full validation and idempotency
   */
  static async createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionResult> {
    const correlationId = generateCorrelationId();

    return withCorrelation(
      {
        correlationId,
        shop: input.shop,
        operation: 'create_subscription',
        customerId: input.customer.id,
      },
      async () => {
        subscriptionLogger.operationStart('createSubscription', {
          customerId: input.customer.id,
          tierName: input.tier.name,
          billingInterval: input.billingInterval,
        });

        try {
          // Generate idempotency key if not provided
          const idempotencyKey = input.idempotencyKey ||
            `${input.orderId || input.customer.id}-${input.tier.id}-${Date.now()}`;

          // Check idempotency
          const existing = await this.findByIdempotencyKey(input.shop, idempotencyKey);
          if (existing) {
            subscriptionLogger.idempotencyCheck(idempotencyKey, true);
            return { success: true, subscription: existing, contractId: existing.subscriptionContractId || undefined };
          }

          subscriptionLogger.idempotencyCheck(idempotencyKey, false);

          // Check for existing active subscription
          const existingActive = await this.findActiveSubscription(input.shop, input.customer.id);
          if (existingActive) {
            subscriptionLogger.warn('Customer has existing active subscription', {
              existingId: existingActive.id,
              existingTier: existingActive.tierId,
            });

            // Cancel existing subscription (upgrade/switch flow)
            if (!SUBSCRIPTION_NEURAL_CONFIG.tierBehavior.allowMultipleActiveSubscriptions) {
              await this.cancelExistingForUpgrade(existingActive);
            }
          }

          // Calculate pricing
          const priceInfo = calculateDiscountedPrice(
            input.tier.monthlyPrice?.toNumber() || 0,
            input.billingInterval
          );

          const nextBillingDate = calculateNextBillingDate(new Date(), input.billingInterval);

          // Create in Shopify first (with retry)
          let shopifyContractId: string | undefined;

          if (input.admin) {
            const shopifyResult = await this.createShopifyContract(input, priceInfo.discountedPrice, nextBillingDate);
            if (!shopifyResult.success) {
              return { success: false, error: shopifyResult.error, errorCode: 'SHOPIFY_ERROR' };
            }
            shopifyContractId = shopifyResult.contractId;
            addCorrelationMetadata('shopifyContractId', shopifyContractId);
          }

          // Create in database
          const subscription = await db.tierSubscription.create({
            data: {
              id: randomUUID(),
              shop: input.shop,
              customerId: input.customer.id,
              tierId: input.tier.id,
              tierProductId: input.tierProduct?.id,
              shopifyContractId,
              shopifyOrderId: input.orderId,
              sellingPlanId: input.sellingPlanId,
              status: 'ACTIVE',
              billingInterval: input.billingInterval,
              startDate: new Date(),
              nextBillingDate,
              currentPrice: priceInfo.discountedPrice,
              monthlyPrice: priceInfo.originalPrice,
              discountPercentage: priceInfo.discountPercent,
              metadata: {
                idempotencyKey,
                correlationId,
                variantId: input.variantId,
                tierName: input.tier.name,
                createdVia: 'unified_service',
              } as Prisma.JsonObject,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });

          subscriptionLogger.dbQuery('create', 'TierSubscription', { id: subscription.id });

          // Trigger tier resolution
          const tierResult = await updateCustomerToEffectiveTier(input.shop, input.customer.id, {
            triggeredBy: 'subscription_created',
            subscriptionId: subscription.id,
          });

          subscriptionLogger.tierResolution({
            changed: tierResult.changed,
            source: tierResult.source,
            tierId: tierResult.newTierId,
          });

          // Log tier change
          await this.logTierChange(input.shop, input.customer.id, {
            fromTierId: tierResult.previousTierId,
            toTierId: tierResult.newTierId,
            changeType: 'UPGRADE',
            triggerType: 'SUBSCRIPTION_STARTED',
            subscriptionId: subscription.id,
          });

          subscriptionLogger.operationComplete('createSubscription', {
            subscriptionId: subscription.id,
            tierChanged: tierResult.changed,
          });

          return {
            success: true,
            subscription,
            contractId: shopifyContractId,
          };
        } catch (error) {
          subscriptionLogger.error('Failed to create subscription', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorCode: 'INTERNAL_ERROR',
          };
        }
      }
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // STATUS CHANGES (State Machine Validated)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Change subscription status with state machine validation
   */
  static async changeStatus(input: StatusChangeInput): Promise<StatusChangeResult> {
    const correlationId = generateCorrelationId();

    return withCorrelation(
      {
        correlationId,
        shop: input.shop,
        operation: `status_change:${input.newStatus}`,
        subscriptionId: input.subscriptionId,
      },
      async () => {
        subscriptionLogger.operationStart('changeStatus', {
          subscriptionId: input.subscriptionId,
          newStatus: input.newStatus,
          reason: input.reason,
        });

        try {
          // Get current subscription
          const subscription = await db.tierSubscription.findUnique({
            where: { id: input.subscriptionId },
            include: { customer: true, tier: true },
          });

          if (!subscription || subscription.shop !== input.shop) {
            return { success: false, error: 'Subscription not found' };
          }

          const previousStatus = subscription.status;

          // Validate state transition
          if (!isValidTransition(previousStatus as any, input.newStatus)) {
            subscriptionLogger.warn('Invalid state transition attempted', {
              from: previousStatus,
              to: input.newStatus,
            });
            return {
              success: false,
              error: `Invalid status transition from ${previousStatus} to ${input.newStatus}`,
            };
          }

          subscriptionLogger.stateTransition(previousStatus, input.newStatus, input.reason);

          // Update Shopify if needed
          if (!input.skipShopifySync && input.admin && subscription.shopifyContractId) {
            await this.syncStatusToShopify(input.admin, subscription.shopifyContractId, input.newStatus);
          }

          // Prepare update data
          const now = new Date();
          const updateData: Prisma.TierSubscriptionUpdateInput = {
            status: input.newStatus,
            updatedAt: now,
            metadata: {
              ...(subscription.metadata as object || {}),
              ...input.metadata,
              lastStatusChange: {
                from: previousStatus,
                to: input.newStatus,
                reason: input.reason,
                timestamp: now.toISOString(),
                correlationId,
              },
            },
          };

          // Status-specific updates
          switch (input.newStatus) {
            case 'CANCELLED':
            case 'EXPIRED':
              updateData.cancelledAt = now;
              break;
            case 'PAUSED':
              // Could track pause date in metadata
              break;
            case 'FAILED':
              // Set grace period
              const gracePeriodEnd = getGracePeriodEndDate(now);
              updateData.metadata = {
                ...(updateData.metadata as object),
                gracePeriodEnd: gracePeriodEnd.toISOString(),
                failureReason: input.reason || 'Payment failed',
              };
              break;
            case 'ACTIVE':
              // Clear any failure data when recovering
              updateData.failedPaymentCount = 0;
              updateData.lastPaymentFailure = null;
              break;
          }

          // Update database
          await db.tierSubscription.update({
            where: { id: input.subscriptionId },
            data: updateData,
          });

          subscriptionLogger.dbQuery('update', 'TierSubscription', { status: input.newStatus });

          // Trigger tier resolution for tier-affecting statuses
          let tierChanged = false;
          if (this.shouldResolveTierOnStatusChange(previousStatus, input.newStatus)) {
            const tierResult = await updateCustomerToEffectiveTier(input.shop, subscription.customerId, {
              triggeredBy: `subscription_${input.newStatus.toLowerCase()}`,
              subscriptionId: input.subscriptionId,
            });

            tierChanged = tierResult.changed;
            subscriptionLogger.tierResolution({
              changed: tierResult.changed,
              source: tierResult.source,
              tierId: tierResult.newTierId,
            });
          }

          // Log tier change
          await this.logTierChange(input.shop, subscription.customerId, {
            fromTierId: previousStatus === 'ACTIVE' ? subscription.tierId : null,
            toTierId: input.newStatus === 'ACTIVE' ? subscription.tierId : null,
            changeType: this.getChangeType(previousStatus, input.newStatus),
            triggerType: this.getTriggerType(input.newStatus),
            subscriptionId: input.subscriptionId,
            metadata: { statusChange: { from: previousStatus, to: input.newStatus, reason: input.reason } },
          });

          subscriptionLogger.operationComplete('changeStatus', {
            previousStatus,
            newStatus: input.newStatus,
            tierChanged,
          });

          return {
            success: true,
            previousStatus: previousStatus as SubscriptionStatus,
            newStatus: input.newStatus,
            tierChanged,
          };
        } catch (error) {
          subscriptionLogger.error('Failed to change status', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }
    );
  }

  /**
   * Pause subscription
   */
  static async pause(
    shop: string,
    subscriptionId: string,
    admin?: AdminApiContext,
    reason?: string
  ): Promise<StatusChangeResult> {
    return this.changeStatus({
      shop,
      admin,
      subscriptionId,
      newStatus: 'PAUSED',
      reason: reason || 'Customer requested pause',
    });
  }

  /**
   * Resume subscription
   */
  static async resume(
    shop: string,
    subscriptionId: string,
    admin?: AdminApiContext
  ): Promise<StatusChangeResult> {
    return this.changeStatus({
      shop,
      admin,
      subscriptionId,
      newStatus: 'ACTIVE',
      reason: 'Customer requested resume',
    });
  }

  /**
   * Cancel subscription
   */
  static async cancel(
    shop: string,
    subscriptionId: string,
    admin?: AdminApiContext,
    reason?: string
  ): Promise<StatusChangeResult> {
    return this.changeStatus({
      shop,
      admin,
      subscriptionId,
      newStatus: 'CANCELLED',
      reason: reason || 'Customer requested cancellation',
    });
  }

  /**
   * Mark subscription as failed (payment failure)
   */
  static async markFailed(
    shop: string,
    subscriptionId: string,
    reason: string
  ): Promise<StatusChangeResult> {
    return this.changeStatus({
      shop,
      subscriptionId,
      newStatus: 'FAILED',
      reason,
      skipShopifySync: true, // Shopify manages its own status
    });
  }

  /**
   * Recover from failed status
   */
  static async recover(
    shop: string,
    subscriptionId: string
  ): Promise<StatusChangeResult> {
    return this.changeStatus({
      shop,
      subscriptionId,
      newStatus: 'ACTIVE',
      reason: 'Payment recovered',
      skipShopifySync: true,
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // BILLING OPERATIONS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Record successful billing attempt
   */
  static async recordBillingSuccess(
    shop: string,
    subscriptionId: string,
    billingData: {
      chargeId: string;
      amount: number;
      currency: string;
      billingDate: Date;
      orderId?: string;
    }
  ): Promise<BillingResult> {
    const correlationId = generateCorrelationId();

    return withCorrelation(
      {
        correlationId,
        shop,
        operation: 'billing_success',
        subscriptionId,
      },
      async () => {
        subscriptionLogger.operationStart('recordBillingSuccess', { subscriptionId, amount: billingData.amount });

        try {
          const subscription = await db.tierSubscription.findUnique({
            where: { id: subscriptionId },
          });

          if (!subscription || subscription.shop !== shop) {
            return { success: false, error: 'Subscription not found' };
          }

          const nextBillingDate = calculateNextBillingDate(
            billingData.billingDate,
            subscription.billingInterval as BillingIntervalKey
          );

          // Record billing attempt
          const idempotencyKey = `${subscriptionId}-${billingData.chargeId}`;
          const existingAttempt = await db.subscriptionBillingAttempt.findUnique({
            where: { idempotencyKey },
          });

          if (existingAttempt) {
            subscriptionLogger.idempotencyCheck(idempotencyKey, true);
            return { success: true, chargeId: billingData.chargeId };
          }

          await db.subscriptionBillingAttempt.create({
            data: {
              id: randomUUID(),
              subscriptionId,
              idempotencyKey,
              status: 'SUCCESS',
              amount: billingData.amount,
              currency: billingData.currency,
              billingDate: billingData.billingDate,
              shopifyChargeId: billingData.chargeId,
              shopifyInvoiceId: billingData.orderId,
              attemptNumber: 1,
              processedAt: new Date(),
              metadata: { correlationId },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });

          // Update subscription
          await db.tierSubscription.update({
            where: { id: subscriptionId },
            data: {
              lastBillingDate: billingData.billingDate,
              nextBillingDate,
              failedPaymentCount: 0,
              lastPaymentFailure: null,
              updatedAt: new Date(),
            },
          });

          // If recovering from FAILED status
          if (subscription.status === 'FAILED') {
            await this.recover(shop, subscriptionId);
          }

          subscriptionLogger.operationComplete('recordBillingSuccess', { nextBillingDate });

          return {
            success: true,
            chargeId: billingData.chargeId,
            amount: billingData.amount,
            nextBillingDate,
          };
        } catch (error) {
          subscriptionLogger.error('Failed to record billing success', error);
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      }
    );
  }

  /**
   * Record failed billing attempt
   */
  static async recordBillingFailure(
    shop: string,
    subscriptionId: string,
    failureData: {
      chargeId?: string;
      amount: number;
      currency: string;
      billingDate: Date;
      errorMessage: string;
      errorCode?: string;
    }
  ): Promise<BillingResult> {
    const correlationId = generateCorrelationId();

    return withCorrelation(
      {
        correlationId,
        shop,
        operation: 'billing_failure',
        subscriptionId,
      },
      async () => {
        subscriptionLogger.operationStart('recordBillingFailure', { subscriptionId, error: failureData.errorMessage });

        try {
          const subscription = await db.tierSubscription.findUnique({
            where: { id: subscriptionId },
          });

          if (!subscription || subscription.shop !== shop) {
            return { success: false, error: 'Subscription not found' };
          }

          const newFailureCount = (subscription.failedPaymentCount || 0) + 1;
          const idempotencyKey = `${subscriptionId}-fail-${failureData.billingDate.toISOString()}`;

          // Check idempotency
          const existingAttempt = await db.subscriptionBillingAttempt.findUnique({
            where: { idempotencyKey },
          });

          if (existingAttempt) {
            subscriptionLogger.idempotencyCheck(idempotencyKey, true);
            return { success: true };
          }

          // Record failed attempt
          await db.subscriptionBillingAttempt.create({
            data: {
              id: randomUUID(),
              subscriptionId,
              idempotencyKey,
              status: 'FAILED',
              amount: failureData.amount,
              currency: failureData.currency,
              billingDate: failureData.billingDate,
              shopifyChargeId: failureData.chargeId,
              attemptNumber: newFailureCount,
              errorMessage: failureData.errorMessage,
              errorCode: failureData.errorCode,
              processedAt: new Date(),
              metadata: { correlationId },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });

          // Update subscription
          await db.tierSubscription.update({
            where: { id: subscriptionId },
            data: {
              failedPaymentCount: newFailureCount,
              lastPaymentFailure: new Date(),
              updatedAt: new Date(),
            },
          });

          // Mark as FAILED after max attempts
          const maxAttempts = SUBSCRIPTION_NEURAL_CONFIG.dunning.maxRetryAttempts;
          if (newFailureCount >= maxAttempts && subscription.status !== 'FAILED') {
            await this.markFailed(shop, subscriptionId, `Payment failed after ${maxAttempts} attempts`);
          }

          subscriptionLogger.operationComplete('recordBillingFailure', { failureCount: newFailureCount });

          return { success: true };
        } catch (error) {
          subscriptionLogger.error('Failed to record billing failure', error);
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      }
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // LOOKUP HELPERS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Find subscription by Shopify contract ID
   */
  static async findByContractId(shop: string, contractId: string): Promise<TierSubscription | null> {
    subscriptionLogger.dbQuery('findFirst', 'TierSubscription', { contractId });
    return db.tierSubscription.findFirst({
      where: { shop, shopifyContractId: contractId },
    });
  }

  /**
   * Find subscription by idempotency key
   */
  static async findByIdempotencyKey(shop: string, key: string): Promise<TierSubscription | null> {
    subscriptionLogger.dbQuery('findFirst', 'TierSubscription', { idempotencyKey: key });
    return db.tierSubscription.findFirst({
      where: {
        shop,
        metadata: {
          path: ['idempotencyKey'],
          equals: key,
        },
      },
    });
  }

  /**
   * Find active subscription for customer
   */
  static async findActiveSubscription(shop: string, customerId: string): Promise<TierSubscription | null> {
    subscriptionLogger.dbQuery('findFirst', 'TierSubscription', { customerId, status: 'ACTIVE' });
    return db.tierSubscription.findFirst({
      where: { shop, customerId, status: 'ACTIVE' },
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Create subscription contract in Shopify
   */
  private static async createShopifyContract(
    input: CreateSubscriptionInput,
    price: number,
    nextBillingDate: Date
  ): Promise<{ success: boolean; contractId?: string; error?: string }> {
    const intervalDetails = SUBSCRIPTION_NEURAL_CONFIG.billingIntervals[input.billingInterval];

    const mutation = `
      mutation CreateSubscriptionContract($input: SubscriptionContractCreateInput!) {
        subscriptionContractCreate(input: $input) {
          draft {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const commitMutation = `
      mutation CommitSubscriptionDraft($draftId: ID!) {
        subscriptionDraftCommit(draftId: $draftId) {
          contract {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      // Get shop currency
      const currencyCode = await this.getShopCurrency(input.admin);

      const variables = {
        input: {
          customerId: `gid://shopify/Customer/${input.customer.shopifyCustomerId}`,
          nextBillingDate: nextBillingDate.toISOString(),
          currencyCode,
          contract: {
            status: 'ACTIVE',
            billingPolicy: {
              interval: intervalDetails.interval,
              intervalCount: intervalDetails.intervalCount,
            },
            deliveryPolicy: {
              interval: intervalDetails.interval,
              intervalCount: intervalDetails.intervalCount,
            },
            lines: [
              {
                productVariantId: input.variantId,
                quantity: 1,
                currentPrice: price.toFixed(2),
                sellingPlanId: input.sellingPlanId,
                pricingPolicy: {
                  basePrice: (input.tier.monthlyPrice?.toNumber() || 0).toFixed(2),
                  cycleDiscounts: intervalDetails.discountPercentage > 0
                    ? [{
                        adjustmentType: 'PERCENTAGE',
                        adjustmentValue: { percentage: intervalDetails.discountPercentage },
                        afterCycle: 0,
                      }]
                    : [],
                },
              },
            ],
          },
        },
      };

      // Create draft with retry
      const draftResult = await withRetry(
        async () => {
          const response = await input.admin.graphql(mutation, { variables });
          return response.json();
        },
        {
          maxAttempts: SUBSCRIPTION_NEURAL_CONFIG.shopify.maxGraphQLRetries,
          delayMs: SUBSCRIPTION_NEURAL_CONFIG.shopify.retryDelayMs,
          backoffMultiplier: SUBSCRIPTION_NEURAL_CONFIG.shopify.backoffMultiplier,
        }
      );

      subscriptionLogger.shopifyCall('subscriptionContractCreate', !draftResult.data?.subscriptionContractCreate?.userErrors?.length);

      if (draftResult.data?.subscriptionContractCreate?.userErrors?.length > 0) {
        const errors = draftResult.data.subscriptionContractCreate.userErrors;
        return { success: false, error: errors.map((e: any) => e.message).join(', ') };
      }

      const draftId = draftResult.data?.subscriptionContractCreate?.draft?.id;
      if (!draftId) {
        return { success: false, error: 'No draft ID returned' };
      }

      // Commit draft
      const commitResult = await withRetry(
        async () => {
          const response = await input.admin.graphql(commitMutation, { variables: { draftId } });
          return response.json();
        },
        { maxAttempts: 3, delayMs: 1000 }
      );

      subscriptionLogger.shopifyCall('subscriptionDraftCommit', !commitResult.data?.subscriptionDraftCommit?.userErrors?.length);

      if (commitResult.data?.subscriptionDraftCommit?.userErrors?.length > 0) {
        const errors = commitResult.data.subscriptionDraftCommit.userErrors;
        return { success: false, error: errors.map((e: any) => e.message).join(', ') };
      }

      return {
        success: true,
        contractId: commitResult.data?.subscriptionDraftCommit?.contract?.id,
      };
    } catch (error) {
      subscriptionLogger.error('Shopify contract creation failed', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown Shopify error' };
    }
  }

  /**
   * Sync status to Shopify (for pause/resume/cancel)
   */
  private static async syncStatusToShopify(
    admin: AdminApiContext,
    contractId: string,
    status: SubscriptionStatus
  ): Promise<void> {
    // Only certain statuses need Shopify sync
    if (!['PAUSED', 'CANCELLED'].includes(status)) {
      return;
    }

    const mutation = `
      mutation UpdateSubscriptionContract($subscriptionContractId: ID!) {
        subscriptionContractUpdate(subscriptionContractId: $subscriptionContractId) {
          draft {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const updateMutation = `
      mutation UpdateDraft($draftId: ID!, $input: SubscriptionDraftInput!) {
        subscriptionDraftUpdate(draftId: $draftId, input: $input) {
          draft { id }
          userErrors { field message }
        }
      }
    `;

    const commitMutation = `
      mutation CommitDraft($draftId: ID!) {
        subscriptionDraftCommit(draftId: $draftId) {
          contract { id status }
          userErrors { field message }
        }
      }
    `;

    try {
      // Create draft
      const draftResponse = await admin.graphql(mutation, {
        variables: { subscriptionContractId: contractId },
      });
      const draftData = await draftResponse.json();
      const draftId = draftData.data?.subscriptionContractUpdate?.draft?.id;

      if (!draftId) {
        subscriptionLogger.warn('Could not create Shopify draft for status sync', { contractId, status });
        return;
      }

      // Update draft with new status
      await admin.graphql(updateMutation, {
        variables: {
          draftId,
          input: { status: status === 'PAUSED' ? 'PAUSED' : 'CANCELLED' },
        },
      });

      // Commit
      await admin.graphql(commitMutation, {
        variables: { draftId },
      });

      subscriptionLogger.shopifyCall('statusSync', true, { contractId, status });
    } catch (error) {
      // Log but don't fail - local state is authoritative
      subscriptionLogger.warn('Shopify status sync failed (non-critical)', { contractId, status, error });
    }
  }

  /**
   * Cancel existing subscription when upgrading
   */
  private static async cancelExistingForUpgrade(existing: TierSubscription): Promise<void> {
    await db.tierSubscription.update({
      where: { id: existing.id },
      data: {
        status: 'CANCELLED',
        endDate: new Date(),
        metadata: {
          ...(existing.metadata as object || {}),
          cancelledReason: 'replaced_by_new_subscription',
          cancelledAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      },
    });

    subscriptionLogger.info('Cancelled existing subscription for upgrade', { existingId: existing.id });
  }

  /**
   * Get shop currency
   */
  private static async getShopCurrency(admin: AdminApiContext): Promise<string> {
    try {
      const query = `query { shop { currencyCode } }`;
      const response = await admin.graphql(query);
      const data = await response.json();
      return data.data?.shop?.currencyCode || 'USD';
    } catch {
      return 'USD';
    }
  }

  /**
   * Check if tier should be resolved on status change
   */
  private static shouldResolveTierOnStatusChange(fromStatus: string, toStatus: string): boolean {
    // Resolve when entering or leaving ACTIVE status
    if (fromStatus === 'ACTIVE' || toStatus === 'ACTIVE') {
      return true;
    }
    // Also resolve when entering terminal states
    if (isTerminalStatus(toStatus)) {
      return true;
    }
    return false;
  }

  /**
   * Get change type based on status transition
   */
  private static getChangeType(fromStatus: string, toStatus: string): string {
    if (toStatus === 'ACTIVE' && fromStatus !== 'ACTIVE') return 'UPGRADE';
    if (fromStatus === 'ACTIVE' && toStatus !== 'ACTIVE') return 'DOWNGRADE';
    return 'REASSIGNMENT';
  }

  /**
   * Get trigger type based on new status
   */
  private static getTriggerType(status: string): string {
    const mapping: Record<string, string> = {
      ACTIVE: 'SUBSCRIPTION_STARTED',
      CANCELLED: 'SUBSCRIPTION_CANCELLED',
      EXPIRED: 'SUBSCRIPTION_CANCELLED',
      PAUSED: 'MANUAL_ADMIN',
      FAILED: 'MANUAL_ADMIN',
    };
    return mapping[status] || 'MANUAL_ADMIN';
  }

  /**
   * Log tier change
   */
  private static async logTierChange(
    shop: string,
    customerId: string,
    data: {
      fromTierId: string | null;
      toTierId: string | null;
      changeType: string;
      triggerType: string;
      subscriptionId: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      // Get tier names
      const [fromTier, toTier] = await Promise.all([
        data.fromTierId ? db.tier.findUnique({ where: { id: data.fromTierId } }) : null,
        data.toTierId ? db.tier.findUnique({ where: { id: data.toTierId } }) : null,
      ]);

      await db.tierChangeLog.create({
        data: {
          id: randomUUID(),
          customerId,
          shop,
          fromTierId: data.fromTierId,
          fromTierName: fromTier?.name || null,
          toTierId: data.toTierId,
          toTierName: toTier?.name || null,
          changeType: data.changeType as any,
          triggerType: data.triggerType as any,
          subscriptionId: data.subscriptionId,
          metadata: {
            ...data.metadata,
            correlationId: getCorrelationContext()?.correlationId,
          },
          createdAt: new Date(),
        },
      });
    } catch (error) {
      subscriptionLogger.warn('Failed to log tier change', { error });
    }
  }
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const createSubscription = UnifiedSubscriptionService.createSubscription.bind(UnifiedSubscriptionService);
export const changeSubscriptionStatus = UnifiedSubscriptionService.changeStatus.bind(UnifiedSubscriptionService);
export const pauseSubscription = UnifiedSubscriptionService.pause.bind(UnifiedSubscriptionService);
export const resumeSubscription = UnifiedSubscriptionService.resume.bind(UnifiedSubscriptionService);
export const cancelSubscription = UnifiedSubscriptionService.cancel.bind(UnifiedSubscriptionService);
export const findSubscriptionByContractId = UnifiedSubscriptionService.findByContractId.bind(UnifiedSubscriptionService);
export const recordBillingSuccess = UnifiedSubscriptionService.recordBillingSuccess.bind(UnifiedSubscriptionService);
export const recordBillingFailure = UnifiedSubscriptionService.recordBillingFailure.bind(UnifiedSubscriptionService);
