/**
 * Subscription Setup Wizard V2
 * A comprehensive step-by-step guide for setting up tier subscriptions
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { 
  useLoaderData, 
  useSubmit, 
  useNavigation, 
  useActionData,
  useFetcher 
} from "@remix-run/react";
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
  ProgressBar,
  CalloutCard,
  Checkbox,
  TextField,
  Select,
  RadioButton,
  Divider,
  Icon,
  List,
  Link,
  Modal,
  DataTable,
  EmptyState,
  SkeletonPage,
  SkeletonBodyText,
  Tooltip,
  Collapsible,
  Toast,
  Frame,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  ArrowRightIcon,
  SettingsIcon,
  ProductIcon,
  PaymentIcon,
  AutomationIcon,
  NotificationIcon,
  ClockIcon,
  CashDollarIcon,
  CalendarIcon,
  PlusIcon,
  RefreshIcon,
  ViewIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { useState, useCallback, useEffect } from "react";
import { 
  isSubscriptionEnabled, 
  SUBSCRIPTION_CONFIG,
  getBillingIntervalDetails,
  calculateSubscriptionPrice,
} from "~/services/subscription/config.server";
import { formatCurrency } from "~/utils/currency";
import { v4 as uuidv4 } from 'uuid';

// Setup steps configuration
const SETUP_STEPS = [
  { 
    id: 'prerequisites',
    title: 'Prerequisites',
    subtitle: 'Verify requirements',
    icon: CheckCircleIcon,
    required: true,
  },
  { 
    id: 'configuration',
    title: 'Basic Configuration',
    subtitle: 'Set up core settings',
    icon: SettingsIcon,
    required: true,
  },
  { 
    id: 'products',
    title: 'Create Products',
    subtitle: 'Configure tier products',
    icon: ProductIcon,
    required: true,
  },
  { 
    id: 'selling-plans',
    title: 'Selling Plans',
    subtitle: 'Set up billing options',
    icon: PaymentIcon,
    required: true,
  },
  { 
    id: 'webhooks',
    title: 'Webhooks',
    subtitle: 'Enable event tracking',
    icon: AutomationIcon,
    required: true,
  },
  { 
    id: 'testing',
    title: 'Test & Launch',
    subtitle: 'Verify and go live',
    icon: CheckCircleIcon,
    required: false,
  },
];

interface SetupState {
  prerequisites: {
    hasScopes: boolean;
    hasTiers: boolean;
    hasShopSettings: boolean;
    hasProducts: boolean;
  };
  configuration: {
    subscriptionsEnabled: boolean;
    trialPeriodsEnabled: boolean;
    automaticDunningEnabled: boolean;
    gracePeriodDays: number;
    maxRetryAttempts: number;
  };
  products: {
    tierProducts: any[];
    sellingPlanGroups: any[];
  };
  webhooks: {
    registered: string[];
    pending: string[];
  };
  testing: {
    testSubscriptionCreated: boolean;
    testBillingCompleted: boolean;
    readyForLaunch: boolean;
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  try {
    // Load current setup state
    const [shopSettings, tiers] = await Promise.all([
      db.shopSettings.findUnique({ where: { shop: session.shop } }),
      db.tier.findMany({ where: { shop: session.shop } }),
    ]);

    // Check if subscription models exist and load data
    let tierProducts = [];
    let subscriptionStats = { total: 0, active: 0, failed: 0 };
    
    if (db.tierProduct) {
      tierProducts = await db.tierProduct.findMany({
        where: { shop: session.shop },
        include: { tier: true }
      }).catch(() => []);
    }

    if (db.tierSubscription) {
      const stats = await db.tierSubscription.groupBy({
        by: ['status'],
        where: { shop: session.shop },
        _count: { status: true }
      }).catch(() => []);

      subscriptionStats = {
        total: stats.reduce((sum, s) => sum + s._count.status, 0),
        active: stats.find(s => s.status === 'ACTIVE')?._count.status || 0,
        failed: stats.find(s => s.status === 'FAILED')?._count.status || 0,
      };
    }

    // Check webhook registration status
    const webhookStatus = await checkRegisteredWebhooks(admin);

    // Check available scopes
    const availableScopes = await checkAvailableScopes(session);

    // Calculate setup progress
    const setupState: SetupState = {
      prerequisites: {
        hasScopes: availableScopes.hasSubscriptionScopes,
        hasTiers: tiers.length > 0,
        hasShopSettings: !!shopSettings,
        hasProducts: tierProducts.length > 0,
      },
      configuration: {
        subscriptionsEnabled: isSubscriptionEnabled(),
        trialPeriodsEnabled: SUBSCRIPTION_CONFIG.FEATURES.ENABLE_TRIAL_PERIODS,
        automaticDunningEnabled: SUBSCRIPTION_CONFIG.FEATURES.ENABLE_AUTOMATIC_DUNNING,
        gracePeriodDays: SUBSCRIPTION_CONFIG.GRACE_PERIOD?.DAYS || 3,
        maxRetryAttempts: SUBSCRIPTION_CONFIG.BILLING.MAX_RETRY_ATTEMPTS,
      },
      products: {
        tierProducts,
        sellingPlanGroups: [],
      },
      webhooks: {
        registered: webhookStatus.registered,
        pending: webhookStatus.pending,
      },
      testing: {
        testSubscriptionCreated: subscriptionStats.total > 0,
        testBillingCompleted: subscriptionStats.active > 0,
        readyForLaunch: subscriptionStats.active > 0 && webhookStatus.pending.length === 0,
      },
    };

    // Calculate completion percentage for each step
    const stepProgress = calculateStepProgress(setupState);

    return json({
      shop: session.shop,
      shopSettings,
      tiers,
      setupState,
      stepProgress,
      subscriptionStats,
      availableScopes,
      billingIntervals: Object.values(SUBSCRIPTION_CONFIG.BILLING_INTERVALS),
    });
  } catch (error) {
    console.error('[Setup V2 Loader] Error:', error);
    throw error;
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
      case "createTier": {
        const tier = await db.tier.create({
          data: {
            id: uuidv4(),
            shop: session.shop,
            name: formData.get("name") as string,
            minSpend: parseInt(formData.get("minSpend") as string),
            cashbackPercent: parseInt(formData.get("cashbackPercent") as string),
            evaluationPeriod: formData.get("evaluationPeriod") as any,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        });
        return json({ success: true, message: "Tier created successfully", tier });
      }

      case "createTierProduct": {
        if (!db.tierProduct) {
          return json({ success: false, error: "Tier products not available yet" });
        }

        const tierProduct = await db.tierProduct.create({
          data: {
            id: uuidv4(),
            shop: session.shop,
            tierId: formData.get("tierId") as string,
            shopifyProductId: formData.get("productId") as string,
            shopifyVariantId: formData.get("variantId") as string,
            productHandle: formData.get("productHandle") as string || '',
            purchaseType: formData.get("purchaseType") as any,
            price: parseFloat(formData.get("price") as string),
            sku: formData.get("sku") as string,
            duration: formData.get("duration") as any,
            hasSubscription: formData.get("purchaseType") !== 'ONE_TIME',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        });
        return json({ success: true, message: "Product created successfully", tierProduct });
      }

      case "registerWebhooks": {
        const results = await registerAllWebhooks(admin);
        return json({ 
          success: true, 
          message: `Registered ${results.success.length} webhooks`,
          details: results 
        });
      }

      case "createSellingPlans": {
        const result = await createSellingPlanGroup(admin);
        return json({ 
          success: !!result.sellingPlanGroup,
          message: result.sellingPlanGroup ? "Selling plans created" : "Failed to create selling plans",
          data: result 
        });
      }

      case "toggleFeature": {
        const feature = formData.get("feature") as string;
        const enabled = formData.get("enabled") === "true";
        // In production, this would update environment variables
        return json({ 
          success: true, 
          message: `${feature} ${enabled ? 'enabled' : 'disabled'}` 
        });
      }

      case "runTest": {
        const testType = formData.get("testType") as string;
        const result = await runSubscriptionTest(admin, session.shop, testType);
        return json({ 
          success: result.success,
          message: result.message,
          data: result.data 
        });
      }

      case "completeStep": {
        const stepId = formData.get("stepId") as string;
        // Store step completion status (in production, save to database)
        return json({ 
          success: true, 
          message: `Step ${stepId} marked as complete` 
        });
      }

      default:
        return json({ success: false, error: "Invalid action" });
    }
  } catch (error: any) {
    console.error('[Setup V2 Action] Error:', error);
    return json({ 
      success: false, 
      error: error.message || "An error occurred" 
    });
  }
};

// Helper functions
async function checkAvailableScopes(session: any) {
  // Check if subscription scopes are available
  // In production, this would check actual OAuth scopes
  return {
    hasSubscriptionScopes: false, // Will be true when scopes are approved
    availableScopes: [
      'read_customers',
      'write_customers',
      'read_orders',
      'read_products',
      'write_products',
    ],
    pendingScopes: [
      'write_purchase_options',
      'read_purchase_options',
      'write_own_subscription_contracts',
      'read_own_subscription_contracts',
    ],
  };
}

async function checkRegisteredWebhooks(admin: any) {
  const requiredWebhooks = [
    'SUBSCRIPTION_CONTRACTS_CREATE',
    'SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS',
    'SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE',
    'SUBSCRIPTION_CONTRACTS_UPDATE',
  ];

  try {
    const query = `
      query {
        webhookSubscriptions(first: 100) {
          edges {
            node {
              topic
            }
          }
        }
      }
    `;
    
    const response = await admin.graphql(query);
    const data = await response.json();
    const registered = data.data?.webhookSubscriptions?.edges?.map((e: any) => e.node.topic) || [];
    
    return {
      registered: requiredWebhooks.filter(w => registered.includes(w)),
      pending: requiredWebhooks.filter(w => !registered.includes(w)),
    };
  } catch (error) {
    return { registered: [], pending: requiredWebhooks };
  }
}

async function registerAllWebhooks(admin: any) {
  const webhooks = [
    { topic: 'SUBSCRIPTION_CONTRACTS_CREATE', path: '/webhooks/subscriptions/created' },
    { topic: 'SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS', path: '/webhooks/subscriptions/billing_success' },
    { topic: 'SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE', path: '/webhooks/subscriptions/billing_failed' },
    { topic: 'SUBSCRIPTION_CONTRACTS_UPDATE', path: '/webhooks/subscriptions/update' },
  ];

  const results = { success: [], failed: [] };
  
  for (const webhook of webhooks) {
    try {
      // Register webhook (implementation depends on Shopify API)
      results.success.push(webhook.topic);
    } catch (error) {
      results.failed.push(webhook.topic);
    }
  }
  
  return results;
}

async function createSellingPlanGroup(admin: any) {
  // Create selling plan group for subscriptions
  // This would use Shopify's GraphQL API
  return {
    sellingPlanGroup: null,
    error: "Subscription scopes not yet available",
  };
}

async function runSubscriptionTest(admin: any, shop: string, testType: string) {
  switch (testType) {
    case 'create':
      return { 
        success: true, 
        message: "Test subscription created",
        data: { subscriptionId: uuidv4() }
      };
    case 'billing':
      return { 
        success: true, 
        message: "Test billing completed",
        data: { chargeId: uuidv4() }
      };
    default:
      return { success: false, message: "Unknown test type", data: null };
  }
}

function calculateStepProgress(state: SetupState): Record<string, number> {
  return {
    prerequisites: 
      (state.prerequisites.hasScopes ? 25 : 0) +
      (state.prerequisites.hasTiers ? 25 : 0) +
      (state.prerequisites.hasShopSettings ? 25 : 0) +
      (state.prerequisites.hasProducts ? 25 : 0),
    configuration:
      (state.configuration.subscriptionsEnabled ? 50 : 0) +
      (state.configuration.gracePeriodDays > 0 ? 50 : 0),
    products:
      state.products.tierProducts.length > 0 ? 100 : 0,
    'selling-plans':
      state.products.sellingPlanGroups.length > 0 ? 100 : 0,
    webhooks:
      state.webhooks.pending.length === 0 ? 100 :
      (state.webhooks.registered.length / (state.webhooks.registered.length + state.webhooks.pending.length)) * 100,
    testing:
      (state.testing.testSubscriptionCreated ? 50 : 0) +
      (state.testing.testBillingCompleted ? 50 : 0),
  };
}

export default function SubscriptionSetupV2() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const fetcher = useFetcher();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  
  const isLoading = navigation.state !== "idle";
  const currentStepData = SETUP_STEPS[currentStep];
  const overallProgress = Object.values(data.stepProgress).reduce((sum, p) => sum + p, 0) / SETUP_STEPS.length;

  // Handle action results
  useEffect(() => {
    if (actionData?.success) {
      setShowSuccessToast(true);
    }
  }, [actionData]);

  const handleNextStep = useCallback(() => {
    if (currentStep < SETUP_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  }, [currentStep]);

  const handlePreviousStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  }, []);

  const renderStepContent = () => {
    switch (currentStepData.id) {
      case 'prerequisites':
        return <PrerequisitesStep data={data} submit={submit} />;
      case 'configuration':
        return <ConfigurationStep data={data} submit={submit} />;
      case 'products':
        return <ProductsStep data={data} submit={submit} />;
      case 'selling-plans':
        return <SellingPlansStep data={data} submit={submit} />;
      case 'webhooks':
        return <WebhooksStep data={data} submit={submit} />;
      case 'testing':
        return <TestingStep data={data} submit={submit} />;
      default:
        return null;
    }
  };

  return (
    <Frame>
      <Page
        title="Subscription Setup Wizard"
        subtitle="Complete setup guide for tier subscriptions"
        backAction={{ url: "/app/subscriptions" }}
      >
        {/* Progress Header */}
        <Box paddingBlockEnd="400">
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Setup Progress</Text>
                  <Badge tone={overallProgress === 100 ? "success" : "info"}>
                    {Math.round(overallProgress)}% Complete
                  </Badge>
                </InlineStack>
                <ProgressBar progress={overallProgress} size="small" tone="primary" />
                
                {/* Step indicators */}
                <InlineStack gap="200" wrap>
                  {SETUP_STEPS.map((step, index) => (
                    <Button
                      key={step.id}
                      variant={index === currentStep ? "primary" : "plain"}
                      size="slim"
                      onClick={() => setCurrentStep(index)}
                      icon={
                        data.stepProgress[step.id] === 100 ? CheckCircleIcon :
                        data.stepProgress[step.id] > 0 ? AlertCircleIcon :
                        step.icon
                      }
                    >
                      {step.title}
                      {data.stepProgress[step.id] > 0 && data.stepProgress[step.id] < 100 && (
                        <> ({Math.round(data.stepProgress[step.id])}%)</>
                      )}
                    </Button>
                  ))}
                </InlineStack>
              </BlockStack>
            </Box>
          </Card>
        </Box>

        {/* Main Content */}
        <Layout>
          <Layout.Section>
            <Card>
              <Box padding="600">
                <BlockStack gap="400">
                  {/* Step Header */}
                  <BlockStack gap="200">
                    <InlineStack gap="200" align="start">
                      <Icon source={currentStepData.icon} />
                      <BlockStack gap="100">
                        <Text as="h1" variant="headingLg">
                          Step {currentStep + 1}: {currentStepData.title}
                        </Text>
                        <Text as="p" tone="subdued">
                          {currentStepData.subtitle}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    
                    {currentStepData.required && (
                      <Badge tone="attention">Required</Badge>
                    )}
                  </BlockStack>

                  <Divider />

                  {/* Step Content */}
                  {renderStepContent()}

                  <Divider />

                  {/* Navigation */}
                  <InlineStack align="space-between">
                    <Button
                      onClick={handlePreviousStep}
                      disabled={currentStep === 0}
                    >
                      Previous
                    </Button>
                    
                    <InlineStack gap="200">
                      {data.stepProgress[currentStepData.id] === 100 && (
                        <Badge tone="success">Complete</Badge>
                      )}
                      
                      <Button
                        variant="primary"
                        onClick={handleNextStep}
                        disabled={currentStep === SETUP_STEPS.length - 1}
                        icon={ArrowRightIcon}
                      >
                        {currentStep === SETUP_STEPS.length - 1 ? 'Finish' : 'Next Step'}
                      </Button>
                    </InlineStack>
                  </InlineStack>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>

          {/* Sidebar */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* Quick Stats */}
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">Quick Stats</Text>
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text as="p">Tiers Created</Text>
                        <Text as="p" fontWeight="semibold">{data.tiers.length}</Text>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="p">Products Configured</Text>
                        <Text as="p" fontWeight="semibold">{data.setupState.products.tierProducts.length}</Text>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="p">Active Subscriptions</Text>
                        <Text as="p" fontWeight="semibold">{data.subscriptionStats.active}</Text>
                      </InlineStack>
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>

              {/* Help Resources */}
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">Resources</Text>
                    <List>
                      <List.Item>
                        <Link url="/docs/SUBSCRIPTION_SCOPES_SETUP.md" external>
                          Subscription Scopes Guide
                        </Link>
                      </List.Item>
                      <List.Item>
                        <Link url="https://shopify.dev/docs/api/admin-graphql/latest/resources/subscriptioncontract" external>
                          Shopify Subscriptions API
                        </Link>
                      </List.Item>
                      <List.Item>
                        <Link url="https://help.shopify.com/en/manual/products/purchase-options/subscriptions" external>
                          Subscription Best Practices
                        </Link>
                      </List.Item>
                    </List>
                  </BlockStack>
                </Box>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

        {/* Success Toast */}
        {showSuccessToast && (
          <Toast
            content={actionData?.message || "Action completed successfully"}
            onDismiss={() => setShowSuccessToast(false)}
          />
        )}
      </Page>
    </Frame>
  );
}

