import {
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineStack,
  List,
  Text,
  Banner
} from "@shopify/polaris";
import {
  getPlanDetails,
  calculateUsageMetrics,
  type ManagedPlan
} from "~/constants/billing.constants";
import { PlanOverLimitBanner } from "./PlanOverLimitBanner";
import { PlanUsageProgress } from "./PlanUsageProgress";
import { useEffect, useState } from "react";
import { useFetcher } from "@remix-run/react";

export interface CurrentPlanCardProps {
  // Plan data
  activeSubscription?: {
    name: string;
    status: string;
  } | null;
  currentPlan?: {
    planName: string;
    status: string;
  } | null;

  // Usage data from direct Order table count
  orderUsageData?: {
    orderCount: number;        // Direct count from Order table
    planLimit: number;          // Plan limit
    projectedOrders: number;    // Projected based on current rate
    currentMonth?: string;      // Current month name
    startDate?: Date;          // Start of billing period
    endDate?: Date;            // End of billing period
    countStrategy?: string;     // Which strategy was used
  } | null;

  // Legacy support for old props
  monthlyOrderUsage?: {
    orderCount: number;
    planLimit: number;
    projectedOrders: number;
    currentMonth?: string;
  } | null;

  // Configuration
  shop?: string;              // Shop domain for fetching data
  autoRefresh?: boolean;       // Auto-fetch if no data provided
  daysRemaining?: number;

  // UI options
  title?: string;
  showUpgradeButton?: boolean;
  showFeatures?: boolean;
  showOverageBanner?: boolean;
  showProjectedUsage?: boolean;
  showBillingPeriod?: boolean;
  showCountStrategy?: boolean;  // Show which counting strategy worked
  compact?: boolean;
  isFreePlan?: boolean;

  // Actions
  onUpgrade?: () => void;
  onRefresh?: () => void;
}

