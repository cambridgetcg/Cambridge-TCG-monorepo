/**
 * Plan Limits - Single Source of Truth
 * All plan limit definitions MUST come from this file.
 *
 * Phase 1C: Data Integrity Fix
 * Date: 2025-01-07
 *
 * IMPORTANT: Do NOT define plan limits elsewhere in the codebase.
 * This file is the canonical source for:
 * - Order limits per plan
 * - Tier limits per plan
 * - Automation limits
 * - Customer sync limits
 * - Historical data retention
 */

// ============================================
// PLAN DEFINITIONS
// ============================================

export const PLAN_LIMITS = {
  'RewardsPro Free': {
    orders: 100,
    tiers: 2,
    automations: 1,
    customersSync: 1000,
    historicalDataDays: 30,
    tierProducts: 2,
    emailNotifications: false,
    advancedAnalytics: false,
    apiAccess: false,
  },
  'RewardsPro Pro': {
    orders: 500,
    tiers: 5,
    automations: 5,
    customersSync: 10000,
    historicalDataDays: 90,
    tierProducts: 5,
    emailNotifications: true,
    advancedAnalytics: false,
    apiAccess: false,
  },
  'RewardsPro Max': {
    orders: 2000,
    tiers: 10,
    automations: 20,
    customersSync: 50000,
    historicalDataDays: 365,
    tierProducts: 10,
    emailNotifications: true,
    advancedAnalytics: true,
    apiAccess: false,
  },
  'RewardsPro Ultra': {
    orders: Infinity,
    tiers: Infinity,
    automations: Infinity,
    customersSync: Infinity,
    historicalDataDays: Infinity,
    tierProducts: Infinity,
    emailNotifications: true,
    advancedAnalytics: true,
    apiAccess: true,
  },
} as const;

// ============================================
// TYPE DEFINITIONS
// ============================================

export type PlanName = keyof typeof PLAN_LIMITS;
export type PlanLimit = keyof typeof PLAN_LIMITS[PlanName];

// Numeric limits only (for threshold checking)
export type NumericPlanLimit = 'orders' | 'tiers' | 'automations' | 'customersSync' | 'historicalDataDays' | 'tierProducts';

// Boolean features
export type FeaturePlanLimit = 'emailNotifications' | 'advancedAnalytics' | 'apiAccess';

// ============================================
// PLAN NAME NORMALIZATION
// ============================================

/**
 * Normalizes various plan name formats to the canonical form.
 * Handles legacy names, lowercase, missing prefix, etc.
 */
export function normalizePlanName(planName: string | null | undefined): PlanName {
  if (!planName) {
    return 'RewardsPro Free';
  }

  const normalized = planName.trim();

  // Direct match
  if (normalized in PLAN_LIMITS) {
    return normalized as PlanName;
  }

  // Case-insensitive matching
  const lowerName = normalized.toLowerCase();

  // Map common variations
  const nameMap: Record<string, PlanName> = {
    'free': 'RewardsPro Free',
    'rewardspro free': 'RewardsPro Free',
    'rewards pro free': 'RewardsPro Free',

    'pro': 'RewardsPro Pro',
    'rewardspro pro': 'RewardsPro Pro',
    'rewards pro pro': 'RewardsPro Pro',
    'starter': 'RewardsPro Pro', // Legacy name

    'max': 'RewardsPro Max',
    'rewardspro max': 'RewardsPro Max',
    'rewards pro max': 'RewardsPro Max',
    'growth': 'RewardsPro Max', // Legacy name

    'ultra': 'RewardsPro Ultra',
    'rewardspro ultra': 'RewardsPro Ultra',
    'rewards pro ultra': 'RewardsPro Ultra',
    'enterprise': 'RewardsPro Ultra', // Legacy name
    'unlimited': 'RewardsPro Ultra', // Legacy name
  };

  if (lowerName in nameMap) {
    return nameMap[lowerName];
  }

  // Default to Free for unknown plans
  console.warn(`[PlanLimits] Unknown plan name: "${planName}", defaulting to Free`);
  return 'RewardsPro Free';
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
 * Checks if a plan has a specific feature enabled.
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

  // Handle unlimited plans
  if (limit === Infinity) {
    return {
      current,
      limit: Infinity,
      percentage: 0,
      isAtLimit: false,
      isOverLimit: false,
      remaining: Infinity,
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

  if (limit === Infinity) {
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

const PLAN_HIERARCHY: PlanName[] = [
  'RewardsPro Free',
  'RewardsPro Pro',
  'RewardsPro Max',
  'RewardsPro Ultra',
];

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
