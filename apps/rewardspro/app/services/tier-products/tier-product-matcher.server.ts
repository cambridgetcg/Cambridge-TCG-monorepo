/**
 * Tier Product Matcher Service
 *
 * Single responsibility: Match webhook line items to tier products
 *
 * Extracted from webhooks.orders.paid.tsx to:
 * 1. Enable reuse from other contexts (admin UI, API, bulk imports)
 * 2. Simplify testing
 * 3. Separate matching logic from webhook orchestration
 *
 * Uses normalized ID comparison to handle REST vs GraphQL ID format mismatch.
 */

import prisma from "~/db.server";
import { createLogger } from "~/services/logger.server";
import {
  extractNumericId,
  normalizeSku,
  findMatchingTierProduct,
  analyzeTierProductMismatch,
  type TierProductMatchResult as UtilityMatchResult,
} from "~/utils/shopify-id-normalizer";
import type { TierProduct, Tier, PurchaseType } from "@prisma/client";

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Minimal line item interface for matching
 * Compatible with both webhook payloads and custom inputs
 */
export interface MatchableLineItem {
  product_id?: string | number | null;
  variant_id?: string | number | null;
  sku?: string | null;
  selling_plan_allocation?: unknown; // Presence indicates subscription
}

/**
 * Tier product with required tier relation
 */
export interface TierProductWithTier extends TierProduct {
  tier: Pick<Tier, "id" | "name" | "minSpend" | "cashbackPercent"> | null;
}

/**
 * Match type indicators
 */
export type MatchType = "PRODUCT_ID" | "VARIANT_ID" | "SKU";

/**
 * Detailed match information
 */
export interface MatchDetails {
  productIdMatch: boolean;
  variantIdMatch: boolean;
  skuMatch: boolean;
  lineItemProductId: string | null;
  lineItemVariantId: string | null;
  lineItemSku: string | null;
  tierProductProductId: string | null;
  tierProductVariantId: string | null;
  tierProductSku: string | null;
}

/**
 * Optional diagnostic information for debugging
 */
export interface MatchDiagnostics {
  tierProductsChecked: number;
  eligibleProducts: number;
  nearMisses: Array<{
    tierProductId: string;
    tierName: string;
    reason: string;
  }>;
  matchDurationMs: number;
}

/**
 * Result of tier product matching
 */
export interface TierProductMatchResult {
  matched: boolean;
  tierProduct: TierProductWithTier | null;
  matchedBy: MatchType[];
  matchDetails: MatchDetails;
  isSubscription: boolean;
  diagnostics?: MatchDiagnostics;
}

// ============================================
// MAIN SERVICE CLASS
// ============================================

const logger = createLogger("TierProductMatcher");

export class TierProductMatcher {
  /**
   * Match a line item against tier products for a shop
   *
   * @param shop - Shop domain
   * @param lineItem - Line item to match
   * @param options - Optional configuration
   * @returns Match result with tier product if found
   */
  static async matchLineItem(
    shop: string,
    lineItem: MatchableLineItem,
    options?: {
      includeDiagnostics?: boolean;
    }
  ): Promise<TierProductMatchResult> {
    const startTime = Date.now();
    const matchLogger = logger.withContext({ shop });

    // Check for subscription (early exit - handled by different flow)
    if (lineItem.selling_plan_allocation) {
      matchLogger.debug("Line item is a subscription, skipping tier product match");
      return {
        matched: false,
        tierProduct: null,
        matchedBy: [],
        matchDetails: TierProductMatcher.createEmptyMatchDetails(lineItem),
        isSubscription: true,
      };
    }

    // Normalize line item IDs for comparison
    const normalizedProductId = extractNumericId(lineItem.product_id);
    const normalizedVariantId = extractNumericId(lineItem.variant_id);
    const normalizedSku = normalizeSku(lineItem.sku);

    matchLogger.debug("Normalized line item IDs", {
      productId: normalizedProductId,
      variantId: normalizedVariantId,
      sku: normalizedSku,
    });

    // Query active tier products for shop
    // CRITICAL: Filter deletedAt IS NULL to exclude soft-deleted products
    const tierProducts = await prisma.tierProduct.findMany({
      where: {
        shop,
        deletedAt: null,
      },
      include: {
        tier: {
          select: {
            id: true,
            name: true,
            minSpend: true,
            cashbackPercent: true,
          },
        },
      },
    });

    matchLogger.debug("Tier products found", { count: tierProducts.length });

    if (tierProducts.length === 0) {
      matchLogger.debug("No tier products configured for shop");
      return {
        matched: false,
        tierProduct: null,
        matchedBy: [],
        matchDetails: TierProductMatcher.createEmptyMatchDetails(lineItem),
        isSubscription: false,
        diagnostics: options?.includeDiagnostics
          ? {
              tierProductsChecked: 0,
              eligibleProducts: 0,
              nearMisses: [],
              matchDurationMs: Date.now() - startTime,
            }
          : undefined,
      };
    }

    // Filter to eligible products (ONE_TIME or BOTH purchase type)
    const eligibleProducts = tierProducts.filter(
      (tp) => tp.purchaseType === "ONE_TIME" || tp.purchaseType === "BOTH"
    ) as TierProductWithTier[];

    matchLogger.debug("Eligible tier products", {
      total: tierProducts.length,
      eligible: eligibleProducts.length,
    });

    // Use utility function for normalized matching
    const utilityResult = findMatchingTierProduct(
      {
        product_id: lineItem.product_id,
        variant_id: lineItem.variant_id,
        sku: lineItem.sku,
      },
      eligibleProducts
    );

    const matchDurationMs = Date.now() - startTime;

    if (utilityResult.matched && utilityResult.tierProduct) {
      const matchedProduct = utilityResult.tierProduct as TierProductWithTier;

      matchLogger.info("Tier product matched", {
        tierProductId: matchedProduct.id,
        tierName: matchedProduct.tier?.name,
        matchedBy: utilityResult.matchedBy,
        durationMs: matchDurationMs,
      });

      return {
        matched: true,
        tierProduct: matchedProduct,
        matchedBy: utilityResult.matchedBy,
        matchDetails: utilityResult.matchDetails,
        isSubscription: false,
        diagnostics: options?.includeDiagnostics
          ? {
              tierProductsChecked: tierProducts.length,
              eligibleProducts: eligibleProducts.length,
              nearMisses: [],
              matchDurationMs,
            }
          : undefined,
      };
    }

    // No match found - collect diagnostics if requested
    let diagnostics: MatchDiagnostics | undefined;
    if (options?.includeDiagnostics) {
      const mismatchAnalysis = analyzeTierProductMismatch(
        {
          product_id: lineItem.product_id,
          variant_id: lineItem.variant_id,
          sku: lineItem.sku,
        },
        eligibleProducts
      );

      diagnostics = {
        tierProductsChecked: tierProducts.length,
        eligibleProducts: eligibleProducts.length,
        nearMisses: mismatchAnalysis.nearMisses.map((nm) => ({
          tierProductId: nm.tierProductId || "unknown",
          tierName: nm.tierName || "unknown",
          reason: nm.reason,
        })),
        matchDurationMs,
      };

      matchLogger.debug("No match found", { diagnostics });
    }

    return {
      matched: false,
      tierProduct: null,
      matchedBy: [],
      matchDetails: utilityResult.matchDetails,
      isSubscription: false,
      diagnostics,
    };
  }

