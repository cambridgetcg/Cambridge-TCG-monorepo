/**
 * Billing Scheduler Service
 * Handles recurring billing for subscriptions
 * This would typically run as a cron job or scheduled Lambda function
 */

import { db } from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { SUBSCRIPTION_CONFIG, getNextBillingDate } from "./config.server";
import crypto from 'crypto';
const uuidv4 = () => crypto.randomUUID();

interface BillingResult {
  subscriptionId: string;
  success: boolean;
  error?: string;
  amount?: number;
}

export class BillingScheduler {
  /**
   * Process all subscriptions due for billing
   */
  static async processDueBillings(
    admin: AdminApiContext,
    shop: string
  ): Promise<BillingResult[]> {
    console.log(`Processing due billings for shop: ${shop}`);
    
    // Find subscriptions due for billing
    const dueSubscriptions = await db.tierSubscription.findMany({
      where: {
        shop,
        status: 'ACTIVE',
        nextBillingDate: {
          lte: new Date(), // Due today or earlier
        },
      },
      include: {
        customer: true,
        tier: true,
        billingAttempts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    console.log(`Found ${dueSubscriptions.length} subscriptions due for billing`);

    const results: BillingResult[] = [];

    for (const subscription of dueSubscriptions) {
      try {
        const result = await this.processSubscriptionBilling(admin, subscription);
        results.push(result);
      } catch (error: any) {
        console.error(`Error processing subscription ${subscription.id}:`, error);
        results.push({
          subscriptionId: subscription.id,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Process billing for a single subscription
   */
  private static async processSubscriptionBilling(
    admin: AdminApiContext,
    subscription: any
  ): Promise<BillingResult> {
    console.log(`Processing billing for subscription ${subscription.id}`);

    // Create idempotency key to prevent duplicate charges
    const billingDate = new Date();
    const idempotencyKey = `${subscription.id}-${billingDate.toISOString().split('T')[0]}`;

    // Check if we already processed this billing
    const existingAttempt = await db.subscriptionBillingAttempt.findUnique({
      where: { idempotencyKey },
    });

    if (existingAttempt) {
      console.log(`Billing already processed for ${idempotencyKey}`);
      return {
        subscriptionId: subscription.id,
        success: existingAttempt.status === 'SUCCESS',
        amount: existingAttempt.amount.toNumber(),
      };
    }

    try {
      // Create billing charge in Shopify
      const charge = await this.createSubscriptionCharge(
        admin,
        subscription.subscriptionContractId,
        subscription.lastBillingAmount || subscription.monthlyPrice
      );

      if (charge.success) {
        // Record successful billing
        await db.subscriptionBillingAttempt.create({
          data: {
            id: uuidv4(),
            subscriptionId: subscription.id,
            idempotencyKey,
            status: 'SUCCESS',
            amount: charge.amount,
            currency: 'USD', // TODO: Get from shop settings
            billingDate,
            shopifyChargeId: charge.chargeId,
            attemptNumber: 1,
            processedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Update subscription with next billing date
        const nextBillingDate = getNextBillingDate(billingDate, subscription.billingInterval);
        
        await db.tierSubscription.update({
          where: { id: subscription.id },
          data: {
            lastBillingDate: billingDate,
            lastBillingAmount: charge.amount,
            nextBillingDate,
            currentPeriodStart: billingDate,
            currentPeriodEnd: nextBillingDate,
            failureCount: 0, // Reset on success
            updatedAt: new Date(),
          },
        });

        return {
          subscriptionId: subscription.id,
          success: true,
          amount: charge.amount,
        };
      } else {
        // Handle billing failure
        return await this.handleBillingFailure(
          subscription,
          idempotencyKey,
          billingDate,
          charge.error || 'Unknown error'
        );
      }
    } catch (error: any) {
      return await this.handleBillingFailure(
        subscription,
        idempotencyKey,
        billingDate,
        error.message
      );
    }
  }

  /**
   * Create a subscription charge in Shopify
   */
  private static async createSubscriptionCharge(
    admin: AdminApiContext,
    subscriptionContractId: string,
    amount: number
  ): Promise<{ success: boolean; amount: number; chargeId?: string; error?: string }> {
    const mutation = `
      mutation BillSubscriptionContract($subscriptionContractId: ID!) {
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

    try {
      const response = await admin.graphql(mutation, {
        variables: { subscriptionContractId },
      });

      const data = await response.json();
      
      if (data.data?.subscriptionBillingAttemptCreate?.userErrors?.length > 0) {
        const errors = data.data.subscriptionBillingAttemptCreate.userErrors;
        return {
          success: false,
          amount,
          error: errors.map((e: any) => e.message).join(', '),
        };
      }

      const attempt = data.data?.subscriptionBillingAttemptCreate?.subscriptionBillingAttempt;
      
      if (attempt?.ready) {
        return {
          success: true,
          amount,
          chargeId: attempt.id,
        };
      } else {
        return {
          success: false,
          amount,
          error: attempt?.errorMessage || 'Billing attempt not ready',
        };
      }
    } catch (error: any) {
      console.error('Error creating subscription charge:', error);
      return {
        success: false,
        amount,
        error: error.message,
      };
    }
  }

  /**
   * Handle billing failure
   */
  private static async handleBillingFailure(
    subscription: any,
    idempotencyKey: string,
    billingDate: Date,
    errorMessage: string
  ): Promise<BillingResult> {
    const newFailureCount = subscription.failureCount + 1;
    const maxRetries = SUBSCRIPTION_CONFIG.BILLING.MAX_RETRY_ATTEMPTS;

    // Record failed attempt
    await db.subscriptionBillingAttempt.create({
      data: {
        id: uuidv4(),
        subscriptionId: subscription.id,
        idempotencyKey,
        status: 'FAILED',
        amount: subscription.lastBillingAmount || subscription.monthlyPrice || 0,
        currency: 'USD',
        billingDate,
        attemptNumber: newFailureCount,
        errorMessage,
        processedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Update subscription failure count
    const updateData: any = {
      failureCount: newFailureCount,
      lastFailureReason: errorMessage,
      updatedAt: new Date(),
    };

    // If max retries exceeded, mark as failed
    if (newFailureCount >= maxRetries) {
      updateData.status = 'FAILED';
      
      // Remove customer from tier
      await db.customer.update({
        where: { id: subscription.customerId },
        data: {
          currentTierId: null,
          currentSubscriptionId: null,
          updatedAt: new Date(),
        },
      });

      // Log tier removal
      await db.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId: subscription.customerId,
          shop: subscription.shop,
          fromTierId: subscription.tierId,
          toTierId: null,
          changeType: 'DOWNGRADE',
          triggerType: 'SUBSCRIPTION_EXPIRED',
          subscriptionId: subscription.id,
          metadata: {
            reason: 'Max billing failures exceeded',
            failureCount: newFailureCount,
          },
          createdAt: new Date(),
        },
      });
    } else {
      // Calculate next retry date
      const retryInterval = SUBSCRIPTION_CONFIG.BILLING.RETRY_INTERVALS_DAYS[newFailureCount - 1] || 5;
      const nextRetryDate = new Date(billingDate);
      nextRetryDate.setDate(nextRetryDate.getDate() + retryInterval);
      updateData.nextBillingDate = nextRetryDate;
    }

    await db.tierSubscription.update({
      where: { id: subscription.id },
      data: updateData,
    });

    return {
      subscriptionId: subscription.id,
      success: false,
      error: errorMessage,
    };
  }

  /**
   * Check subscription health and send notifications
   */
  static async checkSubscriptionHealth(shop: string): Promise<void> {
    // Find subscriptions that need attention
    const [failingSubscriptions, upcomingBillings] = await Promise.all([
      // Subscriptions with failures
      db.tierSubscription.findMany({
        where: {
          shop,
          status: 'ACTIVE',
          failureCount: { gt: 0 },
        },
        include: { customer: true },
      }),
      
      // Subscriptions with upcoming billing
      db.tierSubscription.findMany({
        where: {
          shop,
          status: 'ACTIVE',
          nextBillingDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // Next 3 days
          },
        },
        include: { customer: true },
      }),
    ]);

    // TODO: Send notifications for failing subscriptions
    if (failingSubscriptions.length > 0) {
      console.log(`${failingSubscriptions.length} subscriptions need attention due to payment failures`);
      // Implement email notifications
    }

    // TODO: Send upcoming billing reminders
    if (upcomingBillings.length > 0 && SUBSCRIPTION_CONFIG.NOTIFICATIONS.SEND_BILLING_REMINDERS) {
      console.log(`${upcomingBillings.length} subscriptions have upcoming billing`);
      // Implement reminder emails
    }
  }

  /**
   * Retry failed billings
   */
  static async retryFailedBillings(
    admin: AdminApiContext,
    shop: string
  ): Promise<BillingResult[]> {
    console.log(`Retrying failed billings for shop: ${shop}`);
    
    // Find subscriptions with failed attempts that should be retried
    const subscriptionsToRetry = await db.tierSubscription.findMany({
      where: {
        shop,
        status: 'ACTIVE',
        failureCount: {
          gt: 0,
          lt: SUBSCRIPTION_CONFIG.BILLING.MAX_RETRY_ATTEMPTS,
        },
        nextBillingDate: {
          lte: new Date(), // Retry date has passed
        },
      },
      include: {
        customer: true,
        tier: true,
        billingAttempts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    console.log(`Found ${subscriptionsToRetry.length} subscriptions to retry`);

    const results: BillingResult[] = [];

    for (const subscription of subscriptionsToRetry) {
      try {
        const result = await this.processSubscriptionBilling(admin, subscription);
        results.push(result);
      } catch (error: any) {
        console.error(`Error retrying subscription ${subscription.id}:`, error);
        results.push({
          subscriptionId: subscription.id,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }
}