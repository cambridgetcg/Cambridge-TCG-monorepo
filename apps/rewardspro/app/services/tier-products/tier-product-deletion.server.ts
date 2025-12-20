/**
 * Tier Product Deletion Service
 *
 * Handles validation and deletion of tier products from both Shopify and database.
 * Ensures proper cleanup of related resources (selling plan groups, purchases, subscriptions).
 *
 * @module tier-product-deletion.server
 */

import db from "~/db.server";
import type { TierProduct, Tier } from "@prisma/client";

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface DeletionBlocker {
  type: 'not_found' | 'active_purchases' | 'active_subscriptions' | 'shopify_error';
  count?: number;
  message: string;
}

export interface DeletionWarning {
  type: 'inactive_purchases' | 'cancelled_subscriptions' | 'customers_at_tier';
  count: number;
  message: string;
}

export interface DeletionValidationResult {
  canDelete: boolean;
  blockers: DeletionBlocker[];
  warnings: DeletionWarning[];
  product: (TierProduct & { tier: Tier | null }) | null;
}

export interface DeletionResult {
  success: boolean;
  error?: string;
  deletedShopifyProductId?: string;
  cleanupSummary?: {
    purchasesDeleted: number;
    subscriptionsUnlinked: number;
    sellingPlanGroupUpdated: boolean;
  };
}

