/**
 * Subscription Billing Attempt Webhook Handler
 *
 * Handles SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS and SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE
 * webhooks from Shopify. Tracks payment attempts and handles failed payments.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/db.server";
import { verifyWebhookHMAC } from "~/utils/webhook-validation.server";
import { roundToCurrencyPrecision } from "~/services/currency-formatter.server";
import type { Currency } from "@prisma/client";

export async function action({ request }: ActionFunctionArgs) {
  const rawBody = await request.text();

  // CRITICAL: Always verify HMAC first
  if (!verifyWebhookHMAC(request, rawBody)) {
    console.error("[Webhook] Invalid HMAC signature for subscription billing attempt");
    return new Response("Unauthorized", { status: 401 });
  }

  const shop = request.headers.get("X-Shopify-Shop-Domain");
  const topic = request.headers.get("X-Shopify-Topic");
  
  if (!shop || !topic) {
    console.error("[Webhook] Missing shop domain or topic");
    return new Response("Bad Request", { status: 400 });
  }

  try {
    const data = JSON.parse(rawBody);
    const isSuccess = topic.includes('SUCCESS');
    
    console.log(`[BillingAttempt] Processing ${isSuccess ? 'SUCCESS' : 'FAILURE'} for shop ${shop}:`, {
      contractId: data.subscription_contract?.admin_graphql_api_id,
      attemptId: data.admin_graphql_api_id,
      amount: data.billing_attempt?.amount,
      errorCode: data.billing_attempt?.error_code,
    });

    const contractId = data.subscription_contract?.admin_graphql_api_id;
    if (!contractId) {
      console.error("[BillingAttempt] Missing contract ID");
      return json({ error: "Missing contract ID" }, { status: 400 });
    }

    // Find subscription
    const subscription = await db.subscription.findUnique({
      where: { shopifyContractId: contractId },
      include: { customer: true },
    });

    if (!subscription) {
      console.error(`[BillingAttempt] Subscription not found: ${contractId}`);
      return json({ error: "Subscription not found" }, { status: 404 });
    }

    // Parse billing attempt details
    const billingAttempt = data.billing_attempt || {};
    const amount = billingAttempt.amount ? parseFloat(billingAttempt.amount) : subscription.amount;
    const currency = (billingAttempt.currency_code || subscription.currency) as Currency;
    const attemptId = data.admin_graphql_api_id;
    const orderId = billingAttempt.order?.admin_graphql_api_id;

    // Check if this attempt was already processed
    const existingAttempt = await db.billingAttempt.findFirst({
      where: {
        subscriptionId: subscription.id,
        transactionId: attemptId,
      },
    });

    if (existingAttempt) {
      console.log(`[BillingAttempt] Already processed: ${attemptId}`);
      return json({ message: "Already processed" });
    }

    // Create billing attempt record
    const attempt = await db.billingAttempt.create({
      data: {
        id: crypto.randomUUID(),
        subscriptionId: subscription.id,
        shop,
        attemptNumber: subscription.failedPaymentCount + 1,
        amount: roundToCurrencyPrecision(Number(amount), currency),
        currency,
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        errorCode: billingAttempt.error_code || null,
        errorMessage: billingAttempt.error_message || null,
        paymentMethodId: data.payment_method?.id || null,
        transactionId: attemptId,
        attemptedAt: new Date(billingAttempt.attempted_at || Date.now()),
        succeededAt: isSuccess ? new Date() : null,
        failedAt: !isSuccess ? new Date() : null,
        nextRetryAt: !isSuccess && billingAttempt.next_retry_at ? 
          new Date(billingAttempt.next_retry_at) : null,
        retriesRemaining: !isSuccess ? (billingAttempt.retries_remaining || 3) : 0,
      },
    });

    // Update subscription based on result
    if (isSuccess) {
      // Successful payment
      await db.subscription.update({
        where: { id: subscription.id },
        data: {
          lastBillingDate: new Date(),
          lastPaymentStatus: 'SUCCESS',
          failedPaymentCount: 0,
          nextBillingDate: data.subscription_contract?.next_billing_date ? 
            new Date(data.subscription_contract.next_billing_date) : null,
          updatedAt: new Date(),
        },
      });

      // Track success event
      await db.subscriptionEvent.create({
        data: {
          id: crypto.randomUUID(),
          shop,
          customerId: subscription.customerId,
          subscriptionId: subscription.id,
          eventType: 'PAYMENT_SUCCESS',
          eventData: {
            attemptId,
            orderId,
            amount,
            currency,
            nextBillingDate: data.subscription_contract?.next_billing_date,
          },
          createdAt: new Date(),
        },
      });

      console.log(`[BillingAttempt] Payment successful for subscription ${subscription.id}`);

    } else {
      // Failed payment
      const newFailedCount = subscription.failedPaymentCount + 1;
      const maxRetries = 3;
      const shouldCancel = newFailedCount >= maxRetries && !billingAttempt.next_retry_at;

      await db.subscription.update({
        where: { id: subscription.id },
        data: {
          lastPaymentStatus: 'FAILED',
          failedPaymentCount: newFailedCount,
          status: shouldCancel ? 'FAILED' : subscription.status,
          updatedAt: new Date(),
        },
      });

      // Track failure event
      await db.subscriptionEvent.create({
        data: {
          id: crypto.randomUUID(),
          shop,
          customerId: subscription.customerId,
          subscriptionId: subscription.id,
          eventType: billingAttempt.next_retry_at ? 'PAYMENT_RETRY_SCHEDULED' : 'PAYMENT_FAILED',
          eventData: {
            attemptId,
            attemptNumber: newFailedCount,
            errorCode: billingAttempt.error_code,
            errorMessage: billingAttempt.error_message,
            nextRetryAt: billingAttempt.next_retry_at,
            retriesRemaining: billingAttempt.retries_remaining,
            willCancel: shouldCancel,
          },
          createdAt: new Date(),
        },
      });

      // Update customer subscription status if failed
      if (shouldCancel) {
        await db.customer.update({
          where: { id: subscription.customerId },
          data: {
            hasActiveSubscription: false,
            updatedAt: new Date(),
          },
        });
      }

      console.log(`[BillingAttempt] Payment failed for subscription ${subscription.id}:`, {
        attemptNumber: newFailedCount,
        errorCode: billingAttempt.error_code,
        nextRetryAt: billingAttempt.next_retry_at,
        willCancel: shouldCancel,
      });

      // TODO: Send notification email about failed payment
      // await sendFailedPaymentEmail(subscription.customer, attempt);
    }

    return json({ 
      success: true, 
      attemptId: attempt.id,
      status: isSuccess ? 'SUCCESS' : 'FAILED',
    });

  } catch (error) {
    console.error("[BillingAttempt] Error processing webhook:", error);

    // Store error for debugging
    await db.webhookError.create({
      data: {
        id: crypto.randomUUID(),
        shop: shop || 'unknown',
        topic: topic || 'SUBSCRIPTION_BILLING_ATTEMPT',
        error: error instanceof Error ? error.message : 'Unknown error',
        payload: JSON.parse(rawBody),
        createdAt: new Date(),
      },
    });

    return json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Helper to determine if we should retry payment
 */
function shouldRetryPayment(errorCode: string | null): boolean {
  // Don't retry for permanent failures
  const permanentErrors = [
    'CARD_DECLINED',
    'FRAUD',
    'INVALID_CARD',
    'EXPIRED_CARD',
    'CUSTOMER_CANCELLED',
  ];

  if (!errorCode) return true;
  return !permanentErrors.includes(errorCode);
}

/**
 * Calculate next retry date based on attempt number
 */
function calculateNextRetryDate(attemptNumber: number): Date {
  // Exponential backoff: 1 day, 3 days, 7 days
  const daysToRetry = [1, 3, 7];
  const days = daysToRetry[Math.min(attemptNumber - 1, daysToRetry.length - 1)];
  
  const nextRetry = new Date();
  nextRetry.setDate(nextRetry.getDate() + days);
  return nextRetry;
}