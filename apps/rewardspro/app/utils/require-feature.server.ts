/**
 * Server-Side Feature Requirement Utilities
 *
 * Use these functions in actions and loaders to enforce feature access
 * before processing requests. This ensures server-side security even if
 * UI checks are bypassed.
 *
 * Usage:
 * ```typescript
 * // In an action or loader:
 * export async function action({ request }: ActionFunctionArgs) {
 *   const { session } = await authenticate.admin(request);
 *
 *   // Require a specific feature
 *   await requireFeatureAccess(session.shop, 'apiAccess');
 *
 *   // Or require within a limit
 *   const tierCount = await getTierCount(session.shop);
 *   await requireWithinLimitAccess(session.shop, 'maxTiers', tierCount);
 *
 *   // Process the request...
 * }
 * ```
 */

import { json } from "@remix-run/node";
import {
  hasFeature,
  getLimit,
  getEffectivePlan,
  FeatureNotAvailableError,
  LimitExceededError,
  type FeatureKey,
  type LimitKey,
} from "~/services/entitlements.server";
import { getRequiredPlan } from "~/utils/plan-limits";

// Re-export types for convenience
export type { FeatureKey, LimitKey };

/**
 * Require a feature or throw a JSON error response
 * Use this in actions/loaders for clean error handling
 */
export async function requireFeatureAccess(
  shop: string,
  feature: FeatureKey
): Promise<void> {
  const hasAccess = await hasFeature(shop, feature);

  if (!hasAccess) {
    const currentPlan = await getEffectivePlan(shop);
    const requiredPlan = getFeatureRequiredPlan(feature);

    throw json(
      {
        error: 'Feature not available',
        code: 'FEATURE_NOT_AVAILABLE',
        feature,
        currentPlan,
        requiredPlan,
        message: `The "${formatFeatureName(feature)}" feature requires the ${requiredPlan} plan or higher.`,
      },
      {
        status: 403,
        statusText: 'Forbidden',
      }
    );
  }
}

/**
 * Require usage to be within plan limits or throw a JSON error response
 */
export async function requireWithinLimitAccess(
  shop: string,
  limit: LimitKey,
  currentCount: number
): Promise<void> {
  const maxLimit = await getLimit(shop, limit);

  // 999999 is effectively unlimited
  if (maxLimit < 999999 && currentCount >= maxLimit) {
    const currentPlan = await getEffectivePlan(shop);

    throw json(
      {
        error: 'Limit exceeded',
        code: 'LIMIT_EXCEEDED',
        limit,
        currentCount,
        maxLimit,
        currentPlan,
        message: `You have reached the ${formatLimitName(limit)} limit (${currentCount}/${maxLimit}) for the ${currentPlan} plan. Please upgrade to increase your limit.`,
      },
      {
        status: 403,
        statusText: 'Forbidden',
      }
    );
  }
}

/**
 * Check feature access without throwing
 * Returns { hasAccess: boolean, error?: object }
 */
export async function checkFeatureAccess(
  shop: string,
  feature: FeatureKey
): Promise<{
  hasAccess: boolean;
  error?: {
    feature: FeatureKey;
    currentPlan: string;
    requiredPlan: string;
    message: string;
  };
}> {
  const hasAccess = await hasFeature(shop, feature);

  if (!hasAccess) {
    const currentPlan = await getEffectivePlan(shop);
    const requiredPlan = getFeatureRequiredPlan(feature);

    return {
      hasAccess: false,
      error: {
        feature,
        currentPlan,
        requiredPlan,
        message: `The "${formatFeatureName(feature)}" feature requires the ${requiredPlan} plan or higher.`,
      },
    };
  }

  return { hasAccess: true };
}

/**
 * Check limit access without throwing
 * Returns { hasAccess: boolean, error?: object }
 */
export async function checkLimitAccess(
  shop: string,
  limit: LimitKey,
  currentCount: number
): Promise<{
  hasAccess: boolean;
  error?: {
    limit: LimitKey;
    currentCount: number;
    maxLimit: number;
    currentPlan: string;
    message: string;
  };
}> {
  const maxLimit = await getLimit(shop, limit);

  if (maxLimit < 999999 && currentCount >= maxLimit) {
    const currentPlan = await getEffectivePlan(shop);

    return {
      hasAccess: false,
      error: {
        limit,
        currentCount,
        maxLimit,
        currentPlan,
        message: `You have reached the ${formatLimitName(limit)} limit (${currentCount}/${maxLimit}) for the ${currentPlan} plan.`,
      },
    };
  }

  return { hasAccess: true };
}

/**
 * Create a feature guard function for reuse
 */
