/**
 * Subscription Contract Handler
 * 
 * Manages subscription contracts lifecycle:
 * - Creates and activates subscription contracts
 * - Handles billing cycles and renewals
 * - Processes cancellations and pauses
 * - Manages tier upgrades during subscription
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import type {
  Customer,
  TierProduct,
  TierSubscription,
  BillingInterval,
  SubscriptionStatus,
} from "@prisma/client";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface CreateContractInput {
  shop: string;
  customer: Customer;
  tierProduct: TierProduct;
  sellingPlanId: string;
  billingInterval: BillingInterval;
  paymentMethodId?: string;
  startDate?: Date;
}

interface ContractResult {
  success: boolean;
  contractId?: string;
  subscription?: TierSubscription;
  error?: string;
}

interface BillingAttemptResult {
  success: boolean;
  chargeId?: string;
  amount?: number;
  nextBillingDate?: Date;
  error?: string;
}

interface ContractUpdate {
  contractId: string;
  status?: SubscriptionStatus;
  nextBillingDate?: Date;
  pauseReason?: string;
  cancellationReason?: string;
}

// ============================================
// MAIN SERVICE CLASS
// ============================================

export class SubscriptionContractHandler {
  /**
   * Create and activate a new subscription contract
   */
  static async createContract(
    admin: AdminApiContext,
    input: CreateContractInput
  ): Promise<ContractResult> {
    try {
      console.log(`[ContractHandler] Creating contract for customer ${input.customer.id}`);

      // Get selling plan details
      const sellingPlan = await db.sellingPlan.findFirst({
        where: { shopifyPlanId: input.sellingPlanId },
        include: { group: true },
      });

      if (!sellingPlan) {
        return {
          success: false,
          error: "Selling plan not found",
        };
      }

      // Calculate pricing with discount
      const basePrice = input.tierProduct.price.toNumber();
      const discountedPrice = this.calculateDiscountedPrice(
        basePrice,
        sellingPlan.discountType || "PERCENTAGE",
        sellingPlan.discountValue?.toNumber() || 0
      );

      // Create subscription draft in Shopify
      const draftResult = await this.createSubscriptionDraft(admin, {
        customerId: `gid://shopify/Customer/${input.customer.shopifyCustomerId}`,
        productVariantId: input.tierProduct.shopifyVariantId,
        sellingPlanId: input.sellingPlanId,
        price: discountedPrice,
        billingInterval: input.billingInterval,
        intervalCount: sellingPlan.intervalCount,
        startDate: input.startDate || new Date(),
      });

      if (!draftResult.success || !draftResult.draftId) {
        return {
          success: false,
          error: draftResult.error || "Failed to create subscription draft",
        };
      }

      // Commit the draft to activate it
      const contractId = await this.commitDraft(admin, draftResult.draftId);

      // Create subscription record in database
      const subscription = await db.tierSubscription.create({
        data: {
          id: uuidv4(),
          shop: input.shop,
          customerId: input.customer.id,
          tierId: input.tierProduct.tierId,
          shopifyContractId: contractId,
          sellingPlanId: input.sellingPlanId,
          status: "ACTIVE",
          billingInterval: input.billingInterval,
          startDate: input.startDate || new Date(),
          nextBillingDate: this.calculateNextBillingDate(
            input.startDate || new Date(),
            input.billingInterval,
            sellingPlan.intervalCount
          ),
          currentPrice: discountedPrice,
          metadata: {
            tierProductId: input.tierProduct.id,
            productTitle: `Tier ${input.tierProduct.tierId} Membership`,
            sku: input.tierProduct.sku,
            basePrice,
            discountType: sellingPlan.discountType,
            discountValue: sellingPlan.discountValue,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Update customer tier
      await db.customer.update({
        where: { id: input.customer.id },
        data: {
          currentTierId: input.tierProduct.tierId,
          updatedAt: new Date(),
        },
      });

      // Log tier change
      await db.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId: input.customer.id,
          shop: input.shop,
          fromTierId: input.customer.currentTierId,
          toTierId: input.tierProduct.tierId,
          changeType: input.customer.currentTierId ? "UPGRADE" : "INITIAL_ASSIGNMENT",
          triggerType: "SUBSCRIPTION_STARTED",
          subscriptionId: subscription.id,
          metadata: {
            contractId,
            sellingPlanId: input.sellingPlanId,
            billingInterval: input.billingInterval,
          },
          createdAt: new Date(),
        },
      });

      console.log(`[ContractHandler] Successfully created contract ${contractId}`);

      return {
        success: true,
        contractId,
        subscription,
      };
    } catch (error) {
      console.error("[ContractHandler] Error creating contract:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Process a billing attempt for a subscription
   */
  static async processBillingAttempt(
    admin: AdminApiContext,
    subscriptionId: string
  ): Promise<BillingAttemptResult> {
    try {
      console.log(`[ContractHandler] Processing billing for subscription ${subscriptionId}`);

      // Get subscription details
      const subscription = await db.tierSubscription.findUnique({
        where: { id: subscriptionId },
        include: { customer: true },
      });

      if (!subscription) {
        return {
          success: false,
          error: "Subscription not found",
        };
      }

      if (subscription.status !== "ACTIVE") {
        return {
          success: false,
          error: `Subscription is ${subscription.status}, cannot bill`,
        };
      }

      // Create billing attempt in Shopify
      const mutation = `
        mutation CreateBillingAttempt($subscriptionContractId: ID!) {
          subscriptionBillingAttemptCreate(
            subscriptionContractId: $subscriptionContractId
            subscriptionBillingAttemptInput: {
              idempotencyKey: "${uuidv4()}"
            }
          ) {
            subscriptionBillingAttempt {
              id
              ready
              errorMessage
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await admin.graphql(mutation, {
        variables: { subscriptionContractId: subscription.shopifyContractId },
      });
      const data = await response.json();

      if (data.data?.subscriptionBillingAttemptCreate?.userErrors?.length > 0) {
        const errors = data.data.subscriptionBillingAttemptCreate.userErrors;
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", "),
        };
      }

      const billingAttempt = data.data?.subscriptionBillingAttemptCreate?.subscriptionBillingAttempt;
      if (!billingAttempt || !billingAttempt.ready) {
        return {
          success: false,
          error: billingAttempt?.errorMessage || "Billing attempt not ready",
        };
      }

      // Calculate next billing date
      const nextBillingDate = this.calculateNextBillingDate(
        subscription.nextBillingDate || new Date(),
        subscription.billingInterval,
        1
      );

      // Record successful billing
      const idempotencyKey = `${subscriptionId}-${new Date().toISOString()}`;
      await db.subscriptionBillingAttempt.create({
        data: {
          id: uuidv4(),
          subscriptionId,
          idempotencyKey,
          status: "SUCCESS",
          amount: subscription.currentPrice,
          currency: "USD", // TODO: Get from shop settings
          billingDate: new Date(),
          shopifyChargeId: billingAttempt.id,
          attemptNumber: 1,
          processedAt: new Date(),
          metadata: {
            contractId: subscription.shopifyContractId,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Update subscription with next billing date
      await db.tierSubscription.update({
        where: { id: subscriptionId },
        data: {
          lastBillingDate: new Date(),
          lastBillingAmount: subscription.currentPrice,
          nextBillingDate,
          failureCount: 0,
          updatedAt: new Date(),
        },
      });

      return {
        success: true,
        chargeId: billingAttempt.id,
        amount: subscription.currentPrice.toNumber(),
        nextBillingDate,
      };
    } catch (error) {
      console.error("[ContractHandler] Error processing billing:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Cancel a subscription contract
   */
  static async cancelContract(
    admin: AdminApiContext,
    contractId: string,
    reason?: string
  ): Promise<ContractResult> {
    try {
      console.log(`[ContractHandler] Cancelling contract ${contractId}`);

      // Find subscription in database
      const subscription = await db.tierSubscription.findFirst({
        where: { shopifyContractId: contractId },
        include: { customer: true },
      });

      if (!subscription) {
        return {
          success: false,
          error: "Subscription not found",
        };
      }

      // Cancel in Shopify
      const mutation = `
        mutation CancelSubscriptionContract($subscriptionContractId: ID!) {
          subscriptionContractUpdate(
            subscriptionContractId: $subscriptionContractId
          ) {
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

      const draftResponse = await admin.graphql(mutation, {
        variables: { subscriptionContractId: contractId },
      });
      const draftData = await draftResponse.json();

      if (draftData.data?.subscriptionContractUpdate?.userErrors?.length > 0) {
        return {
          success: false,
          error: draftData.data.subscriptionContractUpdate.userErrors
            .map((e: any) => e.message)
            .join(", "),
        };
      }

      const draftId = draftData.data?.subscriptionContractUpdate?.draft?.id;
      if (draftId) {
        // Update draft to cancel
        const cancelMutation = `
          mutation UpdateDraftToCancel($draftId: ID!, $input: SubscriptionDraftInput!) {
            subscriptionDraftUpdate(draftId: $draftId, input: $input) {
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

        await admin.graphql(cancelMutation, {
          variables: {
            draftId,
            input: { status: "CANCELLED" },
          },
        });

        // Commit the cancellation
        await this.commitDraft(admin, draftId);
      }

      // Update subscription in database
      await db.tierSubscription.update({
        where: { id: subscription.id },
        data: {
          status: "CANCELLED",
          endDate: new Date(),
          metadata: {
            ...(subscription.metadata as any),
            cancellationReason: reason || "Customer requested",
            cancelledAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        },
      });

      // Remove customer from tier
      await db.customer.update({
        where: { id: subscription.customerId },
        data: {
          currentTierId: null,
          updatedAt: new Date(),
        },
      });

      // Log tier change
      await db.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId: subscription.customerId,
          shop: subscription.shop,
          fromTierId: subscription.tierId,
          toTierId: null,
          changeType: "DOWNGRADE",
          triggerType: "SUBSCRIPTION_CANCELLED",
          subscriptionId: subscription.id,
          metadata: {
            cancellationReason: reason,
          },
          createdAt: new Date(),
        },
      });

      return {
        success: true,
        subscription,
      };
    } catch (error) {
      console.error("[ContractHandler] Error cancelling contract:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Pause a subscription contract
   */
  static async pauseContract(
    admin: AdminApiContext,
    contractId: string,
    reason?: string
  ): Promise<ContractResult> {
    try {
      console.log(`[ContractHandler] Pausing contract ${contractId}`);

      // Find subscription
      const subscription = await db.tierSubscription.findFirst({
        where: { shopifyContractId: contractId },
      });

      if (!subscription) {
        return {
          success: false,
          error: "Subscription not found",
        };
      }

      // TODO: Implement Shopify pause mutation
      // Note: Shopify subscription pause requires specific API version

      // Update subscription in database
      await db.tierSubscription.update({
        where: { id: subscription.id },
        data: {
          status: "PAUSED",
          metadata: {
            ...(subscription.metadata as any),
            pauseReason: reason || "Customer requested",
            pausedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        },
      });

      return {
        success: true,
        subscription,
      };
    } catch (error) {
      console.error("[ContractHandler] Error pausing contract:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Resume a paused subscription
   */
  static async resumeContract(
    admin: AdminApiContext,
    contractId: string
  ): Promise<ContractResult> {
    try {
      console.log(`[ContractHandler] Resuming contract ${contractId}`);

      // Find subscription
      const subscription = await db.tierSubscription.findFirst({
        where: { shopifyContractId: contractId, status: "PAUSED" },
      });

      if (!subscription) {
        return {
          success: false,
          error: "Paused subscription not found",
        };
      }

      // TODO: Implement Shopify resume mutation

      // Calculate new next billing date
      const nextBillingDate = this.calculateNextBillingDate(
        new Date(),
        subscription.billingInterval,
        1
      );

      // Update subscription in database
      await db.tierSubscription.update({
        where: { id: subscription.id },
        data: {
          status: "ACTIVE",
          nextBillingDate,
          metadata: {
            ...(subscription.metadata as any),
            resumedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        },
      });

      return {
        success: true,
        subscription,
      };
    } catch (error) {
      console.error("[ContractHandler] Error resuming contract:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Create subscription draft in Shopify
   */
  private static async createSubscriptionDraft(
    admin: AdminApiContext,
    params: {
      customerId: string;
      productVariantId: string;
      sellingPlanId: string;
      price: number;
      billingInterval: BillingInterval;
      intervalCount: number;
      startDate: Date;
    }
  ): Promise<{ success: boolean; draftId?: string; error?: string }> {
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

    const variables = {
      input: {
        customerId: params.customerId,
        nextBillingDate: this.calculateNextBillingDate(
          params.startDate,
          params.billingInterval,
          params.intervalCount
        ).toISOString(),
        currencyCode: "USD", // TODO: Get from shop settings
        contract: {
          status: "ACTIVE",
          billingPolicy: {
            interval: params.billingInterval,
            intervalCount: params.intervalCount,
          },
          deliveryPolicy: {
            interval: params.billingInterval,
            intervalCount: params.intervalCount,
          },
          lines: [
            {
              productVariantId: params.productVariantId,
              quantity: 1,
              currentPrice: params.price.toString(),
              sellingPlanId: params.sellingPlanId,
              pricingPolicy: {
                basePrice: params.price.toString(),
                cycleDiscounts: [],
              },
            },
          ],
        },
      },
    };

    try {
      const response = await admin.graphql(mutation, { variables });
      const data = await response.json();

      if (data.data?.subscriptionContractCreate?.userErrors?.length > 0) {
        return {
          success: false,
          error: data.data.subscriptionContractCreate.userErrors
            .map((e: any) => e.message)
            .join(", "),
        };
      }

      const draftId = data.data?.subscriptionContractCreate?.draft?.id;
      return {
        success: !!draftId,
        draftId,
        error: draftId ? undefined : "Failed to create draft",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Commit subscription draft
   */
  private static async commitDraft(
    admin: AdminApiContext,
    draftId: string
  ): Promise<string> {
    const mutation = `
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

    const response = await admin.graphql(mutation, { variables: { draftId } });
    const data = await response.json();

    if (data.data?.subscriptionDraftCommit?.userErrors?.length > 0) {
      throw new Error(
        `Failed to commit draft: ${data.data.subscriptionDraftCommit.userErrors
          .map((e: any) => e.message)
          .join(", ")}`
      );
    }

    return data.data.subscriptionDraftCommit.contract.id;
  }

  /**
   * Calculate discounted price
   */
  private static calculateDiscountedPrice(
    basePrice: number,
    discountType: "PERCENTAGE" | "FIXED_AMOUNT",
    discountValue: number
  ): number {
    if (discountType === "PERCENTAGE") {
      const discount = 1 - discountValue / 100;
      return Math.round(basePrice * discount * 100) / 100;
    } else {
      return Math.max(0, basePrice - discountValue);
    }
  }

  /**
   * Calculate next billing date
   */
  private static calculateNextBillingDate(
    fromDate: Date,
    interval: BillingInterval,
    intervalCount: number
  ): Date {
    const date = new Date(fromDate);

    switch (interval) {
      case "WEEKLY":
        date.setDate(date.getDate() + 7 * intervalCount);
        break;
      case "MONTHLY":
        date.setMonth(date.getMonth() + intervalCount);
        break;
      case "QUARTERLY":
        date.setMonth(date.getMonth() + 3 * intervalCount);
        break;
      case "SEMIANNUAL":
        date.setMonth(date.getMonth() + 6 * intervalCount);
        break;
      case "ANNUAL":
        date.setFullYear(date.getFullYear() + intervalCount);
        break;
    }

    return date;
  }
}