/**
 * Webhook handler for failed subscription billing
 * Triggered when a subscription billing attempt fails
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticate } from "~/shopify.server";
import crypto from 'crypto';
const uuidv4 = () => crypto.randomUUID();
import { SUBSCRIPTION_CONFIG } from "~/services/subscription/config.server";
import { TierSubscriptionBridgeV2 } from "~/services/subscription/tier-subscription-bridge.server";
import { withRetry } from "~/utils/retry";
import { validatePrice } from "~/utils/price-validation";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE") {
    return new Response("Invalid webhook topic", { status: 400 });
  }

  console.log(`Processing billing failure webhook for shop: ${shop}`);

  try {
    const billingAttempt = payload as any;
    const subscriptionContractId = billingAttempt.subscription_contract.admin_graphql_api_id;
    
    // Use retry logic for database operations
    const result = await withRetry(
      async () => {
        // Find subscription in our database
        const subscription = await db.tierSubscription.findFirst({
          where: { shopifyContractId: subscriptionContractId },
          include: { 
            customer: true,
            billingAttempts: {
              where: { status: 'FAILED' },
              orderBy: { createdAt: 'desc' },
            },
          },
        });

        if (!subscription) {
          console.error(`Subscription not found: ${subscriptionContractId}`);
          throw new Error("Subscription not found");
        }

        // Create idempotency key
        const idempotencyKey = `${subscriptionContractId}-${billingAttempt.id}-${billingAttempt.billing_date}-failed`;

        // Check if we already processed this failure
        const existingAttempt = await db.subscriptionBillingAttempt.findUnique({
          where: { idempotencyKey },
        });

        if (existingAttempt) {
          console.log('Billing failure already processed, skipping');
          return { success: true, message: "Already processed" };
        }

        // Calculate attempt number
        const attemptNumber = subscription.billingAttempts.length + 1;

        // Validate and sanitize price
        const priceValidation = validatePrice(billingAttempt.total_price, billingAttempt.currency || 'USD');
        if (!priceValidation.valid) {
          throw new Error(`Invalid price: ${priceValidation.error}`);
        }

        // Record failed billing attempt
        await db.subscriptionBillingAttempt.create({
          data: {
            id: uuidv4(),
            subscriptionId: subscription.id,
            idempotencyKey,
            status: 'FAILED',
            amount: priceValidation.sanitizedPrice!,
            currency: billingAttempt.currency || 'USD',
        billingDate: new Date(billingAttempt.billing_date),
        shopifyChargeId: billingAttempt.id,
        attemptNumber,
        errorMessage: billingAttempt.error_message || 'Payment failed',
        errorCode: billingAttempt.error_code,
        processedAt: new Date(),
        metadata: {
          originalPayload: billingAttempt,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

        // Use TierSubscriptionBridge to handle payment failure
        await TierSubscriptionBridgeV2.handlePaymentFailure(
          shop,
          subscription.id,
          billingAttempt.error_message || 'Payment failed'
        );

        // Check if we should mark as permanently failed
        const newFailureCount = subscription.failureCount + 1;
        const maxRetries = SUBSCRIPTION_CONFIG.BILLING.MAX_RETRY_ATTEMPTS;

        if (newFailureCount >= maxRetries) {
          console.log(`Subscription ${subscription.id} exceeded max retries, marking as cancelled`);
          
          // Use TierSubscriptionBridge to handle status change
          await TierSubscriptionBridgeV2.handleStatusChange({
            shop,
            subscriptionId: subscription.id,
            newStatus: 'CANCELLED',
            reason: 'Exceeded maximum retry attempts',
            metadata: {
              maxRetries,
              failureCount: newFailureCount,
              lastError: billingAttempt.error_message,
            }
          });

          // TODO: Send notification to customer about subscription failure
          // This would integrate with your email service
        } else {
          console.log(`Billing failure ${attemptNumber} for subscription ${subscription.id}, will retry`);
          
          // TODO: Send payment failure notification with retry information
          // Calculate next retry date based on RETRY_INTERVALS_DAYS
        }

        return { success: true };
      },
      {
        maxAttempts: 3,
        shouldRetry: (error) => {
          // Don't retry if subscription not found
          if (error.message?.includes('not found')) {
            return false;
          }
          return true;
        }
      }
    );

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error('Error processing billing failure webhook:', error);
    
    // Log error for monitoring
    await db.webhookError.create({
      data: {
        id: uuidv4(),
        shop,
        topic: 'SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE',
        orderId: payload?.subscription_contract?.admin_graphql_api_id || 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error',
        payload,
        createdAt: new Date(),
      }
    }).catch(console.error);
    
    // Return success to prevent Shopify retries for non-recoverable errors
    if (error instanceof Error && error.message?.includes('not found')) {
      return new Response("OK", { status: 200 });
    }
    
    return new Response("Internal Server Error", { status: 500 });
  }
};