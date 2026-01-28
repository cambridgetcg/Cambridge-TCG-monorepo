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
// SYNCED with server: app/services/entitlements.server.ts (2026-01-24)
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
// SYNCED with server: app/services/entitlements.server.ts (2026-01-24)
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

// Re-export for backwards compatibility
export type EntitlementsLoaderData = AppLoaderData;

// Default entitlements for when data is not available (Free plan)
// RATE-BASED GATING MODEL: All features enabled, limits differentiate plans
// SYNCED with server: app/services/entitlements.server.ts (2026-01-24)
const DEFAULT_ENTITLEMENTS: Partial<ShopEntitlements> = {
  effectivePlan: 'RewardsPro Free',
  // ALL FEATURES ENABLED - rate-based model differentiates by limits
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
  // Integration features (P1) - ALL ENABLED
  featureIntegrationKlaviyo: true,
  featureIntegrationSendgrid: true,
  featureIntegrationJudgeme: true,
  featureIntegrationSlack: true,
  featureIntegrationRecharge: true,
  featureIntegrationGorgias: true,
  featureIntegrationZapier: true,
  // Gamification features (P2) - ALL ENABLED
  featureRaffles: true,
  featureMysteryBoxes: true,
  featureChallenges: true,
  // Marketing features (P3) - ALL ENABLED
  featureMarketingCampaigns: true,
  featureMarketingAutomation: true,
  featureAiRecommendations: true,
  // Analytics features (P4) - ALL ENABLED
  featureRfmSegmentation: true,
  featureProgramImpact: true,
  featureRealtimeAnalytics: true,
  featureCohortAnalysis: true,
  // LIMITS - Free tier minimums (these differentiate the plans)
  limitMaxTiers: 2,
  limitMaxOrders: 50,
  limitMaxEmails: 50,
  limitMaxAutomations: 1,
  limitMaxCustomersSync: 500,
  limitMaxTierProducts: 1,
  limitMaxHistoricalDays: 7,
  limitMaxActiveRaffles: 1,
  limitMaxActiveMysteryBoxes: 1,
  limitMaxActiveChallenges: 1,
  limitMaxCampaigns: 1,
  limitMaxAutomationFlows: 1,
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

    // Convenience feature checks - Core
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

    // Convenience feature checks - Integrations (P1)
    hasIntegrationKlaviyo: hasFeature('integrationKlaviyo'),
    hasIntegrationSendgrid: hasFeature('integrationSendgrid'),
    hasIntegrationJudgeme: hasFeature('integrationJudgeme'),
    hasIntegrationSlack: hasFeature('integrationSlack'),
    hasIntegrationRecharge: hasFeature('integrationRecharge'),
    hasIntegrationGorgias: hasFeature('integrationGorgias'),
    hasIntegrationZapier: hasFeature('integrationZapier'),

    // Convenience feature checks - Gamification (P2)
    hasRaffles: hasFeature('raffles'),
    hasMysteryBoxes: hasFeature('mysteryBoxes'),
    hasChallenges: hasFeature('challenges'),

    // Convenience feature checks - Marketing (P3)
    hasMarketingCampaigns: hasFeature('marketingCampaigns'),
    hasMarketingAutomation: hasFeature('marketingAutomation'),
    hasAiRecommendations: hasFeature('aiRecommendations'),

    // Convenience feature checks - Analytics (P4)
    hasRfmSegmentation: hasFeature('rfmSegmentation'),
    hasProgramImpact: hasFeature('programImpact'),
    hasRealtimeAnalytics: hasFeature('realtimeAnalytics'),
    hasCohortAnalysis: hasFeature('cohortAnalysis'),

    // Convenience limit getters - Core
    maxTiers: getLimit('maxTiers'),
    maxOrders: getLimit('maxOrders'),
    maxEmails: getLimit('maxEmails'),

    // Convenience limit getters - Extended
    maxAutomations: getLimit('maxAutomations'),
    maxCustomersSync: getLimit('maxCustomersSync'),
    maxTierProducts: getLimit('maxTierProducts'),
    maxHistoricalDays: getLimit('maxHistoricalDays'),

    // Convenience limit getters - Gamification (P2)
    maxActiveRaffles: getLimit('maxActiveRaffles'),
    maxActiveMysteryBoxes: getLimit('maxActiveMysteryBoxes'),
    maxActiveChallenges: getLimit('maxActiveChallenges'),

    // Convenience limit getters - Marketing (P3)
    maxCampaigns: getLimit('maxCampaigns'),
    maxAutomationFlows: getLimit('maxAutomationFlows'),
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
