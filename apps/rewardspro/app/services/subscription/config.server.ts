/**
 * Subscription System Configuration
 * Central configuration for tier subscription features
 */

export const SUBSCRIPTION_CONFIG = {
  // Billing intervals with duration in days
  BILLING_INTERVALS: {
    MONTHLY: {
      interval: 'MONTH' as const,
      intervalCount: 1,
      days: 30,
      label: 'Monthly',
      shortLabel: 'mo',
      discountPercentage: 0, // No discount for monthly
    },
    QUARTERLY: {
      interval: 'MONTH' as const,
      intervalCount: 3,
      days: 90,
      label: 'Quarterly',
      shortLabel: '3mo',
      discountPercentage: 5, // 5% discount
    },
    ANNUAL: {
      interval: 'YEAR' as const,
      intervalCount: 1,
      days: 365,
      label: 'Annual',
      shortLabel: 'yr',
      discountPercentage: 15, // 15% discount for annual
    },
  },

  // Subscription states
  SUBSCRIPTION_STATUS: {
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    PAUSED: 'PAUSED',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
    FAILED: 'FAILED',
  } as const,

  // Billing attempt configuration
  BILLING: {
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_INTERVALS_DAYS: [1, 3, 5], // Retry after 1, 3, then 5 days
    DUNNING_PERIOD_DAYS: 9, // Total dunning period
    GRACE_PERIOD_HOURS: 24, // Grace period before first retry
  },

  // Grace period configuration
  GRACE_PERIOD: {
    DAYS: 3, // Days to wait before cancelling subscription
    HOURS: 72, // Same as days but in hours
  },

  // Selling plan configuration
  SELLING_PLAN: {
    GROUP_NAME: 'Tier Membership Subscription',
    MERCHANT_CODE: 'TIER_SUB',
    POSITION: 999, // Display at end of options
    OPTIONS_TITLE: 'Membership Billing',
  },

  // GraphQL API configuration
  GRAPHQL: {
    API_VERSION: '2024-10', // Latest stable version
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000,
  },

  // Webhook topics
  WEBHOOKS: {
    SUBSCRIPTION_CREATED: 'subscription_contracts/create',
    SUBSCRIPTION_UPDATED: 'subscription_contracts/update',
    BILLING_SUCCESS: 'subscription_billing_attempts/success',
    BILLING_FAILED: 'subscription_billing_attempts/failure',
    SUBSCRIPTION_ACTIVATED: 'subscription_contracts/activate',
    SUBSCRIPTION_PAUSED: 'subscription_contracts/pause',
    SUBSCRIPTION_CANCELLED: 'subscription_contracts/cancel',
  },

  // Feature flags (for gradual rollout)
  FEATURES: {
    ENABLE_SUBSCRIPTIONS: process.env.ENABLE_SUBSCRIPTIONS === 'true',
    ENABLE_TRIAL_PERIODS: process.env.ENABLE_TRIAL_PERIODS === 'true',
    ENABLE_AUTOMATIC_DUNNING: process.env.ENABLE_AUTOMATIC_DUNNING !== 'false', // Default true
    ENABLE_SUBSCRIPTION_ANALYTICS: process.env.ENABLE_SUBSCRIPTION_ANALYTICS === 'true',
  },

  // Trial period configuration
  TRIAL: {
    DEFAULT_DAYS: 7,
    MAX_DAYS: 30,
    MIN_DAYS: 0,
  },

  // Notification settings
  NOTIFICATIONS: {
    SEND_BILLING_REMINDERS: true,
    REMINDER_DAYS_BEFORE: 3,
    SEND_PAYMENT_FAILURE_EMAILS: true,
    SEND_CANCELLATION_EMAILS: true,
  },
} as const;

export type BillingInterval = keyof typeof SUBSCRIPTION_CONFIG.BILLING_INTERVALS;
export type SubscriptionStatus = typeof SUBSCRIPTION_CONFIG.SUBSCRIPTION_STATUS[keyof typeof SUBSCRIPTION_CONFIG.SUBSCRIPTION_STATUS];

/**
 * Helper function to get billing interval details
 */
export function getBillingIntervalDetails(interval: BillingInterval) {
  return SUBSCRIPTION_CONFIG.BILLING_INTERVALS[interval];
}

/**
 * Calculate discounted price based on billing interval
 */
export function calculateSubscriptionPrice(
  basePrice: number,
  interval: BillingInterval
): { originalPrice: number; discountedPrice: number; savedAmount: number } {
  const details = getBillingIntervalDetails(interval);
  const discountMultiplier = 1 - details.discountPercentage / 100;
  const discountedPrice = basePrice * discountMultiplier;
  const savedAmount = basePrice - discountedPrice;

  return {
    originalPrice: basePrice,
    discountedPrice: Math.round(discountedPrice * 100) / 100, // Round to 2 decimals
    savedAmount: Math.round(savedAmount * 100) / 100,
  };
}

/**
 * Check if subscriptions are enabled
 */
export function isSubscriptionEnabled(): boolean {
  return SUBSCRIPTION_CONFIG.FEATURES.ENABLE_SUBSCRIPTIONS;
}

/**
 * Get next billing date based on interval
 */
export function getNextBillingDate(
  startDate: Date,
  interval: BillingInterval
): Date {
  const details = getBillingIntervalDetails(interval);
  const nextDate = new Date(startDate);
  
  if (details.interval === 'MONTH') {
    nextDate.setMonth(nextDate.getMonth() + details.intervalCount);
  } else if (details.interval === 'YEAR') {
    nextDate.setFullYear(nextDate.getFullYear() + details.intervalCount);
  }
  
  return nextDate;
}

/**
 * Update subscription configuration
 * Note: In production, this would update environment variables or database settings
 */
export function updateSubscriptionConfig(config: {
  trialPeriodsEnabled?: boolean;
  automaticDunningEnabled?: boolean;
  gracePeriodDays?: number;
  maxRetryAttempts?: number;
}): void {
  // In production, this would update the configuration
  console.log('[Config] Updating subscription configuration:', config);
  // This is a placeholder - actual implementation would update environment variables
  // or store in database settings
}