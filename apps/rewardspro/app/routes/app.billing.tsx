/**
 * Billing Page - Using Shopify App Remix Billing
 * Handles plan selection and subscription management with billing.request()
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, useNavigation } from "@remix-run/react";
import { StaggerChildren, PageLoader, usePageAnimation } from "~/components/PageAnimation";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  Badge,
  Box,
  Divider,
  Icon,
  ButtonGroup,
  Modal,
  Frame,
} from "@shopify/polaris";
import { CheckCircleIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { useState, useEffect } from "react";
import db from "../db.server";
import {
  getAllPlans,
} from "~/services/billing/plan-subscription.server";
import { detectNewSubscription } from "~/utils/billing-success-detection.server";
import { isTestMode } from "~/utils/billing-test-mode.server";
import { getPlanOrderLimit } from "~/constants/billing.constants";
import { checkTrialEligibility } from "~/services/billing/trial-eligibility.server";
import {
  FREE_PLAN,
  PRO_PLAN,
  PRO_ANNUAL_PLAN,
  MAX_PLAN,
  MAX_ANNUAL_PLAN,
  ULTRA_PLAN,
  ULTRA_ANNUAL_PLAN,
} from "~/constants/plans";

// Map plan IDs to Shopify plan constants
function getPlanConstant(planId: string): string {
  const planMap: Record<string, string> = {
    'free': FREE_PLAN,
    'pro': PRO_PLAN,
    'pro-annual': PRO_ANNUAL_PLAN,
    'max': MAX_PLAN,
    'max-annual': MAX_ANNUAL_PLAN,
    'ultra': ULTRA_PLAN,
    'ultra-annual': ULTRA_ANNUAL_PLAN,
  };
  return planMap[planId] || PRO_PLAN;
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

            // Refresh entitlements to unlock features immediately
            const { refreshEntitlements } = await import("~/services/entitlements.server");
            await refreshEntitlements(session.shop);
            console.log('[Billing Loader] ✅ Entitlements refreshed!');
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

          // Refresh entitlements to unlock features immediately
          const { refreshEntitlements } = await import("~/services/entitlements.server");
          await refreshEntitlements(session.shop);
          console.log('[Billing Loader] ✅ Entitlements refreshed (fallback)!');
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

    // Get all available plans for UI
    const plans = getAllPlans();

    // Fetch usage metrics for dashboard-style card
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    let usageMetrics = null;
    try {
      const monthlyUsage = await db.monthlyOrderUsage.findFirst({
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

    // Check trial eligibility for display purposes
    const trialEligibility = await checkTrialEligibility(session.shop);
    console.log('[Billing Loader] Trial eligibility:', {
      eligible: trialEligibility.eligible,
      reason: trialEligibility.reason,
      hasUsedTrial: trialEligibility.details.hasUsedTrial
    });

    const loaderData = {
      hasActivePayment: billingCheck.hasActivePayment,
      appSubscriptions: billingCheck.appSubscriptions,
      oneTimePurchases: billingCheck.oneTimePurchases,
      subscriptionInfo,
      justSubscribed,
      cancelled,
      newSubscriptionPlan: justSubscribed ? billingCheck.appSubscriptions[0]?.name : null,
      plans,
      shop: session.shop,
      usageMetrics,
      trialEligibility: {
        eligible: trialEligibility.eligible,
        reason: trialEligibility.reason,
        message: trialEligibility.message,
        hasUsedTrial: trialEligibility.details.hasUsedTrial,
        isCurrentlyInTrial: trialEligibility.details.isCurrentlyInTrial,
        trialDaysRemaining: trialEligibility.details.trialDaysRemaining,
      },
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
  const { session, billing, admin } = await authenticate.admin(request);

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

  // Extract plan ID from action (e.g., "subscribe-pro" -> "pro")
  const planId = action?.replace("subscribe-", "");

  if (!planId) {
    return json({
      success: false,
      error: "Invalid action"
    }, { status: 400 });
  }

  console.log(`[Billing Action] Shop ${session.shop} requesting ${planId} plan`);

  try {
    // Map plan ID to plan constant
    const planConstant = getPlanConstant(planId) as keyof typeof import("../shopify.server");

    console.log(`[Billing Action] Requesting billing for plan: ${planConstant}`);

    // Use centralized test mode detection
    const actionTestMode = await isTestMode(session.shop, admin);
    console.log(`[Billing Action] Test mode: ${actionTestMode} for shop: ${session.shop}`);

    // Use billing.request() - this will automatically redirect to Shopify's confirmation page
    // and then return the user back to the returnUrl after approval
    // Use the API callback route to handle the top-level redirect and re-embed into the app
    await billing.request({
      plan: planConstant,
      isTest: actionTestMode,
      returnUrl: `${process.env.SHOPIFY_APP_URL}/api/billing/callback?success=true&shop=${session.shop}`,
    });

    // billing.request() throws a redirect, so this code won't be reached
    // But TypeScript needs a return statement
    return json({ success: true });
  } catch (error) {
    console.log(`[Billing Action] Caught response from billing.request():`, error);

    // Check if this is a Response object with reauthorize URL (expected Shopify flow)
    if (error instanceof Response) {
      const reauthorizeUrl = error.headers.get('x-shopify-api-request-failure-reauthorize-url');

      if (reauthorizeUrl) {
        console.log(`[Billing Action] Got approval URL from Shopify:`, reauthorizeUrl);

        // Return the URL to the client instead of server-side redirect
        // The client will use App Bridge to break out of iframe and redirect at top level
        return json({
          success: true,
          confirmationUrl: reauthorizeUrl,
        });
      }

      // If it's a Response but no reauthorize URL, return the error
      const status = error.status;
      const statusText = error.statusText;
      return json({
        success: false,
        error: `Billing request failed: ${status} ${statusText}`
      }, { status: status || 500 });
    }

    // Handle other errors (billing.request() throws redirects, not errors for success)
    console.error(`[Billing Action] Unexpected error:`, error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred"
    }, { status: 500 });
  }
};

// ============================================
// COMPONENT - Billing Page UI
// ============================================

export default function BillingPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');

  // Log when component renders with loader data
  useEffect(() => {
    console.log('[Billing Page] Component rendered with loader data:', {
      hasActivePayment: data.hasActivePayment,
      subscriptionCount: data.appSubscriptions.length,
      hasSubscriptionInfo: !!data.subscriptionInfo,
      justSubscribed: data.justSubscribed,
      cancelled: data.cancelled,
      newSubscriptionPlan: data.newSubscriptionPlan,
      subscriptionName: data.subscriptionInfo?.name,
      inTrialPeriod: data.subscriptionInfo?.inTrialPeriod,
      remainingTrialDays: data.subscriptionInfo?.remainingTrialDays,
    });
  }, [data]);

  // Handle redirect to Shopify charge approval page
  useEffect(() => {
    console.log('[Billing Page] useEffect triggered, actionData:', actionData);

    if (actionData?.success && actionData?.confirmationUrl) {
      console.log('[Billing Page] Conditions met, redirecting to:', actionData.confirmationUrl);
      console.log('[Billing Page] window.top exists:', !!window.top);
      console.log('[Billing Page] window.top === window:', window.top === window);

      try {
        // Use top-level navigation to break out of iframe
        // This ensures the Shopify charge approval page loads in the main window
        if (window.top && window.top !== window) {
          console.log('[Billing Page] Attempting top-level redirect (in iframe)');
          window.top.location.href = actionData.confirmationUrl;
        } else {
          console.log('[Billing Page] Attempting standard redirect (not in iframe or top is same)');
          window.location.href = actionData.confirmationUrl;
        }
        console.log('[Billing Page] Redirect command executed');
      } catch (error) {
        console.error('[Billing Page] Redirect failed:', error);
        // If top-level redirect fails (blocked by browser), fallback to window.open
        console.log('[Billing Page] Attempting window.open fallback');
        window.open(actionData.confirmationUrl, '_top');
      }
    } else {
      console.log('[Billing Page] Conditions not met:', {
        hasActionData: !!actionData,
        hasSuccess: actionData?.success,
        hasUrl: !!actionData?.confirmationUrl,
        actionDataKeys: actionData ? Object.keys(actionData) : []
      });
    }
  }, [actionData]);

  const handleSubscribe = (planId: string) => {
    const formData = new FormData();
    formData.set("action", `subscribe-${planId}`);
    submit(formData, { method: "post" });
  };

  // Modal state for downgrade confirmation
  const [showDowngradeModal, setShowDowngradeModal] = useState(false);
  const [pendingDowngrade, setPendingDowngrade] = useState<{ planId: string; planName: string; isFree: boolean } | null>(null);

  const openDowngradeModal = (planId: string, planName: string, isFree: boolean) => {
    setPendingDowngrade({ planId, planName, isFree });
    setShowDowngradeModal(true);
  };

  const handleConfirmDowngrade = () => {
    if (!pendingDowngrade) return;

    setShowDowngradeModal(false);
    const formData = new FormData();

    if (pendingDowngrade.isFree) {
      formData.set("action", "cancel-subscription");
    } else {
      formData.set("action", `subscribe-${pendingDowngrade.planId}`);
    }

    submit(formData, { method: "post" });
    setPendingDowngrade(null);
  };

  // Get current plan - prefer subscriptionInfo (GraphQL) over billing.check()
  // billing.check() can be slow to update after subscription approval
  const currentSubscription = data.appSubscriptions[0];
  const currentPlan = data.subscriptionInfo?.name || currentSubscription?.name;
  const isCurrentPlanActive = data.subscriptionInfo?.status === 'ACTIVE' || data.hasActivePayment;

  // Get detailed subscription data (pre-calculated in loader)
  const subscriptionInfo = data.subscriptionInfo;

  // Define plan UI configurations with both monthly and annual pricing
  // tierLevel: 0 = Free, 1 = Pro, 2 = Max, 3 = Ultra (used for upgrade/downgrade logic)
  // Feature values sourced from plan-limits.ts
  const planCards = [
    {
      id: "free",
      idAnnual: "free",
      name: "Free",
      tierLevel: 0,
      monthlyPrice: "$0",
      annualPrice: "$0",
      annualMonthlyEquivalent: "$0",
      annualSavings: "",
      description: "Get started with the essentials and familiarise with the function",
      features: [
        "50 orders/month",
        "Up to 500 customers",
        "2 tiers, 1 tier product",
        "50 emails/month",
        "Email support"
      ],
      recommended: false,
      isFree: true,
    },
    {
      id: "pro",
      idAnnual: "pro-annual",
      name: "Pro",
      tierLevel: 1,
      monthlyPrice: "$39",
      annualPrice: "$336",
      annualMonthlyEquivalent: "$28",
      annualSavings: "Save $132/year",
      description: "Everything you need to grow your loyalty program",
      features: [
        "7-day free trial",
        "500 orders/month",
        "Up to 5,000 customers",
        "5 tiers, 3 tier products",
        "500 emails/month",
        "$10 per 100 extra orders"
      ],
      recommended: false,
    },
    {
      id: "max",
      idAnnual: "max-annual",
      name: "Max",
      tierLevel: 2,
      monthlyPrice: "$149",
      annualPrice: "$1,296",
      annualMonthlyEquivalent: "$108",
      annualSavings: "Save $492/year",
      description: "For established businesses with advanced needs",
      features: [
        "7-day free trial",
        "2,000 orders/month",
        "Up to 25,000 customers",
        "10 tiers, 10 tier products",
        "2,000 emails/month",
        "$5 per 100 extra orders"
      ],
      recommended: true,
    },
    {
      id: "ultra",
      idAnnual: "ultra-annual",
      name: "Ultra",
      tierLevel: 3,
      monthlyPrice: "$499",
      annualPrice: "$4,296",
      annualMonthlyEquivalent: "$358",
      annualSavings: "Save $1,692/year",
      description: "Unlimited everything for growing enterprises",
      features: [
        "7-day free trial",
        "Unlimited orders",
        "Unlimited customers",
        "Unlimited tiers & products",
        "Unlimited emails",
        "No overage charges"
      ],
      recommended: false,
    },
  ];

  // Determine current plan's tier level
  const getCurrentTierLevel = (): number => {
    if (!currentPlan) return 0; // Free plan
    if (currentPlan.includes('Ultra')) return 3;
    if (currentPlan.includes('Max')) return 2;
    if (currentPlan.includes('Pro')) return 1;
    return 0; // Free plan
  };
  const currentTierLevel = getCurrentTierLevel();

  return (
    <Frame>
      <Page
        title="Choose Your Plan"
        subtitle="Select the perfect plan for your business"
        backAction={{ url: "/app/settings?tab=6", content: "Settings" }}
      >
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {/* Success/Error Banners */}
            {/* Show success banner based on verified subscription data */}
            {data.justSubscribed && data.newSubscriptionPlan && (
              <Banner tone="success">
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">
                    🎉 Subscription Activated!
                  </Text>
                  <Text as="p">
                    You're now subscribed to <strong>{data.newSubscriptionPlan}</strong>.
                    {currentSubscription?.test && ' (Test Mode)'}
                  </Text>
                </BlockStack>
              </Banner>
            )}

            {/* Show cancellation message from loader (billing callback) */}
            {data.cancelled && (
              <Banner tone="info">
                <Text as="p">
                  Subscription was not completed. Your current plan remains active.
                </Text>
              </Banner>
            )}

            {/* Show success message when subscription is cancelled (downgrade to Free) */}
            {actionData?.success && actionData?.cancelled && (
              <Banner tone="success">
                <Text as="p">
                  Your subscription has been cancelled. You are now on the Free plan.
                </Text>
              </Banner>
            )}

            {/* Show errors if billing.request() fails */}
            {actionData && !actionData.success && actionData.error && (
              <Banner tone="critical">
                <p>{actionData.error}</p>
              </Banner>
            )}

            {/* Trial Eligibility Banner */}
            {data.trialEligibility && !data.trialEligibility.eligible && data.trialEligibility.hasUsedTrial && (
              <Banner tone="info">
                <Text as="p">
                  <strong>Free trial already used</strong> - Your store has already used its free trial period.
                  New subscriptions will begin billing immediately.
                </Text>
              </Banner>
            )}

            {/* Billing Interval Toggle */}
            <InlineStack align="end" blockAlign="center">
              <ButtonGroup variant="segmented">
                <Button
                  pressed={billingInterval === 'monthly'}
                  onClick={() => setBillingInterval('monthly')}
                  size="slim"
                >
                  Monthly
                </Button>
                <Button
                  pressed={billingInterval === 'annual'}
                  onClick={() => setBillingInterval('annual')}
                  size="slim"
                >
                  Annual
                </Button>
              </ButtonGroup>
            </InlineStack>

            {/* Plan Comparison Table */}
            <Card>
              <Box padding="600">
                <BlockStack gap="400">
                  <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(4, 1fr)', gap: '0', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e1e3e5' }}>
                    {/* Header Row */}
                    <div style={{ padding: '20px', backgroundColor: '#f6f6f7', borderBottom: '2px solid #e1e3e5' }}>
                      <BlockStack gap="100">
                        <Text as="span" variant="headingMd">Compare Plans</Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {data.trialEligibility?.eligible
                            ? "All paid plans include a 7-day free trial"
                            : "Your free trial has been used - billing starts immediately"
                          }
                        </Text>
                      </BlockStack>
                    </div>
                    {planCards.map((plan) => {
                      const planConstantMonthly = getPlanConstant(plan.id);
                      const planConstantAnnual = getPlanConstant(plan.idAnnual);
                      const isCurrentPlan = currentPlan === planConstantMonthly || currentPlan === planConstantAnnual;
                      const isFree = 'isFree' in plan && plan.isFree;
                      const isFreePlanCurrent = isFree && !data.hasActivePayment && !currentPlan;
                      const showCurrent = isCurrentPlan || isFreePlanCurrent;

                      return (
                        <div key={`c3-head-${plan.id}`} style={{
                          padding: '20px',
                          backgroundColor: plan.recommended ? '#eef6ff' : showCurrent ? '#e8f7ed' : '#f6f6f7',
                          borderBottom: '2px solid #e1e3e5',
                          textAlign: 'center'
                        }}>
                          <BlockStack gap="200" inlineAlign="center">
                            <InlineStack gap="100" align="center">
                              <Text as="span" variant="headingMd">{plan.name}</Text>
                              {showCurrent && <Badge tone="success" size="small">Current</Badge>}
                            </InlineStack>
                            <Text as="p" variant="headingXl">
                              {isFree ? '$0' : billingInterval === 'monthly' ? plan.monthlyPrice : plan.annualMonthlyEquivalent}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {isFree ? 'Free forever' : billingInterval === 'monthly' ? 'per month' : 'per month (annual)'}
                            </Text>
                          </BlockStack>
                        </div>
                      );
                    })}

                    {/* Feature Rows - Values from plan-limits.ts */}
                    {[
                      { label: 'Monthly orders', values: ['50', '500', '2,000', '∞ Unlimited'], icons: ['limit', 'limit', 'limit', 'unlimited'] },
                      { label: 'Customer sync limit', values: ['500', '5,000', '25,000', 'Unlimited'], icons: ['limit', 'limit', 'limit', 'unlimited'] },
                      { label: 'Tiers', values: ['2', '5', '10', 'Unlimited'], icons: ['limit', 'limit', 'limit', 'unlimited'] },
                      { label: 'Tier products', values: ['1', '3', '10', 'Unlimited'], icons: ['limit', 'limit', 'limit', 'unlimited'] },
                      { label: 'Monthly emails', values: ['50', '500', '2,000', 'Unlimited'], icons: ['limit', 'limit', 'limit', 'unlimited'] },
                      { label: 'Campaigns', values: ['1', '5', '25', 'Unlimited'], icons: ['limit', 'limit', 'limit', 'unlimited'] },
                      { label: 'Automation flows', values: ['1', '3', '10', 'Unlimited'], icons: ['limit', 'limit', 'limit', 'unlimited'] },
                      { label: 'Active raffles', values: ['1', '3', '10', 'Unlimited'], icons: ['limit', 'limit', 'limit', 'unlimited'] },
                      { label: 'Active challenges', values: ['1', '5', '15', 'Unlimited'], icons: ['limit', 'limit', 'limit', 'unlimited'] },
                      { label: 'Store credit system', values: ['✓', '✓', '✓', '✓'], icons: ['check', 'check', 'check', 'check'] },
                      { label: 'Advanced analytics', values: ['✓', '✓', '✓', '✓'], icons: ['check', 'check', 'check', 'check'] },
                      { label: 'Support', values: ['Email', 'Priority', 'Phone', 'Dedicated'], icons: ['text', 'text', 'text', 'text'] },
                      {
                        label: 'Free trial',
                        values: data.trialEligibility?.eligible
                          ? ['—', '7 days', '7 days', '7 days']
                          : ['—', 'Used', 'Used', 'Used'],
                        icons: data.trialEligibility?.eligible
                          ? ['x', 'check', 'check', 'check']
                          : ['x', 'x', 'x', 'x']
                      },
                    ].map((row, idx) => (
                      <>
                        <div key={`c3-label-${idx}`} style={{ padding: '14px 20px', backgroundColor: idx % 2 === 0 ? 'white' : '#fafafa', display: 'flex', alignItems: 'center' }}>
                          <Text as="span" variant="bodyMd">{row.label}</Text>
                        </div>
                        {row.values.map((val, i) => (
                          <div key={`c3-val-${idx}-${i}`} style={{
                            padding: '14px 20px',
                            backgroundColor: idx % 2 === 0 ? 'white' : '#fafafa',
                            textAlign: 'center',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                          }}>
                            {row.icons[i] === 'check' && <span style={{ color: '#008060' }}>✓</span>}
                            {row.icons[i] === 'x' && <span style={{ color: '#8c9196' }}>—</span>}
                            {(row.icons[i] === 'text' || row.icons[i] === 'limit' || row.icons[i] === 'unlimited') && (
                              <Text as="span" variant="bodyMd" tone={row.icons[i] === 'unlimited' ? 'success' : undefined}>
                                {val}
                              </Text>
                            )}
                          </div>
                        ))}
                      </>
                    ))}

                    {/* Button Row */}
                    <div style={{ padding: '20px', backgroundColor: '#f6f6f7' }}></div>
                    {planCards.map((plan) => {
                      const planIdToUse = billingInterval === 'annual' ? plan.idAnnual : plan.id;
                      const planConstantMonthly = getPlanConstant(plan.id);
                      const planConstantAnnual = getPlanConstant(plan.idAnnual);
                      const isCurrentPlan = currentPlan === planConstantMonthly || currentPlan === planConstantAnnual;
                      const isFree = 'isFree' in plan && plan.isFree;
                      const isFreePlanCurrent = isFree && !data.hasActivePayment && !currentPlan;

                      return (
                        <div key={`c3-btn-${plan.id}`} style={{ padding: '20px', backgroundColor: '#f6f6f7', textAlign: 'center' }}>
                          {isFree ? (
                            isFreePlanCurrent ? (
                              <Button variant="secondary" disabled>Current Plan</Button>
                            ) : (
                              <Button variant="primary" onClick={() => openDowngradeModal('free', 'Free', true)} loading={isSubmitting}>Downgrade</Button>
                            )
                          ) : (
                            <Button
                              variant={isCurrentPlan ? "secondary" : "primary"}
                              disabled={isCurrentPlan || isSubmitting}
                              loading={isSubmitting}
                              onClick={() => {
                                const isDowngrade = plan.tierLevel < currentTierLevel;
                                if (isDowngrade) {
                                  openDowngradeModal(planIdToUse, plan.name, false);
                                } else {
                                  handleSubscribe(planIdToUse);
                                }
                              }}
                            >
                              {isCurrentPlan ? "Current Plan" : plan.tierLevel > currentTierLevel ? "Upgrade" : "Downgrade"}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </BlockStack>
              </Box>
            </Card>

            {/* FAQ Section */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text as="h3" variant="headingLg">
                    Frequently Asked Questions
                  </Text>

                  <BlockStack gap="300">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        How does billing work?
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        All billing is handled through Shopify. Charges appear on your regular Shopify invoice—the same monthly invoice you already receive for your Shopify subscription. We never charge your card directly; all payments flow through Shopify's secure billing system.
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        What's the difference between monthly and annual billing?
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Annual plans charge the yearly total up front (e.g., Pro Annual is $336/year instead of $39/month) and offer significant savings—up to 28% off. When you switch from monthly to annual or vice versa, Shopify automatically handles proration of your existing subscription. The new billing agreement starts immediately.
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        What are overage/usage charges?
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Pro and Max plans include usage-based billing for orders beyond your monthly limit. Pro: $10 per 100 orders over 500 (capped at $50/month). Max: $5 per 100 orders over 2,000 (capped at $100/month). These charges appear as usage line items on your Shopify invoice. Ultra plan has unlimited orders with no overage charges.
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Can I upgrade or downgrade my plan at any time?
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Yes! Plan changes take effect immediately. Upgrades remove any "plan locked" state instantly and increase your order limit right away. Downgrades or returns to the free plan also apply instantly, though you may be locked again if your current usage exceeds the new limit.
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        What happens when I reach my order limit?
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        When you hit your order limit, your store is automatically locked and the dashboard will prompt you to upgrade. Premium features will be locked or greyed out. Upgrading instantly unlocks your store and raises the limit. Pro and Max plans with usage billing will continue processing orders and charge the overage rate (up to the monthly cap).
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        What happens after I cancel my subscription?
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Cancellation instantly reverts your account to the Free plan with a 100 order/month limit. Your existing configuration (tiers, rewards, etc.) stays intact, but premium features lock or grey out once the free plan limit is reached. No data is lost—you can re-upgrade anytime.
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        What if I cancel my annual plan mid-term?
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Shopify handles annual subscription cancellations automatically. Any prorated refunds or final charges are processed through Shopify Billing. Once cancelled, we receive a webhook and immediately downgrade your account to Free. To ensure billing stops, complete the full cancellation flow in Shopify.
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        What is your refund policy?
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Since all billing is handled through Shopify, any refunds must go through Shopify's billing channels. Contact Shopify Support or reach out to our support team, who can initiate the refund process via Shopify on your behalf.
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        How do I cancel my subscription?
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Visit the Billing page, click "Manage plan," and follow the confirmation flow in Shopify. Make sure to complete all steps in the Shopify confirmation page to ensure billing stops. If you encounter any issues, contact our support team for assistance.
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        I see "shop cannot accept the provided charge" — what does this mean?
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        This message appears when the app is still in development mode and billing hasn't been approved yet. If you're seeing this on a live store, please contact our support team to enable billing for your shop.
                      </Text>
                    </BlockStack>
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Downgrade Confirmation Modal */}
      <Modal
        open={showDowngradeModal}
        onClose={() => {
          setShowDowngradeModal(false);
          setPendingDowngrade(null);
        }}
        title={`Downgrade to ${pendingDowngrade?.planName || ''} Plan`}
        primaryAction={{
          content: "Downgrade",
          destructive: true,
          onAction: handleConfirmDowngrade,
          loading: isSubmitting,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              setShowDowngradeModal(false);
              setPendingDowngrade(null);
            },
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              Are you sure you want to downgrade to the {pendingDowngrade?.planName} plan?
            </Text>
            <Text as="p" tone="subdued">
              {pendingDowngrade?.isFree
                ? "Your current subscription will be cancelled immediately. You will lose access to premium features and be limited to 100 orders per month."
                : "Your current subscription will be changed. You may lose access to some features available in your current plan."}
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
      </Page>
    </Frame>
  );
}
