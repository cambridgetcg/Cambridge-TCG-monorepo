/**
 * Backwards-compatible plan-limit helpers.
 *
 * The mutable values live in pricing-contract.ts. Keep this module as the
 * stable API used by entitlement and quota consumers.
 */

import {
  PLAN_HIERARCHY as CONTRACT_PLAN_HIERARCHY,
  PRICING_PLANS,
  getPlanKey,
} from "./pricing-contract";

// ============================================
// PLAN DEFINITIONS
// ============================================

/**
 * RATE-BASED GATING MODEL
 * All plans have access to all features - differentiation is through LIMITS only.
 * This drives upgrade value: users experience the product, then need more capacity.
 *
 * Key principle: Free is complete for ordinary small businesses. Paid plans
 * provide more operational capacity; they do not unlock ordinary core loyalty.
 */
export const PLAN_LIMITS = {
  [PRICING_PLANS.free.billingName]: PRICING_PLANS.free.limits,
  [PRICING_PLANS.pro.billingName]: PRICING_PLANS.pro.limits,
  [PRICING_PLANS.max.billingName]: PRICING_PLANS.max.limits,
  [PRICING_PLANS.ultra.billingName]: PRICING_PLANS.ultra.limits,
  [PRICING_PLANS.enterprise.billingName]: PRICING_PLANS.enterprise.limits,
} as const;

// ============================================
// TYPE DEFINITIONS
// ============================================

export type PlanName = keyof typeof PLAN_LIMITS;
export type PlanLimit = keyof typeof PLAN_LIMITS[PlanName];

// Numeric limits only (for threshold checking)
// Rate-based model: these are the key differentiators between plans
export type NumericPlanLimit =
  | 'orders'
  | 'tiers'
  | 'automations'
  | 'customersSync'
  | 'historicalDataDays'
  | 'tierProducts'
  | 'emails'
  | 'memberExportRows'
  | 'activeRaffles'
  | 'activeMysteryBoxes'
  | 'activeChallenges'
  | 'campaigns'
  | 'automationFlows';

// Boolean features - all enabled for all plans in rate-based model
export type FeaturePlanLimit = 'emailNotifications' | 'advancedAnalytics' | 'apiAccess';

// ============================================
// PLAN NAME NORMALIZATION
// ============================================

/**
 * Normalizes various plan name formats to the canonical form.
 * Handles legacy names, lowercase, missing prefix, etc.
 */
export function normalizePlanName(planName: string | null | undefined): PlanName {
  const key = getPlanKey(planName);
  return PRICING_PLANS[key].billingName as PlanName;
}

// ============================================
// LIMIT GETTERS
// ============================================

/**
 * Gets a specific limit for a plan.
 */
export function getPlanLimit<T extends PlanLimit>(
  planName: string | null | undefined,
  limit: T
): typeof PLAN_LIMITS[PlanName][T] {
  const normalized = normalizePlanName(planName);
  return PLAN_LIMITS[normalized][limit];
}

/**
 * Gets the order limit for a plan.
 */
export function getOrderLimit(planName: string | null | undefined): number {
  return getPlanLimit(planName, 'orders');
}

/**
 * Gets the tier limit for a plan.
 */
export function getTierLimit(planName: string | null | undefined): number {
  return getPlanLimit(planName, 'tiers');
}

/**
 * Gets the tier product limit for a plan.
 */
export function getTierProductLimit(planName: string | null | undefined): number {
  return getPlanLimit(planName, 'tierProducts');
}

/**
 * Gets the customer sync limit for a plan.
 */
export function getCustomerSyncLimit(planName: string | null | undefined): number {
  return getPlanLimit(planName, 'customersSync');
}

/**
 * Gets the historical data retention limit (in days) for a plan.
 */
export function getHistoricalDataLimit(planName: string | null | undefined): number {
  return getPlanLimit(planName, 'historicalDataDays');
}

/**
 * Gets the email limit for a plan.
 */
export function getEmailLimit(planName: string | null | undefined): number {
  return getPlanLimit(planName, 'emails');
}

/**
 * Gets the member export rows limit for a plan.
 */
export function getMemberExportRowsLimit(planName: string | null | undefined): number {
  return getPlanLimit(planName, 'memberExportRows');
}

/**
 * Gets the active raffles limit for a plan.
 */
export function getActiveRafflesLimit(planName: string | null | undefined): number {
  return getPlanLimit(planName, 'activeRaffles');
}

/**
 * Gets the active mystery boxes limit for a plan.
 */
export function getActiveMysteryBoxesLimit(planName: string | null | undefined): number {
  return getPlanLimit(planName, 'activeMysteryBoxes');
}

/**
 * Gets the active challenges limit for a plan.
 */
export function getActiveChallengesLimit(planName: string | null | undefined): number {
  return getPlanLimit(planName, 'activeChallenges');
}

