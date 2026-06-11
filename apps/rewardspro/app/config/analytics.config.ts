/**
 * Analytics Configuration
 *
 * Centralized configuration for analytics calculations and thresholds.
 * Previously hardcoded values are now configurable here.
 */

// ============================================
// RFM ANALYSIS CONFIGURATION
// ============================================

export const RFM_CONFIG = {
  // Recency thresholds (days since last purchase)
  recencyDays: {
    active: 30,        // Customer is active if last purchase within 30 days
    lapsed: 60,        // Customer is lapsed if last purchase 31-60 days ago
    dormant: 90,       // Customer is dormant if last purchase 61-90 days ago
    // Customers with no purchase in 90+ days are considered "at risk"
  },

  // RFM segment distribution percentages
  // These define what percentage of customers fall into each segment
  segmentDistribution: {
    champions: 0.05,           // Top 5% - highest value, most frequent
    loyalCustomers: 0.15,      // Next 15% - consistent purchasers
    potentialLoyalists: 0.10,  // New customers showing promise
    recentCustomers: 0.10,     // Recent purchasers
    promising: 0.10,           // Good potential
    needsAttention: 0.15,      // Previously active, slowing down
    aboutToSleep: 0.10,        // At risk of churning
    cantLoseThem: 0.05,        // High value but inactive
    atRisk: 0.10,              // Inactive, needs win-back
    hibernating: 0.10,         // Long inactive, low value
  },

  // Score weights for RFM calculation
  scoreWeights: {
    recency: 0.35,     // How recently they purchased (35%)
    frequency: 0.30,   // How often they purchase (30%)
    monetary: 0.35,    // How much they spend (35%)
  },
} as const;

// ============================================
// ENGAGEMENT METRICS CONFIGURATION
// ============================================

export const ENGAGEMENT_CONFIG = {
  // Habit Strength calculation
  habitStrength: {
    repeatPurchaseWeight: 0.5,  // Weight for repeat purchase factor
    frequencyLiftWeight: 20,    // Multiplier for frequency lift
    maxScore: 100,              // Cap habit strength at 100
    minPurchasesForHabit: 2,    // Need at least 2 purchases to calculate
  },

  // Purchase frequency thresholds
  purchaseFrequency: {
    highFrequency: 14,    // Days - purchasing every 2 weeks or less
    mediumFrequency: 30,  // Days - purchasing monthly
    lowFrequency: 90,     // Days - purchasing quarterly
  },

  // Customer lifetime value calculation
  ltv: {
    defaultProjectionMonths: 12,  // Project LTV over 12 months
    discountRate: 0.1,            // 10% annual discount rate for NPV
  },
} as const;

// ============================================
// COHORT ANALYSIS CONFIGURATION
// ============================================

export const COHORT_CONFIG = {
  // Default number of cohorts to display
  defaultCohortCount: 12,

  // Cohort period options
  periods: {
    weekly: 7,
    monthly: 30,
    quarterly: 90,
  },

  // Retention calculation windows
  retentionWindows: [7, 30, 60, 90, 180, 365],  // Days

  // Minimum cohort size to include in analysis
  minimumCohortSize: 5,
} as const;

// ============================================
// SPENDING ANALYSIS CONFIGURATION
// ============================================

export const SPENDING_CONFIG = {
  // Tier calculation window
  tierEvaluationPeriods: {
    annual: 365,
    quarterly: 90,
    monthly: 30,
    lifetime: Infinity,
  },

  // Average order value bands
  aovBands: {
    low: { min: 0, max: 50 },
    medium: { min: 50, max: 150 },
    high: { min: 150, max: 500 },
    premium: { min: 500, max: Infinity },
  },

  // Spending trend calculation
  trendWindow: {
    short: 30,   // 30 days for short-term trend
    medium: 90,  // 90 days for medium-term trend
    long: 365,   // 365 days for long-term trend
  },
} as const;

// ============================================
// DASHBOARD CONFIGURATION
// ============================================

export const DASHBOARD_CONFIG = {
  // Number of items to show in lists
  topCustomersCount: 10,
  topTiersCount: 5,
  recentActivityCount: 20,

  // Chart configuration
  chartConfig: {
    defaultTimeRange: 30,           // Default to 30 days
    maxDataPoints: 365,             // Maximum data points to show
    aggregationThreshold: 90,       // Aggregate data if range > 90 days
  },

  // Cache TTL for analytics queries (in seconds)
  cacheTtl: {
    realtime: 60,       // 1 minute for realtime metrics
    hourly: 3600,       // 1 hour for hourly aggregates
    daily: 86400,       // 1 day for daily aggregates
  },
} as const;

// ============================================
// EXPORT TYPES
// ============================================

export type RfmConfig = typeof RFM_CONFIG;
export type EngagementConfig = typeof ENGAGEMENT_CONFIG;
export type CohortConfig = typeof COHORT_CONFIG;
export type SpendingConfig = typeof SPENDING_CONFIG;
export type DashboardConfig = typeof DASHBOARD_CONFIG;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get customer recency status based on days since last purchase
 */
export function getRecencyStatus(daysSinceLastPurchase: number): 'active' | 'lapsed' | 'dormant' | 'at-risk' {
  if (daysSinceLastPurchase <= RFM_CONFIG.recencyDays.active) return 'active';
  if (daysSinceLastPurchase <= RFM_CONFIG.recencyDays.lapsed) return 'lapsed';
  if (daysSinceLastPurchase <= RFM_CONFIG.recencyDays.dormant) return 'dormant';
  return 'at-risk';
}

/**
 * Calculate habit strength score
 */
export function calculateHabitStrength(
  repeatPurchaseRate: number,
  purchaseFrequencyLift: number
): number {
  const { repeatPurchaseWeight, frequencyLiftWeight, maxScore } = ENGAGEMENT_CONFIG.habitStrength;

  const rawScore = (repeatPurchaseRate * repeatPurchaseWeight) +
                   (purchaseFrequencyLift * frequencyLiftWeight);

  return Math.min(rawScore, maxScore);
}

/**
 * Get AOV band for an average order value
 */
export function getAovBand(aov: number): 'low' | 'medium' | 'high' | 'premium' {
  const { aovBands } = SPENDING_CONFIG;

  if (aov < aovBands.low.max) return 'low';
  if (aov < aovBands.medium.max) return 'medium';
  if (aov < aovBands.high.max) return 'high';
  return 'premium';
}
