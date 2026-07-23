/**
 * Legacy feature-limit adapter.
 *
 * Persisted entitlements are authoritative at runtime. This module remains for
 * older callers and derives every value from the free-first pricing contract so
 * it cannot quietly reintroduce paid feature gates or obsolete prices.
 */

import {
  ENTERPRISE_PLAN,
  FREE_PLAN,
  GROWTH_PLAN,
  MAX_PLAN,
  PRO_PLAN,
  STARTER_PLAN,
  ULTRA_PLAN,
} from "../constants/plans";
import {
  PRICING_PLANS,
  tryGetPlanKey,
  type PlanKey,
} from "../constants/pricing-contract";

export type PlanName =
  | typeof FREE_PLAN
  | typeof STARTER_PLAN
  | typeof PRO_PLAN
  | typeof GROWTH_PLAN
  | typeof MAX_PLAN
  | typeof ULTRA_PLAN
  | typeof ENTERPRISE_PLAN;

interface LegacyPlanLimits {
  maxTiers: number;
  maxCustomers: number;
  maxOrders: number;
  customEmail: boolean;
  apiAccess: boolean;
  advancedReporting: boolean;
  exportData: boolean;
  customBranding: boolean;
  prioritySupport: boolean;
  dedicatedManager: boolean;
  subscriptionTiers: boolean;
  purchasableTiers: boolean;
  lifetimeTiers: boolean;
  annualEvaluationPeriod: boolean;
  emailNotifications: boolean;
  customEmailTemplates: boolean;
  whiteLabel: boolean;
  webhookIntegrations: boolean;
  customRewards: boolean;
  bulkOperations: boolean;
}

export type FeatureName = keyof LegacyPlanLimits;

function limitsFor(planKey: PlanKey): LegacyPlanLimits {
  const plan = PRICING_PLANS[planKey];

  return {
    maxTiers: plan.limits.tiers,
    maxCustomers: plan.limits.customersSync,
    maxOrders: plan.limits.orders,
    customEmail: true,
    apiAccess: true,
    advancedReporting: true,
    exportData: true,
    customBranding: true,
    prioritySupport: plan.support !== "standard",
    dedicatedManager: plan.support === "private",
    subscriptionTiers: true,
    purchasableTiers: true,
    lifetimeTiers: true,
    annualEvaluationPeriod: true,
    emailNotifications: true,
    customEmailTemplates: true,
    whiteLabel: plan.whiteLabel,
    webhookIntegrations: true,
    customRewards: true,
    bulkOperations: true,
  };
}

// Legacy names project onto their current public equivalents.
export const PLAN_LIMITS: Record<PlanName, LegacyPlanLimits> = {
  [FREE_PLAN]: limitsFor("free"),
  [STARTER_PLAN]: limitsFor("pro"),
  [PRO_PLAN]: limitsFor("pro"),
  [GROWTH_PLAN]: limitsFor("max"),
  [MAX_PLAN]: limitsFor("max"),
  [ULTRA_PLAN]: limitsFor("ultra"),
  [ENTERPRISE_PLAN]: limitsFor("enterprise"),
};

export const PLAN_HIERARCHY: Record<PlanName, number> = {
  [FREE_PLAN]: 0,
  [STARTER_PLAN]: 1,
  [PRO_PLAN]: 1,
  [GROWTH_PLAN]: 2,
  [MAX_PLAN]: 2,
  [ULTRA_PLAN]: 3,
  [ENTERPRISE_PLAN]: 4,
};

const CURRENT_PLAN_NAMES: Record<PlanKey, PlanName> = {
  free: FREE_PLAN,
  pro: PRO_PLAN,
  max: MAX_PLAN,
  ultra: ULTRA_PLAN,
  enterprise: ENTERPRISE_PLAN,
};

/**
 * Resolve the current plan from either billing projection.
 *
 * Unknown values retain the historical Free fallback in this display-only
 * adapter. Active billing and entitlement mutation boundaries use strict
 * resolution instead.
 */
export function getCurrentPlan(
  billingPlan?: { planName: string } | null,
  billingSubscription?: { planType: string } | null,
): PlanName {
  const planKey = tryGetPlanKey(
    billingSubscription?.planType ?? billingPlan?.planName,
  );
  return planKey ? CURRENT_PLAN_NAMES[planKey] : FREE_PLAN;
}

export function hasFeature(
  planName: PlanName,
  feature: FeatureName,
): boolean {
  return PLAN_LIMITS[planName][feature] === true;
}

export function getLimit(
  planName: PlanName,
  limit: FeatureName,
): number | boolean {
  return PLAN_LIMITS[planName][limit];
}

export function isWithinLimit(
  planName: PlanName,
  limit: "maxTiers" | "maxCustomers" | "maxOrders",
  currentCount: number,
): boolean {
  return currentCount < PLAN_LIMITS[planName][limit];
}

export function getRequiredPlan(feature: FeatureName): PlanName {
  if (
    feature === "maxTiers" ||
    feature === "maxCustomers" ||
    feature === "maxOrders"
  ) {
    return PRO_PLAN;
  }

  const plans: PlanName[] = [
    FREE_PLAN,
    PRO_PLAN,
    MAX_PLAN,
    ULTRA_PLAN,
    ENTERPRISE_PLAN,
  ];
  return plans.find((plan) => hasFeature(plan, feature)) ?? ENTERPRISE_PLAN;
}

export function isPlanAtLeast(plan1: PlanName, plan2: PlanName): boolean {
  return PLAN_HIERARCHY[plan1] >= PLAN_HIERARCHY[plan2];
}

export function getUpgradeMessage(feature: FeatureName): string {
  const requiredPlan = getRequiredPlan(feature);
  const displayName =
    PRICING_PLANS[tryGetPlanKey(requiredPlan) ?? "enterprise"].displayName;
  return `Choose ${displayName} when you need more ${feature.replace(/^max/, "").toLowerCase()} capacity.`;
}

export function getPlanInfo(planName: PlanName) {
  const planKey = tryGetPlanKey(planName) ?? "free";
  const plan = PRICING_PLANS[planKey];

  return {
    name: plan.displayName,
    description: plan.description,
    price: plan.monthlyPrice === 0
      ? "Free"
      : plan.isPublic
        ? `$${plan.monthlyPrice}/month`
        : `From $${plan.monthlyPrice}/month`,
  };
}
