/**
 * Webhook handler for tier subscription creation
 * Triggered when a new subscription contract is created for a tier product
 *
 * Enhanced with Neural Network Infrastructure:
 * - Correlation ID tracing
 * - Webhook deduplication
 * - Enhanced logging
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { v4 as uuidv4 } from "uuid";
import { updateCustomerToEffectiveTier } from "../services/tier-resolution.server";
import {
  subscriptionLogger,
  withWebhookCorrelation,
} from "../services/subscription/subscription-correlation.server";
import { withWebhookDeduplication } from "../services/subscription/subscription-deduplication.server";
import { SUBSCRIPTION_NEURAL_CONFIG } from "../services/subscription/subscription-neural-config.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "SUBSCRIPTION_CONTRACTS_CREATE") {
    return new Response("Invalid webhook topic", { status: 400 });
  }

  const subscription = payload as any;
  const contractId = subscription.admin_graphql_api_id;

  // Wrap handler with correlation context for tracing
  return withWebhookCorrelation(shop, topic, contractId, async () => {
    // Wrap with deduplication to prevent concurrent processing
    return withWebhookDeduplication(
      shop,
      topic,
      contractId,
      async () => {
        subscriptionLogger.operationStart("webhook:subscription_created", {
          contractId,
          shop,
        });

        try {
          // Extract key information
          const customerId = subscription.customer.admin_graphql_api_id;
          const line = subscription.lines?.[0];

          if (!line) {
            subscriptionLogger.warn("No subscription lines found", { contractId });
            return new Response("OK", { status: 200 });
          }

          // Extract product and variant IDs
          const variantId = line.variant_id;
          const productId = line.product_id;
          const sellingPlanId = line.selling_plan_id;
          const sellingPlanName = line.selling_plan_name;

          // Find the tier product in our database
          const tierProduct = await db.tierProduct.findFirst({
            where: {
              shop,
              OR: [
                { shopifyVariantId: variantId?.toString() },
                { shopifyProductId: productId?.toString() },
              ],
            },
          });

          if (!tierProduct) {
            subscriptionLogger.info("Non-tier product subscription - ignoring", {
              variantId,
              productId,
            });
            return new Response("OK", { status: 200 });
          }

          subscriptionLogger.dbQuery("findFirst", "TierProduct", { found: true });

          // Fetch the related tier
          const tier = await db.tier.findUnique({
            where: { id: tierProduct.tierId },
          });

          if (!tier) {
            subscriptionLogger.error("Tier not found for tier product", new Error(`Tier ${tierProduct.tierId} not found`));
            return new Response("OK", { status: 200 });
          }

          // Find or create customer
          const customerShopifyId = customerId.replace("gid://shopify/Customer/", "");
          let customer = await db.customer.findFirst({
            where: { shop, shopifyCustomerId: customerShopifyId },
          });

          if (!customer) {
            customer = await db.customer.create({
              data: {
                id: uuidv4(),
                shop,
                shopifyCustomerId: customerShopifyId,
                email: subscription.customer.email || "",
                firstName: subscription.customer.first_name || "",
                lastName: subscription.customer.last_name || "",
                storeCredit: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });
            subscriptionLogger.info("Created new customer", { customerId: customer.id });
          }

          // Check if subscription already exists (idempotency)
          const existingSubscription = await db.tierSubscription.findFirst({
            where: { shopifyContractId: contractId },
          });

          if (existingSubscription) {
            subscriptionLogger.idempotencyCheck(contractId, true);
            return new Response("OK", { status: 200 });
          }

          subscriptionLogger.idempotencyCheck(contractId, false);

          // Determine billing interval using neural config
          const billingInterval = determineBillingInterval(sellingPlanName);

          // Create subscription record
          const newSubscription = await db.tierSubscription.create({
            data: {
              id: uuidv4(),
              shop,
              customerId: customer.id,
              tierId: tierProduct.tierId,
              shopifyContractId: contractId,
              sellingPlanId: sellingPlanId || "",
              status: subscription.status || "ACTIVE",
              billingInterval,
              startDate: new Date(subscription.created_at),
              nextBillingDate: subscription.next_billing_date
                ? new Date(subscription.next_billing_date)
                : null,
              currentPrice: parseFloat(line.price || "0"),
              metadata: {
                tierProductId: tierProduct.id,
                productTitle: tier.name + " Tier Membership",
                sku: tierProduct.sku,
                sellingPlanName,
                createdVia: "webhook",
                webhookPayload: subscription,
              },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });

          subscriptionLogger.dbQuery("create", "TierSubscription", {
            id: newSubscription.id,
            status: newSubscription.status,
          });

          // Use tier resolution system for ACTIVE subscriptions
          if (subscription.status === "ACTIVE") {
            const tierUpdateResult = await updateCustomerToEffectiveTier(shop, customer.id, {
              triggeredBy: "subscription_created",
              subscriptionId: newSubscription.id,
            });

            subscriptionLogger.tierResolution({
              changed: tierUpdateResult.changed,
              source: tierUpdateResult.source,
              tierId: tierUpdateResult.newTierId,
            });
          }

          subscriptionLogger.operationComplete("webhook:subscription_created", {
            subscriptionId: newSubscription.id,
            tierId: tier.id,
            tierName: tier.name,
          });

          return new Response("OK", { status: 200 });
        } catch (error) {
          subscriptionLogger.error("Error processing subscription created webhook", error);

          // Log error for monitoring
          try {
            await db.webhookError.create({
              data: {
                id: uuidv4(),
                shop,
                topic: "SUBSCRIPTION_CONTRACTS_CREATE",
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
          subscriptionLogger.info("Duplicate webhook detected - skipping", { contractId });
          return new Response("OK", { status: 200 });
        },
      }
    );
  });
};

/**
 * Determine billing interval from selling plan name
 * Uses centralized configuration patterns
 */
function determineBillingInterval(sellingPlanName: string): "MONTHLY" | "QUARTERLY" | "ANNUAL" {
  const name = sellingPlanName?.toLowerCase() || "";

  // Check patterns from neural config
  const { intervalPatterns } = (SUBSCRIPTION_NEURAL_CONFIG as any).billingDetection || { intervalPatterns: { ANNUAL: ['annual', 'yearly', 'year'], QUARTERLY: ['quarterly', 'quarter', '3 month'] } };

  if (intervalPatterns.ANNUAL.some((p: string) => name.includes(p))) {
    return "ANNUAL";
  } else if (intervalPatterns.QUARTERLY.some((p: string) => name.includes(p))) {
    return "QUARTERLY";
  } else {
    return "MONTHLY";
  }
}
