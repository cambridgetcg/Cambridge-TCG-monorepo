/**
 * Feature Registry - Path Foundation for Extensibility
 *
 * PURPOSE:
 * Centralized registry for discovering, enabling, and configuring features.
 * This pattern enables:
 * - Easy addition of new features (referrals, A/B testing, etc.)
 * - Feature flags with shop-level granularity
 * - Feature dependencies and prerequisites
 * - Runtime feature discovery for UI
 *
 * USAGE:
 * ```typescript
 * // Register a feature
 * featureRegistry.register({
 *   id: 'referrals',
 *   name: 'Referral Program',
 *   category: 'engagement',
 *   dependencies: ['points'],
 *   isEnabled: async (shop) => checkReferralsEnabled(shop),
 * });
 *
 * // Check if feature is available
 * const available = await featureRegistry.isAvailable('referrals', shop);
 *
 * // Get all features for UI
 * const features = await featureRegistry.getAvailableFeatures(shop);
 * ```
 */

import { db } from "~/db.server";

// ============================================================================
// Types
// ============================================================================

export type FeatureCategory =
  | 'core'           // Tier system, basic points
  | 'engagement'     // Raffles, mystery boxes, challenges, referrals
  | 'marketing'      // Email, Klaviyo, campaigns
  | 'analytics'      // Insights, predictions, A/B testing
  | 'integrations';  // Third-party integrations

export type FeatureStatus = 'active' | 'beta' | 'coming_soon' | 'deprecated';

export interface FeatureDefinition {
  id: string;
  name: string;
  description: string;
  category: FeatureCategory;
  status: FeatureStatus;

  // Dependencies - other feature IDs that must be enabled
  dependencies?: string[];

  // Plan requirements - minimum plan level
  minPlan?: 'free' | 'starter' | 'growth' | 'enterprise';

  // Check if feature is enabled for a shop
  isEnabled: (shop: string) => Promise<boolean>;

  // Optional: Get feature configuration
  getConfig?: (shop: string) => Promise<Record<string, any>>;

  // Optional: Feature-specific routes
  routes?: {
    admin?: string;      // Admin UI route
    api?: string;        // API endpoint prefix
    storefront?: string; // Storefront proxy path
  };

  // Optional: Event hooks this feature provides
  hooks?: string[];

  // Optional: Icon for UI
  icon?: string;
}

export interface FeatureInstance {
  definition: FeatureDefinition;
  enabled: boolean;
  config?: Record<string, any>;
}

// ============================================================================
// Feature Registry Class
// ============================================================================

class FeatureRegistry {
  private features: Map<string, FeatureDefinition> = new Map();
  private initialized = false;

  /**
   * Register a feature definition
   */
  register(definition: FeatureDefinition): void {
    if (this.features.has(definition.id)) {
      console.warn(`[FeatureRegistry] Feature '${definition.id}' already registered, overwriting`);
    }
    this.features.set(definition.id, definition);
    console.log(`[FeatureRegistry] Registered feature: ${definition.id}`);
  }

  /**
   * Get a feature definition by ID
   */
  get(id: string): FeatureDefinition | undefined {
    return this.features.get(id);
  }

  /**
   * Check if a feature is available for a shop
   * Checks: existence, dependencies, plan, enabled status
   */
  async isAvailable(featureId: string, shop: string): Promise<boolean> {
    const feature = this.features.get(featureId);
    if (!feature) return false;

    // Check dependencies first
    if (feature.dependencies) {
      for (const depId of feature.dependencies) {
        const depAvailable = await this.isAvailable(depId, shop);
        if (!depAvailable) return false;
      }
    }

    // Check plan requirements
    if (feature.minPlan) {
      const hasAccess = await this.checkPlanAccess(shop, feature.minPlan);
      if (!hasAccess) return false;
    }

    // Check feature-specific enabled status
    return feature.isEnabled(shop);
  }

  /**
   * Get all available features for a shop
   */
  async getAvailableFeatures(shop: string): Promise<FeatureInstance[]> {
    const results: FeatureInstance[] = [];

    for (const [id, definition] of this.features) {
      const enabled = await this.isAvailable(id, shop);
      const config = enabled && definition.getConfig
        ? await definition.getConfig(shop)
        : undefined;

      results.push({ definition, enabled, config });
    }

    return results;
  }

  /**
   * Get features by category
   */
  async getFeaturesByCategory(
    shop: string,
    category: FeatureCategory
  ): Promise<FeatureInstance[]> {
    const all = await this.getAvailableFeatures(shop);
    return all.filter(f => f.definition.category === category);
  }

