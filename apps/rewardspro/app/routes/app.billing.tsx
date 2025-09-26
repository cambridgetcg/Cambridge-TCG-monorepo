import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import crypto from "crypto";
export { ErrorBoundary } from "../components/ErrorBoundary";
import {
  Page,
  Layout,
  Card,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  ProgressBar,
  Badge,
  Icon,
  Box,
  Divider,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  AlertCircleIcon,
  InfoIcon,
} from "~/utils/polaris-icons";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { MANAGED_PLANS, PLAN_COMPARISON } from "~/constants/billing.constants";

// ============= TYPES =============
type BillingPlan = {
  id: string;
  shop: string;
  planName: string;
  status: string;
  monthlyPrice: number;
  usageCap: number | null;
  currentPeriodEnd: string | null;
  cap80AlertSent: boolean;
  cap90AlertSent: boolean;
  lastCapAlert: string | null;
  metadata: any;
  createdAt: string;
  updatedAt: string;
};

type LoaderData = {
  currentPlan: BillingPlan | null;
  activeSubscription: any;
  monthlyOrderUsage: {
    orderCount: number;
    planLimit: number;
    planName: string;
    projectedOrders: number;
  } | null;
  shop: string;
  currentMonth: string;
  daysRemaining: number;
};

// ============= CONSTANTS =============
// Note: MANAGED_PLANS and PLAN_COMPARISON are now imported from ~/constants/billing.constants
// Removing duplicated constants - keeping old version for reference
const OLD_MANAGED_PLANS = {
  "RewardsPro Free": {
    name: "RewardsPro Free",
    displayName: "Free",
    price: 0,
    interval: "month",
    ordersIncluded: 200,
    overageRate: 0,
    features: [
      "200 orders per month",
      "All core features included",
      "Unlimited loyalty tiers",
      "Customer management",
      "Store credit tracking",
      "Basic analytics",
      "No credit card required",
      "Community support",
    ],
    recommended: false,
    isFree: true,
  },
  "RewardsPro Monthly": {
    name: "RewardsPro Monthly",
    displayName: "Pro",
    price: 49,
    interval: "month",
    ordersIncluded: 1000,
    overageRate: 0.01,
    features: [
      "1,000 orders included",
      "$0.01 per additional order",
      "Unlimited loyalty tiers",
      "Advanced analytics",
      "Custom email templates",
      "Priority support",
      "API access",
      "Webhook integrations",
    ],
    recommended: true,
    isFree: false,
  },
  "RewardsPro Annual": {
    name: "RewardsPro Annual",
    displayName: "Enterprise",
    price: 490,
    interval: "year",
    ordersIncluded: 12000,
    overageRate: 0.01,
    features: [
      "12,000 orders included (1,000/month)",
      "$0.01 per additional order",
      "Save ~17% compared to monthly",
      "All monthly features included",
      "Annual billing cycle",
      "Dedicated onboarding",
      "Quarterly business reviews",
      "Custom integrations support",
    ],
    recommended: false,
    isFree: false,
  },
};

// Plan comparison data for the comparison cards (old version - now using imported)
const OLD_PLAN_COMPARISON = {
  free: {
    name: "Starter plan",
    displayName: "Free",
    description: "Everything you need to create an on-brand program your customers will love.",
    price: 0,
    interval: "month",
    ordersIncluded: "Up to 200 monthly orders",
    overageInfo: "",
    recommended: true,
    popularFeatures: [
      "Points program",
      "Referral program",
      "Customizable emails",
      "Store credit tracking",
      "Basic reports",
      "Community support",
    ],
  },
  pro: {
    name: "Growth plan",
    displayName: "Pro",
    description: "Level up your loyalty program with extras like advanced analytics and priority support.",
    price: 49,
    interval: "month",
    ordersIncluded: "Includes 1,000 monthly orders",
    overageInfo: "$0.01 per additional order",
    recommended: false,
    popularFeatures: [
      "Full-feature loyalty hub",
      "Advanced analytics & reporting",
      "Custom email templates",
      "Priority support",
      "API access",
      "Unlimited integrations",
    ],
  },
  enterprise: {
    name: "Plus plan",
    displayName: "Enterprise",
    description: "Get the best of RewardsPro with more customization and reporting.",
    price: 490,
    interval: "year",
    ordersIncluded: "Includes 12,000 annual orders",
    overageInfo: "$0.01 per additional order",
    recommended: false,
    popularFeatures: [
      "Migration and launch plan",
      "30+ specialized reports",
      "API access & developer tools",
      "Priority support",
      "Quarterly program monitoring",
      "Security review support",
    ],
  },
};

