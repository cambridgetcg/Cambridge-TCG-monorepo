/**
 * Tier Resolution Service
 *
 * Handles conflict resolution when a customer has multiple tier sources:
 * - Manual override (admin assignment)
 * - Active tier subscription (recurring payment)
 * - Active tier purchase (one-time payment)
 * - Spending-based tier (automatic calculation)
 *
 * This service determines which tier the customer should actually have
 * when multiple sources exist.
 */

import db from "~/db.server";
import { hasManualOverride } from "./manual-tier-assignment.server";
import { calculateCustomerTierFromDB } from "./tier-calculation.server";

// ============================================
// TYPE DEFINITIONS
// ============================================

export type TierSource =
  | 'MANUAL_OVERRIDE'
  | 'TIER_SUBSCRIPTION'
  | 'TIER_PURCHASE'
  | 'SPENDING_BASED'
  | 'NONE';

export interface TierSourceInfo {
  source: TierSource;
  priority: number;          // Lower number = higher priority (1 = highest)
  tierId: string | null;
  tierName: string | null;
  tierMinSpend: number;      // For comparison when priorities match
  metadata?: {
    subscriptionId?: string;
    purchaseId?: string;
    changeLogId?: string;
    endDate?: string;
    isExpired?: boolean;
  };
}

export interface TierResolutionResult {
  effectiveTierId: string | null;
  effectiveTierName: string | null;
  effectiveSource: TierSource;
  allSources: TierSourceInfo[];
  conflictResolved: boolean;  // True if multiple sources existed
  resolutionReason?: string;
}

// ============================================
// PRIORITY CONFIGURATION
// ============================================

/**
 * Tier source priority order (lower number = higher priority)
 *
 * 1. MANUAL_OVERRIDE - Admin explicitly set this tier, highest authority
 * 2. TIER_SUBSCRIPTION - Customer is paying recurring for this tier
 * 3. TIER_PURCHASE - Customer paid for limited-time access to this tier
 * 4. SPENDING_BASED - Automatic calculation based on order history
 */
const TIER_SOURCE_PRIORITY: Record<TierSource, number> = {
  MANUAL_OVERRIDE: 1,
  TIER_SUBSCRIPTION: 2,
  TIER_PURCHASE: 3,
  SPENDING_BASED: 4,
  NONE: 999,
};

// ============================================
// MAIN RESOLUTION FUNCTION
// ============================================

/**
 * Resolve effective tier for a customer from all possible sources
 *
 * This is the SINGLE SOURCE OF TRUTH for determining a customer's current tier.
 * All tier assignment logic should call this function to respect priority rules.
 */
