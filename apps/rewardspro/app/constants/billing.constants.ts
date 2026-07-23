import {
  PRICING_PLANS,
  PUBLIC_PLAN_KEYS,
  UNLIMITED_PLAN_LIMIT,
  formatPlanLimit,
  getPlanFeatureSummary,
  getPlanKey,
  type PlanInterval,
  type PlanKey,
} from "./pricing-contract";

export interface ManagedPlan {
  name: string;
  displayName: string;
  price: number;
  interval: PlanInterval;
  ordersIncluded: number;
  /**
   * @deprecated New RewardsPro plans never create usage charges.
   * Retained as zero for older UI consumers during migration.
   */
  overageRate: 0;
  features: string[];
  isFree?: boolean;
}

function toManagedPlan(
  planKey: PlanKey,
  interval: PlanInterval,
): ManagedPlan | null {
  const plan = PRICING_PLANS[planKey];
  const isAnnual = interval === "year";

  if (isAnnual && (!plan.annualBillingName || plan.annualPrice === null)) {
    return null;
  }

  return {
    name: isAnnual ? plan.annualBillingName! : plan.billingName,
    displayName: `${plan.displayName}${isAnnual ? " Annual" : ""}`,
    price: isAnnual ? plan.annualPrice! : plan.monthlyPrice,
    interval,
    ordersIncluded: plan.limits.orders,
    overageRate: 0,
    features: getPlanFeatureSummary(planKey),
    isFree: planKey === "free",
  };
}

const managedPlans = [
  ...PUBLIC_PLAN_KEYS.flatMap((planKey) => {
    const monthly = toManagedPlan(planKey, "month");
    const annual = toManagedPlan(planKey, "year");
    return [monthly, annual].filter((plan): plan is ManagedPlan => plan !== null);
  }),
  toManagedPlan("enterprise", "month"),
].filter((plan): plan is ManagedPlan => plan !== null);

/**
 * Current plans keyed by stable Shopify billing names.
 *
 * `getPlanDetails` and `getPlanOrderLimit` normalize recognized legacy aliases
 * through pricing-contract.ts. There are no usage line items or overage rates
 * on new contracts.
 */
export const MANAGED_PLANS: Record<string, ManagedPlan> = Object.fromEntries(
  managedPlans.map((plan) => [plan.name, plan]),
);

export function getPlanOrderLimit(planName: string | null | undefined): number {
  return PRICING_PLANS[getPlanKey(planName)].limits.orders;
}

function comparisonValue(
  planKey: (typeof PUBLIC_PLAN_KEYS)[number],
  limit: keyof typeof PRICING_PLANS.free.limits,
): string {
  const value = PRICING_PLANS[planKey].limits[limit];
  return typeof value === "number" ? formatPlanLimit(value) : value ? "✓" : "—";
}

/**
 * Comparison data retained for existing UI consumers.
 * `pro`, `max`, and `ultra` are stable internal keys; their public labels are
 * Grow, Scale, and Corporate.
 */
export const PLAN_COMPARISON = [
  {
    feature: "Reward-eligible Orders/Month",
    free: comparisonValue("free", "orders"),
    pro: comparisonValue("pro", "orders"),
    max: comparisonValue("max", "orders"),
    ultra: comparisonValue("ultra", "orders"),
  },
  {
    feature: "Customer Sync",
    free: comparisonValue("free", "customersSync"),
    pro: comparisonValue("pro", "customersSync"),
    max: comparisonValue("max", "customersSync"),
    ultra: comparisonValue("ultra", "customersSync"),
  },
  {
    feature: "Membership Tiers",
    free: comparisonValue("free", "tiers"),
    pro: comparisonValue("pro", "tiers"),
    max: comparisonValue("max", "tiers"),
    ultra: comparisonValue("ultra", "tiers"),
  },
  {
    feature: "Tier Products",
    free: comparisonValue("free", "tierProducts"),
    pro: comparisonValue("pro", "tierProducts"),
    max: comparisonValue("max", "tierProducts"),
    ultra: comparisonValue("ultra", "tierProducts"),
  },
  {
    feature: "Reward Emails/Month",
    free: comparisonValue("free", "emails"),
    pro: comparisonValue("pro", "emails"),
    max: comparisonValue("max", "emails"),
    ultra: comparisonValue("ultra", "emails"),
  },
  {
    feature: "Active Raffles",
    free: comparisonValue("free", "activeRaffles"),
    pro: comparisonValue("pro", "activeRaffles"),
    max: comparisonValue("max", "activeRaffles"),
    ultra: comparisonValue("ultra", "activeRaffles"),
  },
  {
    feature: "Active Challenges",
    free: comparisonValue("free", "activeChallenges"),
    pro: comparisonValue("pro", "activeChallenges"),
    max: comparisonValue("max", "activeChallenges"),
    ultra: comparisonValue("ultra", "activeChallenges"),
  },
  {
    feature: "Campaigns",
    free: comparisonValue("free", "campaigns"),
    pro: comparisonValue("pro", "campaigns"),
    max: comparisonValue("max", "campaigns"),
    ultra: comparisonValue("ultra", "campaigns"),
  },
  {
    feature: "Automations",
    free: comparisonValue("free", "automations"),
    pro: comparisonValue("pro", "automations"),
    max: comparisonValue("max", "automations"),
    ultra: comparisonValue("ultra", "automations"),
  },
  {
    feature: "Analytics History",
    free: `${PRICING_PLANS.free.limits.historicalDataDays} days`,
    pro: "Full",
    max: "Full",
    ultra: "Full",
  },
  {
    feature: "All Core Features",
    free: "✓",
    pro: "✓",
    max: "✓",
    ultra: "✓",
  },
  {
    feature: "Support",
    free: "Standard",
    pro: "Standard",
    max: "Standard",
    ultra: "Corporate",
  },
];

export function getPlanDetails(
  activeSubscription?: { name: string; status: string } | null,
  currentPlan?: { planName: string; status: string } | null,
): ManagedPlan {
  const activePlanName =
    activeSubscription?.name ||
    currentPlan?.planName ||
    PRICING_PLANS.free.billingName;
  const directMatch = MANAGED_PLANS[activePlanName];

  if (directMatch) return directMatch;

  const canonical = PRICING_PLANS[getPlanKey(activePlanName)];
  return MANAGED_PLANS[canonical.billingName];
}

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
  planDetails?: ManagedPlan,
): UsageMetrics {
  const currentUsage = monthlyOrderUsage?.orderCount || 0;
  const planLimit =
    monthlyOrderUsage?.planLimit ||
    planDetails?.ordersIncluded ||
    PRICING_PLANS.free.limits.orders;
  const projectedUsage = monthlyOrderUsage?.projectedOrders || 0;
  const unlimited = planLimit >= UNLIMITED_PLAN_LIMIT;

  const usagePercentage = unlimited
    ? 0
    : Math.min(Math.round((currentUsage / planLimit) * 100), 100);
  const projectedPercentage = unlimited
    ? 0
    : Math.min(Math.round((projectedUsage / planLimit) * 100), 100);
  const isOverLimit = !unlimited && currentUsage >= planLimit;
  const ordersNotCounted = isOverLimit ? Math.max(0, currentUsage - planLimit) : 0;

  let progressTone: UsageMetrics["progressTone"] = "success";
  if (usagePercentage >= 100) progressTone = "critical";
  else if (usagePercentage >= 80) progressTone = "warning";

  return {
    currentUsage,
    planLimit,
    projectedUsage,
    usagePercentage,
    projectedPercentage,
    isOverLimit,
    ordersNotCounted,
    progressTone,
  };
}