  /**
   * Get feature dependencies tree
   */
  getDependencyTree(featureId: string): string[] {
    const feature = this.features.get(featureId);
    if (!feature || !feature.dependencies) return [];

    const deps: string[] = [];
    for (const depId of feature.dependencies) {
      deps.push(depId);
      deps.push(...this.getDependencyTree(depId));
    }
    return [...new Set(deps)];
  }

  /**
   * Check plan access for a feature
   */
  private async checkPlanAccess(shop: string, minPlan: string): Promise<boolean> {
    const planHierarchy = ['free', 'starter', 'growth', 'enterprise'];

    try {
      const entitlements = await db.shopEntitlements.findUnique({
        where: { shop },
        select: { planId: true },
      });

      const currentPlan = entitlements?.planId || 'free';
      const currentLevel = planHierarchy.indexOf(currentPlan);
      const requiredLevel = planHierarchy.indexOf(minPlan);

      return currentLevel >= requiredLevel;
    } catch {
      return false;
    }
  }

  /**
   * Initialize built-in features
   */
  initializeBuiltInFeatures(): void {
    if (this.initialized) return;

    // Core features
    this.register({
      id: 'tiers',
      name: 'Tier System',
      description: 'Customer tiers with spending-based progression',
      category: 'core',
      status: 'active',
      isEnabled: async () => true, // Always enabled
      routes: { admin: '/app/members/tiers' },
      hooks: ['tier.changed', 'tier.upgraded', 'tier.downgraded'],
    });

    this.register({
      id: 'points',
      name: 'Points System',
      description: 'Earn and redeem points for rewards',
      category: 'core',
      status: 'active',
      isEnabled: async (shop) => {
        const config = await db.pointsConfig.findUnique({ where: { shop } });
        return config?.enabled ?? false;
      },
      getConfig: async (shop) => {
        const config = await db.pointsConfig.findUnique({ where: { shop } });
        return config ? {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
          earnRatio: config.earnRatio,
        } : {};
      },
      routes: { admin: '/app/rewards/config', storefront: '/membership' },
      hooks: ['points.earned', 'points.redeemed', 'points.expired'],
    });

    this.register({
      id: 'cashback',
      name: 'Store Credit Cashback',
      description: 'Automatic cashback as store credit',
      category: 'core',
      status: 'active',
      dependencies: ['tiers'],
      isEnabled: async (shop) => {
        const settings = await db.shopSettings.findUnique({ where: { shop } });
        return settings?.cashbackEnabled ?? false;
      },
      hooks: ['cashback.issued', 'cashback.redeemed'],
    });

    // Engagement features
    this.register({
      id: 'raffles',
      name: 'Raffles',
      description: 'Points-based raffle drawings',
      category: 'engagement',
      status: 'active',
      dependencies: ['points'],
      minPlan: 'growth',
      isEnabled: async (shop) => {
        const config = await db.pointsConfig.findUnique({ where: { shop } });
        return config?.rafflesEnabled ?? false;
      },
      routes: { admin: '/app/rewards/raffles', storefront: '/raffles' },
      hooks: ['raffle.entered', 'raffle.drawn', 'raffle.won'],
    });

    this.register({
      id: 'mystery-boxes',
      name: 'Mystery Boxes',
      description: 'Points-based mystery rewards',
      category: 'engagement',
      status: 'active',
      dependencies: ['points'],
      minPlan: 'growth',
      isEnabled: async (shop) => {
        const config = await db.pointsConfig.findUnique({ where: { shop } });
        return config?.mysteryBoxEnabled ?? false;
      },
      routes: { admin: '/app/rewards/mystery-boxes', storefront: '/mystery-boxes' },
      hooks: ['mystery-box.opened', 'mystery-box.reward-claimed'],
    });

    this.register({
      id: 'challenges',
      name: 'Challenges',
      description: 'Goal-based challenges with rewards',
      category: 'engagement',
      status: 'active',
      dependencies: ['points'],
      minPlan: 'growth',
      isEnabled: async (shop) => {
        const config = await db.pointsConfig.findUnique({ where: { shop } });
        return config?.challengesEnabled ?? false;
      },
      routes: { admin: '/app/rewards/missions', storefront: '/challenges' },
      hooks: ['challenge.joined', 'challenge.progress', 'challenge.completed', 'challenge.claimed'],
    });

    // Placeholder for future features
    this.register({
      id: 'referrals',
      name: 'Referral Program',
      description: 'Reward customers for referring friends',
      category: 'engagement',
      status: 'coming_soon',
      dependencies: ['points'],
      minPlan: 'growth',
      isEnabled: async () => false, // Not yet implemented
      routes: { admin: '/app/rewards/referrals', storefront: '/referral' },
      hooks: ['referral.sent', 'referral.signed-up', 'referral.converted', 'referral.rewarded'],
    });

    this.register({
      id: 'custom-rules',
      name: 'Custom Earning Rules',
      description: 'Advanced rules for points earning',
      category: 'engagement',
      status: 'coming_soon',
      dependencies: ['points'],
      minPlan: 'enterprise',
      isEnabled: async () => false, // Not yet implemented
      routes: { admin: '/app/rewards/rules' },
      hooks: ['rule.triggered', 'rule.points-awarded'],
    });

    // Analytics features
    this.register({
      id: 'analytics',
      name: 'Analytics Dashboard',
      description: 'Program performance analytics',
      category: 'analytics',
      status: 'active',
      isEnabled: async () => true,
      routes: { admin: '/app/analytics' },
    });

    this.register({
      id: 'churn-prediction',
      name: 'Churn Prediction',
      description: 'AI-powered customer churn prediction',
      category: 'analytics',
      status: 'coming_soon',
      dependencies: ['analytics'],
      minPlan: 'enterprise',
      isEnabled: async () => false, // Not yet implemented
      hooks: ['churn.risk-detected', 'churn.intervention-triggered'],
    });

    this.register({
      id: 'ab-testing',
      name: 'A/B Testing',
      description: 'Experiment with different loyalty configurations',
      category: 'analytics',
      status: 'coming_soon',
      minPlan: 'enterprise',
      isEnabled: async () => false, // Not yet implemented
      routes: { admin: '/app/experiments' },
      hooks: ['experiment.started', 'experiment.converted', 'experiment.completed'],
    });

    // Marketing features
    this.register({
      id: 'email-campaigns',
      name: 'Email Campaigns',
      description: 'Send targeted email campaigns',
      category: 'marketing',
      status: 'active',
      minPlan: 'starter',
      isEnabled: async (shop) => {
        const settings = await db.emailSettings.findUnique({ where: { shop } });
        return !!settings?.provider;
      },
      routes: { admin: '/app/marketing/campaigns' },
      hooks: ['email.sent', 'email.opened', 'email.clicked'],
    });

    this.register({
      id: 'klaviyo',
      name: 'Klaviyo Integration',
      description: 'Sync loyalty data with Klaviyo',
      category: 'integrations',
      status: 'active',
      minPlan: 'growth',
      isEnabled: async (shop) => {
        const integration = await db.integration.findFirst({
          where: { shop, type: 'KLAVIYO', status: 'ACTIVE' },
        });
        return !!integration;
      },
      routes: { admin: '/app/marketing/klaviyo' },
      hooks: ['klaviyo.profile-synced', 'klaviyo.event-sent'],
    });

    this.initialized = true;
    console.log(`[FeatureRegistry] Initialized ${this.features.size} features`);
  }

