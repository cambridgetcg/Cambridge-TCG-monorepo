// Billing plan definitions and utilities

export interface ManagedPlan {
  name: string;
  displayName: string;
  price: number;
  interval: "month" | "year";
  ordersIncluded: number;
  overageRate: number;
  features: string[];
  isFree?: boolean;
}

export const MANAGED_PLANS: Record<string, ManagedPlan> = {
  "RewardsPro Free": {
    name: "RewardsPro Free",
    displayName: "Free",
    price: 0,
    interval: "month",
    ordersIncluded: 200,
    overageRate: 0,
    features: [
      "200 orders per month",
      "All core features included",
      "Basic tier management",
      "Store credit system",
      "Customer analytics"
    ],
    isFree: true
  },
  "RewardsPro Monthly": {
    name: "RewardsPro Monthly",
    displayName: "Monthly",
    price: 9.99,
    interval: "month",
    ordersIncluded: 1000,
    overageRate: 0.01,
    features: [
      "1,000 orders per month",
      "All core features included",
      "Advanced tier management",
      "Priority support",
      "API access"
    ],
    isFree: false
  },
  "RewardsPro Annual": {
    name: "RewardsPro Annual",
    displayName: "Annual",
    price: 99.99,
    interval: "year",
    ordersIncluded: 12000,
    overageRate: 0.008,
    features: [
      "12,000 orders per year",
      "All core features included",
      "Advanced tier management",
      "Priority support",
      "API access",
      "20% annual discount"
    ],
    isFree: false
  }
};

export const PLAN_COMPARISON = [
  {
    feature: "Orders Included",
    free: "200/month",
    monthly: "1,000/month",
    annual: "12,000/year",
  },
  {
    feature: "Tier Management",
    free: "✓ Basic",
    monthly: "✓ Advanced",
    annual: "✓ Advanced",
  },
  {
    feature: "Store Credit System",
    free: "✓",
    monthly: "✓",
    annual: "✓",
  },
  {
    feature: "Customer Analytics",
    free: "✓",
    monthly: "✓",
    annual: "✓",
  },
  {
    feature: "Priority Support",
    free: "—",
    monthly: "✓",
    annual: "✓",
  },
  {
    feature: "API Access",
    free: "—",
    monthly: "✓",
    annual: "✓",
  },
  {
    feature: "Overage Rate",
    free: "N/A",
    monthly: "$0.01/order",
    annual: "$0.008/order",
  }
];

// Helper function to get plan details
export function getPlanDetails(
  activeSubscription?: { name: string; status: string } | null,
  currentPlan?: { planName: string; status: string } | null
): ManagedPlan {
  const activePlanName = activeSubscription?.name || currentPlan?.planName || "RewardsPro Free";
  return MANAGED_PLANS[activePlanName as keyof typeof MANAGED_PLANS] || MANAGED_PLANS["RewardsPro Free"];
}

// Helper function to calculate usage metrics
export interface UsageMetrics {
  currentUsage: number;
  planLimit: number;
  projectedUsage: number;
  usagePercentage: number;
  projectedPercentage: number;
  isOverLimit: boolean;
  ordersNotCounted: number;
  progressTone: "success" | "warning" | "critical";
}

export function calculateUsageMetrics(
  monthlyOrderUsage?: {
    orderCount: number;
    planLimit: number;
    projectedOrders: number;
  } | null,
  planDetails?: ManagedPlan
): UsageMetrics {
  const currentUsage = monthlyOrderUsage?.orderCount || 0;
  const planLimit = monthlyOrderUsage?.planLimit || planDetails?.ordersIncluded || 200;
  const projectedUsage = monthlyOrderUsage?.projectedOrders || 0;

  const usagePercentage = Math.min(Math.round((currentUsage / planLimit) * 100), 100);
  const projectedPercentage = Math.min(Math.round((projectedUsage / planLimit) * 100), 100);

  const isOverLimit = currentUsage >= planLimit;
  const ordersNotCounted = Math.max(0, currentUsage - planLimit);

  let progressTone: "success" | "warning" | "critical" = "success";
  if (usagePercentage >= 100) {
    progressTone = "critical";
  } else if (usagePercentage >= 80) {
    progressTone = "warning";
  }

  return {
    currentUsage,
    planLimit,
    projectedUsage,
    usagePercentage,
    projectedPercentage,
    isOverLimit,
    ordersNotCounted,
    progressTone
  };
}