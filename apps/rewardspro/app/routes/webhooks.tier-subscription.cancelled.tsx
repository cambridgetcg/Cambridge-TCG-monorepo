/**
 * Webhook handler for tier subscription cancellation
 * Handles when a subscription is cancelled or expires
 *
 * Enhanced with Neural Network Infrastructure:
 * - Correlation ID tracing
 * - Webhook deduplication
 * - Unified subscription service with state machine validation
 * - Enhanced logging
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { v4 as uuidv4 } from "uuid";
import { updateCustomerToEffectiveTier } from "../services/tier-resolution.server";
import {
  UnifiedSubscriptionService,
  cancelSubscription,
  changeSubscriptionStatus,
} from "../services/subscription/subscription-unified.server";
import {
  subscriptionLogger,
  withWebhookCorrelation,
} from "../services/subscription/subscription-correlation.server";
import { withWebhookDeduplication } from "../services/subscription/subscription-deduplication.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  const isCancelled = topic === "SUBSCRIPTION_CONTRACTS_CANCEL";
  const isExpired = topic === "SUBSCRIPTION_CONTRACTS_EXPIRE";

  if (!isCancelled && !isExpired) {
    return new Response("Invalid webhook topic", { status: 400 });
  }

  const subscription = payload as any;
  const contractId = subscription.admin_graphql_api_id;

  // Wrap with correlation for tracing
  return withWebhookCorrelation(shop, topic, contractId, async () => {
    // Wrap with deduplication
    return withWebhookDeduplication(
      shop,
      topic,
      contractId,
      async () => {
        subscriptionLogger.operationStart(
          isCancelled ? "webhook:subscription_cancelled" : "webhook:subscription_expired",
          { contractId, shop }
        );

        try {
          // Find subscription using unified service
          const dbSubscription = await UnifiedSubscriptionService.findByContractId(shop, contractId);

          if (!dbSubscription) {
            subscriptionLogger.info("Subscription not found for cancellation", { contractId });
            return new Response("OK", { status: 200 });
          }

          // Use unified service for status change with state machine validation
          const newStatus = isCancelled ? "CANCELLED" : "EXPIRED";
          const reason = subscription.cancellation_reason || (isCancelled ? "Customer requested" : "Subscription expired");

          const statusResult = await changeSubscriptionStatus({
            shop,
            subscriptionId: dbSubscription.id,
            newStatus: newStatus as any,
            reason,
            metadata: {
              cancellationReason: subscription.cancellation_reason,
              cancelledBy: subscription.cancelled_by || "customer",
              shopifyTimestamp: subscription.updated_at,
              webhookTopic: topic,
            },
            skipShopifySync: true, // Webhook is from Shopify, no need to sync back
          });

          if (!statusResult.success) {
            subscriptionLogger.warn("Unified service status change failed", {
              error: statusResult.error,
              subscriptionId: dbSubscription.id,
            });

            // Fallback: update directly (for edge cases where state machine rejects)
            const now = new Date();
            await db.tierSubscription.update({
              where: { id: dbSubscription.id },
              data: {
                status: newStatus,
                endDate: now,
                metadata: {
                  ...(dbSubscription.metadata as object || {}),
                  cancellationReason: subscription.cancellation_reason || reason,
                  cancelledAt: now.toISOString(),
                  cancelledBy: subscription.cancelled_by || "customer",
                  fallbackUpdate: true,
                },
                updatedAt: now,
              },
            });

            subscriptionLogger.dbQuery("update", "TierSubscription", {
              status: newStatus,
              fallback: true,
            });

            // Trigger tier resolution manually
            const result = await updateCustomerToEffectiveTier(shop, dbSubscription.customerId, {
              triggeredBy: isCancelled ? "subscription_cancelled" : "subscription_expired",
              subscriptionId: dbSubscription.id,
            });

            subscriptionLogger.tierResolution({
              changed: result.changed,
              source: result.source,
              tierId: result.newTierId,
            });
          } else {
            subscriptionLogger.stateTransition(
              statusResult.previousStatus || "unknown",
              statusResult.newStatus || newStatus,
              reason
            );

            if (statusResult.tierChanged) {
              subscriptionLogger.info("Tier changed after cancellation", {
                subscriptionId: dbSubscription.id,
              });
            }
          }

          // Check if this was a trial that ended
          if (subscription.trial_end_date && new Date(subscription.trial_end_date) <= new Date()) {
            subscriptionLogger.info("Trial period ended", {
              subscriptionId: dbSubscription.id,
              trialEndDate: subscription.trial_end_date,
            });
          }

          subscriptionLogger.operationComplete(
            isCancelled ? "webhook:subscription_cancelled" : "webhook:subscription_expired",
            {
              subscriptionId: dbSubscription.id,
              previousStatus: statusResult.previousStatus,
              tierChanged: statusResult.tierChanged,
            }
          );

          return new Response("OK", { status: 200 });
        } catch (error) {
          subscriptionLogger.error("Error processing cancellation webhook", error);

          // Log error
          try {
            await db.webhookError.create({
              data: {
                id: uuidv4(),
                shop,
                topic,
                orderId: contractId || "unknown",
                error: error instanceof Error ? error.message : "Unknown error",
                payload,
                createdAt: new Date(),
              },
            });
          } catch (logError) {
            subscriptionLogger.error("Failed to log webhook error", logError);
          }

          return new Response("Internal Server Error", { status: 500 });
        }
      },
      {
        onDuplicate: () => {
          subscriptionLogger.info("Duplicate cancellation webhook - skipping", { contractId });
          return new Response("OK", { status: 200 });
        },
      }
    );
  });
};