export function createFeatureGuard(feature: FeatureKey) {
  return async (shop: string) => {
    await requireFeatureAccess(shop, feature);
  };
}

/**
 * Create a limit guard function for reuse
 */
export function createLimitGuard(limit: LimitKey) {
  return async (shop: string, currentCount: number) => {
    await requireWithinLimitAccess(shop, limit, currentCount);
  };
}

// Pre-built guards for common features
export const requireApiAccess = createFeatureGuard('apiAccess');
export const requireWebhooks = createFeatureGuard('webhooks');
export const requireWhiteLabel = createFeatureGuard('whiteLabel');
export const requireAdvancedReport = createFeatureGuard('advancedReport');
export const requireCustomEmail = createFeatureGuard('customEmail');
export const requireBulkOps = createFeatureGuard('bulkOps');
export const requireSubscriptionTiers = createFeatureGuard('subscriptionTiers');
export const requirePurchasableTiers = createFeatureGuard('purchasableTiers');
export const requireExportData = createFeatureGuard('exportData');

// Pre-built guards for integrations (P1)
export const requireIntegrationKlaviyo = createFeatureGuard('integrationKlaviyo');
export const requireIntegrationSendgrid = createFeatureGuard('integrationSendgrid');
export const requireIntegrationJudgeme = createFeatureGuard('integrationJudgeme');
export const requireIntegrationSlack = createFeatureGuard('integrationSlack');
export const requireIntegrationRecharge = createFeatureGuard('integrationRecharge');
export const requireIntegrationGorgias = createFeatureGuard('integrationGorgias');
export const requireIntegrationZapier = createFeatureGuard('integrationZapier');

// Pre-built guards for common limits
export const requireWithinTierLimit = createLimitGuard('maxTiers');
export const requireWithinOrderLimit = createLimitGuard('maxOrders');
export const requireWithinEmailLimit = createLimitGuard('maxEmails');

// Pre-built guards for synced limits (P0)
export const requireWithinAutomationLimit = createLimitGuard('maxAutomations');
export const requireWithinCustomerSyncLimit = createLimitGuard('maxCustomersSync');
export const requireWithinTierProductLimit = createLimitGuard('maxTierProducts');
export const requireWithinHistoricalDaysLimit = createLimitGuard('maxHistoricalDays');

// Pre-built guards for gamification features (P2)
export const requireRaffles = createFeatureGuard('raffles');
export const requireMysteryBoxes = createFeatureGuard('mysteryBoxes');
export const requireChallenges = createFeatureGuard('challenges');

// Pre-built guards for gamification limits (P2)
export const requireWithinActiveRaffleLimit = createLimitGuard('maxActiveRaffles');
export const requireWithinActiveMysteryBoxLimit = createLimitGuard('maxActiveMysteryBoxes');
export const requireWithinActiveChallengeLimit = createLimitGuard('maxActiveChallenges');

// Pre-built guards for marketing features (P3)
export const requireMarketingCampaigns = createFeatureGuard('marketingCampaigns');
export const requireMarketingAutomation = createFeatureGuard('marketingAutomation');
export const requireAiRecommendations = createFeatureGuard('aiRecommendations');

// Pre-built guards for marketing limits (P3)
export const requireWithinCampaignLimit = createLimitGuard('maxCampaigns');
export const requireWithinAutomationFlowLimit = createLimitGuard('maxAutomationFlows');

// Pre-built guards for analytics features (P4)
export const requireRfmSegmentation = createFeatureGuard('rfmSegmentation');
export const requireProgramImpact = createFeatureGuard('programImpact');
export const requireRealtimeAnalytics = createFeatureGuard('realtimeAnalytics');
export const requireCohortAnalysis = createFeatureGuard('cohortAnalysis');

// Helper: Format feature name for user-friendly messages
function formatFeatureName(feature: FeatureKey): string {
  const names: Record<FeatureKey, string> = {
    // Core features
    apiAccess: 'API Access',
    webhooks: 'Webhook Integrations',
    whiteLabel: 'White Label Emails',
    advancedReport: 'Advanced Reporting',
    customEmail: 'Custom Email Settings',
    annualEval: 'Annual Tier Evaluation',
    bulkOps: 'Bulk Operations',
    customBranding: 'Custom Branding',
    prioritySupport: 'Priority Support',
    subscriptionTiers: 'Subscription Tiers',
    purchasableTiers: 'Purchasable Tiers',
    exportData: 'Data Export',
    customRewards: 'Custom Rewards',
    // Integration features (P1)
    integrationKlaviyo: 'Klaviyo Integration',
    integrationSendgrid: 'SendGrid Integration',
    integrationJudgeme: 'Judge.me Integration',
    integrationSlack: 'Slack Integration',
    integrationRecharge: 'Recharge Integration',
    integrationGorgias: 'Gorgias Integration',
    integrationZapier: 'Zapier Integration',
    // Gamification features (P2)
    raffles: 'Raffles',
    mysteryBoxes: 'Mystery Boxes',
    challenges: 'Challenges',
    // Marketing features (P3)
    marketingCampaigns: 'Marketing Campaigns',
    marketingAutomation: 'Marketing Automation',
    aiRecommendations: 'AI Recommendations',
    // Analytics features (P4)
    rfmSegmentation: 'RFM Segmentation',
    programImpact: 'Program Impact Analytics',
    realtimeAnalytics: 'Realtime Analytics',
    cohortAnalysis: 'Cohort Analysis',
  };
  return names[feature] || feature;
}