// Admin API context type (simplified)
interface AdminApiContext {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

// ============================================
// VALIDATION FUNCTION
// ============================================

/**
 * Validate if a tier product can be deleted
 *
 * Checks for:
 * - Product existence
 * - Active purchases (BLOCKER)
 * - Active subscriptions (BLOCKER)
 * - Inactive/expired purchases (WARNING)
 * - Cancelled subscriptions (WARNING)
 *
 * @param shop - Shop domain
 * @param tierProductId - Tier product ID to validate
 * @returns Validation result with blockers and warnings
 */
export async function validateTierProductDeletion(
  shop: string,
  tierProductId: string
): Promise<DeletionValidationResult> {
  const blockers: DeletionBlocker[] = [];
  const warnings: DeletionWarning[] = [];

  console.log(`[TierProductDeletion] Validating deletion for product: ${tierProductId}`);

  // 1. Find tier product
  const product = await db.tierProduct.findFirst({
    where: { id: tierProductId, shop },
    include: { tier: true }
  });

  if (!product) {
    console.log(`[TierProductDeletion] Product not found: ${tierProductId}`);
    return {
      canDelete: false,
      blockers: [{
        type: 'not_found',
        message: 'Tier product not found'
      }],
      warnings: [],
      product: null
    };
  }

  // 2. Check active purchases (BLOCKER)
  const now = new Date();
  const activePurchases = await db.tierPurchase.count({
    where: {
      tierProductId,
      status: 'ACTIVE',
      OR: [
        { endDate: null }, // Lifetime purchases
        { endDate: { gte: now } } // Not expired
      ]
    }
  });

  if (activePurchases > 0) {
    blockers.push({
      type: 'active_purchases',
      count: activePurchases,
      message: `${activePurchases} active purchase${activePurchases > 1 ? 's' : ''} exist${activePurchases === 1 ? 's' : ''}`
    });
  }

  // 3. Check active subscriptions (BLOCKER)
  const activeSubscriptions = await db.tierSubscription.count({
    where: {
      tierProductId,
      status: { in: ['ACTIVE', 'PENDING'] }
    }
  });

  if (activeSubscriptions > 0) {
    blockers.push({
      type: 'active_subscriptions',
      count: activeSubscriptions,
      message: `${activeSubscriptions} active subscription${activeSubscriptions > 1 ? 's' : ''} exist${activeSubscriptions === 1 ? 's' : ''}`
    });
  }

  // 4. Check inactive/expired purchases (WARNING)
  const inactivePurchases = await db.tierPurchase.count({
    where: {
      tierProductId,
      OR: [
        { status: { not: 'ACTIVE' } },
        {
          AND: [
            { endDate: { not: null } },
            { endDate: { lt: now } }
          ]
        }
      ]
    }
  });

  if (inactivePurchases > 0) {
    warnings.push({
      type: 'inactive_purchases',
      count: inactivePurchases,
      message: `${inactivePurchases} expired/inactive purchase record${inactivePurchases > 1 ? 's' : ''} will be deleted`
    });
  }

  // 5. Check cancelled/expired subscriptions (WARNING)
  const cancelledSubscriptions = await db.tierSubscription.count({
    where: {
      tierProductId,
      status: { in: ['CANCELLED', 'EXPIRED', 'FAILED'] }
    }
  });

  if (cancelledSubscriptions > 0) {
    warnings.push({
      type: 'cancelled_subscriptions',
      count: cancelledSubscriptions,
      message: `${cancelledSubscriptions} cancelled subscription${cancelledSubscriptions > 1 ? 's' : ''} will be unlinked`
    });
  }

  // 6. Check customers at this tier (WARNING - informational only)
  if (product.tierId) {
    const customersAtTier = await db.customer.count({
      where: {
        shop,
        currentTierId: product.tierId
      }
    });

    if (customersAtTier > 0) {
      warnings.push({
        type: 'customers_at_tier',
        count: customersAtTier,
        message: `${customersAtTier} customer${customersAtTier > 1 ? 's are' : ' is'} currently at this tier`
      });
    }
  }

  const canDelete = blockers.length === 0;

  console.log(`[TierProductDeletion] Validation result - canDelete: ${canDelete}, blockers: ${blockers.length}, warnings: ${warnings.length}`);

  return {
    canDelete,
    blockers,
    warnings,
    product
  };
}

// ============================================
// DELETE FUNCTION
// ============================================

/**
 * Delete a tier product from Shopify and database
 *
 * Deletion order (safe):
 * 1. Validate (re-check for race conditions)
 * 2. Remove from Shopify selling plan group (if applicable)
 * 3. Delete Shopify product
 * 4. Clean up database records (only after Shopify success)
 *
 * @param shop - Shop domain
 * @param tierProductId - Tier product ID to delete
 * @param admin - Shopify admin API context
 * @returns Deletion result
 */
export async function deleteTierProduct(
  shop: string,
  tierProductId: string,
  admin: AdminApiContext
): Promise<DeletionResult> {
  console.log(`[TierProductDeletion] Starting deletion for product: ${tierProductId}`);

  // 1. Re-validate (in case state changed since user clicked delete)
  const validation = await validateTierProductDeletion(shop, tierProductId);

  if (!validation.canDelete) {
    console.log(`[TierProductDeletion] Validation failed - cannot delete`);
    return {
      success: false,
      error: validation.blockers.map(b => b.message).join('; ')
    };
  }

  const product = validation.product!;

  try {
    // 2. Remove from selling plan group (if has one)
    let sellingPlanGroupUpdated = false;

    if (product.shopifySellingPlanGroupId) {
      console.log(`[TierProductDeletion] Removing from selling plan group: ${product.shopifySellingPlanGroupId}`);

      try {
        const removeResult = await admin.graphql(`
          mutation RemoveProductFromSellingPlanGroup($id: ID!, $productIds: [ID!]!) {
            sellingPlanGroupRemoveProducts(id: $id, productIds: $productIds) {
              removedProductIds
              userErrors {
                field
                message
              }
            }
          }
        `, {
          variables: {
            id: product.shopifySellingPlanGroupId,
            productIds: [product.shopifyProductId]
          }
        });

        const removeData = await removeResult.json() as {
          data?: {
            sellingPlanGroupRemoveProducts?: {
              removedProductIds?: string[];
              userErrors?: Array<{ field: string; message: string }>;
            };
          };
        };

        if (removeData.data?.sellingPlanGroupRemoveProducts?.userErrors?.length) {
          console.warn(`[TierProductDeletion] Selling plan group removal warning:`,
            removeData.data.sellingPlanGroupRemoveProducts.userErrors);
          // Non-blocking - continue with deletion
        } else {
          sellingPlanGroupUpdated = true;
          console.log(`[TierProductDeletion] Removed from selling plan group successfully`);
        }
      } catch (spgError: any) {
        console.warn(`[TierProductDeletion] Failed to remove from selling plan group:`, spgError.message);
        // Non-blocking - continue with deletion
      }
    }

    // 3. Delete product from Shopify
    console.log(`[TierProductDeletion] Deleting Shopify product: ${product.shopifyProductId}`);

    const deleteResult = await admin.graphql(`
      mutation DeleteProduct($id: ID!) {
        productDelete(input: { id: $id }) {
          deletedProductId
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: { id: product.shopifyProductId }
    });

    const deleteData = await deleteResult.json() as {
      data?: {
        productDelete?: {
          deletedProductId?: string;
          userErrors?: Array<{ field: string; message: string }>;
        };
      };
    };

    // Check for Shopify errors
    if (deleteData.data?.productDelete?.userErrors?.length) {
      const errors = deleteData.data.productDelete.userErrors;
      const errorMessages = errors.map(e => e.message).join(', ');

      // Check if product already doesn't exist (not an error)
      const notFoundError = errors.some(e =>
        e.message.toLowerCase().includes('not found') ||
        e.message.toLowerCase().includes('does not exist')
      );

      if (!notFoundError) {
        console.error(`[TierProductDeletion] Shopify deletion failed:`, errors);
        return {
          success: false,
          error: `Shopify deletion failed: ${errorMessages}`
        };
      }

      console.log(`[TierProductDeletion] Product already deleted from Shopify, continuing with database cleanup`);
    } else {
      console.log(`[TierProductDeletion] Shopify product deleted successfully`);
    }

    // 4. Clean up database records (AFTER Shopify success)
    console.log(`[TierProductDeletion] Cleaning up database records`);

    // 4a. Delete tier purchases (will remove purchase history)
    const purchasesDeleted = await db.tierPurchase.deleteMany({
      where: { tierProductId }
    });
    console.log(`[TierProductDeletion] Deleted ${purchasesDeleted.count} tier purchase(s)`);

    // 4b. Unlink subscriptions (set tierProductId to null)
    const subscriptionsUnlinked = await db.tierSubscription.updateMany({
      where: { tierProductId },
      data: { tierProductId: null }
    });
    console.log(`[TierProductDeletion] Unlinked ${subscriptionsUnlinked.count} subscription(s)`);

    // 4c. Delete tier product record
    await db.tierProduct.delete({
      where: { id: tierProductId }
    });
    console.log(`[TierProductDeletion] Tier product record deleted`);

    // 4d. Optionally clean up empty selling plan group reference in database
    if (product.sellingPlanGroupId) {
      try {
        // Check if any other products use this selling plan group
        const otherProducts = await db.tierProduct.count({
          where: {
            sellingPlanGroupId: product.sellingPlanGroupId,
            id: { not: tierProductId }
          }
        });

        if (otherProducts === 0) {
          console.log(`[TierProductDeletion] No other products use selling plan group, could be cleaned up`);
          // Note: We don't delete the SellingPlanGroup from Shopify (not possible)
          // The database record could be marked as orphaned or deleted if needed
        }
      } catch (spgCleanupError) {
        console.warn(`[TierProductDeletion] Selling plan group cleanup check failed:`, spgCleanupError);
      }
    }

    console.log(`[TierProductDeletion] Successfully deleted tier product: ${tierProductId}`);

    return {
      success: true,
      deletedShopifyProductId: product.shopifyProductId,
      cleanupSummary: {
        purchasesDeleted: purchasesDeleted.count,
        subscriptionsUnlinked: subscriptionsUnlinked.count,
        sellingPlanGroupUpdated
      }
    };

  } catch (error: any) {
    console.error(`[TierProductDeletion] Error during deletion:`, error);

    return {
      success: false,
      error: error.message || 'Unknown error during deletion'
    };
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a tier product can be deleted (quick check)
 * Use validateTierProductDeletion for full details
 */
export async function canDeleteTierProduct(
  shop: string,
  tierProductId: string
): Promise<boolean> {
  const validation = await validateTierProductDeletion(shop, tierProductId);
  return validation.canDelete;
}
