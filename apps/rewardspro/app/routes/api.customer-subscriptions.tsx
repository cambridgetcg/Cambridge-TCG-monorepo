/**
 * Customer Subscriptions API
 * 
 * Returns subscription data for the customer portal.
 * Maps Shopify customer ID to internal records.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    // Verify the request is from our extension
    const { session } = await authenticate.public.appProxy(request);
    const shop = session?.shop;

    if (!session || !shop) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await request.json();
    const { shopifyCustomerId } = data;

    if (!shopifyCustomerId) {
      return json({ error: "Customer ID required" }, { status: 400 });
    }

    // Map Shopify customer ID to our internal customer
    const customer = await prisma.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId,
      },
    });

    if (!customer) {
      // Customer not found - they may not have any subscriptions
      return json({ subscriptions: [] });
    }

    // Fetch subscriptions from TierSubscription model
    // This is our source of truth for portal data
    const tierSubscriptions = await prisma.tierSubscription.findMany({
      where: {
        customerId: customer.id,
        shop,
      },
      include: {
        tier: true,
        tierProduct: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Also fetch app-level subscriptions if any
    const appSubscriptions = await prisma.subscription.findMany({
      where: {
        customerId: customer.id,
        shop,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Format subscriptions for the portal
    const formattedSubscriptions = [
      ...tierSubscriptions.map(sub => ({
        id: sub.id,
        type: 'tier',
        shopifyContractId: sub.subscriptionContractId,
        planName: sub.tier?.name || 'Subscription',
        tierName: sub.tier?.name,
        status: sub.status,
        amount: sub.finalPrice || sub.basePrice,
        currency: sub.currency,
        billingInterval: sub.billingInterval,
        billingIntervalCount: 1,
        nextBillingDate: sub.nextBillingDate,
        lastBillingDate: sub.lastBillingDate,
        pausedAt: sub.pausedAt,
        cancelledAt: sub.cancelledAt,
        trialEndsAt: sub.trialEndsAt,
        features: sub.tier?.features || [],
        lastPaymentStatus: null, // Would need to check billing attempts
        failedPaymentCount: 0,
      })),
      ...appSubscriptions.map(sub => ({
        id: sub.id,
        type: 'app',
        shopifyContractId: sub.shopifyContractId,
        planName: sub.planName,
        tierName: null,
        status: sub.status,
        amount: sub.amount,
        currency: sub.currency,
        billingInterval: sub.billingInterval,
        billingIntervalCount: sub.billingIntervalCount,
        nextBillingDate: sub.nextBillingDate,
        lastBillingDate: sub.lastBillingDate,
        pausedAt: sub.pausedAt,
        cancelledAt: sub.cancelledAt,
        trialEndsAt: sub.trialEndsAt,
        features: sub.features || [],
        lastPaymentStatus: sub.lastPaymentStatus,
        failedPaymentCount: sub.failedPaymentCount,
      })),
    ];

    return json({
      success: true,
      customerId: customer.id,
      subscriptions: formattedSubscriptions,
    });
  } catch (error) {
    console.error('[CustomerSubscriptions] Error:', error);
    return json(
      { error: "Failed to fetch subscriptions" },
      { status: 500 }
    );
  }
}