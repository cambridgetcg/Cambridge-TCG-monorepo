/**
 * Feature Gating System
 *
 * This file defines all features and their availability across different plan tiers.
 * Used for both server-side permission checks and client-side UI gating.
 */

// ============================================================================
// Feature Enum
// ============================================================================

export enum Feature {
  // Pro Plan Features
  BATCH_CASHBACK = 'batch_cashback',
  ADVANCED_ANALYTICS = 'advanced_analytics',
  EXPORT_DATA = 'export_data',
  EMAIL_NOTIFICATIONS = 'email_notifications',

  // Max Plan Features
  TIER_MEMBERSHIPS = 'tier_memberships',
  WHITE_LABEL_EMAIL = 'white_label_email',
  CUSTOM_BRANDING = 'custom_branding',
  API_ACCESS = 'api_access',
  PRIORITY_SUPPORT = 'priority_support',

  // Ultra Plan Features
  UNLIMITED_ORDERS = 'unlimited_orders',
  AB_TESTING = 'ab_testing',
  ADVANCED_SEGMENTATION = 'advanced_segmentation',
  WEBHOOKS = 'webhooks',
  DEDICATED_SUPPORT = 'dedicated_support',

  // Enterprise Plan Features
  CUSTOM_MODULES = 'custom_modules',
  MULTI_STORE = 'multi_store',
  CUSTOM_INTEGRATIONS = 'custom_integrations',
  SLA_GUARANTEE = 'sla_guarantee',
  ACCOUNT_MANAGER = 'account_manager',
}

// ============================================================================
// Plan Tier Type
// ============================================================================

export type PlanTier = 'free' | 'pro' | 'max' | 'ultra' | 'enterprise';

// ============================================================================
// Plan Feature Mapping
// ============================================================================

/**
 * Maps each plan tier to its available features
 * Features cascade down - higher tiers include all lower tier features
 */
export const PLAN_FEATURES: Record<PlanTier, Feature[]> = {
  free: [
    // Free plan has basic functionality only (no special features)
  ],

  pro: [
    Feature.BATCH_CASHBACK,
    Feature.ADVANCED_ANALYTICS,
    Feature.EXPORT_DATA,
    Feature.EMAIL_NOTIFICATIONS,
  ],

  max: [
    // Includes all Pro features
    Feature.BATCH_CASHBACK,
    Feature.ADVANCED_ANALYTICS,
    Feature.EXPORT_DATA,
    Feature.EMAIL_NOTIFICATIONS,
    // Plus Max-specific features
    Feature.TIER_MEMBERSHIPS,
    Feature.WHITE_LABEL_EMAIL,
    Feature.CUSTOM_BRANDING,
    Feature.API_ACCESS,
    Feature.PRIORITY_SUPPORT,
  ],

  ultra: [
    // Includes all Pro + Max features
    Feature.BATCH_CASHBACK,
    Feature.ADVANCED_ANALYTICS,
    Feature.EXPORT_DATA,
    Feature.EMAIL_NOTIFICATIONS,
    Feature.TIER_MEMBERSHIPS,
    Feature.WHITE_LABEL_EMAIL,
    Feature.CUSTOM_BRANDING,
    Feature.API_ACCESS,
    Feature.PRIORITY_SUPPORT,
    // Plus Ultra-specific features
    Feature.UNLIMITED_ORDERS,
    Feature.AB_TESTING,
    Feature.ADVANCED_SEGMENTATION,
    Feature.WEBHOOKS,
    Feature.DEDICATED_SUPPORT,
  ],

  enterprise: [
    // Includes all features
    Feature.BATCH_CASHBACK,
    Feature.ADVANCED_ANALYTICS,
    Feature.EXPORT_DATA,
    Feature.EMAIL_NOTIFICATIONS,
    Feature.TIER_MEMBERSHIPS,
    Feature.WHITE_LABEL_EMAIL,
    Feature.CUSTOM_BRANDING,
    Feature.API_ACCESS,
    Feature.PRIORITY_SUPPORT,
    Feature.UNLIMITED_ORDERS,
    Feature.AB_TESTING,
    Feature.ADVANCED_SEGMENTATION,
    Feature.WEBHOOKS,
    Feature.DEDICATED_SUPPORT,
    // Plus Enterprise-specific features
    Feature.CUSTOM_MODULES,
    Feature.MULTI_STORE,
    Feature.CUSTOM_INTEGRATIONS,
    Feature.SLA_GUARANTEE,
    Feature.ACCOUNT_MANAGER,
  ],
};

// ============================================================================
// Plan Name to Tier Mapping
// ============================================================================

/**
 * Maps Shopify billing plan names to plan tiers
 * Handles both monthly and annual plans
 */
export const PLAN_NAME_TO_TIER: Record<string, PlanTier> = {
  'RewardsPro Free': 'free',
  'RewardsPro Pro': 'pro',
  'RewardsPro Pro Annual': 'pro',
  'RewardsPro Max': 'max',
  'RewardsPro Max Annual': 'max',
  'RewardsPro Ultra': 'ultra',
  'RewardsPro Ultra Annual': 'ultra',
  'RewardsPro Enterprise': 'enterprise',
};

// ============================================================================
// Feature Metadata
// ============================================================================

/**
 * Human-readable feature information for UI display
 */
