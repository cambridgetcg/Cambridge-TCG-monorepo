/**
 * Webhook handler for tier subscription creation
 * Triggered when a new subscription contract is created for a tier product
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { v4 as uuidv4 } from "uuid";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "SUBSCRIPTION_CONTRACTS_CREATE") {
    return new Response("Invalid webhook topic", { status: 400 });
  }

  console.log(`[TierSubscriptionWebhook] Processing subscription created for shop: ${shop}`);

  try {
    const subscription = payload as any;
    
    // Extract key information
    const contractId = subscription.admin_graphql_api_id;
    const customerId = subscription.customer.admin_graphql_api_id;
    const line = subscription.lines?.[0]; // Assuming single product subscription
    
    if (!line) {
      console.log("[TierSubscriptionWebhook] No subscription lines found");
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
      console.log(`[TierSubscriptionWebhook] Tier product not found for variant ${variantId}`);
      return new Response("OK", { status: 200 });
    }

    // Fetch the related tier separately
    const tier = await db.tier.findUnique({
      where: { id: tierProduct.tierId }
    });

    if (!tier) {
      console.log(`[TierSubscriptionWebhook] Tier not found for tier product ${tierProduct.id}`);
      return new Response("OK", { status: 200 });
    }

    // Find or create customer
    const customerShopifyId = customerId.replace("gid://shopify/Customer/", "");
    let customer = await db.customer.findFirst({
      where: { shop, shopifyCustomerId: customerShopifyId },
    });

    if (!customer) {
      // Create customer if they don't exist
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
      console.log(`[TierSubscriptionWebhook] Created new customer ${customer.id}`);
    }

    // Check if subscription already exists (idempotency)
    const existingSubscription = await db.tierSubscription.findFirst({
      where: { shopifyContractId: contractId },
    });

    if (existingSubscription) {
      console.log("[TierSubscriptionWebhook] Subscription already exists");
      return new Response("OK", { status: 200 });
    }

    // Determine billing interval from selling plan name
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
          originalContractData: subscription,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Update customer with current tier if subscription is active
    if (subscription.status === "ACTIVE") {
      await db.customer.update({
        where: { id: customer.id },
        data: {
          currentTierId: tierProduct.tierId,
          updatedAt: new Date(),
        },
      });

      // Log tier change
      await db.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId: customer.id,
          shop,
          fromTierId: customer.currentTierId,
          toTierId: tierProduct.tierId,
          fromTierName: null,
          toTierName: tier.name,
          changeType: customer.currentTierId ? "UPGRADE" : "INITIAL_ASSIGNMENT",
          triggerType: "SUBSCRIPTION_CREATED",
          subscriptionId: newSubscription.id,
          metadata: {
            contractId,
            sellingPlanId,
            sellingPlanName,
            billingInterval,
          },
          createdAt: new Date(),
        },
      });
    }

    console.log(`[TierSubscriptionWebhook] Successfully created subscription ${newSubscription.id}`);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[TierSubscriptionWebhook] Error processing webhook:", error);
    
    // Log error for monitoring
    try {
      await db.webhookError.create({
        data: {
          id: uuidv4(),
          shop,
          topic: "SUBSCRIPTION_CONTRACTS_CREATE",
          orderId: payload?.admin_graphql_api_id || "unknown",
          error: error instanceof Error ? error.message : "Unknown error",
          payload,
          createdAt: new Date(),
        },
      });
    } catch (logError) {
      console.error("[TierSubscriptionWebhook] Failed to log error:", logError);
    }
    
    return new Response("Internal Server Error", { status: 500 });
  }
};

/**
 * Determine billing interval from selling plan name
 */
function determineBillingInterval(sellingPlanName: string): "MONTHLY" | "QUARTERLY" | "ANNUAL" {
  const name = sellingPlanName?.toLowerCase() || "";
  
  if (name.includes("annual") || name.includes("year")) {
    return "ANNUAL";
  } else if (name.includes("quarter") || name.includes("3 month")) {
    return "QUARTERLY";
  } else {
    return "MONTHLY";
  }
}