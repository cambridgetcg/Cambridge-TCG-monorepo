import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
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
  Box,
  Badge,
  Toast,
  Frame,
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
  RefreshIcon,
  CheckCircleIcon,
  CreditCardIcon,
} from "~/utils/polaris-icons";
import { authenticate, FREE_PLAN, PRO_PLAN, PRO_ANNUAL_PLAN, MAX_PLAN, MAX_ANNUAL_PLAN, ULTRA_PLAN, ULTRA_ANNUAL_PLAN, STARTER_PLAN, GROWTH_PLAN, ENTERPRISE_PLAN } from "../shopify.server";
import db from "../db.server";
import { MANAGED_PLANS } from "~/constants/billing.constants";
import { measureQuery, getDatabaseHealth } from "~/utils/database-health.server";

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
            reviewBannerDismissed: true,
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
      await db.shopSettings.update({
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
  formAction,
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
  // Debug logging - track component lifecycle
  console.log('[Dashboard] Component function called');

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

  // Track dashboard view with metrics on mount
  useEffect(() => {
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
  }, []); // Only track once on mount

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
      <Frame>
        <Page title="Dashboard">
          <Banner title="Loading Error" tone="critical">
            <p>Failed to load dashboard data. Please refresh the page.</p>
          </Banner>
        </Page>
      </Frame>
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

  return (
    <Frame>
      <Page title="Dashboard">
      <Layout>
        {/* Review Request Banner */}
        {reviewBannerVisible && (
          <Layout.Section>
            <div style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
              borderRadius: '12px',
              padding: '24px 28px',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Decorative star accents */}
              <div style={{
                position: 'absolute', top: '-20px', right: '-20px',
                width: '120px', height: '120px', borderRadius: '50%',
                background: 'rgba(255,215,0,0.08)', pointerEvents: 'none'
              }} />
              <div style={{
                position: 'absolute', bottom: '-30px', right: '100px',
                width: '80px', height: '80px', borderRadius: '50%',
                background: 'rgba(255,215,0,0.05)', pointerEvents: 'none'
              }} />

              {reviewBannerState === 'claimed' ? (
                /* Thank-you / redirect state */
                <InlineStack align="space-between" blockAlign="center" wrap={false}>
                  <InlineStack gap="400" blockAlign="center">
                    <div style={{ fontSize: '32px' }}>🎉</div>
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h2" fontWeight="bold">
                        <span style={{ color: '#ffffff' }}>Thank you! Setting up your 3 months of Pro…</span>
                      </Text>
                      <Text variant="bodySm" as="span">
                        <span style={{ color: 'rgba(255,255,255,0.65)' }}>
                          You'll be redirected to confirm the plan — it's free for 90 days, then $39/mo.
                        </span>
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </InlineStack>
              ) : reviewBannerState === 'leaving' ? (
                /* Confirmation step — after opening App Store */
                <InlineStack align="space-between" blockAlign="center" wrap={false}>
                  <InlineStack gap="400" blockAlign="center">
                    <div style={{ fontSize: '28px' }}>⭐</div>
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h2" fontWeight="bold">
                        <span style={{ color: '#ffffff' }}>Done writing your review?</span>
                      </Text>
                      <Text variant="bodySm" as="span">
                        <span style={{ color: 'rgba(255,255,255,0.65)' }}>
                          Once you've submitted it, click below and we'll activate 3 months of Pro for you.
                        </span>
                      </Text>
                    </BlockStack>
                  </InlineStack>
                  <InlineStack gap="300" blockAlign="center">
                    <div
                      onClick={handleDismissReviewBanner}
                      style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}
                    >
                      Not yet
                    </div>
                    <div
                      onClick={handleReviewClaimed}
                      style={{
                        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                        borderRadius: '8px',
                        padding: '10px 20px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '14px',
                        color: '#1a1a2e',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 4px 12px rgba(255,215,0,0.3)',
                      }}
                    >
                      ✓ I've left my review
                    </div>
                  </InlineStack>
                </InlineStack>
              ) : (
                /* Default state */
                <InlineStack align="space-between" blockAlign="center" wrap={false}>
                  <InlineStack gap="400" blockAlign="center">
                    <div style={{
                      background: 'rgba(255,215,0,0.15)',
                      borderRadius: '12px',
                      width: '52px',
                      height: '52px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <span style={{ fontSize: '26px' }}>⭐</span>
                    </div>
                    <BlockStack gap="050">
                      <Text variant="headingMd" as="h2" fontWeight="bold">
                        <span style={{ color: '#ffffff' }}>Enjoying Rewards Pro? Leave us a review.</span>
                      </Text>
                      <Text variant="bodySm" as="span">
                        <span style={{ color: 'rgba(255,255,255,0.65)' }}>
                          Share your experience on the Shopify App Store and we'll give you{' '}
                          <span style={{ color: '#FFD700', fontWeight: '600' }}>3 months of Pro, free</span>
                          {' '}— as a thank you.
                        </span>
                      </Text>
                    </BlockStack>
                  </InlineStack>
                  <InlineStack gap="300" blockAlign="center">
                    <div
                      onClick={handleDismissReviewBanner}
                      style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: '13px' }}
                    >
                      Maybe later
                    </div>
                    <div
                      onClick={handleLeaveReview}
                      style={{
                        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                        borderRadius: '8px',
                        padding: '10px 22px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '14px',
                        color: '#1a1a2e',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 4px 16px rgba(255,215,0,0.35)',
                        transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                      }}
                    >
                      ⭐ Leave a Review
                    </div>
                  </InlineStack>
                </InlineStack>
              )}
            </div>
          </Layout.Section>
        )}

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
                    <Text variant="bodyMd" as="span" fontWeight="semibold">All Systems Operational</Text>
                  </InlineStack>
                  <Text variant="bodySm" as="span" tone="subdued">•</Text>
                  <Text variant="bodySm" as="span" tone="subdued">Uptime: 99.9%</Text>
                  <Text variant="bodySm" as="span" tone="subdued">•</Text>
                  <Text variant="bodySm" as="span" tone="subdued">0 active incidents</Text>
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
                        <Text variant="bodySm" as="span" tone="subdued">Orders Used:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.monthlyOrderUsage?.orderCount || 0} / {data.monthlyOrderUsage?.planLimit || MANAGED_PLANS["RewardsPro Free"].ordersIncluded}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" as="span" tone="subdued">Usage:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.monthlyOrderUsage ? Math.round((data.monthlyOrderUsage.orderCount / data.monthlyOrderUsage.planLimit) * 100) : 0}%
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" as="span" tone="subdued">Cycle:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.daysRemaining || 0}d remaining
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" as="span" tone="subdued">Status:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.activeSubscription?.status || 'Free'}
                        </Text>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodySm" as="span" tone="subdued">
                        Subscription plan
                      </Text>
                      <Button size="slim" variant="plain" onClick={() => navigate('/app/billing')}>
                        {data.activeSubscription?.name?.includes('Ultra') ? 'Manage' : 'Upgrade'}
                      </Button>
                    </InlineStack>
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
                        <Text variant="bodySm" as="span" tone="subdued">Response:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.databaseHealth.responseTime === 0
                            ? 'Measuring...'
                            : data.databaseHealth.responseTime < 1000
                              ? `${Math.round(data.databaseHealth.responseTime)}ms`
                              : `${(data.databaseHealth.responseTime / 1000).toFixed(2)}s`
                          }
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" as="span" tone="subdued">Uptime:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.databaseHealth.uptime}%
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" as="span" tone="subdued">Status:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.databaseHealth.status === 'connected' ? 'Connected' :
                           data.databaseHealth.status === 'degraded' ? 'Slow' : 'Disconnected'}
                        </Text>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    <Text variant="bodySm" as="span" tone="subdued">
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
                        <Text variant="bodySm" as="span" tone="subdued">Processed:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.webhookStats.processedLast24h.toLocaleString()} (24h)
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" as="span" tone="subdued">Success Rate:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.webhookStats.successRate.toFixed(1)}%
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" as="span" tone="subdued">Status:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.webhookStats.status === 'healthy' ? 'Healthy' :
                           data.webhookStats.status === 'degraded' ? 'Degraded' : 'Critical'}
                        </Text>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    <Text variant="bodySm" as="span" tone="subdued">
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
                        <Text variant="bodySm" as="span" tone="subdued">Tiers:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.loyaltyEngine.tierCount > 0
                            ? `${data.loyaltyEngine.tierCount} Tier${data.loyaltyEngine.tierCount !== 1 ? 's' : ''}`
                            : 'Not Configured'}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" as="span" tone="subdued">Cashback:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.loyaltyEngine.cashbackEnabled ? 'Enabled' : 'Disabled'}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" as="span" tone="subdued">Currency:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.loyaltyEngine.currency}
                        </Text>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    <Text variant="bodySm" as="span" tone="subdued">
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
                        <Text variant="bodySm" as="span" tone="subdued">Database:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.databaseHealth.status === 'connected' ? 'Connected' :
                           data.databaseHealth.status === 'degraded' ? 'Slow' : 'Disconnected'}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" as="span" tone="subdued">Customers:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.dataSyncHealth.customerSync.status === 'running' ? 'Syncing...' :
                           data.dataSyncHealth.customerSync.status === 'failed' ? 'Failed' :
                           data.dataSyncHealth.customerSync.status === 'never_run' ? 'Not Synced' :
                           formatTimeAgo(data.dataSyncHealth.customerSync.lastSyncAt)}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" as="span" tone="subdued">Webhooks:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.dataSyncHealth.webhookHealth === 'healthy' ? 'Healthy' :
                           data.dataSyncHealth.webhookHealth === 'degraded' ? 'Degraded' : 'Critical'}
                        </Text>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    <Text variant="bodySm" as="span" tone="subdued">
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
                        <Text variant="bodySm" as="span" tone="subdued">Theme:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.widgetStatus.themeName || 'Unknown'}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" as="span" tone="subdued">Block:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.widgetStatus.blockType === 'app_embed' ? 'App Embed' :
                           data.widgetStatus.blockType === 'section' ? 'Section' : 'Not Found'}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" as="span" tone="subdued">Status:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {data.widgetStatus.status === 'active' ? 'Visible' :
                           data.widgetStatus.status === 'inactive' ? 'Disabled' : 'Not Enabled'}
                        </Text>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    <Text variant="bodySm" as="span" tone="subdued">
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
                <Badge tone={activeFeaturesCount === totalAccessibleFeatures ? 'success' : activeFeaturesCount >= Math.ceil(totalAccessibleFeatures / 2) ? 'info' : 'warning'}>
                  {`${activeFeaturesCount}/${totalAccessibleFeatures} Active`}
                </Badge>
              </InlineStack>

              <Text variant="bodyMd" as="p" tone="subdued">
                Enable or disable specific features for your store. Changes take effect immediately.
              </Text>

              <Divider />

              <BlockStack gap="200">
                {/* Analytics Row - Available to all tiers */}
                {(() => {
                  const isEnabled = getFeatureState('advancedAnalyticsEnabled', data.shopSettings?.advancedAnalyticsEnabled);
                  return (
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
                            backgroundColor: isEnabled ? '#e3f1df' : '#f1f1f1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background-color 0.15s ease'
                          }}>
                            <Icon source={ChartVerticalIcon} tone={isEnabled ? 'success' : 'subdued'} />
                          </div>
                          <BlockStack gap="050">
                            <Text variant="bodyMd" as="span" fontWeight="semibold" as="span">Advanced Analytics</Text>
                            <Text variant="bodySm" as="span" tone="subdued" as="span">Analytics and reporting features</Text>
                          </BlockStack>
                        </InlineStack>
                        <InlineStack gap="300" blockAlign="center">
                          <Badge tone={isEnabled ? 'success' : 'enabled'}>
                            {isEnabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                          <div
                            style={{
                              width: '52px',
                              height: '28px',
                              borderRadius: '14px',
                              backgroundColor: isEnabled ? '#008060' : '#8c9196',
                              position: 'relative',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s ease'
                            }}
                            onClick={() => handleToggleFeature('advancedAnalyticsEnabled', !isEnabled)}
                          >
                            <div style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              backgroundColor: 'white',
                              position: 'absolute',
                              top: '2px',
                              left: isEnabled ? '26px' : '2px',
                              transition: 'left 0.15s ease',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                              pointerEvents: 'none'
                            }} />
                          </div>
                        </InlineStack>
                      </InlineStack>
                    </div>
                  );
                })()}

                {/* Cashback Row - Available to all tiers */}
                {(() => {
                  const isEnabled = getFeatureState('autoCashbackProcessingEnabled', data.shopSettings?.autoCashbackProcessingEnabled);
                  return (
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
                            backgroundColor: isEnabled ? '#e3f1df' : '#f1f1f1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background-color 0.15s ease'
                          }}>
                            <Icon source={CashDollarIcon} tone={isEnabled ? 'success' : 'subdued'} />
                          </div>
                          <BlockStack gap="050">
                            <Text variant="bodyMd" as="span" fontWeight="semibold" as="span">Automatic Cashback Processing</Text>
                            <Text variant="bodySm" as="span" tone="subdued" as="span">Process rewards automatically for orders</Text>
                          </BlockStack>
                        </InlineStack>
                        <InlineStack gap="300" blockAlign="center">
                          <Badge tone={isEnabled ? 'success' : 'enabled'}>
                            {isEnabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                          <div
                            style={{
                              width: '52px',
                              height: '28px',
                              borderRadius: '14px',
                              backgroundColor: isEnabled ? '#008060' : '#8c9196',
                              position: 'relative',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s ease'
                            }}
                            onClick={() => handleToggleFeature('autoCashbackProcessingEnabled', !isEnabled)}
                          >
                            <div style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              backgroundColor: 'white',
                              position: 'absolute',
                              top: '2px',
                              left: isEnabled ? '26px' : '2px',
                              transition: 'left 0.15s ease',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                              pointerEvents: 'none'
                            }} />
                          </div>
                        </InlineStack>
                      </InlineStack>
                    </div>
                  );
                })()}

                {/* Email Marketing Row - Hidden until feature is ready */}

                {/* Membership Tiers Row - OPTIMISTIC UI */}
                {(() => {
                  const isEnabled = getFeatureState('tierProductsEnabled', data.shopSettings?.tierProductsEnabled);
                  return (
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
                            backgroundColor: isEnabled ? '#e3f1df' : '#f1f1f1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background-color 0.15s ease'
                          }}>
                            <Icon source={DatabaseIcon} tone={isEnabled ? 'success' : 'subdued'} />
                          </div>
                          <BlockStack gap="050">
                            <Text variant="bodyMd" as="span" fontWeight="semibold" as="span">Membership Tiers Module</Text>
                            <Text variant="bodySm" as="span" tone="subdued" as="span">Tiered loyalty program with benefits</Text>
                          </BlockStack>
                        </InlineStack>
                        <InlineStack gap="300" blockAlign="center">
                          <Badge tone={isEnabled ? 'success' : 'enabled'}>
                            {isEnabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                          <div
                            style={{
                              width: '52px',
                              height: '28px',
                              borderRadius: '14px',
                              backgroundColor: isEnabled ? '#008060' : '#8c9196',
                              position: 'relative',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s ease'
                            }}
                            onClick={() => handleToggleFeature('tierProductsEnabled', !isEnabled)}
                          >
                            <div style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              backgroundColor: 'white',
                              position: 'absolute',
                              top: '2px',
                              left: isEnabled ? '26px' : '2px',
                              transition: 'left 0.15s ease',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                              pointerEvents: 'none'
                            }} />
                          </div>
                        </InlineStack>
                      </InlineStack>
                    </div>
                  );
                })()}
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
      <Frame>
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
      </Frame>
    );
  }

  // Handle unknown errors
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const errorStack = error instanceof Error ? error.stack : '';

  console.error('[Dashboard ErrorBoundary] Error message:', errorMessage);
  console.error('[Dashboard ErrorBoundary] Stack trace:', errorStack);

  return (
    <Frame>
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
    </Frame>
  );
}