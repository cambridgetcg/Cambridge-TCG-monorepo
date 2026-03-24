/**
 * Tier Product Health Service
 *
 * Monitors and manages tier products to ensure data integrity:
 * - Detects orphaned tier products (products referencing deleted tiers)
 * - Provides cleanup functions to deactivate orphaned products
 * - Validates tier products before purchase flow
 */

import prisma from "~/db.server";
import type { TierProduct, Tier } from "@prisma/client";

// Extended type for tier products with tier relation
type TierProductWithTier = TierProduct & {
  tier: Tier | null;
};

// ============================================
// ORPHANED PRODUCT DETECTION
// ============================================

/**
 * Get all tier products that reference non-existent tiers
 *
 * These are tier products where the associated tier has been deleted.
 * Customers should not be able to purchase these products.
 *
 * @param shop - Filter by shop domain (optional)
 * @returns Array of orphaned tier product records
 */
export async function getOrphanedTierProducts(
  shop?: string
): Promise<TierProductWithTier[]> {
  const products = await prisma.tierProduct.findMany({
    where: shop ? { shop } : undefined,
    include: { tier: true }
  });

  // Filter to products where tier is null (tier was deleted)
  const orphaned = products.filter(p => p.tier === null);

  if (orphaned.length > 0) {
    console.warn(
      `[TierProductHealth] Found ${orphaned.length} orphaned tier product(s)`,
      orphaned.map(p => ({ id: p.id, shop: p.shop, tierId: p.tierId }))
    );
  }

  return orphaned;
}

/**
 * Get tier products that are active but reference non-existent tiers
 *
 * These are the critical ones - active products that can't actually
 * assign a tier when purchased.
 */
export async function getActiveOrphanedProducts(
  shop?: string
): Promise<TierProductWithTier[]> {
  const products = await prisma.tierProduct.findMany({
    where: {
      ...(shop ? { shop } : {}),
      isActive: true
    },
    include: { tier: true }
  });

  return products.filter(p => p.tier === null);
}

// ============================================
// CLEANUP FUNCTIONS
// ============================================

/**
 * Deactivate all orphaned tier products for a shop
 *
 * This prevents customers from purchasing products that can't assign tiers.
 * Products are deactivated (isActive=false), not deleted, for audit trail.
 *
 * @param shop - Shop domain to clean up
 * @returns Number of products deactivated
 */
export async function deactivateOrphanedProducts(shop: string): Promise<{
  deactivated: number;
  productIds: string[];
}> {
  const orphaned = await getOrphanedTierProducts(shop);

  if (orphaned.length === 0) {
    return { deactivated: 0, productIds: [] };
  }

  const productIds = orphaned.map(p => p.id);

  // Deactivate in bulk
  const result = await prisma.tierProduct.updateMany({
    where: {
      id: { in: productIds }
    },
    data: {
      isActive: false,
      updatedAt: new Date()
    }
  });

  console.log(
    `[TierProductHealth] Deactivated ${result.count} orphaned tier products`,
    { shop, productIds }
  );

  return {
    deactivated: result.count,
    productIds
  };
}

/**
 * Deactivate orphaned products across all shops
 *
 * @returns Summary of cleanup results by shop
 */
export async function deactivateAllOrphanedProducts(): Promise<{
  totalDeactivated: number;
  byShop: Record<string, number>;
}> {
  const orphaned = await getOrphanedTierProducts();

  if (orphaned.length === 0) {
    return { totalDeactivated: 0, byShop: {} };
  }

  // Group by shop
  const byShop: Record<string, string[]> = {};
  for (const product of orphaned) {
    if (!byShop[product.shop]) {
      byShop[product.shop] = [];
    }
    byShop[product.shop].push(product.id);
  }

  // Deactivate all at once
  const result = await prisma.tierProduct.updateMany({
    where: {
      id: { in: orphaned.map(p => p.id) }
    },
    data: {
      isActive: false,
      updatedAt: new Date()
    }
  });

  const summary: Record<string, number> = {};
  for (const [shop, ids] of Object.entries(byShop)) {
    summary[shop] = ids.length;
  }

  console.log(
    `[TierProductHealth] Deactivated ${result.count} orphaned tier products across ${Object.keys(byShop).length} shops`
  );

  return {
    totalDeactivated: result.count,
    byShop: summary
  };
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate a tier product before purchase
 *
 * Used in the purchase flow to ensure the product can actually assign a tier.
 * Returns validation result with details if invalid.
 */
export async function validateTierProduct(
  tierProductId: string
): Promise<{
  valid: boolean;
  tierProduct?: TierProductWithTier;
  error?: string;
}> {
  const tierProduct = await prisma.tierProduct.findUnique({
    where: { id: tierProductId },
    include: { tier: true }
  });

  if (!tierProduct) {
    return {
      valid: false,
      error: `Tier product ${tierProductId} not found`
    };
  }

  if (!tierProduct.isActive) {
    return {
      valid: false,
      tierProduct,
      error: 'Tier product is inactive'
    };
  }

  if (!tierProduct.tier) {
    return {
      valid: false,
      tierProduct,
      error: `Tier product references non-existent tier ${tierProduct.tierId}. Product should be deactivated.`
    };
  }

  return {
    valid: true,
    tierProduct
  };
}

/**
 * Validate a tier product by Shopify product/variant ID
 *
 * Used in webhook handlers where we have Shopify IDs, not our internal IDs.
 */
export async function validateTierProductByShopifyId(
  shop: string,
  shopifyProductId?: string,
  shopifyVariantId?: string
): Promise<{
  valid: boolean;
  tierProduct?: TierProductWithTier;
  error?: string;
}> {
  if (!shopifyProductId && !shopifyVariantId) {
    return {
      valid: false,
      error: 'Either shopifyProductId or shopifyVariantId is required'
    };
  }

  const tierProduct = await prisma.tierProduct.findFirst({
    where: {
      shop,
      ...(shopifyProductId ? { shopifyProductId } : {}),
      ...(shopifyVariantId ? { shopifyVariantId } : {})
    },
    include: { tier: true }
  });

  if (!tierProduct) {
    // Not a tier product - this is valid (it's just a regular product)
    return { valid: true };
  }

  if (!tierProduct.isActive) {
    return {
      valid: false,
      tierProduct,
      error: 'Tier product is inactive'
    };
  }

  if (!tierProduct.tier) {
    return {
      valid: false,
      tierProduct,
      error: `Tier product references non-existent tier ${tierProduct.tierId}`
    };
  }

  return {
    valid: true,
    tierProduct
  };
}

// ============================================
// HEALTH CHECK SUMMARY
// ============================================

/**
 * Get overall tier product health status
 */
export async function getTierProductHealthSummary(shop?: string): Promise<{
  healthy: boolean;
  totalProducts: number;
  activeProducts: number;
  orphanedProducts: number;
  orphanedActiveProducts: number;
}> {
  const whereClause = shop ? { shop } : {};

  const [total, active, orphaned, activeOrphaned] = await Promise.all([
    prisma.tierProduct.count({ where: whereClause }),
    prisma.tierProduct.count({ where: { ...whereClause, isActive: true } }),
    getOrphanedTierProducts(shop).then(p => p.length),
    getActiveOrphanedProducts(shop).then(p => p.length)
  ]);

  return {
    healthy: activeOrphaned === 0,
    totalProducts: total,
    activeProducts: active,
    orphanedProducts: orphaned,
    orphanedActiveProducts: activeOrphaned
  };
}
