/**
 * Entitlements Admin API Endpoint
 *
 * Internal endpoint for viewing and managing shop entitlements.
 * Protected by admin authentication.
 *
 * GET /api/admin/entitlements
 * - Returns current entitlements for the authenticated shop
 * - Query params: shop (optional, for admin override)
 *
 * POST /api/admin/entitlements
 * - Actions: refresh, verify, audit
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  getEntitlements,
  refreshEntitlements,
  hasFeature,
  getLimit,
  type FeatureKey,
  type LimitKey,
} from "~/services/entitlements.server";
import db from "~/db.server";

// All feature keys for verification
const ALL_FEATURES: FeatureKey[] = [
  // Core features
  'apiAccess',
  'webhooks',
  'whiteLabel',
  'advancedReport',
  'customEmail',
  'annualEval',
  'bulkOps',
  'customBranding',
  'prioritySupport',
  'subscriptionTiers',
  'purchasableTiers',
  'exportData',
  'customRewards',
  // Integration features (P1)
  'integrationKlaviyo',
  'integrationSendgrid',
  'integrationJudgeme',
  'integrationSlack',
  'integrationRecharge',
  'integrationGorgias',
  'integrationZapier',
  // Gamification features (P2)
  'raffles',
  'mysteryBoxes',
  'challenges',
  // Marketing features (P3)
  'marketingCampaigns',
  'marketingAutomation',
  'aiRecommendations',
  // Analytics features (P4)
  'rfmSegmentation',
  'programImpact',
  'realtimeAnalytics',
  'cohortAnalysis',
];

// All limit keys for verification
const ALL_LIMITS: LimitKey[] = [
  // Core limits
  'maxTiers',
  'maxOrders',
  'maxEmails',
  // Synced limits (P0)
  'maxAutomations',
  'maxCustomersSync',
  'maxTierProducts',
  'maxHistoricalDays',
  // Gamification limits (P2)
  'maxActiveRaffles',
  'maxActiveMysteryBoxes',
  'maxActiveChallenges',
  // Marketing limits (P3)
  'maxCampaigns',
  'maxAutomationFlows',
];

export async function loader({ request }: LoaderFunctionArgs) {
  // Authenticate admin request
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const entitlements = await getEntitlements(shop);

    // Build feature access map
    const features: Record<string, boolean> = {};
    for (const feature of ALL_FEATURES) {
      features[feature] = await hasFeature(shop, feature);
    }

    // Build limits map
    const limits: Record<string, number> = {};
    for (const limit of ALL_LIMITS) {
      limits[limit] = await getLimit(shop, limit);
    }

    // Get current usage for comparison
    const [
      tierCount,
      tierProductCount,
      automationCount,
      activeRaffleCount,
      activeMysteryBoxCount,
    ] = await Promise.all([
      db.tier.count({ where: { shop } }),
      db.tierProduct.count({ where: { shop } }),
      db.emailAutomation?.count({ where: { shop } }) ?? Promise.resolve(0),
      // Active raffles (ACTIVE or UPCOMING status)
      db.raffle?.count({
        where: { shop, status: { in: ['ACTIVE', 'UPCOMING'] } },
      }) ?? Promise.resolve(0),
      // Active mystery boxes (isActive = true)
      db.mysteryBox?.count({
        where: { shop, isActive: true },
      }) ?? Promise.resolve(0),
    ]);

    return json({
      success: true,
      shop,
      entitlements: {
        effectivePlan: entitlements.effectivePlan,
        planSource: entitlements.planSource,
        hasOverride: entitlements.hasOverride,
        overrideExpiry: entitlements.overrideExpiry,
        lastResolvedAt: entitlements.lastResolvedAt,
      },
      features,
      limits,
      currentUsage: {
        tiers: tierCount,
        tierProducts: tierProductCount,
        automations: automationCount,
        activeRaffles: activeRaffleCount,
        activeMysteryBoxes: activeMysteryBoxCount,
      },
      withinLimits: {
        tiers: tierCount < limits.maxTiers,
        tierProducts: tierProductCount < limits.maxTierProducts,
        automations: automationCount < limits.maxAutomations,
        activeRaffles: activeRaffleCount < limits.maxActiveRaffles,
        activeMysteryBoxes: activeMysteryBoxCount < limits.maxActiveMysteryBoxes,
      },
    });
  } catch {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  // Authenticate admin request
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const formData = await request.formData();
    const intent = formData.get("intent");

    switch (intent) {
      case "refresh": {
        // Refresh entitlements from subscription state
        const refreshed = await refreshEntitlements(shop);
        return json({
          success: true,
          message: "Entitlements refreshed",
          entitlements: {
            effectivePlan: refreshed.effectivePlan,
            planSource: refreshed.planSource,
          },
        });
      }

      case "verify": {
        // Verify all features and limits
        const entitlements = await getEntitlements(shop);
        const issues: string[] = [];

        // Check for missing columns (would indicate migration not run)
        const rawEntitlements = await db.shopEntitlements.findUnique({
          where: { shop },
        });

        if (rawEntitlements) {
          // Check P0 limits exist
          if (!('limitMaxAutomations' in rawEntitlements)) {
            issues.push('Missing limitMaxAutomations - P0 migration not applied');
          }
          if (!('limitMaxCustomersSync' in rawEntitlements)) {
            issues.push('Missing limitMaxCustomersSync - P0 migration not applied');
          }
          if (!('limitMaxTierProducts' in rawEntitlements)) {
            issues.push('Missing limitMaxTierProducts - P0 migration not applied');
          }
          if (!('limitMaxHistoricalDays' in rawEntitlements)) {
            issues.push('Missing limitMaxHistoricalDays - P0 migration not applied');
          }

          // Check P1 integration flags exist
          if (!('featureIntegrationKlaviyo' in rawEntitlements)) {
            issues.push('Missing integration feature flags - P1 migration not applied');
          }

          // Check P2 gamification features exist
          if (!('featureRaffles' in rawEntitlements)) {
            issues.push('Missing featureRaffles - P2 migration not applied');
          }
          if (!('limitMaxActiveRaffles' in rawEntitlements)) {
            issues.push('Missing limitMaxActiveRaffles - P2 migration not applied');
          }

          // Check P3 marketing features exist
          if (!('featureMarketingCampaigns' in rawEntitlements)) {
            issues.push('Missing featureMarketingCampaigns - P3 migration not applied');
          }
          if (!('limitMaxCampaigns' in rawEntitlements)) {
            issues.push('Missing limitMaxCampaigns - P3 migration not applied');
          }

          // Check P4 analytics features exist
          if (!('featureRfmSegmentation' in rawEntitlements)) {
            issues.push('Missing featureRfmSegmentation - P4 migration not applied');
          }
          if (!('featureCohortAnalysis' in rawEntitlements)) {
            issues.push('Missing featureCohortAnalysis - P4 migration not applied');
          }
        }

        return json({
          success: issues.length === 0,
          message: issues.length === 0 ? "All entitlements verified" : "Issues found",
          issues,
          effectivePlan: entitlements.effectivePlan,
        });
      }

      case "audit": {
        // Audit all shops for entitlement issues
        const allShops = await db.shopEntitlements.findMany({
          select: {
            shop: true,
            effectivePlan: true,
            planSource: true,
            hasOverride: true,
          },
        });

        const summary = {
          total: allShops.length,
          byPlan: {} as Record<string, number>,
          bySource: {} as Record<string, number>,
          withOverride: 0,
        };

        for (const s of allShops) {
          summary.byPlan[s.effectivePlan] = (summary.byPlan[s.effectivePlan] || 0) + 1;
          summary.bySource[s.planSource] = (summary.bySource[s.planSource] || 0) + 1;
          if (s.hasOverride) summary.withOverride++;
        }

        return json({
          success: true,
          audit: summary,
        });
      }

      default:
        return json({ error: "Unknown intent" }, { status: 400 });
    }
  } catch {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
}
