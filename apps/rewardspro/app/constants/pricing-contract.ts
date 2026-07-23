/**
 * RewardsPro pricing contract.
 *
 * This is the only mutable source for public plan prices, capacity limits,
 * display names, and Shopify billing names. Existing Shopify subscription
 * names intentionally remain stable so legacy subscriptions can be recognised
 * while merchants move to the free-first catalogue voluntarily.
 */

export const UNLIMITED_PLAN_LIMIT = 999_999;

export type PlanKey = "free" | "pro" | "max" | "ultra" | "enterprise";
export type PublicPlanKey = Exclude<PlanKey, "enterprise">;
export type PlanInterval = "month" | "year";

export interface PlanLimitsContract {
  orders: number;
  tiers: number;
  automations: number;
  customersSync: number;
  historicalDataDays: number;
  tierProducts: number;
  emails: number;
  memberExportRows: number;
  activeRaffles: number;
  activeMysteryBoxes: number;
  activeChallenges: number;
  campaigns: number;
  automationFlows: number;
  emailNotifications: true;
  advancedAnalytics: true;
  apiAccess: true;
}

export interface PricingPlanContract {
  key: PlanKey;
  billingName: string;
  annualBillingName: string | null;
  displayName: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number | null;
  trialDays: 0;
  isPublic: boolean;
  support: "standard" | "corporate" | "private";
  whiteLabel: boolean;
  limits: PlanLimitsContract;
}

const unlimitedLimits: PlanLimitsContract = {
  orders: UNLIMITED_PLAN_LIMIT,
  tiers: UNLIMITED_PLAN_LIMIT,
  automations: UNLIMITED_PLAN_LIMIT,
  customersSync: UNLIMITED_PLAN_LIMIT,
  historicalDataDays: UNLIMITED_PLAN_LIMIT,
  tierProducts: UNLIMITED_PLAN_LIMIT,
  emails: UNLIMITED_PLAN_LIMIT,
  memberExportRows: UNLIMITED_PLAN_LIMIT,
  activeRaffles: UNLIMITED_PLAN_LIMIT,
  activeMysteryBoxes: UNLIMITED_PLAN_LIMIT,
  activeChallenges: UNLIMITED_PLAN_LIMIT,
  campaigns: UNLIMITED_PLAN_LIMIT,
  automationFlows: UNLIMITED_PLAN_LIMIT,
  emailNotifications: true,
  advancedAnalytics: true,
  apiAccess: true,
};

export const PRICING_PLANS = {
  free: {
    key: "free",
    billingName: "RewardsPro Free",
    annualBillingName: null,
    displayName: "Free Forever",
    description: "A complete loyalty programme for small businesses",
    monthlyPrice: 0,
    annualPrice: null,
    trialDays: 0,
    isPublic: true,
    support: "standard",
    whiteLabel: false,
    limits: {
      orders: 1_000,
      tiers: 5,
      automations: 5,
      customersSync: 10_000,
      historicalDataDays: 365,
      tierProducts: 5,
      emails: 1_000,
      memberExportRows: 10_000,
      activeRaffles: 3,
      activeMysteryBoxes: 3,
      activeChallenges: 5,
      campaigns: 5,
      automationFlows: 3,
      emailNotifications: true,
      advancedAnalytics: true,
      apiAccess: true,
    },
  },
  pro: {
    key: "pro",
    billingName: "RewardsPro Pro",
    annualBillingName: "RewardsPro Pro Annual",
    displayName: "Grow",
    description: "More capacity for established shops",
    monthlyPrice: 29,
    annualPrice: 290,
    trialDays: 0,
    isPublic: true,
    support: "standard",
    whiteLabel: false,
    limits: {
      orders: 10_000,
      tiers: 20,
      automations: 25,
      customersSync: 100_000,
      historicalDataDays: UNLIMITED_PLAN_LIMIT,
      tierProducts: 20,
      emails: 10_000,
      memberExportRows: 100_000,
      activeRaffles: 10,
      activeMysteryBoxes: 10,
      activeChallenges: 25,
      campaigns: 25,
      automationFlows: 15,
      emailNotifications: true,
      advancedAnalytics: true,
      apiAccess: true,
    },
  },
  max: {
    key: "max",
    billingName: "RewardsPro Max",
    annualBillingName: "RewardsPro Max Annual",
    displayName: "Scale",
    description: "Higher throughput for busy stores",
    monthlyPrice: 79,
    annualPrice: 790,
    trialDays: 0,
    isPublic: true,
    support: "standard",
    whiteLabel: false,
    limits: {
      orders: 25_000,
      tiers: 50,
      automations: 100,
      customersSync: 500_000,
      historicalDataDays: UNLIMITED_PLAN_LIMIT,
      tierProducts: 50,
      emails: 25_000,
      memberExportRows: 500_000,
      activeRaffles: 25,
      activeMysteryBoxes: 25,
      activeChallenges: 100,
      campaigns: 100,
      automationFlows: 50,
      emailNotifications: true,
      advancedAnalytics: true,
      apiAccess: true,
    },
  },
  ultra: {
    key: "ultra",
    billingName: "RewardsPro Ultra",
    annualBillingName: "RewardsPro Ultra Annual",
    displayName: "Corporate",
    description: "High-volume capacity and corporate support",
    monthlyPrice: 499,
    annualPrice: 4_990,
    trialDays: 0,
    isPublic: true,
    support: "corporate",
    whiteLabel: true,
    limits: {
      ...unlimitedLimits,
      orders: 100_000,
      emails: 100_000,
    },
  },
  enterprise: {
    key: "enterprise",
    billingName: "RewardsPro Enterprise",
    annualBillingName: null,
    displayName: "Enterprise",
    description: "Private capacity and support terms for complex organisations",
    monthlyPrice: 999,
    annualPrice: null,
    trialDays: 0,
    isPublic: false,
    support: "private",
    whiteLabel: true,
    limits: unlimitedLimits,
  },
} as const satisfies Record<PlanKey, PricingPlanContract>;

