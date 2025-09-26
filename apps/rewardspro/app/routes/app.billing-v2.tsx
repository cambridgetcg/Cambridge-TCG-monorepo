/**
 * Billing Page V2 - Using Alternative Order Counting Strategies
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Text, Button, Banner, InlineStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { CurrentPlanCard } from "../components/Billing";
import { countOrdersWithFallback, countOrdersDateExtraction, getOrCreateMonthlyCount } from "../utils/order-count-strategies";

// Helper function to get current month name
const getCurrentMonthName = () => {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return months[new Date().getMonth()];
};

// Calculate days remaining in current month
const calculateDaysRemaining = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const currentDay = now.getDate();
  return lastDay - currentDay;
};

// Calculate projected orders based on current rate
const calculateProjectedOrders = (currentOrders: number, daysRemaining: number): number => {
  const now = new Date();
  const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysPassed = totalDaysInMonth - daysRemaining;

  if (daysPassed === 0) return currentOrders;

  const dailyRate = currentOrders / daysPassed;
  return Math.ceil(dailyRate * totalDaysInMonth);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const shop = session.shop;

  try {
    // Get active subscription
    const { hasActivePayment, appSubscriptions } = await billing.check();
    const activeSubscription = appSubscriptions?.[0];

    // Fetch billing plan from database
    const billingPlan = await db.billingPlan.findUnique({
      where: { shop },
    });

    // Get monthly order usage using multiple strategies
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-indexed for database
    const daysRemaining = calculateDaysRemaining();

    let monthlyOrderUsage = null;
    let orderCountStrategy = "unknown";

    try {
      console.log(`[Billing V2] Attempting to count orders for ${shop} - ${getCurrentMonthName()} ${year}`);

      // Strategy 1: Try date extraction method (most reliable for month-based)
      let orderCount = 0;
      try {
        orderCount = await countOrdersDateExtraction(shop, year, month);
        orderCountStrategy = "DateExtraction";
        console.log(`[Billing V2] Date extraction strategy succeeded: ${orderCount} orders`);
      } catch (error) {
        console.log("[Billing V2] Date extraction failed, trying fallback strategies");

        // Strategy 2: Try multiple strategies with fallback
        const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
        const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

        const result = await countOrdersWithFallback(shop, startOfMonth, endOfMonth);
        orderCount = result.count;
        orderCountStrategy = result.strategy;
      }

      // Strategy 3: If still 0, try pre-aggregated count
      if (orderCount === 0) {
        console.log("[Billing V2] Trying pre-aggregated count");
        orderCount = await getOrCreateMonthlyCount(shop, year, month);
        orderCountStrategy = "PreAggregated";
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

      console.log(`[Billing V2] Final count: ${orderCount} using strategy: ${orderCountStrategy}`);

      const projectedOrders = calculateProjectedOrders(orderCount, daysRemaining);
      monthlyOrderUsage = {
        orderCount,
        planLimit,
        planName,
        projectedOrders,
        currentMonth: getCurrentMonthName(),
        countStrategy: orderCountStrategy // Include which strategy worked
      };

    } catch (error) {
      console.error("[Billing V2] Error fetching monthly order usage:", error);

      // Fallback to a simple count
      const totalOrders = await db.order.count({ where: { shop } });
      monthlyOrderUsage = {
        orderCount: totalOrders,
        planLimit: 200,
        planName: 'RewardsPro Free',
        projectedOrders: totalOrders,
        currentMonth: getCurrentMonthName(),
        countStrategy: "TotalFallback"
      };
    }

    // Get store settings
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop }
    });

    return json({
      billingPlan,
      hasActivePayment,
      activeSubscription,
      monthlyOrderUsage,
      shopUrl: `https://${shop}`,
      shopSettings,
      daysRemaining
    });
  } catch (error) {
    console.error("[Billing V2] Loader error:", error);
    throw new Response("Failed to load billing data", { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);

  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "subscribe-monthly") {
    const billingCheck = await billing.require({
      plans: ["RewardsPro Monthly"],
      onFailure: () => billing.request({
        plan: "RewardsPro Monthly",
        isTest: true,
      }),
    });

    const subscription = billingCheck.appSubscriptions[0];
    return json({ success: true, subscription });
  }

  if (action === "subscribe-annual") {
    const billingCheck = await billing.require({
      plans: ["RewardsPro Annual"],
      onFailure: () => billing.request({
        plan: "RewardsPro Annual",
        isTest: true,
      }),
    });

    const subscription = billingCheck.appSubscriptions[0];
    return json({ success: true, subscription });
  }

  if (action === "cancel") {
    const { appSubscriptions } = await billing.check();
    if (appSubscriptions?.[0]) {
      const cancelledSubscription = await billing.cancel({
        subscriptionId: appSubscriptions[0].id,
        isTest: true,
        prorate: true,
      });
      return json({ success: true, cancelled: true });
    }
  }

  return json({ success: false });
};

export default function BillingPageV2() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  const handleSubscribe = (plan: string) => {
    const formData = new FormData();
    formData.set("action", `subscribe-${plan}`);
    submit(formData, { method: "post" });
  };

  const handleCancel = () => {
    if (confirm("Are you sure you want to cancel your subscription?")) {
      const formData = new FormData();
      formData.set("action", "cancel");
      submit(formData, { method: "post" });
    }
  };

  return (
    <Page title="Billing">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* Debug banner showing which strategy worked */}
            {data.monthlyOrderUsage?.countStrategy && (
              <Banner tone="info">
                <Text as="p">
                  Order count retrieved using: {data.monthlyOrderUsage.countStrategy} strategy
                </Text>
              </Banner>
            )}

            {/* Current Plan Card */}
            <CurrentPlanCard
              activeSubscription={data.activeSubscription}
              orderUsageData={data.monthlyOrderUsage}
              daysRemaining={data.daysRemaining}
              isFreePlan={!data.hasActivePayment}
              onUpgrade={() => handleSubscribe('monthly')}
            />

            {/* Available Plans */}
            {!data.hasActivePayment && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Available Plans
                  </Text>

                  <Card>
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">
                        RewardsPro Monthly
                      </Text>
                      <Text as="p">
                        $29.99/month - Up to 1,000 orders per month
                      </Text>
                      <Button onClick={() => handleSubscribe('monthly')}>
                        Subscribe Monthly
                      </Button>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">
                        RewardsPro Annual
                      </Text>
                      <Text as="p">
                        $299.99/year - Up to 12,000 orders per year (save 17%)
                      </Text>
                      <Button onClick={() => handleSubscribe('annual')}>
                        Subscribe Annually
                      </Button>
                    </BlockStack>
                  </Card>
                </BlockStack>
              </Card>
            )}

            {/* Active Subscription Management */}
            {data.hasActivePayment && data.activeSubscription && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Subscription Management
                  </Text>
                  <Text as="p">
                    Current plan: {data.activeSubscription.name}
                  </Text>
                  <InlineStack gap="200">
                    <Button variant="plain" tone="critical" onClick={handleCancel}>
                      Cancel Subscription
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}