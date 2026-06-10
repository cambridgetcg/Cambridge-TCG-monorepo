/**
 * useAnalytics Hook
 *
 * React hook for GA4 analytics tracking in RewardsPro components.
 * Automatically includes shop context in all events.
 *
 * Usage:
 *   const { trackEvent, trackPageView } = useAnalytics();
 *   trackEvent({ name: 'tier_upgrade', params: { ... } });
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from '@remix-run/react';
import { useRouteLoaderData } from '@remix-run/react';
import type { AppLoaderData } from '~/routes/app';
import type { GA4Event, RewardsProDimensions } from '~/services/analytics/ga4.types';

// ============================================
// Hook Configuration
// ============================================

interface UseAnalyticsOptions {
  /**
   * Enable automatic page view tracking on route changes
   * @default true
   */
  autoTrackPageViews?: boolean;

  /**
   * Page title for page view events
   */
  pageTitle?: string;
}

// ============================================
// Main Hook
// ============================================

export function useAnalytics(options: UseAnalyticsOptions = {}) {
  const { autoTrackPageViews = true, pageTitle } = options;
  const location = useLocation();
  const prevPathRef = useRef<string>('');

  // State for lazy-loaded GA4 module (client-only)
  const [ga4, setGa4] = useState<typeof import('~/services/analytics/ga4.client').ga4 | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);

  // Get app-level data (shop, entitlements, etc.)
  const appData = useRouteLoaderData<AppLoaderData>('routes/app');

  // Build base dimensions for all events
  const baseDimensions: Partial<RewardsProDimensions> = {
    shop_domain: appData?.shop || '',
    current_plan: appData?.currentPlan || '',
    customer_tier: appData?.entitlements?.effectivePlan || undefined,
  };

  // ============================================
  // Load GA4 module on client only
  // ============================================

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;

    // Dynamically import the GA4 client module
    import('~/services/analytics/ga4.client')
      .then((module) => {
        setGa4(module.ga4);
        setIsClientReady(true);
      })
      .catch((err) => {
        console.error('[useAnalytics] Failed to load GA4 module:', err);
      });
  }, []);

  // ============================================
  // Automatic Page View Tracking
  // ============================================

  useEffect(() => {
    if (!autoTrackPageViews || !ga4 || !isClientReady) return;

    // Only track if path changed (not on initial mount with same path)
    if (location.pathname === prevPathRef.current) return;
    prevPathRef.current = location.pathname;

    // Build page title
    const title = pageTitle || document.title || getPageTitleFromPath(location.pathname);

    ga4.trackPageView(title, location.pathname, baseDimensions);
  }, [location.pathname, autoTrackPageViews, pageTitle, ga4, isClientReady]);

  // ============================================
  // Event Tracking Functions
  // ============================================

  /**
   * Track a typed GA4 event with automatic shop context
   */
  const trackEvent = useCallback(
    (event: GA4Event) => {
      if (!ga4) return;

      // Merge base dimensions with event params
      const enrichedEvent = {
        ...event,
        params: {
          ...baseDimensions,
          ...event.params,
        },
      };

      ga4.trackEvent(enrichedEvent as GA4Event);
    },
    [ga4, baseDimensions]
  );

  /**
   * Track a custom event with arbitrary parameters
   */
  const trackCustomEvent = useCallback(
    (eventName: string, params?: Record<string, string | number | boolean>) => {
      if (!ga4) return;

      ga4.trackCustomEvent(eventName, {
        ...baseDimensions,
        ...params,
      });
    },
    [ga4, baseDimensions]
  );

  /**
   * Manually track a page view
   */
  const trackPageView = useCallback(
    (title?: string, path?: string) => {
      if (!ga4) return;

      ga4.trackPageView(
        title || document.title,
        path || location.pathname,
        baseDimensions
      );
    },
    [ga4, location.pathname, baseDimensions]
  );

  // ============================================
  // Convenience Methods for Common Events
  // ============================================

  /**
   * Track tier-related events
   */
  const trackTier = useCallback(
    (action: 'view' | 'upgrade' | 'downgrade' | 'subscribe' | 'cancel', params: Record<string, any>) => {
      const eventNameMap = {
        view: 'tier_view',
        upgrade: 'tier_upgrade',
        downgrade: 'tier_downgrade',
        subscribe: 'tier_subscription_start',
        cancel: 'tier_subscription_cancel',
      };

      trackCustomEvent(eventNameMap[action], params);
    },
    [trackCustomEvent]
  );

  /**
   * Track reward events (cashback, points)
   */
  const trackReward = useCallback(
    (action: 'cashback_earned' | 'cashback_redeemed' | 'points_earned' | 'points_redeemed', params: Record<string, any>) => {
      trackCustomEvent(action, {
        reward_type: action.split('_')[0],
        ...params,
      });
    },
    [trackCustomEvent]
  );

  /**
   * Track engagement events (raffle, mystery box, challenge)
   */
  const trackEngagement = useCallback(
    (action: 'raffle_entered' | 'raffle_won' | 'mystery_box_opened' | 'challenge_completed', params: Record<string, any>) => {
      trackCustomEvent(action, params);
    },
    [trackCustomEvent]
  );

  // ============================================
  // Return Hook API
  // ============================================

  return {
    // Core tracking
    trackEvent,
    trackCustomEvent,
    trackPageView,

    // Convenience methods
    trackTier,
    trackReward,
    trackEngagement,

    // Context
    shopDomain: appData?.shop,
    isReady: isClientReady && ga4?.isReady() === true,
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Generate a page title from the URL path
 */
function getPageTitleFromPath(path: string): string {
  // Remove /app prefix and split
  const segments = path.replace(/^\/app\/?/, '').split('/');

  if (segments.length === 0 || segments[0] === '') {
    return 'Dashboard';
  }

  // Capitalize and join
  return segments
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' - ');
}

export default useAnalytics;