export function CurrentPlanCard({
  activeSubscription,
  currentPlan,
  orderUsageData,
  monthlyOrderUsage,
  shop,
  autoRefresh = false,
  daysRemaining,
  title = "Plan Details",
  showUpgradeButton = true,
  showFeatures = false,
  showOverageBanner = true,
  showProjectedUsage = true,
  showBillingPeriod = false,
  showCountStrategy = false,
  compact = false,
  isFreePlan = false,
  onUpgrade,
  onRefresh
}: CurrentPlanCardProps) {
  // Use new orderUsageData if available, fall back to legacy monthlyOrderUsage
  const [usageData, setUsageData] = useState(orderUsageData || monthlyOrderUsage);
  const fetcher = useFetcher();

  // Auto-fetch data if not provided and autoRefresh is enabled
  useEffect(() => {
    if (autoRefresh && !orderUsageData && !monthlyOrderUsage && shop) {
      console.log('[CurrentPlanCardV2] Auto-fetching order count data...');
      fetcher.load(`/api/order-count?shop=${encodeURIComponent(shop)}`);
    }
  }, [autoRefresh, shop]);

  // Update usage data when fetcher completes
  useEffect(() => {
    if (fetcher.data && fetcher.data.success) {
      console.log('[CurrentPlanCardV2] Received order count:', fetcher.data);
      setUsageData({
        orderCount: fetcher.data.orderCount,
        planLimit: fetcher.data.planLimit || (isFreePlan ? 200 : 1000),
        projectedOrders: fetcher.data.projectedOrders || fetcher.data.orderCount,
        currentMonth: fetcher.data.currentMonth,
        countStrategy: fetcher.data.strategy
      });
    }
  }, [fetcher.data]);

  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    console.log('[CurrentPlanCardV2] Props received:', {
      activeSubscription,
      currentPlan,
      orderUsageData,
      monthlyOrderUsage,
      usageData,
      shop
    });
  }

  // Get plan details and usage metrics
  const planDetails = getPlanDetails(activeSubscription, currentPlan);
  const usageMetrics = calculateUsageMetrics(usageData, planDetails);

  if (process.env.NODE_ENV === 'development') {
    console.log('[CurrentPlanCardV2] Calculated:', {
      planDetails,
      usageMetrics
    });
  }

  const isOverLimit = usageMetrics.isOverLimit;
  const usagePercentage = Math.min(
    Math.round((usageMetrics.currentUsage / usageMetrics.planLimit) * 100),
    100
  );

  // Determine tone based on usage
  let progressTone: "success" | "warning" | "critical" = "success";
  if (usagePercentage >= 100) {
    progressTone = "critical";
  } else if (usagePercentage >= 80) {
    progressTone = "warning";
  }

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    }
  };

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
    } else if (shop) {
      // Auto-refresh using fetcher
      fetcher.load(`/api/order-count?shop=${encodeURIComponent(shop)}`);
    }
  };

  if (compact) {
    return (
      <Card>
        <BlockStack gap="300">
          {showCountStrategy && usageData?.countStrategy && (
            <Banner tone="info">
              <Text as="p" variant="bodySm">
                Order count retrieved using: {usageData.countStrategy} strategy
              </Text>
            </Banner>
          )}

          <InlineStack align="space-between">
            <Text as="h3" variant="headingSm">
              {planDetails.displayName}
            </Text>
            <Text as="p" variant="bodySm" tone={progressTone}>
              {usageMetrics.currentUsage} / {usageMetrics.planLimit} orders
            </Text>
          </InlineStack>

          <PlanUsageProgress
            used={usageMetrics.currentUsage}
            limit={usageMetrics.planLimit}
            compact={true}
          />

          {isOverLimit && showUpgradeButton && (
            <Button size="slim" onClick={handleUpgrade}>
              Upgrade Plan
            </Button>
          )}
        </BlockStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="400">
        {/* Count Strategy Banner */}
        {showCountStrategy && usageData?.countStrategy && (
          <Banner tone="info">
            <Text as="p" variant="bodySm">
              Order count retrieved using: {usageData.countStrategy} strategy
            </Text>
          </Banner>
        )}

        {/* Header */}
        <InlineStack align="space-between">
          <Text as="h2" variant="headingMd">
            {title}
          </Text>
          {onRefresh && (
            <Button plain onClick={handleRefresh} loading={fetcher.state === 'loading'}>
              Refresh
            </Button>
          )}
        </InlineStack>

        {/* Over Limit Banner */}
        {showOverageBanner && isOverLimit && (
          <PlanOverLimitBanner
            planName={planDetails.displayName}
            currentUsage={usageMetrics.currentUsage}
            limit={usageMetrics.planLimit}
            onUpgrade={handleUpgrade}
          />
        )}

        {/* Plan Info */}
        <Box>
          <BlockStack gap="200">
            <InlineStack align="space-between">
              <Text as="span" tone="subdued">
                Current Plan
              </Text>
              <Text as="span" fontWeight="semibold">
                {planDetails.displayName}
              </Text>
            </InlineStack>

            <InlineStack align="space-between">
              <Text as="span" tone="subdued">
                Plan Status
              </Text>
              <Text as="span" fontWeight="semibold" tone={planDetails.isActive ? "success" : "subdued"}>
                {planDetails.isActive ? "Active" : "Inactive"}
              </Text>
            </InlineStack>

            {showBillingPeriod && usageData?.startDate && usageData?.endDate && (
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">
                  Billing Period
                </Text>
                <Text as="span">
                  {usageData.startDate ? new Date(usageData.startDate).toLocaleDateString() : 'N/A'} - {usageData.endDate ? new Date(usageData.endDate).toLocaleDateString() : 'N/A'}
                </Text>
              </InlineStack>
            )}
          </BlockStack>
        </Box>

        <Divider />

        {/* Usage Section */}
        <Box>
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">
              Order Usage {usageData?.currentMonth && `(${usageData.currentMonth})`}
            </Text>

            <PlanUsageProgress
              used={usageMetrics.currentUsage}
              limit={usageMetrics.planLimit}
            />

            <BlockStack gap="100">
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">
                  Current Usage
                </Text>
                <Text as="span" fontWeight="semibold">
                  {usageMetrics.currentUsage ? usageMetrics.currentUsage.toLocaleString() : '0'} orders
                </Text>
              </InlineStack>

              <InlineStack align="space-between">
                <Text as="span" tone="subdued">
                  Monthly Limit
                </Text>
                <Text as="span">
                  {usageMetrics.planLimit ? usageMetrics.planLimit.toLocaleString() : '0'} orders
                </Text>
              </InlineStack>

              {daysRemaining !== undefined && (
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">
                    Days Remaining
                  </Text>
                  <Text as="span">
                    {daysRemaining} days
                  </Text>
                </InlineStack>
              )}
            </BlockStack>
          </BlockStack>
        </Box>

        {/* Features Section */}
        {showFeatures && planDetails.features.length > 0 && (
          <>
            <Divider />
            <Box>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Plan Features
                </Text>
                <List>
                  {planDetails.features.map((feature, index) => (
                    <List.Item key={index}>{feature}</List.Item>
                  ))}
                </List>
              </BlockStack>
            </Box>
          </>
        )}

        {/* Actions */}
        {showUpgradeButton && (
          <>
            <Divider />
            <InlineStack gap="200">
              <Button onClick={handleUpgrade} variant="primary">
                {isOverLimit ? 'Upgrade Now' : 'View Plans'}
              </Button>
            </InlineStack>
          </>
        )}
      </BlockStack>
    </Card>
  );
}