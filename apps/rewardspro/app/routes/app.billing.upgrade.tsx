import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate, Link } from "@remix-run/react";
export { ErrorBoundary } from "../components/ErrorBoundary";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Icon,
  Box,
  Grid,
  List,
} from "@shopify/polaris";
import {
  ChevronLeftIcon,
  CheckIcon,
} from "~/utils/polaris-icons";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ============= TYPES =============
type PlanName = "free" | "starter" | "growth" | "plus";

type BillingPlan = {
  id: string;
  shop: string;
  planName: PlanName;
  status: string;
  ordersUsed: number;
  ordersLimit: number;
  priceMonthly: number;
};

type LoaderData = {
  currentPlan: BillingPlan;
  shop: string;
};

// ============= PRICING PLANS =============
const PRICING_PLANS = [
  {
    id: "starter",
    name: "Starter plan",
    price: 49,
    currency: "USD",
    interval: "month",
    description: "Everything you need to create an on-brand program your customers will love.",
    ordersIncluded: 500,
    overageRate: null,
    recommended: true,
    features: [
      "Up to 500 monthly orders",
      "Unlimited loyalty tiers",
      "Points program",
      "Referral program",
      "Customizable emails",
      "Nudges (on-site reminders)",
      "Basic reports",
      "2 integrations (e.g. Klaviyo, Judge.me)",
      "Email support",
    ],
    cta: "Select Starter",
  },
  {
    id: "growth",
    name: "Growth plan",
    price: 199,
    currency: "USD",
    interval: "month",
    description: "Level up your loyalty program with extras like free product rewards and VIP tiers.",
    ordersIncluded: 2500,
    overageRate: 20,
    recommended: false,
    features: [
      "Includes 2,500 monthly orders",
      "$20 USD per additional 100 orders",
      "Everything in Starter, plus:",
      "Full-page loyalty hub",
      "Redemption at checkout (Shopify Plus)",
      "Advanced analytics & reporting",
      "Run points bonus events",
      "VIP program",
      "Unlimited integrations",
      "Priority support",
    ],
    cta: "Select Growth",
  },
  {
    id: "plus",
    name: "Plus plan",
    price: 999,
    currency: "USD",
    interval: "month",
    description: "Get the best of RewardsPro with more customization and reporting.",
    ordersIncluded: 7500,
    overageRate: 5,
    recommended: false,
    features: [
      "Includes 7,500 monthly orders",
      "$5 USD per additional 100 orders",
      "Everything in Growth, plus:",
      "Migration and launch plan",
      "30+ specialized reports",
      "API access & developer tools",
      "Priority support",
      "Quarterly program monitoring",
      "Security review support",
      "Dedicated success manager",
    ],
    cta: "Select Plus",
  },
];

// ============= LOADER =============
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;

    // Fetch current billing plan
    const billingPlan = await db.billingPlan.findUnique({
      where: { shop },
    });

    if (!billingPlan) {
      // Redirect to billing page if no plan exists
      return redirect("/app/billing");
    }

    // Serialize for JSON
    const serializedPlan = {
      ...billingPlan,
      priceMonthly: Number(billingPlan.priceMonthly),
    };

    return json<LoaderData>({
      currentPlan: serializedPlan as BillingPlan,
      shop,
    });
  } catch (error) {
    console.error("Upgrade loader error:", error);
    throw new Response("Failed to load upgrade options", { status: 500 });
  }
};

