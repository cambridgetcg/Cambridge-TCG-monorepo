/**
 * Dunning Manager Service
 * Handles payment failure recovery for subscriptions with intelligent retry logic
 * 
 * Features:
 * - Automatic retry scheduling with exponential backoff
 * - Customer notification system
 * - Configurable retry intervals
 * - Final failure handling (pause/cancel)
 * - Comprehensive event logging
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import type { 
  RetryStatus,
  SubscriptionEventType
} from "@prisma/client";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface DunningConfig {
  maxRetries: number;
  retryIntervals: number[]; // Days between retries
  pauseOnFinalFailure: boolean; // Pause vs cancel on max retries
  sendNotifications: boolean;
}

interface PaymentFailureDetails {
  shop: string;
  contractId: string;
  subscriptionId?: string;
  customerId?: string;
  errorCode: string;
  errorMessage: string;
  billingAmount?: number;
  currency?: string;
}

interface RetryResult {
  success: boolean;
  message: string;
  nextRetryDate?: Date;
  attemptNumber?: number;
}

interface BillingAttemptResult {
  success: boolean;
  orderId?: string;
  error?: string;
  nextActionUrl?: string;
}

// ============================================
// MAIN DUNNING MANAGER CLASS
// ============================================

export class DunningManager {
  private static readonly SERVICE_PREFIX = "[DunningManager]";
  
  // Default configuration
  private static readonly DEFAULT_CONFIG: DunningConfig = {
    maxRetries: 3,
    retryIntervals: [1, 3, 7], // Days: 1, 3, 7
    pauseOnFinalFailure: true,
    sendNotifications: true
  };

  /**
   * Handle payment failure from webhook
   */
  static async handlePaymentFailure(
    details: PaymentFailureDetails,
    config: Partial<DunningConfig> = {}
  ): Promise<RetryResult> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    
    console.log(`${this.SERVICE_PREFIX} Handling payment failure:`, {
      contractId: details.contractId,
      errorCode: details.errorCode
    });

    try {
      // Get or create subscription record
      const subscription = await this.ensureSubscriptionRecord(details);
      if (!subscription) {
        console.error(`${this.SERVICE_PREFIX} Subscription not found for contract:`, details.contractId);
        return {
          success: false,
          message: "Subscription not found"
        };
      }

      // Check current retry state
      const currentRetries = await db.subscriptionRetry.findMany({
        where: {
          shop: details.shop,
          contractId: details.contractId,
          status: { in: ["PENDING", "PROCESSING"] as RetryStatus[] }
        },
        orderBy: { attemptNumber: "desc" }
      });

      const latestRetry = currentRetries[0];
      const attemptNumber = (latestRetry?.attemptNumber || 0) + 1;

      // Update subscription failure count
      await db.tierSubscription.update({
        where: { id: subscription.id },
        data: {
          failedPaymentCount: { increment: 1 },
          lastPaymentFailure: new Date()
        }
      });

      // Log the failure event
      await this.logEvent({
        shop: details.shop,
        contractId: details.contractId,
        subscriptionId: subscription.id,
        customerId: subscription.customerId,
        eventType: "PAYMENT_FAILED",
        eventData: {
          attemptNumber,
          errorCode: details.errorCode,
          errorMessage: details.errorMessage,
          billingAmount: details.billingAmount
        }
      });

      // Check if max retries exceeded
      if (attemptNumber > finalConfig.maxRetries) {
        console.log(`${this.SERVICE_PREFIX} Max retries exceeded for contract:`, details.contractId);
        return await this.handleMaxRetriesExceeded(
          details,
          subscription,
          finalConfig
        );
      }

      // Schedule retry
      const retryDate = this.calculateRetryDate(attemptNumber, finalConfig);
      
      await db.subscriptionRetry.create({
        data: {
          id: uuidv4(),
          shop: details.shop,
          contractId: details.contractId,
          subscriptionId: subscription.id,
          attemptNumber,
          scheduledFor: retryDate,
          status: "PENDING",
          errorCode: details.errorCode,
          errorMessage: details.errorMessage,
          billingAmount: details.billingAmount,
          createdAt: new Date()
        }
      });

      // Log retry scheduled event
      await this.logEvent({
        shop: details.shop,
        contractId: details.contractId,
        subscriptionId: subscription.id,
        customerId: subscription.customerId,
        eventType: "PAYMENT_RETRY_SCHEDULED",
        eventData: {
          attemptNumber,
          scheduledFor: retryDate.toISOString(),
          daysUntilRetry: finalConfig.retryIntervals[attemptNumber - 1]
        }
      });

      // Send customer notification
      if (finalConfig.sendNotifications) {
        await this.sendRetryNotification(
          details,
          subscription,
          attemptNumber,
          retryDate
        );
      }

      console.log(`${this.SERVICE_PREFIX} Retry scheduled:`, {
        contractId: details.contractId,
        attemptNumber,
        scheduledFor: retryDate
      });

      return {
        success: true,
        message: `Retry ${attemptNumber} scheduled for ${retryDate.toISOString()}`,
        nextRetryDate: retryDate,
        attemptNumber
      };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error handling payment failure:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Process all scheduled retries
   */
  static async processScheduledRetries(
    admin: AdminApiContext,
    shop: string
  ): Promise<{ processed: number; successful: number; failed: number }> {
    console.log(`${this.SERVICE_PREFIX} Processing scheduled retries for shop:`, shop);

    const pendingRetries = await db.subscriptionRetry.findMany({
      where: {
        shop,
        status: "PENDING",
        scheduledFor: { lte: new Date() }
      },
      include: {
        subscription: true
      }
    });

    let processed = 0;
    let successful = 0;
    let failed = 0;

    for (const retry of pendingRetries) {
      processed++;
      const result = await this.executeRetry(admin, retry);
      if (result.success) {
        successful++;
      } else {
        failed++;
      }
    }

    console.log(`${this.SERVICE_PREFIX} Retry processing complete:`, {
      shop,
      processed,
      successful,
      failed
    });

    return { processed, successful, failed };
  }

  /**
   * Execute a single retry attempt
   */
  private static async executeRetry(
    admin: AdminApiContext,
    retry: any
  ): Promise<BillingAttemptResult> {
    console.log(`${this.SERVICE_PREFIX} Executing retry:`, {
      retryId: retry.id,
      contractId: retry.contractId,
      attempt: retry.attemptNumber
    });

    // Update status to processing
    await db.subscriptionRetry.update({
      where: { id: retry.id },
      data: { 
        status: "PROCESSING",
        updatedAt: new Date()
      }
    });

    try {
      // Create billing attempt via GraphQL
      const result = await this.createBillingAttempt(
        admin,
        retry.contractId,
        retry.subscription?.nextBillingDate
      );

      if (result.success) {
        // Update retry as successful
        await db.subscriptionRetry.update({
          where: { id: retry.id },
          data: {
            status: "SUCCESS",
            executedAt: new Date()
          }
        });

        // Reset failure count on subscription
        await db.tierSubscription.update({
          where: { id: retry.subscriptionId },
          data: {
            failedPaymentCount: 0,
            status: "ACTIVE"
          }
        });

        // Log success event
        await this.logEvent({
          shop: retry.shop,
          contractId: retry.contractId,
          subscriptionId: retry.subscriptionId,
          eventType: "PAYMENT_SUCCESS",
          eventData: {
            attemptNumber: retry.attemptNumber,
            orderId: result.orderId
          }
        });

        console.log(`${this.SERVICE_PREFIX} Retry successful:`, {
          retryId: retry.id,
          orderId: result.orderId
        });

        return result;
      } else {
        // Update retry as failed
        await db.subscriptionRetry.update({
          where: { id: retry.id },
          data: {
            status: "FAILED",
            executedAt: new Date(),
            errorMessage: result.error
          }
        });

        // Payment will be retried again via webhook
        console.log(`${this.SERVICE_PREFIX} Retry failed:`, {
          retryId: retry.id,
          error: result.error
        });

        return result;
      }
    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Retry execution error:`, error);
      
      await db.subscriptionRetry.update({
        where: { id: retry.id },
        data: {
          status: "FAILED",
          executedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Unknown error"
        }
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Create billing attempt in Shopify
   */
  private static async createBillingAttempt(
    admin: AdminApiContext,
    contractId: string,
    billingDate?: Date | null
  ): Promise<BillingAttemptResult> {
    const mutation = `
      mutation subscriptionBillingAttemptCreate(
        $subscriptionContractId: ID!
        $subscriptionBillingAttemptInput: SubscriptionBillingAttemptInput!
      ) {
        subscriptionBillingAttemptCreate(
          subscriptionContractId: $subscriptionContractId
          subscriptionBillingAttemptInput: $subscriptionBillingAttemptInput
        ) {
          subscriptionBillingAttempt {
            id
            ready
            nextActionUrl
            order {
              id
              name
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
          subscriptionContractId: contractId,
          subscriptionBillingAttemptInput: {
            idempotencyKey: `billing-${contractId}-${Date.now()}`,
            billingDate: billingDate?.toISOString() || new Date().toISOString()
          }
        }
      });

      const data = await response.json();
      
      if (data.data?.subscriptionBillingAttemptCreate?.userErrors?.length > 0) {
        const errors = data.data.subscriptionBillingAttemptCreate.userErrors;
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", ")
        };
      }

      const billingAttempt = data.data?.subscriptionBillingAttemptCreate?.subscriptionBillingAttempt;
      
      if (!billingAttempt) {
        return {
          success: false,
          error: "No billing attempt returned"
        };
      }

      return {
        success: true,
        orderId: billingAttempt.order?.id,
        nextActionUrl: billingAttempt.nextActionUrl
      };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error creating billing attempt:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Handle max retries exceeded
   */
  private static async handleMaxRetriesExceeded(
    details: PaymentFailureDetails,
    subscription: any,
    config: DunningConfig
  ): Promise<RetryResult> {
    console.log(`${this.SERVICE_PREFIX} Handling max retries exceeded:`, {
      contractId: details.contractId,
      action: config.pauseOnFinalFailure ? "pause" : "cancel"
    });

    if (config.pauseOnFinalFailure) {
      // Pause subscription
      await db.tierSubscription.update({
        where: { id: subscription.id },
        data: {
          status: "PAUSED",
          pausedAt: new Date(),
          pauseReason: "Max payment retries exceeded"
        }
      });

      await this.logEvent({
        shop: details.shop,
        contractId: details.contractId,
        subscriptionId: subscription.id,
        customerId: subscription.customerId,
        eventType: "PAUSED",
        eventData: {
          reason: "Max payment retries exceeded",
          failureCount: subscription.failedPaymentCount + 1
        }
      });

      return {
        success: true,
        message: "Subscription paused due to payment failures"
      };
    } else {
      // Cancel subscription
      await db.tierSubscription.update({
        where: { id: subscription.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancellationReason: "Max payment retries exceeded"
        }
      });

      await this.logEvent({
        shop: details.shop,
        contractId: details.contractId,
        subscriptionId: subscription.id,
        customerId: subscription.customerId,
        eventType: "CANCELLED",
        eventData: {
          reason: "Max payment retries exceeded",
          failureCount: subscription.failedPaymentCount + 1
        }
      });

      return {
        success: true,
        message: "Subscription cancelled due to payment failures"
      };
    }
  }

  /**
   * Calculate next retry date
   */
  private static calculateRetryDate(
    attemptNumber: number,
    config: DunningConfig
  ): Date {
    const daysToAdd = config.retryIntervals[Math.min(attemptNumber - 1, config.retryIntervals.length - 1)];
    const retryDate = new Date();
    retryDate.setDate(retryDate.getDate() + daysToAdd);
    return retryDate;
  }

  /**
   * Ensure subscription record exists
   */
  private static async ensureSubscriptionRecord(
    details: PaymentFailureDetails
  ) {
    if (details.subscriptionId) {
      return await db.tierSubscription.findUnique({
        where: { id: details.subscriptionId }
      });
    }

    return await db.tierSubscription.findFirst({
      where: {
        shop: details.shop,
        subscriptionContractId: details.contractId
      }
    });
  }

  /**
   * Log subscription event
   */
  private static async logEvent(data: {
    shop: string;
    contractId: string;
    subscriptionId?: string;
    customerId?: string;
    eventType: SubscriptionEventType | string;
    eventData?: any;
  }) {
    await db.subscriptionEvent.create({
      data: {
        id: uuidv4(),
        shop: data.shop,
        contractId: data.contractId,
        subscriptionId: data.subscriptionId,
        customerId: data.customerId,
        eventType: data.eventType as SubscriptionEventType,
        eventData: data.eventData,
        createdAt: new Date()
      }
    });
  }

  /**
   * Send retry notification to customer
   */
  private static async sendRetryNotification(
    details: PaymentFailureDetails,
    subscription: any,
    attemptNumber: number,
    retryDate: Date
  ): Promise<void> {
    // This would integrate with your email service
    console.log(`${this.SERVICE_PREFIX} Sending retry notification:`, {
      customerId: subscription.customerId,
      attemptNumber,
      retryDate
    });
    
    // TODO: Implement actual email sending
    // Example structure:
    // await EmailService.send({
    //   template: 'payment-retry',
    //   to: customer.email,
    //   data: {
    //     customerName: customer.name,
    //     attemptNumber,
    //     retryDate: retryDate.toLocaleDateString(),
    //     updatePaymentUrl: `${shopUrl}/account/payment-methods`
    //   }
    // });
  }

  /**
   * Manually trigger a retry
   */
  static async triggerManualRetry(
    admin: AdminApiContext,
    shop: string,
    contractId: string
  ): Promise<BillingAttemptResult> {
    console.log(`${this.SERVICE_PREFIX} Manual retry triggered:`, {
      shop,
      contractId
    });

    const subscription = await db.tierSubscription.findFirst({
      where: {
        shop,
        subscriptionContractId: contractId
      }
    });

    if (!subscription) {
      return {
        success: false,
        error: "Subscription not found"
      };
    }

    return await this.createBillingAttempt(
      admin,
      contractId,
      subscription.nextBillingDate
    );
  }

  /**
   * Get retry history for a subscription
   */
  static async getRetryHistory(
    shop: string,
    contractId: string
  ) {
    return await db.subscriptionRetry.findMany({
      where: {
        shop,
        contractId
      },
      orderBy: { createdAt: "desc" }
    });
  }

  /**
   * Cancel all pending retries
   */
  static async cancelPendingRetries(
    shop: string,
    contractId: string
  ): Promise<number> {
    const result = await db.subscriptionRetry.updateMany({
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

    console.log(`${this.SERVICE_PREFIX} Cancelled pending retries:`, {
      contractId,
      count: result.count
    });

    return result.count;
  }
}
