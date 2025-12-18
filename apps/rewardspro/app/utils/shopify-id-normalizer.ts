/**
 * Shopify ID Normalizer Utility
 *
 * Handles the format mismatch between:
 * - REST API IDs: numeric strings like "123456789"
 * - GraphQL global IDs: "gid://shopify/Product/123456789"
 *
 * This is critical for tier product detection where webhooks use REST format
 * but the database may store GraphQL format.
 */

export interface NormalizedIds {
  productId: string | null;
  variantId: string | null;
  sku: string | null;
}

/**
 * Extract numeric ID from any Shopify ID format
 *
 * Handles:
 * - GraphQL global IDs: "gid://shopify/Product/123" -> "123"
 * - Numeric strings: "123" -> "123"
 * - Numbers: 123 -> "123"
 * - null/undefined -> null
 *
 * @param id Any Shopify ID format
 * @returns Normalized numeric ID string or null
 */
export function extractNumericId(id: string | number | null | undefined): string | null {
  if (id === null || id === undefined || id === '') {
    return null;
  }

  const idStr = String(id);

  // Check for GraphQL global ID format: gid://shopify/Resource/123
  const gidMatch = idStr.match(/gid:\/\/shopify\/\w+\/(\d+)/);
  if (gidMatch) {
    return gidMatch[1];
  }

  // Check if it's already a numeric string
  if (/^\d+$/.test(idStr)) {
    return idStr;
  }

  // Try to extract any numeric portion as fallback
  const numericMatch = idStr.match(/(\d+)/);
  if (numericMatch) {
    return numericMatch[1];
  }

  return null;
}

/**
 * Normalize SKU for comparison
 *
 * Handles:
 * - Case normalization (uppercase)
 * - Whitespace trimming
 * - Empty strings -> null
 *
 * @param sku Raw SKU string
 * @returns Normalized SKU or null
 */
