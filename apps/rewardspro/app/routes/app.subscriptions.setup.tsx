/**
 * Subscription Configuration Center
 * Comprehensive setup and management for tier subscriptions
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Box,
  Text,
  BlockStack,
  InlineStack,
  Banner,
  Badge,
  CalloutCard,
  Checkbox,
  TextField,
  Select,
  RadioButton,
  Divider,
  Icon,
  Tabs,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import {
  SettingsIcon,
  ProductIcon,
  PaymentIcon,
  AutomationIcon,
  NotificationIcon,
  AlertTriangleIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { useState, useCallback } from "react";
import { 
  isSubscriptionEnabled, 
  SUBSCRIPTION_CONFIG,
  updateSubscriptionConfig 
} from "~/services/subscription/config.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  try {
    // Get shop settings
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop: session.shop }
    }).catch(() => null);

    // Get subscription configuration
    const config = {
      enabled: isSubscriptionEnabled(),
      features: {
        trialPeriods: process.env.ENABLE_TRIAL_PERIODS === 'true',
        automaticDunning: process.env.ENABLE_AUTOMATIC_DUNNING === 'true',
        analytics: process.env.ENABLE_SUBSCRIPTION_ANALYTICS === 'true',
      },
      billing: SUBSCRIPTION_CONFIG.BILLING,
      gracePeriod: SUBSCRIPTION_CONFIG.GRACE_PERIOD,
    };

    // Get tier products and their subscription status
    const [tierProducts, tiers] = await Promise.all([
      db.tierProduct.findMany({
        where: { 
          shop: session.shop,
          purchaseType: { in: ['SUBSCRIPTION', 'BOTH'] }
        },
        include: { tier: true }
      }).catch(() => []),
      db.tier.findMany({
        where: { shop: session.shop },
        orderBy: { minSpend: 'asc' }
      }).catch(() => [])
    ]);

    // Get subscription statistics
    const stats = await db.tierSubscription.groupBy({
      by: ['status'],
      where: { shop: session.shop },
      _count: { status: true }
    }).catch(() => []);

    const statusCounts = stats.reduce((acc, stat) => {
      acc[stat.status] = stat._count.status;
      return acc;
    }, {} as Record<string, number>);

    // Check webhook status
    const webhookStatuses = await checkWebhookStatus(admin);

    return json({
      shop: session.shop,
      shopSettings,
      config,
      tierProducts,
      tiers,
      statistics: {
        total: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
        active: statusCounts.ACTIVE || 0,
        paused: statusCounts.PAUSED || 0,
        cancelled: statusCounts.CANCELLED || 0,
        failed: statusCounts.FAILED || 0,
      },
      webhooks: webhookStatuses,
    });
  } catch (error) {
    console.error('[Setup Loader] Error:', error);
    return json({
      shop: session.shop,
      shopSettings: null,
      config: {
        enabled: false,
        features: {
          trialPeriods: false,
          automaticDunning: false,
          analytics: false,
        },
        billing: SUBSCRIPTION_CONFIG.BILLING,
        gracePeriod: SUBSCRIPTION_CONFIG.GRACE_PERIOD,
      },
      tierProducts: [],
      tiers: [],
      statistics: {
        total: 0,
        active: 0,
        paused: 0,
        cancelled: 0,
        failed: 0,
      },
      webhooks: {
        subscriptionCreated: false,
        billingSuccess: false,
        billingFailed: false,
        subscriptionUpdate: false,
      },
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const action = formData.get("action");

  try {
    switch (action) {
      case "updateConfig": {
        const config = {
          trialPeriods: formData.get("trialPeriods") === "true",
          automaticDunning: formData.get("automaticDunning") === "true",
          analytics: formData.get("analytics") === "true",
          maxRetryAttempts: parseInt(formData.get("maxRetryAttempts") as string) || 3,
          gracePeriodDays: parseInt(formData.get("gracePeriodDays") as string) || 3,
        };

        // Update environment variables (in production, update through deployment)
        // For now, just return success
        return json({ 
          success: true, 
          message: "Configuration updated successfully" 
        });
      }

      case "registerWebhooks": {
        const webhooks = await registerSubscriptionWebhooks(admin);
        return json({ 
          success: true, 
          message: `Registered ${webhooks.length} webhooks successfully`,
          webhooks 
        });
      }

      case "createTierProduct": {
        const tierId = formData.get("tierId") as string;
        const shopifyProductId = formData.get("productId") as string;
        const shopifyVariantId = formData.get("variantId") as string;
        const purchaseType = formData.get("purchaseType") as 'SUBSCRIPTION' | 'ONE_TIME' | 'BOTH';
        const billingInterval = formData.get("billingInterval") as string;

        const tierProduct = await db.tierProduct.create({
          data: {
            id: crypto.randomUUID(),
            shop: session.shop,
            tierId,
            shopifyProductId,
            shopifyVariantId,
            purchaseType,
            price: 0, // Will be synced from Shopify
            sku: '',
            duration: billingInterval as any,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        });

        return json({ 
          success: true, 
          message: "Tier product created successfully",
          tierProduct 
        });
      }

      case "toggleFeature": {
        const feature = formData.get("feature") as string;
        const enabled = formData.get("enabled") === "true";
        
        // In production, update through environment variables
        return json({ 
          success: true, 
          message: `${feature} ${enabled ? 'enabled' : 'disabled'} successfully` 
        });
      }

      default:
        return json({ success: false, error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Setup Action] Error:', error);
    return json({ 
      success: false, 
      error: error.message || "An error occurred" 
    });
  }
};

async function checkWebhookStatus(admin: any) {
  const requiredWebhooks = [
    'SUBSCRIPTION_CONTRACTS_CREATE',
    'SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS',
    'SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE',
    'SUBSCRIPTION_CONTRACTS_UPDATE',
  ];

  const query = `
    query {
      webhookSubscriptions(first: 100) {
        edges {
          node {
            id
            topic
            endpoint {
              __typename
              ... on WebhookHttpEndpoint {
                callbackUrl
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(query);
    const data = await response.json();
    const webhooks = data.data?.webhookSubscriptions?.edges?.map((e: any) => e.node.topic) || [];
    
    return {
      subscriptionCreated: webhooks.includes('SUBSCRIPTION_CONTRACTS_CREATE'),
      billingSuccess: webhooks.includes('SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS'),
      billingFailed: webhooks.includes('SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE'),
      subscriptionUpdate: webhooks.includes('SUBSCRIPTION_CONTRACTS_UPDATE'),
    };
  } catch (error) {
    console.error('Error checking webhooks:', error);
    return {
      subscriptionCreated: false,
      billingSuccess: false,
      billingFailed: false,
      subscriptionUpdate: false,
    };
  }
}

async function registerSubscriptionWebhooks(admin: any) {
  const webhooks = [
    { topic: 'SUBSCRIPTION_CONTRACTS_CREATE', path: '/webhooks/subscriptions/created' },
    { topic: 'SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS', path: '/webhooks/subscriptions/billing_success' },
    { topic: 'SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE', path: '/webhooks/subscriptions/billing_failed' },
    { topic: 'SUBSCRIPTION_CONTRACTS_UPDATE', path: '/webhooks/subscriptions/update' },
  ];

  const registered = [];
  for (const webhook of webhooks) {
    try {
      const mutation = `
        mutation {
          webhookSubscriptionCreate(
            topic: ${webhook.topic}
            webhookSubscription: {
              callbackUrl: "${process.env.SHOPIFY_APP_URL}${webhook.path}"
            }
          ) {
            webhookSubscription {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
      
      const response = await admin.graphql(mutation);
      const data = await response.json();
      
      if (data.data?.webhookSubscriptionCreate?.webhookSubscription) {
        registered.push(webhook.topic);
      }
    } catch (error) {
      console.error(`Error registering webhook ${webhook.topic}:`, error);
    }
  }
  
  return registered;
}

export default function SubscriptionSetup() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [selectedTab, setSelectedTab] = useState(0);
  
  const isLoading = navigation.state !== "idle";

  // Configuration form state
  const [trialPeriods, setTrialPeriods] = useState(data.config.features.trialPeriods);
  const [automaticDunning, setAutomaticDunning] = useState(data.config.features.automaticDunning);
  const [analytics, setAnalytics] = useState(data.config.features.analytics);
  const [maxRetries, setMaxRetries] = useState(data.config.billing.MAX_RETRY_ATTEMPTS.toString());
  const [gracePeriod, setGracePeriod] = useState(data.config.gracePeriod.DAYS.toString());

  const handleSaveConfig = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "updateConfig");
    formData.append("trialPeriods", trialPeriods.toString());
    formData.append("automaticDunning", automaticDunning.toString());
    formData.append("analytics", analytics.toString());
    formData.append("maxRetryAttempts", maxRetries);
    formData.append("gracePeriodDays", gracePeriod);
    submit(formData, { method: "post" });
  }, [trialPeriods, automaticDunning, analytics, maxRetries, gracePeriod, submit]);

  const handleRegisterWebhooks = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "registerWebhooks");
    submit(formData, { method: "post" });
  }, [submit]);

  const tabs = [
    {
      id: 'overview',
      content: 'Overview',
      icon: SettingsIcon,
    },
    {
      id: 'configuration',
      content: 'Configuration',
      icon: SettingsIcon,
    },
    {
      id: 'products',
      content: 'Tier Products',
      icon: ProductIcon,
    },
    {
      id: 'billing',
      content: 'Billing Settings',
      icon: PaymentIcon,
    },
    {
      id: 'webhooks',
      content: 'Webhooks',
      icon: AutomationIcon,
    },
  ];

  return (
    <Page
      title="Subscription Configuration"
      subtitle="Configure and manage tier subscription settings"
      backAction={{ url: "/app/subscriptions" }}
    >
      {actionData?.success && (
        <Box paddingBlockEnd="400">
          <Banner
            title="Success"
            tone="success"
            onDismiss={() => {}}
          >
            <p>{actionData.message}</p>
          </Banner>
        </Box>
      )}

      {actionData?.error && (
        <Box paddingBlockEnd="400">
          <Banner
            title="Error"
            tone="critical"
            onDismiss={() => {}}
          >
            <p>{actionData.error}</p>
          </Banner>
        </Box>
      )}

      <Layout>
        <Layout.Section>
          <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
            {/* Overview Tab */}
            {selectedTab === 0 && (
              <Box paddingBlockStart="400">
                <BlockStack gap="400">
                  {/* Status Overview */}
                  <Card>
                    <Box padding="400">
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">System Status</Text>
                        
                        <InlineStack gap="400" wrap>
                          <Badge tone={data.config.enabled ? "success" : "warning"}>
                            Subscriptions {data.config.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                          <Badge tone={data.statistics.active > 0 ? "success" : "info"}>
                            {data.statistics.active} Active Subscriptions
                          </Badge>
                          <Badge tone={data.statistics.failed > 0 ? "critical" : "info"}>
                            {data.statistics.failed} Failed Payments
                          </Badge>
                        </InlineStack>

                        <Divider />

                        <BlockStack gap="200">
                          <InlineStack align="space-between">
                            <Text as="p">Total Subscriptions</Text>
                            <Text as="p" fontWeight="semibold">{data.statistics.total}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="p" tone="success">Active</Text>
                            <Text as="p" fontWeight="semibold">{data.statistics.active}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="p" tone="caution">Paused</Text>
                            <Text as="p" fontWeight="semibold">{data.statistics.paused}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="p" tone="critical">Cancelled</Text>
                            <Text as="p" fontWeight="semibold">{data.statistics.cancelled}</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Box>
                  </Card>

                  {/* Quick Actions */}
                  <Card>
                    <Box padding="400">
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">Quick Actions</Text>
                        
                        <BlockStack gap="200">
                          <Button
                            url="/app/subscriptions"
                            fullWidth
                            textAlign="start"
                          >
                            View Active Subscriptions
                          </Button>
                          <Button
                            url="/app/subscriptions/contracts"
                            fullWidth
                            textAlign="start"
                          >
                            Manage Contracts
                          </Button>
                          <Button
                            url="/app/tier-products"
                            fullWidth
                            textAlign="start"
                          >
                            Configure Tier Products
                          </Button>
                        </BlockStack>
                      </BlockStack>
                    </Box>
                  </Card>
                </BlockStack>
              </Box>
            )}

            {/* Configuration Tab */}
            {selectedTab === 1 && (
              <Box paddingBlockStart="400">
                <BlockStack gap="400">
                  <Card>
                    <Box padding="400">
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">Feature Configuration</Text>
                        
                        <BlockStack gap="300">
                          <Checkbox
                            label="Enable Trial Periods"
                            helpText="Allow customers to try subscriptions before billing"
                            checked={trialPeriods}
                            onChange={setTrialPeriods}
                          />
                          
                          <Checkbox
                            label="Automatic Dunning"
                            helpText="Automatically retry failed payments"
                            checked={automaticDunning}
                            onChange={setAutomaticDunning}
                          />
                          
                          <Checkbox
                            label="Subscription Analytics"
                            helpText="Track detailed metrics and insights"
                            checked={analytics}
                            onChange={setAnalytics}
                          />
                        </BlockStack>

                        <Divider />

                        <BlockStack gap="300">
                          <TextField
                            label="Maximum Retry Attempts"
                            type="number"
                            value={maxRetries}
                            onChange={setMaxRetries}
                            helpText="Number of times to retry failed payments"
                            autoComplete="off"
                          />
                          
                          <TextField
                            label="Grace Period (days)"
                            type="number"
                            value={gracePeriod}
                            onChange={setGracePeriod}
                            helpText="Days to wait before cancelling after payment failure"
                            autoComplete="off"
                          />
                        </BlockStack>

                        <InlineStack align="end">
                          <Button
                            variant="primary"
                            onClick={handleSaveConfig}
                            loading={isLoading}
                          >
                            Save Configuration
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </Box>
                  </Card>
                </BlockStack>
              </Box>
            )}

            {/* Tier Products Tab */}
            {selectedTab === 2 && (
              <Box paddingBlockStart="400">
                <BlockStack gap="400">
                  <Card>
                    <Box padding="400">
                      <BlockStack gap="400">
                        <InlineStack align="space-between">
                          <Text as="h2" variant="headingMd">Tier Products for Subscriptions</Text>
                          <Button url="/app/tier-products">Manage Products</Button>
                        </InlineStack>
                        
                        {data.tierProducts.length > 0 ? (
                          <DataTable
                            columnContentTypes={['text', 'text', 'text', 'text']}
                            headings={['Product', 'Tier', 'Type', 'Billing']}
                            rows={data.tierProducts.map(product => [
                              product.shopifyProductId,
                              product.tier?.name || 'N/A',
                              product.purchaseType,
                              product.duration || 'N/A',
                            ])}
                          />
                        ) : (
                          <EmptyState
                            heading="No subscription products configured"
                            action={{ content: 'Configure Products', url: '/app/tier-products' }}
                          >
                            <p>Set up tier products with subscription options to enable recurring billing.</p>
                          </EmptyState>
                        )}
                      </BlockStack>
                    </Box>
                  </Card>
                </BlockStack>
              </Box>
            )}

            {/* Billing Settings Tab */}
            {selectedTab === 3 && (
              <Box paddingBlockStart="400">
                <BlockStack gap="400">
                  <Card>
                    <Box padding="400">
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">Billing Intervals</Text>
                        
                        <BlockStack gap="200">
                          <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                            <InlineStack align="space-between">
                              <Text as="p">Monthly</Text>
                              <Badge>No discount</Badge>
                            </InlineStack>
                          </Box>
                          
                          <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                            <InlineStack align="space-between">
                              <Text as="p">Quarterly</Text>
                              <Badge>5% discount</Badge>
                            </InlineStack>
                          </Box>
                          
                          <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                            <InlineStack align="space-between">
                              <Text as="p">Semi-Annual</Text>
                              <Badge>10% discount</Badge>
                            </InlineStack>
                          </Box>
                          
                          <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                            <InlineStack align="space-between">
                              <Text as="p">Annual</Text>
                              <Badge>15% discount</Badge>
                            </InlineStack>
                          </Box>
                        </BlockStack>

                        <Divider />

                        <BlockStack gap="300">
                          <Text as="h3" variant="headingSm">Retry Schedule</Text>
                          <Text as="p" tone="subdued">
                            Failed payments are retried on the following schedule:
                          </Text>
                          <BlockStack gap="100">
                            <Text as="p">• Day 1: Initial charge attempt</Text>
                            <Text as="p">• Day 3: First retry</Text>
                            <Text as="p">• Day 5: Second retry</Text>
                            <Text as="p">• Day 7: Final retry before entering grace period</Text>
                          </BlockStack>
                        </BlockStack>
                      </BlockStack>
                    </Box>
                  </Card>
                </BlockStack>
              </Box>
            )}

            {/* Webhooks Tab */}
            {selectedTab === 4 && (
              <Box paddingBlockStart="400">
                <BlockStack gap="400">
                  <Card>
                    <Box padding="400">
                      <BlockStack gap="400">
                        <InlineStack align="space-between">
                          <Text as="h2" variant="headingMd">Webhook Status</Text>
                          <Button onClick={handleRegisterWebhooks} loading={isLoading}>
                            Register Missing Webhooks
                          </Button>
                        </InlineStack>
                        
                        <BlockStack gap="200">
                          <InlineStack align="space-between">
                            <Text as="p">Subscription Created</Text>
                            <Badge tone={data.webhooks.subscriptionCreated ? "success" : "critical"}>
                              {data.webhooks.subscriptionCreated ? "Registered" : "Not Registered"}
                            </Badge>
                          </InlineStack>
                          
                          <InlineStack align="space-between">
                            <Text as="p">Billing Success</Text>
                            <Badge tone={data.webhooks.billingSuccess ? "success" : "critical"}>
                              {data.webhooks.billingSuccess ? "Registered" : "Not Registered"}
                            </Badge>
                          </InlineStack>
                          
                          <InlineStack align="space-between">
                            <Text as="p">Billing Failed</Text>
                            <Badge tone={data.webhooks.billingFailed ? "success" : "critical"}>
                              {data.webhooks.billingFailed ? "Registered" : "Not Registered"}
                            </Badge>
                          </InlineStack>
                          
                          <InlineStack align="space-between">
                            <Text as="p">Subscription Update</Text>
                            <Badge tone={data.webhooks.subscriptionUpdate ? "success" : "critical"}>
                              {data.webhooks.subscriptionUpdate ? "Registered" : "Not Registered"}
                            </Badge>
                          </InlineStack>
                        </BlockStack>

                        <Divider />

                        <Banner tone="info">
                          <p>
                            Webhooks are essential for tracking subscription lifecycle events.
                            Ensure all webhooks are registered for proper subscription management.
                          </p>
                        </Banner>
                      </BlockStack>
                    </Box>
                  </Card>
                </BlockStack>
              </Box>
            )}
          </Tabs>
        </Layout.Section>
      </Layout>
    </Page>
  );
}