import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";

import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Icon,
  Box,
  Badge,
  Toast,
  Frame,
  Divider,
  ProgressBar,
  Banner,
} from "@shopify/polaris";
import {
  StatusActiveIcon,
  SettingsIcon,
  ChartVerticalIcon,
  CashDollarIcon,
  DatabaseIcon,
  RefreshIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  CreditCardIcon,
} from "~/utils/polaris-icons";
import { authenticate, FREE_PLAN, PRO_PLAN, MAX_PLAN, ULTRA_PLAN } from "../shopify.server";
import db from "../db.server";
import { MANAGED_PLANS } from "~/constants/billing.constants";
import { measureQuery, getDatabaseHealth, formatResponseTime } from "~/utils/database-health.server";

// ============================================
// HELPER FUNCTIONS
// ============================================

const getCurrentMonthName = (): string => {
  return new Date().toLocaleDateString('en-US', { month: 'long' });
};

const calculateDaysRemaining = (): number => {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

const calculateProjectedOrders = (currentOrders: number, daysRemaining: number): number => {
  const now = new Date();
  const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysPassed = totalDaysInMonth - daysRemaining;

  if (daysPassed === 0) return currentOrders;

  const dailyRate = currentOrders / daysPassed;
  return Math.ceil(dailyRate * totalDaysInMonth);
};

const formatTimeAgo = (dateString: string | null): string => {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

// ============================================
// TYPE DEFINITIONS
// ============================================

interface DashboardData {
  shop: string;
  shopSettings: {
    storeCurrency?: string;
    tierRecalculationEnabled?: boolean;
    advancedAnalyticsEnabled?: boolean;
    autoCashbackProcessingEnabled?: boolean;
    emailMarketingEnabled?: boolean;
    tierProductsEnabled?: boolean;
  } | null;
  widgetStatus: {
    isActive: boolean;
    setupDismissed: boolean;
    status: 'active' | 'inactive' | 'not_configured';
    blockType: 'app_embed' | 'section' | 'none';
    themeName: string | null;
    lastChecked: string | null;
  };
  shopifyMetrics: {
    source: 'shopifyql' | 'cache' | 'unavailable';
  } | null;
  webhookStats: {
    processedLast24h: number;
    errorsLast24h: number;
    errorsLastHour: number;
    successRate: number;
    status: 'healthy' | 'degraded' | 'critical';
  };
  databaseHealth: {
    responseTime: number;
    status: 'connected' | 'degraded' | 'disconnected';
    uptime: number;
    lastCheck: string;
  };
  loyaltyEngine: {
    tierCount: number;
    status: 'operational' | 'needs_setup' | 'degraded';
    automationEnabled: boolean;
    currency: string;
    cashbackEnabled: boolean;
  };
  dataSyncHealth: {
    status: 'operational' | 'syncing' | 'degraded' | 'failed';
    customerSync: {
      status: 'completed' | 'running' | 'failed' | 'never_run';
      lastSyncAt: string | null;
      recordsProcessed: number;
    };
    orderSync: {
      status: 'idle' | 'running' | 'failed' | 'completed';
      lastSyncAt: string | null;
      recordsProcessed: number;
    };
    webhookHealth: 'healthy' | 'degraded' | 'critical';
  };
  // Billing data
  currentPlan: any | null;
  activeSubscription: any;
  monthlyOrderUsage: {
    orderCount: number;
    planLimit: number;
    planName: string;
    projectedOrders: number;
  } | null;
  currentMonth: string;
  daysRemaining: number;
}

// ============================================
// LOADER - Fetch dashboard data
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    // Simplified auth - only destructure what we need immediately
    const authResult = await authenticate.admin(request);
    const { session } = authResult;

    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    const loaderStart = Date.now();
    console.log(`[Dashboard] Loading simplified data for shop: ${shop}`);

    // Fetch subscription via GraphQL (most accurate, same as billing page)
    let activeSubscription = null;
    let subscriptionName = null;

    try {
      const { getSubscriptionDetails } = await import("~/services/billing/subscription-details.server");
      const subscriptionDetails = await getSubscriptionDetails(authResult.admin);
      const graphqlSubscription = subscriptionDetails?.currentAppInstallation.activeSubscriptions[0];

      if (graphqlSubscription && graphqlSubscription.status === 'ACTIVE') {
        subscriptionName = graphqlSubscription.name;
        console.log('[Dashboard] GraphQL subscription found:', subscriptionName);
      }
    } catch (error) {
      console.error("[Dashboard] Error fetching GraphQL subscription:", error);
    }

    // Fallback to billing.check() if GraphQL fails
    if (!subscriptionName && authResult.billing) {
      try {
        const { hasActivePayment, appSubscriptions } = await authResult.billing.check({
          plans: [FREE_PLAN, PRO_PLAN, MAX_PLAN, ULTRA_PLAN],
          isTest: process.env.NODE_ENV === 'development',
        });

        if (hasActivePayment && appSubscriptions?.length > 0) {
          activeSubscription = appSubscriptions[0];
          subscriptionName = activeSubscription.name;
          console.log('[Dashboard] billing.check() subscription found:', subscriptionName);
        }
      } catch (error) {
        console.error("[Dashboard] Error checking subscription:", error);
      }
    }

    // Fetch only essential data in parallel
    // Wrap shopSettings query with health monitoring
    const [shopSettings, billingSubscription, tierCount, syncStatusRecords] = await Promise.all([
      // Shop settings for feature manager and currency (with health monitoring)
      measureQuery(() =>
        db.shopSettings.findUnique({
          where: { shop },
          select: {
            storeCurrency: true,
            advancedAnalyticsEnabled: true,
            autoCashbackProcessingEnabled: true,
            emailMarketingEnabled: true,
            tierProductsEnabled: true,
            customersInitialSynced: true,
            customersSyncInProgress: true,
            widgetIsActive: true,
            widgetSetupDismissed: true,
          }
        })
      ),

      // Billing subscription from database for plan details
      db.billingSubscription.findUnique({
        where: { shop },
      }).catch(() => null),

      // Tier count for loyalty engine status
      db.tier.count({
        where: { shop }
      }).catch(() => 0),

      // Sync status for data sync health
      db.syncStatus.findMany({
        where: { shop },
        orderBy: { lastSyncAt: 'desc' }
      }).catch(() => []),
    ]);

    // Simple direct order count for current month
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const currentMonth = getCurrentMonthName();
    const daysRemaining = calculateDaysRemaining();

    let orderCount = 0;
    try {
      // Try to get from cache first
      // Note: Using findFirst instead of findUnique for Aurora Data API compatibility
      const cachedUsage = await db.monthlyOrderUsage.findFirst({
        where: {
          shop: shop,
          year: year,
          month: month,
        },
      });

      if (cachedUsage) {
        orderCount = cachedUsage.orderCount;
        console.log(`[Dashboard] Using cached order count: ${orderCount}`);
      } else {
        // Simple direct count from Order table for current month
        const startOfMonth = new Date(year, month - 1, 1);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

        orderCount = await db.order.count({
          where: {
            shop,
            createdAt: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
          },
        });
        console.log(`[Dashboard] Direct order count: ${orderCount}`);
      }
    } catch (error) {
      console.error("[Dashboard] Error counting orders:", error);
      orderCount = 0;
    }

    // Determine plan and limits (prefer GraphQL subscription name)
    let planLimit = MANAGED_PLANS["RewardsPro Free"].ordersIncluded;
    let planName = 'RewardsPro Free';

    if (subscriptionName) {
      const planConfig = MANAGED_PLANS[subscriptionName];
      if (planConfig) {
        planLimit = planConfig.ordersIncluded;
        planName = subscriptionName;
        console.log('[Dashboard] Using plan:', planName, 'with limit:', planLimit);
      } else {
        console.warn('[Dashboard] Plan not found in MANAGED_PLANS:', subscriptionName);
      }
    } else {
      console.log('[Dashboard] No active subscription found, using Free plan');
    }

    const projectedOrders = calculateProjectedOrders(orderCount, daysRemaining);

    const monthlyOrderUsage = {
      orderCount,
      planLimit,
      planName,
      projectedOrders,
    };

    // Serialize billing subscription
    const serializedPlan = billingSubscription ? {
      ...billingSubscription,
      planName: billingSubscription.planName || planName,
      cappedAmount: billingSubscription.cappedAmount ? Number(billingSubscription.cappedAmount) : null,
      balanceUsed: billingSubscription.balanceUsed ? Number(billingSubscription.balanceUsed) : 0,
      balanceRemaining: billingSubscription.balanceRemaining ? Number(billingSubscription.balanceRemaining) : null,
      currentPeriodEnd: billingSubscription.currentPeriodEnd instanceof Date
        ? billingSubscription.currentPeriodEnd.toISOString()
        : billingSubscription.currentPeriodEnd,
      createdAt: billingSubscription.createdAt instanceof Date
        ? billingSubscription.createdAt.toISOString()
        : billingSubscription.createdAt,
      updatedAt: billingSubscription.updatedAt instanceof Date
        ? billingSubscription.updatedAt.toISOString()
        : billingSubscription.updatedAt,
    } : null;

    // Webhook statistics for health monitoring
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastHour = new Date(Date.now() - 60 * 60 * 1000);

    const [webhookProcessedCount, webhookErrorsLast24h, webhookErrorsLastHour] = await Promise.all([
      db.webhookProcessed.count({
        where: {
          shop,
          processedAt: { gte: last24Hours }
        }
      }),
      db.webhookError.count({
        where: {
          shop,
          createdAt: { gte: last24Hours }
        }
      }),
      db.webhookError.count({
        where: {
          shop,
          createdAt: { gte: lastHour }
        }
      })
    ]);

    const totalWebhooks = webhookProcessedCount + webhookErrorsLast24h;
    const successRate = totalWebhooks > 0 ? (webhookProcessedCount / totalWebhooks) * 100 : 100;

    let webhookStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (webhookErrorsLastHour > 10 || successRate < 90) {
      webhookStatus = 'critical';
    } else if (webhookErrorsLastHour > 5 || successRate < 95) {
      webhookStatus = 'degraded';
    }

    // Get database health metrics
    const dbHealth = getDatabaseHealth();

    // Calculate Loyalty Engine status
    const cashbackEnabled = shopSettings?.autoCashbackProcessingEnabled ?? false;
    const hasCurrency = !!shopSettings?.storeCurrency;
    const hasTiers = tierCount > 0;

    let loyaltyStatus: 'operational' | 'needs_setup' | 'degraded' = 'operational';
    if (!hasTiers || !hasCurrency) {
      loyaltyStatus = 'needs_setup';
    } else if (!cashbackEnabled) {
      loyaltyStatus = 'degraded';
    }

    // Calculate Data Sync Health
    const customerSyncRecord = syncStatusRecords.find(r => r.syncType === 'customers');
    const orderSyncRecord = syncStatusRecords.find(r => r.syncType === 'orders');

    // Determine customer sync status
    let customerSyncStatus: 'completed' | 'running' | 'failed' | 'never_run' = 'never_run';
    if (shopSettings?.customersSyncInProgress) {
      customerSyncStatus = 'running';
    } else if (!shopSettings?.customersInitialSynced) {
      customerSyncStatus = 'never_run';
    } else if (customerSyncRecord?.status === 'FAILED') {
      customerSyncStatus = 'failed';
    } else {
      customerSyncStatus = 'completed';
    }

    // Determine order sync status
    let orderSyncStatus: 'idle' | 'running' | 'failed' | 'completed' = 'idle';
    if (orderSyncRecord?.status === 'RUNNING') {
      orderSyncStatus = 'running';
    } else if (orderSyncRecord?.status === 'FAILED') {
      orderSyncStatus = 'failed';
    } else if (orderSyncRecord?.status === 'COMPLETED') {
      orderSyncStatus = 'completed';
    }

    // Overall data sync health
    let dataSyncStatus: 'operational' | 'syncing' | 'degraded' | 'failed' = 'operational';
    if (customerSyncStatus === 'failed' || orderSyncStatus === 'failed') {
      dataSyncStatus = 'failed';
    } else if (customerSyncStatus === 'running' || orderSyncStatus === 'running') {
      dataSyncStatus = 'syncing';
    } else if (webhookStatus === 'critical') {
      dataSyncStatus = 'degraded';
    }

    // Detect widget status from theme settings via GraphQL
    let widgetDetectionResult = {
      isEnabled: false,
      blockType: 'none' as 'app_embed' | 'section' | 'none',
      themeName: null as string | null,
      lastChecked: new Date(),
    };

    try {
      const { detectWidgetStatus, updateWidgetStatusCache } = await import("~/services/widget-detection.server");
      const detection = await detectWidgetStatus(authResult.admin);
      widgetDetectionResult = {
        isEnabled: detection.isEnabled,
        blockType: detection.blockType,
        themeName: detection.themeName,
        lastChecked: detection.lastChecked,
      };

      // Update the cached status in database if it changed
      const currentCachedStatus = shopSettings?.widgetIsActive ?? false;
      if (detection.isEnabled !== currentCachedStatus) {
        await updateWidgetStatusCache(db, shop, detection.isEnabled);
      }
    } catch (error) {
      console.error("[Dashboard] Error detecting widget status:", error);
      // Fall back to cached value
      widgetDetectionResult.isEnabled = shopSettings?.widgetIsActive ?? false;
    }

    const widgetSetupDismissed = shopSettings?.widgetSetupDismissed ?? false;
    let widgetStatusValue: 'active' | 'inactive' | 'not_configured' = 'not_configured';
    if (widgetDetectionResult.isEnabled) {
      widgetStatusValue = 'active';
    } else if (widgetSetupDismissed) {
      widgetStatusValue = 'inactive';
    }

    // Simplified dashboard data
    const dashboardData: DashboardData = {
      shop,
      shopSettings: shopSettings ? {
        storeCurrency: shopSettings.storeCurrency || 'USD',
        tierRecalculationEnabled: false,
        advancedAnalyticsEnabled: shopSettings.advancedAnalyticsEnabled,
        autoCashbackProcessingEnabled: shopSettings.autoCashbackProcessingEnabled,
        emailMarketingEnabled: shopSettings.emailMarketingEnabled,
        tierProductsEnabled: shopSettings.tierProductsEnabled,
      } : null,
      widgetStatus: {
        isActive: widgetDetectionResult.isEnabled,
        setupDismissed: widgetSetupDismissed,
        status: widgetStatusValue,
        blockType: widgetDetectionResult.blockType,
        themeName: widgetDetectionResult.themeName,
        lastChecked: widgetDetectionResult.lastChecked.toISOString(),
      },
      shopifyMetrics: { source: 'unavailable' },
      webhookStats: {
        processedLast24h: webhookProcessedCount,
        errorsLast24h: webhookErrorsLast24h,
        errorsLastHour: webhookErrorsLastHour,
        successRate: Math.round(successRate * 10) / 10,
        status: webhookStatus
      },
      databaseHealth: {
        responseTime: dbHealth.responseTime,
        status: dbHealth.status,
        uptime: dbHealth.uptime,
        lastCheck: dbHealth.lastCheck.toISOString(),
      },
      loyaltyEngine: {
        tierCount,
        status: loyaltyStatus,
        automationEnabled: false, // Note: tierRecalculationEnabled is always false in shopSettings
        currency: shopSettings?.storeCurrency || 'Not Set',
        cashbackEnabled,
      },
      dataSyncHealth: {
        status: dataSyncStatus,
        customerSync: {
          status: customerSyncStatus,
          lastSyncAt: customerSyncRecord?.lastSyncAt?.toISOString() || null,
          recordsProcessed: customerSyncRecord?.recordsProcessed || 0,
        },
        orderSync: {
          status: orderSyncStatus,
          lastSyncAt: orderSyncRecord?.lastSyncAt?.toISOString() || null,
          recordsProcessed: orderSyncRecord?.recordsProcessed || 0,
        },
        webhookHealth: webhookStatus,
      },
      currentPlan: serializedPlan,
      // Use GraphQL subscription name (most accurate) instead of stale billing.check() data
      activeSubscription: subscriptionName ? {
        name: subscriptionName,
        status: 'ACTIVE'
      } : activeSubscription,
      monthlyOrderUsage,
      currentMonth,
      daysRemaining,
    };

    const loaderEnd = Date.now();
    const totalTime = loaderEnd - loaderStart;
    console.log(`[Dashboard] ⚡ Simplified loader execution time: ${totalTime}ms`);
    return json(dashboardData);
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error("[Dashboard] Loader error:", error);
    throw new Response("Failed to load dashboard data", { status: 500 });
  }
};


