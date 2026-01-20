/**
 * Google Analytics 4 (GA4) Client Service
 *
 * Client-side analytics service for RewardsPro.
 * Handles event tracking, user identification, and e-commerce events.
 *
 * Usage:
 *   import { ga4 } from '~/services/analytics/ga4.client';
 *   ga4.trackEvent({ name: 'tier_upgrade', params: { ... } });
 */

import type {
  GA4Event,
  GA4EcommerceEvent,
  RewardsProDimensions,
} from './ga4.types';

// ============================================
// Configuration
// ============================================

interface GA4Config {
  measurementId: string;
  debug?: boolean;
  sendPageView?: boolean;
}

let config: GA4Config = {
  measurementId: '',
  debug: false,
  sendPageView: true,
};

// ============================================
// Initialization
// ============================================

/**
 * Initialize GA4 with measurement ID and options
 */
export function initGA4(measurementId: string, options?: Partial<GA4Config>): void {
  if (!measurementId) {
    console.warn('[GA4] No measurement ID provided, analytics disabled');
    return;
  }

  config = {
    ...config,
    measurementId,
    ...options,
  };

  // Initialize dataLayer
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };

  // Set measurement ID for other functions
  window.GA4_MEASUREMENT_ID = measurementId;

  // Initialize gtag
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    send_page_view: config.sendPageView,
    debug_mode: config.debug,
  });

  if (config.debug) {
    console.log('[GA4] Initialized with ID:', measurementId);
  }
}

/**
 * Check if GA4 is ready
 */
export function isGA4Ready(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.gtag === 'function' &&
    !!config.measurementId;
}

// ============================================
// User Identification
// ============================================

/**
 * Set user properties for all subsequent events
 */
export function setUserProperties(properties: Partial<RewardsProDimensions>): void {
  if (!isGA4Ready()) {
    if (config.debug) console.warn('[GA4] Not ready, cannot set user properties');
    return;
  }

  window.gtag('set', 'user_properties', properties);

  if (config.debug) {
    console.log('[GA4] Set user properties:', properties);
  }
}

/**
 * Set user ID for cross-device tracking
 */
export function setUserId(userId: string | null): void {
  if (!isGA4Ready()) return;

  if (userId) {
    window.gtag('config', config.measurementId, {
      user_id: userId,
    });
  }

  if (config.debug) {
    console.log('[GA4] Set user ID:', userId);
  }
}

// ============================================
// Event Tracking
// ============================================

/**
 * Track a typed GA4 event
 */
export function trackEvent(event: GA4Event): void {
  if (!isGA4Ready()) {
    if (config.debug) console.warn('[GA4] Not ready, event queued:', event.name);
    // Queue events if not ready (they'll be sent when gtag loads)
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: event.name, ...event.params });
    return;
  }

  window.gtag('event', event.name, event.params);

  if (config.debug) {
    console.log('[GA4] Event tracked:', event.name, event.params);
  }
}

/**
 * Track a custom event with arbitrary parameters
 */
export function trackCustomEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
): void {
  if (!isGA4Ready()) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: eventName, ...params });
    return;
  }

  window.gtag('event', eventName, params);

  if (config.debug) {
    console.log('[GA4] Custom event:', eventName, params);
  }
}

// ============================================
// E-commerce Tracking
// ============================================

/**
 * Track an e-commerce event (purchase, refund, etc.)
 */
export function trackEcommerceEvent(event: GA4EcommerceEvent): void {
  if (!isGA4Ready()) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: event.event,
      ecommerce: event.ecommerce,
      ...event.custom_parameters,
    });
    return;
  }

  // Clear previous ecommerce data
  window.gtag('event', 'clear_ecommerce');

  // Push ecommerce event
  window.gtag('event', event.event, {
    ecommerce: event.ecommerce,
    ...event.custom_parameters,
  });

  if (config.debug) {
    console.log('[GA4] E-commerce event:', event.event, event);
  }
}

/**
 * Track tier subscription purchase as e-commerce
 */
export function trackTierPurchase(params: {
  transactionId: string;
  tierName: string;
  tierId: string;
  value: number;
  currency: string;
  billingInterval: 'monthly' | 'annual';
  shopDomain: string;
}): void {
  trackEcommerceEvent({
    event: 'purchase',
    ecommerce: {
      transaction_id: params.transactionId,
      value: params.value,
      currency: params.currency,
      items: [
        {
          item_id: params.tierId,
          item_name: params.tierName,
          item_category: 'tier_subscription',
          item_variant: params.billingInterval,
          price: params.value,
          quantity: 1,
        },
      ],
    },
    custom_parameters: {
      shop_domain: params.shopDomain,
      subscription_type: 'tier',
      billing_interval: params.billingInterval,
    },
  });
}

// ============================================
// Page View Tracking
// ============================================

/**
 * Track page view with optional custom dimensions
 */
export function trackPageView(
  pageTitle: string,
  pagePath: string,
  dimensions?: Partial<RewardsProDimensions>
): void {
  trackEvent({
    name: 'page_view',
    params: {
      page_title: pageTitle,
      page_location: typeof window !== 'undefined' ? window.location.href : '',
      page_path: pagePath,
      ...dimensions,
    },
  });
}

// ============================================
// Convenience Functions for RewardsPro Events
// ============================================

export const ga4 = {
  // Core
  init: initGA4,
  isReady: isGA4Ready,

  // User
  setUserProperties,
  setUserId,

  // Events
  trackEvent,
  trackCustomEvent,
  trackEcommerceEvent,
  trackPageView,

  // E-commerce helpers
  trackTierPurchase,

  // Debug
  enableDebug: () => {
    config.debug = true;
  },
  disableDebug: () => {
    config.debug = false;
  },
};

export default ga4;
