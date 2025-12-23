/**
 * Tier Product Deletion Service
 *
 * Handles validation and deletion of tier products from both Shopify and database.
 * Supports soft delete with 30-day recovery, audit logging, and restore functionality.
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
  type: 'not_found' | 'active_purchases' | 'active_subscriptions' | 'shopify_error' | 'already_deleted';
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
  softDeleted?: boolean; // True if soft deleted, false if permanent
  cleanupSummary?: {
    purchasesDeleted: number;
    subscriptionsUnlinked: number;
    sellingPlanGroupUpdated: boolean;
  };
}

export interface RestoreResult {
  success: boolean;
  error?: string;
  restoredProductId?: string;
}

export interface AuditLogEntry {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'PERMANENT_DELETE';
  performedBy?: string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// Soft delete recovery period in days
const SOFT_DELETE_RETENTION_DAYS = 30;

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
 * - Already soft-deleted (BLOCKER)
 * - Active purchases (BLOCKER)
 * - Active subscriptions (BLOCKER)
 * - Inactive/expired purchases (WARNING)
 * - Cancelled subscriptions (WARNING)
 *
 * @param shop - Shop domain
 * @param tierProductId - Tier product ID to validate
 * @param includeDeleted - If true, include soft-deleted products in search
 * @returns Validation result with blockers and warnings
 */
