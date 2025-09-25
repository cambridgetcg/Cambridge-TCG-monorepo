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
  calculateUsageMetrics,
  type ManagedPlan
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

  // Usage data
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
  compact?: boolean;

  // Actions
  onUpgrade?: () => void;
}

export function CurrentPlanCard({
  activeSubscription,
  currentPlan,
  monthlyOrderUsage,
  title = "Plan Details",
  showUpgradeButton = true,
  showFeatures = false,
  showOverageBanner = true,
  showProjectedUsage = true,
  compact = false,
  onUpgrade
}: CurrentPlanCardProps) {
  // Get plan details and usage metrics
  const planDetails = getPlanDetails(activeSubscription, currentPlan);
  const usageMetrics = calculateUsageMetrics(monthlyOrderUsage, planDetails);

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
                    {monthlyOrderUsage?.currentMonth && (
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Showing usage for {monthlyOrderUsage.currentMonth}
                      </Text>
                    )}
                  </BlockStack>
                  {showUpgradeButton && onUpgrade && (
                    <Button
                      variant="primary"
                      onClick={onUpgrade}
                    >
                      Upgrade plan
                    </Button>
                  )}
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
                  <Text as="p" variant="headingLg">
                    ${planDetails.price}{" "}
                    <Text as="span" variant="bodyLg" tone="subdued">
                      USD/{planDetails.interval}
                    </Text>
                  </Text>
                </>
              )}

              {/* Usage Progress */}
              <PlanUsageProgress
                usageMetrics={usageMetrics}
                currentMonth={monthlyOrderUsage?.currentMonth}
                showProjected={showProjectedUsage}
                compact={compact}
              />

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
                  {usageMetrics.isOverLimit ? "Upgrade now" : "View plans"}
                </Button>
              )}
            </BlockStack>
          </BlockStack>
        </Box>
      </Card>
    </BlockStack>
  );
}