/**
 * Analytics Service - Main Entry Point
 *
 * Re-exports all analytics types and functions for easy importing.
 *
 * Usage:
 *   import { ga4, GA4Event, GA4_EVENTS } from '~/services/analytics';
 */

// Types
export type {
  GA4Item,
  GA4EcommerceEvent,
  GA4Event,
  RewardsProDimensions,
  // Tier events
  TierViewEvent,
  TierUpgradeEvent,
  TierDowngradeEvent,
  TierSubscriptionStartEvent,
  TierSubscriptionCancelEvent,
  // Rewards events
  CashbackEarnedEvent,
  CashbackRedeemedEvent,
  PointsEarnedEvent,
  PointsRedeemedEvent,
  // Engagement events
  RaffleEnteredEvent,
  RaffleWonEvent,
  MysteryBoxOpenedEvent,
  ChallengeCompletedEvent,
  // Navigation events
  PageViewEvent,
  DashboardViewEvent,
  SettingsViewEvent,
} from './ga4.types';

// Constants
export { GA4_EVENTS } from './ga4.types';

// Client service (only import in client context)
export { ga4, initGA4, isGA4Ready, trackEvent, trackCustomEvent, trackEcommerceEvent, trackPageView, setUserProperties, setUserId, trackTierPurchase } from './ga4.client';
