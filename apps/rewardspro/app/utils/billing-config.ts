/**
 * Billing Configuration
 * Centralized configuration for GraphQL billing migration
 */

import {
  PRICING_PLANS,
  getPlanFeatureSummary,
  type PlanKey,
} from "~/constants/pricing-contract";

export interface PlanConfig {
  name: string;
  price: string; // String format for MoneyInput
  orderLimit: number;
  features: string[];
  trialDays?: number;
}

export interface BillingConfigType {
  useNewBilling: boolean;
  isDevelopment: boolean;
  plans: Record<string, PlanConfig>;
  trialDays: number;
  replacementBehavior: {
    upgrade: string;
    downgrade: string;
  };
  gracePeriodDays: number;
  migrationDeadline: Date;
}

function createPlanConfig(
  planKey: PlanKey,
  interval: "month" | "year" = "month",
): PlanConfig {
  const plan = PRICING_PLANS[planKey];
  const annualPrice = plan.annualPrice;
  const isAnnual = interval === "year" && annualPrice !== null;

  return {
    name: isAnnual && plan.annualBillingName
      ? plan.annualBillingName
      : plan.billingName,
    price: (isAnnual ? annualPrice : plan.monthlyPrice).toFixed(2),
    orderLimit: plan.limits.orders,
    features: getPlanFeatureSummary(planKey),
    trialDays: plan.trialDays,
  };
}

function createBillingPlans(): Record<string, PlanConfig> {
  const free = createPlanConfig("free");
  const pro = createPlanConfig("pro");
  const max = createPlanConfig("max");
  const ultra = createPlanConfig("ultra");
  const enterprise = createPlanConfig("enterprise");

  return {
    free,
    pro,
    proAnnual: createPlanConfig("pro", "year"),
    max,
    maxAnnual: createPlanConfig("max", "year"),
    ultra,
    ultraAnnual: createPlanConfig("ultra", "year"),
    enterprise,

    // Compatibility aliases. They create the current fixed-price plans while
    // legacy subscription names remain readable through the plan normalizer.
    starter: { ...pro },
    growth: { ...max },
    grow: { ...pro },
    scale: { ...max },
    corporate: { ...ultra },
  };
}

/**
 * Main billing configuration
 * Controls feature flags and plan definitions
 */
export const BillingConfig: BillingConfigType = {
  // Feature flag for GraphQL billing
  useNewBilling: process.env.USE_NEW_BILLING === 'true',
  isDevelopment: process.env.NODE_ENV === 'development',

  // Fixed recurring plans only. Legacy IDs below resolve to a current plan;
  // no path creates a new usage-priced subscription.
  plans: createBillingPlans(),

  // Global trial period (can be overridden per plan)
  trialDays: 0,

  // Replacement behavior for plan changes
  replacementBehavior: {
    upgrade: "STANDARD", // Immediate with proration
    downgrade: "APPLY_ON_NEXT_BILLING_CYCLE" // Deferred to next period
  },

  // Migration settings
  gracePeriodDays: 60, // Days to allow both systems
  migrationDeadline: new Date('2025-04-01') // Final deadline for migration
};

/**
 * Test mode detection utilities
 * Re-exported from centralized billing test mode utility
 */
export {
  checkDevStoreByDomain as isDevelopmentStore,
  getTestMode,
  isTestMode,
  clearTestModeCache,
  getTestModeCacheStats
} from "./billing-test-mode.server";

/**
 * Get plan configuration by type
 */
export function getPlanConfig(planType: string): PlanConfig | undefined {
  return BillingConfig.plans[planType as keyof typeof BillingConfig.plans];
}

/**
 * Check if migration grace period has expired
 */
export function isGracePeriodExpired(): boolean {
  return new Date() > BillingConfig.migrationDeadline;
}

/**
 * Determine if shop should use new billing
 */
export async function shouldUseNewBilling(shop: string, billingVersion?: string): Promise<boolean> {
  // Force new billing after migration deadline
  if (isGracePeriodExpired()) {
    return true;
  }

  // Check if shop has explicitly migrated
  if (billingVersion === 'graphql') {
    return true;
  }

  // Use feature flag for gradual rollout
  return BillingConfig.useNewBilling;
}

/**
 * Format price for GraphQL MoneyInput
 * Ensures string format with 2 decimal places
 */
export function formatMoneyInput(amount: number | string): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return numAmount.toFixed(2);
}

/**
 * Get currency code (could be extended to support multiple currencies)
 */
export function getCurrencyCode(_shop?: string): string {
  // TODO: Could look up shop settings for currency
  return "USD";
}
