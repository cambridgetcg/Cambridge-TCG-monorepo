import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { useState, useCallback, useEffect, useRef } from "react";
import { useAnalytics } from "~/hooks/useAnalytics";
import { useToast } from "~/hooks/useToast";

import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Icon,
  Badge,
  Toast,
  Divider,
  Banner,
  Button,
} from "@shopify/polaris";
import {
  StatusActiveIcon,
  SettingsIcon,
  ChartVerticalIcon,
  CashDollarIcon,
  DatabaseIcon,
  CheckCircleIcon,
} from "~/utils/polaris-icons";
import { authenticate, FREE_PLAN, PRO_PLAN, PRO_ANNUAL_PLAN, MAX_PLAN, MAX_ANNUAL_PLAN, ULTRA_PLAN, ULTRA_ANNUAL_PLAN, STARTER_PLAN, GROWTH_PLAN, ENTERPRISE_PLAN } from "../shopify.server";
import prisma from "../db.server";
import { MANAGED_PLANS } from "~/constants/billing.constants";
import { measureQuery, getDatabaseHealth } from "~/utils/database-health.server";
import { FeatureTogglesList } from "~/components/DesignSystem";

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
  // Review banner
  reviewBannerDismissed: boolean;

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
          plans: [
            // Current plans
            FREE_PLAN, PRO_PLAN, PRO_ANNUAL_PLAN, MAX_PLAN, MAX_ANNUAL_PLAN, ULTRA_PLAN, ULTRA_ANNUAL_PLAN,
            // Legacy plans
            STARTER_PLAN, GROWTH_PLAN, ENTERPRISE_PLAN,
          ],
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
        prisma.shopSettings.findUnique({
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
            reviewBannerDismissed: true,
          }
        })
      ),

      // Billing subscription from database for plan details
      prisma.billingSubscription.findUnique({
        where: { shop },
      }).catch(() => null),

      // Tier count for loyalty engine status
      prisma.tier.count({
        where: { shop }
      }).catch(() => 0),

      // Sync status for data sync health
      prisma.syncStatus.findMany({
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
      const cachedUsage = await prisma.monthlyOrderUsage.findFirst({
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

        orderCount = await prisma.order.count({
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
      prisma.webhookProcessed.count({
        where: {
          shop,
          processedAt: { gte: last24Hours }
        }
      }),
      prisma.webhookError.count({
        where: {
          shop,
          createdAt: { gte: last24Hours }
        }
      }),
      prisma.webhookError.count({
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
    // Uses in-memory caching (5 min TTL) to prevent excessive API calls
    let widgetDetectionResult = {
      isEnabled: false,
      blockType: 'none' as 'app_embed' | 'section' | 'none',
      themeName: null as string | null,
      lastChecked: new Date(),
    };

    try {
      const { detectWidgetStatus, updateWidgetStatusCache } = await import("~/services/widget-detection.server");
      // Pass shop for caching - subsequent calls within 5 min will use cache
      const detection = await detectWidgetStatus(authResult.admin, shop);
      widgetDetectionResult = {
        isEnabled: detection.isEnabled,
        blockType: detection.blockType,
        themeName: detection.themeName,
        lastChecked: detection.lastChecked,
      };

      // Update the cached status in database if it changed
      const currentCachedStatus = shopSettings?.widgetIsActive ?? false;
      if (detection.isEnabled !== currentCachedStatus) {
        await updateWidgetStatusCache(prisma, shop, detection.isEnabled);
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
      reviewBannerDismissed: shopSettings?.reviewBannerDismissed ?? false,
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
// ACTION - Handle feature manager (OPTIMIZED)
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "toggle-feature") {
    const feature = formData.get("feature") as string;
    const enabled = formData.get("enabled") === "true";

    // Validate feature name to prevent injection
    const validFeatures = [
      'advancedAnalyticsEnabled',
      'autoCashbackProcessingEnabled',
      'emailMarketingEnabled',
      'tierProductsEnabled'
    ];

    if (!validFeatures.includes(feature)) {
      return json({ success: false, error: 'Invalid feature' }, { status: 400 });
    }

    // All features are now accessible to all tiers - no entitlement check required

    const updateData: Record<string, boolean> = {};
    updateData[feature] = enabled;

    // Log the feature toggle change
    console.log(`[Feature Manager] Shop "${shop}" ${enabled ? 'enabled' : 'disabled'} feature: ${feature}`);

    // Special logging for Automatic Cashback Processing
    if (feature === 'autoCashbackProcessingEnabled') {
      console.log(`[Feature Manager] ⚠️  Automatic Cashback Processing is now ${enabled ? 'ENABLED' : 'DISABLED'} for ${shop}`);
      console.log(`[Feature Manager] Future orders will ${enabled ? 'automatically earn' : 'NOT automatically earn'} cashback rewards`);
    }

    // Single DB operation with error handling
    try {
      await prisma.shopSettings.update({
        where: { shop },
        data: updateData,
      });

      console.log(`[Feature Manager] ✓ Database updated: ${feature} = ${enabled}`);

      return json({ success: true, feature, enabled });
    } catch (dbError: any) {
      console.error(`[Feature Manager] ✗ Database update failed:`, dbError);
      return json({
        success: false,
        error: dbError.message || 'Failed to update feature setting'
      }, { status: 500 });
    }
  }

  return json({ success: false, error: 'Unknown action' });
};

// ============================================
// SHOULD REVALIDATE - Prevent full loader reload on feature toggle
// ============================================

export function shouldRevalidate({
  formData,
  defaultShouldRevalidate,
}: {
  formAction?: string;
  formData?: FormData;
  defaultShouldRevalidate: boolean;
}) {
  // Skip loader revalidation for feature toggle actions
  // The optimistic UI handles the immediate visual update
  if (formData?.get("action") === "toggle-feature") {
    return false;
  }

  return defaultShouldRevalidate;
}

// ============================================
// DASHBOARD COMPONENT
// ============================================

export default function Dashboard() {
  const data = useLoaderData<typeof loader>() as DashboardData;

  const navigate = useNavigate();
  const fetcher = useFetcher();

  // Review banner state: 'idle' | 'leaving' | 'claimed'
  const [reviewBannerState, setReviewBannerState] = useState<'idle' | 'leaving' | 'claimed'>('idle');
  const [reviewBannerVisible, setReviewBannerVisible] = useState(!data?.reviewBannerDismissed);
  const reviewFetcher = useFetcher();

  const handleLeaveReview = useCallback(() => {
    window.open('https://apps.shopify.com/rewards-pro#modal-show=ReviewListingModal', '_blank');
    setReviewBannerState('leaving');
  }, []);

  const handleReviewClaimed = useCallback(() => {
    setReviewBannerState('claimed');
    reviewFetcher.submit({}, { method: 'POST', action: '/api/review-claimed' });
  }, [reviewFetcher]);

  // Watch for the confirmationUrl coming back from the review-claimed API
  useEffect(() => {
    if (reviewFetcher.state === 'idle' && reviewFetcher.data) {
      const d = reviewFetcher.data as {
        success?: boolean;
        confirmationUrl?: string;
        billingError?: string;
        alreadyClaimed?: boolean;
        skipped?: boolean;
      };
      if (d.confirmationUrl) {
        // Redirect merchant to Shopify billing confirmation page
        window.location.href = d.confirmationUrl;
      } else {
        // Billing failed or skipped — still hide the banner after a beat
        setTimeout(() => setReviewBannerVisible(false), 3000);
      }
    }
  }, [reviewFetcher.state, reviewFetcher.data]);

  const handleDismissReviewBanner = useCallback(() => {
    setReviewBannerVisible(false);
    reviewFetcher.submit({}, { method: 'POST', action: '/api/dismiss-review-banner' });
  }, [reviewFetcher]);

  // Analytics tracking
  const { trackCustomEvent } = useAnalytics({ pageTitle: 'Dashboard' });
  const hasTrackedDashboardView = useRef(false);

  // Track dashboard view with the initial metrics once per component lifetime.
  useEffect(() => {
    if (hasTrackedDashboardView.current) return;
    hasTrackedDashboardView.current = true;

    console.log('[Dashboard] Mount useEffect - tracking analytics');
    try {
      trackCustomEvent('dashboard_view', {
        plan_name: data.monthlyOrderUsage?.planName || 'Free',
        order_count: data.monthlyOrderUsage?.orderCount || 0,
        webhook_status: data.webhookStats?.status || 'unknown',
      });
    } catch (err) {
      console.error('[Dashboard] Analytics tracking failed:', err);
    }
  }, [
    data.monthlyOrderUsage?.planName,
    data.monthlyOrderUsage?.orderCount,
    data.webhookStats?.status,
    trackCustomEvent,
  ]);

  // Standardized toast notifications
  const { toast, showSuccess, showError, hideToast } = useToast();

  // OPTIMISTIC UI: Track pending toggle states for instant feedback
  const [optimisticToggles, setOptimisticToggles] = useState<Record<string, boolean>>({});

  // Get effective feature state (optimistic value takes precedence during submission)
  const getFeatureState = useCallback((feature: string, serverValue: boolean | undefined): boolean => {
    // If we have a pending optimistic value for this feature, use it
    if (feature in optimisticToggles) {
      return optimisticToggles[feature];
    }
    return serverValue ?? false;
  }, [optimisticToggles]);

  // Handle feature toggle submission with optimistic update
  const handleToggleFeature = useCallback((feature: string, enabled: boolean) => {
    // OPTIMISTIC: Update UI immediately
    setOptimisticToggles(prev => ({ ...prev, [feature]: enabled }));

    const formData = new FormData();
    formData.append("action", "toggle-feature");
    formData.append("feature", feature);
    formData.append("enabled", enabled.toString());

    fetcher.submit(formData, { method: "post" });
  }, [fetcher]);

  // Handle fetcher completion - show toast (keep optimistic state since loader won't revalidate)
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const result = fetcher.data as { success?: boolean; feature?: string; enabled?: boolean; error?: string };

      if (result.success && result.feature && typeof result.enabled === 'boolean') {
        // NOTE: We keep the optimistic state because shouldRevalidate returns false
        // The optimistic value will persist until full page navigation/refresh
        // This is intentional to prevent the toggle from reverting

        const featureNames: Record<string, string> = {
          'advancedAnalyticsEnabled': 'Advanced Analytics',
          'autoCashbackProcessingEnabled': 'Automatic Cashback Processing',
          'emailMarketingEnabled': 'Email Marketing Campaigns',
          'tierProductsEnabled': 'Membership Tiers Module',
        };

        const featureName = featureNames[result.feature] || result.feature;
        const action = result.enabled ? 'enabled' : 'disabled';

        showSuccess(`${featureName} ${action}`, 3000);
      } else if (result.error) {
        // On error, revert optimistic state to server values
        setOptimisticToggles({});
        showError('Failed to update feature');
      }
    }
  }, [fetcher.state, fetcher.data, showSuccess, showError]);

  // Validate data exists (after all hooks to satisfy rules-of-hooks)
  if (!data) {
    return (
      <>
        <Page title="Dashboard">
          <Banner title="Loading Error" tone="critical">
            <p>Failed to load dashboard data. Please refresh the page.</p>
          </Banner>
        </Page>
      </>
    );
  }

  // Toast markup
  const toastMarkup = toast.active ? (
    <Toast
      content={toast.content}
      error={toast.error}
      onDismiss={hideToast}
      duration={toast.duration}
    />
  ) : null;

  // Calculate active features count using optimistic values
  // All features are now accessible to all tiers
  const analyticsEnabled = getFeatureState('advancedAnalyticsEnabled', data.shopSettings?.advancedAnalyticsEnabled);
  const cashbackEnabled = getFeatureState('autoCashbackProcessingEnabled', data.shopSettings?.autoCashbackProcessingEnabled);
  const tiersEnabled = getFeatureState('tierProductsEnabled', data.shopSettings?.tierProductsEnabled);

  // All features are accessible to all tiers
  const allFeatures = [analyticsEnabled, cashbackEnabled, tiersEnabled];
  const activeFeaturesCount = allFeatures.filter(Boolean).length;
  const totalAccessibleFeatures = allFeatures.length;

  // Compute system health summary for compact status row
  const systemComponents = [
    { label: 'Database', ok: data.databaseHealth.status === 'connected' },
    { label: 'Webhooks', ok: data.webhookStats.status === 'healthy' },
    { label: 'Sync', ok: data.dataSyncHealth.status === 'operational' || data.dataSyncHealth.status === 'syncing' },
    { label: 'Widget', ok: data.widgetStatus.status === 'active' },
    { label: 'Engine', ok: data.loyaltyEngine.status === 'operational' },
  ];
  const healthyCount = systemComponents.filter(c => c.ok).length;
  const allHealthy = healthyCount === systemComponents.length;

  const usagePercent = data.monthlyOrderUsage
    ? Math.round((data.monthlyOrderUsage.orderCount / data.monthlyOrderUsage.planLimit) * 100)
    : 0;

  return (
    <>
      <Page title="Dashboard">
      <Layout>
        {/* Review Banner — compact */}
        {reviewBannerVisible && (
          <Layout.Section>
            <Banner
              title={
                reviewBannerState === 'claimed'
                  ? 'Thank you! Setting up 3 months of Pro…'
                  : reviewBannerState === 'leaving'
                    ? 'Done writing your review?'
                    : 'Enjoying Rewards Pro? Get 3 months of Pro free.'
              }
              tone="info"
              action={
                reviewBannerState === 'claimed'
                  ? undefined
                  : reviewBannerState === 'leaving'
                    ? { content: "I've left my review", onAction: handleReviewClaimed }
                    : { content: '⭐ Leave a Review', onAction: handleLeaveReview }
              }
              secondaryAction={
                reviewBannerState === 'idle'
                  ? { content: 'Maybe later', onAction: handleDismissReviewBanner }
                  : reviewBannerState === 'leaving'
                    ? { content: 'Not yet', onAction: handleDismissReviewBanner }
                    : undefined
              }
              onDismiss={reviewBannerState !== 'claimed' ? handleDismissReviewBanner : undefined}
            >
              {reviewBannerState === 'idle' && (
                <Text as="p" variant="bodySm">
                  Share your experience on the Shopify App Store and we'll upgrade you for free.
                </Text>
              )}
            </Banner>
          </Layout.Section>
        )}

        {/* Plan + Usage — the hero section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="050">
                  <Text variant="headingLg" as="h2" fontWeight="bold">
                    {data.activeSubscription?.name
                      ? data.activeSubscription.name.replace('RewardsPro ', '')
                      : 'Free Plan'}
                  </Text>
                  <Text variant="bodySm" as="span" tone="subdued">
                    {data.currentMonth} • {data.daysRemaining}d remaining in cycle
                  </Text>
                </BlockStack>
                <Button variant="plain" onClick={() => navigate('/app/billing')}>
                  {data.activeSubscription?.name?.includes('Ultra') ? 'Manage Plan' : 'Upgrade'}
                </Button>
              </InlineStack>

              <Divider />

              <InlineGrid columns={{ xs: 2, sm: 4 }} gap="300">
                <BlockStack gap="050">
                  <Text variant="heading2xl" as="p" fontWeight="bold">
                    {data.monthlyOrderUsage?.orderCount || 0}
                  </Text>
                  <Text variant="bodySm" as="span" tone="subdued">
                    Orders this month
                  </Text>
                </BlockStack>
                <BlockStack gap="050">
                  <Text variant="heading2xl" as="p" fontWeight="bold">
                    {data.monthlyOrderUsage?.planLimit || 100}
                  </Text>
                  <Text variant="bodySm" as="span" tone="subdued">
                    Plan limit
                  </Text>
                </BlockStack>
                <BlockStack gap="050">
                  <Text variant="heading2xl" as="p" fontWeight="bold">
                    {usagePercent}%
                  </Text>
                  <Text variant="bodySm" as="span" tone="subdued">
                    Usage
                  </Text>
                </BlockStack>
                <BlockStack gap="050">
                  <Text variant="heading2xl" as="p" fontWeight="bold">
                    {`${activeFeaturesCount}/${totalAccessibleFeatures}`}
                  </Text>
                  <Text variant="bodySm" as="span" tone="subdued">
                    Features active
                  </Text>
                </BlockStack>
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* System Health — one compact row */}
        <Layout.Section>
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Icon source={allHealthy ? CheckCircleIcon : StatusActiveIcon} tone={allHealthy ? 'success' : 'warning'} />
                <Text variant="bodyMd" as="span" fontWeight="semibold">
                  {allHealthy ? 'All Systems Operational' : `${healthyCount}/${systemComponents.length} Systems Healthy`}
                </Text>
              </InlineStack>
              <InlineStack gap="300">
                {systemComponents.map((c) => (
                  <Badge key={c.label} tone={c.ok ? 'success' : 'warning'}>
                    {c.label}
                  </Badge>
                ))}
              </InlineStack>
            </InlineStack>
          </Card>
        </Layout.Section>

        {/* Feature Manager — using DesignSystem FeatureToggleCard */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={SettingsIcon} tone="base" />
                  <Text variant="headingMd" as="h2">Features</Text>
                </InlineStack>
                <Badge tone={activeFeaturesCount === totalAccessibleFeatures ? 'success' : 'info'}>
                  {`${activeFeaturesCount}/${totalAccessibleFeatures} Active`}
                </Badge>
              </InlineStack>

              <FeatureTogglesList
                toggles={[
                  {
                    id: 'analytics',
                    icon: ChartVerticalIcon,
                    title: 'Advanced Analytics',
                    description: 'Analytics and reporting features',
                    enabled: analyticsEnabled,
                    onChange: (enabled) => handleToggleFeature('advancedAnalyticsEnabled', enabled),
                  },
                  {
                    id: 'cashback',
                    icon: CashDollarIcon,
                    title: 'Automatic Cashback',
                    description: 'Process rewards automatically for orders',
                    enabled: cashbackEnabled,
                    onChange: (enabled) => handleToggleFeature('autoCashbackProcessingEnabled', enabled),
                  },
                  {
                    id: 'tiers',
                    icon: DatabaseIcon,
                    title: 'Membership Tiers',
                    description: 'Tiered loyalty program with benefits',
                    enabled: tiersEnabled,
                    onChange: (enabled) => handleToggleFeature('tierProductsEnabled', enabled),
                  },
                ]}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
    {toastMarkup}
  </>
  );
}

// ============================================
// ERROR BOUNDARY - Catches render errors
// ============================================

export function ErrorBoundary() {
  const error = useRouteError();

  // Log error details
  console.error('[Dashboard ErrorBoundary] Error caught:', error);

  if (isRouteErrorResponse(error)) {
    console.error('[Dashboard ErrorBoundary] Route error response:', {
      status: error.status,
      statusText: error.statusText,
      data: error.data,
    });

    return (
      <>
        <Page title="Dashboard Error">
          <Layout>
            <Layout.Section>
              <Banner title={`Error ${error.status}: ${error.statusText}`} tone="critical">
                <p>The dashboard encountered an error.</p>
                <p><strong>Details:</strong> {typeof error.data === 'string' ? error.data : JSON.stringify(error.data)}</p>
                <p>Check browser console (F12) for more details.</p>
              </Banner>
            </Layout.Section>
          </Layout>
        </Page>
      </>
    );
  }

  // Handle unknown errors
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const errorStack = error instanceof Error ? error.stack : '';

  console.error('[Dashboard ErrorBoundary] Error message:', errorMessage);
  console.error('[Dashboard ErrorBoundary] Stack trace:', errorStack);

  return (
    <>
      <Page title="Dashboard Error">
        <Layout>
          <Layout.Section>
            <Banner title="Something went wrong" tone="critical">
              <p>The dashboard failed to load.</p>
              <p><strong>Error:</strong> {errorMessage}</p>
              <p>Check browser console (F12) for the full stack trace.</p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    </>
  );
}
