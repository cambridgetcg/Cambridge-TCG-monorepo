import { Banner } from "@shopify/polaris";
import type { ManagedPlan, UsageMetrics } from "~/constants/billing.constants";

interface PlanOverLimitBannerProps {
  planDetails: ManagedPlan;
  usageMetrics: UsageMetrics;
  onUpgrade: () => void;
}

export function PlanOverLimitBanner({
  planDetails,
  usageMetrics,
  onUpgrade
}: PlanOverLimitBannerProps) {
  if (!usageMetrics.isOverLimit) {
    return null;
  }

  return (
    <Banner
      tone="warning"
      title="Monthly plan capacity reached"
    >
      <p>
        You've processed {usageMetrics.currentUsage} orders this month,
        exceeding your {planDetails.displayName} plan limit of {usageMetrics.planLimit} orders.
        RewardsPro will keep running and there is no overage charge. New paid
        upgrades are retired; existing records and support remain available.
      </p>
    </Banner>
  );
}
