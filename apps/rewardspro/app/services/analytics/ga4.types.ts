/**
 * Google Analytics 4 (GA4) Type Definitions
 *
 * Type-safe event tracking for RewardsPro loyalty program.
 * Follows GA4 naming conventions (snake_case, max 40 chars).
 */

// ============================================
// Core GA4 Types
// ============================================

/**
 * GA4 Item schema for e-commerce tracking
 */
export interface GA4Item {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_category2?: string;
  price?: number;
  quantity?: number;
  discount?: number;
  affiliation?: string;
  item_brand?: string;
  item_variant?: string;
}

/**
 * GA4 E-commerce event structure
 */
export interface GA4EcommerceEvent {
  event: string;
  ecommerce: {
    transaction_id?: string;
    value?: number;
    currency?: string;
    items?: GA4Item[];
    coupon?: string;
    shipping?: number;
    tax?: number;
  };
  custom_parameters?: Record<string, string | number | boolean>;
}

// ============================================
// RewardsPro Custom Dimensions
// ============================================

/**
 * Custom dimensions for all RewardsPro events
 */
export interface RewardsProDimensions {
  shop_domain: string;
  customer_tier?: string;
  tier_id?: string;
  current_plan?: string;
  reward_type?: 'cashback' | 'points' | 'raffle' | 'mystery_box' | 'challenge';
}

// ============================================
// Tier Events
// ============================================

export interface TierViewEvent {
  name: 'tier_view';
  params: {
    page_title: string;
    tier_id?: string;
    tier_name?: string;
    customer_tier?: string;
  } & RewardsProDimensions;
}

export interface TierUpgradeEvent {
  name: 'tier_upgrade';
  params: {
    previous_tier: string;
    new_tier: string;
    tier_id: string;
    value?: number;
    currency?: string;
  } & RewardsProDimensions;
}

export interface TierDowngradeEvent {
  name: 'tier_downgrade';
  params: {
    previous_tier: string;
    new_tier: string;
    tier_id: string;
  } & RewardsProDimensions;
}

export interface TierSubscriptionStartEvent {
  name: 'tier_subscription_start';
  params: {
    tier_id: string;
    tier_name: string;
    billing_interval: 'monthly' | 'annual';
    value: number;
    currency: string;
    transaction_id: string;
  } & RewardsProDimensions;
}

export interface TierSubscriptionCancelEvent {
  name: 'tier_subscription_cancel';
  params: {
    tier_id: string;
    tier_name: string;
    cancellation_reason?: string;
  } & RewardsProDimensions;
}

// ============================================
// Rewards Events
// ============================================

export interface CashbackEarnedEvent {
  name: 'cashback_earned';
  params: {
    order_id: string;
    cashback_amount: number;
    order_value: number;
    cashback_rate: number;
    currency: string;
    customer_id: string;
  } & RewardsProDimensions;
}

export interface CashbackRedeemedEvent {
  name: 'cashback_redeemed';
  params: {
    redemption_id: string;
    amount: number;
    currency: string;
    redemption_method: 'store_credit' | 'discount_code';
  } & RewardsProDimensions;
}

export interface PointsEarnedEvent {
  name: 'points_earned';
  params: {
    points_amount: number;
    earning_type: 'purchase' | 'referral' | 'bonus' | 'challenge';
    source_id?: string;
  } & RewardsProDimensions;
}

export interface PointsRedeemedEvent {
  name: 'points_redeemed';
  params: {
    points_amount: number;
    redemption_value: number;
    currency: string;
    redemption_type: string;
  } & RewardsProDimensions;
}

// ============================================
// Engagement Events
// ============================================

export interface RaffleEnteredEvent {
  name: 'raffle_entered';
  params: {
    raffle_id: string;
    raffle_name: string;
    entry_method: 'points' | 'free' | 'purchase';
    entries_count: number;
  } & RewardsProDimensions;
}

export interface RaffleWonEvent {
  name: 'raffle_won';
  params: {
    raffle_id: string;
    raffle_name: string;
    prize_name: string;
    prize_value?: number;
  } & RewardsProDimensions;
}

export interface MysteryBoxOpenedEvent {
  name: 'mystery_box_opened';
  params: {
    box_id: string;
    box_name: string;
    prize_name: string;
    prize_value?: number;
    box_cost?: number;
  } & RewardsProDimensions;
}

export interface ChallengeCompletedEvent {
  name: 'challenge_completed';
  params: {
    challenge_id: string;
    challenge_name: string;
    reward_type: string;
    reward_value: number;
    completion_time_days?: number;
  } & RewardsProDimensions;
}

// ============================================
// Navigation Events
// ============================================

export interface PageViewEvent {
  name: 'page_view';
  params: {
    page_title: string;
    page_location: string;
    page_path: string;
  } & Partial<RewardsProDimensions>;
}

export interface DashboardViewEvent {
  name: 'dashboard_view';
  params: {
    active_customers_count?: number;
    total_cashback_paid?: number;
  } & RewardsProDimensions;
}

export interface SettingsViewEvent {
  name: 'settings_view';
  params: {
    settings_section: string;
  } & RewardsProDimensions;
}

// ============================================
// Union Type for All Events
// ============================================

export type GA4Event =
  // Tier events
  | TierViewEvent
  | TierUpgradeEvent
  | TierDowngradeEvent
  | TierSubscriptionStartEvent
  | TierSubscriptionCancelEvent
  // Rewards events
  | CashbackEarnedEvent
  | CashbackRedeemedEvent
  | PointsEarnedEvent
  | PointsRedeemedEvent
  // Engagement events
  | RaffleEnteredEvent
  | RaffleWonEvent
  | MysteryBoxOpenedEvent
  | ChallengeCompletedEvent
  // Navigation events
  | PageViewEvent
  | DashboardViewEvent
  | SettingsViewEvent;

// ============================================
// Window Type Extension
// ============================================

declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
    GA4_MEASUREMENT_ID?: string;
  }
}

// ============================================
// Event Names Enum (for consistency)
// ============================================

export const GA4_EVENTS = {
  // Tier
  TIER_VIEW: 'tier_view',
  TIER_UPGRADE: 'tier_upgrade',
  TIER_DOWNGRADE: 'tier_downgrade',
  TIER_SUBSCRIPTION_START: 'tier_subscription_start',
  TIER_SUBSCRIPTION_CANCEL: 'tier_subscription_cancel',

  // Rewards
  CASHBACK_EARNED: 'cashback_earned',
  CASHBACK_REDEEMED: 'cashback_redeemed',
  POINTS_EARNED: 'points_earned',
  POINTS_REDEEMED: 'points_redeemed',

  // Engagement
  RAFFLE_ENTERED: 'raffle_entered',
  RAFFLE_WON: 'raffle_won',
  MYSTERY_BOX_OPENED: 'mystery_box_opened',
  CHALLENGE_COMPLETED: 'challenge_completed',

  // Navigation
  PAGE_VIEW: 'page_view',
  DASHBOARD_VIEW: 'dashboard_view',
  SETTINGS_VIEW: 'settings_view',
} as const;
