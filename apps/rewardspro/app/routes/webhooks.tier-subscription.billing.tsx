/**
 * Webhook handler for tier subscription billing events
 * Handles both successful and failed billing attempts
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { v4 as uuidv4 } from "uuid";

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

  // Update subscription
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

  // Ensure customer is assigned to tier
  if (subscription.customer.currentTierId !== subscription.tierId) {
    await db.customer.update({
      where: { id: subscription.customerId },
      data: {
        currentTierId: subscription.tierId,
        updatedAt: now,
      },
    });

    // Log tier renewal
    await db.tierChangeLog.create({
      data: {
        id: uuidv4(),
        customerId: subscription.customerId,
        shop: subscription.shop,
        fromTierId: subscription.customer.currentTierId,
        toTierId: subscription.tierId,
        fromTierName: null,
        toTierName: subscription.tier.name,
        changeType: "UPGRADE",
        triggerType: "SUBSCRIPTION_ACTIVATED",
        subscriptionId: subscription.id,
        metadata: {
          billingAttemptId: billingAttempt.id,
          amount: billingAttempt.total_price,
        },
        createdAt: now,
      },
    });
  }

  console.log(`[TierBillingWebhook] Successfully processed billing for subscription ${subscription.id}`);
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
    
    // Remove customer from tier
    await db.customer.update({
      where: { id: subscription.customerId },
      data: {
        currentTierId: null,
        updatedAt: now,
      },
    });

    // Log tier removal
    await db.tierChangeLog.create({
      data: {
        id: uuidv4(),
        customerId: subscription.customerId,
        shop,
        fromTierId: subscription.tierId,
        toTierId: null,
        fromTierName: subscription.tier.name,
        toTierName: null,
        changeType: "DOWNGRADE",
        triggerType: "SUBSCRIPTION_CANCELLED",
        subscriptionId: subscription.id,
        metadata: {
          reason: "Exceeded maximum billing failures",
          failureCount: newFailureCount,
          lastError: billingAttempt.error_message,
        },
        createdAt: now,
      },
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