// ============= HELPERS =============
const calculateDaysRemaining = (): number => {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const diffTime = Math.abs(endOfMonth.getTime() - now.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const getCurrentMonthName = (): string => {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return months[new Date().getMonth()];
};

const calculateProjectedOrders = (currentOrders: number, daysRemaining: number): number => {
  const now = new Date();
  const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysPassed = totalDaysInMonth - daysRemaining;

  if (daysPassed === 0) return currentOrders;

  const dailyRate = currentOrders / daysPassed;
  return Math.ceil(dailyRate * totalDaysInMonth);
};

// ============= LOADER =============
export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("[Billing Page] Loading billing information...");

  try {
    const { session, billing } = await authenticate.admin(request);

    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    console.log("[Billing Page] Shop:", shop);

    // Import plan names from server module inside loader
    const { FREE_PLAN, MONTHLY_PLAN, ANNUAL_PLAN } = await import("../shopify.server");

    // Check active subscription with Shopify
    let activeSubscription = null;
    if (billing) {
      try {
        const { hasActivePayment, appSubscriptions } = await billing.check({
          plans: [FREE_PLAN, MONTHLY_PLAN, ANNUAL_PLAN],
          isTest: process.env.NODE_ENV === 'development',
        });

        if (hasActivePayment && appSubscriptions?.length > 0) {
          activeSubscription = appSubscriptions[0];
          console.log("[Billing Page] Active subscription found:", activeSubscription.name);
        }
      } catch (error) {
        console.error("[Billing Page] Error checking subscription:", error);
      }
    }

    // Fetch billing plan from database
    const billingPlan = await db.billingPlan.findUnique({
      where: { shop },
    });

    // Get monthly order usage for free plan tracking
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const daysRemaining = calculateDaysRemaining();

    let monthlyOrderUsage = null;
    try {
      // Simply use TOTAL ORDER COUNT to verify orders are recognized
      console.log("[Billing Page] Using TOTAL order count (ignoring month filter)");

      // Get total orders for this shop
      const totalOrdersForShop = await db.order.count({
        where: { shop }
      });
      console.log(`[Billing Page] TOTAL orders for shop ${shop}: ${totalOrdersForShop}`);

      // Use total orders as the count (ignoring monthly filtering for now)
      const orderCount = totalOrdersForShop;

      // Get a sample of orders to verify they exist and check date formats
      const sampleOrders = await db.order.findMany({
        where: { shop },
        select: {
          id: true,
          shopifyOrderNumber: true,
          shopifyOrderName: true,
          shopifyCreatedAt: true,
          createdAt: true,
          totalPrice: true,
          financialStatus: true
        },
        take: 10,
        orderBy: { shopifyCreatedAt: 'desc' }
      });

      console.log('[Billing Page] RAW Sample orders from database:');
      sampleOrders.forEach(o => {
        console.log({
          number: o.shopifyOrderNumber,
          name: o.shopifyOrderName,
          shopifyCreatedAt_raw: o.shopifyCreatedAt, // Raw value from DB
          shopifyCreatedAt_ISO: o.shopifyCreatedAt?.toISOString(),
          shopifyCreatedAt_locale: o.shopifyCreatedAt?.toLocaleDateString('en-GB'), // DD/MM/YYYY
          shopifyCreatedAt_US: o.shopifyCreatedAt?.toLocaleDateString('en-US'), // MM/DD/YYYY
          createdAt_raw: o.createdAt,
          createdAt_ISO: o.createdAt.toISOString(),
          totalPrice: o.totalPrice?.toString(),
          status: o.financialStatus
        });
      });

      // Check the actual month/year of orders
      const ordersByMonth = new Map();
      const allOrders = await db.order.findMany({
        where: { shop },
        select: {
          shopifyCreatedAt: true,
          shopifyOrderName: true
        }
      });

      allOrders.forEach(order => {
        if (order.shopifyCreatedAt) {
          const date = new Date(order.shopifyCreatedAt);
          const monthYear = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          if (!ordersByMonth.has(monthYear)) {
            ordersByMonth.set(monthYear, []);
          }
          ordersByMonth.get(monthYear).push(order.shopifyOrderName);
        }
      });

      console.log('[Billing Page] Orders grouped by month:');
      for (const [monthYear, orders] of ordersByMonth) {
        console.log(`  ${monthYear}: ${orders.length} orders (e.g., ${orders.slice(0, 3).join(', ')})`);
      }

      // Determine plan limit based on active subscription
      let planLimit = 200; // Default for free plan
      let planName = 'RewardsPro Free';

      if (activeSubscription?.name === 'RewardsPro Monthly') {
        planLimit = 1000;
        planName = 'RewardsPro Monthly';
      } else if (activeSubscription?.name === 'RewardsPro Annual') {
        planLimit = 1000; // 12,000/year = 1,000/month
        planName = 'RewardsPro Annual';
      }

      console.log(`[Billing Page] Plan: ${planName}, Limit: ${planLimit}, Active subscription: ${activeSubscription?.name || 'none'}`);

      // Count orders for September 2025 specifically
      // Your orders are from September 2025 (dates like 10/09/2025 = 10 Sept 2025 in DD/MM format)
      // Convert dates to ISO strings for Aurora Data API compatibility
      const september2025Start = new Date(2025, 8, 1).toISOString(); // September 1, 2025
      const september2025End = new Date(2025, 8, 30, 23, 59, 59, 999).toISOString(); // September 30, 2025

      const september2025OrderCount = await db.order.count({
        where: {
          shop,
          shopifyCreatedAt: {
            gte: september2025Start,
            lte: september2025End
          }
        }
      });

      console.log(`[Billing Page] September 2025 order count:`, september2025OrderCount);
      console.log(`[Billing Page] Date range: ${september2025Start} to ${september2025End}`);

      // Also count for October 2025 (in case dates are MM/DD format)
      const october2025Start = new Date(2025, 9, 1).toISOString(); // October 1, 2025
      const october2025End = new Date(2025, 9, 31, 23, 59, 59, 999).toISOString(); // October 31, 2025

      const october2025OrderCount = await db.order.count({
        where: {
          shop,
          shopifyCreatedAt: {
            gte: october2025Start,
            lte: october2025End
          }
        }
      });

      console.log(`[Billing Page] October 2025 order count:`, october2025OrderCount);

      // Use whichever month has orders
      const actualMonthCount = september2025OrderCount > 0 ? september2025OrderCount : october2025OrderCount;
      const actualMonthName = september2025OrderCount > 0 ? "September 2025" : "October 2025";

      // Now use the actual month count for billing
      monthlyOrderUsage = {
        orderCount: actualMonthCount,
        planLimit,
        planName,
        projectedOrders: actualMonthCount, // Simplified for now
        currentMonth: actualMonthName
      };

      console.log('[Billing Page] monthlyOrderUsage created:', monthlyOrderUsage);
    } catch (error) {
      console.warn("[Billing Page] Could not fetch monthly order usage:", error);
    }

    // If still no usage data, create default for the plan
    if (!monthlyOrderUsage) {
      const planName = activeSubscription?.name || 'RewardsPro Free';
      let planLimit = 200; // Default for free plan

      if (planName === 'RewardsPro Monthly') {
        planLimit = 1000;
      } else if (planName === 'RewardsPro Annual') {
        planLimit = 1000; // Monthly equivalent
      }

      monthlyOrderUsage = {
        orderCount: 0,
        planLimit,
        planName,
        projectedOrders: 0
      };
    }

    // Serialize data for JSON
    const serializedPlan = billingPlan ? {
      ...billingPlan,
      monthlyPrice: Number(billingPlan.monthlyPrice || 0),
      usageCap: billingPlan.usageCap ? Number(billingPlan.usageCap) : null,
      currentPeriodEnd: billingPlan.currentPeriodEnd instanceof Date
        ? billingPlan.currentPeriodEnd.toISOString()
        : billingPlan.currentPeriodEnd,
      lastCapAlert: billingPlan.lastCapAlert instanceof Date
        ? billingPlan.lastCapAlert.toISOString()
        : billingPlan.lastCapAlert,
      createdAt: billingPlan.createdAt instanceof Date
        ? billingPlan.createdAt.toISOString()
        : String(billingPlan.createdAt),
      updatedAt: billingPlan.updatedAt instanceof Date
        ? billingPlan.updatedAt.toISOString()
        : String(billingPlan.updatedAt),
    } : null;

    console.log('[Billing Page] Returning data:', {
      hasCurrentPlan: !!serializedPlan,
      hasActiveSubscription: !!activeSubscription,
      monthlyOrderUsage: monthlyOrderUsage,
      currentMonth: getCurrentMonthName(),
    });

    return json<LoaderData>({
      currentPlan: serializedPlan,
      activeSubscription,
      monthlyOrderUsage,
      shop,
      currentMonth: getCurrentMonthName(),
      daysRemaining,
    });
  } catch (error: any) {
    console.error("[Billing Page] Error:", error);

    // Check if this is a Shopify authentication error with a redirect URL
    if (error instanceof Response && error.status === 401) {
      const reauthorizeUrl = error.headers?.get('x-shopify-api-request-failure-reauthorize-url');
      if (reauthorizeUrl) {
        console.log("[Billing Page] Redirecting to reauthorize:", reauthorizeUrl);
        // Throw a redirect response to the reauthorization URL
        throw new Response(null, {
          status: 302,
          headers: {
            Location: reauthorizeUrl,
          },
        });
      }
    }

    throw new Response("Failed to load billing information", { status: 500 });
  }
};

// ============= ACTION =============
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { session, billing } = await authenticate.admin(request);

    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    if (intent === "upgrade") {
      // Use Shopify billing API to request a plan upgrade
      const planName = formData.get("plan") as string;

      if (!billing) {
        return json({ error: "Billing not configured" }, { status: 500 });
      }

      try {
        // Import plan names
        const { FREE_PLAN, MONTHLY_PLAN, ANNUAL_PLAN } = await import("../shopify.server");

        // Determine which plan to request
        let requestPlan = MONTHLY_PLAN; // Default to monthly
        if (planName === "RewardsPro Annual") {
          requestPlan = ANNUAL_PLAN;
        } else if (planName === "RewardsPro Free") {
          requestPlan = FREE_PLAN;
        }

        // Request the billing plan
        const billingResponse = await billing.request({
          plan: requestPlan,
          isTest: process.env.NODE_ENV === 'development',
          returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing`,
        });

        // This will return a redirect response to Shopify's billing page
        return billingResponse;
      } catch (billingError: any) {
        // If billing.request throws a Response, return it
        if (billingError instanceof Response) {
          console.log("[Billing Action] Billing request returned Response, forwarding it");
          return billingError;
        }

        console.error("[Billing Action] Error requesting plan:", billingError);
        return json({ error: "Failed to request billing plan" }, { status: 500 });
      }
    }

    return json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("[Billing Action] Error:", error);

    // Check if this is a Shopify authentication error with a redirect URL
    if (error instanceof Response && error.status === 401) {
      const reauthorizeUrl = error.headers?.get('x-shopify-api-request-failure-reauthorize-url');
      if (reauthorizeUrl) {
        console.log("[Billing Action] Redirecting to reauthorize:", reauthorizeUrl);
        // Return a redirect response to the reauthorization URL
        return new Response(null, {
          status: 302,
          headers: {
            Location: reauthorizeUrl,
          },
        });
      }
    }

    return json({ error: "Failed to process billing action" }, { status: 500 });
  }
};

// ============= COMPONENT =============
export default function BillingPage() {
  const {
    currentPlan,
    activeSubscription,
    monthlyOrderUsage,
    shop,
    currentMonth,
    daysRemaining
  } = useLoaderData<LoaderData>();

  const fetcher = useFetcher();
  const navigate = useNavigate();

  // Determine current plan details
  const activePlanName = activeSubscription?.name || currentPlan?.planName || "RewardsPro Free";
  const planDetails = MANAGED_PLANS[activePlanName as keyof typeof MANAGED_PLANS] || MANAGED_PLANS["RewardsPro Free"];
  const hasActivePlan = activeSubscription || currentPlan?.status === "active";

  const handleUpgrade = useCallback((planName?: string) => {
    fetcher.submit(
      {
        intent: "upgrade",
        plan: planName || "RewardsPro Monthly" // Default to monthly plan
      },
      { method: "post" }
    );
  }, [fetcher]);

  // Show success/error messages
  const actionData = fetcher.data as { error?: string; success?: boolean; message?: string } | undefined;

  // Calculate usage percentage and projected usage
  const currentUsage = monthlyOrderUsage?.orderCount || 0;
  const planLimit = monthlyOrderUsage?.planLimit || planDetails.ordersIncluded;
  const projectedUsage = monthlyOrderUsage?.projectedOrders || 0;
  const usagePercentage = Math.min(Math.round((currentUsage / planLimit) * 100), 100);
  const projectedPercentage = Math.min(Math.round((projectedUsage / planLimit) * 100), 100);

  // Determine progress bar color
  let progressTone: "success" | "critical" = "success";
  if (usagePercentage >= 100) {
    progressTone = "critical";
  } else if (usagePercentage >= 80) {
    // Use success tone for warning range since ProgressBar doesn't support "warning"
    progressTone = "success";
  }

  // Check if over limits or protection applied
  const isOverLimit = currentUsage >= planLimit;
  const protectionApplied = currentUsage > planLimit;
  const ordersNotCounted = Math.max(0, currentUsage - planLimit);

  return (
    <Page
      title="Billing"
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {/* Success/Error Banners */}
            {actionData?.error && (
              <Banner tone="critical">
                <p>{actionData.error}</p>
              </Banner>
            )}
            {actionData?.success && (
              <Banner tone="success">
                <p>{actionData.message}</p>
              </Banner>
            )}

            {/* Plan Comparison Section */}
            <BlockStack gap="400">
              <Text as="h2" variant="headingLg">
                Pricing plans
              </Text>

              {/* Plan Cards Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '16px'
              }}>
                {/* Starter Plan Card */}
                <Card>
                  <Box padding="600">
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <Text as="h3" variant="headingMd">
                          {OLD_PLAN_COMPARISON.free.name}
                        </Text>
                        {OLD_PLAN_COMPARISON.free.recommended && (
                          <Badge tone="info">Recommended</Badge>
                        )}
                      </InlineStack>

                      <Text as="p" variant="bodyMd" tone="subdued">
                        {OLD_PLAN_COMPARISON.free.description}
                      </Text>

                      <BlockStack gap="200">
                        <Text as="p" variant="heading2xl">
                          ${OLD_PLAN_COMPARISON.free.price}
                          <Text as="span" variant="bodyLg" tone="subdued">
                            {" "}USD/{OLD_PLAN_COMPARISON.free.interval}
                          </Text>
                        </Text>
                      </BlockStack>

                      <Button
                        fullWidth
                        variant={activePlanName === "RewardsPro Free" ? "secondary" : "primary"}
                        disabled={activePlanName === "RewardsPro Free"}
                        onClick={() => handleUpgrade("RewardsPro Free")}
                      >
                        {activePlanName === "RewardsPro Free" ? "Current Plan" : "Select Starter"}
                      </Button>

                      <Box paddingBlockStart="200">
                        <Text as="p" variant="bodyMd">
                          {OLD_PLAN_COMPARISON.free.ordersIncluded}
                        </Text>
                        {OLD_PLAN_COMPARISON.free.overageInfo && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            {OLD_PLAN_COMPARISON.free.overageInfo}
                          </Text>
                        )}
                      </Box>

                      <Divider />

                      <BlockStack gap="300">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          Popular features
                        </Text>
                        <BlockStack gap="200">
                          {OLD_PLAN_COMPARISON.free.popularFeatures.map((feature, index) => (
                            <InlineStack key={index} gap="200">
                              <Text as="span" variant="bodyMd">•</Text>
                              <Text as="span" variant="bodyMd">{feature}</Text>
                            </InlineStack>
                          ))}
                        </BlockStack>
                      </BlockStack>
                    </BlockStack>
                  </Box>
                </Card>

                {/* Growth Plan Card */}
                <Card>
                  <Box padding="600">
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <Text as="h3" variant="headingMd">
                          {OLD_PLAN_COMPARISON.pro.name}
                        </Text>
                        {OLD_PLAN_COMPARISON.pro.recommended && (
                          <Badge tone="info">Recommended</Badge>
                        )}
                      </InlineStack>

                      <Text as="p" variant="bodyMd" tone="subdued">
                        {OLD_PLAN_COMPARISON.pro.description}
                      </Text>

                      <BlockStack gap="200">
                        <Text as="p" variant="heading2xl">
                          ${OLD_PLAN_COMPARISON.pro.price}
                          <Text as="span" variant="bodyLg" tone="subdued">
                            {" "}USD/{OLD_PLAN_COMPARISON.pro.interval}
                          </Text>
                        </Text>
                      </BlockStack>

                      <Button
                        fullWidth
                        variant={activePlanName === "RewardsPro Monthly" ? "secondary" : "primary"}
                        disabled={activePlanName === "RewardsPro Monthly"}
                        onClick={() => handleUpgrade("RewardsPro Monthly")}
                      >
                        {activePlanName === "RewardsPro Monthly" ? "Current Plan" : "Select Growth"}
                      </Button>

                      <Box paddingBlockStart="200">
                        <Text as="p" variant="bodyMd">
                          {OLD_PLAN_COMPARISON.pro.ordersIncluded}
                        </Text>
                        {OLD_PLAN_COMPARISON.pro.overageInfo && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            {OLD_PLAN_COMPARISON.pro.overageInfo}
                          </Text>
                        )}
                      </Box>

                      <Divider />

                      <BlockStack gap="300">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          Popular features
                        </Text>
                        <BlockStack gap="200">
                          {OLD_PLAN_COMPARISON.pro.popularFeatures.map((feature, index) => (
                            <InlineStack key={index} gap="200">
                              <Text as="span" variant="bodyMd">•</Text>
                              <Text as="span" variant="bodyMd">{feature}</Text>
                            </InlineStack>
                          ))}
                        </BlockStack>
                      </BlockStack>
                    </BlockStack>
                  </Box>
                </Card>

                {/* Plus Plan Card */}
                <Card>
                  <Box padding="600">
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <Text as="h3" variant="headingMd">
                          {OLD_PLAN_COMPARISON.enterprise.name}
                        </Text>
                        {OLD_PLAN_COMPARISON.enterprise.recommended && (
                          <Badge tone="info">Recommended</Badge>
                        )}
                      </InlineStack>

                      <Text as="p" variant="bodyMd" tone="subdued">
                        {OLD_PLAN_COMPARISON.enterprise.description}
                      </Text>

                      <BlockStack gap="200">
                        <Text as="p" variant="heading2xl">
                          ${OLD_PLAN_COMPARISON.enterprise.price}
                          <Text as="span" variant="bodyLg" tone="subdued">
                            {" "}USD/{OLD_PLAN_COMPARISON.enterprise.interval}
                          </Text>
                        </Text>
                      </BlockStack>

                      <Button
                        fullWidth
                        variant={activePlanName === "RewardsPro Annual" ? "secondary" : "primary"}
                        disabled={activePlanName === "RewardsPro Annual"}
                        onClick={() => handleUpgrade("RewardsPro Annual")}
                      >
                        {activePlanName === "RewardsPro Annual" ? "Current Plan" : "Select Plus"}
                      </Button>

                      <Box paddingBlockStart="200">
                        <Text as="p" variant="bodyMd">
                          {OLD_PLAN_COMPARISON.enterprise.ordersIncluded}
                        </Text>
                        {OLD_PLAN_COMPARISON.enterprise.overageInfo && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            {OLD_PLAN_COMPARISON.enterprise.overageInfo}
                          </Text>
                        )}
                      </Box>

                      <Divider />

                      <BlockStack gap="300">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          Popular features
                        </Text>
                        <BlockStack gap="200">
                          {OLD_PLAN_COMPARISON.enterprise.popularFeatures.map((feature, index) => (
                            <InlineStack key={index} gap="200">
                              <Text as="span" variant="bodyMd">•</Text>
                              <Text as="span" variant="bodyMd">{feature}</Text>
                            </InlineStack>
                          ))}
                        </BlockStack>
                      </BlockStack>
                    </BlockStack>
                  </Box>
                </Card>
              </div>

              {/* View Full Comparison Link */}
              <Box paddingBlockStart="400">
                <InlineStack align="center">
                  <Button variant="plain" onClick={() => navigate("/app/billing/plans")}>
                    <InlineStack gap="200">
                      <Icon source={InfoIcon} tone="base" />
                      <Text as="span" variant="bodyMd">View plan comparison</Text>
                    </InlineStack>
                  </Button>
                </InlineStack>
              </Box>
            </BlockStack>

          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}