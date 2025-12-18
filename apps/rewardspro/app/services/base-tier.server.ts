/**
 * Base Tier Service
 *
 * Handles default tier assignment for new customers who don't qualify
 * for any other tier source (manual override, subscription, purchase, or spending-based).
 *
 * The base tier is the LOWEST priority in the tier resolution system,
 * acting as a fallback to ensure all customers have a tier.
 */

import db from "~/db.server";
import type { Tier, ShopSettings } from "@prisma/client";

// ============================================
// TYPES
// ============================================

export interface BaseTierConfig {
  enabled: boolean;
  tierId: string | null;
  tierName: string | null;
  autoDetect: boolean; // Use lowest minSpend tier if no specific tier set
}

export interface BaseTierResult {
  assigned: boolean;
  tierId?: string;
  tierName?: string;
  source: 'configured' | 'auto_detected' | 'none';
  reason?: string;
}

// ============================================
// CONFIGURATION FUNCTIONS
// ============================================

/**
 * Get the base tier configuration for a shop
 *
 * @param shop - Shop domain
 * @returns Base tier configuration
 */
export async function getBaseTierConfig(shop: string): Promise<BaseTierConfig> {
  const settings = await db.shopSettings.findUnique({
    where: { shop },
    select: {
      autoAssignBaseTier: true,
      defaultBaseTierId: true,
      defaultBaseTier: {
        select: {
          id: true,
          name: true,
        }
      }
    }
  });

  if (!settings) {
    // Default to enabled with auto-detect if no settings exist
    return {
      enabled: true,
      tierId: null,
      tierName: null,
      autoDetect: true,
    };
  }

  return {
    enabled: settings.autoAssignBaseTier,
    tierId: settings.defaultBaseTierId,
    tierName: settings.defaultBaseTier?.name || null,
    autoDetect: !settings.defaultBaseTierId, // Auto-detect if no specific tier configured
  };
}

/**
 * Get the appropriate base tier for a shop
 *
 * Returns:
 * 1. The configured default tier (if set), or
 * 2. The tier with the lowest minSpend (auto-detect), or
 * 3. null if no tiers exist or base tier is disabled
 *
 * @param shop - Shop domain
 * @returns The base tier or null
 */
export async function getBaseTier(shop: string): Promise<Tier | null> {
  const config = await getBaseTierConfig(shop);

  // Base tier assignment is disabled
  if (!config.enabled) {
    console.log(`[BaseTier] Base tier assignment disabled for shop ${shop}`);
    return null;
  }

  // If a specific tier is configured, use it
  if (config.tierId) {
    const tier = await db.tier.findFirst({
      where: {
        id: config.tierId,
        shop, // Ensure tier belongs to this shop
      }
    });

    if (tier) {
      console.log(`[BaseTier] Using configured default tier: ${tier.name}`);
      return tier;
    }

    // Configured tier not found (possibly deleted) - fall back to auto-detect
    console.warn(`[BaseTier] Configured default tier ${config.tierId} not found, falling back to auto-detect`);
  }

  // Auto-detect: find the tier with the lowest minSpend
  const lowestTier = await db.tier.findFirst({
    where: { shop },
    orderBy: { minSpend: 'asc' }
  });

  if (lowestTier) {
    console.log(`[BaseTier] Auto-detected lowest tier: ${lowestTier.name} (minSpend: ${lowestTier.minSpend})`);
    return lowestTier;
  }

  console.log(`[BaseTier] No tiers found for shop ${shop}`);
  return null;
}

// ============================================
// ASSIGNMENT FUNCTIONS
// ============================================

/**
 * Check if a customer should receive the base tier
 *
 * The base tier should only be assigned if:
 * 1. The shop has base tier enabled
 * 2. The customer doesn't have any current tier
 * 3. The shop has at least one tier configured
 *
 * @param shop - Shop domain
 * @param customerId - Customer ID
 * @returns Whether the customer is eligible for base tier
 */
