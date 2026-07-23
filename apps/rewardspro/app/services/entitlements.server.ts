/**
 * Entitlements Service
 * Single source of truth for feature access and plan limits
 *
 * This service consolidates all entitlement checks through the ShopEntitlements table,
 * providing caching and consistent access patterns across the application.
 */

import prisma from "~/db.server";
import type { ShopEntitlements, EntitlementSource } from "@prisma/client";
import {
  FREE_PLAN,
  PRO_PLAN,
  MAX_PLAN,
  ULTRA_PLAN,
  ENTERPRISE_PLAN,
  STARTER_PLAN,
  GROWTH_PLAN,
} from "~/constants/plans";
import {
  getOrderLimit,
  getTierLimit,
} from '~/constants/plan-limits';
import {
  entitlementValuesForKnownPlan,
  entitlementValuesForPlan,
} from "~/constants/entitlement-contract";
import {
  PRICING_PLANS,
  tryGetPlanKey,
} from "~/constants/pricing-contract";
import {
  getCachedEntitlements,
  setCachedEntitlements,
  invalidateEntitlementsCache,
  clearEntitlementsCache,
  getEntitlementsCacheStats,
  getEntitlementsCacheBackend,
} from "./entitlements-cache-redis.server";
import { invalidateShopEntitlements } from "./shop-data-provider.server";

// Feature keys that map to ShopEntitlements columns
export type FeatureKey =
  // Core features
  | 'apiAccess'
  | 'webhooks'
  | 'whiteLabel'
  | 'advancedReport'
  | 'customEmail'
  | 'annualEval'
  | 'bulkOps'
  | 'customBranding'
  | 'prioritySupport'
  | 'subscriptionTiers'
  | 'purchasableTiers'
  | 'exportData'
  | 'customRewards'
  // Integration features (P1)
  | 'integrationKlaviyo'
  | 'integrationSendgrid'
  | 'integrationJudgeme'
  | 'integrationSlack'
  | 'integrationRecharge'
  | 'integrationGorgias'
  | 'integrationZapier'
  // Gamification features (P2)
  | 'raffles'
  | 'mysteryBoxes'
  | 'challenges'
  // Marketing features (P3)
  | 'marketingCampaigns'
  | 'marketingAutomation'
  | 'aiRecommendations'
  // Analytics features (P4)
  | 'rfmSegmentation'
  | 'programImpact'
  | 'realtimeAnalytics'
  | 'cohortAnalysis';

// Limit keys that map to ShopEntitlements columns
export type LimitKey =
  // Core limits
  | 'maxTiers'
  | 'maxOrders'
  | 'maxEmails'
  // Synced limits from plan-limits.ts (P0)
  | 'maxAutomations'
  | 'maxCustomersSync'
  | 'maxTierProducts'
  | 'maxHistoricalDays'
  // Gamification limits (P2)
  | 'maxActiveRaffles'
  | 'maxActiveMysteryBoxes'
  | 'maxActiveChallenges'
  // Marketing limits (P3)
  | 'maxCampaigns'
  | 'maxAutomationFlows';

// DEPRECATED: Use getOrderLimit() from plan-limits.ts directly.
// Kept for backward compatibility — will be removed in future cleanup.
export const PLAN_ORDER_LIMITS: Record<string, number> = {
  get [FREE_PLAN]() { return getOrderLimit(FREE_PLAN); },
  get [STARTER_PLAN]() { return getOrderLimit(STARTER_PLAN); },
  get [PRO_PLAN]() { return getOrderLimit(PRO_PLAN); },
  get [GROWTH_PLAN]() { return getOrderLimit(GROWTH_PLAN); },
  get [MAX_PLAN]() { return getOrderLimit(MAX_PLAN); },
  get [ULTRA_PLAN]() { return getOrderLimit(ULTRA_PLAN); },
  get [ENTERPRISE_PLAN]() { return getOrderLimit(ENTERPRISE_PLAN); },
};

// DEPRECATED: Use getTierLimit() from plan-limits.ts directly.
export const PLAN_TIER_LIMITS: Record<string, number> = {
  get [FREE_PLAN]() { return getTierLimit(FREE_PLAN); },
  get [STARTER_PLAN]() { return getTierLimit(STARTER_PLAN); },
  get [PRO_PLAN]() { return getTierLimit(PRO_PLAN); },
  get [GROWTH_PLAN]() { return getTierLimit(GROWTH_PLAN); },
  get [MAX_PLAN]() { return getTierLimit(MAX_PLAN); },
  get [ULTRA_PLAN]() { return getTierLimit(ULTRA_PLAN); },
  get [ENTERPRISE_PLAN]() { return getTierLimit(ENTERPRISE_PLAN); },
};

