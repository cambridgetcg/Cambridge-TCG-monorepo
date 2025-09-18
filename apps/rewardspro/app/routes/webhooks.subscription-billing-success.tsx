/**
 * Webhook handler for successful subscription billing
 * Handles: subscription_billing_attempts/success
 * 
 * This webhook is triggered when a subscription billing attempt succeeds.
 * It updates the subscription status and clears any retry attempts.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { verifyWebhookHMAC } from "~/utils/webhook-validation.server";
import { db } from "~/db.server";
import { v4 as uuidv4 } from "uuid";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("[Webhook] subscription_billing_attempts/success received");
  
  // Get raw body for HMAC verification
  const rawBody = await request.text();
  
  // CRITICAL: Verify HMAC first
  if (!verifyWebhookHMAC(request, rawBody)) {
    console.error("[Webhook] HMAC verification failed");
    return new Response("Unauthorized", { status: 401 });
  }
  
  const shop = request.headers.get("X-Shopify-Shop-Domain");
  const topic = request.headers.get("X-Shopify-Topic");
  const webhookId = request.headers.get("X-Shopify-Webhook-Id");
  
  if (!shop) {
    console.error("[Webhook] Missing shop header");
    return new Response("Bad Request", { status: 400 });
  }
  
  try {
    const payload = JSON.parse(rawBody);
    
    console.log("[Webhook] Processing billing success:", {
      shop,
      contractId: payload.subscription_contract_id,
      orderId: payload.order_id,
      amount: payload.billing_attempt?.amount
    });
    
    // Check for duplicate webhook processing
    const existingWebhook = await db.webhookProcess.findUnique({
      where: {
        shop_webhookId: {
          shop,
          webhookId: webhookId || `${topic}-${Date.now()}`
        }
      }
    });
    
    if (existingWebhook) {
      console.log("[Webhook] Duplicate webhook, skipping processing");
      return new Response("OK", { status: 200 });
    }
    
    // Record webhook processing
    await db.webhookProcess.create({
      data: {
        shop,
        webhookId: webhookId || `${topic}-${Date.now()}`,
        topic: topic || "subscription_billing_attempts/success",
        payload,
        processedAt: new Date()
      }
    });
    
    // Find the subscription
    const subscription = await db.tierSubscription.findFirst({
      where: {
        shop,
        subscriptionContractId: payload.subscription_contract_id
      }
    });
    
    if (!subscription) {
      console.error("[Webhook] Subscription not found:", payload.subscription_contract_id);
      // Still return 200 to prevent retries
      return new Response("OK", { status: 200 });
    }
    
    // Update subscription with successful billing
    await db.tierSubscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        failedPaymentCount: 0, // Reset failure count
        lastBillingDate: new Date(),
        nextBillingDate: payload.next_billing_date ? new Date(payload.next_billing_date) : undefined,
        currentPeriodStart: new Date(),
        currentPeriodEnd: payload.next_billing_date ? new Date(payload.next_billing_date) : undefined
      }
    });
    
    // Create billing attempt record
    await db.subscriptionBillingAttempt.create({
      data: {
        id: uuidv4(),
        shop,
        subscriptionId: subscription.id,
        shopifyBillingAttemptId: payload.billing_attempt?.id || `attempt-${Date.now()}`,
        status: "SUCCESS",
        billingDate: new Date(),
        amount: payload.billing_attempt?.amount ? parseFloat(payload.billing_attempt.amount) : 0,
        currencyCode: payload.billing_attempt?.currency || "USD",
        orderId: payload.order_id,
        orderName: payload.order_name,
        processedAt: new Date(),
        createdAt: new Date()
      }
    });
    
    // Cancel any pending retries
    const cancelledRetries = await db.subscriptionRetry.updateMany({
      where: {
        shop,
        contractId: payload.subscription_contract_id,
        status: "PENDING"
      },
      data: {
        status: "CANCELLED",
        updatedAt: new Date()
      }
    });
    
    if (cancelledRetries.count > 0) {
      console.log("[Webhook] Cancelled pending retries:", cancelledRetries.count);
    }
    
    // Log success event
    await db.subscriptionEvent.create({
      data: {
        id: uuidv4(),
        shop,
        contractId: payload.subscription_contract_id,
        subscriptionId: subscription.id,
        customerId: subscription.customerId,
        eventType: "PAYMENT_SUCCESS",
        eventData: {
          orderId: payload.order_id,
          orderName: payload.order_name,
          amount: payload.billing_attempt?.amount,
          currency: payload.billing_attempt?.currency,
          nextBillingDate: payload.next_billing_date
        },
        processedAt: new Date(),
        createdAt: new Date()
      }
    });
    
    // Check if customer needs tier evaluation
    if (subscription.tierId) {
      // Update customer spending for tier evaluation
      const customer = await db.customer.findUnique({
        where: { id: subscription.customerId }
      });
      
      if (customer) {
        const billingAmount = payload.billing_attempt?.amount ? parseFloat(payload.billing_attempt.amount) : 0;
        
        await db.customer.update({
          where: { id: customer.id },
          data: {
            totalSpent: { increment: billingAmount },
            orderCount: { increment: 1 },
            lastOrderDate: new Date()
          }
        });
        
        // TODO: Trigger tier evaluation if needed
        // await TierEvaluationService.evaluateCustomerTier(customer.id);
      }
    }
    
    console.log("[Webhook] Billing success processed successfully:", {
      subscriptionId: subscription.id,
      orderId: payload.order_id
    });
    
    return new Response("OK", { status: 200 });
    
  } catch (error) {
    console.error("[Webhook] Error processing billing success:", error);
    
    // Record error but still return 200
    await db.webhookError.create({
      data: {
        shop,
        topic: "subscription_billing_attempts/success",
        error: error instanceof Error ? error.message : "Unknown error",
        payload: JSON.parse(rawBody),
        createdAt: new Date()
      }
    });
    
    return new Response("OK", { status: 200 });
  }
};