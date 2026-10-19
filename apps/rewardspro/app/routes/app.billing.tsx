/**
 * Billing Page - Using Shopify App Remix Billing
 * Reads and cancels existing subscriptions. New paid agreements are retired.
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  Modal,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useState } from "react";
import prisma from "../db.server";
import { detectNewSubscription } from "~/utils/billing-success-detection.server";
import { isTestMode } from "~/utils/billing-test-mode.server";
import { getPlanOrderLimit } from "~/constants/billing.constants";
import {
  FREE_PLAN,
  PRO_PLAN,
  PRO_ANNUAL_PLAN,
  MAX_PLAN,
  MAX_ANNUAL_PLAN,
  ULTRA_PLAN,
  ULTRA_ANNUAL_PLAN,
} from "~/constants/plans";
import { PAID_SUBSCRIPTIONS_RETIRED_MESSAGE, PAID_SUBSCRIPTIONS_RETIRED_STATUS, paidSubscriptionsRetiredResult } from "~/constants/commercial-retirement";
import { settingsPath } from "~/navigation/routes";

// Map plan IDs to Shopify plan constants
function getPlanConstant(planId: string): string | undefined {
  const planMap: Record<string, string> = {
    'free': FREE_PLAN,
    'pro': PRO_PLAN,
    'pro-annual': PRO_ANNUAL_PLAN,
    'max': MAX_PLAN,
    'max-annual': MAX_ANNUAL_PLAN,
    'ultra': ULTRA_PLAN,
    'ultra-annual': ULTRA_ANNUAL_PLAN,
  };
  return planMap[planId];
}

// ============================================
// LOADER - Get Current Subscription Status
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing, admin } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  try {
    // Log initial request details
    const url = new URL(request.url);
    console.log('[Billing Loader] ========================================');
    console.log('[Billing Loader] Request received');
    console.log('[Billing Loader] Shop:', session.shop);
    console.log('[Billing Loader] Full URL:', url.toString());
    console.log('[Billing Loader] URL Params:', Object.fromEntries(url.searchParams));
    console.log('[Billing Loader] ========================================');

    // Check actual subscription status with billing.check()
    // Use centralized test mode detection
    const testMode = await isTestMode(session.shop, admin);
    console.log('[Billing Loader] Test mode:', testMode, 'for shop:', session.shop);
    console.log('[Billing Loader] Calling billing.check()...');
    const billingCheck = await billing.check({
      plans: [
        PRO_PLAN,
        PRO_ANNUAL_PLAN,
        MAX_PLAN,
        MAX_ANNUAL_PLAN,
        ULTRA_PLAN,
        ULTRA_ANNUAL_PLAN
      ],
      isTest: testMode,
    });

    console.log('[Billing Loader] billing.check() completed:', {
      hasActivePayment: billingCheck.hasActivePayment,
      subscriptionCount: billingCheck.appSubscriptions.length,
      subscriptions: billingCheck.appSubscriptions.map(s => ({
        id: s.id,
        name: s.name,
        test: s.test
      })),
    });

    // Fetch detailed subscription information via GraphQL
    console.log('[Billing Loader] Fetching detailed subscription via GraphQL...');
    const {
      getSubscriptionDetails,
      getUsageLineItem,
      getRecurringLineItem,
      calculateUsagePercentage,
      isInTrialPeriod,
      getRemainingTrialDays,
    } = await import("~/services/billing/subscription-details.server");

    const subscriptionDetails = await getSubscriptionDetails(admin);
    const detailedSubscription = subscriptionDetails?.currentAppInstallation.activeSubscriptions[0] || null;

    console.log('[Billing Loader] GraphQL subscription details:', {
      hasDetails: !!detailedSubscription,
      name: detailedSubscription?.name,
      status: detailedSubscription?.status,
      trialDays: detailedSubscription?.trialDays,
      createdAt: detailedSubscription?.createdAt,
      currentPeriodEnd: detailedSubscription?.currentPeriodEnd,
      lineItemCount: detailedSubscription?.lineItems?.length,
    });

    // Calculate subscription details server-side
    let subscriptionInfo = null;
    if (detailedSubscription) {
      console.log('[Billing Loader] Calculating subscription details...');

      const usageLineItem = getUsageLineItem(detailedSubscription);
      const recurringLineItem = getRecurringLineItem(detailedSubscription);
      const usagePercentage = calculateUsagePercentage(usageLineItem);
      const inTrialPeriod = isInTrialPeriod(detailedSubscription);
      const remainingTrialDays = getRemainingTrialDays(detailedSubscription);

      console.log('[Billing Loader] Calculated values:', {
        hasUsageLineItem: !!usageLineItem,
        hasRecurringLineItem: !!recurringLineItem,
        usagePercentage,
        inTrialPeriod,
        remainingTrialDays,
      });

      subscriptionInfo = {
        id: detailedSubscription.id,
        name: detailedSubscription.name,
        status: detailedSubscription.status,
        test: detailedSubscription.test,
        trialDays: detailedSubscription.trialDays,
        createdAt: detailedSubscription.createdAt,
        currentPeriodEnd: detailedSubscription.currentPeriodEnd,
        inTrialPeriod,
        remainingTrialDays,
        usagePercentage,
        recurringCharge: recurringLineItem ? {
          interval: recurringLineItem.plan.pricingDetails.__typename === 'AppRecurringPricing'
            ? recurringLineItem.plan.pricingDetails.interval
            : null,
          amount: recurringLineItem.plan.pricingDetails.__typename === 'AppRecurringPricing'
            ? recurringLineItem.plan.pricingDetails.price.amount
            : null,
          currencyCode: recurringLineItem.plan.pricingDetails.__typename === 'AppRecurringPricing'
            ? recurringLineItem.plan.pricingDetails.price.currencyCode
            : null,
          discount: recurringLineItem.plan.pricingDetails.__typename === 'AppRecurringPricing'
            ? recurringLineItem.plan.pricingDetails.discount
            : null,
        } : null,
        usageCharge: usageLineItem ? {
          balanceUsed: usageLineItem.plan.pricingDetails.__typename === 'AppUsagePricing'
            ? usageLineItem.plan.pricingDetails.balanceUsed
            : null,
          cappedAmount: usageLineItem.plan.pricingDetails.__typename === 'AppUsagePricing'
            ? usageLineItem.plan.pricingDetails.cappedAmount
            : null,
          terms: usageLineItem.plan.pricingDetails.__typename === 'AppUsagePricing'
            ? usageLineItem.plan.pricingDetails.terms
            : null,
        } : null,
      };

      console.log('[Billing Loader] Built subscriptionInfo:', {
        id: subscriptionInfo.id,
        name: subscriptionInfo.name,
        inTrialPeriod: subscriptionInfo.inTrialPeriod,
        remainingTrialDays: subscriptionInfo.remainingTrialDays,
        hasRecurringCharge: !!subscriptionInfo.recurringCharge,
        recurringAmount: subscriptionInfo.recurringCharge?.amount,
        hasUsageCharge: !!subscriptionInfo.usageCharge,
        usageCappedAmount: subscriptionInfo.usageCharge?.cappedAmount?.amount,
      });
    }

    // Get URL params to detect return from Shopify
    const returnedFromShopify = url.searchParams.get('success') === 'true';
    const chargeId = url.searchParams.get('charge_id');

    console.log('[Billing Loader] Return detection:', {
      returnedFromShopify,
      hasChargeId: !!chargeId,
      chargeId: chargeId,
    });

    // NEW: If charge_id is present, verify and save subscription
    let subscriptionVerified = false;
    if (chargeId && returnedFromShopify) {
      console.log('[Billing Loader] ========================================');
      console.log('[Billing Loader] 🔐 VERIFYING SUBSCRIPTION VIA CHARGE_ID');
      console.log('[Billing Loader] ========================================');

      const { getSubscriptionByChargeId } = await import("~/services/billing/subscription-details.server");
      const { saveSubscription } = await import("~/services/billing/subscription-persistence.server");

      // Fetch subscription using charge_id for direct verification
      const verifiedSubscription = await getSubscriptionByChargeId(admin, chargeId);

      if (verifiedSubscription) {
        console.log('[Billing Loader] Subscription verification result:', {
          id: verifiedSubscription.id,
          name: verifiedSubscription.name,
          status: verifiedSubscription.status,
          test: verifiedSubscription.test,
        });

        // Check if subscription is ACTIVE
        if (verifiedSubscription.status === 'ACTIVE') {
          console.log('[Billing Loader] ✅ Subscription is ACTIVE - saving to database...');

          try {
            // Save subscription to database
            await saveSubscription(session.shop, verifiedSubscription);
            subscriptionVerified = true;

            console.log('[Billing Loader] ✅ Subscription saved successfully!');

            // Refresh entitlements to unlock features immediately (with retry)
            const { refreshEntitlements } = await import("~/services/entitlements.server");
            let entitlementsRefreshed = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                await refreshEntitlements(session.shop, { force: true });
                entitlementsRefreshed = true;
                console.log('[Billing Loader] ✅ Entitlements refreshed!');
                break;
              } catch (refreshError) {
                console.error(`[Billing Loader] ❌ Entitlements refresh attempt ${attempt}/3 failed:`, refreshError);
                if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt));
              }
            }
            if (!entitlementsRefreshed) {
              console.error('[Billing Loader] ❌ All entitlements refresh attempts failed - features may be delayed');
            }
          } catch (saveError) {
            console.error('[Billing Loader] ❌ Error saving subscription:', saveError);
          }
        } else {
          console.warn('[Billing Loader] ⚠️  Subscription not ACTIVE:', {
            status: verifiedSubscription.status,
            chargeId: chargeId,
          });
        }
      } else {
        console.error('[Billing Loader] ❌ Subscription not found for charge_id:', chargeId);
      }

      console.log('[Billing Loader] ========================================');
    }

    // FALLBACK: If no charge_id but we found an ACTIVE subscription via GraphQL,
    // save it to database (handles case where user navigated back manually)
    if (!subscriptionVerified && detailedSubscription && detailedSubscription.status === 'ACTIVE') {
      console.log('[Billing Loader] ========================================');
      console.log('[Billing Loader] 💾 FALLBACK: Saving active subscription found via GraphQL');
      console.log('[Billing Loader] ========================================');

      const { saveSubscription, getSubscriptionByShop } = await import("~/services/billing/subscription-persistence.server");

      // Check if we already have this subscription in database
      const existingSubscription = await getSubscriptionByShop(session.shop);

      if (!existingSubscription || existingSubscription.shopifySubscriptionId !== detailedSubscription.id) {
        console.log('[Billing Loader] New subscription detected (not in database), saving...');

        try {
          await saveSubscription(session.shop, detailedSubscription);
          subscriptionVerified = true;
          console.log('[Billing Loader] ✅ Subscription saved via fallback method');

          // Refresh entitlements to unlock features immediately (with retry)
          const { refreshEntitlements } = await import("~/services/entitlements.server");
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              await refreshEntitlements(session.shop, { force: true });
              console.log('[Billing Loader] ✅ Entitlements refreshed (fallback)!');
              break;
            } catch (refreshError) {
              console.error(`[Billing Loader] ❌ Entitlements refresh (fallback) attempt ${attempt}/3 failed:`, refreshError);
              if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt));
            }
          }
        } catch (saveError) {
          console.error('[Billing Loader] ❌ Error saving subscription (fallback):', saveError);
        }
      } else {
        console.log('[Billing Loader] Subscription already in database, skipping save');

        // Still refresh entitlements in case they're out of sync
        try {
          const { refreshEntitlements } = await import("~/services/entitlements.server");
          await refreshEntitlements(session.shop);
          console.log('[Billing Loader] ✅ Entitlements refreshed (existing subscription)!');
        } catch (refreshError) {
          console.error('[Billing Loader] ❌ Error refreshing entitlements:', refreshError);
        }
      }

      console.log('[Billing Loader] ========================================');
    }

    // Detect if this is a NEW subscription (just completed)
    // Use subscriptionVerified flag instead of session-based detection
    let justSubscribed = false;
    if (subscriptionVerified) {
      // If we just verified and saved, this is definitely a new subscription
      justSubscribed = true;
      console.log('[Billing Loader] ✅ New subscription detected via charge_id verification or fallback');
    } else if (returnedFromShopify) {
      // Fallback to old detection method if no charge_id
      console.log('[Billing Loader] Calling detectNewSubscription() (fallback)...');
      justSubscribed = await detectNewSubscription(
        session,
        billingCheck,
        returnedFromShopify
      );
    }

    // Detect cancellation (returned from Shopify but no active payment)
    const cancelled = returnedFromShopify && !billingCheck.hasActivePayment && !subscriptionVerified;

    console.log('[Billing Loader] Success/Cancellation detection:', {
      subscriptionVerified,
      justSubscribed,
      cancelled,
      newSubscriptionPlan: justSubscribed ? billingCheck.appSubscriptions[0]?.name : null,
    });

    // Fetch usage metrics for dashboard-style card
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    let usageMetrics = null;
    try {
      const monthlyUsage = await prisma.monthlyOrderUsage.findFirst({
        where: {
          shop: session.shop,
          year: year,
          month: month
        }
      });

      if (monthlyUsage) {
        // Get the LIVE plan limit from the current subscription
        // This ensures we always show the correct limit even if MonthlyOrderUsage hasn't been updated yet
        const currentPlanName = subscriptionInfo?.name || monthlyUsage.planName;
        const actualPlanLimit = getPlanOrderLimit(currentPlanName);

        const daysInMonth = new Date(year, month, 0).getDate();
        const dayOfMonth = now.getDate();
        const daysRemaining = daysInMonth - dayOfMonth;
        const averageDailyOrders = dayOfMonth > 0 ? Math.round(monthlyUsage.orderCount / dayOfMonth) : 0;
        const usagePercentage = actualPlanLimit > 0
          ? Math.min((monthlyUsage.orderCount / actualPlanLimit) * 100, 100)
          : 0;

        console.log('[Billing Loader] Usage metrics calculated:', {
          ordersUsed: monthlyUsage.orderCount,
          cachedLimit: monthlyUsage.planLimit,
          actualLimit: actualPlanLimit,
          planName: currentPlanName,
          usagePercentage: usagePercentage.toFixed(1)
        });

        usageMetrics = {
          ordersUsed: monthlyUsage.orderCount,
          ordersLimit: actualPlanLimit, // Use live plan limit, not cached
          usagePercentage,
          daysRemaining,
          averageDailyOrders
        };
      }
    } catch (error) {
      console.error('[Billing Loader] Error fetching usage metrics:', error);
      // Continue without usage metrics
    }

    const loaderData = {
      hasActivePayment: billingCheck.hasActivePayment,
      appSubscriptions: billingCheck.appSubscriptions,
      oneTimePurchases: billingCheck.oneTimePurchases,
      subscriptionInfo,
      justSubscribed,
      cancelled,
      newSubscriptionPlan: justSubscribed ? billingCheck.appSubscriptions[0]?.name : null,
      shop: session.shop,
      usageMetrics,
    };

    console.log('[Billing Loader] Returning loader data:', {
      hasActivePayment: loaderData.hasActivePayment,
      subscriptionCount: loaderData.appSubscriptions.length,
      hasSubscriptionInfo: !!loaderData.subscriptionInfo,
      justSubscribed: loaderData.justSubscribed,
      cancelled: loaderData.cancelled,
      newSubscriptionPlan: loaderData.newSubscriptionPlan,
    });
    console.log('[Billing Loader] ========================================');

    return json(loaderData);
  } catch (error) {
    console.error("[Billing Loader] Error:", error);
    throw new Response("Failed to load billing information", { status: 500 });
  }
};

// ============================================
// ACTION - Handle Subscription Requests
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const action = formData.get("action") as string;

  // Handle cancel/downgrade to free plan
  if (action === "cancel-subscription") {
    console.log(`[Billing Action] Shop ${session.shop} requesting subscription cancellation (downgrade to Free)`);

    try {
      const { GraphQLBillingService } = await import("~/services/billing/graphql-billing.service");
      const billingService = new GraphQLBillingService(admin);
      const result = await billingService.cancelSubscription(session.shop);

      if (result.success) {
        console.log(`[Billing Action] Successfully cancelled subscription for ${session.shop}`);
        return json({ success: true, cancelled: true });
      } else {
        console.error(`[Billing Action] Failed to cancel subscription:`, result.error);
        return json({ success: false, error: result.error }, { status: 400 });
      }
    } catch (error) {
      console.error(`[Billing Action] Cancel subscription error:`, error);
      return json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to cancel subscription"
      }, { status: 500 });
    }
  }

  // Extract a known public plan ID from an exact subscribe action. Never
  // default a crafted or stale action to a paid plan.
  if (typeof action !== "string" || !action.startsWith("subscribe-")) {
    return json({
      success: false,
      error: "Invalid action"
    }, { status: 400 });
  }
  const planId = action.slice("subscribe-".length);
  const planConstant = getPlanConstant(planId);

  if (!planConstant || planId === "free") {
    return json({
      success: false,
      error: "Unknown paid plan",
    }, { status: 400 });
  }

  return json(paidSubscriptionsRetiredResult(), {
    status: PAID_SUBSCRIPTIONS_RETIRED_STATUS,
  });
};

// ============================================
// COMPONENT - Billing Page UI
// ============================================

export default function BillingPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [showCancellation, setShowCancellation] = useState(false);
  const isSubmitting = navigation.state === "submitting";
  const currentSubscription = data.appSubscriptions[0];
  const currentPlan = data.subscriptionInfo?.name || currentSubscription?.name;
  const hasSubscription = Boolean(data.hasActivePayment || currentSubscription || data.subscriptionInfo);

  function cancelSubscription() {
    setShowCancellation(false);
    const form = new FormData();
    form.set("action", "cancel-subscription");
    submit(form, { method: "post" });
  }

  return (
    <Page title="Subscription records" backAction={{ url: settingsPath("billing"), content: "Settings" }}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Banner tone="info"><Text as="p">{PAID_SUBSCRIPTIONS_RETIRED_MESSAGE}</Text></Banner>
            {actionData && !(actionData as any).success && (actionData as any).error && (
              <Banner tone="critical"><Text as="p">{(actionData as any).error}</Text></Banner>
            )}
            {(actionData as any)?.success && (actionData as any)?.cancelled && (
              <Banner tone="success"><Text as="p">Shopify confirmed cancellation. Your existing records remain available.</Text></Banner>
            )}
            {data.justSubscribed && data.newSubscriptionPlan && (
              <Banner tone="info"><Text as="p">An existing Shopify agreement was reconciled: {data.newSubscriptionPlan}.</Text></Banner>
            )}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">{currentPlan || "No active paid subscription found"}</Text>
                <Text as="p">Existing agreements keep their recorded terms. Retiring new subscriptions does not cancel an agreement or rewrite its entitlements.</Text>
                {hasSubscription && (
                  <Button tone="critical" onClick={() => setShowCancellation(true)} loading={isSubmitting}>Cancel existing subscription</Button>
                )}
                <Text as="p">For invoice, cancellation or refund questions, contact contact@rewardspro.io.</Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
      <Modal open={showCancellation} onClose={() => setShowCancellation(false)} title="Cancel existing subscription?"
        primaryAction={{ content: "Cancel subscription", destructive: true, onAction: cancelSubscription, loading: isSubmitting }}
        secondaryActions={[{ content: "Keep subscription", onAction: () => setShowCancellation(false) }]}>
        <Modal.Section><Text as="p">This requests cancellation through Shopify. Your loyalty configuration, balances and history remain available. Any refund or final invoice follows the existing agreement.</Text></Modal.Section>
      </Modal>
    </Page>
  );
}
