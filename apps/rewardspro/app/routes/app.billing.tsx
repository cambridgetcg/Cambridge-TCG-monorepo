import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate, Link } from "@remix-run/react";
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
  CalloutCard,
} from "@shopify/polaris";
import {
  CheckIcon,
  AlertTriangleIcon,
  CalendarIcon,
  CreditCardIcon,
} from "@shopify/polaris-icons";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ============= TYPES =============
type PlanName = "free" | "starter" | "growth" | "plus";

type BillingPlan = {
  id: string;
  shop: string;
  planName: PlanName;
  status: "active" | "cancelled" | "past_due";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  ordersUsed: number;
  ordersLimit: number;
  priceMonthly: number;
  overageRate: number | null;
  createdAt: string;
  updatedAt: string;
};

type PlanDetails = {
  name: string;
  displayName: string;
  price: number;
  ordersIncluded: number;
  overageRate: number | null;
  features: string[];
  recommended?: boolean;
};

type LoaderData = {
  currentPlan: BillingPlan;
  ordersThisMonth: number;
  daysRemaining: number;
  usagePercentage: number;
  shop: string;
};

// ============= CONSTANTS =============
const PLAN_DETAILS: Record<PlanName, PlanDetails> = {
  free: {
    name: "free",
    displayName: "Free",
    price: 0,
    ordersIncluded: 200,
    overageRate: null,
    features: [
      "Up to 200 orders/month",
      "Basic loyalty tiers",
      "Customer management",
      "Store credit tracking",
      "Email support",
    ],
  },
  starter: {
    name: "starter",
    displayName: "Starter",
    price: 49,
    ordersIncluded: 500,
    overageRate: null,
    features: [
      "Up to 500 orders/month",
      "Unlimited loyalty tiers",
      "Customizable emails",
      "Basic analytics & reports",
      "Priority email support",
      "Automated tier progression",
    ],
    recommended: true,
  },
  growth: {
    name: "growth",
    displayName: "Growth",
    price: 199,
    ordersIncluded: 2500,
    overageRate: 20, // $20 per 100 orders
    features: [
      "2,500 orders included",
      "$20 per additional 100 orders",
      "Advanced analytics & reporting",
      "VIP tier features",
      "Bonus point events",
      "Custom email templates",
      "API webhooks",
      "Phone & email support",
    ],
  },
  plus: {
    name: "plus",
    displayName: "Plus",
    price: 999,
    ordersIncluded: 7500,
    overageRate: 5, // $5 per 100 orders
    features: [
      "7,500 orders included",
      "$5 per additional 100 orders",
      "Custom reporting",
      "API access & developer tools",
      "Priority phone support",
      "Quarterly program monitoring",
      "Security review support",
      "Dedicated success manager",
      "White-glove onboarding",
    ],
  },
};

