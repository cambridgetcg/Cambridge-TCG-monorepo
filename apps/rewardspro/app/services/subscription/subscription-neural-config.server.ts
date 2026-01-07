/**
 * Subscription Neural Configuration
 *
 * Centralized, crystallized (immutable) configuration for the subscription system.
 * All subscription-related constants should be defined here.
 *
 * Part of Neural Network Optimization - Phase 5
 */

// ============================================================================
// CRYSTALLIZED CONFIGURATION (Immutable)
// ============================================================================

/**
 * Master subscription configuration - frozen for thread safety
 * All values are immutable to prevent runtime modifications
 */
export const SUBSCRIPTION_NEURAL_CONFIG = Object.freeze({
  // ══════════════════════════════════════════════════════════════════════════
  // BILLING INTERVALS
  // ══════════════════════════════════════════════════════════════════════════
  billingIntervals: Object.freeze({
    WEEKLY: Object.freeze({
      interval: 'WEEK' as const,
      intervalCount: 1,
      days: 7,
      label: 'Weekly',
      shortLabel: 'wk',
      discountPercentage: 0,
    }),
    MONTHLY: Object.freeze({
      interval: 'MONTH' as const,
      intervalCount: 1,
      days: 30,
      label: 'Monthly',
      shortLabel: 'mo',
      discountPercentage: 0,
    }),
    QUARTERLY: Object.freeze({
      interval: 'MONTH' as const,
      intervalCount: 3,
      days: 90,
      label: 'Quarterly',
      shortLabel: '3mo',
      discountPercentage: 5,
    }),
    SEMIANNUAL: Object.freeze({
      interval: 'MONTH' as const,
      intervalCount: 6,
      days: 180,
      label: 'Semi-Annual',
      shortLabel: '6mo',
      discountPercentage: 10,
    }),
    ANNUAL: Object.freeze({
      interval: 'YEAR' as const,
      intervalCount: 1,
      days: 365,
      label: 'Annual',
      shortLabel: 'yr',
      discountPercentage: 15,
    }),
  }),

  // ══════════════════════════════════════════════════════════════════════════
  // GRACE PERIOD & DUNNING (Single Source of Truth)
  // ══════════════════════════════════════════════════════════════════════════
  gracePeriod: Object.freeze({
    days: 3,
    hours: 72,
    checkIntervalHours: 6,
  }),

  dunning: Object.freeze({
    maxRetryAttempts: 3,
    retryIntervalsDays: [1, 3, 5] as readonly number[],
    totalDunningPeriodDays: 9,
    sendReminders: true,
    reminderDaysBeforeBilling: 3,
  }),

  // ══════════════════════════════════════════════════════════════════════════
  // STATE MACHINE (Crystallized Transitions)
  // ══════════════════════════════════════════════════════════════════════════
  stateMachine: Object.freeze({
    transitions: Object.freeze({
      PENDING: ['ACTIVE', 'CANCELLED'] as readonly string[],
      ACTIVE: ['PAUSED', 'CANCELLED', 'FAILED', 'EXPIRED'] as readonly string[],
      PAUSED: ['ACTIVE', 'CANCELLED', 'EXPIRED'] as readonly string[],
      CANCELLED: [] as readonly string[], // Terminal state
      EXPIRED: [] as readonly string[], // Terminal state
      FAILED: ['ACTIVE', 'CANCELLED'] as readonly string[], // Can recover or cancel
    }),

    // Terminal states that cannot transition
    terminalStates: ['CANCELLED', 'EXPIRED'] as readonly string[],

    // States that revoke tier access
    tierRevokingStates: ['CANCELLED', 'EXPIRED', 'FAILED'] as readonly string[],
  }),

  // ══════════════════════════════════════════════════════════════════════════
  // IDEMPOTENCY
  // ══════════════════════════════════════════════════════════════════════════
  idempotency: Object.freeze({
    lockTtlMs: 30000, // 30 seconds
    retryDelayMs: 100,
    maxRetries: 3,
  }),

  // ══════════════════════════════════════════════════════════════════════════
  // SHOPIFY API
  // ══════════════════════════════════════════════════════════════════════════
  shopify: Object.freeze({
    apiVersion: '2024-10',
    maxGraphQLRetries: 3,
    retryDelayMs: 1000,
    backoffMultiplier: 2,
  }),

  // ══════════════════════════════════════════════════════════════════════════
  // SELLING PLAN
  // ══════════════════════════════════════════════════════════════════════════
  sellingPlan: Object.freeze({
    groupName: 'Tier Membership Subscription',
    merchantCode: 'TIER_SUB',
    position: 999,
    optionsTitle: 'Membership Billing',
  }),

  // ══════════════════════════════════════════════════════════════════════════
  // FEATURE FLAGS
  // ══════════════════════════════════════════════════════════════════════════
  features: Object.freeze({
    enableSubscriptions: process.env.ENABLE_SUBSCRIPTIONS === 'true',
    enableTrialPeriods: process.env.ENABLE_TRIAL_PERIODS === 'true',
    enableAutomaticDunning: process.env.ENABLE_AUTOMATIC_DUNNING !== 'false',
    enableDeduplicationLocks: process.env.ENABLE_DEDUP_LOCKS !== 'false',
    enableSyncVerification: process.env.ENABLE_SYNC_VERIFICATION === 'true',
  }),

  // ══════════════════════════════════════════════════════════════════════════
  // TRIAL PERIODS
  // ══════════════════════════════════════════════════════════════════════════
  trial: Object.freeze({
    defaultDays: 7,
    maxDays: 30,
    minDays: 0,
  }),

  // ══════════════════════════════════════════════════════════════════════════
  // TIER BEHAVIOR
  // ══════════════════════════════════════════════════════════════════════════
  tierBehavior: Object.freeze({
    revokeOnPause: false, // Keep tier during pause by default
    revokeOnFailedPayment: false, // Grace period applies first
    allowMultipleActiveSubscriptions: false, // One active sub per customer
  }),
});

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type BillingIntervalKey = keyof typeof SUBSCRIPTION_NEURAL_CONFIG.billingIntervals;
export type SubscriptionStatusKey = keyof typeof SUBSCRIPTION_NEURAL_CONFIG.stateMachine.transitions;

