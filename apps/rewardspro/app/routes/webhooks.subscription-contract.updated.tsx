/**
 * Subscription Contract Updated Webhook Handler
 *
 * Handles SUBSCRIPTION_CONTRACTS_UPDATE webhook from Shopify.
 * Updates subscription status, billing dates, and handles pauses/resumes.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/db.server";
import { verifyWebhookHMAC } from "~/utils/webhook-validation.server";
import { roundToCurrencyPrecision } from "~/app/services/currency-formatter.server";
import type { Currency } from "@prisma/client";

export async function action({ request }: ActionFunctionArgs) {
  const rawBody = await request.text();

  // CRITICAL: Always verify HMAC first
  if (!verifyWebhookHMAC(request, rawBody)) {
    console.error("[Webhook] Invalid HMAC signature for subscription.contract.updated");
    return new Response("Unauthorized", { status: 401 });
  }

  const shop = request.headers.get("X-Shopify-Shop-Domain");
  if (!shop) {
    console.error("[Webhook] Missing shop domain");
    return new Response("Bad Request", { status: 400 });
  }

  try {
    const data = JSON.parse(rawBody);
    const contractId = data.admin_graphql_api_id;
    const status = data.status;

    console.log(`[SubscriptionUpdated] Processing for shop ${shop}:`, {
      contractId,
      status,
      nextBillingDate: data.next_billing_date,
    });

    // Find existing subscription
    const subscription = await db.subscription.findUnique({
      where: { shopifyContractId: contractId },
      include: { customer: true },
    });

    if (!subscription) {
      console.error(`[SubscriptionUpdated] Subscription not found: ${contractId}`);
      // Create new subscription if it doesn't exist
      return createSubscriptionFromWebhook(shop, data);
    }

    const previousStatus = subscription.status;
    const nextBillingDate = data.next_billing_date ? new Date(data.next_billing_date) : null;

    // Update subscription
    const updatedSubscription = await db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: mapSubscriptionStatus(status),
        nextBillingDate,
        lastBillingDate: data.last_billing_date ? new Date(data.last_billing_date) : subscription.lastBillingDate,
        
        // Update lifecycle dates based on status changes
        ...(status === 'ACTIVE' && previousStatus !== 'ACTIVE' ? {
          activatedAt: new Date(),
          resumedAt: previousStatus === 'PAUSED' ? new Date() : subscription.resumedAt,
        } : {}),
        
        ...(status === 'PAUSED' && previousStatus !== 'PAUSED' ? {
          pausedAt: new Date(),
        } : {}),
        
        ...(status === 'CANCELLED' && previousStatus !== 'CANCELLED' ? {
          cancelledAt: new Date(),
          cancellationReason: data.cancellation_reason || null,
        } : {}),

        // Update metadata
        metadata: {
          ...subscription.metadata as any,
          lastWebhookUpdate: data,
          updatedAt: new Date().toISOString(),
        },
        
        updatedAt: new Date(),
      },
    });

    // Update customer subscription status
    await db.customer.update({
      where: { id: subscription.customerId },
      data: {
        hasActiveSubscription: status === 'ACTIVE',
        subscriptionTier: status === 'ACTIVE' ? subscription.planName : null,
        updatedAt: new Date(),
      },
    });

    // Determine event type based on status change
    let eventType = 'BILLING_UPDATED';
    if (previousStatus !== status) {
      if (status === 'ACTIVE' && previousStatus === 'PAUSED') {
        eventType = 'RESUMED';
      } else if (status === 'PAUSED') {
        eventType = 'PAUSED';
      } else if (status === 'CANCELLED') {
        eventType = 'CANCELLED';
      } else if (status === 'ACTIVE') {
        eventType = 'ACTIVATED';
      }
    }

    // Track subscription event
    await db.subscriptionEvent.create({
      data: {
        id: crypto.randomUUID(),
        shop,
        customerId: subscription.customerId,
        subscriptionId: subscription.id,
        eventType,
        eventData: {
          contractId,
          previousStatus,
          newStatus: status,
          nextBillingDate: nextBillingDate?.toISOString(),
          changes: getChanges(subscription, data),
        },
        createdAt: new Date(),
      },
    });

    console.log(`[SubscriptionUpdated] Updated subscription ${contractId}:`, {
      previousStatus,
      newStatus: status,
      eventType,
    });

    return json({ success: true, eventType });
  } catch (error) {
    console.error("[SubscriptionUpdated] Error processing webhook:", error);

    // Store error for debugging
    await db.webhookError.create({
      data: {
        id: crypto.randomUUID(),
        shop: shop || 'unknown',
        topic: 'SUBSCRIPTION_CONTRACTS_UPDATE',
        error: error instanceof Error ? error.message : 'Unknown error',
        payload: JSON.parse(rawBody),
        createdAt: new Date(),
      },
    });

    return json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Create subscription from webhook if it doesn't exist
 */