export const PUBLIC_PLAN_KEYS: readonly PublicPlanKey[] = [
  "free",
  "pro",
  "max",
  "ultra",
];

export const PLAN_HIERARCHY: readonly PlanKey[] = [
  "free",
  "pro",
  "max",
  "ultra",
  "enterprise",
];

const PLAN_ALIASES: Record<string, PlanKey> = {
  free: "free",
  "free forever": "free",
  "rewards free": "free",
  "rewardspro free": "free",
  "rewards pro free": "free",

  pro: "pro",
  grow: "pro",
  starter: "pro",
  "starter plan": "pro",
  "rewardspro grow": "pro",
  "rewardspro pro": "pro",
  "rewards pro pro": "pro",
  "rewardspro starter": "pro",
  "rewardspro pro annual": "pro",
  "rewards pro pro annual": "pro",
  "rewardspro monthly": "pro",
  "rewardspro annual": "pro",
  "rewardspro usage": "pro",
  "pro annual": "pro",
  "pro-annual": "pro",
  proannual: "pro",
  pro_annual: "pro",

  max: "max",
  scale: "max",
  growth: "max",
  "growth plan": "max",
  "rewardspro scale": "max",
  "rewardspro max": "max",
  "rewards pro max": "max",
  "rewardspro growth": "max",
  "rewardspro max annual": "max",
  "rewards pro max annual": "max",
  "max annual": "max",
  "max-annual": "max",
  maxannual: "max",
  max_annual: "max",

  ultra: "ultra",
  corporate: "ultra",
  unlimited: "ultra",
  "rewardspro corporate": "ultra",
  "rewardspro ultra": "ultra",
  "rewards pro ultra": "ultra",
  "rewardspro ultra annual": "ultra",
  "rewards pro ultra annual": "ultra",
  "ultra annual": "ultra",
  "ultra-annual": "ultra",
  ultraannual: "ultra",
  ultra_annual: "ultra",

  enterprise: "enterprise",
  "rewardspro enterprise": "enterprise",
};

export function tryGetPlanKey(
  planName: string | null | undefined,
): PlanKey | undefined {
  if (!planName) return undefined;
  return PLAN_ALIASES[planName.trim().toLowerCase()];
}

export function getPlanKey(planName: string | null | undefined): PlanKey {
  return tryGetPlanKey(planName) ?? "free";
}

export function requireKnownPlanKey(planName: string): PlanKey {
  const planKey = tryGetPlanKey(planName);
  if (!planKey) {
    throw new Error(`Unknown RewardsPro plan: ${planName}`);
  }
  return planKey;
}

export function getPricingPlan(
  planNameOrKey: string | null | undefined,
): PricingPlanContract {
  return PRICING_PLANS[getPlanKey(planNameOrKey)];
}

export function getBillingName(
  planKey: PlanKey,
  interval: PlanInterval = "month",
): string {
  const plan = PRICING_PLANS[planKey];
  if (interval === "year" && plan.annualBillingName) {
    return plan.annualBillingName;
  }
  return plan.billingName;
}

export function getPlanPrice(
  planKey: PlanKey,
  interval: PlanInterval = "month",
): number {
  const plan = PRICING_PLANS[planKey];
  if (interval === "year" && plan.annualPrice !== null) {
    return plan.annualPrice;
  }
  return plan.monthlyPrice;
}

export function formatPlanLimit(value: number): string {
  return value >= UNLIMITED_PLAN_LIMIT ? "Unlimited" : value.toLocaleString("en-US");
}

export function getPlanFeatureSummary(planKey: PlanKey): string[] {
  const plan = PRICING_PLANS[planKey];
  const { limits } = plan;
  const history = limits.historicalDataDays >= UNLIMITED_PLAN_LIMIT
    ? "Full analytics history"
    : `${limits.historicalDataDays} days analytics history`;

  const features = [
    "All core loyalty features",
    `${formatPlanLimit(limits.orders)} reward-eligible orders/month`,
    `${formatPlanLimit(limits.customersSync)} customer sync capacity`,
    `${formatPlanLimit(limits.emails)} reward emails/month`,
    `${formatPlanLimit(limits.tiers)} membership tiers`,
    history,
  ];

  if (plan.whiteLabel) features.push("White-label controls");
  if (plan.support === "corporate") features.push("Corporate support");
  if (plan.support === "private") features.push("Private support terms");

  return features;
}

export function getAnnualSavings(planKey: PlanKey): number {
  const plan = PRICING_PLANS[planKey];
  if (plan.annualPrice === null) return 0;
  return (plan.monthlyPrice * 12) - plan.annualPrice;
}