// Default entitlements for new shops are a direct projection of Free Forever.
const DEFAULT_ENTITLEMENTS: Omit<ShopEntitlements, 'id' | 'shop' | 'createdAt' | 'updatedAt'> = {
  effectivePlan: FREE_PLAN as string,
  planSource: 'DEFAULT' as EntitlementSource,
  ...entitlementValuesForPlan(FREE_PLAN),

  // Override fields
  hasOverride: false,
  overrideExpiry: null,
  overrideNote: null,
  overrideBy: null,

  // Resolution tracking
  lastResolvedAt: new Date(),
  resolvedFrom: null,
};

// Compatibility lookup for callers that still use stable legacy billing names.
const PLAN_FEATURES: Record<string, Partial<ShopEntitlements>> = {
  [FREE_PLAN]: entitlementValuesForPlan(FREE_PLAN),
  [PRO_PLAN]: entitlementValuesForPlan(PRO_PLAN),
  [MAX_PLAN]: entitlementValuesForPlan(MAX_PLAN),
  [ULTRA_PLAN]: entitlementValuesForPlan(ULTRA_PLAN),
  [ENTERPRISE_PLAN]: entitlementValuesForPlan(ENTERPRISE_PLAN),
  [STARTER_PLAN]: entitlementValuesForPlan(STARTER_PLAN),
  [GROWTH_PLAN]: entitlementValuesForPlan(GROWTH_PLAN),
};

/**
 * Get entitlements for a shop
 * Uses Redis cache if available, falls back to memory cache in local dev
 */
export async function getEntitlements(shop: string): Promise<ShopEntitlements> {
  const LOG_PREFIX = "[Entitlements.get]";

  // Check cache first (now Redis-backed for cross-instance consistency)
  const cached = await getCachedEntitlements(shop);
  if (cached) {
    console.log(`${LOG_PREFIX} Cache HIT for ${shop}: plan=${cached.effectivePlan}, mysteryBoxLimit=${cached.limitMaxActiveMysteryBoxes}, raffleLimit=${cached.limitMaxActiveRaffles}`);
    return cached;
  }

  console.log(`${LOG_PREFIX} Cache MISS for ${shop}, querying database...`);

  // Query database
  let entitlements = await prisma.shopEntitlements.findUnique({
    where: { shop },
  });

  // Create default entitlements if not found
  if (!entitlements) {
    console.log(`${LOG_PREFIX} No entitlements found, creating defaults for ${shop}`);
    // Filter out unmigrated columns to prevent "column does not exist" errors
    const safeDefaults = filterUnmigratedColumns(DEFAULT_ENTITLEMENTS);
    entitlements = await prisma.shopEntitlements.create({
      data: {
        shop,
        ...safeDefaults,
        lastResolvedAt: new Date(),
      },
    });
  } else {
    console.log(`${LOG_PREFIX} Database returned: plan=${entitlements.effectivePlan}, mysteryBoxLimit=${entitlements.limitMaxActiveMysteryBoxes}, raffleLimit=${entitlements.limitMaxActiveRaffles}, planSource=${entitlements.planSource}`);
  }

  // Update cache (now Redis-backed)
  await setCachedEntitlements(shop, entitlements);

  return entitlements;
}

/**
 * Check if a shop has a specific feature
 */
export async function hasFeature(shop: string, feature: FeatureKey): Promise<boolean> {
  const entitlements = await getEntitlements(shop);
  const columnName = `feature${capitalize(feature)}` as keyof ShopEntitlements;
  return entitlements[columnName] === true;
}

/**
 * Get a numeric limit for a shop
 */