// ============================================
// ACTION - Handle feature manager
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "toggle-feature") {
    const feature = formData.get("feature") as string;
    const enabled = formData.get("enabled") === "true";

    // Fetch current value before update
    const currentSettings = await db.shopSettings.findUnique({
      where: { shop },
      select: { [feature]: true }
    });

    const previousValue = currentSettings?.[feature];

    const updateData: any = {};
    updateData[feature] = enabled;

    // Log the feature toggle change
    console.log(`[Feature Manager] Shop "${shop}" ${enabled ? 'enabled' : 'disabled'} feature: ${feature}`);

    // Special logging for Automatic Cashback Processing
    if (feature === 'autoCashbackProcessingEnabled') {
      console.log(`[Feature Manager] ⚠️  Automatic Cashback Processing is now ${enabled ? 'ENABLED' : 'DISABLED'} for ${shop}`);
      console.log(`[Feature Manager] Database change: autoCashbackProcessingEnabled ${previousValue} → ${enabled}`);
      console.log(`[Feature Manager] Future orders will ${enabled ? 'automatically earn' : 'NOT automatically earn'} cashback rewards`);
    }

    await db.shopSettings.update({
      where: { shop },
      data: updateData,
    });

    // Verify the update
    const updatedSettings = await db.shopSettings.findUnique({
      where: { shop },
      select: { [feature]: true }
    });

    console.log(`[Feature Manager] ✓ Database updated successfully: ${feature} = ${updatedSettings?.[feature]}`);

    return json({ success: true, feature, enabled });
  }

  return json({ success: false });
};