// Helper: Format limit name for user-friendly messages
function formatLimitName(limit: LimitKey): string {
  const names: Record<LimitKey, string> = {
    // Core limits
    maxTiers: 'tier',
    maxOrders: 'monthly order',
    maxEmails: 'email',
    // Synced limits (P0)
    maxAutomations: 'automation',
    maxCustomersSync: 'customer sync',
    maxTierProducts: 'tier product',
    maxHistoricalDays: 'historical data day',
    // Gamification limits (P2)
    maxActiveRaffles: 'active raffle',
    maxActiveMysteryBoxes: 'active mystery box',
    maxActiveChallenges: 'active challenge',
    // Marketing limits (P3)
    maxCampaigns: 'campaign',
    maxAutomationFlows: 'automation flow',
  };
  return names[limit] || limit;
}

// Helper: Get required plan for a feature
function getFeatureRequiredPlan(feature: FeatureKey): string {
  // Map feature keys to the minimum plan that has them
  const planRequirements: Record<FeatureKey, string> = {
    // Core features
    apiAccess: 'RewardsPro Ultra',
    webhooks: 'RewardsPro Max',
    whiteLabel: 'RewardsPro Max',
    advancedReport: 'RewardsPro Pro',
    customEmail: 'RewardsPro Max',
    annualEval: 'RewardsPro Ultra',
    bulkOps: 'RewardsPro Pro',
    customBranding: 'RewardsPro Max',
    prioritySupport: 'RewardsPro Max',
    subscriptionTiers: 'RewardsPro Pro',
    purchasableTiers: 'RewardsPro Max',
    exportData: 'RewardsPro Pro',
    customRewards: 'RewardsPro Pro',
    // Integration features - Pro tier (P1)
    integrationKlaviyo: 'RewardsPro Pro',
    integrationSendgrid: 'RewardsPro Pro',
    integrationJudgeme: 'RewardsPro Pro',
    integrationSlack: 'RewardsPro Pro',
    // Integration features - Max tier (P1)
    integrationRecharge: 'RewardsPro Max',
    integrationGorgias: 'RewardsPro Max',
    integrationZapier: 'RewardsPro Max',
    // Gamification features (P2)
    raffles: 'RewardsPro Pro',
    mysteryBoxes: 'RewardsPro Max',
    challenges: 'RewardsPro Pro',
    // Marketing features (P3)
    marketingCampaigns: 'RewardsPro Pro',
    marketingAutomation: 'RewardsPro Max',
    aiRecommendations: 'RewardsPro Max',
    // Analytics features (P4)
    rfmSegmentation: 'RewardsPro Max',
    programImpact: 'RewardsPro Pro',
    realtimeAnalytics: 'RewardsPro Max',
    cohortAnalysis: 'RewardsPro Ultra',
  };
  return planRequirements[feature] || 'RewardsPro Pro';
}

/**
 * Error handler for entitlement errors
 * Use in catch blocks to convert errors to JSON responses
 */
export function handleEntitlementError(error: unknown) {
  if (error instanceof FeatureNotAvailableError) {
    return json(
      {
        error: 'Feature not available',
        code: 'FEATURE_NOT_AVAILABLE',
        feature: error.feature,
        currentPlan: error.currentPlan,
        requiredPlan: error.requiredPlan,
        message: error.message,
      },
      { status: 403 }
    );
  }

  if (error instanceof LimitExceededError) {
    return json(
      {
        error: 'Limit exceeded',
        code: 'LIMIT_EXCEEDED',
        limit: error.limit,
        currentCount: error.currentCount,
        maxLimit: error.maxLimit,
        currentPlan: error.currentPlan,
        message: error.message,
      },
      { status: 403 }
    );
  }

  // Re-throw unknown errors
  throw error;
}
