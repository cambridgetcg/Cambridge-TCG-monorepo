/**
 * Persisted entitlement projection for the free-first pricing contract.
 *
 * Ordinary loyalty capabilities are available on every plan. Capacity,
 * white-label controls, and the support relationship are the differentiators.
 */

import {
  PRICING_PLANS,
  getPlanKey,
  requireKnownPlanKey,
  type PlanKey,
} from "./pricing-contract";

export interface PlanEntitlementValues {
  featureApiAccess: boolean;
  featureWebhooks: boolean;
  featureWhiteLabel: boolean;
  featureAdvancedReport: boolean;
  featureCustomEmail: boolean;
  featureAnnualEval: boolean;
  featureBulkOps: boolean;
  featureCustomBranding: boolean;
  featurePrioritySupport: boolean;
  featureSubscriptionTiers: boolean;
  featurePurchasableTiers: boolean;
  featureExportData: boolean;
  featureCustomRewards: boolean;
  featureIntegrationKlaviyo: boolean;
  featureIntegrationSendgrid: boolean;
  featureIntegrationJudgeme: boolean;
  featureIntegrationSlack: boolean;
  featureIntegrationRecharge: boolean;
  featureIntegrationGorgias: boolean;
  featureIntegrationZapier: boolean;
  featureRaffles: boolean;
  featureMysteryBoxes: boolean;
  featureChallenges: boolean;
  featureMarketingCampaigns: boolean;
  featureMarketingAutomation: boolean;
  featureAiRecommendations: boolean;
  featureRfmSegmentation: boolean;
  featureProgramImpact: boolean;
  featureRealtimeAnalytics: boolean;
  featureCohortAnalysis: boolean;
  limitMaxTiers: number;
  limitMaxOrders: number;
  limitMaxEmails: number;
  limitMaxAutomations: number;
  limitMaxCustomersSync: number;
  limitMaxTierProducts: number;
  limitMaxHistoricalDays: number;
  limitMaxActiveRaffles: number;
  limitMaxActiveMysteryBoxes: number;
  limitMaxActiveChallenges: number;
  limitMaxCampaigns: number;
  limitMaxAutomationFlows: number;
}

export function entitlementValuesForPlanKey(
  planKey: PlanKey,
): PlanEntitlementValues {
  const plan = PRICING_PLANS[planKey];
  const { limits } = plan;
  const coreFeature = true;

  return {
    featureApiAccess: coreFeature,
    featureWebhooks: coreFeature,
    featureWhiteLabel: plan.whiteLabel,
    featureAdvancedReport: coreFeature,
    featureCustomEmail: coreFeature,
    featureAnnualEval: coreFeature,
    featureBulkOps: coreFeature,
    featureCustomBranding: coreFeature,
    featurePrioritySupport: plan.support !== "standard",
    featureSubscriptionTiers: coreFeature,
    featurePurchasableTiers: coreFeature,
    featureExportData: coreFeature,
    featureCustomRewards: coreFeature,
    featureIntegrationKlaviyo: coreFeature,
    featureIntegrationSendgrid: coreFeature,
    featureIntegrationJudgeme: coreFeature,
    featureIntegrationSlack: coreFeature,
    featureIntegrationRecharge: coreFeature,
    featureIntegrationGorgias: coreFeature,
    featureIntegrationZapier: coreFeature,
    featureRaffles: coreFeature,
    featureMysteryBoxes: coreFeature,
    featureChallenges: coreFeature,
    featureMarketingCampaigns: coreFeature,
    featureMarketingAutomation: coreFeature,
    featureAiRecommendations: coreFeature,
    featureRfmSegmentation: coreFeature,
    featureProgramImpact: coreFeature,
    featureRealtimeAnalytics: coreFeature,
    featureCohortAnalysis: coreFeature,
    limitMaxTiers: limits.tiers,
    limitMaxOrders: limits.orders,
    limitMaxEmails: limits.emails,
    limitMaxAutomations: limits.automations,
    limitMaxCustomersSync: limits.customersSync,
    limitMaxTierProducts: limits.tierProducts,
    limitMaxHistoricalDays: limits.historicalDataDays,
    limitMaxActiveRaffles: limits.activeRaffles,
    limitMaxActiveMysteryBoxes: limits.activeMysteryBoxes,
    limitMaxActiveChallenges: limits.activeChallenges,
    limitMaxCampaigns: limits.campaigns,
    limitMaxAutomationFlows: limits.automationFlows,
  };
}

export function entitlementValuesForPlan(
  planName: string | null | undefined,
): PlanEntitlementValues {
  return entitlementValuesForPlanKey(getPlanKey(planName));
}

/**
 * Strict resolution is used for active paid records and migration input so a
 * new or misspelled paid identifier can never silently downgrade to Free.
 */
export function entitlementValuesForKnownPlan(
  planName: string,
): PlanEntitlementValues {
  return entitlementValuesForPlanKey(requireKnownPlanKey(planName));
}
