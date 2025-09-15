/**
 * Webhook handler for successful subscription billing
 * Triggered when a subscription billing attempt succeeds
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticate } from "~/shopify.server";
import { v4 as uuidv4 } from 'crypto';
import { getNextBillingDate } from "~/services/subscription/config.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS") {
    return new Response("Invalid webhook topic", { status: 400 });
  }

  console.log(`Processing billing success webhook for shop: ${shop}`);

  try {
    const billingAttempt = payload as any;
    const subscriptionContractId = billingAttempt.subscription_contract.admin_graphql_api_id;
    
    // Find subscription in our database
    const subscription = await db.tierSubscription.findUnique({
      where: { subscriptionContractId },
      include: { customer: true },
    });

    if (!subscription) {
      console.error(`Subscription not found: ${subscriptionContractId}`);
      return new Response("Subscription not found", { status: 404 });
    }

    // Create idempotency key to prevent duplicate processing
    const idempotencyKey = `${subscriptionContractId}-${billingAttempt.id}-${billingAttempt.billing_date}`;

    // Check if we already processed this billing attempt
    const existingAttempt = await db.subscriptionBillingAttempt.findUnique({
      where: { idempotencyKey },
    });

    if (existingAttempt) {
      console.log('Billing attempt already processed, skipping');
      return new Response("OK", { status: 200 });
    }

    // Record successful billing attempt
    await db.subscriptionBillingAttempt.create({
      data: {
        id: uuidv4(),
        subscriptionId: subscription.id,
        idempotencyKey,
        status: 'SUCCESS',
        amount: parseFloat(billingAttempt.total_price),
        currency: billingAttempt.currency,
        billingDate: new Date(billingAttempt.billing_date),
        shopifyChargeId: billingAttempt.id,
        shopifyInvoiceId: billingAttempt.order?.admin_graphql_api_id,
        attemptNumber: 1,
        processedAt: new Date(),
        metadata: {
          orderId: billingAttempt.order?.id,
          orderNumber: billingAttempt.order?.name,
          originalPayload: billingAttempt,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Calculate next billing date
    const nextBillingDate = getNextBillingDate(
      new Date(billingAttempt.billing_date),
      subscription.billingInterval as any
    );

    // Update subscription with successful billing
    await db.tierSubscription.update({
      where: { id: subscription.id },
      data: {
        lastBillingDate: new Date(billingAttempt.billing_date),
        lastBillingAmount: parseFloat(billingAttempt.total_price),
        nextBillingDate,
        currentPeriodStart: new Date(billingAttempt.billing_date),
        currentPeriodEnd: nextBillingDate,
        failureCount: 0, // Reset failure count on success
        lastFailureReason: null,
        updatedAt: new Date(),
      },
    });

    // Check if tier needs to be renewed/extended
    if (subscription.customer.currentTierId !== subscription.tierId) {
      await db.customer.update({
        where: { id: subscription.customerId },
        data: {
          currentTierId: subscription.tierId,
          updatedAt: new Date(),
        },
      });

      // Log tier renewal
      await db.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId: subscription.customerId,
          shop,
          fromTierId: subscription.customer.currentTierId,
          toTierId: subscription.tierId,
          changeType: 'UPGRADE',
          triggerType: 'SUBSCRIPTION_ACTIVATED',
          subscriptionId: subscription.id,
          metadata: {
            billingAttemptId: billingAttempt.id,
            amount: billingAttempt.total_price,
          },
          createdAt: new Date(),
        },
      });
    }

    console.log(`Billing success processed for subscription: ${subscription.id}`);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error('Error processing billing success webhook:', error);
    return new Response("Internal Server Error", { status: 500 });
  }
};