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

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

// In-memory cache for entitlements
const entitlementsCache = new Map<string, { data: ShopEntitlements; expires: number }>();

// Feature keys that map to ShopEntitlements columns
export type FeatureKey =
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
  | 'customRewards';

// Limit keys that map to ShopEntitlements columns
export type LimitKey = 'maxTiers' | 'maxOrders' | 'maxEmails';

// Plan names with their canonical order limits (source of truth)
export const PLAN_ORDER_LIMITS: Record<string, number> = {
  [FREE_PLAN]: 50,
  [STARTER_PLAN]: 500, // Legacy - same as Pro
  [PRO_PLAN]: 500,
  [GROWTH_PLAN]: 5000, // Legacy - same as Max
  [MAX_PLAN]: 5000,
  [ULTRA_PLAN]: Infinity,
  [ENTERPRISE_PLAN]: Infinity,
};

// Plan names with their tier limits
export const PLAN_TIER_LIMITS: Record<string, number> = {
  [FREE_PLAN]: 2,
  [STARTER_PLAN]: 5, // Legacy - same as Pro
  [PRO_PLAN]: 5,
  [GROWTH_PLAN]: 10, // Legacy - same as Max
  [MAX_PLAN]: 10,
  [ULTRA_PLAN]: Infinity,
  [ENTERPRISE_PLAN]: Infinity,
};

// Default entitlements for new shops (Free plan)
const DEFAULT_ENTITLEMENTS: Omit<ShopEntitlements, 'id' | 'shop' | 'createdAt' | 'updatedAt'> = {
  effectivePlan: FREE_PLAN,
  planSource: 'DEFAULT' as EntitlementSource,

  // Feature flags (Free plan defaults)
  featureApiAccess: false,
  featureWebhooks: false,
  featureWhiteLabel: false,
  featureAdvancedReport: false,
  featureCustomEmail: false,
  featureAnnualEval: false,
  featureBulkOps: false,
  featureCustomBranding: false,
  featurePrioritySupport: false,
  featureSubscriptionTiers: false,
  featurePurchasableTiers: false,
  featureExportData: false,
  featureCustomRewards: false,

  // Numeric limits (Free plan)
  limitMaxTiers: 2,
  limitMaxOrders: 50,
  limitMaxEmails: 0,

  // Override fields
  hasOverride: false,
  overrideExpiry: null,
  overrideNote: null,
  overrideBy: null,

  // Resolution tracking
  lastResolvedAt: new Date(),
  resolvedFrom: null,
};

// Feature mapping from plan to entitlements
const PLAN_FEATURES: Record<string, Partial<ShopEntitlements>> = {
  [FREE_PLAN]: {
    featureApiAccess: false,
    featureWebhooks: false,
    featureWhiteLabel: false,
    featureAdvancedReport: false,
    featureCustomEmail: false,
    featureAnnualEval: false,
    featureBulkOps: false,
    featureCustomBranding: false,
    featurePrioritySupport: false,
    featureSubscriptionTiers: false,
    featurePurchasableTiers: false,
    featureExportData: false,
    featureCustomRewards: false,
    limitMaxTiers: 2,
    limitMaxOrders: 50,
    limitMaxEmails: 0,
  },
  [PRO_PLAN]: {
    featureApiAccess: false,
    featureWebhooks: false,
    featureWhiteLabel: false,
    featureAdvancedReport: true,
    featureCustomEmail: false,
    featureAnnualEval: false,
    featureBulkOps: true,
    featureCustomBranding: false,
    featurePrioritySupport: false,
    featureSubscriptionTiers: true,
    featurePurchasableTiers: true,
    featureExportData: true,
    featureCustomRewards: true,
    limitMaxTiers: 5,
    limitMaxOrders: 500,
    limitMaxEmails: 100,
  },
  [MAX_PLAN]: {
    featureApiAccess: false,
    featureWebhooks: true,
    featureWhiteLabel: true,
    featureAdvancedReport: true,
    featureCustomEmail: true,
    featureAnnualEval: false,
    featureBulkOps: true,
    featureCustomBranding: true,
    featurePrioritySupport: true,
    featureSubscriptionTiers: true,
    featurePurchasableTiers: true,
    featureExportData: true,
    featureCustomRewards: true,
    limitMaxTiers: 10,
    limitMaxOrders: 5000,
    limitMaxEmails: 500,
  },
  [ULTRA_PLAN]: {
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
    limitMaxTiers: 999999, // Effectively unlimited
    limitMaxOrders: 999999,
    limitMaxEmails: 999999,
  },
  [ENTERPRISE_PLAN]: {
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
    limitMaxTiers: 999999,
    limitMaxOrders: 999999,
    limitMaxEmails: 999999,
  },
  // Legacy plans map to their equivalent tiers
  [STARTER_PLAN]: {
    featureApiAccess: false,
    featureWebhooks: false,
    featureWhiteLabel: false,
    featureAdvancedReport: true,
    featureCustomEmail: false,
    featureAnnualEval: false,
    featureBulkOps: true,
    featureCustomBranding: false,
    featurePrioritySupport: false,
    featureSubscriptionTiers: true,
    featurePurchasableTiers: true,
    featureExportData: true,
    featureCustomRewards: true,
    limitMaxTiers: 5,
    limitMaxOrders: 500,
    limitMaxEmails: 100,
  },
  [GROWTH_PLAN]: {
    featureApiAccess: false,
    featureWebhooks: true,
    featureWhiteLabel: true,
    featureAdvancedReport: true,
    featureCustomEmail: true,
    featureAnnualEval: false,
    featureBulkOps: true,
    featureCustomBranding: true,
    featurePrioritySupport: true,
    featureSubscriptionTiers: true,
    featurePurchasableTiers: true,
    featureExportData: true,
    featureCustomRewards: true,
    limitMaxTiers: 10,
    limitMaxOrders: 5000,
    limitMaxEmails: 500,
  },
};

