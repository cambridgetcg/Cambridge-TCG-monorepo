/**
 * Billing Page - Clean Plan Comparison View
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData } from "@remix-run/react";
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
  Divider
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

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
    if (activeSubscription?.name === 'RewardsPro Monthly') {
      currentPlanName = 'RewardsPro Monthly';
    } else if (activeSubscription?.name === 'RewardsPro Annual') {
      currentPlanName = 'RewardsPro Annual';
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
  const { billing } = await authenticate.admin(request);

  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "subscribe-free") {
    // Free plan - just return success
    return json({ success: true, message: "Switched to Free plan" });
  }

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

  return json({ success: false });
};

export default function BillingPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  const handleSubscribe = (plan: string) => {
    const formData = new FormData();
    formData.set("action", `subscribe-${plan}`);
    submit(formData, { method: "post" });
  };

  const currentPlan = data.currentPlanName;

  return (
    <Page
      title="Pricing plans"
      backAction={{ url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {/* Success/Error Banners */}
            {actionData?.success && (
              <Banner tone="success">
                <p>{actionData.message || "Subscription updated successfully"}</p>
              </Banner>
            )}

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
                        Starter plan
                      </Text>
                      <Badge tone="info">Recommended</Badge>
                    </InlineStack>

                    <Text as="p" variant="bodyMd" tone="subdued">
                      Everything you need to create an on-brand program your customers will love.
                    </Text>

                    <BlockStack gap="200">
                      <Text as="p" variant="heading2xl">
                        $0
                        <Text as="span" variant="bodyLg" tone="subdued">
                          {" "}USD/month
                        </Text>
                      </Text>
                    </BlockStack>

                    <Button
                      fullWidth
                      variant={currentPlan === "RewardsPro Free" ? "secondary" : "primary"}
                      disabled={currentPlan === "RewardsPro Free"}
                      onClick={() => handleSubscribe('free')}
                    >
                      {currentPlan === "RewardsPro Free" ? "Current Plan" : "Select Starter"}
                    </Button>

                    <Text as="p" variant="bodyMd">
                      Up to 200 monthly orders
                    </Text>

                    <Divider />

                    <BlockStack gap="300">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Popular features
                      </Text>
                      <BlockStack gap="200">
                        <Text as="p" variant="bodyMd">• Points program</Text>
                        <Text as="p" variant="bodyMd">• Referral program</Text>
                        <Text as="p" variant="bodyMd">• Customizable emails</Text>
                        <Text as="p" variant="bodyMd">• Basic reports</Text>
                        <Text as="p" variant="bodyMd">• Community support</Text>
                      </BlockStack>
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>

              {/* Growth Plan Card */}
              <Card>
                <Box padding="600">
                  <BlockStack gap="400">
                    <Text as="h3" variant="headingMd">
                      Growth plan
                    </Text>

                    <Text as="p" variant="bodyMd" tone="subdued">
                      Level up your loyalty program with extras like advanced analytics and priority support.
                    </Text>

                    <BlockStack gap="200">
                      <Text as="p" variant="heading2xl">
                        $49
                        <Text as="span" variant="bodyLg" tone="subdued">
                          {" "}USD/month
                        </Text>
                      </Text>
                    </BlockStack>

                    <Button
                      fullWidth
                      variant={currentPlan === "RewardsPro Monthly" ? "secondary" : "primary"}
                      disabled={currentPlan === "RewardsPro Monthly"}
                      onClick={() => handleSubscribe('monthly')}
                    >
                      {currentPlan === "RewardsPro Monthly" ? "Current Plan" : "Select Growth"}
                    </Button>

                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd">
                        Includes 1,000 monthly orders
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        $0.01 USD per additional order
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="300">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Popular features
                      </Text>
                      <BlockStack gap="200">
                        <Text as="p" variant="bodyMd">• Full-feature loyalty hub</Text>
                        <Text as="p" variant="bodyMd">• Advanced analytics & reporting</Text>
                        <Text as="p" variant="bodyMd">• Custom email templates</Text>
                        <Text as="p" variant="bodyMd">• Priority support</Text>
                        <Text as="p" variant="bodyMd">• API access</Text>
                        <Text as="p" variant="bodyMd">• Unlimited integrations</Text>
                      </BlockStack>
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>

              {/* Plus Plan Card */}
              <Card>
                <Box padding="600">
                  <BlockStack gap="400">
                    <Text as="h3" variant="headingMd">
                      Plus plan
                    </Text>

                    <Text as="p" variant="bodyMd" tone="subdued">
                      Get the best of RewardsPro with more customization and reporting.
                    </Text>

                    <BlockStack gap="200">
                      <Text as="p" variant="heading2xl">
                        $490
                        <Text as="span" variant="bodyLg" tone="subdued">
                          {" "}USD/year
                        </Text>
                      </Text>
                    </BlockStack>

                    <Button
                      fullWidth
                      variant={currentPlan === "RewardsPro Annual" ? "secondary" : "primary"}
                      disabled={currentPlan === "RewardsPro Annual"}
                      onClick={() => handleSubscribe('annual')}
                    >
                      {currentPlan === "RewardsPro Annual" ? "Current Plan" : "Select Plus"}
                    </Button>

                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd">
                        Includes 12,000 annual orders
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        $0.01 USD per additional order
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="300">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Popular features
                      </Text>
                      <BlockStack gap="200">
                        <Text as="p" variant="bodyMd">• Migration and launch plan</Text>
                        <Text as="p" variant="bodyMd">• 30+ specialized reports</Text>
                        <Text as="p" variant="bodyMd">• API access & developer tools</Text>
                        <Text as="p" variant="bodyMd">• Priority support</Text>
                        <Text as="p" variant="bodyMd">• Quarterly program monitoring</Text>
                        <Text as="p" variant="bodyMd">• Security review support</Text>
                      </BlockStack>
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>
            </div>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}