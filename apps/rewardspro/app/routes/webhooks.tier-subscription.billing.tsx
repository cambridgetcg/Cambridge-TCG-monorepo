/**
 * Webhook handler for tier subscription billing events
 * Handles both successful and failed billing attempts
 *
 * Enhanced with Neural Network Infrastructure:
 * - Correlation ID tracing
 * - Webhook deduplication
 * - Unified subscription service with state machine
 * - Enhanced logging
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { v4 as uuidv4 } from "uuid";
import { updateCustomerToEffectiveTier } from "../services/tier-resolution.server";
import {
  UnifiedSubscriptionService,
  recordBillingSuccess,
  recordBillingFailure,
} from "../services/subscription/subscription-unified.server";
import {
  subscriptionLogger,
  withWebhookCorrelation,
} from "../services/subscription/subscription-correlation.server";
import {
  withWebhookDeduplication,
  generateBillingIdempotencyKey,
} from "../services/subscription/subscription-deduplication.server";
import { SUBSCRIPTION_NEURAL_CONFIG, calculateNextBillingDate } from "../services/subscription/subscription-neural-config.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  const isSuccess = topic === "SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS";
  const isFailure = topic === "SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE";

  if (!isSuccess && !isFailure) {
    return new Response("Invalid webhook topic", { status: 400 });
  }

  const billingAttempt = payload as any;
  const contractId = billingAttempt.subscription_contract?.admin_graphql_api_id;

  if (!contractId) {
    subscriptionLogger.warn("No contract ID in billing webhook", { topic });
    return new Response("OK", { status: 200 });
  }

  // Wrap with correlation for tracing
  return withWebhookCorrelation(shop, topic, contractId, async () => {
    // Wrap with deduplication
    const idempotencyKey = generateBillingIdempotencyKey(
      contractId,
      billingAttempt.id,
      billingAttempt.billing_date
    );

    return withWebhookDeduplication(
      shop,
      topic,
      contractId,
      async () => {
        subscriptionLogger.operationStart(
          isSuccess ? "webhook:billing_success" : "webhook:billing_failure",
          { contractId, billingAttemptId: billingAttempt.id }
        );

        try {
          // Find subscription
          const subscription = await UnifiedSubscriptionService.findByContractId(shop, contractId);

          if (!subscription) {
            subscriptionLogger.info("Subscription not found for billing event", { contractId });
            return new Response("OK", { status: 200 });
          }

          // Fetch related data
          const [customer, tier] = await Promise.all([
            db.customer.findUnique({ where: { id: subscription.customerId } }),
            db.tier.findUnique({ where: { id: subscription.tierId } }),
          ]);

          if (isSuccess) {
            await handleSuccessfulBilling(shop, subscription, billingAttempt, idempotencyKey, customer);
          } else {
            await handleFailedBilling(shop, subscription, billingAttempt, idempotencyKey);
          }

          subscriptionLogger.operationComplete(
            isSuccess ? "webhook:billing_success" : "webhook:billing_failure",
            { subscriptionId: subscription.id }
          );

          return new Response("OK", { status: 200 });
        } catch (error) {
          subscriptionLogger.error("Error processing billing webhook", error);

          // Log error
          try {
            await db.webhookError.create({
              data: {
                id: uuidv4(),
                shop,
                topic,
                orderId: contractId || "unknown",
                error: error instanceof Error ? error.message : "Unknown error",
                payload,
                createdAt: new Date(),
              },
            });
          } catch (logError) {
            subscriptionLogger.error("Failed to log webhook error", logError);
          }

          return new Response("Internal Server Error", { status: 500 });
        }
      },
      {
        eventId: billingAttempt.id,
        onDuplicate: () => {
          subscriptionLogger.info("Duplicate billing webhook - skipping", {
            contractId,
            billingAttemptId: billingAttempt.id,
          });
          return new Response("OK", { status: 200 });
        },
      }
    );
  });
};

/**
 * Handle successful billing using unified service
 */