/**
 * Get entitlements for a shop
 * Uses cache if available and not expired
 */
export async function getEntitlements(shop: string): Promise<ShopEntitlements> {
  // Check cache first
  const cached = entitlementsCache.get(shop);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  // Query database
  let entitlements = await db.shopEntitlements.findUnique({
    where: { shop },
  });

  // Create default entitlements if not found
  if (!entitlements) {
    console.log(`[Entitlements] Creating default entitlements for ${shop}`);
    entitlements = await db.shopEntitlements.create({
      data: {
        shop,
        ...DEFAULT_ENTITLEMENTS,
        lastResolvedAt: new Date(),
      },
    });
  }

  // Update cache
  entitlementsCache.set(shop, {
    data: entitlements,
    expires: Date.now() + CACHE_TTL,
  });

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
  const entitlements = await getEntitlements(shop);
  const columnName = `limit${capitalize(limit)}` as keyof ShopEntitlements;
  const value = entitlements[columnName];
  return typeof value === 'number' ? value : 0;
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

  // Invalidate cache
  entitlementsCache.delete(shop);

  // Get current subscription state
  const [billingSubscription, shopSettings] = await Promise.all([
    db.billingSubscription.findFirst({
      where: { shop, status: 'ACTIVE' },
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
      ...planFeatures,
    });
  }

  // Upsert the entitlements record
  const entitlements = await db.shopEntitlements.upsert({
    where: { shop },
    create: {
      shop,
      effectivePlan,
      planSource,
      ...DEFAULT_ENTITLEMENTS,
      ...planFeatures,
      lastResolvedAt: new Date(),
      resolvedFrom,
    },
    update: updateData,
  });

  // Update cache
  entitlementsCache.set(shop, {
    data: entitlements,
    expires: Date.now() + CACHE_TTL,
  });

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

  // Invalidate cache
  entitlementsCache.delete(shop);

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

  // Apply individual feature overrides
  if (overrides.features) {
    for (const [key, value] of Object.entries(overrides.features)) {
      const columnName = `feature${capitalize(key)}`;
      updateData[columnName] = value;
    }
  }

  // Apply individual limit overrides
  if (overrides.limits) {
    for (const [key, value] of Object.entries(overrides.limits)) {
      const columnName = `limit${capitalize(key)}`;
      updateData[columnName] = value;
    }
  }

  // Ensure we have default entitlements first
  await getEntitlements(shop);

  // Update with overrides
  const entitlements = await db.shopEntitlements.update({
    where: { shop },
    data: updateData,
  });

  // Update cache
  entitlementsCache.set(shop, {
    data: entitlements,
    expires: Date.now() + CACHE_TTL,
  });

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
 * Use when you know entitlements have changed externally
 */
export function invalidateCache(shop: string): void {
  entitlementsCache.delete(shop);
}

/**
 * Clear entire cache
 * Primarily for testing or after bulk updates
 */
export function clearCache(): void {
  entitlementsCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: entitlementsCache.size,
    keys: Array.from(entitlementsCache.keys()),
  };
}

// Helper: Capitalize first letter
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
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
