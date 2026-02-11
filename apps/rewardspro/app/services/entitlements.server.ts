/**
 * Entitlements Service
 * Single source of truth for feature access and plan limits
 *
 * This service consolidates all entitlement checks through the ShopEntitlements table,
 * providing caching and consistent access patterns across the application.
 */

import db from "~/db.server";
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
  getCachedEntitlements,
  setCachedEntitlements,
  invalidateEntitlementsCache,
  clearEntitlementsCache,
  getEntitlementsCacheStats,
  getEntitlementsCacheBackend,
} from "./entitlements-cache-redis.server";

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

// Plan limits are derived from plan-limits.ts (single source of truth)
import {
  getOrderLimit,
  getTierLimit,
  getPlanLimit,
  normalizePlanName as normalizeToPlanLimitsName,
} from '~/constants/plan-limits';

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

// Default entitlements for new shops (Free plan)
// RATE-BASED GATING MODEL: All features enabled, limits differentiate plans
const DEFAULT_ENTITLEMENTS: Omit<ShopEntitlements, 'id' | 'shop' | 'createdAt' | 'updatedAt'> = {
  effectivePlan: FREE_PLAN,
  planSource: 'DEFAULT' as EntitlementSource,

  // Feature flags - ALL ENABLED (rate-based model: differentiate by limits, not features)
  // Core features
  featureApiAccess: true,
  featureWebhooks: true,
  featureWhiteLabel: true,
  featureAdvancedReport: true,
  featureCustomEmail: true,
  featureAnnualEval: true,
  featureBulkOps: true,
  featureCustomBranding: true,
  featurePrioritySupport: true,
  featureSubscriptionTiers: true,
  featurePurchasableTiers: true,
  featureExportData: true,
  featureCustomRewards: true,

  // Integration features - ALL ENABLED
  featureIntegrationKlaviyo: true,
  featureIntegrationSendgrid: true,
  featureIntegrationJudgeme: true,
  featureIntegrationSlack: true,
  featureIntegrationRecharge: true,
  featureIntegrationGorgias: true,
  featureIntegrationZapier: true,

  // Gamification features - ALL ENABLED
  featureRaffles: true,
  featureMysteryBoxes: true,
  featureChallenges: true,

  // Marketing features - ALL ENABLED
  featureMarketingCampaigns: true,
  featureMarketingAutomation: true,
  featureAiRecommendations: true,

  // Analytics features - ALL ENABLED
  featureRfmSegmentation: true,
  featureProgramImpact: true,
  featureRealtimeAnalytics: true,
  featureCohortAnalysis: true,

  // Numeric limits (Free plan) - THESE DIFFERENTIATE THE PLANS
  // Core limits - Free gets minimal but functional
  limitMaxTiers: 2,
  limitMaxOrders: 50,
  limitMaxEmails: 50,

  // Operational limits - Free tier minimums
  limitMaxAutomations: 1,
  limitMaxCustomersSync: 500,
  limitMaxTierProducts: 1,
  limitMaxHistoricalDays: 7,

  // Gamification limits - Free gets 1 of each
  limitMaxActiveRaffles: 1,
  limitMaxActiveMysteryBoxes: 1,
  limitMaxActiveChallenges: 1,

  // Marketing limits - Free gets 1 of each
  limitMaxCampaigns: 1,
  limitMaxAutomationFlows: 1,

  // Override fields
  hasOverride: false,
  overrideExpiry: null,
  overrideNote: null,
  overrideBy: null,

  // Resolution tracking
  lastResolvedAt: new Date(),
  resolvedFrom: null,
};

// All features enabled for rate-based model (shared across all plans)
const ALL_FEATURES_ENABLED = {
  featureApiAccess: true,
  featureWebhooks: true,
  featureWhiteLabel: true,
  featureAdvancedReport: true,
  featureCustomEmail: true,
  featureAnnualEval: true,
  featureBulkOps: true,
  featureCustomBranding: true,
  featurePrioritySupport: true,
  featureSubscriptionTiers: true,
  featurePurchasableTiers: true,
  featureExportData: true,
  featureCustomRewards: true,
  featureIntegrationKlaviyo: true,
  featureIntegrationSendgrid: true,
  featureIntegrationJudgeme: true,
  featureIntegrationSlack: true,
  featureIntegrationRecharge: true,
  featureIntegrationGorgias: true,
  featureIntegrationZapier: true,
  featureRaffles: true,
  featureMysteryBoxes: true,
  featureChallenges: true,
  featureMarketingCampaigns: true,
  featureMarketingAutomation: true,
  featureAiRecommendations: true,
  featureRfmSegmentation: true,
  featureProgramImpact: true,
  featureRealtimeAnalytics: true,
  featureCohortAnalysis: true,
} as const;

/**
 * Derive entitlement limits from plan-limits.ts (single source of truth).
 * Uses 999999 instead of Infinity for database compatibility.
 */