/**
 * Gets the campaigns limit for a plan.
 */
export function getCampaignsLimit(planName: string | null | undefined): number {
  return getPlanLimit(planName, 'campaigns');
}

/**
 * Gets the automation flows limit for a plan.
 */
export function getAutomationFlowsLimit(planName: string | null | undefined): number {
  return getPlanLimit(planName, 'automationFlows');
}

/**
 * Checks if a plan has a specific feature enabled.
 * In the rate-based model, all features return true for all plans.
 */
export function hasPlanFeature(
  planName: string | null | undefined,
  feature: FeaturePlanLimit
): boolean {
  return getPlanLimit(planName, feature) as boolean;
}

// ============================================
// USAGE CHECKING
// ============================================

export interface UsageStatus {
  current: number;
  limit: number;
  percentage: number;
  isAtLimit: boolean;
  isOverLimit: boolean;
  remaining: number;
}

/**
 * Calculates usage status for a limit.
 */
export function calculateUsageStatus(
  current: number,
  planName: string | null | undefined,
  limitType: NumericPlanLimit
): UsageStatus {
  const limit = getPlanLimit(planName, limitType);

  // The contract uses a database-safe sentinel for unlimited plans.
  if (limit >= 999_999) {
    return {
      current,
      limit,
      percentage: 0,
      isAtLimit: false,
      isOverLimit: false,
      remaining: limit,
    };
  }

  const percentage = Math.min(100, (current / limit) * 100);
  const remaining = Math.max(0, limit - current);

  return {
    current,
    limit,
    percentage,
    isAtLimit: current >= limit,
    isOverLimit: current > limit,
    remaining,
  };
}

/**
 * Checks if adding count items would exceed the limit.
 */
export function wouldExceedLimit(
  current: number,
  countToAdd: number,
  planName: string | null | undefined,
  limitType: NumericPlanLimit
): boolean {
  const limit = getPlanLimit(planName, limitType);

  if (limit >= 999_999) {
    return false;
  }

  return (current + countToAdd) > limit;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validates plan configuration at startup.
 * Should be called during server initialization.
 */
export function validatePlanConfiguration(): void {
  const planNames = Object.keys(PLAN_LIMITS) as PlanName[];

  for (const name of planNames) {
    const limits = PLAN_LIMITS[name];

    // Validate order limit
    if (typeof limits.orders !== 'number' || (limits.orders <= 0 && limits.orders !== Infinity)) {
      throw new Error(`Invalid order limit for plan ${name}: ${limits.orders}`);
    }

    // Validate tier limit
    if (typeof limits.tiers !== 'number' || (limits.tiers <= 0 && limits.tiers !== Infinity)) {
      throw new Error(`Invalid tier limit for plan ${name}: ${limits.tiers}`);
    }

    // Validate automations limit
    if (typeof limits.automations !== 'number' || (limits.automations < 0 && limits.automations !== Infinity)) {
      throw new Error(`Invalid automations limit for plan ${name}: ${limits.automations}`);
    }
  }

  console.log(`[PlanLimits] Validated ${planNames.length} plans successfully`);
}

// ============================================
// PLAN COMPARISON
// ============================================

const PLAN_HIERARCHY: PlanName[] = CONTRACT_PLAN_HIERARCHY.map(
  (key) => PRICING_PLANS[key].billingName as PlanName,
);

/**
 * Gets the tier level (0-3) for a plan.
 */
export function getPlanTier(planName: string | null | undefined): number {
  const normalized = normalizePlanName(planName);
  return PLAN_HIERARCHY.indexOf(normalized);
}

/**
 * Checks if plan A is higher than plan B.
 */
export function isPlanHigher(planA: string | null | undefined, planB: string | null | undefined): boolean {
  return getPlanTier(planA) > getPlanTier(planB);
}

/**
 * Checks if upgrading from current plan to target plan.
 */
export function isUpgrade(currentPlan: string | null | undefined, targetPlan: string | null | undefined): boolean {
  return isPlanHigher(targetPlan, currentPlan);
}

/**
 * Checks if downgrading from current plan to target plan.
 */
export function isDowngrade(currentPlan: string | null | undefined, targetPlan: string | null | undefined): boolean {
  return isPlanHigher(currentPlan, targetPlan);
}

/**
 * Gets all plans that have a higher limit than the current plan for a specific limit type.
 */
export function getUpgradePlansFor(
  currentPlan: string | null | undefined,
  limitType: NumericPlanLimit,
  currentUsage: number
): PlanName[] {
  const currentLimit = getPlanLimit(currentPlan, limitType);

  return PLAN_HIERARCHY.filter(plan => {
    const planLimit = getPlanLimit(plan, limitType);
    return planLimit > currentLimit && planLimit > currentUsage;
  });
}
