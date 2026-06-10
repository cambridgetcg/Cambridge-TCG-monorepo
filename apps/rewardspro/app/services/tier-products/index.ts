/**
 * Tier Products Services - Barrel Export
 *
 * This module provides services for tier product operations:
 * - TierProductMatcher: Match webhook line items to tier products
 * - TierProductPurchaseService: Create tier purchase records
 * - TierProductManagerEnhanced: Create tier products in Shopify
 * - TierProductDeletion: Delete tier products with cleanup
 */

// Matching service - detect tier products in orders
export {
  TierProductMatcher,
  matchTierProduct,
  matchTierProducts,
  type MatchableLineItem,
  type TierProductWithTier,
  type TierProductMatchResult,
  type MatchType,
  type MatchDetails,
  type MatchDiagnostics,
} from "./tier-product-matcher.server";

// Purchase service - create tier purchases from matched products
export {
  TierProductPurchaseService,
  createTierPurchase,
  tierPurchaseExists,
  type TierProductForPurchase,
  type OrderForPurchase,
  type LineItemForPurchase,
  type CreateTierPurchaseResult,
  type CreatePurchaseOptions,
} from "./tier-product-purchase.server";

// Existing services (re-export for convenience)
export { TierProductManagerEnhanced } from "./tier-product-manager-enhanced.server";
