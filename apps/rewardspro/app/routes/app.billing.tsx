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
  Tabs
} from "@shopify/polaris";
import { CheckCircleIcon, PhoneIcon, EmailIcon } from "@shopify/polaris-icons";
import { authenticate, FREE_PLAN, PRO_PLAN, MAX_PLAN, ENTERPRISE_PLAN } from "../shopify.server";
import { db } from "../db.server";
import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

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
    // Get active subscription
    const { hasActivePayment, appSubscriptions } = await billing.check();
    const activeSubscription = appSubscriptions?.[0];

    // Determine current plan name
    let currentPlanName = 'RewardsPro Free';
    if (activeSubscription?.name === 'RewardsPro Pro') {
      currentPlanName = 'RewardsPro Pro';
    } else if (activeSubscription?.name === 'RewardsPro Max') {
      currentPlanName = 'RewardsPro Max';
    } else if (activeSubscription?.name === 'RewardsPro Enterprise') {
      currentPlanName = 'RewardsPro Enterprise';
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

  // Security: Plan validation
  const ALLOWED_PLANS = ['free', 'pro', 'max', 'contact-enterprise'];
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

  if (action === "subscribe-free") {
    console.log(`[Billing] ${session.shop} switching to Free plan`);
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
    return json({ success: true, subscription });
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
    return json({ success: true, subscription });
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
  const [enterpriseForm, setEnterpriseForm] = useState({
    companyName: "",
    email: "",
    phone: "",
    requirements: ""
  });
  const [toastActive, setToastActive] = useState(false);

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

  const individualPlans = [
    {
      name: "Free",
      id: "free",
      price: "$0",
      description: "Perfect for small businesses just getting started with loyalty",
      features: [
        "Up to 100 customers",
        "Basic tier system",
        "Store credit tracking",
        "Email support",
        "Basic analytics"
      ],
      buttonText: currentPlan === "RewardsPro Free" ? "Current Plan" : "Downgrade to Free",
      isCurrentPlan: currentPlan === "RewardsPro Free",
      recommended: false
    },
    {
      name: "Pro",
      id: "pro",
      price: "$49",
      description: "Everything you need to grow your loyalty program",
      features: [
        "Unlimited customers",
        "Advanced tier management",
        "Automated cashback",
        "Priority support",
        "Advanced analytics",
        "Custom branding",
        "API access"
      ],
      buttonText: currentPlan === "RewardsPro Pro" ? "Current Plan" : "Upgrade to Pro",
      isCurrentPlan: currentPlan === "RewardsPro Pro",
      recommended: true
    },
    {
      name: "Max",
      id: "max",
      price: "$199",
      description: "For established businesses with advanced needs",
      features: [
        "Everything in Pro",
        "White-label options",
        "Dedicated account manager",
        "Custom integrations",
        "Advanced reporting",
        "Phone support",
        "SLA guarantee",
        "Custom features on request"
      ],
      buttonText: currentPlan === "RewardsPro Max" ? "Current Plan" : "Upgrade to Max",
      isCurrentPlan: currentPlan === "RewardsPro Max",
      recommended: false
    }
  ];

  const enterprisePlan = {
    name: "Enterprise",
    id: "enterprise",
    price: "Custom",
    description: "Tailored solutions for large-scale operations",
    features: [
      "Everything in Max",
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
                      <Badge tone="magic">For Large Businesses</Badge>
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
                      <Text as="p" variant="bodyMd" tone="subdued">
                        or call us at <strong>1-800-REWARDS</strong>
                      </Text>
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

              {/* Additional Information */}
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingMd">Frequently Asked Questions</Text>

                    <BlockStack gap="400">
                      <BlockStack gap="100">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          Can I change plans at any time?
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately.
                        </Text>
                      </BlockStack>

                      <BlockStack gap="100">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          How does billing work?
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          All plans are billed monthly through your Shopify invoice. Enterprise plans can have custom billing arrangements.
                        </Text>
                      </BlockStack>

                      <BlockStack gap="100">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          What makes Enterprise different?
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Enterprise plans include custom development, dedicated infrastructure, and the ability to build custom modules specific to your business needs. Pricing is tailored to your requirements.
                        </Text>
                      </BlockStack>
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

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
                  Our enterprise team typically responds within 24 hours. For immediate assistance,
                  call <strong>1-800-REWARDS</strong> during business hours.
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