export async function resolveEffectiveTier(
  shop: string,
  customerId: string,
  options?: {
    skipManualCheck?: boolean;     // Skip manual override check (for performance)
    skipSpendingCalc?: boolean;    // Skip spending calculation (if not needed)
    includeExpired?: boolean;      // Include expired purchases in analysis
  }
): Promise<TierResolutionResult> {
  const sources: TierSourceInfo[] = [];

  console.log(`[TierResolution] ========== Resolving Effective Tier ==========`);
  console.log(`[TierResolution] Customer ID: ${customerId}`);
  console.log(`[TierResolution] Shop: ${shop}`);

  // Get customer data
  const customer = await db.customer.findFirst({
    where: { id: customerId, shop },
    include: { currentTier: true }
  });

  if (!customer) {
    console.log(`[TierResolution] Customer not found`);
    return {
      effectiveTierId: null,
      effectiveTierName: null,
      effectiveSource: 'NONE',
      allSources: [],
      conflictResolved: false,
      resolutionReason: 'Customer not found'
    };
  }

  // ============================================
  // SOURCE 1: Manual Override (Highest Priority)
  // ============================================

  if (!options?.skipManualCheck) {
    const hasOverride = await hasManualOverride(customerId);

    if (hasOverride && customer.currentTierId) {
      console.log(`[TierResolution] ✓ Manual override detected`);

      const tier = customer.currentTier;
      sources.push({
        source: 'MANUAL_OVERRIDE',
        priority: TIER_SOURCE_PRIORITY.MANUAL_OVERRIDE,
        tierId: customer.currentTierId,
        tierName: tier?.name || null,
        tierMinSpend: tier?.minSpend || 0,
        metadata: {
          changeLogId: 'latest'  // Could fetch actual changeLog ID if needed
        }
      });
    } else {
      console.log(`[TierResolution] ✗ No manual override`);
    }
  }

  // ============================================
  // SOURCE 2: Active Tier Subscription
  // ============================================

  // Get all active tier subscriptions (can't use relation orderBy with Aurora Data API)
  const activeTierSubscriptions = await db.tierSubscription.findMany({
    where: {
      customerId,
      shop,
      status: 'ACTIVE',
      // Optionally check currentPeriodEnd if you want strict expiry
    },
    include: { tier: true }
  });

  // Sort by tier minSpend in memory (highest first)
  const activeTierSubscription = activeTierSubscriptions.sort((a, b) =>
    b.tier.minSpend - a.tier.minSpend
  )[0];

  if (activeTierSubscription) {
    console.log(`[TierResolution] ✓ Active tier subscription found: ${activeTierSubscription.tier.name}`);

    sources.push({
      source: 'TIER_SUBSCRIPTION',
      priority: TIER_SOURCE_PRIORITY.TIER_SUBSCRIPTION,
      tierId: activeTierSubscription.tierId,
      tierName: activeTierSubscription.tier.name,
      tierMinSpend: activeTierSubscription.tier.minSpend,
      metadata: {
        subscriptionId: activeTierSubscription.id,
        endDate: activeTierSubscription.currentPeriodEnd.toISOString()
      }
    });
  } else {
    console.log(`[TierResolution] ✗ No active tier subscription`);
  }

  // ============================================
  // SOURCE 3: Active Tier Purchase (One-Time)
  // ============================================

  const now = new Date();

  // Get all active tier purchases (can't use relation orderBy with Aurora Data API)
  const activeTierPurchases = await db.tierPurchase.findMany({
    where: {
      customerId,
      shop,
      status: 'ACTIVE',
      OR: [
        { endDate: null },                  // Lifetime purchase
        { endDate: { gte: now } },          // Not yet expired
        ...(options?.includeExpired ? [{ endDate: { lt: now } }] : [])
      ]
    },
    include: { tier: true }
  });

  // Sort by tier minSpend in memory (highest first)
  const activeTierPurchase = activeTierPurchases.sort((a, b) =>
    b.tier.minSpend - a.tier.minSpend
  )[0];

  if (activeTierPurchase) {
    const isExpired = activeTierPurchase.endDate && activeTierPurchase.endDate < now;

    if (isExpired && !options?.includeExpired) {
      console.log(`[TierResolution] ✗ Tier purchase found but expired: ${activeTierPurchase.tier.name}`);
    } else {
      console.log(`[TierResolution] ✓ Active tier purchase found: ${activeTierPurchase.tier.name}`);

      sources.push({
        source: 'TIER_PURCHASE',
        priority: TIER_SOURCE_PRIORITY.TIER_PURCHASE,
        tierId: activeTierPurchase.tierId,
        tierName: activeTierPurchase.tier.name,
        tierMinSpend: activeTierPurchase.tier.minSpend,
        metadata: {
          purchaseId: activeTierPurchase.id,
          endDate: activeTierPurchase.endDate?.toISOString() || 'lifetime',
          isExpired
        }
      });
    }
  } else {
    console.log(`[TierResolution] ✗ No active tier purchase`);
  }

  // ============================================
  // SOURCE 4: Spending-Based Tier (Automatic)
  // ============================================

  if (!options?.skipSpendingCalc) {
    try {
      const spendingTierResult = await calculateCustomerTierFromDB(shop, customerId, {
        skipOverrideCheck: true  // We already checked override above
      });

      if (spendingTierResult.newTierId) {
        console.log(`[TierResolution] ✓ Spending-based tier: ${spendingTierResult.newTierName}`);

        // Get tier details for minSpend
        const tier = await db.tier.findUnique({
          where: { id: spendingTierResult.newTierId }
        });

        sources.push({
          source: 'SPENDING_BASED',
          priority: TIER_SOURCE_PRIORITY.SPENDING_BASED,
          tierId: spendingTierResult.newTierId,
          tierName: spendingTierResult.newTierName,
          tierMinSpend: tier?.minSpend || 0,
          metadata: {
            totalSpending: spendingTierResult.totalSpending
          }
        });
      } else {
        console.log(`[TierResolution] ✗ No spending-based tier qualifies`);
      }
    } catch (error) {
      console.error(`[TierResolution] Error calculating spending-based tier:`, error);
    }
  }

  // ============================================
  // RESOLVE CONFLICTS
  // ============================================

  if (sources.length === 0) {
    console.log(`[TierResolution] No tier sources found - customer has no tier`);
    return {
      effectiveTierId: null,
      effectiveTierName: null,
      effectiveSource: 'NONE',
      allSources: [],
      conflictResolved: false,
      resolutionReason: 'No qualifying tier sources'
    };
  }

  // Sort by priority (ascending), then by tier level (descending)
  sources.sort((a, b) => {
    // First sort by priority (lower number = higher priority)
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    // If same priority, prefer higher tier (higher minSpend)
    return b.tierMinSpend - a.tierMinSpend;
  });

  const winningSource = sources[0];
  const hasConflict = sources.length > 1;

  console.log(`[TierResolution] ========== Resolution Complete ==========`);
  console.log(`[TierResolution] Winning Source: ${winningSource.source}`);
  console.log(`[TierResolution] Effective Tier: ${winningSource.tierName} (ID: ${winningSource.tierId})`);
  console.log(`[TierResolution] Conflict Resolved: ${hasConflict ? 'YES' : 'NO'}`);

  if (hasConflict) {
    console.log(`[TierResolution] Other sources considered:`, sources.slice(1).map(s => ({
      source: s.source,
      tier: s.tierName,
      priority: s.priority
    })));
  }

  return {
    effectiveTierId: winningSource.tierId,
    effectiveTierName: winningSource.tierName,
    effectiveSource: winningSource.source,
    allSources: sources,
    conflictResolved: hasConflict,
    resolutionReason: hasConflict
      ? `${winningSource.source} takes priority over ${sources.slice(1).map(s => s.source).join(', ')}`
      : `Only source: ${winningSource.source}`
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Update customer's tier to the resolved effective tier
 *
 * Use this after any tier-modifying event (purchase, subscription, order, etc.)
 * to ensure customer has the correct tier based on all sources.
 */
export async function updateCustomerToEffectiveTier(
  shop: string,
  customerId: string,
  context?: {
    triggeredBy?: string;      // e.g., "order_paid", "subscription_created"
    orderId?: string;
    subscriptionId?: string;
    purchaseId?: string;
  }
): Promise<{
  success: boolean;
  previousTierId: string | null;
  newTierId: string | null;
  changed: boolean;
  source: TierSource;
  error?: string;
}> {
  try {
    console.log(`[TierResolution] Updating customer to effective tier`);
    console.log(`[TierResolution] Triggered by: ${context?.triggeredBy || 'unknown'}`);

    // Get current state
    const customer = await db.customer.findFirst({
      where: { id: customerId, shop },
      include: { currentTier: true }
    });

    if (!customer) {
      return {
        success: false,
        previousTierId: null,
        newTierId: null,
        changed: false,
        source: 'NONE',
        error: 'Customer not found'
      };
    }

    const previousTierId = customer.currentTierId;
    const previousTierName = customer.currentTier?.name || null;

    // Resolve effective tier
    const resolution = await resolveEffectiveTier(shop, customerId);

    const newTierId = resolution.effectiveTierId;
    const newTierName = resolution.effectiveTierName;

    // Check if tier changed
    const changed = previousTierId !== newTierId;

    if (!changed) {
      console.log(`[TierResolution] No tier change needed - customer already has effective tier`);
      return {
        success: true,
        previousTierId,
        newTierId,
        changed: false,
        source: resolution.effectiveSource
      };
    }

    // Update customer tier
    await db.customer.update({
      where: { id: customerId },
      data: {
        currentTierId: newTierId,
        updatedAt: new Date()
      }
    });

    console.log(`[TierResolution] Customer tier updated: ${previousTierName || 'none'} → ${newTierName || 'none'}`);

    // Log tier change
    const changeType = !previousTierId && newTierId ? 'INITIAL_ASSIGNMENT'
      : previousTierId && !newTierId ? 'REVOKED'
      : newTierId && previousTierId ? (
        (resolution.allSources.find(s => s.tierId === newTierId)?.tierMinSpend || 0) >
        (resolution.allSources.find(s => s.tierId === previousTierId)?.tierMinSpend || 0)
          ? 'UPGRADE'
          : 'DOWNGRADE'
      )
      : 'REASSIGNMENT';

    await db.tierChangeLog.create({
      data: {
        id: crypto.randomUUID(),
        customerId,
        shop,
        fromTierId: previousTierId,
        fromTierName: previousTierName,
        toTierId: newTierId,
        toTierName: newTierName,
        changeType: changeType as any,
        triggerType: mapContextToTriggerType(context?.triggeredBy),
        orderId: context?.orderId,
        subscriptionId: context?.subscriptionId,
        metadata: {
          resolutionSource: resolution.effectiveSource,
          allSources: resolution.allSources.map(s => ({
            source: s.source,
            tierId: s.tierId,
            tierName: s.tierName,
            priority: s.priority
          })),
          conflictResolved: resolution.conflictResolved,
          resolutionReason: resolution.resolutionReason
        },
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    return {
      success: true,
      previousTierId,
      newTierId,
      changed: true,
      source: resolution.effectiveSource
    };

  } catch (error) {
    console.error(`[TierResolution] Error updating customer to effective tier:`, error);
    return {
      success: false,
      previousTierId: null,
      newTierId: null,
      changed: false,
      source: 'NONE',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Map context trigger to TierTriggerType enum
 */
function mapContextToTriggerType(trigger?: string): string {
  const mapping: Record<string, string> = {
    'order_paid': 'ORDER_PROCESSED',
    'subscription_created': 'SUBSCRIPTION_STARTED',
    'subscription_updated': 'SUBSCRIPTION_UPDATED',
    'subscription_cancelled': 'SUBSCRIPTION_CANCELLED',
    'purchase_created': 'PRODUCT_PURCHASE',
    'purchase_expired': 'PURCHASE_EXPIRED',
    'manual_assignment': 'MANUAL_ADMIN',
    'tier_recalculation': 'TIER_RECALCULATION'
  };

  return mapping[trigger || ''] || 'TIER_RECALCULATION';
}

/**
 * Get detailed tier source breakdown for a customer (for debugging/UI)
 */
export async function getTierSourceBreakdown(
  shop: string,
  customerId: string
): Promise<{
  currentTier: {
    id: string | null;
    name: string | null;
    source: TierSource;
  };
  sources: TierSourceInfo[];
  hasConflict: boolean;
}> {
  const resolution = await resolveEffectiveTier(shop, customerId);

  return {
    currentTier: {
      id: resolution.effectiveTierId,
      name: resolution.effectiveTierName,
      source: resolution.effectiveSource
    },
    sources: resolution.allSources,
    hasConflict: resolution.conflictResolved
  };
}
