/**
 * Webhook handler for tier subscription billing events
 * Handles both successful and failed billing attempts
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { v4 as uuidv4 } from "uuid";
import { updateCustomerToEffectiveTier } from "../services/tier-resolution.server";
import { TierSubscriptionBridgeV2 } from "../services/subscription/tier-subscription-bridge.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  const isSuccess = topic === "SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS";
  const isFailure = topic === "SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE";

  if (!isSuccess && !isFailure) {
    return new Response("Invalid webhook topic", { status: 400 });
  }

  console.log(`[TierBillingWebhook] Processing ${isSuccess ? "successful" : "failed"} billing for shop: ${shop}`);

  try {
    const billingAttempt = payload as any;
    const contractId = billingAttempt.subscription_contract?.admin_graphql_api_id;
    
    if (!contractId) {
      console.log("[TierBillingWebhook] No contract ID found");
      return new Response("OK", { status: 200 });
    }

    // Find subscription in our database
    const subscription = await db.tierSubscription.findFirst({
      where: { shopifyContractId: contractId },
    });

    if (!subscription) {
      console.log(`[TierBillingWebhook] Subscription not found for contract ${contractId}`);
      return new Response("OK", { status: 200 });
    }

    // Fetch related data separately
    const [customer, tier] = await Promise.all([
      db.customer.findUnique({ where: { id: subscription.customerId } }),
      db.tier.findUnique({ where: { id: subscription.tierId } })
    ]);

    // Add related data to subscription object for compatibility
    const subscriptionWithRelations = {
      ...subscription,
      customer,
      tier
    };

    // Create idempotency key
    const idempotencyKey = `${contractId}-${billingAttempt.id}-${billingAttempt.billing_date}`;

    // Check if already processed
    const existingAttempt = await db.subscriptionBillingAttempt.findUnique({
      where: { idempotencyKey },
    });

    if (existingAttempt) {
      console.log("[TierBillingWebhook] Billing attempt already processed");
      return new Response("OK", { status: 200 });
    }

    if (isSuccess) {
      // Handle successful billing
      await handleSuccessfulBilling(subscriptionWithRelations, billingAttempt, idempotencyKey);
    } else {
      // Handle failed billing
      await handleFailedBilling(subscriptionWithRelations, billingAttempt, idempotencyKey, shop);
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[TierBillingWebhook] Error processing webhook:", error);
    
    // Log error
    try {
      await db.webhookError.create({
        data: {
          id: uuidv4(),
          shop,
          topic,
          orderId: payload?.subscription_contract?.admin_graphql_api_id || "unknown",
          error: error instanceof Error ? error.message : "Unknown error",
          payload,
          createdAt: new Date(),
        },
      });
    } catch (logError) {
      console.error("[TierBillingWebhook] Failed to log error:", logError);
    }
    
    return new Response("Internal Server Error", { status: 500 });
  }
};

/**
 * Handle successful billing
 */