export function normalizeSku(sku: string | null | undefined): string | null {
  if (!sku || typeof sku !== 'string') {
    return null;
  }

  const normalized = sku.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Check if two IDs match, handling different formats
 *
 * Compares numeric portions of IDs regardless of format
 *
 * @param id1 First ID (any format)
 * @param id2 Second ID (any format)
 * @returns true if IDs match
 */
export function idsMatch(
  id1: string | number | null | undefined,
  id2: string | number | null | undefined
): boolean {
  const normalized1 = extractNumericId(id1);
  const normalized2 = extractNumericId(id2);

  if (!normalized1 || !normalized2) {
    return false;
  }

  return normalized1 === normalized2;
}

/**
 * Check if two SKUs match (case-insensitive)
 *
 * @param sku1 First SKU
 * @param sku2 Second SKU
 * @returns true if SKUs match
 */
export function skusMatch(
  sku1: string | null | undefined,
  sku2: string | null | undefined
): boolean {
  const normalized1 = normalizeSku(sku1);
  const normalized2 = normalizeSku(sku2);

  if (!normalized1 || !normalized2) {
    return false;
  }

  return normalized1 === normalized2;
}

/**
 * Result of matching a line item against tier products
 */
export interface TierProductMatchResult {
  matched: boolean;
  tierProduct: any | null;
  matchedBy: ('PRODUCT_ID' | 'VARIANT_ID' | 'SKU')[];
  matchDetails: {
    productIdMatch: boolean;
    variantIdMatch: boolean;
    skuMatch: boolean;
    lineItemProductId: string | null;
    lineItemVariantId: string | null;
    lineItemSku: string | null;
    tierProductProductId: string | null;
    tierProductVariantId: string | null;
    tierProductSku: string | null;
  };
}

/**
 * Match a line item against a list of tier products
 *
 * Uses normalized ID comparison and case-insensitive SKU matching
 *
 * @param lineItem Shopify webhook line item
 * @param tierProducts Array of tier products from database
 * @returns Match result with details
 */
export function findMatchingTierProduct(
  lineItem: {
    product_id?: string | number | null;
    variant_id?: string | number | null;
    sku?: string | null;
  },
  tierProducts: Array<{
    id: string;
    shopifyProductId?: string | null;
    shopifyVariantId?: string | null;
    sku?: string | null;
    purchaseType: string;
    [key: string]: any;
  }>
): TierProductMatchResult {
  const lineItemProductId = extractNumericId(lineItem.product_id);
  const lineItemVariantId = extractNumericId(lineItem.variant_id);
  const lineItemSku = normalizeSku(lineItem.sku);

  for (const tp of tierProducts) {
    // Filter by eligible purchase types
    if (tp.purchaseType !== 'ONE_TIME' && tp.purchaseType !== 'BOTH') {
      continue;
    }

    const tpProductId = extractNumericId(tp.shopifyProductId);
    const tpVariantId = extractNumericId(tp.shopifyVariantId);
    const tpSku = normalizeSku(tp.sku);

    // Check each matching criterion
    const productIdMatch = lineItemProductId && tpProductId && lineItemProductId === tpProductId;
    const variantIdMatch = lineItemVariantId && tpVariantId && lineItemVariantId === tpVariantId;
    const skuMatch = lineItemSku && tpSku && lineItemSku === tpSku;

    if (productIdMatch || variantIdMatch || skuMatch) {
      const matchedBy: ('PRODUCT_ID' | 'VARIANT_ID' | 'SKU')[] = [];
      if (productIdMatch) matchedBy.push('PRODUCT_ID');
      if (variantIdMatch) matchedBy.push('VARIANT_ID');
      if (skuMatch) matchedBy.push('SKU');

      return {
        matched: true,
        tierProduct: tp,
        matchedBy,
        matchDetails: {
          productIdMatch: !!productIdMatch,
          variantIdMatch: !!variantIdMatch,
          skuMatch: !!skuMatch,
          lineItemProductId,
          lineItemVariantId,
          lineItemSku,
          tierProductProductId: tpProductId,
          tierProductVariantId: tpVariantId,
          tierProductSku: tpSku,
        },
      };
    }
  }

  // No match found
  return {
    matched: false,
    tierProduct: null,
    matchedBy: [],
    matchDetails: {
      productIdMatch: false,
      variantIdMatch: false,
      skuMatch: false,
      lineItemProductId,
      lineItemVariantId,
      lineItemSku,
      tierProductProductId: null,
      tierProductVariantId: null,
      tierProductSku: null,
    },
  };
}

/**
 * Analyze why a line item didn't match any tier products
 * Provides detailed diagnostics for debugging
 *
 * @param lineItem Shopify webhook line item
 * @param tierProducts Array of tier products from database
 * @returns Diagnostic information
 */
export function analyzeTierProductMismatch(
  lineItem: {
    product_id?: string | number | null;
    variant_id?: string | number | null;
    sku?: string | null;
  },
  tierProducts: Array<{
    id: string;
    shopifyProductId?: string | null;
    shopifyVariantId?: string | null;
    sku?: string | null;
    purchaseType: string;
    tier?: { name: string } | null;
    [key: string]: any;
  }>
): {
  lineItemIds: NormalizedIds;
  eligibleProducts: number;
  nearMisses: Array<{
    tierProductId: string;
    tierName: string;
    reason: string;
    details: any;
  }>;
} {
  const lineItemProductId = extractNumericId(lineItem.product_id);
  const lineItemVariantId = extractNumericId(lineItem.variant_id);
  const lineItemSku = normalizeSku(lineItem.sku);

  const eligibleProducts = tierProducts.filter(
    tp => tp.purchaseType === 'ONE_TIME' || tp.purchaseType === 'BOTH'
  );

  const nearMisses: Array<{
    tierProductId: string;
    tierName: string;
    reason: string;
    details: any;
  }> = [];

  for (const tp of eligibleProducts) {
    const tpProductId = extractNumericId(tp.shopifyProductId);
    const tpVariantId = extractNumericId(tp.shopifyVariantId);
    const tpSku = normalizeSku(tp.sku);

    // Check for near misses
    const checks = [];

    // Product ID near miss
    if (lineItemProductId && tpProductId) {
      if (lineItemProductId !== tpProductId) {
        // Check if they share a common substring (potential ID format issue)
        if (lineItemProductId.includes(tpProductId) || tpProductId.includes(lineItemProductId)) {
          checks.push({
            type: 'PRODUCT_ID_PARTIAL',
            reason: `Product ID partial match: "${lineItemProductId}" vs "${tpProductId}"`,
          });
        }
      }
    } else if (!tpProductId && !tpVariantId && !tpSku) {
      checks.push({
        type: 'NO_IDENTIFIERS',
        reason: 'Tier product has no identifiers configured',
      });
    }

    // SKU case mismatch
    if (lineItem.sku && tp.sku) {
      if (lineItem.sku !== tp.sku && lineItem.sku.toUpperCase() === tp.sku.toUpperCase()) {
        checks.push({
          type: 'SKU_CASE_MISMATCH',
          reason: `SKU case mismatch: "${lineItem.sku}" vs "${tp.sku}" (would match case-insensitively)`,
        });
      }
    }

    // SKU whitespace issue
    if (lineItem.sku && tp.sku) {
      if (lineItem.sku.trim() !== lineItem.sku || tp.sku.trim() !== tp.sku) {
        checks.push({
          type: 'SKU_WHITESPACE',
          reason: 'SKU has leading/trailing whitespace',
        });
      }
    }

    for (const check of checks) {
      nearMisses.push({
        tierProductId: tp.id,
        tierName: tp.tier?.name || 'Unknown',
        reason: check.reason,
        details: {
          type: check.type,
          lineItem: { productId: lineItemProductId, variantId: lineItemVariantId, sku: lineItemSku },
          tierProduct: { productId: tpProductId, variantId: tpVariantId, sku: tpSku },
        },
      });
    }
  }

  return {
    lineItemIds: {
      productId: lineItemProductId,
      variantId: lineItemVariantId,
      sku: lineItemSku,
    },
    eligibleProducts: eligibleProducts.length,
    nearMisses,
  };
}
