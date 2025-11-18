/**
 * Plan-based feature limits and restrictions
 * Defines what features are available at each billing tier
 */

import {
  FREE_PLAN,
  PRO_PLAN,
  MAX_PLAN,
  ULTRA_PLAN,
  ENTERPRISE_PLAN,
  STARTER_PLAN,
  GROWTH_PLAN,
} from "../constants/plans";

// Plan hierarchy (higher number = higher tier)
export const PLAN_HIERARCHY = {
  [FREE_PLAN]: 0,
  [STARTER_PLAN]: 1, // Legacy
  [PRO_PLAN]: 2,
  [GROWTH_PLAN]: 3, // Legacy
  [MAX_PLAN]: 4,
  [ULTRA_PLAN]: 5,
  [ENTERPRISE_PLAN]: 6,
} as const;

// Feature limits per plan
export const PLAN_LIMITS = {
  [FREE_PLAN]: {
    // Core Limits
    maxTiers: 2,
    maxCustomers: Infinity, // No customer limit
    maxOrders: 50,

    // Feature Access
    customEmail: false,
    apiAccess: false,
    advancedReporting: false,
    exportData: false,
    customBranding: false,
    prioritySupport: false,
    dedicatedManager: false,

    // Tier Features
    subscriptionTiers: false,
    purchasableTiers: false,
    lifetimeTiers: false,
    annualEvaluationPeriod: false,

    // Email Features
    emailNotifications: false,
    customEmailTemplates: false,
    whiteLabel: false,

    // Advanced Features
    webhookIntegrations: false,
    customRewards: false,
    bulkOperations: false,
  },

  [PRO_PLAN]: {
    // Core Limits
    maxTiers: 5,
    maxCustomers: Infinity, // No customer limit
    maxOrders: 500,

    // Feature Access
    customEmail: false,
    apiAccess: false,
    advancedReporting: true,
    exportData: true,
    customBranding: false,
    prioritySupport: false,
    dedicatedManager: false,

    // Tier Features
    subscriptionTiers: true,
    purchasableTiers: true,
    lifetimeTiers: true,
    annualEvaluationPeriod: false,

    // Email Features
    emailNotifications: true,
    customEmailTemplates: false,
    whiteLabel: false,

    // Advanced Features
    webhookIntegrations: false,
    customRewards: true,
    bulkOperations: true,
  },

  [MAX_PLAN]: {
    // Core Limits
    maxTiers: 10,
    maxCustomers: Infinity, // No customer limit
    maxOrders: 5000,

    // Feature Access
    customEmail: true,
    apiAccess: false,
    advancedReporting: true,
    exportData: true,
    customBranding: true,
    prioritySupport: true,
    dedicatedManager: false,

    // Tier Features
    subscriptionTiers: true,
    purchasableTiers: true,
    lifetimeTiers: true,
    annualEvaluationPeriod: false,

    // Email Features
    emailNotifications: true,
    customEmailTemplates: true,
    whiteLabel: true,

    // Advanced Features
    webhookIntegrations: true,
    customRewards: true,
    bulkOperations: true,
  },

  [ULTRA_PLAN]: {
    // Core Limits (unlimited)
    maxTiers: Infinity,
    maxCustomers: Infinity,
    maxOrders: Infinity,

    // Feature Access
    customEmail: true,
    apiAccess: true,
    advancedReporting: true,
    exportData: true,
    customBranding: true,
    prioritySupport: true,
    dedicatedManager: false,

    // Tier Features
    subscriptionTiers: true,
    purchasableTiers: true,
    lifetimeTiers: true,
    annualEvaluationPeriod: true,

    // Email Features
    emailNotifications: true,
    customEmailTemplates: true,
    whiteLabel: true,

    // Advanced Features
    webhookIntegrations: true,
    customRewards: true,
    bulkOperations: true,
  },

  [ENTERPRISE_PLAN]: {
    // Core Limits (unlimited)
    maxTiers: Infinity,
    maxCustomers: Infinity,
    maxOrders: Infinity,

    // Feature Access
    customEmail: true,
    apiAccess: true,
    advancedReporting: true,
    exportData: true,
    customBranding: true,
    prioritySupport: true,
    dedicatedManager: true,

    // Tier Features
    subscriptionTiers: true,
    purchasableTiers: true,
    lifetimeTiers: true,
    annualEvaluationPeriod: true,

    // Email Features
    emailNotifications: true,
    customEmailTemplates: true,
    whiteLabel: true,

    // Advanced Features
    webhookIntegrations: true,
    customRewards: true,
    bulkOperations: true,
  },

  // Legacy plans
  [STARTER_PLAN]: {
    // Same as PRO
    maxTiers: 5,
    maxCustomers: Infinity, // No customer limit
    maxOrders: 500,
    customEmail: false,
    apiAccess: false,
    advancedReporting: true,
    exportData: true,
    customBranding: false,
    prioritySupport: false,
    dedicatedManager: false,
    subscriptionTiers: true,
    purchasableTiers: true,
    lifetimeTiers: true,
    annualEvaluationPeriod: false,
    emailNotifications: true,
    customEmailTemplates: false,
    whiteLabel: false,
    webhookIntegrations: false,
    customRewards: true,
    bulkOperations: true,
  },

  [GROWTH_PLAN]: {
    // Same as MAX
    maxTiers: 10,
    maxCustomers: Infinity, // No customer limit
    maxOrders: 5000,
    customEmail: true,
    apiAccess: false,
    advancedReporting: true,
    exportData: true,
    customBranding: true,
    prioritySupport: true,
    dedicatedManager: false,
    subscriptionTiers: true,
    purchasableTiers: true,
    lifetimeTiers: true,
    annualEvaluationPeriod: false,
    emailNotifications: true,
    customEmailTemplates: true,
    whiteLabel: true,
    webhookIntegrations: true,
    customRewards: true,
    bulkOperations: true,
  },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;
export type FeatureName = keyof typeof PLAN_LIMITS[typeof FREE_PLAN];

/**
 * Get the current plan for a shop from BillingPlan or BillingSubscription
 */
export function getCurrentPlan(
  billingPlan?: { planName: string } | null,
  billingSubscription?: { planType: string } | null
): PlanName {
  // Check BillingSubscription first (GraphQL API)
  if (billingSubscription?.planType) {
    const planType = billingSubscription.planType.toLowerCase();
    if (planType === 'free') return FREE_PLAN;
    if (planType === 'starter') return STARTER_PLAN;
    if (planType === 'pro') return PRO_PLAN;
    if (planType === 'growth') return GROWTH_PLAN;
    if (planType === 'max') return MAX_PLAN;
    if (planType === 'ultra') return ULTRA_PLAN;
    if (planType === 'enterprise') return ENTERPRISE_PLAN;
  }

  // Check BillingPlan (legacy)
  if (billingPlan?.planName) {
    const planName = billingPlan.planName;
    if (planName in PLAN_LIMITS) {
      return planName as PlanName;
    }
  }

  // Default to free plan
  return FREE_PLAN;
}

/**
 * Check if a feature is available for a plan
 */
export function hasFeature(planName: PlanName, feature: FeatureName): boolean {
  const limits = PLAN_LIMITS[planName] || PLAN_LIMITS[FREE_PLAN];
  return limits[feature] === true;
}

/**
 * Get the limit value for a plan
 */
export function getLimit(planName: PlanName, limit: FeatureName): number | boolean {
  const limits = PLAN_LIMITS[planName] || PLAN_LIMITS[FREE_PLAN];
  return limits[limit];
}

/**
 * Check if current usage is within plan limits
 */
export function isWithinLimit(
  planName: PlanName,
  limit: 'maxTiers' | 'maxCustomers' | 'maxOrders',
  currentCount: number
): boolean {
  const maxLimit = getLimit(planName, limit);
  if (typeof maxLimit !== 'number') return true;
  return currentCount < maxLimit;
}

/**
 * Get required plan for a feature
 */
export function getRequiredPlan(feature: FeatureName): PlanName {
  // Find the lowest tier plan that has this feature
  const plans: PlanName[] = [FREE_PLAN, PRO_PLAN, MAX_PLAN, ULTRA_PLAN, ENTERPRISE_PLAN];

  for (const plan of plans) {
    if (hasFeature(plan, feature)) {
      return plan;
    }
  }

  return ENTERPRISE_PLAN; // If not found, require highest tier
}

/**
 * Compare two plans (returns true if plan1 >= plan2)
 */
export function isPlanAtLeast(plan1: PlanName, plan2: PlanName): boolean {
  const hierarchy1 = PLAN_HIERARCHY[plan1] ?? 0;
  const hierarchy2 = PLAN_HIERARCHY[plan2] ?? 0;
  return hierarchy1 >= hierarchy2;
}

/**
 * Get upgrade message for a feature
 */
export function getUpgradeMessage(feature: FeatureName): string {
  const requiredPlan = getRequiredPlan(feature);

  const messages: Record<FeatureName, string> = {
    maxTiers: `Upgrade to ${requiredPlan} to create more tiers`,
    maxCustomers: `Upgrade to ${requiredPlan} to add more customers`,
    maxOrders: `Upgrade to ${requiredPlan} to process more orders`,
    customEmail: `Upgrade to ${requiredPlan} to customize email settings`,
    apiAccess: `Upgrade to ${requiredPlan} for API access`,
    advancedReporting: `Upgrade to ${requiredPlan} for advanced reporting`,
    exportData: `Upgrade to ${requiredPlan} to export data`,
    customBranding: `Upgrade to ${requiredPlan} for custom branding`,
    prioritySupport: `Upgrade to ${requiredPlan} for priority support`,
    dedicatedManager: `Upgrade to ${requiredPlan} for a dedicated account manager`,
    subscriptionTiers: `Upgrade to ${requiredPlan} to enable subscription tiers`,
    purchasableTiers: `Upgrade to ${requiredPlan} to enable purchasable tiers`,
    lifetimeTiers: `Upgrade to ${requiredPlan} to enable lifetime tiers`,
    annualEvaluationPeriod: `Upgrade to ${requiredPlan} to enable annual tier evaluation`,
    emailNotifications: `Upgrade to ${requiredPlan} to enable email notifications`,
    customEmailTemplates: `Upgrade to ${requiredPlan} for custom email templates`,
    whiteLabel: `Upgrade to ${requiredPlan} for white-label email branding`,
    webhookIntegrations: `Upgrade to ${requiredPlan} for webhook integrations`,
    customRewards: `Upgrade to ${requiredPlan} for custom rewards`,
    bulkOperations: `Upgrade to ${requiredPlan} for bulk operations`,
  };

  return messages[feature] || `Upgrade to ${requiredPlan} to unlock this feature`;
}

/**
 * Get plan display name and description
 */
export function getPlanInfo(planName: PlanName) {
  const info = {
    [FREE_PLAN]: {
      name: 'Free',
      description: 'Perfect for getting started',
      price: 'Free',
    },
    [PRO_PLAN]: {
      name: 'Pro',
      description: 'For growing businesses',
      price: '$49/month',
    },
    [MAX_PLAN]: {
      name: 'Max',
      description: 'Advanced features for scaling',
      price: '$149/month',
    },
    [ULTRA_PLAN]: {
      name: 'Ultra',
      description: 'Unlimited everything',
      price: '$499/month',
    },
    [ENTERPRISE_PLAN]: {
      name: 'Enterprise',
      description: 'Custom solutions for large teams',
      price: 'Custom',
    },
    [STARTER_PLAN]: {
      name: 'Starter (Legacy)',
      description: 'For growing businesses',
      price: '$29/month',
    },
    [GROWTH_PLAN]: {
      name: 'Growth (Legacy)',
      description: 'Advanced features for scaling',
      price: '$79/month',
    },
  };

  return info[planName] || info[FREE_PLAN];
}
