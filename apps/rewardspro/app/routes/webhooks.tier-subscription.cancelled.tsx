/**
 * Webhook handler for tier subscription cancellation
 * Handles when a subscription is cancelled or expires
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticate } from "~/shopify.server";
import { v4 as uuidv4 } from "uuid";

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
      include: { 
        customer: true, 
        tier: true,
        tierProduct: true,
      },
    });

    if (!dbSubscription) {
      console.log(`[TierCancellationWebhook] Subscription not found for contract ${contractId}`);
      return new Response("OK", { status: 200 });
    }

    const now = new Date();

    // Update subscription status
    await db.tierSubscription.update({
      where: { id: dbSubscription.id },
      data: {
        status: isCancelled ? "CANCELLED" : "EXPIRED",
        endDate: now,
        metadata: {
          ...(dbSubscription.metadata as any || {}),
          cancellationReason: subscription.cancellation_reason || "Customer requested",
          cancelledAt: now.toISOString(),
          cancelledBy: subscription.cancelled_by || "customer",
        },
        updatedAt: now,
      },
    });

    // Remove customer from tier if they don't have another active subscription
    const otherActiveSubscriptions = await db.tierSubscription.findFirst({
      where: {
        customerId: dbSubscription.customerId,
        status: "ACTIVE",
        id: { not: dbSubscription.id },
      },
    });

    if (!otherActiveSubscriptions) {
      // No other active subscriptions, remove from tier
      await db.customer.update({
        where: { id: dbSubscription.customerId },
        data: {
          currentTierId: null,
          updatedAt: now,
        },
      });

      // Log tier removal
      await db.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId: dbSubscription.customerId,
          shop,
          fromTierId: dbSubscription.tierId,
          toTierId: null,
          fromTierName: dbSubscription.tier.name,
          toTierName: null,
          changeType: "DOWNGRADE",
          triggerType: isCancelled ? "SUBSCRIPTION_CANCELLED" : "SUBSCRIPTION_EXPIRED",
          subscriptionId: dbSubscription.id,
          metadata: {
            cancellationReason: subscription.cancellation_reason,
            cancelledBy: subscription.cancelled_by,
            contractId,
          },
          createdAt: now,
        },
      });

      console.log(`[TierCancellationWebhook] Removed customer ${dbSubscription.customerId} from tier ${dbSubscription.tier.name}`);
    } else {
      console.log(`[TierCancellationWebhook] Customer has other active subscriptions, keeping tier assignment`);
    }

    // Check if this was a trial that ended
    if (subscription.trial_end_date && new Date(subscription.trial_end_date) <= now) {
      console.log(`[TierCancellationWebhook] Trial period ended for subscription ${dbSubscription.id}`);
      
      // You could send a notification here to encourage conversion
    }

    console.log(`[TierCancellationWebhook] Successfully processed ${isCancelled ? "cancellation" : "expiration"} for subscription ${dbSubscription.id}`);
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