export async function getLimit(shop: string, limit: LimitKey): Promise<number> {
  const LOG_PREFIX = "[Entitlements.getLimit]";
  const entitlements = await getEntitlements(shop);
  const columnName = `limit${capitalize(limit)}` as keyof ShopEntitlements;
  const value = entitlements[columnName];

  // If value exists in DB, use it
  if (typeof value === 'number') {
    console.log(`${LOG_PREFIX} shop=${shop} limit=${limit} value=${value} plan=${entitlements.effectivePlan} source=database`);
    return value;
  }

  // Value is undefined - column likely doesn't exist in DB (unmigrated)
  // Fall back to PLAN_FEATURES for this plan
  const planFeatures = PLAN_FEATURES[entitlements.effectivePlan] || PLAN_FEATURES[FREE_PLAN];
  const fallbackValue = planFeatures[columnName as keyof typeof planFeatures];
  const result = typeof fallbackValue === 'number' ? fallbackValue : 0;

  console.log(`${LOG_PREFIX} shop=${shop} limit=${limit} value=${value} fallback=${result} plan=${entitlements.effectivePlan} source=plan_features`);

  // Log warning for critical limits with 0 value (shouldn't happen for paid plans)
  const criticalLimits = ['maxActiveRaffles', 'maxActiveMysteryBoxes', 'maxActiveChallenges', 'maxCampaigns', 'maxAutomationFlows'];
  if (result === 0 && criticalLimits.includes(limit) && entitlements.effectivePlan !== FREE_PLAN) {
    console.warn(`${LOG_PREFIX} WARNING: ${limit}=0 for ${shop} on plan ${entitlements.effectivePlan}. Check PLAN_FEATURES definition.`);
  }

  return result;
}

/**
 * Check if current usage is within the plan limit
 */
export async function isWithinLimit(
  shop: string,
  limit: LimitKey,
  currentCount: number
): Promise<boolean> {
  const maxLimit = await getLimit(shop, limit);
  // 999999 is effectively unlimited
  if (maxLimit >= 999999) return true;
  return currentCount < maxLimit;
}

/**
 * Get the effective plan name for a shop
 */
export async function getEffectivePlan(shop: string): Promise<string> {
  const entitlements = await getEntitlements(shop);
  return entitlements.effectivePlan;
}

/**
 * Refresh entitlements from the current subscription state
 * Call this after subscription changes (upgrades, downgrades, etc.)
 */
