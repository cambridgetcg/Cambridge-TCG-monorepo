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
  // Free plan - Hidden from billing pages but still functional for existing users
  "RewardsPro Free": {
    name: "RewardsPro Free",
    displayName: "Rewards Free",
    price: 0,
    interval: "month",
    ordersIncluded: 100,
    overageRate: 0,
    features: [
      "Up to 500 customers",
      "Up to 100 orders/month",
      "Basic tier management",
      "Store credit system",
      "Email support",
      "Basic analytics"
    ],
    isFree: true
  },
  "RewardsPro Pro": {
    name: "RewardsPro Pro",
    displayName: "Rewards Pro",
    price: 39,
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
  "RewardsPro Pro Annual": {
    name: "RewardsPro Pro Annual",
    displayName: "Rewards Pro Annual",
    price: 336,
    interval: "year",
    ordersIncluded: 500,
    overageRate: 0.10,
    features: [
      "Up to 2,000 total customers",
      "Up to 500 orders/month",
      "$10 per 100 additional orders",
      "Batch processing cashback",
      "1,000 emails/month",
      "Priority support",
      "💰 Save $132/year (28% discount)",
      "🗓️ $28/month when billed annually"
    ],
    isFree: false
  },
  "RewardsPro Max": {
    name: "RewardsPro Max",
    displayName: "Rewards Max",
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
  "RewardsPro Max Annual": {
    name: "RewardsPro Max Annual",
    displayName: "Rewards Max Annual",
    price: 1296,
    interval: "year",
    ordersIncluded: 2000,
    overageRate: 0.05,
    features: [
      "Unlimited customers",
      "Up to 2,000 orders/month",
      "$5 per 100 additional orders",
      "Sell tier memberships",
      "White label email",
      "5,000 emails/month",
      "Advanced analytics",
      "💰 Save $492/year (27% discount)",
      "🗓️ $108/month when billed annually"
    ],
    isFree: false
  },
  "RewardsPro Ultra": {
    name: "RewardsPro Ultra",
    displayName: "Rewards Ultra",
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
  },
  "RewardsPro Ultra Annual": {
    name: "RewardsPro Ultra Annual",
    displayName: "Rewards Ultra Annual",
    price: 4296,
    interval: "year",
    ordersIncluded: 999999,
    overageRate: 0,
    features: [
      "Unlimited everything",
      "Unlimited customers",
      "Unlimited orders",
      "Unlimited emails",
      "Full white label solution",
      "Custom SMTP integration",
      "Dedicated support",
      "💰 Save $1,692/year (28% discount)",
      "🗓️ $358/month when billed annually"
    ],
    isFree: false
  }
};

/**
 * Get the order limit for a given plan name
 * @param planName - Plan name (e.g., "RewardsPro Pro", "RewardsPro Free")
 * @returns Order limit for the plan, defaults to 100 (Free plan)
 */
export function getPlanOrderLimit(planName: string | null | undefined): number {
  if (!planName) return 100; // Default to Free plan limit

  const plan = MANAGED_PLANS[planName];
  return plan?.ordersIncluded ?? 100; // Default to Free plan if not found
}

export const PLAN_COMPARISON = [
  {
    feature: "Customers",
    free: "500 max",
    pro: "2,000 max",
    max: "Unlimited",
    ultra: "Unlimited",
  },
  {
    feature: "Orders Included",
    free: "100/month",
    pro: "500/month",
    max: "2,000/month",
    ultra: "Unlimited",
  },
  {
    feature: "Overage Rate",
    free: "Not available",
    pro: "$10/100 orders",
    max: "$5/100 orders",
    ultra: "None",
  },
  {
    feature: "Batch Processing",
    free: "—",
    pro: "✓",
    max: "✓",
    ultra: "✓",
  },
  {
    feature: "Tier Memberships",
    free: "—",
    pro: "—",
    max: "✓",
    ultra: "✓",
  },
  {
    feature: "Email Marketing",
    free: "—",
    pro: "1,000/month",
    max: "5,000/month",
    ultra: "Unlimited",
  },
  {
    feature: "White Label",
    free: "—",
    pro: "—",
    max: "✓",
    ultra: "✓ Full",
  },
  {
    feature: "Support",
    free: "Email",
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
  const planLimit = monthlyOrderUsage?.planLimit || planDetails?.ordersIncluded || 100;
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