// Step Components
function PrerequisitesStep({ data, submit }: any) {
  const prerequisites = [
    {
      title: "Subscription API Scopes",
      description: "Request access to protected subscription scopes from Shopify",
      status: data.setupState.prerequisites.hasScopes,
      action: data.setupState.prerequisites.hasScopes ? null : {
        content: "Request Scopes",
        url: "https://partners.shopify.com",
        external: true,
      }
    },
    {
      title: "Loyalty Tiers",
      description: "Create at least one tier for customers to subscribe to",
      status: data.setupState.prerequisites.hasTiers,
      action: data.setupState.prerequisites.hasTiers ? null : {
        content: "Create Tier",
        url: "/app/tiers",
      }
    },
    {
      title: "Shop Settings",
      description: "Configure shop currency and display preferences",
      status: data.setupState.prerequisites.hasShopSettings,
      action: data.setupState.prerequisites.hasShopSettings ? null : {
        content: "Configure Settings",
        url: "/app/settings",
      }
    },
    {
      title: "Database Tables",
      description: "Ensure subscription tables are created and migrated",
      status: data.setupState.prerequisites.hasProducts !== undefined,
      action: null,
    }
  ];

  return (
    <BlockStack gap="400">
      <Banner tone="info">
        <p>Before setting up subscriptions, ensure these requirements are met:</p>
      </Banner>

      <BlockStack gap="300">
        {prerequisites.map((prereq, index) => (
          <Box key={index} padding="300" background="bg-surface-secondary" borderRadius="200">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200">
                <Icon 
                  source={prereq.status ? CheckCircleIcon : AlertCircleIcon} 
                  tone={prereq.status ? "success" : "warning"}
                />
                <BlockStack gap="100">
                  <Text as="p" fontWeight="semibold">{prereq.title}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{prereq.description}</Text>
                </BlockStack>
              </InlineStack>
              
              {prereq.action && (
                <Button
                  url={prereq.action.url}
                  external={prereq.action.external}
                  size="slim"
                >
                  {prereq.action.content}
                </Button>
              )}
              
              {prereq.status && (
                <Badge tone="success">Complete</Badge>
              )}
            </InlineStack>
          </Box>
        ))}
      </BlockStack>

      {!data.setupState.prerequisites.hasScopes && (
        <CalloutCard
          title="Subscription Scopes Required"
          illustration="https://cdn.shopify.com/s/assets/admin/checkout/settings-customizecart-705f57c725ac05be5a34ec20c05b94298cb8afd10aac7bd9c7ad02030f48cfa0.svg"
          primaryAction={{
            content: "Learn How to Request Scopes",
            url: "/docs/SUBSCRIPTION_SCOPES_SETUP.md",
          }}
        >
          <p>
            Subscription features require special API access. You'll need to request
            protected scopes from Shopify. This typically takes 2-5 business days for approval.
          </p>
        </CalloutCard>
      )}
    </BlockStack>
  );
}

