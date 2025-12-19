/**
 * Webhook handler for tier subscription cancellation
 * Handles when a subscription is cancelled or expires
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { v4 as uuidv4 } from "uuid";
import { updateCustomerToEffectiveTier } from "../services/tier-resolution.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  const isCancelled = topic === "SUBSCRIPTION_CONTRACTS_CANCEL";
  const isExpired = topic === "SUBSCRIPTION_CONTRACTS_EXPIRE";

  if (!isCancelled && !isExpired) {
    return new Response("Invalid webhook topic", { status: 400 });
  }

  console.log(`[TierCancellationWebhook] Processing ${isCancelled ? "cancellation" : "expiration"} for shop: ${shop}`);

  try {
    const subscription = payload as any;
    const contractId = subscription.admin_graphql_api_id;

    // Find subscription in our database
    const dbSubscription = await db.tierSubscription.findFirst({
      where: { shopifyContractId: contractId },
    });

    if (!dbSubscription) {
      console.log(`[TierCancellationWebhook] Subscription not found for contract ${contractId}`);
      return new Response("OK", { status: 200 });
    }

    // Fetch related data separately (use dbSubscription, not subscriptionWithRelations)
    const [customer, tier, tierProduct] = await Promise.all([
      db.customer.findUnique({ where: { id: dbSubscription.customerId } }),
      db.tier.findUnique({ where: { id: dbSubscription.tierId } }),
      dbSubscription.tierProductId ? db.tierProduct.findUnique({ where: { id: dbSubscription.tierProductId } }) : null
    ]);

    // Add related data to subscription object for compatibility
    const subscriptionWithRelations = {
      ...dbSubscription,
      customer,
      tier,
      tierProduct
    };

    const now = new Date();

    // Update subscription status
    await db.tierSubscription.update({
      where: { id: subscriptionWithRelations.id },
      data: {
        status: isCancelled ? "CANCELLED" : "EXPIRED",
        endDate: now,
        metadata: {
          ...(subscriptionWithRelations.metadata as any || {}),
          cancellationReason: subscription.cancellation_reason || "Customer requested",
          cancelledAt: now.toISOString(),
          cancelledBy: subscription.cancelled_by || "customer",
        },
        updatedAt: now,
      },
    });

    // Use tier resolution to determine effective tier after subscription cancellation
    // The resolver handles: other active subscriptions, tier purchases, and spending-based tiers
    const result = await updateCustomerToEffectiveTier(shop, subscriptionWithRelations.customerId, {
      triggeredBy: isCancelled ? 'subscription_cancelled' : 'subscription_expired',
      subscriptionId: subscriptionWithRelations.id
    });

    if (result.changed) {
      console.log(`[TierCancellationWebhook] Customer ${subscriptionWithRelations.customerId} tier changed from ${result.previousTierId} to ${result.newTierId} (source: ${result.source})`);
    } else {
      console.log(`[TierCancellationWebhook] Customer ${subscriptionWithRelations.customerId} tier unchanged (source: ${result.source})`);
    }

    // Check if this was a trial that ended
    if (subscription.trial_end_date && new Date(subscription.trial_end_date) <= now) {
      console.log(`[TierCancellationWebhook] Trial period ended for subscription ${subscriptionWithRelations.id}`);
      
      // You could send a notification here to encourage conversion
    }

    console.log(`[TierCancellationWebhook] Successfully processed ${isCancelled ? "cancellation" : "expiration"} for subscription ${subscriptionWithRelations.id}`);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[TierCancellationWebhook] Error processing webhook:", error);
    
    // Log error
    try {
      await db.webhookError.create({
        data: {
          id: uuidv4(),
          shop,
          topic,
          orderId: payload?.admin_graphql_api_id || "unknown",
          error: error instanceof Error ? error.message : "Unknown error",
          payload,
          createdAt: new Date(),
        },
      });
    } catch (logError) {
      console.error("[TierCancellationWebhook] Failed to log error:", logError);
    }
    
    return new Response("Internal Server Error", { status: 500 });
  }
};