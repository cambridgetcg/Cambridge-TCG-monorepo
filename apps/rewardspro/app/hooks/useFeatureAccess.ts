/**
 * Feature Access Hooks
 *
 * Client-side React hooks for checking feature access in UI components.
 * Consumes feature access data from loaders.
 */

import { useMemo } from "react";
import { useRouteLoaderData, useMatches } from "@remix-run/react";
import { Feature, type PlanTier } from "~/constants/features";

// ============================================================================
// Types
// ============================================================================

export interface FeatureAccessData {
  currentPlan: PlanTier;
  features: Feature[];
  featureAccess?: Record<string, boolean>;
}

export interface FeatureAccessHookResult {
  hasAccess: boolean;
  currentPlan: PlanTier;
  requiresUpgrade: boolean;
  upgradeUrl: string;
}

// ============================================================================
// Feature Access Hook
// ============================================================================

/**
 * Check if the current shop has access to a specific feature
 *
 * Requires loader to provide feature access data via `featureAccess` key.
 *
 * @param feature - Feature to check access for
 * @param routeId - Optional route ID to get data from (defaults to current route)
 * @returns Feature access information
 *
 * @example
 * // In loader
 * export async function loader({ request }: LoaderFunctionArgs) {
 *   const { session } = await authenticate.admin(request);
 *   const features = await checkMultipleFeatures(session.shop, [
 *     Feature.EXPORT_DATA,
 *     Feature.ADVANCED_ANALYTICS
 *   ]);
 *
 *   return json({
 *     featureAccess: {
 *       [Feature.EXPORT_DATA]: features.get(Feature.EXPORT_DATA) || false,
 *       [Feature.ADVANCED_ANALYTICS]: features.get(Feature.ADVANCED_ANALYTICS) || false,
 *     },
 *     currentPlan: await getCurrentPlanTier(session.shop)
 *   });
 * }
 *
 * // In component
 * function MyComponent() {
 *   const exportAccess = useFeatureAccess(Feature.EXPORT_DATA);
 *
 *   if (!exportAccess.hasAccess) {
 *     return <UpgradePrompt feature={Feature.EXPORT_DATA} />;
 *   }
 *
 *   return <ExportButton />;
 * }
 */
export function useFeatureAccess(
  feature: Feature,
  routeId?: string
): FeatureAccessHookResult {
  const matches = useMatches();
  const routeData = routeId ? useRouteLoaderData(routeId) : null;

  // Get feature access data from loader
  const featureData = useMemo(() => {
    // If specific route ID provided, use that data
    if (routeData && typeof routeData === 'object' && 'featureAccess' in routeData) {
      return routeData as unknown as FeatureAccessData;
    }

    // Otherwise, search through route matches for feature access data
    for (const match of [...matches].reverse()) {
      const data = match.data;
      if (data && typeof data === 'object' && 'featureAccess' in data) {
        return data as unknown as FeatureAccessData;
      }
    }

    return null;
  }, [matches, routeData]);

  // Determine access
  const hasAccess = useMemo(() => {
    if (!featureData?.featureAccess) {
      // No feature data available - deny access by default
      return false;
    }

    return featureData.featureAccess[feature] === true;
  }, [featureData, feature]);

  return {
    hasAccess,
    currentPlan: featureData?.currentPlan || 'free',
    requiresUpgrade: !hasAccess,
    upgradeUrl: '/app/billing/plans',
  };
}

/**
 * Check access to multiple features at once
 *
 * @param features - Array of features to check
 * @param routeId - Optional route ID to get data from
 * @returns Map of feature to access status
 *
 * @example
 * function MyComponent() {
 *   const access = useMultipleFeatures([
 *     Feature.EXPORT_DATA,
 *     Feature.ADVANCED_ANALYTICS,
 *     Feature.API_ACCESS
 *   ]);
 *
 *   return (
 *     <>
 *       {access.get(Feature.EXPORT_DATA)?.hasAccess && <ExportButton />}
 *       {access.get(Feature.ADVANCED_ANALYTICS)?.hasAccess && <AnalyticsDashboard />}
 *       {access.get(Feature.API_ACCESS)?.hasAccess && <ApiKeySection />}
 *     </>
 *   );
 * }
 */
export function useMultipleFeatures(
  features: Feature[],
  routeId?: string
): Map<Feature, FeatureAccessHookResult> {
  const results = new Map<Feature, FeatureAccessHookResult>();

  features.forEach(feature => {
    results.set(feature, useFeatureAccess(feature, routeId));
  });

  return results;
}

/**
 * Get the current plan tier from loader data
 *
 * @param routeId - Optional route ID to get data from
 * @returns Current plan tier
 *
 * @example
 * function MyComponent() {
 *   const currentPlan = useCurrentPlan();
 *
 *   return <Text as="p">You are on the {currentPlan} plan</Text>;
 * }
 */
export function useCurrentPlan(routeId?: string): PlanTier {
  const matches = useMatches();
  const routeData = routeId ? useRouteLoaderData(routeId) : null;

  return useMemo(() => {
    // If specific route ID provided, use that data
    if (routeData && typeof routeData === 'object' && 'currentPlan' in routeData) {
      return (routeData as FeatureAccessData).currentPlan || 'free';
    }

    // Otherwise, search through route matches
    for (const match of [...matches].reverse()) {
      const data = match.data;
      if (data && typeof data === 'object' && 'currentPlan' in data) {
        return (data as FeatureAccessData).currentPlan || 'free';
      }
    }

    return 'free';
  }, [matches, routeData]);
}

/**
 * Get all available features for the current plan
 *
 * @param routeId - Optional route ID to get data from
 * @returns Array of available features
 *
 * @example
 * function MyComponent() {
 *   const availableFeatures = useAvailableFeatures();
 *
 *   return (
 *     <List>
 *       {availableFeatures.map(feature => (
 *         <List.Item key={feature}>{feature}</List.Item>
 *       ))}
 *     </List>
 *   );
 * }
 */
export function useAvailableFeatures(routeId?: string): Feature[] {
  const matches = useMatches();
  const routeData = routeId ? useRouteLoaderData(routeId) : null;

  return useMemo(() => {
    // If specific route ID provided, use that data
    if (routeData && typeof routeData === 'object' && 'features' in routeData) {
      return (routeData as FeatureAccessData).features || [];
    }

    // Otherwise, search through route matches
    for (const match of [...matches].reverse()) {
      const data = match.data;
      if (data && typeof data === 'object' && 'features' in data) {
        return (data as FeatureAccessData).features || [];
      }
    }

    return [];
  }, [matches, routeData]);
}

/**
 * Check if the current plan is at least the specified tier
 *
 * @param minimumTier - Minimum required tier
 * @param routeId - Optional route ID to get data from
 * @returns True if current plan is at or above minimum tier
 *
 * @example
 * function MyComponent() {
 *   const isProOrHigher = useMinimumPlan('pro');
 *
 *   if (!isProOrHigher) {
 *     return <UpgradeBanner minimumPlan="pro" />;
 *   }
 *
 *   return <ProFeatures />;
 * }
 */
export function useMinimumPlan(minimumTier: PlanTier, routeId?: string): boolean {
  const currentPlan = useCurrentPlan(routeId);

  return useMemo(() => {
    const tierHierarchy: PlanTier[] = ['free', 'pro', 'max', 'ultra', 'enterprise'];
    const currentIndex = tierHierarchy.indexOf(currentPlan);
    const minimumIndex = tierHierarchy.indexOf(minimumTier);

    return currentIndex >= minimumIndex;
  }, [currentPlan, minimumTier]);
}
