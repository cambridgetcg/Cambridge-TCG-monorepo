import {
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineStack,
  InlineGrid,
  Text,
  Badge,
  ProgressBar,
} from "@shopify/polaris";
import {
  getPlanDetails,
  calculateUsageMetrics,
} from "~/constants/billing.constants";
import { PlanOverLimitBanner } from "./PlanOverLimitBanner";

export interface SystemMonitorPlanCardProps {
  // Plan data
  activeSubscription?: {
    name: string;
    status: string;
  } | null;
  currentPlan?: {
    planName: string;
    status: string;
  } | null;

  // Usage data
  monthlyOrderUsage?: {
    orderCount: number;
    planLimit: number;
    projectedOrders: number;
    currentMonth?: string;
  } | null;

  // UI options
  showUpgradeButton?: boolean;
  showOverageBanner?: boolean;

  // Actions
  onUpgrade?: () => void;
}

export function SystemMonitorPlanCard({
  activeSubscription,
  currentPlan,
  monthlyOrderUsage,
  showUpgradeButton = true,
  showOverageBanner = true,
  onUpgrade,
}: SystemMonitorPlanCardProps) {
  // Get plan details and usage metrics
  const planDetails = getPlanDetails(activeSubscription, currentPlan);
  const usageMetrics = calculateUsageMetrics(monthlyOrderUsage, planDetails);

  // Calculate additional metrics
  const daysInCycle = 30;
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysRemaining = Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const averageDailyOrders = monthlyOrderUsage?.orderCount
    ? (monthlyOrderUsage.orderCount / (daysInCycle - daysRemaining))
    : 0;

  const peakDailyOrders = Math.ceil(averageDailyOrders * 1.8); // Estimate peak as 180% of average

  // Calculate days to limit
  const remainingOrders = (monthlyOrderUsage?.planLimit || 0) - (monthlyOrderUsage?.orderCount || 0);
  const daysToLimit = averageDailyOrders > 0
    ? Math.floor(remainingOrders / averageDailyOrders)
    : Infinity;

  // Determine status and display text
  let daysToLimitDisplay = '';
  let daysToLimitTone: 'success' | 'warning' | 'critical' = 'success';

  if (remainingOrders <= 0) {
    daysToLimitDisplay = 'Exceeded';
    daysToLimitTone = 'critical';
  } else if (daysToLimit === Infinity || averageDailyOrders === 0) {
    daysToLimitDisplay = 'N/A';
    daysToLimitTone = 'success';
  } else if (daysToLimit <= 5) {
    daysToLimitDisplay = `${daysToLimit} days`;
    daysToLimitTone = 'critical';
  } else if (daysToLimit <= 10) {
    daysToLimitDisplay = `${daysToLimit} days`;
    daysToLimitTone = 'warning';
  } else {
    daysToLimitDisplay = `${daysToLimit} days`;
    daysToLimitTone = 'success';
  }

  // Format renewal date
  const renewalDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Use correct field names from calculateUsageMetrics
  const utilization = usageMetrics.usagePercentage;
  const projectedUtilization = usageMetrics.projectedPercentage;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Over Limit Banner */}
      {showOverageBanner && onUpgrade && (
        <div style={{ marginBottom: '1rem' }}>
          <PlanOverLimitBanner
            planDetails={planDetails}
            usageMetrics={usageMetrics}
            onUpgrade={onUpgrade}
          />
        </div>
      )}

      {/* Main Card */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Card>
            <BlockStack gap="400" inlineAlign="stretch">
          {/* Status Header */}
          <Box
            padding="400"
            background="bg-surface-secondary"
            borderRadius="200"
          >
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h3" fontWeight="semibold">
                  {planDetails.displayName}
                </Text>
                <Badge tone="success">
                  ACTIVE
                </Badge>
              </InlineStack>

              <InlineGrid columns={2} gap="400">
                <BlockStack gap="050">
                  <Text variant="bodySm" tone="subdued">
                    Plan Rate
                  </Text>
                  <Text variant="headingLg" as="p">
                    ${planDetails.price}
                  </Text>
                </BlockStack>

                <BlockStack gap="050" inlineAlign="end">
                  <Text variant="bodySm" tone="subdued">
                    Billing
                  </Text>
                  <Text variant="headingLg" as="p">
                    {planDetails.interval}
                  </Text>
                </BlockStack>
              </InlineGrid>
            </BlockStack>
          </Box>

          {/* Resource Monitor */}
          <Box
            padding="400"
            background="bg-surface"
            borderRadius="200"
          >
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="bodySm" fontWeight="semibold">
                  Resource Utilization
                </Text>
                <Text variant="bodySm" tone="subdued">
                  {utilization.toFixed(2)}%
                </Text>
              </InlineStack>

              <ProgressBar
                progress={utilization}
                tone={utilization > 90 ? 'critical' : utilization > 75 ? 'warning' : 'success'}
              />

              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingLg" as="p">
                  {usageMetrics.currentUsage.toLocaleString()}
                </Text>
                <Text variant="bodySm" tone="subdued">
                  of {usageMetrics.planLimit.toLocaleString()}
                </Text>
              </InlineStack>
            </BlockStack>
          </Box>

          {/* Billing Cycle Info */}
          <Box
            padding="400"
            background="bg-surface-secondary"
            borderRadius="200"
          >
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="bodySm" tone="subdued">
                  Current Period
                </Text>
                <Text variant="bodyMd" fontWeight="medium">
                  {daysRemaining} days remaining
                </Text>
              </InlineStack>

              {remainingOrders > 0 && daysToLimit !== Infinity && daysToLimit < daysRemaining && (
                <>
                  <Divider />
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodySm" tone="subdued">
                      Estimated to reach limit
                    </Text>
                    <Text variant="bodyMd" fontWeight="medium" tone={
                      daysToLimitTone === 'critical' ? 'critical' :
                      daysToLimitTone === 'warning' ? 'caution' : undefined
                    }>
                      {daysToLimitDisplay}
                    </Text>
                  </InlineStack>
                </>
              )}

              {monthlyOrderUsage && monthlyOrderUsage.projectedOrders > monthlyOrderUsage.planLimit && (
                <>
                  <Divider />
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodySm" tone="subdued">
                      Projected overage
                    </Text>
                    <Text variant="bodyMd" fontWeight="medium" tone="critical">
                      {(monthlyOrderUsage.projectedOrders - monthlyOrderUsage.planLimit).toLocaleString()} orders
                    </Text>
                  </InlineStack>
                </>
              )}
            </BlockStack>
          </Box>

          {/* Next Billing */}
          <Box
            padding="300"
            background={projectedUtilization > 100 ? "bg-surface-critical-subdued" : "bg-surface"}
            borderRadius="200"
          >
            <BlockStack gap="100">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="bodySm" fontWeight="semibold">
                  Next Billing Event
                </Text>
                {projectedUtilization > 100 && (
                  <Badge tone="critical">Alert</Badge>
                )}
              </InlineStack>
              <Text variant="bodySm" tone="subdued">
                {renewalDate} • ${planDetails.price}
              </Text>
              {projectedUtilization > 100 && monthlyOrderUsage && (
                <Text variant="bodySm" tone="critical">
                  Estimated overage: +${((monthlyOrderUsage.projectedOrders - monthlyOrderUsage.planLimit) * (planDetails.overageRate || 0.05)).toFixed(2)}
                </Text>
              )}
            </BlockStack>
          </Box>
        </BlockStack>
          </Card>
        </div>
      </div>
    </div>
  );
}
