/**
 * Manual Tier Assignment Service
 * 
 * Handles manual override of automatic tier calculations.
 * Allows admins to manually assign customers to specific tiers.
 */

import prisma from "../db.server";
import { v4 as uuidv4 } from "uuid";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface TierAssignmentResult {
  success: boolean;
  customerId: string;
  previousTierId: string | null;
  previousTierName: string | null;
  newTierId: string | null;
  newTierName: string | null;
  message?: string;
  error?: string;
}

interface ManualAssignmentOptions {
  permanentOverride?: boolean;
  overrideDuration?: number; // days
  notifyCustomer?: boolean;
}

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Manually assign a customer to a specific tier
 */
export async function assignCustomerToTier(
  shop: string,
  customerId: string,
  tierId: string | null,
  adminUserId: string,
  note?: string,
  options?: ManualAssignmentOptions
): Promise<TierAssignmentResult> {
  try {
    console.log(`[ManualTierAssignment] Assigning customer ${customerId} to tier ${tierId}`);
    
    // Get current customer data with tier
    const customer = await prisma.customer.findFirst({
      where: { 
        id: customerId,
        shop: shop 
      }
    });

    if (!customer) {
      return {
        success: false,
        customerId,
        previousTierId: null,
        previousTierName: null,
        newTierId: null,
        newTierName: null,
        error: "Customer not found"
      };
    }

    // Get current tier details if exists
    let currentTier = null;
    if (customer.currentTierId) {
      currentTier = await prisma.tier.findUnique({
        where: { id: customer.currentTierId }
      });
    }

    // Get new tier details if provided
    let newTier = null;
    if (tierId) {
      newTier = await prisma.tier.findFirst({
        where: { 
          id: tierId,
          shop: shop // Ensure tier belongs to same shop
        }
      });

      if (!newTier) {
        return {
          success: false,
          customerId,
          previousTierId: customer.currentTierId,
          previousTierName: currentTier?.name || null,
          newTierId: null,
          newTierName: null,
          error: "Selected tier not found or doesn't belong to this shop"
        };
      }
    }

    // Check if tier is actually changing
    if (customer.currentTierId === tierId) {
      return {
        success: false,
        customerId,
        previousTierId: customer.currentTierId,
        previousTierName: currentTier?.name || null,
        newTierId: tierId,
        newTierName: newTier?.name || null,
        message: "Customer is already in this tier"
      };
    }

    // Calculate override expiry if duration is specified
    let overrideExpiry: Date | null = null;
    if (options?.overrideDuration && options.overrideDuration > 0) {
      overrideExpiry = new Date();
      overrideExpiry.setDate(overrideExpiry.getDate() + options.overrideDuration);
    }

    // Update customer's tier
    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        currentTierId: tierId,
        updatedAt: new Date()
      }
    });

    // Update or create CustomerTierState to store the manual override
    await prisma.customerTierState.upsert({
      where: { customerId },
      create: {
        id: uuidv4(),
        shop,
        customerId,
        effectiveTierId: tierId,
        tierSource: 'MANUAL_OVERRIDE',
        hasManualOverride: true,
        manualOverrideTierId: tierId,  // Store the override tier ID
        manualOverrideAt: new Date(),
        manualOverrideBy: adminUserId,
        manualOverrideExpiry: overrideExpiry,
        manualOverrideNote: note || null,
        lastResolvedAt: new Date(),
        resolutionReason: `Manual override by admin: ${note || 'No reason provided'}`,
      },
      update: {
        effectiveTierId: tierId,
        tierSource: 'MANUAL_OVERRIDE',
        hasManualOverride: true,
        manualOverrideTierId: tierId,  // Store the override tier ID
        manualOverrideAt: new Date(),
        manualOverrideBy: adminUserId,
        manualOverrideExpiry: overrideExpiry,
        manualOverrideNote: note || null,
        lastResolvedAt: new Date(),
        resolutionReason: `Manual override by admin: ${note || 'No reason provided'}`,
        updatedAt: new Date(),
      },
    });

    // Determine change type
    const changeType = determineChangeType(
      customer.currentTierId,
      tierId,
      currentTier?.minSpend,
      newTier?.minSpend
    );

    // Create tier change log entry
    await prisma.tierChangeLog.create({
      data: {
        id: uuidv4(),
        customerId,
        shop,
        fromTierId: customer.currentTierId,
        fromTierName: currentTier?.name || null,
        toTierId: tierId,
        toTierName: newTier?.name || null,
        changeType,
        triggerType: 'MANUAL_ADMIN',
        totalSpending: null, // Not relevant for manual changes
        periodSpending: null,
        note: note || `Manually assigned by admin`,
        processedBy: adminUserId,
        metadata: {
          adminUserId,
          permanentOverride: options?.permanentOverride ?? true, // Default to permanent
          overrideDuration: options?.overrideDuration || null,
          reason: note,
          timestamp: new Date().toISOString()
        },
        createdAt: new Date()
      }
    });

    console.log(`[ManualTierAssignment] Successfully assigned customer ${customerId} from ${currentTier?.name || 'None'} to ${newTier?.name || 'None'}`);

    return {
      success: true,
      customerId,
      previousTierId: customer.currentTierId,
      previousTierName: currentTier?.name || null,
      newTierId: tierId,
      newTierName: newTier?.name || null,
      message: `Customer successfully moved to ${newTier?.name || 'No tier'}`
    };
  } catch (error) {
    console.error(`[ManualTierAssignment] Error assigning tier:`, error);
    return {
      success: false,
      customerId,
      previousTierId: null,
      previousTierName: null,
      newTierId: null,
      newTierName: null,
      error: error instanceof Error ? error.message : "Failed to assign tier"
    };
  }
}

