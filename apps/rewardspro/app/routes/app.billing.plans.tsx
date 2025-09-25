import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Box,
  Grid,
  Icon,
  List,
  Banner,
} from "@shopify/polaris";
import {
  CheckIcon,
} from "~/utils/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ============================================
// TYPES & CONSTANTS
// ============================================

interface Plan {
  id: string;
  name: string;
  displayName: string;
  price: number;
  interval: string;
  ordersIncluded: number;
  features: string[];
  recommended?: boolean;
  description: string;
  badge?: string;
  tone?: "success" | "info" | "warning" | "critical" | "new";
}

const PLANS: Plan[] = [
  {
    id: "RewardsPro Free",
    name: "RewardsPro Free",
    displayName: "Free",
    price: 0,
    interval: "month",
    ordersIncluded: 200,
    description: "Perfect for small stores just getting started",
    features: [
      "Up to 200 orders/month",
      "Basic loyalty tiers",
      "Store credit tracking",
      "Customer management",
      "Email support",
      "Basic analytics",
    ],
  },
  {
    id: "RewardsPro Starter",
    name: "RewardsPro Starter",
    displayName: "Starter",
    price: 29,
    interval: "month",
    ordersIncluded: 500,
    description: "Ideal for growing stores with regular customers",
    badge: "Popular",
    tone: "success",
    features: [
      "Up to 500 orders/month",
      "Unlimited loyalty tiers",
      "Advanced tier rules",
      "Customer segmentation",
      "Priority email support",
      "Detailed analytics",
      "Webhook integrations",
      "Custom email templates",
    ],
  },
  {
    id: "RewardsPro Growth",
    name: "RewardsPro Growth",
    displayName: "Growth",
    price: 79,
    interval: "month",
    ordersIncluded: 2000,
    description: "For established stores scaling their loyalty program",
    recommended: true,
    badge: "Recommended",
    tone: "info",
    features: [
      "Up to 2,000 orders/month",
      "Everything in Starter",
      "VIP tier features",
      "Automated campaigns",
      "Live chat support",
      "Advanced reporting",
      "API access",
      "Bulk operations",
      "Custom cashback rules",
      "Multi-currency support",
    ],
  },
  {
    id: "RewardsPro Enterprise",
    name: "RewardsPro Enterprise",
    displayName: "Enterprise",
    price: 299,
    interval: "month",
    ordersIncluded: 10000,
    description: "For high-volume stores requiring advanced features",
    badge: "Premium",
    tone: "warning",
    features: [
      "Up to 10,000 orders/month",
      "Everything in Growth",
      "Dedicated account manager",
      "Custom integrations",
      "Phone support",
      "White-label options",
      "Advanced API limits",
      "Custom reporting",
      "SLA guarantee",
      "Priority feature requests",
      "Quarterly business reviews",
      "Training sessions",
    ],
  },
];

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const shop = session.shop;

  // Get current subscription
  let currentPlan = null;
  let monthlyOrderUsage = null;

  try {
    // Import plan names
    const { FREE_PLAN, STARTER_PLAN, GROWTH_PLAN, ENTERPRISE_PLAN, MONTHLY_PLAN, ANNUAL_PLAN } = await import("../shopify.server");
    
    if (billing) {
      const { hasActivePayment, appSubscriptions } = await billing.check({
        plans: [FREE_PLAN, STARTER_PLAN, GROWTH_PLAN, ENTERPRISE_PLAN, MONTHLY_PLAN, ANNUAL_PLAN] as any,
        isTest: process.env.NODE_ENV === 'development',
      });
      
      if (hasActivePayment && appSubscriptions?.length > 0) {
        currentPlan = appSubscriptions[0].name;
      }
    }

    // Get monthly order usage
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    const orderUsage = await db.monthlyOrderUsage.findUnique({
      where: {
        shop_year_month: {
          shop,
          year,
          month
        }
      }
    });
    
    if (orderUsage) {
      monthlyOrderUsage = {
        orderCount: orderUsage.orderCount,
        planLimit: orderUsage.planLimit,
      };
    }
  } catch (error) {
    console.error("[Billing Plans] Error checking subscription:", error);
  }

  // If no active plan, default to free
  if (!currentPlan) {
    currentPlan = "RewardsPro Free";
  }

  return json({
    shop,
    currentPlan,
    monthlyOrderUsage,
    plans: PLANS,
  });
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const planId = formData.get("planId") as string;
  
  if (!billing) {
    return json({ error: "Billing not configured" }, { status: 500 });
  }

  try {
    // Import plan names
    const { FREE_PLAN, STARTER_PLAN, GROWTH_PLAN, ENTERPRISE_PLAN } = await import("../shopify.server");
    
    // Map plan ID to actual plan constant
    let requestPlan;
    switch (planId) {
      case "RewardsPro Free":
        requestPlan = FREE_PLAN;
        break;
      case "RewardsPro Starter":
        requestPlan = STARTER_PLAN;
        break;
      case "RewardsPro Growth":
        requestPlan = GROWTH_PLAN;
        break;
      case "RewardsPro Enterprise":
        requestPlan = ENTERPRISE_PLAN;
        break;
      default:
        return json({ error: "Invalid plan selected" }, { status: 400 });
    }
    
    // Request the billing plan
    const billingResponse = await billing.request({
      plan: requestPlan as any,
      isTest: process.env.NODE_ENV === 'development',
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/plans`,
    });
    
    return billingResponse;
  } catch (error: any) {
    if (error instanceof Response) {
      return error;
    }
    
    console.error("[Billing Plans Action] Error:", error);
    return json({ error: "Failed to request billing plan" }, { status: 500 });
  }
};

// ============================================
// COMPONENT
// ============================================

export default function BillingPlansPage() {
  const { currentPlan, monthlyOrderUsage, plans } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();

  const handleSelectPlan = (planId: string) => {
    if (planId === currentPlan) return;
    
    fetcher.submit(
      { planId },
      { method: "post" }
    );
  };

  return (
    <Page
      title="Choose Your Plan"
      backAction={{
        content: "Billing",
        onAction: () => navigate("/app/billing"),
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {/* Current Usage Banner */}
            {monthlyOrderUsage && (
              <Banner
                title="Current Usage"
                tone={monthlyOrderUsage.orderCount >= monthlyOrderUsage.planLimit ? "critical" : "info"}
              >
                <p>
                  You've processed {monthlyOrderUsage.orderCount} of {monthlyOrderUsage.planLimit} orders this month.
                  {monthlyOrderUsage.orderCount >= monthlyOrderUsage.planLimit && 
                    " Please upgrade to continue processing orders."}
                </p>
              </Banner>
            )}

            {/* Plans Grid */}
            <Grid>
              {plans.map((plan: Plan) => {
                const isCurrentPlan = plan.id === currentPlan;
                const isUpgrade = PLANS.findIndex(p => p.id === plan.id) > 
                                  PLANS.findIndex(p => p.id === currentPlan);
                const isDowngrade = PLANS.findIndex(p => p.id === plan.id) < 
                                   PLANS.findIndex(p => p.id === currentPlan);

                return (
                  <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 3, xl: 3 }} key={plan.id}>
                    <Card>
                      <Box 
                        padding="400"
                        minHeight="500px"
                        background={isCurrentPlan ? "bg-surface-success" : undefined}
                      >
                        <BlockStack gap="400">
                          {/* Header */}
                          <BlockStack gap="200">
                            <InlineStack align="space-between">
                              <Text variant="headingLg" as="h3">
                                {plan.displayName}
                              </Text>
                              {plan.badge && (
                                <Badge tone={plan.tone || "info"}>
                                  {plan.badge}
                                </Badge>
                              )}
                            </InlineStack>
                            
                            {isCurrentPlan && (
                              <Badge tone="success">Current Plan</Badge>
                            )}

                            <Text as="p" variant="bodyMd" tone="subdued">
                              {plan.description}
                            </Text>
                          </BlockStack>

                          {/* Pricing */}
                          <Box paddingBlockStart="200" paddingBlockEnd="200">
                            <InlineStack align="start" gap="100">
                              <Text variant="heading2xl" as="p">
                                ${plan.price}
                              </Text>
                              <Text as="span" variant="bodyMd" tone="subdued">
                                /{plan.interval}
                              </Text>
                            </InlineStack>
                            <Text as="p" variant="bodyMd" tone="subdued">
                              {plan.ordersIncluded.toLocaleString()} orders/month
                            </Text>
                          </Box>

                          {/* Features */}
                          <BlockStack gap="200">
                            <Text variant="headingSm" as="h4">
                              Features
                            </Text>
                            <List type="bullet">
                              {plan.features.slice(0, 6).map((feature: string, index: number) => (
                                <List.Item key={index}>
                                  <Text as="span" variant="bodyMd">{feature}</Text>
                                </List.Item>
                              ))}
                              {plan.features.length > 6 && (
                                <List.Item>
                                  <Text as="span" variant="bodyMd" tone="subdued">
                                    +{plan.features.length - 6} more features
                                  </Text>
                                </List.Item>
                              )}
                            </List>
                          </BlockStack>

                          {/* Action Button */}
                          <Box paddingBlockStart="200">
                            {isCurrentPlan ? (
                              <Button fullWidth disabled>
                                Current Plan
                              </Button>
                            ) : (
                              <Button
                                fullWidth
                                variant={plan.recommended ? "primary" : "secondary"}
                                onClick={() => handleSelectPlan(plan.id)}
                                loading={fetcher.state === "submitting"}
                              >
                                {isUpgrade ? "Upgrade" : isDowngrade ? "Downgrade" : "Select"} Plan
                              </Button>
                            )}
                          </Box>
                        </BlockStack>
                      </Box>
                    </Card>
                  </Grid.Cell>
                );
              })}
            </Grid>

            {/* Comparison Table */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingLg" as="h2">
                    Plan Comparison
                  </Text>
                  
                  <Box>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                          <th style={{ padding: "12px", textAlign: "left" }}>
                            <Text variant="headingSm" as="span">Feature</Text>
                          </th>
                          {plans.map(plan => (
                            <th key={plan.id} style={{ padding: "12px", textAlign: "center" }}>
                              <Text variant="headingSm" as="span">{plan.displayName}</Text>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                          <td style={{ padding: "12px" }}>
                            <Text variant="bodyMd" as="span">Monthly Price</Text>
                          </td>
                          {plans.map(plan => (
                            <td key={plan.id} style={{ padding: "12px", textAlign: "center" }}>
                              <Text variant="bodyMd" as="span" fontWeight="semibold">
                                ${plan.price}
                              </Text>
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                          <td style={{ padding: "12px" }}>
                            <Text variant="bodyMd" as="span">Orders Included</Text>
                          </td>
                          {plans.map(plan => (
                            <td key={plan.id} style={{ padding: "12px", textAlign: "center" }}>
                              <Text variant="bodyMd" as="span">
                                {plan.ordersIncluded.toLocaleString()}
                              </Text>
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                          <td style={{ padding: "12px" }}>
                            <Text variant="bodyMd" as="span">Loyalty Tiers</Text>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Text variant="bodyMd" as="span">Basic</Text>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Text variant="bodyMd" as="span">Unlimited</Text>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Text variant="bodyMd" as="span">Unlimited + VIP</Text>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Text variant="bodyMd" as="span">Unlimited + White-label</Text>
                          </td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                          <td style={{ padding: "12px" }}>
                            <Text variant="bodyMd" as="span">Support</Text>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Text variant="bodyMd" as="span">Email</Text>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Text variant="bodyMd" as="span">Priority Email</Text>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Text variant="bodyMd" as="span">Live Chat</Text>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Text variant="bodyMd" as="span">Phone + Dedicated Manager</Text>
                          </td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                          <td style={{ padding: "12px" }}>
                            <Text variant="bodyMd" as="span">Analytics</Text>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Text variant="bodyMd" as="span">Basic</Text>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Text variant="bodyMd" as="span">Detailed</Text>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Text variant="bodyMd" as="span">Advanced</Text>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Text variant="bodyMd" as="span">Custom + Reporting</Text>
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "12px" }}>
                            <Text variant="bodyMd" as="span">API Access</Text>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Text variant="bodyMd" as="span">—</Text>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Icon source={CheckIcon} tone="success" />
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Icon source={CheckIcon} tone="success" />
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Icon source={CheckIcon} tone="success" />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </Box>
                </BlockStack>
              </Box>
            </Card>

            {/* FAQ Section */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingLg" as="h2">
                    Frequently Asked Questions
                  </Text>
                  
                  <BlockStack gap="300">
                    <BlockStack gap="100">
                      <Text variant="headingSm" as="h3">
                        Can I change plans anytime?
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately, and billing is prorated.
                      </Text>
                    </BlockStack>

                    <BlockStack gap="100">
                      <Text variant="headingSm" as="h3">
                        What happens if I exceed my order limit?
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        On the free plan, cashback processing stops after 100 orders. On paid plans, you can process additional orders at $0.02 per order.
                      </Text>
                    </BlockStack>

                    <BlockStack gap="100">
                      <Text variant="headingSm" as="h3">
                        Do you offer annual billing?
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Yes! Contact our sales team for annual billing options with up to 20% discount.
                      </Text>
                    </BlockStack>

                    <BlockStack gap="100">
                      <Text variant="headingSm" as="h3">
                        Is there a setup fee?
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        No, there are no setup fees or hidden charges. You only pay the monthly subscription fee.
                      </Text>
                    </BlockStack>
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}