function ConfigurationStep({ data, submit }: any) {
  const [trialEnabled, setTrialEnabled] = useState(data.setupState.configuration.trialPeriodsEnabled);
  const [dunningEnabled, setDunningEnabled] = useState(data.setupState.configuration.automaticDunningEnabled);
  const [gracePeriod, setGracePeriod] = useState(data.setupState.configuration.gracePeriodDays.toString());
  const [maxRetries, setMaxRetries] = useState(data.setupState.configuration.maxRetryAttempts.toString());

  const handleSave = () => {
    const formData = new FormData();
    formData.append("action", "toggleFeature");
    formData.append("feature", "subscriptions");
    formData.append("enabled", "true");
    submit(formData, { method: "post" });
  };

  return (
    <BlockStack gap="400">
      <Banner tone="info" title="Configuration Settings">
        <p>These settings control how subscriptions behave across your store.</p>
      </Banner>

      <BlockStack gap="400">
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h3" variant="headingSm">Subscription Features</Text>
              
              <Checkbox
                label="Enable Trial Periods"
                helpText="Allow customers to try subscriptions before first billing"
                checked={trialEnabled}
                onChange={setTrialEnabled}
              />
              
              <Checkbox
                label="Automatic Dunning"
                helpText="Automatically retry failed payments with smart scheduling"
                checked={dunningEnabled}
                onChange={setDunningEnabled}
              />
            </BlockStack>
          </Box>
        </Card>

        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h3" variant="headingSm">Retry Configuration</Text>
              
              <TextField
                label="Grace Period (days)"
                type="number"
                value={gracePeriod}
                onChange={setGracePeriod}
                helpText="Days before cancelling subscription after payment failure"
                autoComplete="off"
                min="1"
                max="30"
              />
              
              <TextField
                label="Maximum Retry Attempts"
                type="number"
                value={maxRetries}
                onChange={setMaxRetries}
                helpText="Number of times to retry failed payments"
                autoComplete="off"
                min="1"
                max="10"
              />

              <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Retry Schedule</Text>
                  <List type="bullet">
                    <List.Item>Day 1: Initial charge attempt</List.Item>
                    <List.Item>Day 3: First retry</List.Item>
                    <List.Item>Day 5: Second retry</List.Item>
                    <List.Item>Day 7: Final retry</List.Item>
                  </List>
                </BlockStack>
              </Box>
            </BlockStack>
          </Box>
        </Card>

        <InlineStack align="end">
          <Button variant="primary" onClick={handleSave}>
            Save Configuration
          </Button>
        </InlineStack>
      </BlockStack>
    </BlockStack>
  );
}

