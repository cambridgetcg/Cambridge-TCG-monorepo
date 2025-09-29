/**
 * Webhook handler for subscription billing failures
 * Handles: subscription_billing_attempts/failure
 * 
 * This webhook is triggered when a subscription billing attempt fails.
 * It initiates the dunning process to recover the payment.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { DunningManager } from "~/services/subscription/dunning-manager.server";
import { verifyWebhookHMAC } from "~/utils/webhook-validation.server";
import { db } from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("[Webhook] subscription_billing_attempts/failure received");
  
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
    
    console.log("[Webhook] Processing billing failure:", {
      shop,
      contractId: payload.subscription_contract_id,
      errorCode: payload.error_code,
      errorMessage: payload.error_message
    });
    
    // Check for duplicate webhook processing
    const existingWebhook = await db.webhookProcessed.findUnique({
      where: {
        webhookId: webhookId || `${topic}-${Date.now()}`
      }
    });
    
    if (existingWebhook) {
      console.log("[Webhook] Duplicate webhook, skipping processing");
      return new Response("OK", { status: 200 });
    }
    
    // Record webhook processing (without payload to avoid timeout)
    await db.webhookProcessed.create({
      data: {
        id: require('crypto').randomUUID(),
        shop,
        webhookId: webhookId || `${topic}-${Date.now()}`,
        topic: topic || "subscription_billing_attempts/failure",
        processedAt: new Date()
      }
    });
    
    // Extract relevant data from webhook payload
    const failureDetails = {
      shop,
      contractId: payload.subscription_contract_id,
      customerId: payload.customer?.id,
      errorCode: payload.error_code || "UNKNOWN",
      errorMessage: payload.error_message || "Payment failed",
      billingAmount: payload.billing_attempt?.amount ? parseFloat(payload.billing_attempt.amount) : undefined,
      currency: payload.billing_attempt?.currency || "USD"
    };
    
    // Find the local subscription record
    const subscription = await db.tierSubscription.findFirst({
      where: {
        shop,
        subscriptionContractId: failureDetails.contractId
      }
    });
    
    if (subscription) {
      (failureDetails as any).subscriptionId = subscription.id;
      failureDetails.customerId = subscription.customerId;
    }
    
    // Initiate dunning process
    const result = await DunningManager.handlePaymentFailure(failureDetails);
    
    if (!result.success) {
      console.error("[Webhook] Failed to handle payment failure:", result.message);
      // Still return 200 to prevent Shopify from retrying
    }
    
    console.log("[Webhook] Billing failure processed successfully:", {
      contractId: failureDetails.contractId,
      result
    });
    
    return new Response("OK", { status: 200 });
    
  } catch (error) {
    console.error("[Webhook] Error processing billing failure:", error);
    
    // Record error but still return 200 to prevent infinite retries
    await db.webhookError.create({
      data: {
        shop,
        topic: "subscription_billing_attempts/failure",
        error: error instanceof Error ? error.message : "Unknown error",
        payload: JSON.parse(rawBody),
        createdAt: new Date()
      }
    });
    
    // Return 200 to prevent Shopify from retrying
    return new Response("OK", { status: 200 });
  }
};