async function handleSuccessfulBilling(
  shop: string,
  subscription: any,
  billingAttempt: any,
  idempotencyKey: string,
  customer: any
) {
  const now = new Date();
  const wasInFailedStatus = subscription.status === "FAILED";

  // Check idempotency
  const existingAttempt = await db.subscriptionBillingAttempt.findUnique({
    where: { idempotencyKey },
  });

  if (existingAttempt) {
    subscriptionLogger.idempotencyCheck(idempotencyKey, true);
    return;
  }

  subscriptionLogger.idempotencyCheck(idempotencyKey, false);

  // Use unified service to record billing success
  const result = await recordBillingSuccess(shop, subscription.id, {
    chargeId: billingAttempt.id,
    amount: parseFloat(billingAttempt.total_price || "0"),
    currency: billingAttempt.currency || "USD",
    billingDate: new Date(billingAttempt.billing_date),
    orderId: billingAttempt.order?.admin_graphql_api_id,
  });

  if (!result.success) {
    subscriptionLogger.warn("Failed to record billing success via unified service", {
      error: result.error,
    });

    // Fallback: record directly
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
          fallback: true,
        },
        createdAt: now,
        updatedAt: now,
      },
    });

    // Update subscription
    const nextBillingDate = calculateNextBillingDate(
      new Date(billingAttempt.billing_date),
      subscription.billingInterval
    );

    await db.tierSubscription.update({
      where: { id: subscription.id },
      data: {
        lastBillingDate: new Date(billingAttempt.billing_date),
        lastBillingAmount: parseFloat(billingAttempt.total_price || "0"),
        nextBillingDate,
        failureCount: 0,
        lastFailureReason: null,
        updatedAt: now,
      },
    });

    // Handle recovery from FAILED if needed
    if (wasInFailedStatus) {
      await UnifiedSubscriptionService.recover(shop, subscription.id);
    }
  }

  // Tier resolution for non-recovery cases (recovery handles it internally)
  if (!wasInFailedStatus && customer) {
    await updateCustomerToEffectiveTier(shop, subscription.customerId, {
      triggeredBy: "subscription_billing_success",
      subscriptionId: subscription.id,
    });
  }

  subscriptionLogger.info(
    `Processed billing success${wasInFailedStatus ? " (recovered from FAILED)" : ""}`,
    { subscriptionId: subscription.id, nextBillingDate: result.nextBillingDate }
  );
}

/**
 * Handle failed billing using unified service
 */
async function handleFailedBilling(
  shop: string,
  subscription: any,
  billingAttempt: any,
  idempotencyKey: string
) {
  const now = new Date();
  const newFailureCount = (subscription.failureCount || 0) + 1;

  // Check idempotency
  const existingAttempt = await db.subscriptionBillingAttempt.findUnique({
    where: { idempotencyKey },
  });

  if (existingAttempt) {
    subscriptionLogger.idempotencyCheck(idempotencyKey, true);
    return;
  }

  subscriptionLogger.idempotencyCheck(idempotencyKey, false);

  // Use unified service
  const result = await recordBillingFailure(shop, subscription.id, {
    chargeId: billingAttempt.id,
    amount: parseFloat(billingAttempt.total_price || "0"),
    currency: billingAttempt.currency || "USD",
    billingDate: new Date(billingAttempt.billing_date),
    errorMessage: billingAttempt.error_message || "Payment failed",
    errorCode: billingAttempt.error_code,
  });

  if (!result.success) {
    subscriptionLogger.warn("Failed to record billing failure via unified service", {
      error: result.error,
    });

    // Fallback
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
        metadata: { fallback: true },
        createdAt: now,
        updatedAt: now,
      },
    });

    // Check if should mark as FAILED
    const maxAttempts = SUBSCRIPTION_NEURAL_CONFIG.dunning.maxRetryAttempts;
    const updateData: any = {
      failureCount: newFailureCount,
      lastFailureReason: billingAttempt.error_message || "Payment failed",
      updatedAt: now,
    };

    if (newFailureCount >= maxAttempts) {
      updateData.status = "FAILED";
      updateData.endDate = now;

      // Trigger tier resolution
      await updateCustomerToEffectiveTier(shop, subscription.customerId, {
        triggeredBy: "subscription_billing_failed",
        subscriptionId: subscription.id,
      });
    }

    await db.tierSubscription.update({
      where: { id: subscription.id },
      data: updateData,
    });
  }

  subscriptionLogger.info(
    `Processed billing failure (attempt ${newFailureCount}/${SUBSCRIPTION_NEURAL_CONFIG.dunning.maxRetryAttempts})`,
    { subscriptionId: subscription.id }
  );
}