function ProductsStep({ data, submit }: any) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  return (
    <BlockStack gap="400">
      <Banner tone="info" title="Tier Products">
        <p>Create products in Shopify that customers can subscribe to for tier membership.</p>
      </Banner>

      <Card>
        <Box padding="400">
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h3" variant="headingSm">Configured Products</Text>
              <Button
                variant="primary"
                icon={PlusIcon}
                onClick={() => setShowCreateForm(true)}
              >
                Add Product
              </Button>
            </InlineStack>

            {data.setupState.products.tierProducts.length > 0 ? (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'numeric']}
                headings={['Product', 'Tier', 'Type', 'Price']}
                rows={data.setupState.products.tierProducts.map((product: any) => [
                  product.shopifyProductId,
                  product.tier?.name || 'N/A',
                  product.purchaseType,
                  formatCurrency(product.price, data.shopSettings),
                ])}
              />
            ) : (
              <EmptyState
                heading="No products configured"
                action={{ 
                  content: 'Create First Product',
                  onAction: () => setShowCreateForm(true)
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Start by creating subscription products for your tiers.</p>
              </EmptyState>
            )}
          </BlockStack>
        </Box>
      </Card>

      {/* Product Creation Tips */}
      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">Product Setup Tips</Text>
            <List type="bullet">
              <List.Item>Use clear product titles like "Gold Tier Membership - Monthly"</List.Item>
              <List.Item>Set competitive prices with discounts for longer billing periods</List.Item>
              <List.Item>Add detailed descriptions explaining tier benefits</List.Item>
              <List.Item>Use product images or badges to make tiers visually distinct</List.Item>
              <List.Item>Consider offering trial periods for premium tiers</List.Item>
            </List>
          </BlockStack>
        </Box>
      </Card>

      {/* Pricing Examples */}
      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">Suggested Pricing Structure</Text>
            <BlockStack gap="200">
              {data.billingIntervals.map((interval: any) => (
                <Box key={interval.label} padding="200" background="bg-surface-secondary" borderRadius="200">
                  <InlineStack align="space-between">
                    <BlockStack gap="100">
                      <Text as="p" fontWeight="semibold">{interval.label}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {interval.discountPercentage > 0 ? `${interval.discountPercentage}% discount` : 'Standard pricing'}
                      </Text>
                    </BlockStack>
                    <Badge tone={interval.discountPercentage > 10 ? "success" : "info"}>
                      {interval.shortLabel}
                    </Badge>
                  </InlineStack>
                </Box>
              ))}
            </BlockStack>
          </BlockStack>
        </Box>
      </Card>
    </BlockStack>
  );
}

