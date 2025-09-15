/**
 * Webhook handler for subscription creation
 * Triggered when a new subscription contract is created
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticate } from "~/shopify.server";
import crypto from 'crypto';
const uuidv4 = () => crypto.randomUUID();

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "SUBSCRIPTION_CONTRACTS_CREATE") {
    return new Response("Invalid webhook topic", { status: 400 });
  }

  console.log(`Processing subscription created webhook for shop: ${shop}`);

  try {
    const subscription = payload as any;
    
    // Check if we already have this subscription
    const existingSubscription = await db.tierSubscription.findUnique({
      where: { subscriptionContractId: subscription.admin_graphql_api_id },
    });

    if (existingSubscription) {
      console.log('Subscription already exists, skipping');
      return new Response("OK", { status: 200 });
    }

    // Extract customer and product information
    const customerId = subscription.customer.admin_graphql_api_id;
    const line = subscription.lines[0]; // Assuming single line for tier subscription
    const variantId = line.variant_id;
    const sellingPlanId = line.selling_plan_id;
    const sellingPlanName = line.selling_plan_name;

    // Find customer in our database
    const customer = await db.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId: customerId.replace('gid://shopify/Customer/', ''),
      },
    });

    if (!customer) {
      console.error(`Customer not found: ${customerId}`);
      return new Response("Customer not found", { status: 404 });
    }

    // Determine tier from product variant or selling plan
    // This would need to be extracted from product tags or metadata
    const tierInfo = await extractTierFromVariant(shop, variantId);
    
    if (!tierInfo) {
      console.error(`Could not determine tier from variant: ${variantId}`);
      return new Response("Tier not found", { status: 404 });
    }

    // Determine billing interval from selling plan name
    const billingInterval = determineBillingInterval(sellingPlanName);

    // Create subscription record
    const newSubscription = await db.tierSubscription.create({
      data: {
        id: uuidv4(),
        shop,
        customerId: customer.id,
        tierId: tierInfo.tierId,
        subscriptionContractId: subscription.admin_graphql_api_id,
        sellingPlanId,
        status: subscription.status,
        billingInterval,
        nextBillingDate: subscription.next_billing_date ? new Date(subscription.next_billing_date) : null,
        currentPeriodStart: new Date(subscription.created_at),
        currentPeriodEnd: subscription.next_billing_date ? new Date(subscription.next_billing_date) : null,
        discountPercentage: line.discount_allocations?.[0]?.discount_application?.value?.percentage || 0,
        monthlyPrice: parseFloat(line.price),
        lastBillingAmount: parseFloat(line.price),
        activatedAt: subscription.status === 'ACTIVE' ? new Date() : null,
        metadata: {
          variantId,
          originalPayload: subscription,
        },
        createdAt: new Date(subscription.created_at),
        updatedAt: new Date(subscription.updated_at),
      },
    });

    // Update customer with current subscription
    if (subscription.status === 'ACTIVE') {
      await db.customer.update({
        where: { id: customer.id },
        data: {
          currentSubscriptionId: newSubscription.id,
          currentTierId: tierInfo.tierId,
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
          toTierId: tierInfo.tierId,
          changeType: customer.currentTierId ? 'UPGRADE' : 'INITIAL_ASSIGNMENT',
          triggerType: 'SUBSCRIPTION_CREATED',
          subscriptionId: newSubscription.id,
          metadata: {
            subscriptionContractId: subscription.admin_graphql_api_id,
            billingInterval,
          },
          createdAt: new Date(),
        },
      });
    }

    console.log(`Subscription created successfully: ${newSubscription.id}`);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error('Error processing subscription created webhook:', error);
    return new Response("Internal Server Error", { status: 500 });
  }
};

/**
 * Extract tier information from product variant
 */
async function extractTierFromVariant(shop: string, variantId: string): Promise<{ tierId: string } | null> {
  // This would need to query Shopify for product information
  // and extract tier ID from tags or metafields
  // For now, returning a placeholder
  
  // In production, you would:
  // 1. Query Shopify API for product variant details
  // 2. Check product tags for tier information
  // 3. Or check product/variant metafields
  // 4. Match against tiers in database
  
  const tier = await db.tier.findFirst({
    where: { shop },
    orderBy: { minSpend: 'asc' },
  });

  return tier ? { tierId: tier.id } : null;
}

/**
 * Determine billing interval from selling plan name
 */
function determineBillingInterval(sellingPlanName: string): 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' {
  const name = sellingPlanName.toLowerCase();
  
  if (name.includes('annual') || name.includes('year')) {
    return 'ANNUAL';
  } else if (name.includes('quarter') || name.includes('3 month')) {
    return 'QUARTERLY';
  } else {
    return 'MONTHLY';
  }
}