/**
 * Manual override information returned by getManualOverride
 */
export interface ManualOverrideInfo {
  hasOverride: boolean;
  tierId: string | null;
  tierName: string | null;
  setAt: Date | null;
  setBy: string | null;
  expiresAt: Date | null;
  note: string | null;
}

// Transaction client type for Prisma
type TransactionClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Get manual override information for a customer
 *
 * Returns the tier ID that was manually set, not just a boolean.
 * This is the preferred function for tier resolution.
 *
 * @param customerId - The customer ID to check
 * @param tx - Optional transaction client for atomic operations
 * @param options - Additional options
 * @param options.clearIfExpired - If true, clears expired overrides from database
 */
export async function getManualOverride(
  customerId: string,
  tx?: TransactionClient,
  options?: { clearIfExpired?: boolean }
): Promise<ManualOverrideInfo> {
  const prisma = tx || prisma;
  const noOverride: ManualOverrideInfo = {
    hasOverride: false,
    tierId: null,
    tierName: null,
    setAt: null,
    setBy: null,
    expiresAt: null,
    note: null,
  };

  try {
    console.log(`[getManualOverride] Checking override for customer: ${customerId}`);

    // Check CustomerTierState first (O(1) lookup)
    const tierState = await prisma.customerTierState.findUnique({
      where: { customerId },
      select: {
        hasManualOverride: true,
        manualOverrideTierId: true,
        manualOverrideTier: {
          select: { name: true }
        },
        manualOverrideAt: true,
        manualOverrideBy: true,
        manualOverrideExpiry: true,
        manualOverrideNote: true,
      },
    });

    if (tierState) {
      // If CustomerTierState exists, use the explicit fields
      if (!tierState.hasManualOverride) {
        console.log(`[getManualOverride] CustomerTierState.hasManualOverride is false`);
        return noOverride;
      }

      // Check if temporary override has expired
      if (tierState.manualOverrideExpiry && tierState.manualOverrideExpiry < new Date()) {
        console.log(`[getManualOverride] Manual override expired at ${tierState.manualOverrideExpiry}`);

        // CRITICAL FIX: Clear expired override from database to prevent stale data
        if (options?.clearIfExpired) {
          console.log(`[getManualOverride] Clearing expired override for customer: ${customerId}`);
          try {
            // Use non-transactional update since we're just cleaning up
            // and this is a best-effort operation
            await prisma.customerTierState.update({
              where: { customerId },
              data: {
                hasManualOverride: false,
                manualOverrideTierId: null,
                manualOverrideAt: null,
                manualOverrideBy: null,
                manualOverrideExpiry: null,
                manualOverrideNote: null,
                // Note: Don't clear effectiveTierId - let tier resolution update it
                updatedAt: new Date(),
              }
            });
            console.log(`[getManualOverride] Expired override cleared successfully`);
          } catch (clearError) {
            // Don't fail the main operation if cleanup fails
            console.error(`[getManualOverride] Failed to clear expired override:`, clearError);
          }
        }

        return noOverride;
      }

      // Return the stored override tier ID
      console.log(`[getManualOverride] Active override found: tierId=${tierState.manualOverrideTierId}`);
      return {
        hasOverride: true,
        tierId: tierState.manualOverrideTierId,
        tierName: tierState.manualOverrideTier?.name || null,
        setAt: tierState.manualOverrideAt,
        setBy: tierState.manualOverrideBy,
        expiresAt: tierState.manualOverrideExpiry,
        note: tierState.manualOverrideNote,
      };
    }

    // LEGACY FALLBACK: Scan TierChangeLog for manual overrides
    console.log(`[getManualOverride] CustomerTierState not found, falling back to TierChangeLog`);

    const lastManualEntry = await prisma.tierChangeLog.findFirst({
      where: {
        customerId,
        triggerType: 'MANUAL_ADMIN'
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!lastManualEntry) {
      console.log(`[getManualOverride] No MANUAL_ADMIN entries found`);
      return noOverride;
    }

    // Parse metadata
    let metadata = lastManualEntry.metadata as any;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = null;
      }
    }

    // Check if override was removed
    if (metadata?.action === 'remove_override' || lastManualEntry.note?.includes('override removed')) {
      console.log(`[getManualOverride] Last manual action was removal`);
      return noOverride;
    }

    // Check permanent override
    if (metadata?.permanentOverride === true) {
      // Verify no removal after this
      const removalAfter = await prisma.tierChangeLog.findFirst({
        where: {
          customerId,
          createdAt: { gt: lastManualEntry.createdAt },
          triggerType: 'MANUAL_ADMIN',
          note: { contains: 'override removed' }
        }
      });

      if (removalAfter) {
        console.log(`[getManualOverride] Override was removed after being set`);
        return noOverride;
      }

      console.log(`[getManualOverride] Legacy permanent override found: tierId=${lastManualEntry.toTierId}`);
      return {
        hasOverride: true,
        tierId: lastManualEntry.toTierId,
        tierName: lastManualEntry.toTierName,
        setAt: lastManualEntry.createdAt,
        setBy: metadata?.adminUserId || lastManualEntry.processedBy || null,
        expiresAt: null,
        note: lastManualEntry.note,
      };
    }

    // Check temporary override
    if (metadata?.overrideDuration) {
      const expiryDate = new Date(lastManualEntry.createdAt);
      expiryDate.setDate(expiryDate.getDate() + metadata.overrideDuration);

      if (expiryDate > new Date()) {
        console.log(`[getManualOverride] Legacy temporary override found: tierId=${lastManualEntry.toTierId}`);
        return {
          hasOverride: true,
          tierId: lastManualEntry.toTierId,
          tierName: lastManualEntry.toTierName,
          setAt: lastManualEntry.createdAt,
          setBy: metadata?.adminUserId || lastManualEntry.processedBy || null,
          expiresAt: expiryDate,
          note: lastManualEntry.note,
        };
      }
    }

    console.log(`[getManualOverride] No active override found`);
    return noOverride;
  } catch (error) {
    console.error(`[getManualOverride] Error:`, error);
    return noOverride;
  }
}

