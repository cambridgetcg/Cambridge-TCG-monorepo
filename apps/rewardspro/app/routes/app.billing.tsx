/**
 * Billing Page - Four-tier Plans with Enterprise
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, useNavigation } from "@remix-run/react";
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
  Modal,
  TextField,
  FormLayout,
  Toast,
  Frame,
  Tabs,
  Collapsible
} from "@shopify/polaris";
import { CheckCircleIcon, PhoneIcon, EmailIcon, ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
import { authenticate, PRO_PLAN, MAX_PLAN, ULTRA_PLAN, ENTERPRISE_PLAN } from "../shopify.server";
import { db } from "../db.server";
import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { updatePlanLimit, unlockShop } from "~/utils/plan-access-control.server";

// Rate limiting function for billing attempts
async function checkRecentBillingAttempts(shop: string): Promise<number> {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  try {
    const recentAttempts = await db.billingAuditLog.count({
      where: {
        shop,
        attemptedAt: {
          gte: fifteenMinutesAgo
        }
      }
    });

    return recentAttempts;
  } catch (error) {
    console.error("[Billing] Error checking recent attempts:", error);
    // If we can't check, allow the attempt but log the error
    return 0;
  }
}

// Log billing attempt to audit trail
async function logBillingAttempt(
  shop: string,
  action: string,
  planName: string | null,
  success: boolean,
  errorMessage: string | null = null,
  request: Request
) {
  try {
    const ipAddress = request.headers.get("x-forwarded-for") ||
                     request.headers.get("x-real-ip") ||
                     "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    await db.billingAuditLog.create({
      data: {
        id: uuidv4(),
        shop,
        action,
        planName,
        success,
        errorMessage,
        ipAddress,
        userAgent,
        attemptedAt: new Date()
      }
    });
  } catch (error) {
    console.error("[Billing] Error logging billing attempt:", error);
    // Don't fail the request if logging fails
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const shop = session.shop;

  try {
    // Import plan names for checking
    const { FREE_PLAN, PRO_PLAN, MAX_PLAN, ULTRA_PLAN, ENTERPRISE_PLAN } = await import("../shopify.server");

    // Get active subscription
    const { hasActivePayment, appSubscriptions } = await billing.check({
      plans: [FREE_PLAN, PRO_PLAN, MAX_PLAN, ULTRA_PLAN, ENTERPRISE_PLAN],
      isTest: process.env.NODE_ENV === 'development',
    });
    const activeSubscription = appSubscriptions?.[0];

    // Determine current plan name
    let currentPlanName = 'RewardsPro Free'; // Default to Free if no active subscription
    if (activeSubscription?.name === 'RewardsPro Free') {
      currentPlanName = 'RewardsPro Free';
    } else if (activeSubscription?.name === 'RewardsPro Pro') {
      currentPlanName = 'RewardsPro Pro';
    } else if (activeSubscription?.name === 'RewardsPro Max') {
      currentPlanName = 'RewardsPro Max';
    } else if (activeSubscription?.name === 'RewardsPro Ultra') {
      currentPlanName = 'RewardsPro Ultra';
    } else if (activeSubscription?.name === 'RewardsPro Enterprise') {
      currentPlanName = 'RewardsPro Enterprise';
    } else if (!hasActivePayment) {
      // No active payment means Free plan
      currentPlanName = 'RewardsPro Free';
    }

    return json({
      hasActivePayment,
      activeSubscription,
      currentPlanName
    });
  } catch (error) {
    console.error("[Billing] Loader error:", error);
    throw new Response("Failed to load billing data", { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const action = formData.get("action") as string;

  // Security: Plan validation (free plan accessible but hidden)
  const ALLOWED_PLANS = ['free', 'pro', 'max', 'ultra', 'contact-enterprise'];
  const planType = action?.replace('subscribe-', '');

  if (action?.startsWith('subscribe-') && !ALLOWED_PLANS.includes(planType)) {
    console.error(`[Billing] Invalid plan attempt: ${action} from shop: ${session.shop}`);
    await logBillingAttempt(session.shop, action, planType, false, "Invalid plan selected", request);
    return json({
      success: false,
      error: "Invalid plan selected"
    }, { status: 400 });
  }

  // Security: Rate limiting
  if (action?.startsWith('subscribe-')) {
    const recentAttempts = await checkRecentBillingAttempts(session.shop);
    if (recentAttempts > 5) {
      console.warn(`[Billing] Rate limit exceeded for shop: ${session.shop} (${recentAttempts} attempts in 15 minutes)`);
      await logBillingAttempt(session.shop, action, planType, false, "Rate limit exceeded", request);
      return json({
        success: false,
        error: "Too many subscription attempts. Please try again later."
      }, { status: 429 });
    }
  }

  // Security: Log subscription attempts
  console.log(`[Billing] ${session.shop} attempting action: ${action}`);

  // Free plan subscription (accessible but hidden)
  if (action === "subscribe-free") {
    console.log(`[Billing] ${session.shop} subscribing to Free plan`);
    // Free plan - just return success (no billing required)
    await logBillingAttempt(session.shop, action, "free", true, null, request);
    return json({ success: true, message: "Switched to Free plan" });
  }

  if (action === "subscribe-pro") {
    console.log(`[Billing] ${session.shop} attempting to subscribe to Pro plan`);
    const billingCheck = await billing.require({
      plans: [PRO_PLAN],
      onFailure: () => billing.request({
        plan: PRO_PLAN,
        isTest: process.env.NODE_ENV === 'development',
      }),
    });

    const subscription = billingCheck.appSubscriptions[0];
    console.log(`[Billing] ${session.shop} successfully subscribed to Pro plan`);
    await logBillingAttempt(session.shop, action, "pro", true, null, request);

    // Update plan limit and unlock shop
    await updatePlanLimit(session.shop, "RewardsPro Pro", 500);
    await unlockShop(session.shop);
    console.log(`[Billing] ${session.shop} unlocked after Pro upgrade`);

    return json({ success: true, subscription, unlocked: true });
  }

  if (action === "subscribe-max") {
    console.log(`[Billing] ${session.shop} attempting to subscribe to Max plan`);
    const billingCheck = await billing.require({
      plans: [MAX_PLAN],
      onFailure: () => billing.request({
        plan: MAX_PLAN,
        isTest: process.env.NODE_ENV === 'development',
      }),
    });

    const subscription = billingCheck.appSubscriptions[0];
    console.log(`[Billing] ${session.shop} successfully subscribed to Max plan`);
    await logBillingAttempt(session.shop, action, "max", true, null, request);

    // Update plan limit and unlock shop
    await updatePlanLimit(session.shop, "RewardsPro Max", 2000);
    await unlockShop(session.shop);
    console.log(`[Billing] ${session.shop} unlocked after Max upgrade`);

    return json({ success: true, subscription, unlocked: true });
  }

  if (action === "subscribe-ultra") {
    console.log(`[Billing] ${session.shop} attempting to subscribe to Ultra plan`);
    const billingCheck = await billing.require({
      plans: [ULTRA_PLAN],
      onFailure: () => billing.request({
        plan: ULTRA_PLAN,
        isTest: process.NODE_ENV === 'development',
      }),
    });

    const subscription = billingCheck.appSubscriptions[0];
    console.log(`[Billing] ${session.shop} successfully subscribed to Ultra plan`);
    await logBillingAttempt(session.shop, action, "ultra", true, null, request);

    // Update plan limit and unlock shop (Ultra = unlimited)
    await updatePlanLimit(session.shop, "RewardsPro Ultra", 999999);
    await unlockShop(session.shop);
    console.log(`[Billing] ${session.shop} unlocked after Ultra upgrade`);

    return json({ success: true, subscription, unlocked: true });
  }

  if (action === "contact-enterprise") {
    // Store enterprise inquiry in database
    const companyName = formData.get("companyName") as string;
    const email = formData.get("email") as string;
    const phone = formData.get("phone") as string;
    const requirements = formData.get("requirements") as string;

    // Log the enterprise inquiry attempt
    await logBillingAttempt(
      session.shop,
      action,
      "enterprise",
      true,
      null,
      request
    );

    // Here you would typically save this to your database or send to a CRM
    // For now, we'll just log it and return success
    console.log("[Enterprise Inquiry]", {
      shop: session.shop,
      companyName,
      email,
      phone,
      requirements,
      timestamp: new Date().toISOString()
    });

    return json({
      success: true,
      message: "Thank you for your interest! Our enterprise team will contact you within 24 hours.",
      isEnterpriseInquiry: true
    });
  }

  return json({ success: false });
};

export default function BillingPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [selectedTab, setSelectedTab] = useState(0);
  const [showEnterpriseModal, setShowEnterpriseModal] = useState(false);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [enterpriseForm, setEnterpriseForm] = useState({
    companyName: "",
    email: "",
    phone: "",
    requirements: ""
  });
  const [toastActive, setToastActive] = useState(false);

  // FAQ collapsible states
  const [faqOpen, setFaqOpen] = useState<{[key: string]: boolean}>({
    changeTime: false,
    billing: false,
    enterprise: false,
    freeLimit: false,
    trial: false,
    cancellation: false,
    dataRetention: false,
    multiStore: false,
    charges: false,
    support: false
  });

  const handleSubscribe = (plan: string) => {
    const formData = new FormData();
    formData.set("action", `subscribe-${plan}`);
    submit(formData, { method: "post" });
  };

  const handleEnterpriseSubmit = () => {
    const formData = new FormData();
    formData.set("action", "contact-enterprise");
    formData.set("companyName", enterpriseForm.companyName);
    formData.set("email", enterpriseForm.email);
    formData.set("phone", enterpriseForm.phone);
    formData.set("requirements", enterpriseForm.requirements);
    submit(formData, { method: "post" });
    setShowEnterpriseModal(false);
    setToastActive(true);
  };

  const currentPlan = data.currentPlanName;

  // Free plan hidden from display but still functional for existing users
  const individualPlans = [
    // Removed Free plan to encourage upgrades
    {
      name: "Pro",
      id: "pro",
      price: "$39",
      description: "Everything you need to grow your loyalty program",
      features: [
        "Up to 2,000 customers",
        "500 orders/month",
        "Batch processing cashback",
        "1,000 emails/month",
        "Priority support",
        "Advanced analytics",
        "$10 per 100 extra orders"
      ],
      buttonText: currentPlan === "RewardsPro Pro" ? "Current Plan" : "Upgrade to Pro",
      isCurrentPlan: currentPlan === "RewardsPro Pro",
      recommended: false
    },
    {
      name: "Max",
      id: "max",
      price: "$149",
      description: "For established businesses with advanced needs",
      features: [
        "Unlimited customers",
        "2,000 orders/month",
        "Sell tier memberships",
        "White label email",
        "5,000 emails/month",
        "Advanced analytics",
        "Phone support",
        "$5 per 100 extra orders"
      ],
      buttonText: currentPlan === "RewardsPro Max" ? "Current Plan" : "Upgrade to Max",
      isCurrentPlan: currentPlan === "RewardsPro Max",
      recommended: true
    },
    {
      name: "Ultra",
      id: "ultra",
      price: "$499",
      description: "Unlimited everything for growing enterprises",
      features: [
        "Unlimited customers",
        "Unlimited orders",
        "Unlimited emails",
        "Full white label solution",
        "Custom SMTP integration",
        "A/B testing",
        "Dedicated support",
        "No overage charges"
      ],
      buttonText: currentPlan === "RewardsPro Ultra" ? "Current Plan" : "Upgrade to Ultra",
      isCurrentPlan: currentPlan === "RewardsPro Ultra",
      recommended: false
    }
  ];

  const enterprisePlan = {
    name: "Enterprise",
    id: "enterprise",
    price: "Custom",
    description: "Tailored solutions for large-scale operations",
    features: [
      "Everything in Ultra",
      "Custom modules & features",
      "Dedicated infrastructure",
      "Multi-store support",
      "Custom development",
      "24/7 phone & email support",
      "Dedicated success team",
      "Custom contracts & billing",
      "On-premise deployment option"
    ],
    buttonText: "Contact Sales",
    isCurrentPlan: currentPlan === "RewardsPro Enterprise",
    recommended: false,
    isEnterprise: true
  };

  const tabs = [
    {
      id: 'individual',
      content: 'Individual',
      panelID: 'individual-content',
    },
    {
      id: 'enterprise',
      content: 'Team & Enterprise',
      panelID: 'enterprise-content',
    },
    {
      id: 'api',
      content: 'API',
      panelID: 'api-content',
    },
  ];

  // Show toast if enterprise inquiry was submitted
  useEffect(() => {
    if (actionData?.isEnterpriseInquiry && actionData?.success) {
      setToastActive(true);
    }
  }, [actionData]);

  return (
    <Frame>
      <Page
        title="Choose Your Plan"
        subtitle="Select the perfect plan for your business"
        backAction={{ url: "/app" }}
      >
        <Layout>
          <Layout.Section>
            <BlockStack gap="600">
              {/* Success/Error Banners */}
              {actionData?.success && !actionData?.isEnterpriseInquiry && (
                <Banner tone="success">
                  <p>{actionData.message || "Subscription updated successfully"}</p>
                </Banner>
              )}

              {/* Tabs for plan categories */}
              <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                {/* Individual Plans Tab */}
                {selectedTab === 0 && (
                  <div style={{ paddingTop: '16px' }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: '16px',
                      marginBottom: '24px'
                    }}>
                      {individualPlans.map((plan) => (
                  <Card key={plan.id}>
                    <Box padding="600">
                      <BlockStack gap="400">
                        {/* Plan Header */}
                        <InlineStack align="space-between">
                          <Text as="h3" variant="headingLg">
                            {plan.name}
                          </Text>
                          {plan.recommended && (
                            <Badge tone="info">Recommended</Badge>
                          )}
                          {plan.isCurrentPlan && (
                            <Badge tone="success">Current</Badge>
                          )}
                          {plan.isEnterprise && (
                            <Badge tone="magic">Custom</Badge>
                          )}
                        </InlineStack>

                        {/* Price */}
                        <BlockStack gap="200">
                          <InlineStack align="start" gap="100">
                            <Text as="p" variant="heading2xl">
                              {plan.price}
                            </Text>
                            {!plan.isEnterprise && (
                              <Text as="span" variant="bodyLg" tone="subdued">
                                /month
                              </Text>
                            )}
                          </InlineStack>
                        </BlockStack>

                        {/* Description */}
                        <Text as="p" variant="bodyMd" tone="subdued">
                          {plan.description}
                        </Text>

                        {/* Action Button */}
                        {plan.isEnterprise ? (
                          <Button
                            fullWidth
                            size="large"
                            variant="primary"
                            onClick={() => setShowEnterpriseModal(true)}
                            icon={PhoneIcon}
                          >
                            {plan.buttonText}
                          </Button>
                        ) : (
                          <Button
                            fullWidth
                            size="large"
                            variant={plan.isCurrentPlan ? "secondary" : (plan.recommended ? "primary" : "primary")}
                            disabled={plan.isCurrentPlan}
                            onClick={() => handleSubscribe(plan.id)}
                          >
                            {plan.buttonText}
                          </Button>
                        )}

                        <Divider />

                        {/* Features List */}
                        <BlockStack gap="300" align="start">
                          <Text as="p" variant="bodyMd" fontWeight="semibold" alignment="start">
                            What's included:
                          </Text>
                          <BlockStack gap="200" align="start">
                            {plan.features.map((feature, index) => (
                              <InlineStack key={index} gap="200" align="start" blockAlign="start">
                                <div style={{ flexShrink: 0 }}>
                                  <Icon source={CheckCircleIcon} tone="positive" />
                                </div>
                                <Text as="p" variant="bodyMd" alignment="start">{feature}</Text>
                              </InlineStack>
                            ))}
                          </BlockStack>
                        </BlockStack>
                      </BlockStack>
                    </Box>
                  </Card>
                      ))}
                    </div>

                    {/* Plan Comparison Button - Centered */}
                    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '24px' }}>
                      <Button
                        onClick={() => setShowComparisonModal(true)}
                        variant="plain"
                      >
                        View plan comparison
                      </Button>
                    </div>
                  </div>
                )}

                {/* Team & Enterprise Tab */}
                {selectedTab === 1 && (
                  <div style={{ paddingTop: '16px' }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                      gap: '16px',
                      marginBottom: '24px'
                    }}>
                      <Card>
                        <Box padding="600">
                          <BlockStack gap="400">
                            {/* Plan Header */}
                            <InlineStack align="space-between">
                              <Text as="h3" variant="headingLg">
                                {enterprisePlan.name}
                              </Text>
                              {enterprisePlan.isCurrentPlan && (
                                <Badge tone="success">Current</Badge>
                              )}
                              <Badge tone="magic">Custom</Badge>
                            </InlineStack>

                            {/* Price */}
                            <BlockStack gap="200">
                              <InlineStack align="start" gap="100">
                                <Text as="p" variant="heading2xl">
                                  {enterprisePlan.price}
                                </Text>
                              </InlineStack>
                            </BlockStack>

                            {/* Description */}
                            <Text as="p" variant="bodyMd" tone="subdued">
                              {enterprisePlan.description}
                            </Text>

                            {/* Action Button */}
                            <Button
                              fullWidth
                              size="large"
                              variant="primary"
                              onClick={() => setShowEnterpriseModal(true)}
                              icon={PhoneIcon}
                            >
                              {enterprisePlan.buttonText}
                            </Button>

                            <Divider />

                            {/* Features List */}
                            <BlockStack gap="300" align="start">
                              <Text as="p" variant="bodyMd" fontWeight="semibold" alignment="start">
                                What's included:
                              </Text>
                              <BlockStack gap="200" align="start">
                                {enterprisePlan.features.map((feature, index) => (
                                  <InlineStack key={index} gap="200" align="start" blockAlign="start">
                                    <div style={{ flexShrink: 0 }}>
                                      <Icon source={CheckCircleIcon} tone="positive" />
                                    </div>
                                    <Text as="p" variant="bodyMd" alignment="start">{feature}</Text>
                                  </InlineStack>
                                ))}
                              </BlockStack>
                            </BlockStack>
                          </BlockStack>
                        </Box>
                      </Card>
                    </div>

                    {/* Enterprise Benefits Section */}
                    <Card>
                <Box padding="600">
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text as="h2" variant="headingLg">
                        Why Choose Enterprise?
                      </Text>
                      <Badge tone="magic">Scalable Solution</Badge>
                    </InlineStack>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                      gap: '16px'
                    }}>
                      <BlockStack gap="200">
                        <Text as="h3" variant="headingMd">Custom Modules</Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Build custom features tailored to your unique business requirements. Our team will work with you to develop modules that perfectly fit your workflow.
                        </Text>
                      </BlockStack>

                      <BlockStack gap="200">
                        <Text as="h3" variant="headingMd">Dedicated Support</Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Get a dedicated success team, 24/7 priority support, and direct access to our engineering team for rapid issue resolution.
                        </Text>
                      </BlockStack>

                      <BlockStack gap="200">
                        <Text as="h3" variant="headingMd">Flexible Infrastructure</Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Choose between cloud or on-premise deployment. Scale infinitely with dedicated infrastructure designed for your needs.
                        </Text>
                      </BlockStack>
                    </div>

                    <Divider />

                    <InlineStack align="center" gap="400">
                      <Button variant="primary" size="large" onClick={() => setShowEnterpriseModal(true)}>
                        Get Enterprise Quote
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Box>
              </Card>
                  </div>
                )}

                {/* API Tab */}
                {selectedTab === 2 && (
                  <div style={{ paddingTop: '16px' }}>
                    <Card>
                      <Box padding="600">
                        <BlockStack gap="400">
                          <Text as="h2" variant="headingLg">
                            API Access & Developer Tools
                          </Text>

                          <Text as="p" variant="bodyMd" tone="subdued">
                            Build custom integrations and extend RewardsPro functionality with our comprehensive API.
                          </Text>

                          <Divider />

                          <BlockStack gap="300">
                            <Text as="h3" variant="headingMd">
                              Available Endpoints
                            </Text>

                            <BlockStack gap="200" align="start">
                              <InlineStack gap="200" align="start">
                                <div style={{ flexShrink: 0 }}>
                                  <Icon source={CheckCircleIcon} tone="positive" />
                                </div>
                                <Text as="p" variant="bodyMd">Customer management API</Text>
                              </InlineStack>

                              <InlineStack gap="200" align="start">
                                <div style={{ flexShrink: 0 }}>
                                  <Icon source={CheckCircleIcon} tone="positive" />
                                </div>
                                <Text as="p" variant="bodyMd">Store credit balance API</Text>
                              </InlineStack>

                              <InlineStack gap="200" align="start">
                                <div style={{ flexShrink: 0 }}>
                                  <Icon source={CheckCircleIcon} tone="positive" />
                                </div>
                                <Text as="p" variant="bodyMd">Tier management API</Text>
                              </InlineStack>

                              <InlineStack gap="200" align="start">
                                <div style={{ flexShrink: 0 }}>
                                  <Icon source={CheckCircleIcon} tone="positive" />
                                </div>
                                <Text as="p" variant="bodyMd">Webhook subscriptions</Text>
                              </InlineStack>

                              <InlineStack gap="200" align="start">
                                <div style={{ flexShrink: 0 }}>
                                  <Icon source={CheckCircleIcon} tone="positive" />
                                </div>
                                <Text as="p" variant="bodyMd">Analytics & reporting API</Text>
                              </InlineStack>
                            </BlockStack>
                          </BlockStack>

                          <Divider />

                          <BlockStack gap="300">
                            <Text as="h3" variant="headingMd">
                              API Access Included In
                            </Text>

                            <InlineStack gap="400">
                              <Badge tone="success">Pro Plan</Badge>
                              <Badge tone="success">Max Plan</Badge>
                              <Badge tone="magic">Enterprise Plan</Badge>
                            </InlineStack>

                            <Text as="p" variant="bodyMd" tone="subdued">
                              API access is available starting with the Pro plan. Higher tiers include increased rate limits and priority support.
                            </Text>
                          </BlockStack>

                          <Divider />

                          <BlockStack gap="200">
                            <Button fullWidth size="large" variant="primary" url="/app/settings#api-keys">
                              View API Documentation
                            </Button>
                            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                              API keys can be generated from the Settings page after subscribing to a compatible plan.
                            </Text>
                          </BlockStack>
                        </BlockStack>
                      </Box>
                    </Card>
                  </div>
                )}
              </Tabs>

              {/* FAQ Section */}
              <Card>
                <Box padding="400">
                  <Text as="h3" variant="headingLg" alignment="start">Frequently Asked Questions</Text>

                  <Box paddingBlockStart="400">
                    <BlockStack gap="0">
                      {/* Question 1 */}
                      <Box
                        padding="400"
                        borderBlockEndWidth="025"
                        borderColor="border-secondary"
                      >
                        <Button
                          variant="plain"
                          fullWidth
                          textAlign="start"
                          onClick={() => setFaqOpen({...faqOpen, changeTime: !faqOpen.changeTime})}
                          icon={faqOpen.changeTime ? ChevronUpIcon : ChevronDownIcon}
                          disclosure={faqOpen.changeTime ? "up" : "down"}
                        >
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            Can I upgrade or downgrade my plan at any time?
                          </Text>
                        </Button>
                        <Collapsible
                          open={faqOpen.changeTime}
                          id="faq-change-time"
                          transition={{duration: '200ms', timingFunction: 'ease-in-out'}}
                        >
                          <Box paddingBlockStart="200">
                            <Text as="p" variant="bodyMd" tone="subdued">
                              Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately. When you upgrade, you'll be charged the prorated amount for the remainder of the billing cycle. When you downgrade, credits will be applied to your next invoice.
                            </Text>
                          </Box>
                        </Collapsible>
                      </Box>

                      {/* Question 2 */}
                      <Box
                        padding="400"
                        borderBlockEndWidth="025"
                        borderColor="border-secondary"
                      >
                        <Button
                          variant="plain"
                          fullWidth
                          textAlign="start"
                          onClick={() => setFaqOpen({...faqOpen, billing: !faqOpen.billing})}
                          icon={faqOpen.billing ? ChevronUpIcon : ChevronDownIcon}
                          disclosure={faqOpen.billing ? "up" : "down"}
                        >
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            How does billing work?
                          </Text>
                        </Button>
                        <Collapsible
                          open={faqOpen.billing}
                          id="faq-billing"
                          transition={{duration: '200ms', timingFunction: 'ease-in-out'}}
                        >
                          <Box paddingBlockStart="200">
                            <Text as="p" variant="bodyMd" tone="subdued">
                              All plans are billed monthly through your Shopify invoice. The charge appears on your regular Shopify bill, making it simple to manage all your expenses in one place. Enterprise plans can have custom billing arrangements including annual contracts or custom payment terms.
                            </Text>
                          </Box>
                        </Collapsible>
                      </Box>

                      {/* Question 3 */}
                      <Box
                        padding="400"
                        borderBlockEndWidth="025"
                        borderColor="border-secondary"
                      >
                        <Button
                          variant="plain"
                          fullWidth
                          textAlign="start"
                          onClick={() => setFaqOpen({...faqOpen, enterprise: !faqOpen.enterprise})}
                          icon={faqOpen.enterprise ? ChevronUpIcon : ChevronDownIcon}
                          disclosure={faqOpen.enterprise ? "up" : "down"}
                        >
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            What makes Enterprise different?
                          </Text>
                        </Button>
                        <Collapsible
                          open={faqOpen.enterprise}
                          id="faq-enterprise"
                          transition={{duration: '200ms', timingFunction: 'ease-in-out'}}
                        >
                          <Box paddingBlockStart="200">
                            <Text as="p" variant="bodyMd" tone="subdued">
                              Enterprise plans include custom development, dedicated infrastructure, and the ability to build custom modules specific to your business needs. You get a dedicated success team, 24/7 priority support, custom integrations, and the flexibility to scale infinitely. Pricing is tailored to your specific requirements and usage patterns.
                            </Text>
                          </Box>
                        </Collapsible>
                      </Box>

                      {/* Question 4 - Free Plan Limits */}
                      <Box
                        padding="400"
                        borderBlockEndWidth="025"
                        borderColor="border-secondary"
                      >
                        <Button
                          variant="plain"
                          fullWidth
                          textAlign="start"
                          onClick={() => setFaqOpen({...faqOpen, freeLimit: !faqOpen.freeLimit})}
                          icon={faqOpen.freeLimit ? ChevronUpIcon : ChevronDownIcon}
                          disclosure={faqOpen.freeLimit ? "up" : "down"}
                        >
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            What happens when I exceed my plan limits?
                          </Text>
                        </Button>
                        <Collapsible
                          open={faqOpen.freeLimit}
                          id="faq-free-limit"
                          transition={{duration: '200ms', timingFunction: 'ease-in-out'}}
                        >
                          <Box paddingBlockStart="200">
                            <Text as="p" variant="bodyMd" tone="subdued">
                              Pro and Max plans have overage pricing for orders beyond your monthly limit. Pro plan charges $10 per 100 additional orders, Max plan charges $5 per 100 additional orders. Ultra plan has no limits - everything is unlimited. We'll notify you when you're approaching your limits so you can upgrade if needed.
                            </Text>
                          </Box>
                        </Collapsible>
                      </Box>

                      {/* Question 5 - Trial Period */}
                      <Box
                        padding="400"
                        borderBlockEndWidth="025"
                        borderColor="border-secondary"
                      >
                        <Button
                          variant="plain"
                          fullWidth
                          textAlign="start"
                          onClick={() => setFaqOpen({...faqOpen, trial: !faqOpen.trial})}
                          icon={faqOpen.trial ? ChevronUpIcon : ChevronDownIcon}
                          disclosure={faqOpen.trial ? "up" : "down"}
                        >
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            Is there a free trial for paid plans?
                          </Text>
                        </Button>
                        <Collapsible
                          open={faqOpen.trial}
                          id="faq-trial"
                          transition={{duration: '200ms', timingFunction: 'ease-in-out'}}
                        >
                          <Box paddingBlockStart="200">
                            <Text as="p" variant="bodyMd" tone="subdued">
                              Yes! All plans come with a 14-day free trial. You won't be charged until the trial ends, and you can cancel anytime during the trial without any charges.
                            </Text>
                          </Box>
                        </Collapsible>
                      </Box>

                      {/* Question 6 - Cancellation */}
                      <Box
                        padding="400"
                        borderBlockEndWidth="025"
                        borderColor="border-secondary"
                      >
                        <Button
                          variant="plain"
                          fullWidth
                          textAlign="start"
                          onClick={() => setFaqOpen({...faqOpen, cancellation: !faqOpen.cancellation})}
                          icon={faqOpen.cancellation ? ChevronUpIcon : ChevronDownIcon}
                          disclosure={faqOpen.cancellation ? "up" : "down"}
                        >
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            Can I cancel my subscription anytime?
                          </Text>
                        </Button>
                        <Collapsible
                          open={faqOpen.cancellation}
                          id="faq-cancellation"
                          transition={{duration: '200ms', timingFunction: 'ease-in-out'}}
                        >
                          <Box paddingBlockStart="200">
                            <Text as="p" variant="bodyMd" tone="subdued">
                              Yes, you can cancel your subscription at any time with no cancellation fees. When you cancel, you'll continue to have access to the paid features until the end of your current billing cycle. After that, you'll need to select a new plan to continue using the app.
                            </Text>
                          </Box>
                        </Collapsible>
                      </Box>

                      {/* Question 7 - Data Retention */}
                      <Box
                        padding="400"
                        borderBlockEndWidth="025"
                        borderColor="border-secondary"
                      >
                        <Button
                          variant="plain"
                          fullWidth
                          textAlign="start"
                          onClick={() => setFaqOpen({...faqOpen, dataRetention: !faqOpen.dataRetention})}
                          icon={faqOpen.dataRetention ? ChevronUpIcon : ChevronDownIcon}
                          disclosure={faqOpen.dataRetention ? "up" : "down"}
                        >
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            What happens to my data if I cancel or downgrade?
                          </Text>
                        </Button>
                        <Collapsible
                          open={faqOpen.dataRetention}
                          id="faq-data-retention"
                          transition={{duration: '200ms', timingFunction: 'ease-in-out'}}
                        >
                          <Box paddingBlockStart="200">
                            <Text as="p" variant="bodyMd" tone="subdued">
                              Your data is always safe with us. If you cancel or downgrade, all your customer data, tier configurations, and store credit balances are preserved. You can upgrade again at any time and pick up right where you left off. We never delete your data unless you explicitly request it or uninstall the app.
                            </Text>
                          </Box>
                        </Collapsible>
                      </Box>

                      {/* Question 8 - Multiple Stores */}
                      <Box
                        padding="400"
                        borderBlockEndWidth="025"
                        borderColor="border-secondary"
                      >
                        <Button
                          variant="plain"
                          fullWidth
                          textAlign="start"
                          onClick={() => setFaqOpen({...faqOpen, multiStore: !faqOpen.multiStore})}
                          icon={faqOpen.multiStore ? ChevronUpIcon : ChevronDownIcon}
                          disclosure={faqOpen.multiStore ? "up" : "down"}
                        >
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            Can I use RewardsPro on multiple stores?
                          </Text>
                        </Button>
                        <Collapsible
                          open={faqOpen.multiStore}
                          id="faq-multi-store"
                          transition={{duration: '200ms', timingFunction: 'ease-in-out'}}
                        >
                          <Box paddingBlockStart="200">
                            <Text as="p" variant="bodyMd" tone="subdued">
                              Each Shopify store requires its own RewardsPro subscription. However, Enterprise plans can include multi-store support with centralized management and special pricing for multiple locations. Contact our sales team to discuss multi-store options.
                            </Text>
                          </Box>
                        </Collapsible>
                      </Box>

                      {/* Question 9 - When Charged */}
                      <Box
                        padding="400"
                        borderBlockEndWidth="025"
                        borderColor="border-secondary"
                      >
                        <Button
                          variant="plain"
                          fullWidth
                          textAlign="start"
                          onClick={() => setFaqOpen({...faqOpen, charges: !faqOpen.charges})}
                          icon={faqOpen.charges ? ChevronUpIcon : ChevronDownIcon}
                          disclosure={faqOpen.charges ? "up" : "down"}
                        >
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            When will I be charged?
                          </Text>
                        </Button>
                        <Collapsible
                          open={faqOpen.charges}
                          id="faq-charges"
                          transition={{duration: '200ms', timingFunction: 'ease-in-out'}}
                        >
                          <Box paddingBlockStart="200">
                            <Text as="p" variant="bodyMd" tone="subdued">
                              Charges appear on your regular Shopify invoice. After your 14-day free trial, you'll be charged monthly on the same billing cycle as your Shopify subscription. There are no setup fees, hidden charges, or long-term contracts. The price you see is the price you pay.
                            </Text>
                          </Box>
                        </Collapsible>
                      </Box>

                      {/* Question 10 - Support */}
                      <Box
                        padding="400"
                      >
                        <Button
                          variant="plain"
                          fullWidth
                          textAlign="start"
                          onClick={() => setFaqOpen({...faqOpen, support: !faqOpen.support})}
                          icon={faqOpen.support ? ChevronUpIcon : ChevronDownIcon}
                          disclosure={faqOpen.support ? "up" : "down"}
                        >
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            What kind of support is included?
                          </Text>
                        </Button>
                        <Collapsible
                          open={faqOpen.support}
                          id="faq-support"
                          transition={{duration: '200ms', timingFunction: 'ease-in-out'}}
                        >
                          <Box paddingBlockStart="200">
                            <Text as="p" variant="bodyMd" tone="subdued">
                              Pro plan includes priority email support with 24-hour response time and access to our knowledge base. Max plan adds phone support and white label features. Ultra plan includes dedicated support with no limits on anything. Enterprise includes 24/7 phone & email support with a dedicated success team.
                            </Text>
                          </Box>
                        </Collapsible>
                      </Box>
                    </BlockStack>
                  </Box>
                </Box>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

        {/* Plan Comparison Modal */}
        <Modal
          open={showComparisonModal}
          onClose={() => setShowComparisonModal(false)}
          title="Plan Comparison"
          large
        >
          <Modal.Section>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f6f6f7' }}>
                    <th style={{ padding: '16px', textAlign: 'left', borderBottom: '1px solid #e1e3e5' }}></th>
                    <th style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="h3" variant="headingMd">Free</Text>
                    </th>
                    <th style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="h3" variant="headingMd">Pro</Text>
                    </th>
                    <th style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="h3" variant="headingMd">Max</Text>
                    </th>
                    <th style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="h3" variant="headingMd">Ultra</Text>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Order volume section */}
                  <tr>
                    <td colSpan={5} style={{ padding: '12px 16px', backgroundColor: '#f6f6f7' }}>
                      <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">Order volume</Text>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Monthly orders</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Up to 200</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Up to 500</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Up to 2,000</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Unlimited</Text>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Additional order rate</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">$10 per 100 orders</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">$5 per 100 orders</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">No overage charges</Text>
                    </td>
                  </tr>

                  {/* Features section */}
                  <tr>
                    <td colSpan={5} style={{ padding: '12px 16px', backgroundColor: '#f6f6f7' }}>
                      <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">Features</Text>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Loyalty program</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Tier memberships</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Advanced analytics</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">White label email</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">A/B testing</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Custom SMTP</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                  </tr>

                  {/* Processing & Operations section */}
                  <tr>
                    <td colSpan={5} style={{ padding: '12px 16px', backgroundColor: '#f6f6f7' }}>
                      <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">Processing & Operations</Text>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Batch cashback processing</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Customer bulk sync</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Limited</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Incremental order sync</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Store credit ledger</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                  </tr>

                  {/* Customer Experience section */}
                  <tr>
                    <td colSpan={5} style={{ padding: '12px 16px', backgroundColor: '#f6f6f7' }}>
                      <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">Customer Experience</Text>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Customer portal widget</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Multi-currency support</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">5 currencies</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">15 currencies</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">33 currencies</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">All currencies</Text>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Widget localization</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">English only</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Subscription management</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                  </tr>

                  {/* Support section */}
                  <tr>
                    <td colSpan={5} style={{ padding: '12px 16px', backgroundColor: '#f6f6f7' }}>
                      <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">Support</Text>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Email support</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Standard</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Priority</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Priority</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Dedicated</Text>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Phone support</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd" tone="subdued">—</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">Response time</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">48 hours</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">24 hours</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">12 hours</Text>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid #e1e3e5' }}>
                      <Text as="p" variant="bodyMd">1 hour</Text>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Modal.Section>
        </Modal>

        {/* Enterprise Contact Modal */}
        <Modal
          open={showEnterpriseModal}
          onClose={() => setShowEnterpriseModal(false)}
          title="Contact Enterprise Sales"
          primaryAction={{
            content: "Submit Inquiry",
            onAction: handleEnterpriseSubmit,
            disabled: !enterpriseForm.email || !enterpriseForm.companyName,
            loading: isSubmitting
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setShowEnterpriseModal(false),
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Company Name"
                value={enterpriseForm.companyName}
                onChange={(value) => setEnterpriseForm({...enterpriseForm, companyName: value})}
                autoComplete="organization"
                requiredIndicator
              />

              <TextField
                label="Business Email"
                type="email"
                value={enterpriseForm.email}
                onChange={(value) => setEnterpriseForm({...enterpriseForm, email: value})}
                autoComplete="email"
                requiredIndicator
                helpText="We'll use this to contact you about your inquiry"
              />

              <TextField
                label="Phone Number"
                type="tel"
                value={enterpriseForm.phone}
                onChange={(value) => setEnterpriseForm({...enterpriseForm, phone: value})}
                autoComplete="tel"
                helpText="Optional - for faster response"
              />

              <TextField
                label="Tell us about your requirements"
                value={enterpriseForm.requirements}
                onChange={(value) => setEnterpriseForm({...enterpriseForm, requirements: value})}
                multiline={4}
                helpText="Describe your custom module needs, expected volume, special requirements, etc."
              />

              <Banner tone="info" icon={EmailIcon}>
                <p>
                  Our enterprise team typically responds within 24 hours with a custom solution tailored to your needs.
                </p>
              </Banner>
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Success Toast */}
        {toastActive && (
          <Toast
            content={actionData?.message || "Your inquiry has been submitted successfully!"}
            onDismiss={() => setToastActive(false)}
            duration={5000}
          />
        )}
      </Page>
    </Frame>
  );
}