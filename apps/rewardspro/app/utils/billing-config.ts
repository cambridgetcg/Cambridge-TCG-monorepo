/**
 * Billing Configuration
 * Centralized configuration for GraphQL billing migration
 */

export interface PlanConfig {
  name: string;
  price: string; // String format for MoneyInput
  orderLimit: number;
  usageRate?: string; // Price per order overage
  usageCap?: string; // Maximum usage charge per month
  usageTerms?: string; // Description of usage pricing
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

/**
 * Main billing configuration
 * Controls feature flags and plan definitions
 */
export const BillingConfig: BillingConfigType = {
  // Feature flag for GraphQL billing
  useNewBilling: process.env.USE_NEW_BILLING === 'true',
  isDevelopment: process.env.NODE_ENV === 'development',

  // Plan definitions - RATE-BASED MODEL
  // All plans have access to all features - differentiation is through LIMITS
  plans: {
    free: {
      name: "RewardsPro Free",
      price: "0.00",
      orderLimit: 50,
      features: [
        "All features included",
        "50 orders/month",
        "500 customers",
        "50 emails/month",
        "2 membership tiers",
        "7 days analytics history"
      ]
    },
    pro: {
      name: "RewardsPro Pro",
      price: "39.00",
      orderLimit: 500,
      usageRate: "0.10", // $0.10 per order over limit ($10 per 100 orders)
      usageCap: "50.00", // Max $50 additional charges
      usageTerms: "$10 per 100 additional orders over 500 orders/month (max $50/month)",
      features: [
        "All features included",
        "500 orders/month",
        "5,000 customers",
        "500 emails/month",
        "5 membership tiers",
        "30 days analytics history"
      ],
      trialDays: 7
    },
    proAnnual: {
      name: "RewardsPro Pro Annual",
      price: "336.00", // $28/month billed annually - 28% discount
      orderLimit: 500,
      usageRate: "0.10",
      usageCap: "50.00",
      usageTerms: "$10 per 100 additional orders over 500 orders/month (max $50/month)",
      features: [
        "All features included",
        "500 orders/month",
        "5,000 customers",
        "500 emails/month",
        "5 membership tiers",
        "30 days analytics history",
        "💰 Save $132/year (28% discount)"
      ],
      trialDays: 7
    },
    max: {
      name: "RewardsPro Max",
      price: "149.00",
      orderLimit: 2000,
      usageRate: "0.05", // $0.05 per order over limit ($5 per 100 orders)
      usageCap: "100.00", // Max $100 additional charges
      usageTerms: "$5 per 100 additional orders over 2,000 orders/month (max $100/month)",
      features: [
        "All features included",
        "2,000 orders/month",
        "25,000 customers",
        "2,000 emails/month",
        "10 membership tiers",
        "90 days analytics history"
      ],
      trialDays: 7
    },
    maxAnnual: {
      name: "RewardsPro Max Annual",
      price: "1296.00", // $108/month billed annually - 27% discount
      orderLimit: 2000,
      usageRate: "0.05",
      usageCap: "100.00",
      usageTerms: "$5 per 100 additional orders over 2,000 orders/month (max $100/month)",
      features: [
        "All features included",
        "2,000 orders/month",
        "25,000 customers",
        "2,000 emails/month",
        "10 membership tiers",
        "90 days analytics history",
        "💰 Save $492/year (27% discount)"
      ],
      trialDays: 7
    },
    ultra: {
      name: "RewardsPro Ultra",
      price: "499.00",
      orderLimit: 999999, // Effectively unlimited
      features: [
        "All features included",
        "Unlimited orders",
        "Unlimited customers",
        "Unlimited emails",
        "Unlimited tiers",
        "Unlimited analytics history",
        "Dedicated support"
      ],
      trialDays: 14
    },
    ultraAnnual: {
      name: "RewardsPro Ultra Annual",
      price: "4296.00", // $358/month billed annually - 28% discount
      orderLimit: 999999,
      features: [
        "All features included",
        "Unlimited orders",
        "Unlimited customers",
        "Unlimited emails",
        "Unlimited tiers",
        "Unlimited analytics history",
        "Dedicated support",
        "💰 Save $1,692/year (28% discount)"
      ],
      trialDays: 14
    },
    // Legacy plans - keeping for backward compatibility
    starter: {
      name: "Starter Plan",
      price: "49.00",
      orderLimit: 1000,
      usageRate: "0.001",
      usageCap: "50.00",
      features: [
        "1,000 orders/month",
        "Advanced tiers",
        "Priority email support",
        "Analytics dashboard"
      ],
      trialDays: 7
    },
    growth: {
      name: "Growth Plan",
      price: "99.00",
      orderLimit: 10000,
      usageRate: "0.001",
      usageCap: "100.00",
      features: [
        "10,000 orders/month",
        "Unlimited tiers",
        "Priority support",
        "Advanced analytics",
        "Custom branding"
      ],
      trialDays: 7
    },
    enterprise: {
      name: "Enterprise",
      price: "299.00",
      orderLimit: -1,
      features: [
        "Unlimited orders",
        "Dedicated support",
        "Custom features",
        "API access",
        "White-label options"
      ],
      trialDays: 14
    }
  },

  // Global trial period (can be overridden per plan)
  trialDays: 7,

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
export function getCurrencyCode(shop?: string): string {
  // TODO: Could look up shop settings for currency
  return "USD";
}