// ============= HELPERS =============
const calculateDaysRemaining = (endDate: string): number => {
  const end = new Date(endDate);
  const now = new Date();
  const diffTime = Math.abs(end.getTime() - now.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const calculateUsagePercentage = (used: number, limit: number): number => {
  if (limit === 0) return 0;
  return Math.min(Math.round((used / limit) * 100), 100);
};

const getUsageTone = (percentage: number): "success" | "warning" | "critical" => {
  if (percentage < 80) return "success";
  if (percentage < 90) return "warning";
  return "critical";
};

const getCurrentMonthName = (): string => {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return months[new Date().getMonth()];
};

// ============= LOADER =============
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;

    // Try to fetch existing billing plan
    let billingPlan = await db.billingPlan.findUnique({
      where: { shop },
    });

    // If no billing plan exists, create a free plan
    if (!billingPlan) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      billingPlan = await db.billingPlan.create({
        data: {
          id: crypto.randomUUID(),
          shop,
          planName: "free",
          status: "active",
          currentPeriodStart: startOfMonth,
          currentPeriodEnd: endOfMonth,
          ordersUsed: 0,
          ordersLimit: 200,
          priceMonthly: 0,
          overageRate: null,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    // Calculate current month's order usage
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const ordersThisMonth = await db.usageRecord.count({
      where: {
        shop,
        processedAt: {
          gte: startOfMonth,
        },
      },
    });

    // Update orders used if different
    if (ordersThisMonth !== billingPlan.ordersUsed) {
      billingPlan = await db.billingPlan.update({
        where: { shop },
        data: { 
          ordersUsed: ordersThisMonth,
          updatedAt: new Date(),
        },
      });
    }

    // Calculate metrics
    const daysRemaining = calculateDaysRemaining(billingPlan.currentPeriodEnd.toString());
    const usagePercentage = calculateUsagePercentage(billingPlan.ordersUsed, billingPlan.ordersLimit);

    // Serialize dates for JSON - handle both Date objects and strings
    const serializedPlan = {
      ...billingPlan,
      planName: String(billingPlan.planName) as PlanName,
      status: String(billingPlan.status) as "active" | "cancelled" | "past_due",
      priceMonthly: Number(billingPlan.priceMonthly),
      overageRate: billingPlan.overageRate ? Number(billingPlan.overageRate) : null,
      currentPeriodStart: billingPlan.currentPeriodStart instanceof Date
        ? billingPlan.currentPeriodStart.toISOString()
        : String(billingPlan.currentPeriodStart),
      currentPeriodEnd: billingPlan.currentPeriodEnd instanceof Date
        ? billingPlan.currentPeriodEnd.toISOString()
        : String(billingPlan.currentPeriodEnd),
      createdAt: billingPlan.createdAt instanceof Date
        ? billingPlan.createdAt.toISOString()
        : String(billingPlan.createdAt),
      updatedAt: billingPlan.updatedAt instanceof Date
        ? billingPlan.updatedAt.toISOString()
        : String(billingPlan.updatedAt),
    };

    return json<LoaderData>({
      currentPlan: serializedPlan as BillingPlan,
      ordersThisMonth,
      daysRemaining,
      usagePercentage,
      shop,
    });
  } catch (error) {
    console.error("Billing loader error:", error);
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
    const planName = formData.get("planName") as PlanName;

    if (intent === "upgrade" && planName) {
      // TODO: Implement Shopify billing API integration
      // For now, just update the database
      const planDetails = PLAN_DETAILS[planName];
      
      if (!planDetails) {
        return json({ error: "Invalid plan selected" }, { status: 400 });
      }

      // Update billing plan
      await db.billingPlan.update({
        where: { shop },
        data: {
          planName,
          priceMonthly: planDetails.price,
          ordersLimit: planDetails.ordersIncluded,
          overageRate: planDetails.overageRate,
          updatedAt: new Date(),
        },
      });

      return json({ success: true, message: `Upgraded to ${planDetails.displayName} plan` });
    }

    return json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Billing action error:", error);
    return json({ error: "Failed to process billing action" }, { status: 500 });
  }
};

// ============= COMPONENT =============
export default function BillingPage() {
  const { currentPlan, ordersThisMonth, daysRemaining, usagePercentage, shop } = useLoaderData<LoaderData>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  
  const planDetails = PLAN_DETAILS[currentPlan.planName];
  const usageTone = getUsageTone(usagePercentage);
  const currentMonth = getCurrentMonthName();

  // Calculate overage if applicable
  const overage = Math.max(0, currentPlan.ordersUsed - currentPlan.ordersLimit);
  const overageCost = overage > 0 && currentPlan.overageRate
    ? Math.ceil(overage / 100) * currentPlan.overageRate
    : 0;

  const handleUpgrade = useCallback(() => {
    navigate("/app/billing/upgrade");
  }, [navigate]);

  // Show success/error messages
  const actionData = fetcher.data as { error?: string; success?: boolean; message?: string } | undefined;

  return (
    <Page
      title="Billing"
      primaryAction={{
        content: "Upgrade plan",
        onAction: handleUpgrade,
        disabled: currentPlan.planName === "plus",
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
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

            {/* Usage Alert Banners */}
            {usagePercentage >= 90 && (
              <Banner tone="critical" title="Usage limit approaching">
                <p>
                  You've used {usagePercentage}% of your monthly order limit. 
                  Consider upgrading to avoid service interruption.
                </p>
              </Banner>
            )}
            {usagePercentage >= 80 && usagePercentage < 90 && (
              <Banner tone="warning" title="High usage detected">
                <p>
                  You've used {usagePercentage}% of your monthly order limit. 
                  You may want to consider upgrading your plan.
                </p>
              </Banner>
            )}

            {/* Plan Details Card */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg">
                      Plan Details
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Showing usage for the current month of {currentMonth}.
                    </Text>
                  </BlockStack>
                  {currentPlan.planName !== "plus" && (
                    <Button onClick={handleUpgrade}>Upgrade plan</Button>
                  )}
                </InlineStack>

                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <BlockStack gap="100">
                        <Text as="h3" variant="headingXl">
                          {planDetails.displayName}
                        </Text>
                        <Text as="p" variant="headingLg">
                          ${planDetails.price} <Text as="span" variant="bodyMd" tone="subdued">USD/month</Text>
                        </Text>
                      </BlockStack>
                      <BlockStack gap="100" align="end">
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Free plan limit
                        </Text>
                        <Text as="p" variant="headingMd">
                          {currentPlan.ordersLimit.toLocaleString()} orders
                        </Text>
                      </BlockStack>
                    </InlineStack>

                    <Box>
                      <BlockStack gap="200">
                        <InlineStack align="space-between">
                          <Text as="p" variant="bodyMd">
                            <Icon source={CheckIcon} tone="base" />
                            {" "}Current: {currentPlan.ordersUsed.toLocaleString()} orders
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {usagePercentage}% used
                          </Text>
                        </InlineStack>
                        <ProgressBar 
                          progress={usagePercentage} 
                          tone={usageTone}
                          size="small"
                        />
                      </BlockStack>
                    </Box>

                    {overage > 0 && currentPlan.overageRate && (
                      <Box padding="300" background="bg-surface-warning" borderRadius="200">
                        <BlockStack gap="100">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            <Icon source={AlertTriangleIcon} tone="warning" />
                            {" "}Overage charges apply
                          </Text>
                          <Text as="p" variant="bodySm">
                            {overage.toLocaleString()} additional orders × ${currentPlan.overageRate}/100 orders = ${overageCost}
                          </Text>
                        </BlockStack>
                      </Box>
                    )}

                    <InlineStack gap="400">
                      <Box>
                        <BlockStack gap="050">
                          <Text as="p" variant="bodySm" tone="subdued">
                            <Icon source={CalendarIcon} tone="subdued" />
                            {" "}Billing period
                          </Text>
                          <Text as="p" variant="bodyMd">
                            {new Date(currentPlan.currentPeriodStart).toLocaleDateString()} - {new Date(currentPlan.currentPeriodEnd).toLocaleDateString()}
                          </Text>
                        </BlockStack>
                      </Box>
                      <Box>
                        <BlockStack gap="050">
                          <Text as="p" variant="bodySm" tone="subdued">
                            Days remaining
                          </Text>
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            {daysRemaining} days
                          </Text>
                        </BlockStack>
                      </Box>
                    </InlineStack>
                  </BlockStack>
                </Box>

                <Box paddingBlockStart="200">
                  <Text as="p" variant="bodyMd">
                    <Icon source={CreditCardIcon} tone="base" />
                    {" "}{ordersThisMonth.toLocaleString()} orders have been placed at your store so far in {currentMonth}.
                  </Text>
                </Box>
              </BlockStack>
            </Card>

            {/* Quick Actions */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Billing Management
                </Text>
                <BlockStack gap="200">
                  <InlineStack gap="200">
                    <Button onClick={() => navigate("/app/billing/upgrade")}>
                      View all plans
                    </Button>
                    <Button variant="plain">
                      View invoice history
                    </Button>
                    <Button variant="plain">
                      Update payment method
                    </Button>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Current Plan Features */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Your {planDetails.displayName} Plan Features
                </Text>
                <BlockStack gap="200">
                  {planDetails.features.map((feature, index) => (
                    <InlineStack key={index} gap="200">
                      <Icon source={CheckIcon} tone="success" />
                      <Text as="p" variant="bodyMd">{feature}</Text>
                    </InlineStack>
                  ))}
                </BlockStack>
                {currentPlan.planName !== "plus" && (
                  <Box paddingBlockStart="200">
                    <Button variant="plain" onClick={handleUpgrade}>
                      See what you're missing →
                    </Button>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {/* Need Help Card */}
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Need help?
                </Text>
                <Text as="p" variant="bodyMd">
                  Our support team is here to help you choose the right plan for your business.
                </Text>
                <Button url="mailto:support@rewardspro.com" variant="plain">
                  Contact support
                </Button>
              </BlockStack>
            </Card>

            {/* Billing FAQ */}
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Billing FAQ
                </Text>
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      When will I be charged?
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      You'll be charged monthly through your Shopify invoice.
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Can I change plans anytime?
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Yes, you can upgrade or downgrade at any time. Changes are prorated.
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      What counts as an order?
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Any paid order that triggers cashback or tier evaluation.
                    </Text>
                  </BlockStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}