export const FEATURE_METADATA: Record<Feature, {
  name: string;
  description: string;
  minimumPlan: PlanTier;
  icon?: string; // Polaris icon name
}> = {
  // Pro Features
  [Feature.BATCH_CASHBACK]: {
    name: 'Batch Cashback Processing',
    description: 'Process cashback rewards for multiple orders at once',
    minimumPlan: 'pro',
    icon: 'RefreshIcon',
  },
  [Feature.ADVANCED_ANALYTICS]: {
    name: 'Advanced Analytics',
    description: 'Detailed insights and reporting on your loyalty program',
    minimumPlan: 'pro',
    icon: 'AnalyticsIcon',
  },
  [Feature.EXPORT_DATA]: {
    name: 'Data Export',
    description: 'Export customer and transaction data to CSV',
    minimumPlan: 'pro',
    icon: 'ExportIcon',
  },
  [Feature.EMAIL_NOTIFICATIONS]: {
    name: 'Email Notifications',
    description: 'Automated email notifications for tier changes and rewards',
    minimumPlan: 'pro',
    icon: 'EmailIcon',
  },

  // Max Features
  [Feature.TIER_MEMBERSHIPS]: {
    name: 'Tier Membership Products',
    description: 'Create paid tier membership products in your store',
    minimumPlan: 'max',
    icon: 'ProductIcon',
  },
  [Feature.WHITE_LABEL_EMAIL]: {
    name: 'White Label Emails',
    description: 'Customize email templates with your branding',
    minimumPlan: 'max',
    icon: 'EmailIcon',
  },
  [Feature.CUSTOM_BRANDING]: {
    name: 'Custom Branding',
    description: 'Customize the loyalty widget with your brand colors and logo',
    minimumPlan: 'max',
    icon: 'PaintBrushIcon',
  },
  [Feature.API_ACCESS]: {
    name: 'API Access',
    description: 'Integrate RewardsPro with other apps using our REST API',
    minimumPlan: 'max',
    icon: 'CodeIcon',
  },
  [Feature.PRIORITY_SUPPORT]: {
    name: 'Priority Support',
    description: '24/7 priority customer support with faster response times',
    minimumPlan: 'max',
    icon: 'ChatIcon',
  },

  // Ultra Features
  [Feature.UNLIMITED_ORDERS]: {
    name: 'Unlimited Orders',
    description: 'No monthly order limits - process unlimited orders',
    minimumPlan: 'ultra',
    icon: 'InfiniteIcon',
  },
  [Feature.AB_TESTING]: {
    name: 'A/B Testing',
    description: 'Test different reward strategies to optimize conversions',
    minimumPlan: 'ultra',
    icon: 'TestIcon',
  },
  [Feature.ADVANCED_SEGMENTATION]: {
    name: 'Advanced Segmentation',
    description: 'Create custom customer segments for targeted campaigns',
    minimumPlan: 'ultra',
    icon: 'SegmentIcon',
  },
  [Feature.WEBHOOKS]: {
    name: 'Webhooks',
    description: 'Receive real-time notifications of loyalty events',
    minimumPlan: 'ultra',
    icon: 'NotificationIcon',
  },
  [Feature.DEDICATED_SUPPORT]: {
    name: 'Dedicated Support',
    description: 'Dedicated support agent for your account',
    minimumPlan: 'ultra',
    icon: 'PersonIcon',
  },

  // Enterprise Features
  [Feature.CUSTOM_MODULES]: {
    name: 'Custom Modules',
    description: 'Custom-built features tailored to your business needs',
    minimumPlan: 'enterprise',
    icon: 'AppsIcon',
  },
  [Feature.MULTI_STORE]: {
    name: 'Multi-Store Support',
    description: 'Manage loyalty programs across multiple Shopify stores',
    minimumPlan: 'enterprise',
    icon: 'StoreIcon',
  },
  [Feature.CUSTOM_INTEGRATIONS]: {
    name: 'Custom Integrations',
    description: 'Bespoke integrations with your existing systems',
    minimumPlan: 'enterprise',
    icon: 'ConnectIcon',
  },
  [Feature.SLA_GUARANTEE]: {
    name: 'SLA Guarantee',
    description: '99.9% uptime guarantee with SLA agreement',
    minimumPlan: 'enterprise',
    icon: 'CheckmarkIcon',
  },
  [Feature.ACCOUNT_MANAGER]: {
    name: 'Account Manager',
    description: 'Dedicated account manager for strategic guidance',
    minimumPlan: 'enterprise',
    icon: 'ProfileIcon',
  },
};

// ============================================================================
// Upgrade Paths
// ============================================================================

/**
 * Defines the upgrade path for each plan tier
 * Used to suggest the next tier when a feature is not available
 */
export const UPGRADE_PATH: Record<PlanTier, PlanTier | null> = {
  free: 'pro',
  pro: 'max',
  max: 'ultra',
  ultra: 'enterprise',
  enterprise: null, // No upgrade available
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the plan tier from a Shopify plan name
 */
export function getPlanTier(planName: string | null | undefined): PlanTier {
  if (!planName) return 'free';
  return PLAN_NAME_TO_TIER[planName] || 'free';
}

/**
 * Get all features available for a plan tier
 */
export function getPlanFeatures(tier: PlanTier): Feature[] {
  return PLAN_FEATURES[tier] || [];
}

/**
 * Check if a plan tier has access to a specific feature
 */
export function hasFeature(tier: PlanTier, feature: Feature): boolean {
  return PLAN_FEATURES[tier]?.includes(feature) || false;
}

/**
 * Get the minimum plan tier required for a feature
 */
export function getMinimumPlanForFeature(feature: Feature): PlanTier {
  return FEATURE_METADATA[feature]?.minimumPlan || 'enterprise';
}

/**
 * Get the next upgrade tier for a plan
 */
export function getUpgradeTier(currentTier: PlanTier): PlanTier | null {
  return UPGRADE_PATH[currentTier];
}

/**
 * Get human-readable feature information
 */
export function getFeatureMetadata(feature: Feature) {
  return FEATURE_METADATA[feature] || {
    name: feature,
    description: 'Feature description not available',
    minimumPlan: 'enterprise' as PlanTier,
  };
}