export interface BillingIntervalDetails {
  interval: 'WEEK' | 'MONTH' | 'YEAR';
  intervalCount: number;
  days: number;
  label: string;
  shortLabel: string;
  discountPercentage: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get billing interval details
 */
export function getBillingIntervalDetails(interval: BillingIntervalKey): BillingIntervalDetails {
  return SUBSCRIPTION_NEURAL_CONFIG.billingIntervals[interval];
}

/**
 * Check if a status transition is valid
 */
export function isValidTransition(
  fromStatus: SubscriptionStatusKey,
  toStatus: string
): boolean {
  const allowedTransitions = SUBSCRIPTION_NEURAL_CONFIG.stateMachine.transitions[fromStatus];
  return allowedTransitions?.includes(toStatus) ?? false;
}

/**
 * Check if a status is terminal (cannot transition from)
 */
export function isTerminalStatus(status: string): boolean {
  return SUBSCRIPTION_NEURAL_CONFIG.stateMachine.terminalStates.includes(status);
}

/**
 * Check if a status revokes tier access
 */
export function isTierRevokingStatus(status: string): boolean {
  return SUBSCRIPTION_NEURAL_CONFIG.stateMachine.tierRevokingStates.includes(status);
}

/**
 * Calculate next billing date based on interval
 */
export function calculateNextBillingDate(
  fromDate: Date,
  interval: BillingIntervalKey
): Date {
  const details = getBillingIntervalDetails(interval);
  const next = new Date(fromDate);

  switch (details.interval) {
    case 'WEEK':
      next.setDate(next.getDate() + 7 * details.intervalCount);
      break;
    case 'MONTH':
      next.setMonth(next.getMonth() + details.intervalCount);
      break;
    case 'YEAR':
      next.setFullYear(next.getFullYear() + details.intervalCount);
      break;
  }

  return next;
}

/**
 * Calculate discounted price based on billing interval
 */
export function calculateDiscountedPrice(
  basePrice: number,
  interval: BillingIntervalKey
): { originalPrice: number; discountedPrice: number; savedAmount: number; discountPercent: number } {
  const details = getBillingIntervalDetails(interval);
  const discountMultiplier = 1 - details.discountPercentage / 100;
  const discountedPrice = basePrice * discountMultiplier;
  const savedAmount = basePrice - discountedPrice;

  return {
    originalPrice: basePrice,
    discountedPrice: Math.round(discountedPrice * 100) / 100,
    savedAmount: Math.round(savedAmount * 100) / 100,
    discountPercent: details.discountPercentage,
  };
}

/**
 * Determine billing interval from selling plan name (fallback parser)
 * This is a backup when we can't look up the selling plan from DB
 */
export function parseBillingIntervalFromName(name: string): BillingIntervalKey {
  const normalized = name?.toLowerCase() || '';

  if (normalized.includes('annual') || normalized.includes('year')) {
    return 'ANNUAL';
  }
  if (normalized.includes('semi') || normalized.includes('6 month')) {
    return 'SEMIANNUAL';
  }
  if (normalized.includes('quarter') || normalized.includes('3 month')) {
    return 'QUARTERLY';
  }
  if (normalized.includes('week')) {
    return 'WEEKLY';
  }

  // Default to monthly
  return 'MONTHLY';
}

/**
 * Get grace period end date from failure date
 */
export function getGracePeriodEndDate(failureDate: Date = new Date()): Date {
  const end = new Date(failureDate);
  end.setDate(end.getDate() + SUBSCRIPTION_NEURAL_CONFIG.gracePeriod.days);
  return end;
}

/**
 * Check if grace period has expired
 */
export function isGracePeriodExpired(gracePeriodEnd: Date | string): boolean {
  const endDate = typeof gracePeriodEnd === 'string' ? new Date(gracePeriodEnd) : gracePeriodEnd;
  return new Date() > endDate;
}