function limitsForPlan(planName: string): Partial<ShopEntitlements> {
  const cap = (v: number) => v === Infinity ? 999999 : v;
  return {
    limitMaxTiers: cap(getPlanLimit(planName, 'tiers') as number),
    limitMaxOrders: cap(getPlanLimit(planName, 'orders') as number),
    limitMaxEmails: cap(getPlanLimit(planName, 'emails') as number),
    limitMaxAutomations: cap(getPlanLimit(planName, 'automations') as number),
    limitMaxCustomersSync: cap(getPlanLimit(planName, 'customersSync') as number),
    limitMaxTierProducts: cap(getPlanLimit(planName, 'tierProducts') as number),
    limitMaxHistoricalDays: cap(getPlanLimit(planName, 'historicalDataDays') as number),
    limitMaxActiveRaffles: cap(getPlanLimit(planName, 'activeRaffles') as number),
    limitMaxActiveMysteryBoxes: cap(getPlanLimit(planName, 'activeMysteryBoxes') as number),
    limitMaxActiveChallenges: cap(getPlanLimit(planName, 'activeChallenges') as number),
    limitMaxCampaigns: cap(getPlanLimit(planName, 'campaigns') as number),
    limitMaxAutomationFlows: cap(getPlanLimit(planName, 'automationFlows') as number),
  };
}