/**
 * Check if a customer has a manual override active (backward compatible)
 *
 * @deprecated Use getManualOverride() instead for tier resolution
 * This function only returns a boolean and cannot return the override tier ID.
 *
 * @param customerId - The customer ID to check
 * @param tx - Optional transaction client for atomic operations
 */
export async function hasManualOverride(
  customerId: string,
  tx?: TransactionClient
): Promise<boolean> {
  const result = await getManualOverride(customerId, tx);
  return result.hasOverride;
}

/**
 * Remove manual override and recalculate tier
 */
export async function removeManualOverride(
  shop: string,
  customerId: string,
  adminUserId: string
): Promise<TierAssignmentResult> {
  try {
    // Get current customer data
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        shop: shop
      }
    });

    if (!customer) {
      return {
        success: false,
        customerId,
        previousTierId: null,
        previousTierName: null,
        newTierId: null,
        newTierName: null,
        error: "Customer not found"
      };
    }

    // Get current tier details
    let currentTier = null;
    if (customer.currentTierId) {
      currentTier = await prisma.tier.findUnique({
        where: { id: customer.currentTierId }
      });
    }

    // Clear the manual override in CustomerTierState
    const tierState = await prisma.customerTierState.findUnique({
      where: { customerId }
    });

    if (tierState) {
      await prisma.customerTierState.update({
        where: { customerId },
        data: {
          hasManualOverride: false,
          manualOverrideTierId: null,
          manualOverrideAt: null,
          manualOverrideBy: null,
          manualOverrideExpiry: null,
          manualOverrideNote: null,
          // Don't change effectiveTierId - let tier resolution handle it
          updatedAt: new Date(),
        }
      });
    }

    // Log that override is being removed
    await prisma.tierChangeLog.create({
      data: {
        id: uuidv4(),
        customerId,
        shop,
        fromTierId: customer.currentTierId,
        fromTierName: currentTier?.name || null,
        toTierId: null, // Will be recalculated
        toTierName: null,
        changeType: 'INITIAL_ASSIGNMENT', // Will be recalculated
        triggerType: 'MANUAL_ADMIN',
        note: "Manual override removed - tier will be recalculated",
        processedBy: adminUserId,
        metadata: {
          action: "remove_override",
          adminUserId,
          permanentOverride: false, // Explicitly mark as not having override
          timestamp: new Date().toISOString()
        },
        createdAt: new Date()
      }
    });

    return {
      success: true,
      customerId,
      previousTierId: customer.currentTierId,
      previousTierName: currentTier?.name || null,
      newTierId: null,
      newTierName: null,
      message: "Manual override removed. Tier will be recalculated on next review."
    };
  } catch (error) {
    console.error(`[ManualTierAssignment] Error removing override:`, error);
    return {
      success: false,
      customerId,
      previousTierId: null,
      previousTierName: null,
      newTierId: null,
      newTierName: null,
      error: error instanceof Error ? error.message : "Failed to remove override"
    };
  }
}

