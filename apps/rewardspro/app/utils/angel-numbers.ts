/**
 * Angel Numbers - Demo/Preview Display Values
 *
 * Angel numbers are repeating number sequences (111, 222, 333, etc.)
 * used for demo displays to create visually pleasing, memorable previews.
 *
 * Usage:
 *   import { ANGEL_NUMBERS, getAngelCredit } from '~/utils/angel-numbers';
 *   formatCurrency(ANGEL_NUMBERS.CREDIT.ABUNDANCE, { ... })
 */

// ============================================
// ANGEL NUMBER CONSTANTS
// ============================================

export const ANGEL_NUMBERS = {
  /**
   * Credit/Money displays - use for store credit, balance previews
   */
  CREDIT: {
    /** $888.88 - Abundance, prosperity, financial success */
    ABUNDANCE: 888.88,
    /** $777.77 - Luck, spiritual alignment */
    LUCK: 777.77,
    /** $333.33 - Growth, expansion */
    GROWTH: 333.33,
    /** $555.55 - Change, transformation */
    CHANGE: 555.55,
    /** $444.44 - Stability, foundation */
    STABILITY: 444.44,
    /** $222.22 - Balance, harmony */
    BALANCE: 222.22,
    /** $111.11 - New beginnings */
    BEGINNINGS: 111.11,
  },

  /**
   * Points displays - whole numbers for point balances
   */
  POINTS: {
    /** 8,888 points - Abundance */
    ABUNDANCE: 8888,
    /** 7,777 points - Luck */
    LUCK: 7777,
    /** 3,333 points - Growth */
    GROWTH: 3333,
    /** 5,555 points - Change */
    CHANGE: 5555,
    /** 1,111 points - Beginnings */
    BEGINNINGS: 1111,
  },

  /**
   * Percentage displays - for progress bars, completion rates
   */
  PERCENT: {
    /** 88% - Near complete, abundance */
    HIGH: 88,
    /** 77% - Good progress, luck */
    GOOD: 77,
    /** 55% - Midway, change */
    MID: 55,
    /** 33% - Early progress, growth */
    LOW: 33,
    /** 11% - Just started, beginnings */
    START: 11,
  },

  /**
   * Count displays - for member counts, order counts
   */
  COUNT: {
    /** 888 members/orders */
    HIGH: 888,
    /** 333 members/orders */
    MID: 333,
    /** 111 members/orders */
    LOW: 111,
  },

  /**
   * Tier-specific demo values
   */
  TIER: {
    GOLD: {
      name: 'Gold Member',
      credit: 888.88,
      points: 8888,
      progress: 77,
      cashbackPercent: 8,
    },
    SILVER: {
      name: 'Silver Member',
      credit: 555.55,
      points: 5555,
      progress: 55,
      cashbackPercent: 5,
    },
    BRONZE: {
      name: 'Bronze Member',
      credit: 333.33,
      points: 3333,
      progress: 33,
      cashbackPercent: 3,
    },
  },
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get an appropriate angel credit amount based on context
 */
export function getAngelCredit(
  context: 'abundance' | 'luck' | 'growth' | 'balance' | 'default' = 'default'
): number {
  switch (context) {
    case 'abundance':
      return ANGEL_NUMBERS.CREDIT.ABUNDANCE;
    case 'luck':
      return ANGEL_NUMBERS.CREDIT.LUCK;
    case 'growth':
      return ANGEL_NUMBERS.CREDIT.GROWTH;
    case 'balance':
      return ANGEL_NUMBERS.CREDIT.BALANCE;
    default:
      return ANGEL_NUMBERS.CREDIT.ABUNDANCE; // Default to 888.88
  }
}

/**
 * Get angel points based on tier level
 */
export function getAngelPoints(tier: 'high' | 'mid' | 'low' = 'high'): number {
  switch (tier) {
    case 'high':
      return ANGEL_NUMBERS.POINTS.ABUNDANCE;
    case 'mid':
      return ANGEL_NUMBERS.POINTS.CHANGE;
    case 'low':
      return ANGEL_NUMBERS.POINTS.BEGINNINGS;
  }
}

/**
 * Get angel percentage for progress displays
 */
export function getAngelPercent(
  level: 'high' | 'good' | 'mid' | 'low' | 'start' = 'good'
): number {
  return ANGEL_NUMBERS.PERCENT[level.toUpperCase() as keyof typeof ANGEL_NUMBERS.PERCENT];
}

/**
 * Get complete demo data for a tier preview
 */
export function getTierDemoData(tier: 'gold' | 'silver' | 'bronze' = 'gold') {
  return ANGEL_NUMBERS.TIER[tier.toUpperCase() as keyof typeof ANGEL_NUMBERS.TIER];
}

// ============================================
// SEMANTIC DEMO VALUES
// ============================================

/**
 * Demo values for specific UI contexts
 */
export const DEMO_VALUES = {
  /** Widget theme preview */
  WIDGET_PREVIEW: {
    tierName: ANGEL_NUMBERS.TIER.GOLD.name,
    credit: ANGEL_NUMBERS.CREDIT.ABUNDANCE,
    cashbackPercent: ANGEL_NUMBERS.TIER.GOLD.cashbackPercent,
    progress: ANGEL_NUMBERS.PERCENT.GOOD,
    nextTierName: 'Platinum',
    amountRemaining: ANGEL_NUMBERS.CREDIT.BALANCE,
    isMaxTier: false,
  },

  /** Dashboard metrics preview */
  DASHBOARD: {
    totalMembers: ANGEL_NUMBERS.COUNT.HIGH,
    activeMembers: ANGEL_NUMBERS.COUNT.MID,
    totalCreditsIssued: ANGEL_NUMBERS.CREDIT.LUCK * 100, // $77,777
    averageOrderValue: ANGEL_NUMBERS.CREDIT.BALANCE,
  },

  /** Customer card preview */
  CUSTOMER_CARD: {
    credit: ANGEL_NUMBERS.CREDIT.ABUNDANCE,
    points: ANGEL_NUMBERS.POINTS.ABUNDANCE,
    tierProgress: ANGEL_NUMBERS.PERCENT.GOOD,
  },
} as const;