// ============= ACTION =============
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { session, billing, admin } = await authenticate.admin(request);

    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    const formData = await request.formData();
    const selectedPlan = formData.get("plan") as string;

    if (!selectedPlan) {
      return json({ error: "No plan selected" }, { status: 400 });
    }

    // Map old plan IDs to new billing config plan types
    const planTypeMap: Record<string, 'starter' | 'growth' | 'enterprise'> = {
      'starter': 'starter',
      'growth': 'growth',
      'plus': 'enterprise'
    };

    const planType = planTypeMap[selectedPlan];
    if (!planType) {
      return json({ error: "Invalid plan selected" }, { status: 400 });
    }

    // Check if using new GraphQL billing
    const { shouldUseNewBilling } = await import("../utils/billing-config");
    const billingSubscription = await db.billingSubscription.findUnique({
      where: { shop }
    });

    const useNewBilling = await shouldUseNewBilling(shop, billingSubscription?.billingVersion);

    if (useNewBilling) {
      // Use new GraphQL billing
      const { GraphQLBillingService } = await import("../services/billing/graphql-billing.service");
      const billingService = new GraphQLBillingService(admin);

      // Check if this is an upgrade or downgrade
      const currentPlan = billingSubscription?.planType || 'free';
      const planOrder = { free: 0, starter: 1, growth: 2, enterprise: 3 };
      const isUpgrade = planOrder[planType] > planOrder[currentPlan as keyof typeof planOrder];

      // Build return URL with shop parameter
      const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/billing/callback?shop=${shop}`;

      // Create the subscription
      const result = await billingService.createSubscription({
        shop,
        planType,
        isUpgrade,
        returnUrl
      });

      if (!result.success) {
        console.error('[Billing Upgrade] Failed to create subscription:', result.error);
        return json({
          error: result.error || 'Failed to create subscription'
        }, { status: 500 });
      }

      // For JSON responses (AJAX), return the confirmation URL
      if (request.headers.get('Accept')?.includes('application/json')) {
        return json({
          success: true,
          confirmationUrl: result.confirmationUrl
        });
      }

      // For form submissions, redirect to confirmation URL
      return redirect(result.confirmationUrl!);

    } else {
      // Use legacy billing (existing code)
      const plan = PRICING_PLANS.find(p => p.id === selectedPlan);
      if (!plan) {
        return json({ error: "Invalid plan selected" }, { status: 400 });
      }

      // Update the billing plan in database
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      await db.billingPlan.update({
        where: { shop },
        data: {
          planName: plan.id as PlanName,
          priceMonthly: plan.price,
          ordersLimit: plan.ordersIncluded,
          overageRate: plan.overageRate,
          currentPeriodStart: startOfMonth,
          currentPeriodEnd: endOfMonth,
          updatedAt: now,
        },
      });

      // In production, this would redirect to Shopify's billing confirmation page
      // For now, redirect back to billing page with success message
      return redirect("/app/billing?upgraded=true");
    }

  } catch (error) {
    console.error("Upgrade action error:", error);
    return json({ error: "Failed to process upgrade" }, { status: 500 });
  }
};

// ============= COMPONENT =============
export default function BillingUpgradePage() {
  const { currentPlan, shop } = useLoaderData<LoaderData>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const handleSelectPlan = useCallback((planId: string) => {
    if (planId === "free") {
      // Handle downgrade to free plan
      alert("Please contact support to downgrade to the free plan.");
      return;
    }
    
    setSelectedPlan(planId);
    const formData = new FormData();
    formData.append("plan", planId);
    fetcher.submit(formData, { method: "post" });
  }, [fetcher]);

  const isCurrentPlan = (planId: string) => {
    return currentPlan.planName === planId;
  };

  const isPlanDowngrade = (planPrice: number) => {
    return planPrice < currentPlan.priceMonthly;
  };

  return (
    <Page
      title="Pricing plans"
      backAction={{
        content: "Back",
        onAction: () => navigate("/app/billing"),
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {/* Free Plan Notice */}
            {currentPlan.planName === "free" && (
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    You're currently on the <strong>Free plan</strong> with up to 200 orders per month.
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Upgrade to unlock more features and higher order limits.
                  </Text>
                </BlockStack>
              </Card>
            )}

            {/* Pricing Cards Grid */}
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "20px",
            }}>
              {PRICING_PLANS.map((plan) => {
                const isCurrent = isCurrentPlan(plan.id);
                const isDowngrade = isPlanDowngrade(plan.price);
                
                return (
                  <Card key={plan.id}>
                    <BlockStack gap="400">
                      {/* Header */}
                      <BlockStack gap="200">
                        <InlineStack align="space-between">
                          <Text as="h2" variant="headingMd">
                            {plan.name}
                          </Text>
                          {plan.recommended && !isCurrent && (
                            <Badge tone="info">Recommended</Badge>
                          )}
                          {isCurrent && (
                            <Badge tone="success">Current plan</Badge>
                          )}
                        </InlineStack>
                        
                        <Text as="p" variant="bodyMd" tone="subdued">
                          {plan.description}
                        </Text>
                      </BlockStack>

                      {/* Pricing */}
                      <BlockStack gap="100">
                        <InlineStack gap="100" blockAlign="end">
                          <Text as="span" variant="heading2xl">
                            ${plan.price}
                          </Text>
                          <Text as="span" variant="bodyMd" tone="subdued">
                            {plan.currency}/{plan.interval}
                          </Text>
                        </InlineStack>
                        
                        {/* Order limits */}
                        <Box>
                          {plan.overageRate ? (
                            <BlockStack gap="050">
                              <Text as="p" variant="bodyMd">
                                Includes {plan.ordersIncluded.toLocaleString()} monthly orders
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                ${plan.overageRate} USD per additional 100 orders
                              </Text>
                            </BlockStack>
                          ) : (
                            <Text as="p" variant="bodyMd">
                              Up to {plan.ordersIncluded.toLocaleString()} monthly orders
                            </Text>
                          )}
                        </Box>
                      </BlockStack>

                      {/* CTA Button */}
                      <Button
                        fullWidth
                        size="large"
                        variant={isCurrent ? "secondary" : "primary"}
                        disabled={isCurrent || fetcher.state === "submitting"}
                        loading={selectedPlan === plan.id && fetcher.state === "submitting"}
                        onClick={() => handleSelectPlan(plan.id)}
                      >
                        {isCurrent ? "Current plan" : plan.cta}
                      </Button>

                      {/* Features */}
                      <BlockStack gap="300">
                        <Text as="h3" variant="headingSm">
                          Popular features
                        </Text>
                        <List type="bullet">
                          {plan.features.map((feature, index) => (
                            <List.Item key={index}>
                              <Text as="span" variant="bodyMd">
                                {feature}
                              </Text>
                            </List.Item>
                          ))}
                        </List>
                      </BlockStack>
                    </BlockStack>
                  </Card>
                );
              })}
            </div>

            {/* Free Plan Card (if not on free) */}
            {currentPlan.planName !== "free" && (
              <Card>
                <InlineStack align="space-between">
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingMd">
                      Free plan
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Basic features for small stores • Up to 200 orders/month • $0/month
                    </Text>
                  </BlockStack>
                  <Button
                    variant="plain"
                    onClick={() => alert("Please contact support to downgrade to the free plan.")}
                  >
                    Contact support to downgrade
                  </Button>
                </InlineStack>
              </Card>
            )}

            {/* Help Section */}
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Not sure which plan is right for you?
                </Text>
                <Text as="p" variant="bodyMd">
                  Our team is here to help you choose the best plan for your business needs.
                </Text>
                <InlineStack gap="200">
                  <Button url="mailto:support@rewardspro.com">
                    Contact sales
                  </Button>
                  <Button variant="plain" url="https://rewardspro.com/pricing">
                    View detailed comparison
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}