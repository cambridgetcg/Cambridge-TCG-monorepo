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
  features: string[];
  trialDays?: number;
}

export interface BillingConfigType {
  useNewBilling: boolean;
  isDevelopment: boolean;
  plans: {
    free: PlanConfig;
    starter: PlanConfig;
    growth: PlanConfig;
    enterprise?: PlanConfig;
  };
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

  // Plan definitions
  plans: {
    free: {
      name: "Free Plan",
      price: "0.00",
      orderLimit: 200,
      features: [
        "Basic loyalty tiers",
        "200 orders/month",
        "Email support"
      ]
    },
    starter: {
      name: "Starter Plan",
      price: "49.00",
      orderLimit: 1000,
      usageRate: "0.001", // $0.001 per order over limit
      usageCap: "50.00", // Max $50 additional charges
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
      orderLimit: -1, // Unlimited
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
 * Helper to determine if shop is on development store
 */
export function isDevelopmentStore(shopDomain: string): boolean {
  const devPatterns = [
    '.myshopify.io',
    '-dev.myshopify.com',
    'development-',
    '-staging'
  ];

  return devPatterns.some(pattern => shopDomain.includes(pattern));
}

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