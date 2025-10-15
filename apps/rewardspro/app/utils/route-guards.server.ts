/**
 * Route Guards
 *
 * Utilities for protecting routes with feature access checks.
 * Used in loaders to redirect or show upgrade prompts for premium features.
 */

import { redirect } from "@remix-run/node";
import { Feature, type PlanTier } from "~/constants/features";
import {
  hasFeatureAccess,
  getFeatureAccessInfo,
  type FeatureAccessResult,
} from "~/services/feature-access.server";

// ============================================================================
// Types
// ============================================================================

export interface RouteGuardOptions {
  /**
   * Feature required to access this route
   */
  feature: Feature;

  /**
   * Human-readable feature name for error messages
   */
  featureName?: string;

  /**
   * Redirect to this URL if access denied (default: '/app/billing/plans')
   */
  redirectTo?: string;

  /**
   * Custom error message
   */
  errorMessage?: string;

  /**
   * If true, return access info instead of redirecting (for showing upgrade prompts)
   */
  softFail?: boolean;
}

export interface RouteGuardResult {
  hasAccess: boolean;
  accessInfo?: FeatureAccessResult;
  redirectUrl?: string;
}

// ============================================================================
// Route Guard Functions
// ============================================================================

/**
 * Guard a route with feature access check
 *
 * By default, redirects to billing page if access denied.
 * Use softFail: true to return access info instead (for showing upgrade prompts).
 *
 * @param shop - Shop domain
 * @param options - Route guard configuration
 * @returns Route guard result
 * @throws Redirect response if access denied and softFail is false
 *
 * @example
 * // Hard fail - redirect to billing page
 * export async function loader({ request }: LoaderFunctionArgs) {
 *   const { session } = await authenticate.admin(request);
 *   await guardRoute(session.shop, {
 *     feature: Feature.EXPORT_DATA,
 *     featureName: 'Data Export'
 *   });
 *   // ... rest of loader
 * }
 *
 * @example
 * // Soft fail - show upgrade prompt in UI
 * export async function loader({ request }: LoaderFunctionArgs) {
 *   const { session } = await authenticate.admin(request);
 *   const guard = await guardRoute(session.shop, {
 *     feature: Feature.API_ACCESS,
 *     softFail: true
 *   });
 *
 *   return json({
 *     hasAccess: guard.hasAccess,
 *     accessInfo: guard.accessInfo
 *   });
 * }
 */
export async function guardRoute(
  shop: string,
  options: RouteGuardOptions
): Promise<RouteGuardResult> {
  const {
    feature,
    featureName,
    redirectTo = '/app/billing/plans',
    errorMessage,
    softFail = false,
  } = options;

  // Get detailed access info
  const accessInfo = await getFeatureAccessInfo(shop, feature);

  // Access granted
  if (accessInfo.hasAccess) {
    return {
      hasAccess: true,
    };
  }

  // Access denied - soft fail (return info for UI)
  if (softFail) {
    return {
      hasAccess: false,
      accessInfo,
    };
  }

  // Access denied - hard fail (redirect)
  const displayName = featureName || accessInfo.featureName;
  const message = errorMessage || `${displayName} requires ${accessInfo.requiredPlan.toUpperCase()} plan`;

  throw redirect(
    `${redirectTo}?upgrade=${accessInfo.requiredPlan}&feature=${encodeURIComponent(displayName)}&message=${encodeURIComponent(message)}`
  );
}

/**
 * Guard multiple routes/features at once
 *
 * Useful for pages that require multiple features.
 * Returns access info for all features.
 *
 * @param shop - Shop domain
 * @param features - Array of features to check
 * @returns Map of feature to route guard result
 *
 * @example
 * export async function loader({ request }: LoaderFunctionArgs) {
 *   const { session } = await authenticate.admin(request);
 *   const guards = await guardMultipleRoutes(session.shop, [
 *     Feature.EXPORT_DATA,
 *     Feature.ADVANCED_ANALYTICS
 *   ]);
 *
 *   return json({
 *     canExport: guards.get(Feature.EXPORT_DATA)?.hasAccess,
 *     canViewAnalytics: guards.get(Feature.ADVANCED_ANALYTICS)?.hasAccess,
 *   });
 * }
 */
export async function guardMultipleRoutes(
  shop: string,
  features: Feature[]
): Promise<Map<Feature, RouteGuardResult>> {
  const results = new Map<Feature, RouteGuardResult>();

  // Check all features
  for (const feature of features) {
    const accessInfo = await getFeatureAccessInfo(shop, feature);
    results.set(feature, {
      hasAccess: accessInfo.hasAccess,
      accessInfo,
    });
  }

  return results;
}

