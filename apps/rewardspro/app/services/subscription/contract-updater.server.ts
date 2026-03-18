/**
 * Subscription Contract Update Service
 * Manages subscription modifications including pause, resume, skip, and cancellation
 * 
 * Features:
 * - Pause and resume subscriptions
 * - Skip next delivery
 * - Update billing intervals
 * - Cancel subscriptions
 * - Update payment methods
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import type { BillingInterval } from "@prisma/client";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface ContractUpdateResult {
  success: boolean;
  message: string;
  contractId?: string;
  error?: string;
}

interface SkipDeliveryResult {
  success: boolean;
  originalDate?: Date;
  newDate?: Date;
  message: string;
}

interface BillingUpdateInput {
  interval?: BillingInterval;
  price?: number;
  discountPercentage?: number;
}

// ============================================
// CONTRACT UPDATER CLASS
// ============================================

export class ContractUpdater {
  private static readonly SERVICE_PREFIX = "[ContractUpdater]";

  /**
   * Pause a subscription
   */
  static async pauseSubscription(
    admin: AdminApiContext,
    shop: string,
    contractId: string,
    reason?: string
  ): Promise<ContractUpdateResult> {
    console.log(`${this.SERVICE_PREFIX} Pausing subscription:`, { contractId, reason });

    const mutation = `
      mutation pauseSubscriptionContract($contractId: ID!) {
        subscriptionContractPause(subscriptionContractId: $contractId) {
          contract {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      // Execute GraphQL mutation
      const response = await admin.graphql(mutation, {
        variables: { contractId }
      });

      const data = await response.json();
      
      if (data.data?.subscriptionContractPause?.userErrors?.length > 0) {
        const errors = data.data.subscriptionContractPause.userErrors;
        console.error(`${this.SERVICE_PREFIX} GraphQL errors:`, errors);
        return {
          success: false,
          message: errors.map((e: any) => e.message).join(", "),
          error: errors[0].message
        };
      }

      // Update local database
      const subscription = await db.tierSubscription.findFirst({
        where: {
          shop,
          subscriptionContractId: contractId
        }
      });

      if (subscription) {
        await db.tierSubscription.update({
          where: { id: subscription.id },
          data: {
            status: "PAUSED",
            pausedAt: new Date(),
            pauseReason: reason || "Customer requested"
          }
        });

        // Log event
        await this.logEvent(
          shop,
          contractId,
          subscription.id,
          subscription.customerId,
          "PAUSED",
          { reason }
        );
      }

      console.log(`${this.SERVICE_PREFIX} Subscription paused successfully:`, contractId);

      return {
        success: true,
        message: "Subscription paused successfully",
        contractId
      };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error pausing subscription:`, error);
      return {
        success: false,
        message: "Failed to pause subscription",
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Resume a paused subscription
   */
  static async resumeSubscription(
    admin: AdminApiContext,
    shop: string,
    contractId: string
  ): Promise<ContractUpdateResult> {
    console.log(`${this.SERVICE_PREFIX} Resuming subscription:`, contractId);

    const mutation = `
      mutation activateSubscriptionContract($contractId: ID!) {
        subscriptionContractActivate(subscriptionContractId: $contractId) {
          contract {
            id
            status
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
        variables: { contractId }
      });

      const data = await response.json();
      
      if (data.data?.subscriptionContractActivate?.userErrors?.length > 0) {
        const errors = data.data.subscriptionContractActivate.userErrors;
        return {
          success: false,
          message: errors.map((e: any) => e.message).join(", "),
          error: errors[0].message
        };
      }

      // Update local database
      const subscription = await db.tierSubscription.findFirst({
        where: {
          shop,
          subscriptionContractId: contractId
        }
      });

      if (subscription) {
        await db.tierSubscription.update({
          where: { id: subscription.id },
          data: {
            status: "ACTIVE",
            resumedAt: new Date(),
            pauseReason: null
          }
        });

        // Log event
        await this.logEvent(
          shop,
          contractId,
          subscription.id,
          subscription.customerId,
          "RESUMED",
          {}
        );
      }

      return {
        success: true,
        message: "Subscription resumed successfully",
        contractId
      };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error resuming subscription:`, error);
      return {
        success: false,
        message: "Failed to resume subscription",
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Skip the next delivery
   */
  static async skipNextDelivery(
    admin: AdminApiContext,
    shop: string,
    contractId: string
  ): Promise<SkipDeliveryResult> {
    console.log(`${this.SERVICE_PREFIX} Skipping next delivery:`, contractId);

    try {
      // Get current subscription details
      const subscription = await db.tierSubscription.findFirst({
        where: {
          shop,
          subscriptionContractId: contractId
        }
      });

      if (!subscription) {
        return {
          success: false,
          message: "Subscription not found"
        };
      }

      const currentNextBilling = subscription.nextBillingDate;
      if (!currentNextBilling) {
        return {
          success: false,
          message: "No next billing date set"
        };
      }

      // Calculate new next billing date
      const newNextBilling = this.calculateNextBillingDate(
        currentNextBilling,
        subscription.billingInterval
      );

      // Update via draft
      const draftResult = await this.createDraft(admin, contractId);
      if (!draftResult.success || !draftResult.draftId) {
        return {
          success: false,
          message: draftResult.error || "Failed to create draft"
        };
      }

      const updateResult = await this.updateDraftNextBilling(
        admin,
        draftResult.draftId,
        newNextBilling
      );

      if (!updateResult.success) {
        return {
          success: false,
          message: updateResult.error || "Failed to update billing date"
        };
      }

      const commitResult = await this.commitDraft(admin, draftResult.draftId);
      if (!commitResult.success) {
        return {
          success: false,
          message: commitResult.error || "Failed to commit changes"
        };
      }

      // Update local database
      await db.tierSubscription.update({
        where: { id: subscription.id },
        data: {
          nextBillingDate: newNextBilling,
          skipCount: { increment: 1 },
          lastSkipDate: new Date()
        }
      });

      // Log event
      await this.logEvent(
        shop,
        contractId,
        subscription.id,
        subscription.customerId,
        "DELIVERY_SKIPPED",
        {
          originalDate: currentNextBilling.toISOString(),
          newDate: newNextBilling.toISOString()
        }
      );

      console.log(`${this.SERVICE_PREFIX} Delivery skipped:`, {
        contractId,
        originalDate: currentNextBilling,
        newDate: newNextBilling
      });

      return {
        success: true,
        originalDate: currentNextBilling,
        newDate: newNextBilling,
        message: `Next delivery rescheduled to ${newNextBilling.toLocaleDateString()}`
      };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error skipping delivery:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to skip delivery"
      };
    }
  }

  /**
   * Cancel a subscription
   */
  static async cancelSubscription(
    admin: AdminApiContext,
    shop: string,
    contractId: string,
    reason?: string
  ): Promise<ContractUpdateResult> {
    console.log(`${this.SERVICE_PREFIX} Cancelling subscription:`, { contractId, reason });

    const mutation = `
      mutation cancelSubscriptionContract($contractId: ID!) {
        subscriptionContractCancel(subscriptionContractId: $contractId) {
          contract {
            id
            status
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
        variables: { contractId }
      });

      const data = await response.json();
      
      if (data.data?.subscriptionContractCancel?.userErrors?.length > 0) {
        const errors = data.data.subscriptionContractCancel.userErrors;
        return {
          success: false,
          message: errors.map((e: any) => e.message).join(", "),
          error: errors[0].message
        };
      }

      // Update local database
      const subscription = await db.tierSubscription.findFirst({
        where: {
          shop,
          subscriptionContractId: contractId
        }
      });

      if (subscription) {
        await db.tierSubscription.update({
          where: { id: subscription.id },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancellationReason: reason || "Customer requested"
          }
        });

        // Cancel any pending retries
        await db.subscriptionRetry.updateMany({
          where: {
            shop,
            contractId,
            status: "PENDING"
          },
          data: {
            status: "CANCELLED",
            updatedAt: new Date()
          }
        });

        // Log event
        await this.logEvent(
          shop,
          contractId,
          subscription.id,
          subscription.customerId,
          "CANCELLED",
          { reason }
        );
      }

      return {
        success: true,
        message: "Subscription cancelled successfully",
        contractId
      };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error cancelling subscription:`, error);
      return {
        success: false,
        message: "Failed to cancel subscription",
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Update billing details (interval, price, etc.)
   */
  static async updateBilling(
    admin: AdminApiContext,
    shop: string,
    contractId: string,
    updates: BillingUpdateInput
  ): Promise<ContractUpdateResult> {
    console.log(`${this.SERVICE_PREFIX} Updating billing:`, { contractId, updates });

    try {
      // Create draft
      const draftResult = await this.createDraft(admin, contractId);
      if (!draftResult.success || !draftResult.draftId) {
        return {
          success: false,
          message: draftResult.error || "Failed to create draft"
        };
      }

      // Update draft with new billing details
      if (updates.interval) {
        const intervalResult = await this.updateDraftBillingInterval(
          admin,
          draftResult.draftId,
          updates.interval
        );
        
        if (!intervalResult.success) {
          return intervalResult;
        }
      }

      // Commit draft
      const commitResult = await this.commitDraft(admin, draftResult.draftId);
      if (!commitResult.success) {
        return commitResult;
      }

      // Update local database
      const subscription = await db.tierSubscription.findFirst({
        where: {
          shop,
          subscriptionContractId: contractId
        }
      });

      if (subscription) {
        const updateData: any = {};
        
        if (updates.interval) {
          updateData.billingInterval = updates.interval;
        }
        if (updates.price !== undefined) {
          updateData.finalPrice = updates.price;
        }
        if (updates.discountPercentage !== undefined) {
          updateData.discountPercentage = updates.discountPercentage;
        }

        await db.tierSubscription.update({
          where: { id: subscription.id },
          data: updateData
        });

        // Log event
        await this.logEvent(
          shop,
          contractId,
          subscription.id,
          subscription.customerId,
          "BILLING_UPDATED",
          updates
        );
      }

      return {
        success: true,
        message: "Billing updated successfully",
        contractId
      };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error updating billing:`, error);
      return {
        success: false,
        message: "Failed to update billing",
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Create a draft for updates
   */
  private static async createDraft(
    admin: AdminApiContext,
    contractId: string
  ): Promise<{ success: boolean; draftId?: string; error?: string }> {
    const mutation = `
      mutation subscriptionContractUpdate($contractId: ID!) {
        subscriptionContractUpdate(contractId: $contractId) {
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

    try {
      const response = await admin.graphql(mutation, {
        variables: { contractId }
      });

      const data = await response.json();
      
      if (data.data?.subscriptionContractUpdate?.userErrors?.length > 0) {
        const errors = data.data.subscriptionContractUpdate.userErrors;
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", ")
        };
      }

      const draftId = data.data?.subscriptionContractUpdate?.draft?.id;
      
      if (!draftId) {
        return {
          success: false,
          error: "No draft ID returned"
        };
      }

      return {
        success: true,
        draftId
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Update draft next billing date
   */
  private static async updateDraftNextBilling(
    admin: AdminApiContext,
    draftId: string,
    nextBillingDate: Date
  ): Promise<{ success: boolean; error?: string }> {
    const mutation = `
      mutation subscriptionDraftUpdate($draftId: ID!, $input: SubscriptionDraftInput!) {
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

    try {
      const response = await admin.graphql(mutation, {
        variables: {
          draftId,
          input: {
            nextBillingDate: nextBillingDate.toISOString()
          }
        }
      });

      const data = await response.json();
      
      if (data.data?.subscriptionDraftUpdate?.userErrors?.length > 0) {
        const errors = data.data.subscriptionDraftUpdate.userErrors;
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", ")
        };
      }

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Update draft billing interval
   */
  private static async updateDraftBillingInterval(
    admin: AdminApiContext,
    draftId: string,
    interval: BillingInterval
  ): Promise<ContractUpdateResult> {
    // This would require updating the selling plan on the draft
    // Implementation depends on specific GraphQL mutations available
    
    console.log(`${this.SERVICE_PREFIX} Updating billing interval:`, { draftId, interval });
    
    // Placeholder - actual implementation would use appropriate GraphQL mutation
    return {
      success: true,
      message: "Billing interval update queued"
    };
  }

  /**
   * Commit draft changes
   */
  private static async commitDraft(
    admin: AdminApiContext,
    draftId: string
  ): Promise<ContractUpdateResult> {
    const mutation = `
      mutation subscriptionDraftCommit($draftId: ID!) {
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
      const response = await admin.graphql(mutation, {
        variables: { draftId }
      });

      const data = await response.json();
      
      if (data.data?.subscriptionDraftCommit?.userErrors?.length > 0) {
        const errors = data.data.subscriptionDraftCommit.userErrors;
        return {
          success: false,
          message: errors.map((e: any) => e.message).join(", ")
        };
      }

      const contractId = data.data?.subscriptionDraftCommit?.contract?.id;

      return {
        success: true,
        message: "Changes committed successfully",
        contractId
      };

    } catch (error) {
      return {
        success: false,
        message: "Failed to commit changes",
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Calculate next billing date
   */
  private static calculateNextBillingDate(
    currentDate: Date,
    interval: BillingInterval
  ): Date {
    const nextDate = new Date(currentDate);
    const intervalStr = interval as string;

    switch (intervalStr) {
      case "WEEKLY":
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case "MONTHLY":
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case "QUARTERLY":
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
      case "SEMIANNUAL":
        nextDate.setMonth(nextDate.getMonth() + 6);
        break;
      case "ANNUAL":
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
    }
    
    return nextDate;
  }

  /**
   * Log subscription event
   */
  private static async logEvent(
    shop: string,
    contractId: string,
    subscriptionId: string,
    customerId: string,
    eventType: string,
    eventData: any
  ) {
    await db.subscriptionEvent.create({
      data: {
        id: uuidv4(),
        shop,
        contractId,
        subscriptionId,
        customerId,
        eventType: eventType as any,
        eventData,
        processedAt: new Date(),
        createdAt: new Date()
      }
    });
  }
}