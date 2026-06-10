// Billing plan definitions and utilities
// IMPORTANT: Order limits are derived from plan-limits.ts (single source of truth)

import { getOrderLimit } from "./plan-limits";

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

/**
 * RATE-BASED GATING MODEL
 * All plans have access to all features - differentiation is through LIMITS.
 * Features listed here emphasize capacity/limits rather than feature availability.
 *
 * NOTE: ordersIncluded is derived from plan-limits.ts via getOrderLimit().
 * Do NOT hardcode order limits here — update plan-limits.ts instead.
 */
export const MANAGED_PLANS: Record<string, ManagedPlan> = {
  // Free plan - Hidden from billing pages but still functional for existing users
  "RewardsPro Free": {
    name: "RewardsPro Free",
    displayName: "Rewards Free",
    price: 0,
    interval: "month",
    get ordersIncluded() { return getOrderLimit("RewardsPro Free"); },
    overageRate: 0,
    features: [
      "All features included",
      "50 orders/month",
      "500 customers",
      "50 emails/month",
      "2 membership tiers",
      "7 days analytics history",
      "Email support"
    ],
    isFree: true
  },
  "RewardsPro Pro": {
    name: "RewardsPro Pro",
    displayName: "Rewards Pro",
    price: 39,
    interval: "month",
    get ordersIncluded() { return getOrderLimit("RewardsPro Pro"); },
    overageRate: 0.10, // $10 per 100 orders = $0.10 per order
    features: [
      "All features included",
      "500 orders/month",
      "5,000 customers",
      "500 emails/month",
      "5 membership tiers",
      "30 days analytics history",
      "Priority support"
    ],
    isFree: false
  },
  "RewardsPro Pro Annual": {
    name: "RewardsPro Pro Annual",
    displayName: "Rewards Pro Annual",
    price: 336,
    interval: "year",
    get ordersIncluded() { return getOrderLimit("RewardsPro Pro Annual"); },
    overageRate: 0.10,
    features: [
      "All features included",
      "500 orders/month",
      "5,000 customers",
      "500 emails/month",
      "5 membership tiers",
      "30 days analytics history",
      "Priority support",
      "💰 Save $132/year (28% discount)"
    ],
    isFree: false
  },
  "RewardsPro Max": {
    name: "RewardsPro Max",
    displayName: "Rewards Max",
    price: 149,
    interval: "month",
    get ordersIncluded() { return getOrderLimit("RewardsPro Max"); },
    overageRate: 0.05, // $5 per 100 orders = $0.05 per order
    features: [
      "All features included",
      "2,000 orders/month",
      "25,000 customers",
      "2,000 emails/month",
      "10 membership tiers",
      "90 days analytics history",
      "Advanced support"
    ],
    isFree: false
  },
  "RewardsPro Max Annual": {
    name: "RewardsPro Max Annual",
    displayName: "Rewards Max Annual",
    price: 1296,
    interval: "year",
    get ordersIncluded() { return getOrderLimit("RewardsPro Max Annual"); },
    overageRate: 0.05,
    features: [
      "All features included",
      "2,000 orders/month",
      "25,000 customers",
      "2,000 emails/month",
      "10 membership tiers",
      "90 days analytics history",
      "Advanced support",
      "💰 Save $492/year (27% discount)"
    ],
    isFree: false
  },
  "RewardsPro Ultra": {
    name: "RewardsPro Ultra",
    displayName: "Rewards Ultra",
    price: 499,
    interval: "month",
    get ordersIncluded() { return getOrderLimit("RewardsPro Ultra"); },
    overageRate: 0,
    features: [
      "All features included",
      "Unlimited orders",
      "Unlimited customers",
      "Unlimited emails",
      "Unlimited tiers",
      "Unlimited analytics history",
      "Dedicated support"
    ],
    isFree: false
  },
  "RewardsPro Ultra Annual": {
    name: "RewardsPro Ultra Annual",
    displayName: "Rewards Ultra Annual",
    price: 4296,
    interval: "year",
    get ordersIncluded() { return getOrderLimit("RewardsPro Ultra Annual"); },
    overageRate: 0,
    features: [
      "All features included",
      "Unlimited orders",
      "Unlimited customers",
      "Unlimited emails",
      "Unlimited tiers",
      "Unlimited analytics history",
      "Dedicated support",
      "💰 Save $1,692/year (28% discount)"
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
  if (!planName) return 50; // Default to Free plan limit

  const plan = MANAGED_PLANS[planName];
  return plan?.ordersIncluded ?? 50; // Default to Free plan if not found
}

/**
 * Plan comparison table - RATE-BASED MODEL
 * All plans have access to all features - differentiation is through LIMITS
 * This drives upgrade value by showing capacity differences
 */
export const PLAN_COMPARISON = [
  {
    feature: "Orders/Month",
    free: "50",
    pro: "500",
    max: "2,000",
    ultra: "Unlimited",
  },
  {
    feature: "Customer Sync",
    free: "500",
    pro: "5,000",
    max: "25,000",
    ultra: "Unlimited",
  },
  {
    feature: "Membership Tiers",
    free: "2",
    pro: "5",
    max: "10",
    ultra: "Unlimited",
  },
  {
    feature: "Tier Products",
    free: "1",
    pro: "3",
    max: "10",
    ultra: "Unlimited",
  },
  {
    feature: "Emails/Month",
    free: "50",
    pro: "500",
    max: "2,000",
    ultra: "Unlimited",
  },
  {
    feature: "Active Raffles",
    free: "1",
    pro: "3",
    max: "10",
    ultra: "Unlimited",
  },
  {
    feature: "Active Challenges",
    free: "1",
    pro: "5",
    max: "15",
    ultra: "Unlimited",
  },
  {
    feature: "Campaigns",
    free: "1",
    pro: "5",
    max: "25",
    ultra: "Unlimited",
  },
  {
    feature: "Automations",
    free: "1",
    pro: "5",
    max: "20",
    ultra: "Unlimited",
  },
  {
    feature: "Analytics History",
    free: "7 days",
    pro: "30 days",
    max: "90 days",
    ultra: "Unlimited",
  },
  {
    feature: "All Features",
    free: "✓",
    pro: "✓",
    max: "✓",
    ultra: "✓",
  },
  {
    feature: "Support",
    free: "Email",
    pro: "Priority",
    max: "Advanced",
    ultra: "Dedicated",
  },
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
  const planLimit = monthlyOrderUsage?.planLimit || planDetails?.ordersIncluded || 50;
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