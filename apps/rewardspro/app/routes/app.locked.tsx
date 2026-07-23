/**
 * Locked State Page
 * Displayed when merchant reaches monthly order limit
 */

import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  EmptyState,
  Button,
  BlockStack,
  Text,
  Banner,
  Card,
  Box,
  InlineStack,
  Icon,
  ProgressBar,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  CalendarIcon,
  AlertTriangleIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import { checkPlanAccess } from "~/utils/plan-access-control.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const accessCheck = await checkPlanAccess(session.shop);

  return json({ accessCheck });
};

export default function LockedPage() {
  const { accessCheck } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Page>
      <BlockStack gap="600">
        {/* Main Alert Banner */}
        <Banner tone="critical" title="Monthly Order Limit Reached">
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd">
              Your <Text as="span" fontWeight="semibold">{accessCheck.planName}</Text> plan includes{" "}
              <Text as="span" fontWeight="semibold">{accessCheck.planLimit.toLocaleString()}</Text> orders per month.
              You've processed{" "}
              <Text as="span" fontWeight="semibold">{accessCheck.orderCount.toLocaleString()}</Text> orders this month.
            </Text>
            {accessCheck.reason && (
              <Text as="p" variant="bodyMd" tone="subdued">
                {accessCheck.reason}
              </Text>
            )}
          </BlockStack>
        </Banner>

        {/* Empty State with Upgrade CTA */}
        <Card>
          <Box padding="600">
            <EmptyState
              heading="App Access Temporarily Limited"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              action={{
                content: "Upgrade Plan",
                onAction: () => navigate('/app/billing'),
              }}
              secondaryAction={{
                content: "View Billing Details",
                onAction: () => navigate('/app/billing'),
              }}
            >
              <BlockStack gap="400">
                <Text as="p" variant="bodyLg" alignment="center">
                  You've reached your monthly order processing limit. Upgrade your plan to continue using all features.
                </Text>

                <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                  Your usage will automatically reset at the beginning of next month, or you can upgrade now for immediate access.
                </Text>
              </BlockStack>
            </EmptyState>
          </Box>
        </Card>

        {/* Usage Stats Card */}
        <Card>
          <Box padding="600">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Current Usage
              </Text>

              <BlockStack gap="300">
                {/* Progress Bar */}
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd" tone="subdued">
                      Orders processed in {accessCheck.currentMonth}
                    </Text>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {accessCheck.orderCount} / {accessCheck.planLimit}
                    </Text>
                  </InlineStack>
                  <ProgressBar
                    progress={accessCheck.usagePercentage}
                    tone="critical"
                    size="small"
                  />
                </BlockStack>

                {/* Stats Grid */}
                <Box paddingBlockStart="400">
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px'
                  }}>
                    <Card background="bg-surface-secondary">
                      <Box padding="400">
                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            <Icon source={CalendarIcon} tone="base" />
                            <Text as="span" variant="bodyMd" tone="subdued">
                              Days until reset
                            </Text>
                          </InlineStack>
                          <Text as="p" variant="headingLg">
                            {accessCheck.daysRemaining} days
                          </Text>
                        </BlockStack>
                      </Box>
                    </Card>

                    <Card background="bg-surface-secondary">
                      <Box padding="400">
                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            <Icon source={AlertTriangleIcon} tone="critical" />
                            <Text as="span" variant="bodyMd" tone="subdued">
                              Current plan
                            </Text>
                          </InlineStack>
                          <Text as="p" variant="headingLg">
                            {accessCheck.planName.replace('RewardsPro ', '')}
                          </Text>
                        </BlockStack>
                      </Box>
                    </Card>
                  </div>
                </Box>
              </BlockStack>
            </BlockStack>
          </Box>
        </Card>

        {/* What Still Works Card */}
        <Card>
          <Box padding="600">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                What's Still Working
              </Text>

              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="start">
                  <div style={{ flexShrink: 0 }}>
                    <Icon source={CheckCircleIcon} tone="success" />
                  </div>
                  <BlockStack gap="100">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      All your data is safe
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Customer data, tier configurations, and store credit balances are preserved
                    </Text>
                  </BlockStack>
                </InlineStack>

                <InlineStack gap="200" blockAlign="start">
                  <div style={{ flexShrink: 0 }}>
                    <Icon source={CheckCircleIcon} tone="success" />
                  </div>
                  <BlockStack gap="100">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      Customers can still use store credit
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Existing store credit can be redeemed at checkout
                    </Text>
                  </BlockStack>
                </InlineStack>

                <InlineStack gap="200" blockAlign="start">
                  <div style={{ flexShrink: 0 }}>
                    <Icon source={CheckCircleIcon} tone="success" />
                  </div>
                  <BlockStack gap="100">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      Automatic reset next month
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Your order count resets automatically on the 1st of next month
                    </Text>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Box>
        </Card>

        {/* Bottom CTA */}
        <Card>
          <Box padding="600">
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Ready to upgrade?
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Get more orders, advanced features, and priority support
                  </Text>
                </BlockStack>
                <Button
                  variant="primary"
                  size="large"
                  onClick={() => navigate('/app/billing')}
                >
                  View Plans
                </Button>
              </InlineStack>
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