  /**
   * Get all registered feature IDs
   */
  getAllFeatureIds(): string[] {
    return Array.from(this.features.keys());
  }

  /**
   * Get features summary for debugging
   */
  getSummary(): { id: string; status: FeatureStatus; category: FeatureCategory }[] {
    return Array.from(this.features.values()).map(f => ({
      id: f.id,
      status: f.status,
      category: f.category,
    }));
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const featureRegistry = new FeatureRegistry();

// Initialize built-in features on module load
featureRegistry.initializeBuiltInFeatures();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a feature is available (convenience function)
 */
export async function isFeatureAvailable(featureId: string, shop: string): Promise<boolean> {
  return featureRegistry.isAvailable(featureId, shop);
}

/**
 * Get feature status for UI display
 */
export async function getFeatureStatus(shop: string): Promise<{
  enabled: string[];
  available: string[];
  comingSoon: string[];
}> {
  const features = await featureRegistry.getAvailableFeatures(shop);

  return {
    enabled: features.filter(f => f.enabled).map(f => f.definition.id),
    available: features
      .filter(f => !f.enabled && f.definition.status === 'active')
      .map(f => f.definition.id),
    comingSoon: features
      .filter(f => f.definition.status === 'coming_soon')
      .map(f => f.definition.id),
  };
}