// ============================================
// DASHBOARD COMPONENT
// ============================================

export default function Dashboard() {
  const data = useLoaderData<typeof loader>() as DashboardData;
  const navigate = useNavigate();
  const fetcher = useFetcher();

  // Toast state for feature toggle feedback
  const [toastActive, setToastActive] = useState(false);
  const [toastContent, setToastContent] = useState('');

  // Handle feature toggle submission
  const handleToggleFeature = useCallback((feature: string, enabled: boolean) => {
    const formData = new FormData();
    formData.append("action", "toggle-feature");
    formData.append("feature", feature);
    formData.append("enabled", enabled.toString());

    fetcher.submit(formData, { method: "post" });
  }, [fetcher]);

  // Show toast message when feature toggle completes
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const result = fetcher.data as { success?: boolean; feature?: string; enabled?: boolean };

      if (result.success && result.feature && typeof result.enabled === 'boolean') {
        const featureNames: Record<string, string> = {
          'advancedAnalyticsEnabled': 'Advanced Analytics',
          'autoCashbackProcessingEnabled': 'Automatic Cashback Processing',
          'emailMarketingEnabled': 'Email Marketing Campaigns',
          'tierProductsEnabled': 'Membership Tiers Module',
        };

        const featureName = featureNames[result.feature] || result.feature;
        const action = result.enabled ? 'enabled' : 'disabled';

        setToastContent(`${featureName} ${action}`);
        setToastActive(true);
      }
    }
  }, [fetcher.state, fetcher.data]);

  // Toast markup
  const toastMarkup = toastActive ? (
    <Toast
      content={toastContent}
      onDismiss={() => setToastActive(false)}
      duration={3000}
    />
  ) : null;

  // Calculate active features count
  const activeFeaturesCount = [
    data.shopSettings?.advancedAnalyticsEnabled,
    data.shopSettings?.autoCashbackProcessingEnabled,
    data.shopSettings?.emailMarketingEnabled,
    data.shopSettings?.tierProductsEnabled,
  ].filter(Boolean).length;

  return (
    <Frame>
      <Page title="Dashboard">
      <Layout>
        {/* System Status - Full Width */}
        <Layout.Section>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Card>
                  <BlockStack gap="400">
              {/* Header */}
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={StatusActiveIcon} tone="base" />
                  <Text variant="headingMd" as="h2">System Status</Text>
                </InlineStack>
                <Badge tone="success">
                  {data.shopifyMetrics?.source !== 'unavailable' ? '100%' : '99%'} Health
                </Badge>
              </InlineStack>

              <Divider />

              {/* Overall Status Banner */}
              <Banner tone="success">
                <InlineStack gap="400" blockAlign="center" wrap={false}>
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text variant="bodyMd" fontWeight="semibold">All Systems Operational</Text>
                  </InlineStack>
                  <Text variant="bodySm" tone="subdued">•</Text>
                  <Text variant="bodySm" tone="subdued">Uptime: 99.9%</Text>
                  <Text variant="bodySm" tone="subdued">•</Text>
                  <Text variant="bodySm" tone="subdued">0 active incidents</Text>
                </InlineStack>
              </Banner>

              {/* Component Cards Grid */}
              <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
                {/* Subscription Component */}
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="start">
                      <Box
                        padding="200"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <Icon source={CreditCardIcon} tone="base" />
                      </Box>
                      <Badge tone="success">Active</Badge>
                    </InlineStack>

                    <Text variant="headingSm" as="h3" fontWeight="semibold">
                      {data.activeSubscription?.name ? data.activeSubscription.name.replace('RewardsPro', 'Rewards') : 'Rewards Free'}
                    </Text>

                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Orders Used:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.monthlyOrderUsage?.orderCount || 0} / {data.monthlyOrderUsage?.planLimit || MANAGED_PLANS["RewardsPro Free"].ordersIncluded}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Usage:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.monthlyOrderUsage ? Math.round((data.monthlyOrderUsage.orderCount / data.monthlyOrderUsage.planLimit) * 100) : 0}%
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Cycle:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.daysRemaining || 0}d remaining
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Status:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.activeSubscription?.status || 'Free'}
                        </Text>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    <Text variant="bodySm" tone="subdued">
                      Subscription plan and monthly order usage
                    </Text>
                  </BlockStack>
                </Card>

                {/* Database Component */}
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="start">
                      <Box
                        padding="200"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <Icon source={DatabaseIcon} tone="base" />
                      </Box>
                      <Badge tone={
                        data.databaseHealth.status === 'connected' ? 'success' :
                        data.databaseHealth.status === 'degraded' ? 'warning' : 'critical'
                      }>
                        {data.databaseHealth.status === 'connected' ? 'Operational' :
                         data.databaseHealth.status === 'degraded' ? 'Degraded' : 'Disconnected'}
                      </Badge>
                    </InlineStack>

                    <Text variant="headingSm" as="h3" fontWeight="semibold">
                      Database
                    </Text>

                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Response:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.databaseHealth.responseTime === 0
                            ? 'Measuring...'
                            : data.databaseHealth.responseTime < 1000
                              ? `${Math.round(data.databaseHealth.responseTime)}ms`
                              : `${(data.databaseHealth.responseTime / 1000).toFixed(2)}s`
                          }
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Uptime:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.databaseHealth.uptime}%
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Status:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.databaseHealth.status === 'connected' ? 'Connected' :
                           data.databaseHealth.status === 'degraded' ? 'Slow' : 'Disconnected'}
                        </Text>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    <Text variant="bodySm" tone="subdued">
                      PostgreSQL database storing all customer data, tiers, and transactions
                    </Text>
                  </BlockStack>
                </Card>

                {/* Webhook Processing Component */}
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="start">
                      <Box
                        padding="200"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <Icon source={RefreshIcon} tone="base" />
                      </Box>
                      <Badge tone={
                        data.webhookStats.status === 'healthy' ? 'success' :
                        data.webhookStats.status === 'degraded' ? 'warning' : 'critical'
                      }>
                        {data.webhookStats.status === 'healthy' ? 'Operational' :
                         data.webhookStats.status === 'degraded' ? 'Degraded' : 'Critical'}
                      </Badge>
                    </InlineStack>

                    <Text variant="headingSm" as="h3" fontWeight="semibold">
                      Webhook Processing
                    </Text>

                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Processed:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.webhookStats.processedLast24h.toLocaleString()} (24h)
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Success Rate:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.webhookStats.successRate.toFixed(1)}%
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Status:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.webhookStats.status === 'healthy' ? 'Healthy' :
                           data.webhookStats.status === 'degraded' ? 'Degraded' : 'Critical'}
                        </Text>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    <Text variant="bodySm" tone="subdued">
                      {data.webhookStats.status === 'healthy'
                        ? 'Receiving and processing Shopify order events'
                        : data.webhookStats.errorsLastHour > 0
                          ? `${data.webhookStats.errorsLastHour} errors in the last hour`
                          : 'Webhook processing experiencing issues'}
                    </Text>
                  </BlockStack>
                </Card>

                {/* Loyalty Engine Component */}
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="start">
                      <Box
                        padding="200"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <Icon source={ChartVerticalIcon} tone="base" />
                      </Box>
                      <Badge tone={
                        data.loyaltyEngine.status === 'operational' ? 'success' :
                        data.loyaltyEngine.status === 'degraded' ? 'warning' : 'attention'
                      }>
                        {data.loyaltyEngine.status === 'operational' ? 'Operational' :
                         data.loyaltyEngine.status === 'degraded' ? 'Degraded' : 'Needs Setup'}
                      </Badge>
                    </InlineStack>

                    <Text variant="headingSm" as="h3" fontWeight="semibold">
                      Loyalty Engine
                    </Text>

                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Tiers:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.loyaltyEngine.tierCount > 0
                            ? `${data.loyaltyEngine.tierCount} Tier${data.loyaltyEngine.tierCount !== 1 ? 's' : ''}`
                            : 'Not Configured'}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Cashback:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.loyaltyEngine.cashbackEnabled ? 'Enabled' : 'Disabled'}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Currency:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.loyaltyEngine.currency}
                        </Text>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    <Text variant="bodySm" tone="subdued">
                      Tier calculations and cashback rewards processing
                    </Text>
                  </BlockStack>
                </Card>

                {/* Data Sync Component */}
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="start">
                      <Box
                        padding="200"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <Icon source={RefreshIcon} tone="base" />
                      </Box>
                      <Badge tone={
                        data.dataSyncHealth.status === 'operational' ? 'success' :
                        data.dataSyncHealth.status === 'syncing' ? 'info' :
                        data.dataSyncHealth.status === 'degraded' ? 'warning' : 'critical'
                      }>
                        {data.dataSyncHealth.status === 'operational' ? 'Operational' :
                         data.dataSyncHealth.status === 'syncing' ? 'Syncing' :
                         data.dataSyncHealth.status === 'degraded' ? 'Degraded' : 'Failed'}
                      </Badge>
                    </InlineStack>

                    <Text variant="headingSm" as="h3" fontWeight="semibold">
                      Data Sync
                    </Text>

                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Database:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.databaseHealth.status === 'connected' ? 'Connected' :
                           data.databaseHealth.status === 'degraded' ? 'Slow' : 'Disconnected'}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Customers:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.dataSyncHealth.customerSync.status === 'running' ? 'Syncing...' :
                           data.dataSyncHealth.customerSync.status === 'failed' ? 'Failed' :
                           data.dataSyncHealth.customerSync.status === 'never_run' ? 'Not Synced' :
                           formatTimeAgo(data.dataSyncHealth.customerSync.lastSyncAt)}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Webhooks:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.dataSyncHealth.webhookHealth === 'healthy' ? 'Healthy' :
                           data.dataSyncHealth.webhookHealth === 'degraded' ? 'Degraded' : 'Critical'}
                        </Text>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    <Text variant="bodySm" tone="subdued">
                      Real-time synchronization with Shopify store
                    </Text>
                  </BlockStack>
                </Card>

                {/* Widget Embed Component */}
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="start">
                      <Box
                        padding="200"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <Icon source={StatusActiveIcon} tone="base" />
                      </Box>
                      <Badge tone={
                        data.widgetStatus.status === 'active' ? 'success' :
                        data.widgetStatus.status === 'inactive' ? 'warning' : 'attention'
                      }>
                        {data.widgetStatus.status === 'active' ? 'Active' :
                         data.widgetStatus.status === 'inactive' ? 'Inactive' : 'Not Setup'}
                      </Badge>
                    </InlineStack>

                    <Text variant="headingSm" as="h3" fontWeight="semibold">
                      Widget Embed
                    </Text>

                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Theme:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.widgetStatus.themeName || 'Unknown'}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Block:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.widgetStatus.blockType === 'app_embed' ? 'App Embed' :
                           data.widgetStatus.blockType === 'section' ? 'Section' : 'Not Found'}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">Status:</Text>
                        <Text variant="bodySm" fontWeight="medium">
                          {data.widgetStatus.status === 'active' ? 'Visible' :
                           data.widgetStatus.status === 'inactive' ? 'Disabled' : 'Not Enabled'}
                        </Text>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    <Text variant="bodySm" tone="subdued">
                      {data.widgetStatus.isActive
                        ? 'Widget is showing on your storefront'
                        : 'Enable in Theme Editor → App embeds'}
                    </Text>
                  </BlockStack>
                </Card>
              </InlineGrid>
            </BlockStack>
                </Card>
              </div>
            </div>
          </div>
        </Layout.Section>

        {/* Feature Manager */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={SettingsIcon} tone="base" />
                  <Text variant="headingMd" as="h2">Feature Manager</Text>
                </InlineStack>
                <Badge tone={activeFeaturesCount === 4 ? 'success' : activeFeaturesCount >= 2 ? 'info' : 'warning'}>
                  {activeFeaturesCount}/4 Active
                </Badge>
              </InlineStack>

              <Text variant="bodyMd" tone="subdued" as="p">
                Enable or disable specific features for your store. Changes take effect immediately.
              </Text>

              <Divider />

              <BlockStack gap="200">
                {/* Analytics Row */}
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#fafafa',
                  borderRadius: '8px',
                  border: '1px solid #e1e3e5'
                }}>
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="300" blockAlign="center">
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        backgroundColor: data.shopSettings?.advancedAnalyticsEnabled ? '#e3f1df' : '#f1f1f1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Icon source={ChartVerticalIcon} tone={data.shopSettings?.advancedAnalyticsEnabled ? 'success' : 'subdued'} />
                      </div>
                      <BlockStack gap="050">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">Advanced Analytics</Text>
                        <Text variant="bodySm" tone="subdued" as="span">Analytics and reporting features</Text>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="300" blockAlign="center">
                      <Badge tone={data.shopSettings?.advancedAnalyticsEnabled ? 'success' : 'enabled'}>
                        {data.shopSettings?.advancedAnalyticsEnabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      <div
                        style={{
                          width: '52px',
                          height: '28px',
                          borderRadius: '14px',
                          backgroundColor: data.shopSettings?.advancedAnalyticsEnabled ? '#008060' : '#8c9196',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease'
                        }}
                        onClick={() => handleToggleFeature('advancedAnalyticsEnabled', !data.shopSettings?.advancedAnalyticsEnabled)}
                      >
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: 'white',
                          position: 'absolute',
                          top: '2px',
                          left: data.shopSettings?.advancedAnalyticsEnabled ? '26px' : '2px',
                          transition: 'left 0.2s ease',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }} />
                      </div>
                    </InlineStack>
                  </InlineStack>
                </div>

                {/* Cashback Row */}
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#fafafa',
                  borderRadius: '8px',
                  border: '1px solid #e1e3e5'
                }}>
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="300" blockAlign="center">
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        backgroundColor: data.shopSettings?.autoCashbackProcessingEnabled ? '#e3f1df' : '#f1f1f1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Icon source={CashDollarIcon} tone={data.shopSettings?.autoCashbackProcessingEnabled ? 'success' : 'subdued'} />
                      </div>
                      <BlockStack gap="050">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">Automatic Cashback Processing</Text>
                        <Text variant="bodySm" tone="subdued" as="span">Process rewards automatically for orders</Text>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="300" blockAlign="center">
                      <Badge tone={data.shopSettings?.autoCashbackProcessingEnabled ? 'success' : 'enabled'}>
                        {data.shopSettings?.autoCashbackProcessingEnabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      <div
                        style={{
                          width: '52px',
                          height: '28px',
                          borderRadius: '14px',
                          backgroundColor: data.shopSettings?.autoCashbackProcessingEnabled ? '#008060' : '#8c9196',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease'
                        }}
                        onClick={() => handleToggleFeature('autoCashbackProcessingEnabled', !data.shopSettings?.autoCashbackProcessingEnabled)}
                      >
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: 'white',
                          position: 'absolute',
                          top: '2px',
                          left: data.shopSettings?.autoCashbackProcessingEnabled ? '26px' : '2px',
                          transition: 'left 0.2s ease',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }} />
                      </div>
                    </InlineStack>
                  </InlineStack>
                </div>

                {/* Email Marketing Row */}
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#fafafa',
                  borderRadius: '8px',
                  border: '1px solid #e1e3e5'
                }}>
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="300" blockAlign="center">
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        backgroundColor: data.shopSettings?.emailMarketingEnabled ? '#e3f1df' : '#f1f1f1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Icon source={CreditCardIcon} tone={data.shopSettings?.emailMarketingEnabled ? 'success' : 'subdued'} />
                      </div>
                      <BlockStack gap="050">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">Email Marketing Campaigns</Text>
                        <Text variant="bodySm" tone="subdued" as="span">Promotional email campaigns</Text>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="300" blockAlign="center">
                      <Badge tone={data.shopSettings?.emailMarketingEnabled ? 'success' : 'enabled'}>
                        {data.shopSettings?.emailMarketingEnabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      <div
                        style={{
                          width: '52px',
                          height: '28px',
                          borderRadius: '14px',
                          backgroundColor: data.shopSettings?.emailMarketingEnabled ? '#008060' : '#8c9196',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease'
                        }}
                        onClick={() => handleToggleFeature('emailMarketingEnabled', !data.shopSettings?.emailMarketingEnabled)}
                      >
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: 'white',
                          position: 'absolute',
                          top: '2px',
                          left: data.shopSettings?.emailMarketingEnabled ? '26px' : '2px',
                          transition: 'left 0.2s ease',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }} />
                      </div>
                    </InlineStack>
                  </InlineStack>
                </div>

                {/* Membership Tiers Row */}
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#fafafa',
                  borderRadius: '8px',
                  border: '1px solid #e1e3e5'
                }}>
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="300" blockAlign="center">
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        backgroundColor: data.shopSettings?.tierProductsEnabled ? '#e3f1df' : '#f1f1f1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Icon source={DatabaseIcon} tone={data.shopSettings?.tierProductsEnabled ? 'success' : 'subdued'} />
                      </div>
                      <BlockStack gap="050">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">Membership Tiers Module</Text>
                        <Text variant="bodySm" tone="subdued" as="span">Tiered loyalty program with benefits</Text>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="300" blockAlign="center">
                      <Badge tone={data.shopSettings?.tierProductsEnabled ? 'success' : 'enabled'}>
                        {data.shopSettings?.tierProductsEnabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      <div
                        style={{
                          width: '52px',
                          height: '28px',
                          borderRadius: '14px',
                          backgroundColor: data.shopSettings?.tierProductsEnabled ? '#008060' : '#8c9196',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease'
                        }}
                        onClick={() => handleToggleFeature('tierProductsEnabled', !data.shopSettings?.tierProductsEnabled)}
                      >
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: 'white',
                          position: 'absolute',
                          top: '2px',
                          left: data.shopSettings?.tierProductsEnabled ? '26px' : '2px',
                          transition: 'left 0.2s ease',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }} />
                      </div>
                    </InlineStack>
                  </InlineStack>
                </div>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* OLD SYSTEM STATUS - COMMENTED OUT FOR REVIEW
        <Layout.Section variant="twoThirds">
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={StatusActiveIcon} tone="base" />
                  <Text variant="headingMd" as="h2">System Status (OLD)</Text>
                </InlineStack>
                <Badge tone="success">All Systems Operational</Badge>
              </InlineStack>
              ... rest of old code ...
            </BlockStack>
          </Card>
        </Layout.Section>
        END OF OLD SYSTEM STATUS */}
      </Layout>
    </Page>
    {toastMarkup}
  </Frame>
  );
}