/**
 * Create a reusable route guard for a specific feature
 *
 * Returns a function that can be called in loaders without specifying the feature again.
 *
 * @param feature - Feature to guard
 * @param featureName - Optional feature name
 * @returns Guard function
 *
 * @example
 * // Create guard at module level
 * const guardDataExport = createFeatureGuard(Feature.EXPORT_DATA, 'Data Export');
 *
 * // Use in loader
 * export async function loader({ request }: LoaderFunctionArgs) {
 *   const { session } = await authenticate.admin(request);
 *   await guardDataExport(session.shop);
 *   // ... rest of loader
 * }
 */
export function createFeatureGuard(
  feature: Feature,
  featureName?: string
): (shop: string, softFail?: boolean) => Promise<RouteGuardResult> {
  return async (shop: string, softFail = false) => {
    return guardRoute(shop, {
      feature,
      featureName,
      softFail,
    });
  };
}

// ============================================================================
// Predefined Guards for Common Features
// ============================================================================

/**
 * Guard for data export routes
 *
 * @example
 * export async function loader({ request }: LoaderFunctionArgs) {
 *   const { session } = await authenticate.admin(request);
 *   await guardDataExport(session.shop);
 *   // ... export logic
 * }
 */
export const guardDataExport = createFeatureGuard(
  Feature.EXPORT_DATA,
  'Data Export'
);

/**
 * Guard for advanced analytics routes
 */
export const guardAdvancedAnalytics = createFeatureGuard(
  Feature.ADVANCED_ANALYTICS,
  'Advanced Analytics'
);

/**
 * Guard for API access routes
 */
export const guardApiAccess = createFeatureGuard(
  Feature.API_ACCESS,
  'API Access'
);

/**
 * Guard for tier membership routes
 */
export const guardTierMemberships = createFeatureGuard(
  Feature.TIER_MEMBERSHIPS,
  'Tier Membership Products'
);

/**
 * Guard for custom branding routes
 */
export const guardCustomBranding = createFeatureGuard(
  Feature.CUSTOM_BRANDING,
  'Custom Branding'
);

/**
 * Guard for webhook configuration routes
 */
export const guardWebhooks = createFeatureGuard(
  Feature.WEBHOOKS,
  'Webhooks'
);

/**
 * Guard for A/B testing routes
 */
export const guardAbTesting = createFeatureGuard(
  Feature.AB_TESTING,
  'A/B Testing'
);

// ============================================================================
// Plan Tier Guards
// ============================================================================

/**
 * Require minimum plan tier for a route
 *
 * @param shop - Shop domain
 * @param minimumTier - Minimum required tier
 * @param options - Guard options
 * @throws Redirect if shop is below minimum tier
 *
 * @example
 * export async function loader({ request }: LoaderFunctionArgs) {
 *   const { session } = await authenticate.admin(request);
 *   await requireMinimumPlan(session.shop, 'pro', {
 *     featureName: 'Pro Features'
 *   });
 *   // ... rest of loader
 * }
 */
export async function requireMinimumPlan(
  shop: string,
  minimumTier: PlanTier,
  options: {
    featureName?: string;
    redirectTo?: string;
    softFail?: boolean;
  } = {}
): Promise<RouteGuardResult> {
  const { featureName = 'This feature', redirectTo = '/app/billing/plans', softFail = false } = options;

  // Get current plan from feature access service
  const { getCurrentPlanTier } = await import("~/services/feature-access.server");
  const currentTier = await getCurrentPlanTier(shop);

  const tierHierarchy: PlanTier[] = ['free', 'pro', 'max', 'ultra', 'enterprise'];
  const currentIndex = tierHierarchy.indexOf(currentTier);
  const minimumIndex = tierHierarchy.indexOf(minimumTier);

  const hasAccess = currentIndex >= minimumIndex;

  // Access granted
  if (hasAccess) {
    return {
      hasAccess: true,
    };
  }

  // Access denied - soft fail
  if (softFail) {
    return {
      hasAccess: false,
      redirectUrl: redirectTo,
    };
  }

  // Access denied - hard fail (redirect)
  const message = `${featureName} requires ${minimumTier.toUpperCase()} plan or higher`;

  throw redirect(
    `${redirectTo}?upgrade=${minimumTier}&message=${encodeURIComponent(message)}`
  );
}