// Feature mapping from plan to entitlements
// RATE-BASED GATING MODEL: All features enabled for all plans
// Limits are derived from plan-limits.ts (single source of truth)
const PLAN_FEATURES: Record<string, Partial<ShopEntitlements>> = {
  [FREE_PLAN]: { ...ALL_FEATURES_ENABLED, ...limitsForPlan(FREE_PLAN) },
  [PRO_PLAN]: { ...ALL_FEATURES_ENABLED, ...limitsForPlan(PRO_PLAN) },
  [MAX_PLAN]: { ...ALL_FEATURES_ENABLED, ...limitsForPlan(MAX_PLAN) },
  [ULTRA_PLAN]: { ...ALL_FEATURES_ENABLED, ...limitsForPlan(ULTRA_PLAN) },
  [ENTERPRISE_PLAN]: { ...ALL_FEATURES_ENABLED, ...limitsForPlan(ENTERPRISE_PLAN) },
  // Legacy plans map to their equivalent tiers
  [STARTER_PLAN]: { ...ALL_FEATURES_ENABLED, ...limitsForPlan(STARTER_PLAN) },
  [GROWTH_PLAN]: { ...ALL_FEATURES_ENABLED, ...limitsForPlan(GROWTH_PLAN) },
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
  let entitlements = await db.shopEntitlements.findUnique({
    where: { shop },
  });

  // Create default entitlements if not found
  if (!entitlements) {
    console.log(`${LOG_PREFIX} No entitlements found, creating defaults for ${shop}`);
    // Filter out unmigrated columns to prevent "column does not exist" errors
    const safeDefaults = filterUnmigratedColumns(DEFAULT_ENTITLEMENTS);
    entitlements = await db.shopEntitlements.create({
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
export async function refreshEntitlements(shop: string): Promise<ShopEntitlements> {
  console.log(`[Entitlements] Refreshing entitlements for ${shop}`);

  // Debounce: skip refresh if last resolved within 5 seconds (prevents callback/webhook race)
  const recentCheck = await db.shopEntitlements.findUnique({
    where: { shop },
    select: { lastResolvedAt: true },
  });
  if (recentCheck?.lastResolvedAt) {
    const msSinceLastRefresh = Date.now() - recentCheck.lastResolvedAt.getTime();
    if (msSinceLastRefresh < 5000) {
      console.log(`[Entitlements] Skipping refresh for ${shop} - last resolved ${msSinceLastRefresh}ms ago (debounce)`);
      // Return current entitlements from cache or DB
      return getEntitlements(shop);
    }
  }

  // NOTE: Cache invalidation moved to AFTER DB write to prevent race condition.
  // Previously, another instance could read stale cache between invalidation and write.

  // Get current subscription state
  const [billingSubscription, shopSettings] = await Promise.all([
    db.billingSubscription.findFirst({
      where: { shop, subscriptionStatus: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    }),
    db.shopSettings.findUnique({
      where: { shop },
    }),
  ]);

  // Determine effective plan from subscription
  let effectivePlan = FREE_PLAN;
  let planSource: EntitlementSource = 'DEFAULT';
  let resolvedFrom: string | null = null;

  if (billingSubscription?.planType) {
    effectivePlan = normalizePlanName(billingSubscription.planType);
    planSource = 'SUBSCRIPTION';
    resolvedFrom = `BillingSubscription:${billingSubscription.id}`;
  } else if (shopSettings?.currentPlan) {
    effectivePlan = normalizePlanName(shopSettings.currentPlan);
    planSource = 'LEGACY';
    resolvedFrom = `ShopSettings:${shopSettings.id}`;
  }

  // Get plan features
  const planFeatures = PLAN_FEATURES[effectivePlan] || PLAN_FEATURES[FREE_PLAN];

  // Filter out columns that haven't been migrated to production yet
  // This prevents "column does not exist" errors with Aurora Data API
  const safePlanFeatures = filterUnmigratedColumns(planFeatures);
  const safeDefaultEntitlements = filterUnmigratedColumns(DEFAULT_ENTITLEMENTS);

  // Check for existing entitlements with overrides
  const existing = await db.shopEntitlements.findUnique({
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
  }

  // Upsert the entitlements record
  const entitlements = await db.shopEntitlements.upsert({
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
  await invalidateEntitlementsCache(shop);
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
    const planFeatures = PLAN_FEATURES[overrides.effectivePlan] || {};
    updateData.effectivePlan = overrides.effectivePlan;
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
  const entitlements = await db.shopEntitlements.update({
    where: { shop },
    data: safeUpdateData,
  });

  // Invalidate stale cache AFTER DB write, then set fresh cache
  await invalidateEntitlementsCache(shop);
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
  await db.shopEntitlements.update({
    where: { shop },
    data: {
      hasOverride: false,
      overrideExpiry: null,
      overrideNote: null,
      overrideBy: null,
    },
  });

  // Then refresh from subscription
  return refreshEntitlements(shop);
}

/**
 * Invalidate cache for a shop
 * Now clears Redis globally across all serverless instances
 * Use when you know entitlements have changed externally
 */
export async function invalidateCache(shop: string): Promise<void> {
  await invalidateEntitlementsCache(shop);
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
 * Columns added in migrations that may not exist in production yet.
 * These are filtered out during upsert operations to prevent errors.
 *
 * IMPORTANT: Run migrations on production before removing columns from this set!
 * To check if migration is applied, run in production DB:
 * SELECT column_name FROM information_schema.columns WHERE table_name = 'ShopEntitlements';
 */
const UNMIGRATED_COLUMNS = new Set<string>([
  // From 20260123000000_add_integration_features_and_sync_limits
  // Feature flags
  'featureIntegrationKlaviyo',
  'featureIntegrationSendgrid',
  'featureIntegrationJudgeme',
  'featureIntegrationSlack',
  'featureIntegrationRecharge',
  'featureIntegrationGorgias',
  'featureIntegrationZapier',
  // Limit columns (these were missing from original list!)
  'limitMaxAutomations',
  'limitMaxCustomersSync',
  'limitMaxTierProducts',
  'limitMaxHistoricalDays',
  // From 20260123000001_add_gamification_marketing_analytics_features
  'featureRaffles',
  'featureMysteryBoxes',
  'featureChallenges',
  'featureMarketingCampaigns',
  'featureMarketingAutomation',
  'featureAiRecommendations',
  'featureRfmSegmentation',
  'featureProgramImpact',
  'featureRealtimeAnalytics',
  'featureCohortAnalysis',
  'limitMaxActiveRaffles',
  'limitMaxActiveMysteryBoxes',
  'limitMaxActiveChallenges',
  'limitMaxCampaigns',
  'limitMaxAutomationFlows',
]);

/**
 * Filter out columns that haven't been migrated to production yet
 * This prevents "column does not exist" errors when using Aurora Data API
 */
function filterUnmigratedColumns<T extends Record<string, unknown>>(data: T): Partial<T> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!UNMIGRATED_COLUMNS.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered as Partial<T>;
}

// Helper: Normalize plan names to canonical form
function normalizePlanName(planName: string): string {
  const lower = planName.toLowerCase();

  // Handle various plan name formats
  if (lower === 'free' || lower.includes('free')) return FREE_PLAN;
  if (lower === 'starter' || lower.includes('starter')) return STARTER_PLAN;
  if (lower === 'pro' || lower.includes('pro')) return PRO_PLAN;
  if (lower === 'growth' || lower.includes('growth')) return GROWTH_PLAN;
  if (lower === 'max' || lower.includes('max')) return MAX_PLAN;
  if (lower === 'ultra' || lower.includes('ultra')) return ULTRA_PLAN;
  if (lower === 'enterprise' || lower.includes('enterprise')) return ENTERPRISE_PLAN;

  // If it's already a valid plan constant, return as-is
  if (Object.keys(PLAN_FEATURES).includes(planName)) {
    return planName;
  }

  return FREE_PLAN;
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
 * Require within limit or throw
 * Use in actions/loaders for server-side enforcement
 */
export async function requireWithinLimit(
  shop: string,
  limit: LimitKey,
  currentCount: number
): Promise<void> {
  const maxLimit = await getLimit(shop, limit);
  if (maxLimit < 999999 && currentCount >= maxLimit) {
    const plan = await getEffectivePlan(shop);
    throw new LimitExceededError(limit, currentCount, maxLimit, plan);
  }
}