/**
 * Get tier change history for a customer
 */
export async function getTierHistory(
  customerId: string,
  limit: number = 10
): Promise<any[]> {
  try {
    const history = await prisma.tierChangeLog.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return history.map(entry => ({
      ...entry,
      isManual: entry.triggerType === 'MANUAL_ADMIN',
      metadata: entry.metadata || {}
    }));
  } catch (error) {
    console.error(`[ManualTierAssignment] Error fetching history:`, error);
    return [];
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Determine the type of tier change
 */
function determineChangeType(
  fromTierId: string | null,
  toTierId: string | null,
  fromMinSpend?: number,
  toMinSpend?: number
): 'INITIAL_ASSIGNMENT' | 'UPGRADE' | 'DOWNGRADE' {
  if (!fromTierId && toTierId) {
    return 'INITIAL_ASSIGNMENT';
  }
  
  if (!toTierId) {
    return 'DOWNGRADE'; // Removed from all tiers
  }
  
  if (!fromTierId) {
    return 'INITIAL_ASSIGNMENT';
  }

  // Compare min spend to determine upgrade/downgrade
  if (fromMinSpend !== undefined && toMinSpend !== undefined) {
    if (toMinSpend > fromMinSpend) {
      return 'UPGRADE';
    } else if (toMinSpend < fromMinSpend) {
      return 'DOWNGRADE';
    }
  }
  
  // Default to upgrade if we can't determine
  return 'UPGRADE';
}

/**
 * Bulk assign multiple customers to a tier
 */
export async function bulkAssignTier(
  shop: string,
  customerIds: string[],
  tierId: string | null,
  adminUserId: string,
  note?: string
): Promise<{
  successful: number;
  failed: number;
  results: TierAssignmentResult[];
}> {
  const results: TierAssignmentResult[] = [];
  let successful = 0;
  let failed = 0;

  for (const customerId of customerIds) {
    const result = await assignCustomerToTier(
      shop,
      customerId,
      tierId,
      adminUserId,
      note
    );

    results.push(result);
    if (result.success) {
      successful++;
    } else {
      failed++;
    }
  }

  return {
    successful,
    failed,
    results
  };
}

// ============================================
// CLEANUP FUNCTIONS
// ============================================

/**
 * Clean up expired manual overrides across all customers
 *
 * This function is designed to be called by a cron job or scheduled task.
 * It finds all customers with expired manual overrides and clears them.
 *
 * @param shop - Optional shop domain to limit cleanup to specific shop
 * @returns Summary of cleanup operation
 */
export async function cleanupExpiredManualOverrides(shop?: string): Promise<{
  checked: number;
  cleared: number;
  errors: number;
  details: Array<{ customerId: string; expiredAt: Date; error?: string }>;
}> {
  console.log(`[ManualTierAssignment] Starting cleanup of expired manual overrides${shop ? ` for shop: ${shop}` : ''}`);

  const now = new Date();

  try {
    // Find all customers with expired manual overrides
    const expiredOverrides = await prisma.customerTierState.findMany({
      where: {
        ...(shop ? { shop } : {}),
        hasManualOverride: true,
        manualOverrideExpiry: {
          not: null,
          lt: now  // Expiry date is in the past
        }
      },
      select: {
        customerId: true,
        shop: true,
        manualOverrideExpiry: true,
        manualOverrideTierId: true,
      }
    });

    console.log(`[ManualTierAssignment] Found ${expiredOverrides.length} expired overrides to clear`);

    let cleared = 0;
    let errors = 0;
    const details: Array<{ customerId: string; expiredAt: Date; error?: string }> = [];

    for (const state of expiredOverrides) {
      try {
        // Clear the expired override
        await prisma.customerTierState.update({
          where: { customerId: state.customerId },
          data: {
            hasManualOverride: false,
            manualOverrideTierId: null,
            manualOverrideAt: null,
            manualOverrideBy: null,
            manualOverrideExpiry: null,
            manualOverrideNote: null,
            // Update resolution reason to indicate cleanup
            resolutionReason: `Manual override expired on ${state.manualOverrideExpiry?.toISOString()} - cleared by cleanup job`,
            updatedAt: new Date(),
          }
        });

        // Log the expiration in TierChangeLog
        await prisma.tierChangeLog.create({
          data: {
            id: uuidv4(),
            customerId: state.customerId,
            shop: state.shop,
            fromTierId: state.manualOverrideTierId,
            toTierId: null, // Will be recalculated
            changeType: 'DOWNGRADE',
            triggerType: 'TIER_RECALCULATION',
            note: `Manual override expired on ${state.manualOverrideExpiry?.toISOString()}`,
            metadata: {
              action: 'override_expired',
              expiredAt: state.manualOverrideExpiry?.toISOString(),
              clearedBy: 'cleanup_job',
              timestamp: new Date().toISOString()
            },
            createdAt: new Date()
          }
        });

        cleared++;
        details.push({
          customerId: state.customerId,
          expiredAt: state.manualOverrideExpiry!
        });

        console.log(`[ManualTierAssignment] Cleared expired override for customer: ${state.customerId}`);
      } catch (error) {
        errors++;
        details.push({
          customerId: state.customerId,
          expiredAt: state.manualOverrideExpiry!,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        console.error(`[ManualTierAssignment] Failed to clear override for customer ${state.customerId}:`, error);
      }
    }

    console.log(`[ManualTierAssignment] Cleanup complete: ${cleared} cleared, ${errors} errors`);

    return {
      checked: expiredOverrides.length,
      cleared,
      errors,
      details
    };
  } catch (error) {
    console.error(`[ManualTierAssignment] Cleanup job failed:`, error);
    throw error;
  }
}