export async function refreshEntitlements(
  shop: string,
  options: { force?: boolean } = {},
): Promise<ShopEntitlements> {
  console.log(`[Entitlements] Refreshing entitlements for ${shop}`);

  // Debounce: skip refresh if last resolved within 5 seconds (prevents callback/webhook race)
  if (!options.force) {
    const recentCheck = await prisma.shopEntitlements.findUnique({
      where: { shop },
      select: { lastResolvedAt: true },
    });
    if (recentCheck?.lastResolvedAt) {
      const msSinceLastRefresh = Date.now() - recentCheck.lastResolvedAt.getTime();
      if (msSinceLastRefresh < 5000) {
        console.log(`[Entitlements] Skipping refresh for ${shop} - last resolved ${msSinceLastRefresh}ms ago (debounce)`);
        return getEntitlements(shop);
      }
    }
  }

  // NOTE: Cache invalidation moved to AFTER DB write to prevent race condition.
  // Previously, another instance could read stale cache between invalidation and write.

  // Get current subscription state
  const [appSubscription, billingSubscription, shopSettings] = await Promise.all([
    prisma.appSubscription.findFirst({
      where: { shop, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.billingSubscription.findFirst({
      where: { shop, subscriptionStatus: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.shopSettings.findUnique({
      where: { shop },
    }),
  ]);

  // Determine effective plan from subscription
  let effectivePlan: string = FREE_PLAN;
  let planSource: EntitlementSource = 'DEFAULT';
  let resolvedFrom: string | null = null;
  const legacyPlanActive = ['ACTIVE', 'TRIAL'].includes(
    (
      shopSettings?.subscriptionStatus ||
      shopSettings?.billingStatus ||
      ''
    ).toUpperCase(),
  );
  const legacyPlanName =
    shopSettings?.currentPlanName || shopSettings?.currentPlan;

  if (appSubscription?.planName) {
    effectivePlan = normalizeKnownPlanName(appSubscription.planName);
    planSource = 'SUBSCRIPTION';
    resolvedFrom = `AppSubscription:${appSubscription.id}`;
  } else if (billingSubscription?.planType || billingSubscription?.planName) {
    effectivePlan = normalizeKnownPlanName(
      billingSubscription.planType || billingSubscription.planName!,
    );
    planSource = 'SUBSCRIPTION';
    resolvedFrom = `BillingSubscription:${billingSubscription.id}`;
  } else if (legacyPlanActive && legacyPlanName) {
    effectivePlan = normalizeKnownPlanName(legacyPlanName);
    planSource = 'LEGACY';
    resolvedFrom = `ShopSettings:${shopSettings.id}`;
  }

  const planFeatures = entitlementValuesForKnownPlan(effectivePlan);

  // Filter out columns that haven't been migrated to production yet
  // This prevents "column does not exist" errors with Aurora Data API
  const safePlanFeatures = filterUnmigratedColumns(planFeatures);
  const safeDefaultEntitlements = filterUnmigratedColumns(DEFAULT_ENTITLEMENTS);

  // Check for existing entitlements with overrides
  const existing = await prisma.shopEntitlements.findUnique({
    where: { shop },
  });

  // If there's an active override, preserve it
  const hasActiveOverride = existing?.hasOverride &&
    (!existing.overrideExpiry || existing.overrideExpiry > new Date());

  // Build update data
  const updateData: Partial<ShopEntitlements> = {
    lastResolvedAt: new Date(),
    resolvedFrom,
  };

  // Only update plan fields if there's no active override
  if (!hasActiveOverride) {
    Object.assign(updateData, {
      effectivePlan,
      planSource,
      ...safePlanFeatures,
    });

    if (existing?.hasOverride) {
      Object.assign(updateData, {
        hasOverride: false,
        overrideExpiry: null,
        overrideNote: null,
        overrideBy: null,
      });
    }
  }

  // Upsert the entitlements record
  const entitlements = await prisma.shopEntitlements.upsert({
    where: { shop },
    create: {
      shop,
      ...safeDefaultEntitlements,
      ...safePlanFeatures,
      effectivePlan,
      planSource,
      lastResolvedAt: new Date(),
      resolvedFrom,
    },
    update: updateData,
  });

  // Invalidate stale cache AFTER DB write, then set fresh cache atomically.
  // This prevents the race condition where another instance reads stale data
  // between invalidation and DB write.
  await Promise.all([
    invalidateEntitlementsCache(shop),
    invalidateShopEntitlements(shop),
  ]);
  await setCachedEntitlements(shop, entitlements);

  console.log(`[Entitlements] Refreshed: ${shop} -> ${entitlements.effectivePlan} (source: ${entitlements.planSource})`);

  return entitlements;
}

/**
 * Set an override for a shop's entitlements
 * Used for custom deals, trials, or admin overrides
 */
export async function setOverride(
  shop: string,
  overrides: {
    effectivePlan?: string;
    features?: Partial<Record<FeatureKey, boolean>>;
    limits?: Partial<Record<LimitKey, number>>;
    expiresAt?: Date | null;
    note?: string;
    adminUserId?: string;
  }
): Promise<ShopEntitlements> {
  console.log(`[Entitlements] Setting override for ${shop}:`, overrides);

  // Build update data
  const updateData: Record<string, unknown> = {
    hasOverride: true,
    overrideExpiry: overrides.expiresAt ?? null,
    overrideNote: overrides.note ?? null,
    overrideBy: overrides.adminUserId ?? null,
    planSource: 'OVERRIDE' as EntitlementSource,
    lastResolvedAt: new Date(),
  };

  // Apply plan if specified
  if (overrides.effectivePlan) {
    const normalizedPlan = normalizeKnownPlanName(overrides.effectivePlan);
    const planFeatures = entitlementValuesForKnownPlan(normalizedPlan);
    updateData.effectivePlan = normalizedPlan;
    Object.assign(updateData, planFeatures);
  }

  // Apply individual feature overrides (filter out unmigrated columns)
  if (overrides.features) {
    for (const [key, value] of Object.entries(overrides.features)) {
      const columnName = `feature${capitalize(key)}`;
      if (!UNMIGRATED_COLUMNS.has(columnName)) {
        updateData[columnName] = value;
      }
    }
  }

  // Apply individual limit overrides (filter out unmigrated columns)
  if (overrides.limits) {
    for (const [key, value] of Object.entries(overrides.limits)) {
      const columnName = `limit${capitalize(key)}`;
      if (!UNMIGRATED_COLUMNS.has(columnName)) {
        updateData[columnName] = value;
      }
    }
  }

  // Ensure we have default entitlements first
  await getEntitlements(shop);

  // Filter out any unmigrated columns from the final update data
  const safeUpdateData = filterUnmigratedColumns(updateData);

  // Update with overrides
  const entitlements = await prisma.shopEntitlements.update({
    where: { shop },
    data: safeUpdateData,
  });

  // Invalidate stale cache AFTER DB write, then set fresh cache
  await Promise.all([
    invalidateEntitlementsCache(shop),
    invalidateShopEntitlements(shop),
  ]);
  await setCachedEntitlements(shop, entitlements);

  console.log(`[Entitlements] Override applied: ${shop} -> ${entitlements.effectivePlan}`);

  return entitlements;
}

/**
 * Remove an override and revert to subscription-based entitlements
 */
export async function removeOverride(shop: string): Promise<ShopEntitlements> {
  console.log(`[Entitlements] Removing override for ${shop}`);

  // First, clear the override flags
  await prisma.shopEntitlements.update({
    where: { shop },
    data: {
      hasOverride: false,
      overrideExpiry: null,
      overrideNote: null,
      overrideBy: null,
    },
  });

  // Then refresh from subscription
  return refreshEntitlements(shop, { force: true });
}

/**
 * Invalidate cache for a shop
 * Now clears Redis globally across all serverless instances
 * Use when you know entitlements have changed externally
 */
export async function invalidateCache(shop: string): Promise<void> {
  await Promise.all([
    invalidateEntitlementsCache(shop),
    invalidateShopEntitlements(shop),
  ]);
}

/**
 * Clear entire cache
 * Clears all entitlements from Redis (pattern-based deletion)
 * Primarily for testing or after bulk updates
 */
export async function clearCache(): Promise<void> {
  await clearEntitlementsCache();
}

/**
 * Get cache statistics
 * Returns info about the cache backend and entries
 */
export async function getCacheStats(): Promise<{
  backend: 'redis' | 'memory';
  size: number;
  keys: string[];
}> {
  return getEntitlementsCacheStats();
}

/**
 * Get the cache backend being used
 */
export function getCacheBackend(): 'redis' | 'memory' {
  return getEntitlementsCacheBackend();
}

// Helper: Capitalize first letter
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * The checked-in schema contains every entitlement field used by the contract.
 * Production rollout is intentionally blocked on a schema preflight rather
 * than silently dropping fields and accepting contradictory database defaults.
 */
const UNMIGRATED_COLUMNS = new Set<string>();

/**
 * Filter out columns that haven't been migrated to production yet
 * This prevents "column does not exist" errors when using Aurora Data API
 */
function filterUnmigratedColumns<T extends object>(data: T): Partial<T> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!UNMIGRATED_COLUMNS.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered as Partial<T>;
}

function normalizeKnownPlanName(planName: string): string {
  const planKey = tryGetPlanKey(planName);
  if (!planKey) {
    throw new Error(
      `[Entitlements] Refusing to resolve unknown active plan "${planName}"`,
    );
  }
  return PRICING_PLANS[planKey].billingName;
}

/**
 * Error class for feature not available
 */
export class FeatureNotAvailableError extends Error {
  constructor(
    public feature: FeatureKey,
    public currentPlan: string,
    public requiredPlan?: string
  ) {
    super(`Feature "${feature}" is not available on the ${currentPlan} plan`);
    this.name = 'FeatureNotAvailableError';
  }
}

/**
 * Error class for limit exceeded
 */
export class LimitExceededError extends Error {
  constructor(
    public limit: LimitKey,
    public currentCount: number,
    public maxLimit: number,
    public currentPlan: string
  ) {
    super(`Limit "${limit}" exceeded: ${currentCount}/${maxLimit} on ${currentPlan} plan`);
    this.name = 'LimitExceededError';
  }
}

/**
 * Require a feature or throw
 * Use in actions/loaders for server-side enforcement
 */
export async function requireFeature(shop: string, feature: FeatureKey): Promise<void> {
  const hasAccess = await hasFeature(shop, feature);
  if (!hasAccess) {
    const plan = await getEffectivePlan(shop);
    throw new FeatureNotAvailableError(feature, plan);
  }
}

/**
 * Report a reached numeric capacity without blocking the operation.
 *
 * The compatibility name is retained for existing callers. Numeric plan
 * capacities are advisory during the free-first rollout.
 */
export async function requireWithinLimit(
  shop: string,
  limit: LimitKey,
  currentCount: number
): Promise<void> {
  const maxLimit = await getLimit(shop, limit);
  if (maxLimit < 999999 && currentCount >= maxLimit) {
    const plan = await getEffectivePlan(shop);
    console.warn(
      `[Entitlements] Capacity advisory: ${limit} usage is ${currentCount}/${maxLimit} for ${shop} on ${plan}; processing remains available`,
    );
  }
}
