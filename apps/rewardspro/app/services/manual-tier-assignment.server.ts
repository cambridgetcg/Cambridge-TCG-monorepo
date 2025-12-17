/**
 * Manual Tier Assignment Service
 * 
 * Handles manual override of automatic tier calculations.
 * Allows admins to manually assign customers to specific tiers.
 */

import db from "../db.server";
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
    const customer = await db.customer.findFirst({
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
      currentTier = await db.tier.findUnique({
        where: { id: customer.currentTierId }
      });
    }

    // Get new tier details if provided
    let newTier = null;
    if (tierId) {
      newTier = await db.tier.findFirst({
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

    // Update customer's tier
    const updatedCustomer = await db.customer.update({
      where: { id: customerId },
      data: {
        currentTierId: tierId,
        updatedAt: new Date()
      }
    });

    // Determine change type
    const changeType = determineChangeType(
      customer.currentTierId,
      tierId,
      currentTier?.minSpend,
      newTier?.minSpend
    );

    // Create tier change log entry
    await db.tierChangeLog.create({
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
          permanentOverride: options?.permanentOverride || false,
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
 * Check if a customer has a manual override active
 *
 * NEW IMPLEMENTATION: Uses CustomerTierState for O(1) lookup instead of
 * scanning TierChangeLog. This is much faster and more reliable.
 *
 * Falls back to legacy TierChangeLog scanning if CustomerTierState doesn't exist
 * (for backward compatibility during migration).
 */
export async function hasManualOverride(
  customerId: string
): Promise<boolean> {
  try {
    console.log(`[hasManualOverride] Checking override status for customer: ${customerId}`);

    // NEW: Check CustomerTierState first (O(1) lookup)
    const tierState = await db.customerTierState.findUnique({
      where: { customerId },
      select: {
        hasManualOverride: true,
        manualOverrideExpiry: true,
      },
    });

    if (tierState) {
      // If CustomerTierState exists, use the explicit boolean field
      if (!tierState.hasManualOverride) {
        console.log(`[hasManualOverride] CustomerTierState.hasManualOverride is false`);
        return false;
      }

      // Check if temporary override has expired
      if (tierState.manualOverrideExpiry && tierState.manualOverrideExpiry < new Date()) {
        console.log(`[hasManualOverride] Manual override has expired at ${tierState.manualOverrideExpiry}`);
        return false;
      }

      console.log(`[hasManualOverride] Active manual override found in CustomerTierState`);
      return true;
    }

    // LEGACY FALLBACK: If CustomerTierState doesn't exist, fall back to TierChangeLog scanning
    // This ensures backward compatibility during migration
    console.log(`[hasManualOverride] CustomerTierState not found, falling back to legacy TierChangeLog scan`);

    const permanentOverride = await db.tierChangeLog.findFirst({
      where: {
        customerId,
        triggerType: 'MANUAL_ADMIN'
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!permanentOverride) {
      console.log(`[hasManualOverride] No MANUAL_ADMIN entries found - returning false`);
      return false;
    }

    // Parse metadata (Aurora Data API may return as string)
    let metadata = permanentOverride.metadata as any;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch (error) {
        console.error(`[hasManualOverride] Failed to parse metadata string:`, error);
        metadata = null;
      }
    }

    // Check permanent override
    if (metadata?.permanentOverride === true) {
      // Check for removal after this override
      const removalAfterOverride = await db.tierChangeLog.findFirst({
        where: {
          customerId,
          createdAt: { gt: permanentOverride.createdAt },
          triggerType: 'MANUAL_ADMIN',
          note: { contains: 'override removed' }
        }
      });

      const hasActiveOverride = !removalAfterOverride;
      console.log(`[hasManualOverride] Legacy check - permanent override active: ${hasActiveOverride}`);
      return hasActiveOverride;
    }

    // Check temporary override
    if (metadata?.overrideDuration) {
      const overrideDate = new Date(permanentOverride.createdAt);
      overrideDate.setDate(overrideDate.getDate() + metadata.overrideDuration);

      if (overrideDate > new Date()) {
        const removalAfterOverride = await db.tierChangeLog.findFirst({
          where: {
            customerId,
            createdAt: { gt: permanentOverride.createdAt, lt: overrideDate },
            triggerType: 'MANUAL_ADMIN',
            note: { contains: 'override removed' }
          }
        });

        const isActive = !removalAfterOverride;
        console.log(`[hasManualOverride] Legacy check - temporary override active: ${isActive}`);
        return isActive;
      }
    }

    console.log(`[hasManualOverride] No active override found - returning false`);
    return false;
  } catch (error) {
    console.error(`[ManualTierAssignment] Error checking override:`, error);
    return false;
  }
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
    const customer = await db.customer.findFirst({
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
      currentTier = await db.tier.findUnique({
        where: { id: customer.currentTierId }
      });
    }

    // Log that override is being removed
    await db.tierChangeLog.create({
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
    const history = await db.tierChangeLog.findMany({
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