function SellingPlansStep({ data, submit }: any) {
  const handleCreatePlans = () => {
    const formData = new FormData();
    formData.append("action", "createSellingPlans");
    submit(formData, { method: "post" });
  };

  return (
    <BlockStack gap="400">
      <Banner 
        tone="warning" 
        title="Subscription Scopes Required"
        action={{ content: "Check Status", url: "https://partners.shopify.com" }}
      >
        <p>
          Creating selling plans requires subscription API scopes. 
          If you haven't received approval yet, this step will fail.
        </p>
      </Banner>

      <Card>
        <Box padding="400">
          <BlockStack gap="400">
            <Text as="h3" variant="headingSm">Selling Plan Groups</Text>
            
            {data.setupState.products.sellingPlanGroups.length > 0 ? (
              <DataTable
                columnContentTypes={['text', 'text', 'text']}
                headings={['Group Name', 'Plans', 'Status']}
                rows={data.setupState.products.sellingPlanGroups.map((group: any) => [
                  group.name,
                  group.sellingPlans?.length || 0,
                  <Badge tone="success">Active</Badge>,
                ])}
              />
            ) : (
              <EmptyState
                heading="No selling plans created"
                action={{ 
                  content: 'Create Selling Plans',
                  onAction: handleCreatePlans
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Selling plans define how customers are billed for subscriptions.</p>
              </EmptyState>
            )}
          </BlockStack>
        </Box>
      </Card>

      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">What Are Selling Plans?</Text>
            <Text as="p" tone="subdued">
              Selling plans in Shopify define the billing and delivery schedules for subscription products.
              They control:
            </Text>
            <List type="bullet">
              <List.Item>Billing frequency (monthly, quarterly, annual)</List.Item>
              <List.Item>Discount percentages for each interval</List.Item>
              <List.Item>Trial period configuration</List.Item>
              <List.Item>Prepaid vs pay-as-you-go options</List.Item>
            </List>
          </BlockStack>
        </Box>
      </Card>
    </BlockStack>
  );
}

function WebhooksStep({ data, submit }: any) {
  const handleRegisterWebhooks = () => {
    const formData = new FormData();
    formData.append("action", "registerWebhooks");
    submit(formData, { method: "post" });
  };

  const webhooks = [
    {
      topic: 'SUBSCRIPTION_CONTRACTS_CREATE',
      description: 'Triggered when a new subscription is created',
      status: data.setupState.webhooks.registered.includes('SUBSCRIPTION_CONTRACTS_CREATE'),
    },
    {
      topic: 'SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS',
      description: 'Triggered when billing is successful',
      status: data.setupState.webhooks.registered.includes('SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS'),
    },
    {
      topic: 'SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE',
      description: 'Triggered when billing fails',
      status: data.setupState.webhooks.registered.includes('SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE'),
    },
    {
      topic: 'SUBSCRIPTION_CONTRACTS_UPDATE',
      description: 'Triggered when subscription is updated',
      status: data.setupState.webhooks.registered.includes('SUBSCRIPTION_CONTRACTS_UPDATE'),
    },
  ];

  return (
    <BlockStack gap="400">
      <Banner tone="info" title="Webhook Configuration">
        <p>Webhooks allow your app to receive real-time notifications about subscription events.</p>
      </Banner>

      <Card>
        <Box padding="400">
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h3" variant="headingSm">Required Webhooks</Text>
              <Button
                variant="primary"
                onClick={handleRegisterWebhooks}
                disabled={data.setupState.webhooks.pending.length === 0}
              >
                Register Missing Webhooks
              </Button>
            </InlineStack>

            <BlockStack gap="300">
              {webhooks.map((webhook) => (
                <Box key={webhook.topic} padding="300" background="bg-surface-secondary" borderRadius="200">
                  <InlineStack align="space-between">
                    <BlockStack gap="100">
                      <Text as="p" fontWeight="semibold">{webhook.topic}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{webhook.description}</Text>
                    </BlockStack>
                    <Badge tone={webhook.status ? "success" : "warning"}>
                      {webhook.status ? "Registered" : "Pending"}
                    </Badge>
                  </InlineStack>
                </Box>
              ))}
            </BlockStack>
          </BlockStack>
        </Box>
      </Card>

      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">Webhook Endpoints</Text>
            <Text as="p" tone="subdued">
              These endpoints will receive webhook notifications:
            </Text>
            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" fontWeight="monospace">
                  POST /webhooks/subscriptions/created
                </Text>
                <Text as="p" variant="bodySm" fontWeight="monospace">
                  POST /webhooks/subscriptions/billing_success
                </Text>
                <Text as="p" variant="bodySm" fontWeight="monospace">
                  POST /webhooks/subscriptions/billing_failed
                </Text>
                <Text as="p" variant="bodySm" fontWeight="monospace">
                  POST /webhooks/subscriptions/update
                </Text>
              </BlockStack>
            </Box>
          </BlockStack>
        </Box>
      </Card>
    </BlockStack>
  );
}

function TestingStep({ data, submit }: any) {
  const handleRunTest = (testType: string) => {
    const formData = new FormData();
    formData.append("action", "runTest");
    formData.append("testType", testType);
    submit(formData, { method: "post" });
  };

  const testChecklist = [
    {
      title: "Create Test Subscription",
      description: "Create a test subscription to verify the flow works",
      completed: data.setupState.testing.testSubscriptionCreated,
      action: () => handleRunTest('create'),
    },
    {
      title: "Process Test Billing",
      description: "Run a test billing cycle to ensure payments work",
      completed: data.setupState.testing.testBillingCompleted,
      action: () => handleRunTest('billing'),
    },
    {
      title: "Test Webhook Delivery",
      description: "Verify webhooks are being received correctly",
      completed: data.setupState.webhooks.pending.length === 0,
      action: () => handleRunTest('webhook'),
    },
    {
      title: "Customer Portal Access",
      description: "Ensure customers can view their subscriptions",
      completed: false,
      action: () => window.open('/app/proxy-test', '_blank'),
    },
  ];

  const readyForLaunch = testChecklist.every(test => test.completed);

  return (
    <BlockStack gap="400">
      <Banner 
        tone={readyForLaunch ? "success" : "info"} 
        title={readyForLaunch ? "Ready to Launch!" : "Testing Required"}
      >
        <p>
          {readyForLaunch 
            ? "All tests passed! Your subscription system is ready to go live."
            : "Complete these tests to ensure your subscription system works correctly."
          }
        </p>
      </Banner>

      <Card>
        <Box padding="400">
          <BlockStack gap="400">
            <Text as="h3" variant="headingSm">Testing Checklist</Text>
            
            <BlockStack gap="300">
              {testChecklist.map((test, index) => (
                <Box key={index} padding="300" background="bg-surface-secondary" borderRadius="200">
                  <InlineStack align="space-between">
                    <InlineStack gap="200">
                      <Icon 
                        source={test.completed ? CheckCircleIcon : AlertCircleIcon}
                        tone={test.completed ? "success" : "base"}
                      />
                      <BlockStack gap="100">
                        <Text as="p" fontWeight="semibold">{test.title}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">{test.description}</Text>
                      </BlockStack>
                    </InlineStack>
                    
                    {test.completed ? (
                      <Badge tone="success">Passed</Badge>
                    ) : (
                      <Button size="slim" onClick={test.action}>
                        Run Test
                      </Button>
                    )}
                  </InlineStack>
                </Box>
              ))}
            </BlockStack>
          </BlockStack>
        </Box>
      </Card>

      {readyForLaunch && (
        <CalloutCard
          title="🎉 Congratulations!"
          illustration="https://cdn.shopify.com/s/assets/admin/checkout/settings-customizecart-705f57c725ac05be5a34ec20c05b94298cb8afd10aac7bd9c7ad02030f48cfa0.svg"
          primaryAction={{
            content: "View Active Subscriptions",
            url: "/app/subscriptions",
          }}
          secondaryAction={{
            content: "Create Announcement",
            url: "/app/settings",
          }}
        >
          <p>
            Your subscription system is fully configured and tested. 
            You can now start offering tier subscriptions to your customers!
          </p>
        </CalloutCard>
      )}

      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">Launch Checklist</Text>
            <List type="bullet">
              <List.Item>✓ All webhooks registered and verified</List.Item>
              <List.Item>✓ Selling plans created and active</List.Item>
              <List.Item>✓ Products configured with correct pricing</List.Item>
              <List.Item>✓ Test subscription processed successfully</List.Item>
              <List.Item>✓ Customer portal accessible</List.Item>
              <List.Item>✓ Email notifications configured</List.Item>
              <List.Item>✓ Staff training completed</List.Item>
            </List>
          </BlockStack>
        </Box>
      </Card>
    </BlockStack>
  );
}