  /**
   * Batch match multiple line items
   *
   * More efficient than calling matchLineItem repeatedly
   * as it queries tier products only once
   *
   * @param shop - Shop domain
   * @param lineItems - Line items to match
   * @returns Array of match results
   */
  static async matchLineItems(
    shop: string,
    lineItems: MatchableLineItem[]
  ): Promise<TierProductMatchResult[]> {
    const matchLogger = logger.withContext({ shop });

    // Query tier products once
    const tierProducts = await prisma.tierProduct.findMany({
      where: {
        shop,
        deletedAt: null,
      },
      include: {
        tier: {
          select: {
            id: true,
            name: true,
            minSpend: true,
            cashbackPercent: true,
          },
        },
      },
    });

    const eligibleProducts = tierProducts.filter(
      (tp) => tp.purchaseType === "ONE_TIME" || tp.purchaseType === "BOTH"
    ) as TierProductWithTier[];

    matchLogger.debug("Batch matching line items", {
      lineItemCount: lineItems.length,
      tierProductCount: tierProducts.length,
      eligibleCount: eligibleProducts.length,
    });

    // Match each line item
    return lineItems.map((lineItem) => {
      // Check for subscription
      if (lineItem.selling_plan_allocation) {
        return {
          matched: false,
          tierProduct: null,
          matchedBy: [],
          matchDetails: TierProductMatcher.createEmptyMatchDetails(lineItem),
          isSubscription: true,
        };
      }

      const utilityResult = findMatchingTierProduct(
        {
          product_id: lineItem.product_id,
          variant_id: lineItem.variant_id,
          sku: lineItem.sku,
        },
        eligibleProducts
      );

      if (utilityResult.matched && utilityResult.tierProduct) {
        return {
          matched: true,
          tierProduct: utilityResult.tierProduct as TierProductWithTier,
          matchedBy: utilityResult.matchedBy,
          matchDetails: utilityResult.matchDetails,
          isSubscription: false,
        };
      }

      return {
        matched: false,
        tierProduct: null,
        matchedBy: [],
        matchDetails: utilityResult.matchDetails,
        isSubscription: false,
      };
    });
  }

  /**
   * Quick check if any line items contain tier products
   *
   * Useful for early exit in webhook processing
   *
   * @param shop - Shop domain
   * @param lineItems - Line items to check
   * @returns True if any line item matches a tier product
   */
  static async hasTierProducts(
    shop: string,
    lineItems: MatchableLineItem[]
  ): Promise<boolean> {
    const results = await TierProductMatcher.matchLineItems(shop, lineItems);
    return results.some((r) => r.matched);
  }

  /**
   * Create empty match details for non-matching line items
   */
  private static createEmptyMatchDetails(
    lineItem: MatchableLineItem
  ): MatchDetails {
    return {
      productIdMatch: false,
      variantIdMatch: false,
      skuMatch: false,
      lineItemProductId: extractNumericId(lineItem.product_id),
      lineItemVariantId: extractNumericId(lineItem.variant_id),
      lineItemSku: normalizeSku(lineItem.sku),
      tierProductProductId: null,
      tierProductVariantId: null,
      tierProductSku: null,
    };
  }
}

// ============================================
// CONVENIENCE EXPORTS
// ============================================

/**
 * Functional wrapper for single line item matching
 */
export async function matchTierProduct(
  shop: string,
  lineItem: MatchableLineItem,
  options?: { includeDiagnostics?: boolean }
): Promise<TierProductMatchResult> {
  return TierProductMatcher.matchLineItem(shop, lineItem, options);
}

/**
 * Functional wrapper for batch matching
 */
export async function matchTierProducts(
  shop: string,
  lineItems: MatchableLineItem[]
): Promise<TierProductMatchResult[]> {
  return TierProductMatcher.matchLineItems(shop, lineItems);
}
