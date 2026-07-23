import {
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineStack,
  List,
  Text
} from "@shopify/polaris";
import {
  getPlanDetails,
  calculateUsageMetrics
} from "~/constants/billing.constants";
import { PlanOverLimitBanner } from "./PlanOverLimitBanner";
import { PlanUsageProgress } from "./PlanUsageProgress";

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
  } | null;

  // Legacy support for old props
  monthlyOrderUsage?: {
    orderCount: number;
    planLimit: number;
    projectedOrders: number;
    currentMonth?: string;
  } | null;

  // UI options
  title?: string;
  showUpgradeButton?: boolean;
  showFeatures?: boolean;
  showOverageBanner?: boolean;
  showProjectedUsage?: boolean;
  showBillingPeriod?: boolean;
  compact?: boolean;

  // Actions
  onUpgrade?: () => void;
  onRefresh?: () => void;
}

export function CurrentPlanCard({
  activeSubscription,
  currentPlan,
  orderUsageData,
  monthlyOrderUsage,
  title = "Plan Details",
  showUpgradeButton = true,
  showFeatures = false,
  showOverageBanner = true,
  showProjectedUsage = true,
  showBillingPeriod = false,
  compact = false,
  onUpgrade,
  onRefresh
}: CurrentPlanCardProps) {
  // Use new orderUsageData if available, fall back to legacy monthlyOrderUsage
  const usageData = orderUsageData || monthlyOrderUsage;

  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    console.log('[CurrentPlanCard] Props received:', {
      activeSubscription,
      currentPlan,
      orderUsageData,
      monthlyOrderUsage,
      usageData
    });
  }

  // Get plan details and usage metrics
  const planDetails = getPlanDetails(activeSubscription, currentPlan);
  const usageMetrics = calculateUsageMetrics(usageData, planDetails);

  if (process.env.NODE_ENV === 'development') {
    console.log('[CurrentPlanCard] Calculated:', {
      planDetails,
      usageMetrics
    });
  }

  // Format billing period dates
  const formatBillingPeriod = () => {
    if (!orderUsageData?.startDate || !orderUsageData?.endDate) {
      return null;
    }

    const startDate = new Date(orderUsageData.startDate);
    const endDate = new Date(orderUsageData.endDate);

    const formatOptions: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      year: startDate.getFullYear() !== endDate.getFullYear() ? 'numeric' : undefined
    };

    return `${startDate.toLocaleDateString('en-US', formatOptions)} - ${endDate.toLocaleDateString('en-US', formatOptions)}`;
  };

  const billingPeriod = formatBillingPeriod();

  return (
    <BlockStack gap="400">
      {/* Over Limit Banner */}
      {showOverageBanner && onUpgrade && (
        <PlanOverLimitBanner
          planDetails={planDetails}
          usageMetrics={usageMetrics}
          onUpgrade={onUpgrade}
        />
      )}

      {/* Main Card */}
      <Card>
        <Box padding={compact ? "400" : "600"}>
          <BlockStack gap={compact ? "400" : "600"}>
            {/* Header */}
            {!compact && (
              <>
                <InlineStack align="space-between">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg">
                      {title}
                    </Text>
                    {usageData?.currentMonth && (
                      <Text as="p" variant="bodyMd" tone="subdued">
                        {showBillingPeriod && billingPeriod
                          ? `Billing period: ${billingPeriod}`
                          : `Showing usage for ${usageData.currentMonth}`}
                      </Text>
                    )}
                  </BlockStack>
                  <InlineStack gap="300">
                    {onRefresh && (
                      <Button
                        variant="plain"
                        onClick={onRefresh}
                        accessibilityLabel="Refresh usage data"
                      >
                        Refresh
                      </Button>
                    )}
                    {showUpgradeButton && onUpgrade && (
                      <Button
                        variant="primary"
                        onClick={onUpgrade}
                      >
                        Upgrade plan
                      </Button>
                    )}
                  </InlineStack>
                </InlineStack>
                <Divider />
              </>
            )}

            {/* Current Plan Section */}
            <BlockStack gap="400">
              {compact ? (
                // Compact view for dashboard
                <InlineStack align="space-between" wrap={false}>
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingMd">
                      Current Plan
                    </Text>
                    <Text as="p" variant="headingLg">
                      {planDetails.displayName}
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100" align="end">
                    <Text as="p" variant="bodyMd" tone="subdued">
                      {planDetails.interval === "month" ? "Monthly" : "Annual"}
                    </Text>
                    <Text as="p" variant="headingMd">
                      ${planDetails.price}
                      <Text as="span" variant="bodyMd" tone="subdued">
                        /{planDetails.interval}
                      </Text>
                    </Text>
                  </BlockStack>
                </InlineStack>
              ) : (
                // Full view
                <>
                  <Text as="h3" variant="heading2xl">
                    {planDetails.displayName}
                  </Text>
                  <InlineStack align="space-between">
                    <Text as="p" variant="headingLg">
                      ${planDetails.price}{" "}
                      <Text as="span" variant="bodyLg" tone="subdued">
                        USD/{planDetails.interval}
                      </Text>
                    </Text>
                    {showBillingPeriod && billingPeriod && (
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Current period: {billingPeriod}
                      </Text>
                    )}
                  </InlineStack>
                </>
              )}

              {/* Usage Progress */}
              <PlanUsageProgress
                usageMetrics={usageMetrics}
                currentMonth={usageData?.currentMonth}
                showProjected={showProjectedUsage}
                compact={compact}
              />

              {/* Order Count Details */}
              {!compact && usageData && (
                <Box paddingBlock="200">
                  <InlineStack align="space-between">
                    <BlockStack gap="100">
                      <Text as="span" variant="bodyMd" tone="subdued">
                        Orders processed
                      </Text>
                      <Text as="p" variant="headingMd">
                        {usageData.orderCount.toLocaleString()}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100" align="end">
                      <Text as="span" variant="bodyMd" tone="subdued">
                        Plan includes
                      </Text>
                      <Text as="p" variant="headingMd">
                        {usageData.planLimit.toLocaleString()} orders
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </Box>
              )}

              {/* Features List (optional) */}
              {showFeatures && !compact && planDetails.features.length > 0 && (
                <>
                  <Divider />
                  <BlockStack gap="300">
                    <Text as="h4" variant="headingSm">
                      Included features
                    </Text>
                    <List type="bullet">
                      {planDetails.features.map((feature, index) => (
                        <List.Item key={index}>{feature}</List.Item>
                      ))}
                    </List>
                  </BlockStack>
                </>
              )}

              {/* Compact Upgrade Button */}
              {compact && showUpgradeButton && onUpgrade && (
                <Button
                  fullWidth
                  onClick={onUpgrade}
                  variant={usageMetrics.isOverLimit ? "primary" : "plain"}
                >
                  {usageMetrics.isOverLimit ? "Compare capacity" : "View plans"}
                </Button>
              )}
            </BlockStack>
          </BlockStack>
        </Box>
      </Card>
    </BlockStack>
  );
}
