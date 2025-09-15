/**
 * Webhook handler for failed subscription billing
 * Triggered when a subscription billing attempt fails
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticate } from "~/shopify.server";
import { v4 as uuidv4 } from 'crypto';
import { SUBSCRIPTION_CONFIG } from "~/services/subscription/config.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE") {
    return new Response("Invalid webhook topic", { status: 400 });
  }

  console.log(`Processing billing failure webhook for shop: ${shop}`);

  try {
    const billingAttempt = payload as any;
    const subscriptionContractId = billingAttempt.subscription_contract.admin_graphql_api_id;
    
    // Find subscription in our database
    const subscription = await db.tierSubscription.findUnique({
      where: { subscriptionContractId },
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
      return new Response("Subscription not found", { status: 404 });
    }

    // Create idempotency key
    const idempotencyKey = `${subscriptionContractId}-${billingAttempt.id}-${billingAttempt.billing_date}-failed`;

    // Check if we already processed this failure
    const existingAttempt = await db.subscriptionBillingAttempt.findUnique({
      where: { idempotencyKey },
    });

    if (existingAttempt) {
      console.log('Billing failure already processed, skipping');
      return new Response("OK", { status: 200 });
    }

    // Calculate attempt number
    const attemptNumber = subscription.billingAttempts.length + 1;

    // Record failed billing attempt
    await db.subscriptionBillingAttempt.create({
      data: {
        id: uuidv4(),
        subscriptionId: subscription.id,
        idempotencyKey,
        status: 'FAILED',
        amount: parseFloat(billingAttempt.total_price || '0'),
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

    // Update subscription with failure information
    const newFailureCount = subscription.failureCount + 1;
    const maxRetries = SUBSCRIPTION_CONFIG.BILLING.MAX_RETRY_ATTEMPTS;

    await db.tierSubscription.update({
      where: { id: subscription.id },
      data: {
        failureCount: newFailureCount,
        lastFailureReason: billingAttempt.error_message || 'Payment failed',
        status: newFailureCount >= maxRetries ? 'FAILED' : subscription.status,
        updatedAt: new Date(),
      },
    });

    // If max retries exceeded, handle subscription failure
    if (newFailureCount >= maxRetries) {
      console.log(`Subscription ${subscription.id} exceeded max retries, marking as failed`);

      // Remove tier from customer if subscription failed
      await db.customer.update({
        where: { id: subscription.customerId },
        data: {
          currentTierId: null,
          currentSubscriptionId: null,
          updatedAt: new Date(),
        },
      });

      // Log tier removal due to payment failure
      await db.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId: subscription.customerId,
          shop,
          fromTierId: subscription.tierId,
          toTierId: null,
          changeType: 'DOWNGRADE',
          triggerType: 'SUBSCRIPTION_EXPIRED',
          subscriptionId: subscription.id,
          metadata: {
            reason: 'Payment failure after max retries',
            failureCount: newFailureCount,
            lastError: billingAttempt.error_message,
          },
          createdAt: new Date(),
        },
      });

      // TODO: Send notification to customer about subscription failure
      // This would integrate with your email service
    } else {
      console.log(`Billing failure ${attemptNumber} for subscription ${subscription.id}, will retry`);
      
      // TODO: Send payment failure notification with retry information
      // Calculate next retry date based on RETRY_INTERVALS_DAYS
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error('Error processing billing failure webhook:', error);
    return new Response("Internal Server Error", { status: 500 });
  }
};