async function createSubscriptionFromWebhook(shop: string, data: any) {
  const customerId = data.customer?.admin_graphql_api_id;
  
  if (!customerId) {
    return json({ error: "Missing customer ID" }, { status: 400 });
  }

  // Find or create customer
  let customer = await db.customer.findFirst({
    where: {
      shop,
      shopifyCustomerId: customerId,
    },
  });

  if (!customer) {
    customer = await db.customer.create({
      data: {
        id: crypto.randomUUID(),
        shop,
        shopifyCustomerId: customerId,
        email: data.customer?.email || '',
        firstName: data.customer?.first_name || null,
        lastName: data.customer?.last_name || null,
        storeCredit: 0,
        totalSpent: 0,
        totalCashbackEarned: 0,
        totalRefunded: 0,
        netSpent: 0,
        orderCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  // Parse billing details
  const contractId = data.admin_graphql_api_id;
  const billingPolicy = data.billing_policy || {};
  const nextBillingDate = data.next_billing_date ? new Date(data.next_billing_date) : null;
  const currency = (data.currency_code || 'USD') as Currency;
  const lineItem = data.lines?.length > 0 ? data.lines[0] : null;
  const amount = lineItem?.price ? parseFloat(lineItem.price) : 0;
  const planName = lineItem?.title || 'Subscription';

  // Create subscription
  const subscription = await db.subscription.create({
    data: {
      id: crypto.randomUUID(),
      shop,
      customerId: customer.id,
      shopifyContractId: contractId,
      planName,
      status: mapSubscriptionStatus(data.status),
      amount: roundToCurrencyPrecision(amount, currency),
      currency,
      billingInterval: billingPolicy.interval || 'MONTH',
      billingIntervalCount: billingPolicy.interval_count || 1,
      nextBillingDate,
      activatedAt: data.status === 'ACTIVE' ? new Date() : null,
      features: lineItem?.properties || null,
      metadata: {
        createdFromUpdateWebhook: true,
        originalWebhook: data,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  console.log(`[SubscriptionUpdated] Created missing subscription: ${contractId}`);
  return json({ success: true, created: true });
}

/**
 * Get changes between previous and new subscription data
 */
function getChanges(subscription: any, webhookData: any): Record<string, any> {
  const changes: Record<string, any> = {};

  // Check for price changes
  const lineItem = webhookData.lines?.length > 0 ? webhookData.lines[0] : null;
  if (lineItem?.price) {
    const newAmount = parseFloat(lineItem.price);
    if (Math.abs(newAmount - Number(subscription.amount)) > 0.01) {
      changes.price = {
        previous: Number(subscription.amount),
        new: newAmount,
      };
    }
  }

  // Check for billing interval changes
  const billingPolicy = webhookData.billing_policy || {};
  if (billingPolicy.interval && billingPolicy.interval !== subscription.billingInterval) {
    changes.billingInterval = {
      previous: subscription.billingInterval,
      new: billingPolicy.interval,
    };
  }

  // Check for plan name changes
  if (lineItem?.title && lineItem.title !== subscription.planName) {
    changes.planName = {
      previous: subscription.planName,
      new: lineItem.title,
    };
  }

  return changes;
}

/**
 * Map Shopify subscription status to our enum
 */
function mapSubscriptionStatus(shopifyStatus: string): any {
  const statusMap: Record<string, string> = {
    'ACTIVE': 'ACTIVE',
    'PAUSED': 'PAUSED',
    'CANCELLED': 'CANCELLED',
    'EXPIRED': 'EXPIRED',
    'FAILED': 'FAILED',
    'PENDING': 'PENDING',
  };

  return statusMap[shopifyStatus] || 'PENDING';
}