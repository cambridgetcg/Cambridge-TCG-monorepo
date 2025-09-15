/**
 * Customer-facing subscription API endpoint
 * Accessed through Shopify App Proxy for customer subscription management
 * URL: /apps/rewardspro/subscription
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticate } from "~/shopify.server";
import crypto from "crypto";

/**
 * Verify HMAC signature from Shopify App Proxy
 */
function verifyProxySignature(request: Request): boolean {
  const url = new URL(request.url);
  const params = url.searchParams;
  const signature = params.get("signature");
  
  if (!signature) return false;

  // Remove signature from params for verification
  params.delete("signature");
  
  // Sort parameters and create query string
  const sortedParams = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("");

  // Calculate HMAC
  const secret = process.env.SHOPIFY_API_SECRET || "";
  const hash = crypto
    .createHmac("sha256", secret)
    .update(sortedParams)
    .digest("hex");

  return hash === signature;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Verify proxy signature
  if (!verifyProxySignature(request)) {
    return json({ error: "Invalid signature" }, { status: 401 });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const customerId = url.searchParams.get("logged_in_customer_id");

  if (!shop || !customerId) {
    return json({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    // Find customer by Shopify ID
    const customer = await db.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId: customerId,
      },
      include: {
        currentTier: true,
      },
    });

    if (!customer) {
      return json({
        hasSubscription: false,
        message: "No customer record found",
      });
    }

    // Get active subscription if exists
    if (customer.currentSubscriptionId) {
      const subscription = await db.tierSubscription.findUnique({
        where: { id: customer.currentSubscriptionId },
        include: {
          tier: true,
          billingAttempts: {
            where: { status: 'SUCCESS' },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });

      if (subscription) {
        return json({
          hasSubscription: true,
          subscription: {
            id: subscription.id,
            status: subscription.status,
            tierName: subscription.tier.name,
            billingInterval: subscription.billingInterval,
            monthlyPrice: subscription.monthlyPrice?.toNumber() || 0,
            discountPercentage: subscription.discountPercentage?.toNumber() || 0,
            nextBillingDate: subscription.nextBillingDate?.toISOString(),
            currentPeriodStart: subscription.currentPeriodStart?.toISOString(),
            currentPeriodEnd: subscription.currentPeriodEnd?.toISOString(),
            activatedAt: subscription.activatedAt?.toISOString(),
            pausedAt: subscription.pausedAt?.toISOString(),
            cancelledAt: subscription.cancelledAt?.toISOString(),
            billingHistory: subscription.billingAttempts.map(attempt => ({
              date: attempt.billingDate.toISOString(),
              amount: attempt.amount.toNumber(),
              currency: attempt.currency,
            })),
          },
          customer: {
            email: customer.email,
            firstName: customer.firstName,
            lastName: customer.lastName,
            currentTier: customer.currentTier?.name,
            storeCredit: customer.storeCredit.toNumber(),
          },
        });
      }
    }

    // No active subscription
    return json({
      hasSubscription: false,
      customer: {
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        currentTier: customer.currentTier?.name,
        storeCredit: customer.storeCredit.toNumber(),
      },
      availableTiers: await getAvailableSubscriptionTiers(shop),
    });
  } catch (error: any) {
    console.error('Error fetching subscription:', error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Verify proxy signature
  if (!verifyProxySignature(request)) {
    return json({ error: "Invalid signature" }, { status: 401 });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const customerId = url.searchParams.get("logged_in_customer_id");

  if (!shop || !customerId) {
    return json({ error: "Missing required parameters" }, { status: 400 });
  }

  const formData = await request.formData();
  const action = formData.get("action");

  try {
    // Find customer
    const customer = await db.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId: customerId,
      },
    });

    if (!customer || !customer.currentSubscriptionId) {
      return json({ error: "No active subscription found" }, { status: 404 });
    }

    const subscription = await db.tierSubscription.findUnique({
      where: { id: customer.currentSubscriptionId },
    });

    if (!subscription) {
      return json({ error: "Subscription not found" }, { status: 404 });
    }

    switch (action) {
      case "pause":
        // Customer-initiated pause
        if (subscription.status !== 'ACTIVE') {
          return json({ error: "Subscription is not active" }, { status: 400 });
        }

        await db.tierSubscription.update({
          where: { id: subscription.id },
          data: {
            status: 'PAUSED',
            pausedAt: new Date(),
            updatedAt: new Date(),
            metadata: {
              ...subscription.metadata as any,
              pausedBy: 'customer',
              pausedReason: formData.get("reason") || "Customer requested pause",
            },
          },
        });

        return json({
          success: true,
          message: "Subscription paused successfully",
        });

      case "resume":
        // Customer-initiated resume
        if (subscription.status !== 'PAUSED') {
          return json({ error: "Subscription is not paused" }, { status: 400 });
        }

        await db.tierSubscription.update({
          where: { id: subscription.id },
          data: {
            status: 'ACTIVE',
            pausedAt: null,
            updatedAt: new Date(),
            metadata: {
              ...subscription.metadata as any,
              resumedBy: 'customer',
              resumedAt: new Date().toISOString(),
            },
          },
        });

        return json({
          success: true,
          message: "Subscription resumed successfully",
        });

      case "cancel":
        // Customer-initiated cancellation
        if (subscription.status === 'CANCELLED') {
          return json({ error: "Subscription is already cancelled" }, { status: 400 });
        }

        const cancellationReason = formData.get("reason") as string;

        await db.tierSubscription.update({
          where: { id: subscription.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancellationReason: cancellationReason || "Customer requested cancellation",
            updatedAt: new Date(),
            metadata: {
              ...subscription.metadata as any,
              cancelledBy: 'customer',
            },
          },
        });

        // Remove subscription from customer
        await db.customer.update({
          where: { id: customer.id },
          data: {
            currentSubscriptionId: null,
            updatedAt: new Date(),
          },
        });

        // Log tier change
        await db.tierChangeLog.create({
          data: {
            id: crypto.randomUUID(),
            customerId: customer.id,
            shop,
            fromTierId: subscription.tierId,
            toTierId: null,
            changeType: 'DOWNGRADE',
            triggerType: 'SUBSCRIPTION_CANCELLED',
            subscriptionId: subscription.id,
            metadata: {
              cancellationReason,
              cancelledBy: 'customer',
            },
            createdAt: new Date(),
          },
        });

        return json({
          success: true,
          message: "Subscription cancelled successfully",
        });

      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error processing subscription action:', error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};

async function getAvailableSubscriptionTiers(shop: string) {
  const tiers = await db.tier.findMany({
    where: {
      shop,
      monthlyPrice: { not: null },
    },
    orderBy: { minSpend: 'asc' },
  });

  return tiers.map(tier => ({
    id: tier.id,
    name: tier.name,
    minSpend: tier.minSpend,
    cashbackPercent: tier.cashbackPercent,
    monthlyPrice: tier.monthlyPrice?.toNumber() || 0,
    features: [
      `${tier.cashbackPercent}% cashback on all purchases`,
      tier.evaluationPeriod === 'ANNUAL' 
        ? 'Annual spending evaluation' 
        : 'Lifetime spending tracking',
      'Priority customer support',
      'Exclusive member benefits',
    ],
  }));
}