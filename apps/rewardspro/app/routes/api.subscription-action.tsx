/**
 * Subscription Action API
 * 
 * Handles customer-initiated subscription actions:
 * - Pause, Resume, Cancel, Skip
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/db.server";
import { authenticate } from "~/shopify.server";
import { pauseCustomerSubscription, resumeCustomerSubscription, cancelCustomerSubscription } from "~/services/subscription-contract.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    // Verify the request is from our extension
    const { session, admin } = await authenticate.public.appProxy(request);
    const shop = session?.shop;

    if (!session || !shop) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await request.json();
    const { action, subscriptionId, customerId: shopifyCustomerId, reason } = data;

    if (!action || !subscriptionId || !shopifyCustomerId) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify the customer owns this subscription
    const customer = await db.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId,
      },
    });

    if (!customer) {
      return json({ error: "Customer not found" }, { status: 404 });
    }

    // Find the subscription (check both models)
    let subscription = await db.tierSubscription.findFirst({
      where: {
        id: subscriptionId,
        customerId: customer.id,
        shop,
      },
    });

    let isAppSubscription = false;
    if (!subscription) {
      // Check app-level subscriptions
      const appSub = await db.subscription.findFirst({
        where: {
          id: subscriptionId,
          customerId: customer.id,
          shop,
        },
      });
      
      if (appSub) {
        subscription = appSub;
        isAppSubscription = true;
      }
    }

    if (!subscription) {
      return json({ error: "Subscription not found" }, { status: 404 });
    }

    const contractId = subscription.shopifyContractId || subscription.subscriptionContractId;
    
    if (!contractId) {
      return json({ error: "No Shopify contract associated" }, { status: 400 });
    }

    // Perform the action
    let result;
    switch (action) {
      case 'pause':
        result = await pauseCustomerSubscription(admin, shop, contractId);
        if (result.success) {
          // Update our database
          if (isAppSubscription) {
            await db.subscription.update({
              where: { id: subscriptionId },
              data: {
                status: 'PAUSED',
                pausedAt: new Date(),
                updatedAt: new Date(),
              },
            });
          } else {
            await db.tierSubscription.update({
              where: { id: subscriptionId },
              data: {
                status: 'PAUSED',
                pausedAt: new Date(),
                updatedAt: new Date(),
              },
            });
          }
        }
        break;

      case 'resume':
        result = await resumeCustomerSubscription(admin, shop, contractId);
        if (result.success) {
          // Update our database
          if (isAppSubscription) {
            await db.subscription.update({
              where: { id: subscriptionId },
              data: {
                status: 'ACTIVE',
                pausedAt: null,
                resumedAt: new Date(),
                updatedAt: new Date(),
              },
            });
          } else {
            await db.tierSubscription.update({
              where: { id: subscriptionId },
              data: {
                status: 'ACTIVE',
                pausedAt: null,
                resumedAt: new Date(),
                updatedAt: new Date(),
              },
            });
          }
        }
        break;

      case 'cancel':
        result = await cancelCustomerSubscription(admin, shop, contractId, reason);
        if (result.success) {
          // Update our database
          if (isAppSubscription) {
            await db.subscription.update({
              where: { id: subscriptionId },
              data: {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                cancellationReason: reason,
                updatedAt: new Date(),
              },
            });
          } else {
            await db.tierSubscription.update({
              where: { id: subscriptionId },
              data: {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                cancellationReason: reason,
                updatedAt: new Date(),
              },
            });
          }

          // Update customer subscription status
          await db.customer.update({
            where: { id: customer.id },
            data: {
              hasActiveSubscription: false,
              subscriptionTier: null,
              updatedAt: new Date(),
            },
          });
        }
        break;

      case 'skip':
        // Skip next delivery - this would need a specific GraphQL mutation
        // For now, we'll return a placeholder
        result = {
          success: false,
          errors: ['Skip functionality not yet implemented'],
        };
        break;

      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }

    if (!result.success) {
      return json(
        { error: result.errors?.join(', ') || 'Action failed' },
        { status: 400 }
      );
    }

    // Log the action for analytics
    await db.subscriptionEvent.create({
      data: {
        id: crypto.randomUUID(),
        shop,
        customerId: customer.id,
        subscriptionId,
        eventType: action.toUpperCase(),
        eventData: {
          action,
          reason,
          contractId,
          timestamp: new Date().toISOString(),
        },
        createdAt: new Date(),
      },
    });

    return json({
      success: true,
      action,
      subscriptionId,
    });
  } catch (error) {
    console.error('[SubscriptionAction] Error:', error);
    return json(
      { error: "Failed to perform action" },
      { status: 500 }
    );
  }
}