/**
 * Feature Access Service
 *
 * Server-side service for checking feature access permissions based on plan tiers.
 * Used in loaders and actions to enforce feature gating.
 */

import { json } from "@remix-run/node";
import { db } from "~/db.server";
import {
  Feature,
  type PlanTier,
  getPlanTier,
  hasFeature as checkFeature,
  getMinimumPlanForFeature,
  getFeatureMetadata,
} from "~/constants/features";

// ============================================================================
// Types
// ============================================================================

export interface FeatureAccessResult {
  hasAccess: boolean;
  currentPlan: PlanTier;
  requiredPlan: PlanTier;
  feature: Feature;
  featureName: string;
  upgradeUrl: string;
}

// ============================================================================
// Core Permission Functions
// ============================================================================

/**
 * Check if a shop has access to a specific feature
 *
 * @param shop - Shop domain (e.g., 'example.myshopify.com')
 * @param feature - Feature to check access for
 * @returns True if shop has access, false otherwise
 *
 * @example
 * const canExport = await hasFeatureAccess(session.shop, Feature.EXPORT_DATA);
 * if (!canExport) {
 *   return json({ error: 'Upgrade to Pro to export data' }, { status: 403 });
 * }
 */
export async function hasFeatureAccess(
  shop: string,
  feature: Feature
): Promise<boolean> {
  try {
    // Get shop settings to determine current plan
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop },
      select: { currentPlan: true },
    });

    // Default to free plan if not found
    const planName = shopSettings?.currentPlan || null;
    const currentTier = getPlanTier(planName);

    // Check if current tier has the feature
    return checkFeature(currentTier, feature);
  } catch (error) {
    console.error(`[FeatureAccess] Error checking feature access for ${shop}:`, error);
    // Fail closed - deny access on error
    return false;
  }
}

/**
 * Get detailed feature access information for a shop
 *
 * @param shop - Shop domain
 * @param feature - Feature to check
 * @returns Detailed access information including current plan, required plan, etc.
 *
 * @example
 * const accessInfo = await getFeatureAccessInfo(session.shop, Feature.API_ACCESS);
 * if (!accessInfo.hasAccess) {
 *   return json({
 *     error: `${accessInfo.featureName} requires ${accessInfo.requiredPlan} plan`,
 *     upgradeUrl: accessInfo.upgradeUrl
 *   }, { status: 403 });
 * }
 */
export async function getFeatureAccessInfo(
  shop: string,
  feature: Feature
): Promise<FeatureAccessResult> {
  try {
    // Get shop settings
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop },
      select: { currentPlan: true },
    });

    const planName = shopSettings?.currentPlan || null;
    const currentTier = getPlanTier(planName);
    const hasAccess = checkFeature(currentTier, feature);
    const requiredPlan = getMinimumPlanForFeature(feature);
    const metadata = getFeatureMetadata(feature);

    return {
      hasAccess,
      currentPlan: currentTier,
      requiredPlan,
      feature,
      featureName: metadata.name,
      upgradeUrl: '/app/billing/plans',
    };
  } catch (error) {
    console.error(`[FeatureAccess] Error getting feature info for ${shop}:`, error);

    // Return safe defaults on error
    const metadata = getFeatureMetadata(feature);
    return {
      hasAccess: false,
      currentPlan: 'free',
      requiredPlan: getMinimumPlanForFeature(feature),
      feature,
      featureName: metadata.name,
      upgradeUrl: '/app/billing/plans',
    };
  }
}

/**
 * Require feature access or throw a 403 JSON response
 *
 * @param shop - Shop domain
 * @param feature - Feature to require
 * @param featureName - Optional human-readable feature name for error message
 * @throws JSON response with 403 status if access denied
 *
 * @example
 * export async function loader({ request }: LoaderFunctionArgs) {
 *   const { session } = await authenticate.admin(request);
 *   await requireFeatureAccess(session.shop, Feature.EXPORT_DATA, 'Data Export');
 *   // ... rest of loader
 * }
 */