export async function validateTierProductDeletion(
  shop: string,
  tierProductId: string,
  includeDeleted: boolean = false
): Promise<DeletionValidationResult> {
  const blockers: DeletionBlocker[] = [];
  const warnings: DeletionWarning[] = [];

  console.log(`[TierProductDeletion] Validating deletion for product: ${tierProductId}`);

  // 1. Find tier product
  const product = await db.tierProduct.findFirst({
    where: {
      id: tierProductId,
      shop,
      // By default, don't find soft-deleted products for deletion
      ...(includeDeleted ? {} : { deletedAt: null })
    },
    include: { tier: true }
  });

  // Check if already soft-deleted
  if (!product) {
    // Check if it exists but is soft-deleted
    const softDeletedProduct = await db.tierProduct.findFirst({
      where: { id: tierProductId, shop, deletedAt: { not: null } },
      include: { tier: true }
    });

    if (softDeletedProduct) {
      console.log(`[TierProductDeletion] Product is already soft-deleted: ${tierProductId}`);
      return {
        canDelete: false,
        blockers: [{
          type: 'already_deleted',
          message: 'This product has already been deleted. You can restore it or permanently delete it.'
        }],
        warnings: [],
        product: softDeletedProduct
      };
    }
  }

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
 * Soft delete a tier product (moves to "Recently Deleted")
 *
 * Deletion order (safe):
 * 1. Validate (re-check for race conditions)
 * 2. Remove from Shopify selling plan group (if applicable)
 * 3. Delete Shopify product
 * 4. Soft delete database record (set deletedAt, keep for recovery)
 * 5. Create audit log entry
 *
 * @param shop - Shop domain
 * @param tierProductId - Tier product ID to delete
 * @param admin - Shopify admin API context
 * @param options - Optional deletion options (performedBy, reason)
 * @returns Deletion result
 */
export async function deleteTierProduct(
  shop: string,
  tierProductId: string,
  admin: AdminApiContext,
  options?: { performedBy?: string; reason?: string }
): Promise<DeletionResult> {
  console.log(`[TierProductDeletion] Starting soft deletion for product: ${tierProductId}`);

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

  // Create snapshot of current state for audit log
  const previousState = {
    id: product.id,
    shop: product.shop,
    tierId: product.tierId,
    tierName: product.tier?.name,
    shopifyProductId: product.shopifyProductId,
    sku: product.sku,
    price: product.price?.toString(),
    isActive: product.isActive,
  };

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
      } catch (spgError: unknown) {
        const errorMessage = spgError instanceof Error ? spgError.message : 'Unknown error';
        console.warn(`[TierProductDeletion] Failed to remove from selling plan group:`, errorMessage);
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

      console.log(`[TierProductDeletion] Product already deleted from Shopify, continuing with database soft delete`);
    } else {
      console.log(`[TierProductDeletion] Shopify product deleted successfully`);
    }

    // 4. Soft delete database record (AFTER Shopify success)
    console.log(`[TierProductDeletion] Soft deleting database record`);

    // Count related records for audit log
    const purchasesCount = await db.tierPurchase.count({
      where: { tierProductId }
    });

    const subscriptionsCount = await db.tierSubscription.count({
      where: { tierProductId }
    });

    // 4a. Unlink subscriptions (set tierProductId to null) - do this even for soft delete
    // to prevent issues if product is restored
    const subscriptionsUnlinked = await db.tierSubscription.updateMany({
      where: { tierProductId },
      data: { tierProductId: null }
    });
    console.log(`[TierProductDeletion] Unlinked ${subscriptionsUnlinked.count} subscription(s)`);

    // 4b. Soft delete tier product record (set deletedAt instead of deleting)
    await db.tierProduct.update({
      where: { id: tierProductId },
      data: {
        deletedAt: new Date(),
        deletedBy: options?.performedBy || null,
        deletionReason: options?.reason || null,
        isActive: false, // Also mark as inactive
      }
    });
    console.log(`[TierProductDeletion] Tier product soft deleted`);

    // 5. Create audit log entry
    await createAuditLog(shop, tierProductId, {
      action: 'DELETE',
      performedBy: options?.performedBy,
      previousState,
      newState: { deletedAt: new Date().toISOString(), isActive: false },
      metadata: {
        reason: options?.reason,
        shopifyProductDeleted: true,
        purchasesAffected: purchasesCount,
        subscriptionsUnlinked: subscriptionsUnlinked.count,
        sellingPlanGroupUpdated,
        softDelete: true,
        recoveryDeadline: new Date(Date.now() + SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      }
    });

    console.log(`[TierProductDeletion] Successfully soft deleted tier product: ${tierProductId}`);

    return {
      success: true,
      softDeleted: true,
      deletedShopifyProductId: product.shopifyProductId,
      cleanupSummary: {
        purchasesDeleted: 0, // Purchases NOT deleted in soft delete
        subscriptionsUnlinked: subscriptionsUnlinked.count,
        sellingPlanGroupUpdated
      }
    };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during deletion';
    console.error(`[TierProductDeletion] Error during deletion:`, error);

    return {
      success: false,
      error: errorMessage
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

/**
 * Create an audit log entry for tier product actions
 */
async function createAuditLog(
  shop: string,
  tierProductId: string,
  entry: AuditLogEntry
): Promise<void> {
  try {
    await db.tierProductAuditLog.create({
      data: {
        shop,
        tierProductId,
        action: entry.action,
        performedBy: entry.performedBy || null,
        previousState: entry.previousState || null,
        newState: entry.newState || null,
        metadata: entry.metadata || null,
      }
    });
    console.log(`[TierProductDeletion] Audit log created: ${entry.action} for ${tierProductId}`);
  } catch (error) {
    // Don't fail the operation if audit log fails
    console.error(`[TierProductDeletion] Failed to create audit log:`, error);
  }
}

// ============================================
// RESTORE FUNCTION
// ============================================

/**
 * Restore a soft-deleted tier product
 *
 * Note: This only restores the database record. The Shopify product
 * must be recreated separately (not automated).
 *
 * @param shop - Shop domain
 * @param tierProductId - Tier product ID to restore
 * @param options - Optional restore options
 * @returns Restore result
 */
export async function restoreTierProduct(
  shop: string,
  tierProductId: string,
  options?: { performedBy?: string }
): Promise<RestoreResult> {
  console.log(`[TierProductDeletion] Starting restore for product: ${tierProductId}`);

  try {
    // Find the soft-deleted product
    const product = await db.tierProduct.findFirst({
      where: {
        id: tierProductId,
        shop,
        deletedAt: { not: null }
      },
      include: { tier: true }
    });

    if (!product) {
      console.log(`[TierProductDeletion] Product not found or not deleted: ${tierProductId}`);
      return {
        success: false,
        error: 'Product not found or is not deleted'
      };
    }

    // Check if recovery period has expired
    const deletedAt = product.deletedAt!;
    const recoveryDeadline = new Date(deletedAt.getTime() + SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    if (new Date() > recoveryDeadline) {
      console.log(`[TierProductDeletion] Recovery period expired for: ${tierProductId}`);
      return {
        success: false,
        error: `Recovery period has expired. Product was deleted on ${deletedAt.toISOString()}`
      };
    }

    // Create snapshot for audit log
    const previousState = {
      id: product.id,
      deletedAt: product.deletedAt?.toISOString(),
      deletedBy: product.deletedBy,
      deletionReason: product.deletionReason,
      isActive: product.isActive,
    };

    // Restore the product
    await db.tierProduct.update({
      where: { id: tierProductId },
      data: {
        deletedAt: null,
        deletedBy: null,
        deletionReason: null,
        // Note: We don't restore isActive - admin must manually reactivate
        // because the Shopify product may not exist anymore
      }
    });

    // Create audit log
    await createAuditLog(shop, tierProductId, {
      action: 'RESTORE',
      performedBy: options?.performedBy,
      previousState,
      newState: { deletedAt: null, restoredAt: new Date().toISOString() },
      metadata: {
        note: 'Database record restored. Shopify product may need to be recreated.',
        originalDeletionDate: deletedAt.toISOString(),
      }
    });

    console.log(`[TierProductDeletion] Successfully restored tier product: ${tierProductId}`);

    return {
      success: true,
      restoredProductId: tierProductId
    };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during restore';
    console.error(`[TierProductDeletion] Error during restore:`, error);

    return {
      success: false,
      error: errorMessage
    };
  }
}

// ============================================
// PERMANENT DELETE FUNCTION
// ============================================

/**
 * Permanently delete a soft-deleted tier product
 *
 * This removes the database record completely. Only works on products
 * that have already been soft-deleted.
 *
 * @param shop - Shop domain
 * @param tierProductId - Tier product ID to permanently delete
 * @param options - Optional delete options
 * @returns Deletion result
 */
export async function permanentlyDeleteTierProduct(
  shop: string,
  tierProductId: string,
  options?: { performedBy?: string }
): Promise<DeletionResult> {
  console.log(`[TierProductDeletion] Starting permanent deletion for product: ${tierProductId}`);

  try {
    // Find the soft-deleted product
    const product = await db.tierProduct.findFirst({
      where: {
        id: tierProductId,
        shop,
        deletedAt: { not: null }
      },
      include: { tier: true }
    });

    if (!product) {
      console.log(`[TierProductDeletion] Product not found or not soft-deleted: ${tierProductId}`);
      return {
        success: false,
        error: 'Product not found or has not been soft-deleted first'
      };
    }

    // Create snapshot for audit log
    const previousState = {
      id: product.id,
      shop: product.shop,
      tierId: product.tierId,
      tierName: product.tier?.name,
      shopifyProductId: product.shopifyProductId,
      sku: product.sku,
      price: product.price?.toString(),
      deletedAt: product.deletedAt?.toISOString(),
      deletedBy: product.deletedBy,
    };

    // Delete related records first
    // 1. Delete tier purchases
    const purchasesDeleted = await db.tierPurchase.deleteMany({
      where: { tierProductId }
    });
    console.log(`[TierProductDeletion] Deleted ${purchasesDeleted.count} purchase(s)`);

    // 2. Audit logs will cascade delete due to relation

    // 3. Delete the tier product permanently
    await db.tierProduct.delete({
      where: { id: tierProductId }
    });
    console.log(`[TierProductDeletion] Tier product permanently deleted`);

    // Note: We can't create an audit log after deleting since it would cascade delete
    // Instead, log to console for monitoring
    console.log(`[TierProductDeletion] PERMANENT_DELETE audit:`, {
      action: 'PERMANENT_DELETE',
      performedBy: options?.performedBy,
      previousState,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      softDeleted: false, // Permanent delete
      deletedShopifyProductId: product.shopifyProductId,
      cleanupSummary: {
        purchasesDeleted: purchasesDeleted.count,
        subscriptionsUnlinked: 0, // Already unlinked during soft delete
        sellingPlanGroupUpdated: false // Already done during soft delete
      }
    };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during permanent deletion';
    console.error(`[TierProductDeletion] Error during permanent deletion:`, error);

    return {
      success: false,
      error: errorMessage
    };
  }
}

// ============================================
// QUERY FUNCTIONS
// ============================================

/**
 * Get all soft-deleted tier products for a shop
 *
 * @param shop - Shop domain
 * @returns List of soft-deleted tier products with recovery info
 */
export async function getDeletedTierProducts(shop: string): Promise<Array<{
  product: TierProduct & { tier: Tier | null };
  deletedAt: Date;
  deletedBy: string | null;
  deletionReason: string | null;
  recoveryDeadline: Date;
  canRecover: boolean;
  daysUntilPermanentDelete: number;
}>> {
  const deletedProducts = await db.tierProduct.findMany({
    where: {
      shop,
      deletedAt: { not: null }
    },
    include: { tier: true },
    orderBy: { deletedAt: 'desc' }
  });

  const now = new Date();

  return deletedProducts.map(product => {
    const deletedAt = product.deletedAt!;
    const recoveryDeadline = new Date(deletedAt.getTime() + SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const canRecover = now < recoveryDeadline;
    const daysUntilPermanentDelete = Math.max(0, Math.ceil((recoveryDeadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

    return {
      product,
      deletedAt,
      deletedBy: product.deletedBy,
      deletionReason: product.deletionReason,
      recoveryDeadline,
      canRecover,
      daysUntilPermanentDelete
    };
  });
}

/**
 * Get audit log entries for a tier product
 *
 * @param shop - Shop domain
 * @param tierProductId - Tier product ID
 * @returns List of audit log entries
 */
export async function getTierProductAuditLog(
  shop: string,
  tierProductId: string
): Promise<Array<{
  id: string;
  action: string;
  performedBy: string | null;
  previousState: unknown;
  newState: unknown;
  metadata: unknown;
  createdAt: Date;
}>> {
  return db.tierProductAuditLog.findMany({
    where: {
      shop,
      tierProductId
    },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Cleanup expired soft-deleted products
 *
 * Called by a scheduled job to permanently delete products
 * past their recovery deadline.
 *
 * @param shop - Optional shop domain (if not provided, cleans all shops)
 * @returns Number of products permanently deleted
 */
export async function cleanupExpiredDeletedProducts(shop?: string): Promise<number> {
  const cutoffDate = new Date(Date.now() - SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  console.log(`[TierProductDeletion] Running cleanup for products deleted before: ${cutoffDate.toISOString()}`);

  // Find expired soft-deleted products
  const expiredProducts = await db.tierProduct.findMany({
    where: {
      ...(shop ? { shop } : {}),
      deletedAt: { lt: cutoffDate }
    },
    select: { id: true, shop: true }
  });

  let deletedCount = 0;

  for (const product of expiredProducts) {
    try {
      // Delete tier purchases first
      await db.tierPurchase.deleteMany({
        where: { tierProductId: product.id }
      });

      // Delete the product
      await db.tierProduct.delete({
        where: { id: product.id }
      });

      deletedCount++;
      console.log(`[TierProductDeletion] Cleanup: Permanently deleted ${product.id}`);
    } catch (error) {
      console.error(`[TierProductDeletion] Cleanup failed for ${product.id}:`, error);
    }
  }

  console.log(`[TierProductDeletion] Cleanup complete: ${deletedCount} products permanently deleted`);

  return deletedCount;
}
