/**
 * Subscription Contract Created Webhook Handler
 *
 * Handles SUBSCRIPTION_CONTRACTS_CREATE webhook from Shopify.
 * Stores subscription details and updates customer status.
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
    console.error("[Webhook] Invalid HMAC signature for subscription.contract.created");
    return new Response("Unauthorized", { status: 401 });
  }

  const shop = request.headers.get("X-Shopify-Shop-Domain");
  if (!shop) {
    console.error("[Webhook] Missing shop domain");
    return new Response("Bad Request", { status: 400 });
  }

  try {
    const data = JSON.parse(rawBody);
    console.log(`[SubscriptionCreated] Processing for shop ${shop}:`, {
      contractId: data.admin_graphql_api_id,
      customerId: data.customer?.admin_graphql_api_id,
      status: data.status,
    });

    // Extract subscription details
    const contractId = data.admin_graphql_api_id;
    const customerId = data.customer?.admin_graphql_api_id;
    const status = data.status || 'ACTIVE';

    if (!contractId || !customerId) {
      console.error("[SubscriptionCreated] Missing required fields");
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    // Find or create customer
    let customer = await db.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId: customerId,
      },
    });

    if (!customer) {
      // Create customer if not exists
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
      console.log(`[SubscriptionCreated] Created new customer: ${customer.email}`);
    }

    // Parse billing details
    const billingPolicy = data.billing_policy || {};
    const nextBillingDate = data.next_billing_date ? new Date(data.next_billing_date) : null;
    const currency = (data.currency_code || 'USD') as Currency;

    // Get line item details
    const lineItem = data.lines?.length > 0 ? data.lines[0] : null;
    const amount = lineItem?.price ? parseFloat(lineItem.price) : 0;
    const planName = lineItem?.title || 'Subscription';

    // Check if subscription already exists
    const existingSubscription = await db.subscription.findFirst({
      where: {
        shopifyContractId: contractId,
      },
    });

    if (existingSubscription) {
      console.log(`[SubscriptionCreated] Subscription already exists: ${contractId}`);
      return json({ message: "Subscription already processed" });
    }

    // Create subscription record
    const subscription = await db.subscription.create({
      data: {
        id: crypto.randomUUID(),
        shop,
        customerId: customer.id,
        shopifyContractId: contractId,
        planName,
        status: mapSubscriptionStatus(status),
        amount: roundToCurrencyPrecision(amount, currency),
        currency,
        billingInterval: billingPolicy.interval || 'MONTH',
        billingIntervalCount: billingPolicy.interval_count || 1,
        nextBillingDate,
        activatedAt: status === 'ACTIVE' ? new Date() : null,
        features: lineItem?.properties || null,
        metadata: {
          originalWebhook: data,
          lineItems: data.lines,
          billingPolicy,
          deliveryPolicy: data.delivery_policy,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Update customer subscription status
    await db.customer.update({
      where: { id: customer.id },
      data: {
        hasActiveSubscription: status === 'ACTIVE',
        subscriptionTier: planName,
        updatedAt: new Date(),
      },
    });

    console.log(`[SubscriptionCreated] Created subscription for ${customer.email}:`, {
      id: subscription.id,
      contractId,
      planName,
      amount,
      currency,
      status,
    });

    // Track subscription event
    await db.subscriptionEvent.create({
      data: {
        id: crypto.randomUUID(),
        shop,
        customerId: customer.id,
        subscriptionId: subscription.id,
        eventType: 'CREATED',
        eventData: {
          contractId,
          planName,
          amount,
          currency,
          status,
        },
        createdAt: new Date(),
      },
    });

    return json({ success: true, subscriptionId: subscription.id });
  } catch (error) {
    console.error("[SubscriptionCreated] Error processing webhook:", error);

    // Store error for debugging
    await db.webhookError.create({
      data: {
        id: crypto.randomUUID(),
        shop: shop || 'unknown',
        topic: 'SUBSCRIPTION_CONTRACTS_CREATE',
        error: error instanceof Error ? error.message : 'Unknown error',
        payload: JSON.parse(rawBody),
        createdAt: new Date(),
      },
    });

    return json({ error: "Internal server error" }, { status: 500 });
  }
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