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
  "RewardsPro Pro": {
    name: "RewardsPro Pro",
    displayName: "Pro",
    price: 49,
    interval: "month",
    ordersIncluded: 500,
    overageRate: 0.10, // $10 per 100 orders = $0.10 per order
    features: [
      "Up to 2,000 total customers",
      "Up to 500 orders/month",
      "$10 per 100 additional orders",
      "Batch processing cashback",
      "1,000 emails/month",
      "Priority support"
    ],
    isFree: false
  },
  "RewardsPro Max": {
    name: "RewardsPro Max",
    displayName: "Max",
    price: 149,
    interval: "month",
    ordersIncluded: 2000,
    overageRate: 0.05, // $5 per 100 orders = $0.05 per order
    features: [
      "Unlimited customers",
      "Up to 2,000 orders/month",
      "$5 per 100 additional orders",
      "Sell tier memberships",
      "White label email",
      "5,000 emails/month",
      "Advanced analytics"
    ],
    isFree: false
  },
  "RewardsPro Ultra": {
    name: "RewardsPro Ultra",
    displayName: "Ultra",
    price: 499,
    interval: "month",
    ordersIncluded: 999999, // Effectively unlimited
    overageRate: 0,
    features: [
      "Unlimited everything",
      "Unlimited customers",
      "Unlimited orders",
      "Unlimited emails",
      "Full white label solution",
      "Custom SMTP integration",
      "Dedicated support"
    ],
    isFree: false
  }
};

export const PLAN_COMPARISON = [
  {
    feature: "Customers",
    pro: "2,000 max",
    max: "Unlimited",
    ultra: "Unlimited",
  },
  {
    feature: "Orders Included",
    pro: "500/month",
    max: "2,000/month",
    ultra: "Unlimited",
  },
  {
    feature: "Overage Rate",
    pro: "$10/100 orders",
    max: "$5/100 orders",
    ultra: "None",
  },
  {
    feature: "Batch Processing",
    pro: "✓",
    max: "✓",
    ultra: "✓",
  },
  {
    feature: "Tier Memberships",
    pro: "—",
    max: "✓",
    ultra: "✓",
  },
  {
    feature: "Email Marketing",
    pro: "1,000/month",
    max: "5,000/month",
    ultra: "Unlimited",
  },
  {
    feature: "White Label",
    pro: "—",
    max: "✓",
    ultra: "✓ Full",
  },
  {
    feature: "Support",
    pro: "Priority",
    max: "Advanced",
    ultra: "Dedicated",
  }
];

// Helper function to get plan details
export function getPlanDetails(
  activeSubscription?: { name: string; status: string } | null,
  currentPlan?: { planName: string; status: string } | null
): ManagedPlan {
  const activePlanName = activeSubscription?.name || currentPlan?.planName || "RewardsPro Pro";
  return MANAGED_PLANS[activePlanName as keyof typeof MANAGED_PLANS] || MANAGED_PLANS["RewardsPro Pro"];
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
  const planLimit = monthlyOrderUsage?.planLimit || planDetails?.ordersIncluded || 500;
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