export async function requireFeatureAccess(
  shop: string,
  feature: Feature,
  featureName?: string
): Promise<void> {
  const accessInfo = await getFeatureAccessInfo(shop, feature);

  if (!accessInfo.hasAccess) {
    const displayName = featureName || accessInfo.featureName;
    throw json(
      {
        error: 'Feature not available',
        message: `${displayName} is only available on the ${accessInfo.requiredPlan.toUpperCase()} plan or higher.`,
        feature: accessInfo.feature,
        currentPlan: accessInfo.currentPlan,
        requiredPlan: accessInfo.requiredPlan,
        upgradeUrl: accessInfo.upgradeUrl,
      },
      { status: 403 }
    );
  }
}

/**
 * Check multiple features at once
 *
 * @param shop - Shop domain
 * @param features - Array of features to check
 * @returns Map of feature to boolean access status
 *
 * @example
 * const access = await checkMultipleFeatures(session.shop, [
 *   Feature.EXPORT_DATA,
 *   Feature.ADVANCED_ANALYTICS,
 *   Feature.API_ACCESS
 * ]);
 *
 * return json({
 *   canExport: access.get(Feature.EXPORT_DATA),
 *   canViewAnalytics: access.get(Feature.ADVANCED_ANALYTICS),
 *   hasApiAccess: access.get(Feature.API_ACCESS),
 * });
 */
export async function checkMultipleFeatures(
  shop: string,
  features: Feature[]
): Promise<Map<Feature, boolean>> {
  const results = new Map<Feature, boolean>();

  try {
    // Get shop plan once
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop },
      select: { currentPlan: true },
    });

    const planName = shopSettings?.currentPlan || null;
    const currentTier = getPlanTier(planName);

    // Check each feature
    for (const feature of features) {
      results.set(feature, checkFeature(currentTier, feature));
    }
  } catch (error) {
    console.error(`[FeatureAccess] Error checking multiple features for ${shop}:`, error);
    // Fail closed - deny all access on error
    features.forEach(feature => results.set(feature, false));
  }

  return results;
}

/**
 * Get all available features for a shop's current plan
 *
 * @param shop - Shop domain
 * @returns Array of features available to the shop
 *
 * @example
 * const availableFeatures = await getAvailableFeatures(session.shop);
 * return json({ features: availableFeatures });
 */
export async function getAvailableFeatures(shop: string): Promise<Feature[]> {
  try {
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop },
      select: { currentPlan: true },
    });

    const planName = shopSettings?.currentPlan || null;
    const currentTier = getPlanTier(planName);

    // Import here to avoid circular dependency
    const { getPlanFeatures } = await import("~/constants/features");
    return getPlanFeatures(currentTier);
  } catch (error) {
    console.error(`[FeatureAccess] Error getting available features for ${shop}:`, error);
    return []; // Return empty array on error
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get current plan tier for a shop
 *
 * @param shop - Shop domain
 * @returns Current plan tier
 *
 * @example
 * const tier = await getCurrentPlanTier(session.shop);
 * console.log(`Shop is on ${tier} plan`);
 */
export async function getCurrentPlanTier(shop: string): Promise<PlanTier> {
  try {
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop },
      select: { currentPlan: true },
    });

    return getPlanTier(shopSettings?.currentPlan || null);
  } catch (error) {
    console.error(`[FeatureAccess] Error getting plan tier for ${shop}:`, error);
    return 'free'; // Default to free on error
  }
}

/**
 * Check if a shop is on a specific plan tier or higher
 *
 * @param shop - Shop domain
 * @param minimumTier - Minimum required tier
 * @returns True if shop is on minimum tier or higher
 *
 * @example
 * const isPro = await isMinimumPlanTier(session.shop, 'pro');
 * if (isPro) {
 *   // Show pro features
 * }
 */
export async function isMinimumPlanTier(
  shop: string,
  minimumTier: PlanTier
): Promise<boolean> {
  const tierHierarchy: PlanTier[] = ['free', 'pro', 'max', 'ultra', 'enterprise'];
  const currentTier = await getCurrentPlanTier(shop);

  const currentIndex = tierHierarchy.indexOf(currentTier);
  const minimumIndex = tierHierarchy.indexOf(minimumTier);

  return currentIndex >= minimumIndex;
}
