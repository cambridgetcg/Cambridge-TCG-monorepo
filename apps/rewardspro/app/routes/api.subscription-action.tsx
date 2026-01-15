/**
 * Subscription Action API
 *
 * Handles customer-initiated subscription actions:
 * - Pause, Resume, Cancel, Skip
 *
 * SECURITY: Implements rate limiting and cooldown periods to prevent abuse
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/db.server";
import { authenticate } from "~/shopify.server";
import { pauseCustomerSubscription, resumeCustomerSubscription, cancelCustomerSubscription } from "~/services/subscription/subscription-contract.server";
import { TierSubscriptionBridgeV2 } from "~/services/subscription/tier-subscription-bridge.server";

// SECURITY: Rate limiting and cooldown configuration
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour window
const MAX_ACTIONS_PER_WINDOW = 10; // Max 10 actions per hour per subscription
const COOLDOWN_PERIOD_MS = 5 * 60 * 1000; // 5 minute cooldown between same action type

/**
 * Check if the subscription action is rate limited or in cooldown
 */
async function checkRateLimitAndCooldown(
  shop: string,
  subscriptionId: string,
  actionType: string
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
  const cooldownStart = new Date(now.getTime() - COOLDOWN_PERIOD_MS);

  // Count recent actions for this subscription
  const recentActions = await db.subscriptionEvent.count({
    where: {
      subscriptionId,
      createdAt: { gte: windowStart },
    },
  });

  if (recentActions >= MAX_ACTIONS_PER_WINDOW) {
    return {
      allowed: false,
      reason: `Rate limit exceeded. Maximum ${MAX_ACTIONS_PER_WINDOW} actions per hour.`,
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
    };
  }

  // Check cooldown for same action type (prevent rapid toggle)
  const lastSameAction = await db.subscriptionEvent.findFirst({
    where: {
      subscriptionId,
      eventType: actionType.toUpperCase(),
      createdAt: { gte: cooldownStart },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (lastSameAction) {
    const cooldownRemaining = COOLDOWN_PERIOD_MS - (now.getTime() - lastSameAction.createdAt.getTime());
    return {
      allowed: false,
      reason: `Please wait ${Math.ceil(cooldownRemaining / 1000)} seconds before performing this action again.`,
      retryAfter: Math.ceil(cooldownRemaining / 1000),
    };
  }

  return { allowed: true };
}

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

    // SECURITY: Check rate limiting and cooldown before processing
    const rateLimitCheck = await checkRateLimitAndCooldown(shop, subscriptionId, action);
    if (!rateLimitCheck.allowed) {
      console.warn(`[SubscriptionAction] Rate limited: ${shop}/${subscriptionId}/${action}`);
      return json(
        {
          error: rateLimitCheck.reason,
          code: "RATE_LIMITED",
          retryAfter: rateLimitCheck.retryAfter,
        },
        {
          status: 429,
          headers: rateLimitCheck.retryAfter
            ? { 'Retry-After': String(rateLimitCheck.retryAfter) }
            : undefined,
        }
      );
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
            // Use state machine for tier subscriptions to ensure proper validation and tier resolution
            await TierSubscriptionBridgeV2.handleStatusChange({
              shop,
              subscriptionId,
              newStatus: 'PAUSED',
              reason: 'Customer requested pause',
              metadata: { source: 'customer_portal' }
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
            // Use state machine for tier subscriptions to ensure proper validation and tier resolution
            await TierSubscriptionBridgeV2.handleStatusChange({
              shop,
              subscriptionId,
              newStatus: 'ACTIVE',
              reason: 'Customer requested resume',
              metadata: { source: 'customer_portal', resumedAt: new Date().toISOString() }
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

            // Update customer subscription status for app subscriptions
            await db.customer.update({
              where: { id: customer.id },
              data: {
                hasActiveSubscription: false,
                subscriptionTier: null,
                updatedAt: new Date(),
              },
            });
          } else {
            // Use state machine for tier subscriptions to ensure proper validation and tier resolution
            // This will handle the customer tier update automatically via tier resolution
            await TierSubscriptionBridgeV2.handleStatusChange({
              shop,
              subscriptionId,
              newStatus: 'CANCELLED',
              reason: reason || 'Customer requested cancellation',
              metadata: { source: 'customer_portal' }
            });
          }
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