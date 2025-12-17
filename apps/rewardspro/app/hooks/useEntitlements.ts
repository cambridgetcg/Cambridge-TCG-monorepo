/**
 * useEntitlements Hook
 * Client-side hook for accessing shop entitlements from root loader data
 *
 * Usage:
 * ```tsx
 * const { hasFeature, getLimit, plan, isWithinLimit } = useEntitlements();
 *
 * if (hasFeature('apiAccess')) {
 *   // Show API access UI
 * }
 *
 * const maxTiers = getLimit('maxTiers');
 * const canCreateTier = isWithinLimit('maxTiers', currentTierCount);
 * ```
 */

import { useRouteLoaderData } from "@remix-run/react";
import type { ShopEntitlements } from "@prisma/client";
import type { AppLoaderData } from "~/routes/app";

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

// Re-export for backwards compatibility
export type EntitlementsLoaderData = AppLoaderData;

// Default entitlements for when data is not available (Free plan)
const DEFAULT_ENTITLEMENTS: Partial<ShopEntitlements> = {
  effectivePlan: 'RewardsPro Free',
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
};

/**
 * Hook to access shop entitlements from root loader
 *
 * Note: This hook requires entitlements to be loaded in the root app loader
 * and passed via Remix's route loader data system.
 */
export function useEntitlements() {
  // Try to get data from the app root loader
  // Remix route IDs: 'routes/app' for file-based routes
  const data = useRouteLoaderData<AppLoaderData>('routes/app');

  // Fall back to defaults if no entitlements data
  const entitlements = data?.entitlements || DEFAULT_ENTITLEMENTS;

  /**
   * Check if a feature is available
   */
  const hasFeature = (feature: FeatureKey): boolean => {
    const columnName = `feature${capitalize(feature)}` as keyof ShopEntitlements;
    return entitlements[columnName] === true;
  };

  /**
   * Get a numeric limit value
   */
  const getLimit = (limit: LimitKey): number => {
    const columnName = `limit${capitalize(limit)}` as keyof ShopEntitlements;
    const value = entitlements[columnName];
    return typeof value === 'number' ? value : 0;
  };

  /**
   * Check if current usage is within plan limits
   */
  const isWithinLimit = (limit: LimitKey, currentCount: number): boolean => {
    const maxLimit = getLimit(limit);
    // 999999 is effectively unlimited
    if (maxLimit >= 999999) return true;
    return currentCount < maxLimit;
  };

  /**
   * Check if usage is approaching the limit (default 80%)
   */
  const isApproachingLimit = (limit: LimitKey, currentCount: number, threshold = 80): boolean => {
    const maxLimit = getLimit(limit);
    if (maxLimit >= 999999) return false; // Never approaching for unlimited
    const percentage = (currentCount / maxLimit) * 100;
    return percentage >= threshold;
  };

  /**
   * Get usage percentage for a limit
   */
  const getUsagePercentage = (limit: LimitKey, currentCount: number): number => {
    const maxLimit = getLimit(limit);
    if (maxLimit >= 999999) return 0;
    return Math.min((currentCount / maxLimit) * 100, 100);
  };

  return {
    // Raw entitlements data
    entitlements,

    // Plan info
    plan: entitlements.effectivePlan || 'RewardsPro Free',
    planSource: entitlements.planSource || 'DEFAULT',
    hasOverride: entitlements.hasOverride || false,

    // Feature checks
    hasFeature,

    // Limit checks
    getLimit,
    isWithinLimit,
    isApproachingLimit,
    getUsagePercentage,

    // Convenience feature checks
    hasApiAccess: hasFeature('apiAccess'),
    hasWebhooks: hasFeature('webhooks'),
    hasWhiteLabel: hasFeature('whiteLabel'),
    hasAdvancedReport: hasFeature('advancedReport'),
    hasCustomEmail: hasFeature('customEmail'),
    hasAnnualEval: hasFeature('annualEval'),
    hasBulkOps: hasFeature('bulkOps'),
    hasCustomBranding: hasFeature('customBranding'),
    hasPrioritySupport: hasFeature('prioritySupport'),
    hasSubscriptionTiers: hasFeature('subscriptionTiers'),
    hasPurchasableTiers: hasFeature('purchasableTiers'),
    hasExportData: hasFeature('exportData'),
    hasCustomRewards: hasFeature('customRewards'),

    // Convenience limit getters
    maxTiers: getLimit('maxTiers'),
    maxOrders: getLimit('maxOrders'),
    maxEmails: getLimit('maxEmails'),
  };
}

// Helper: Capitalize first letter
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Type guard to check if entitlements are loaded
 */
export function hasEntitlementsData(data: unknown): data is EntitlementsLoaderData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'entitlements' in data
  );
}
