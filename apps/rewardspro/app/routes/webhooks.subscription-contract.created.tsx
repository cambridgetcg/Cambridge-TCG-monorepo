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
import { roundToCurrencyPrecision } from "~/services/currency-formatter.server";
import { updateCustomerToEffectiveTier } from "~/services/tier-resolution.server";
import type { Currency, SubscriptionStatus, BillingInterval } from "@prisma/client";

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
    const variantId = lineItem?.variant_id;
    const sellingPlanId = lineItem?.selling_plan_id;

    // Check if subscription already exists (idempotency)
    const existingTierSubscription = await db.tierSubscription.findFirst({
      where: {
        subscriptionContractId: contractId,
      },
    });

    if (existingTierSubscription) {
      console.log(`[SubscriptionCreated] Tier subscription already exists: ${contractId}`);
      return json({ message: "Subscription already processed" });
    }

    // Try to find the tier product by variant ID
    let tierProduct = null;
    if (variantId) {
      const variantIdString = String(variantId);
      tierProduct = await db.tierProduct.findFirst({
        where: {
          shop,
          shopifyVariantId: variantIdString,
        },
        include: {
          tier: true,
        },
      });

      if (!tierProduct) {
        console.warn(`[SubscriptionCreated] No tier product found for variant ${variantIdString}`);
      }
    }

    // If this is a tier product subscription, create TierSubscription
    let tierSubscription = null;
    if (tierProduct && tierProduct.hasSubscription) {
      console.log(`[SubscriptionCreated] Creating tier subscription for tier: ${tierProduct.tier.name}`);

      // Calculate period dates
      const now = new Date();
      const billingInterval = billingPolicy.interval || 'MONTH';
      const intervalCount = billingPolicy.interval_count || 1;

      let periodEnd = new Date(now);
      switch (billingInterval.toUpperCase()) {
        case 'WEEK':
          periodEnd.setDate(periodEnd.getDate() + (intervalCount * 7));
          break;
        case 'MONTH':
          periodEnd.setMonth(periodEnd.getMonth() + intervalCount);
          break;
        case 'YEAR':
          periodEnd.setFullYear(periodEnd.getFullYear() + intervalCount);
          break;
        default:
          // Default to monthly if unknown interval
          periodEnd.setMonth(periodEnd.getMonth() + 1);
          break;
      }

      // Map Shopify billing interval to our enum
      const mappedInterval = mapBillingInterval(billingInterval);

      tierSubscription = await db.tierSubscription.create({
        data: {
          id: crypto.randomUUID(),
          shop,
          customerId: customer.id,
          tierId: tierProduct.tierId,
          tierProductId: tierProduct.id,

          // Shopify Integration
          subscriptionContractId: contractId,
          sellingPlanId: String(sellingPlanId || ''),
          sellingPlanGroupId: tierProduct.sellingPlanGroupId || '',
          productVariantId: String(variantId),

          // Subscription Details
          status: mapSubscriptionStatus(status) as SubscriptionStatus,
          billingInterval: mappedInterval,
          deliveryInterval: mappedInterval,

          // Pricing
          basePrice: roundToCurrencyPrecision(amount, currency),
          discountPercentage: 0,
          finalPrice: roundToCurrencyPrecision(amount, currency),
          currency,

          // Period Tracking
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          nextBillingDate,
          lastBillingDate: null,

          // Lifecycle
          startedAt: status === 'ACTIVE' ? now : null,

          // Metadata
          metadata: {
            webhookData: data,
            lineItem,
            billingPolicy,
            deliveryPolicy: data.delivery_policy,
          },

          createdAt: now,
          updatedAt: now,
        },
      });

      console.log(`[SubscriptionCreated] Created tier subscription:`, {
        id: tierSubscription.id,
        contractId,
        tierId: tierProduct.tierId,
        tierName: tierProduct.tier.name,
        status: tierSubscription.status,
      });

      // If subscription is ACTIVE, update customer's effective tier using resolution system
      if (status === 'ACTIVE') {
        console.log(`[SubscriptionCreated] Resolving effective tier for customer ${customer.email}`);

        const resolutionResult = await updateCustomerToEffectiveTier(
          shop,
          customer.id,
          {
            triggeredBy: 'SUBSCRIPTION_CREATED',
            subscriptionId: tierSubscription.id,
          }
        );

        console.log(`[SubscriptionCreated] Tier resolution result:`, {
          changed: resolutionResult.changed,
          source: resolutionResult.source,
          previousTier: resolutionResult.previousTierId,
          newTier: resolutionResult.newTierId,
        });
      }
    } else {
      // Legacy: Create regular subscription record for non-tier subscriptions
      console.log(`[SubscriptionCreated] Creating legacy subscription (not a tier product)`);

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

      console.log(`[SubscriptionCreated] Created legacy subscription: ${subscription.id}`);
    }

    // Update customer subscription status
    await db.customer.update({
      where: { id: customer.id },
      data: {
        hasActiveSubscription: status === 'ACTIVE',
        subscriptionTier: tierProduct ? tierProduct.tier.name : planName,
        updatedAt: new Date(),
      },
    });

    // Track subscription event
    await db.subscriptionEvent.create({
      data: {
        id: crypto.randomUUID(),
        shop,
        customerId: customer.id,
        subscriptionId: tierSubscription?.id || null,
        eventType: 'CREATED',
        eventData: {
          contractId,
          planName: tierProduct ? tierProduct.tier.name : planName,
          amount,
          currency,
          status,
          isTierSubscription: !!tierProduct,
          tierProductId: tierProduct?.id || null,
        },
        createdAt: new Date(),
      },
    });

    return json({
      success: true,
      tierSubscriptionId: tierSubscription?.id || null,
      isTierProduct: !!tierProduct
    });
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

/**
 * Map Shopify billing interval to our BillingInterval enum
 */
function mapBillingInterval(shopifyInterval: string): BillingInterval {
  const intervalMap: Record<string, BillingInterval> = {
    'WEEK': 'WEEKLY',
    'MONTH': 'MONTHLY',
    'YEAR': 'ANNUAL',
  };

  return intervalMap[shopifyInterval.toUpperCase()] || 'MONTHLY';
}