async function handleSuccessfulBilling(
  subscription: any,
  billingAttempt: any,
  idempotencyKey: string
) {
  const now = new Date();
  const wasInFailedStatus = subscription.status === 'FAILED';

  // Record successful billing attempt
  await db.subscriptionBillingAttempt.create({
    data: {
      id: uuidv4(),
      subscriptionId: subscription.id,
      idempotencyKey,
      status: "SUCCESS",
      amount: parseFloat(billingAttempt.total_price || "0"),
      currency: billingAttempt.currency || "USD",
      billingDate: new Date(billingAttempt.billing_date),
      shopifyChargeId: billingAttempt.id,
      shopifyInvoiceId: billingAttempt.order?.admin_graphql_api_id,
      attemptNumber: 1,
      processedAt: now,
      metadata: {
        orderId: billingAttempt.order?.id,
        orderNumber: billingAttempt.order?.name,
        recoveredFromFailed: wasInFailedStatus,
      },
      createdAt: now,
      updatedAt: now,
    },
  });

  // Calculate next billing date based on interval
  const nextBillingDate = calculateNextBillingDate(
    new Date(billingAttempt.billing_date),
    subscription.billingInterval
  );

  // If subscription was in FAILED status, recover it to ACTIVE using state machine
  // This ensures proper status transition validation and logging
  if (wasInFailedStatus) {
    console.log(`[TierBillingWebhook] Recovering subscription ${subscription.id} from FAILED to ACTIVE`);

    await TierSubscriptionBridgeV2.handleStatusChange({
      shop: subscription.shop,
      subscriptionId: subscription.id,
      newStatus: 'ACTIVE',
      reason: 'Payment recovered after failure',
      metadata: {
        recoveredAt: now.toISOString(),
        billingAttemptId: billingAttempt.id,
        previousFailureCount: subscription.failureCount || 0,
      }
    });
  }

  // Update subscription billing details
  await db.tierSubscription.update({
    where: { id: subscription.id },
    data: {
      lastBillingDate: new Date(billingAttempt.billing_date),
      lastBillingAmount: parseFloat(billingAttempt.total_price || "0"),
      nextBillingDate,
      failureCount: 0, // Reset failure count
      lastFailureReason: null,
      updatedAt: now,
    },
  });

  // Use tier resolution system to determine effective tier
  // This respects priority: Manual Override > Subscription > Purchase > Spending-based
  // Note: If recovering from FAILED, handleStatusChange already triggers tier resolution
  // but we call it again here to ensure consistency in all cases
  if (!wasInFailedStatus) {
    await updateCustomerToEffectiveTier(subscription.shop, subscription.customerId, {
      triggeredBy: 'subscription_billing_success',
      subscriptionId: subscription.id
    });
  }

  console.log(`[TierBillingWebhook] Successfully processed billing for subscription ${subscription.id}${wasInFailedStatus ? ' (recovered from FAILED)' : ''}`);
}

/**
 * Handle failed billing
 */
async function handleFailedBilling(
  subscription: any,
  billingAttempt: any,
  idempotencyKey: string,
  shop: string
) {
  const now = new Date();
  const newFailureCount = (subscription.failureCount || 0) + 1;
  
  // Record failed billing attempt
  await db.subscriptionBillingAttempt.create({
    data: {
      id: uuidv4(),
      subscriptionId: subscription.id,
      idempotencyKey,
      status: "FAILED",
      amount: parseFloat(billingAttempt.total_price || "0"),
      currency: billingAttempt.currency || "USD",
      billingDate: new Date(billingAttempt.billing_date),
      shopifyChargeId: billingAttempt.id,
      attemptNumber: newFailureCount,
      errorMessage: billingAttempt.error_message || "Payment failed",
      errorCode: billingAttempt.error_code,
      processedAt: now,
      metadata: {
        originalPayload: billingAttempt,
      },
      createdAt: now,
      updatedAt: now,
    },
  });

  // Update subscription with failure information
  const updateData: any = {
    failureCount: newFailureCount,
    lastFailureReason: billingAttempt.error_message || "Payment failed",
    updatedAt: now,
  };

  // After 3 failures, mark as failed
  const MAX_FAILURES = 3;
  if (newFailureCount >= MAX_FAILURES) {
    updateData.status = "FAILED";
    updateData.endDate = now;
    
    console.log(`[TierBillingWebhook] Subscription ${subscription.id} marked as FAILED after ${MAX_FAILURES} attempts`);

    // Use tier resolution to determine effective tier after subscription failure
    // Customer may still have a tier purchase or spending-based tier
    await updateCustomerToEffectiveTier(shop, subscription.customerId, {
      triggeredBy: 'subscription_billing_failed',
      subscriptionId: subscription.id
    });
  }

  await db.tierSubscription.update({
    where: { id: subscription.id },
    data: updateData,
  });

  console.log(`[TierBillingWebhook] Processed failed billing (attempt ${newFailureCount}) for subscription ${subscription.id}`);
}

/**
 * Calculate next billing date based on interval
 */
function calculateNextBillingDate(fromDate: Date, interval: string): Date {
  const date = new Date(fromDate);
  
  switch (interval) {
    case "WEEKLY":
      date.setDate(date.getDate() + 7);
      break;
    case "MONTHLY":
      date.setMonth(date.getMonth() + 1);
      break;
    case "QUARTERLY":
      date.setMonth(date.getMonth() + 3);
      break;
    case "SEMIANNUAL":
      date.setMonth(date.getMonth() + 6);
      break;
    case "ANNUAL":
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }
  
  return date;
}