export async function shouldAssignBaseTier(
  shop: string,
  customerId: string
): Promise<{ eligible: boolean; reason: string }> {
  // Check if base tier is enabled
  const config = await getBaseTierConfig(shop);
  if (!config.enabled) {
    return { eligible: false, reason: 'Base tier assignment disabled for shop' };
  }

  // Check if customer already has a tier
  const customer = await db.customer.findFirst({
    where: { id: customerId, shop },
    select: { currentTierId: true }
  });

  if (!customer) {
    return { eligible: false, reason: 'Customer not found' };
  }

  if (customer.currentTierId) {
    return { eligible: false, reason: 'Customer already has a tier assigned' };
  }

  // Check if shop has any tiers
  const tierCount = await db.tier.count({ where: { shop } });
  if (tierCount === 0) {
    return { eligible: false, reason: 'Shop has no tiers configured' };
  }

  return { eligible: true, reason: 'Customer eligible for base tier' };
}

/**
 * Assign base tier to a customer if they don't have any tier
 *
 * This function is typically called during tier resolution when no other
 * tier source qualifies.
 *
 * @param shop - Shop domain
 * @param customerId - Customer ID
 * @param options - Assignment options
 * @returns Assignment result
 */
export async function assignBaseTierIfNeeded(
  shop: string,
  customerId: string,
  options?: { triggeredBy?: string }
): Promise<BaseTierResult> {
  console.log(`[BaseTier] Checking base tier assignment for customer ${customerId}`);

  const eligibility = await shouldAssignBaseTier(shop, customerId);
  if (!eligibility.eligible) {
    console.log(`[BaseTier] ${eligibility.reason}`);
    return {
      assigned: false,
      source: 'none',
      reason: eligibility.reason,
    };
  }

  const baseTier = await getBaseTier(shop);
  if (!baseTier) {
    return {
      assigned: false,
      source: 'none',
      reason: 'No base tier available',
    };
  }

  // Determine if this was configured or auto-detected
  const config = await getBaseTierConfig(shop);
  const source = config.tierId === baseTier.id ? 'configured' : 'auto_detected';

  // Update customer's tier
  await db.customer.update({
    where: { id: customerId },
    data: {
      currentTierId: baseTier.id,
      updatedAt: new Date(),
    }
  });

  console.log(`[BaseTier] Assigned base tier ${baseTier.name} to customer ${customerId} (source: ${source})`);

  return {
    assigned: true,
    tierId: baseTier.id,
    tierName: baseTier.name,
    source,
    reason: `Base tier assigned via ${source}`,
  };
}

// ============================================
// ADMIN FUNCTIONS
// ============================================

/**
 * Update the base tier configuration for a shop
 *
 * @param shop - Shop domain
 * @param config - New configuration
 * @returns Updated configuration
 */
export async function updateBaseTierConfig(
  shop: string,
  config: {
    enabled?: boolean;
    tierId?: string | null;
  }
): Promise<BaseTierConfig> {
  const updateData: any = {
    updatedAt: new Date(),
  };

  if (config.enabled !== undefined) {
    updateData.autoAssignBaseTier = config.enabled;
  }

  if (config.tierId !== undefined) {
    updateData.defaultBaseTierId = config.tierId;
  }

  await db.shopSettings.upsert({
    where: { shop },
    update: updateData,
    create: {
      shop,
      storeName: shop,
      storeUrl: `https://${shop}`,
      autoAssignBaseTier: config.enabled ?? true,
      defaultBaseTierId: config.tierId ?? null,
    }
  });

  return getBaseTierConfig(shop);
}

/**
 * Get statistics about base tier usage for a shop
 *
 * @param shop - Shop domain
 * @returns Statistics
 */
export async function getBaseTierStats(shop: string): Promise<{
  enabled: boolean;
  baseTierName: string | null;
  customersWithBaseTier: number;
  totalCustomersWithoutTier: number;
}> {
  const config = await getBaseTierConfig(shop);
  const baseTier = await getBaseTier(shop);

  let customersWithBaseTier = 0;
  if (baseTier) {
    customersWithBaseTier = await db.customer.count({
      where: {
        shop,
        currentTierId: baseTier.id,
      }
    });
  }

  const totalCustomersWithoutTier = await db.customer.count({
    where: {
      shop,
      currentTierId: null,
    }
  });

  return {
    enabled: config.enabled,
    baseTierName: baseTier?.name || null,
    customersWithBaseTier,
    totalCustomersWithoutTier,
  };
}
