/**
 * Tier State Service - Single Source of Truth
 *
 * This service manages the CustomerTierState table, which is the authoritative
 * source for a customer's current tier. It consolidates:
 * - Manual override tracking (explicit fields, no TierChangeLog scanning)
 * - Subscription tier tracking
 * - One-time purchase tier tracking
 * - Spending-based tier calculation (cached)
 *
 * Priority order (lower number = higher priority):
 * 1. MANUAL_OVERRIDE - Admin explicitly set this tier
 * 2. TIER_SUBSCRIPTION - Customer has active recurring subscription
 * 3. TIER_PURCHASE - Customer has active one-time purchase
 * 4. SPENDING_BASED - Automatic calculation based on spending
 */

import prisma from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import type { CustomerTierState, TierSource, Tier } from "@prisma/client";

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface TierStateResult {
  customerId: string;
  effectiveTierId: string | null;
  effectiveTierName: string | null;
  tierSource: TierSource;
  tierSourceId: string | null;
  hasManualOverride: boolean;
  expiresAt: Date | null;
}

export interface TierStateUpdateResult {
  success: boolean;
  customerId: string;
  previousTierId: string | null;
  previousSource: TierSource;
  newTierId: string | null;
  newSource: TierSource;
  changed: boolean;
  reason: string;
  error?: string;
}

export interface ManualOverrideResult {
  success: boolean;
  customerId: string;
  tierId: string | null;
  tierName: string | null;
  isPermanent: boolean;
  expiresAt: Date | null;
  message?: string;
  error?: string;
}

interface TierSourceInfo {
  source: TierSource;
  priority: number;
  tierId: string | null;
  tierName: string | null;
  tierMinSpend: number;
  sourceId: string | null;
  expiresAt: Date | null;
}

// ============================================
// PRIORITY CONFIGURATION
// ============================================

const TIER_SOURCE_PRIORITY: Record<TierSource, number> = {
  MANUAL_OVERRIDE: 1,
  TIER_SUBSCRIPTION: 2,
  TIER_PURCHASE: 3,
  SPENDING_BASED: 4,
  DEFAULT_BASE_TIER: 5,
  NONE: 999,
};

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Get customer's current tier state (fast lookup from CustomerTierState)
 * This is the primary way to check a customer's tier.
 */
export async function getCustomerTierState(
  shop: string,
  customerId: string
): Promise<TierStateResult | null> {
  const tierState = await prisma.customerTierState.findUnique({
    where: { customerId },
    include: {
      effectiveTier: true,
    },
  });

  if (!tierState) {
    return null;
  }

  // Check if manual override has expired
  if (tierState.hasManualOverride && tierState.manualOverrideExpiry) {
    if (tierState.manualOverrideExpiry < new Date()) {
      // Override has expired, need to recalculate
      // Return null to trigger recalculation
      return null;
    }
  }

  return {
    customerId: tierState.customerId,
    effectiveTierId: tierState.effectiveTierId,
    effectiveTierName: tierState.effectiveTier?.name || null,
    tierSource: tierState.tierSource,
    tierSourceId: tierState.tierSourceId,
    hasManualOverride: tierState.hasManualOverride,
    expiresAt: getExpirationDate(tierState),
  };
}

/**
 * Resolve and update the effective tier for a customer
 * Called after any tier-affecting event (purchase, subscription, order, etc.)
 */
export async function resolveAndUpdateTierState(
  shop: string,
  customerId: string,
  context: {
    triggeredBy: 'ORDER_PAID' | 'TIER_PURCHASE' | 'SUBSCRIPTION_CREATED' |
                 'SUBSCRIPTION_CANCELLED' | 'SUBSCRIPTION_BILLING' |
                 'MANUAL_OVERRIDE' | 'CRON_JOB' | 'INITIAL';
    sourceId?: string;
    adminUserId?: string;
    skipSpendingCalc?: boolean;
  }
): Promise<TierStateUpdateResult> {
  try {
    console.log(`[TierState] Resolving tier for customer ${customerId}, triggered by ${context.triggeredBy}`);

    // Get or create CustomerTierState
    let tierState = await prisma.customerTierState.findUnique({
      where: { customerId },
      include: { effectiveTier: true },
    });

    const previousTierId = tierState?.effectiveTierId || null;
    const previousSource = tierState?.tierSource || 'NONE';

    // Collect all tier sources
    const sources = await collectTierSources(shop, customerId, tierState, context);

    // Sort by priority, then by tier minSpend (higher minSpend = better tier)
    sources.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.tierMinSpend - a.tierMinSpend;
    });

    // Get winning source
    const winner = sources[0] || {
      source: 'NONE' as TierSource,
      priority: 999,
      tierId: null,
      tierName: null,
      tierMinSpend: 0,
      sourceId: null,
      expiresAt: null,
    };

    console.log(`[TierState] Winner: ${winner.source} -> ${winner.tierName || 'None'}`);

    // Update or create CustomerTierState
    const now = new Date();
    const updateData = {
      shop,
      effectiveTierId: winner.tierId,
      tierSource: winner.source,
      tierSourceId: winner.sourceId,
      lastResolvedAt: now,
      resolutionReason: `Resolved by ${context.triggeredBy}: ${winner.source}`,
      updatedAt: now,
    };

    if (tierState) {
      tierState = await prisma.customerTierState.update({
        where: { customerId },
        data: updateData,
        include: { effectiveTier: true },
      });
    } else {
      tierState = await prisma.customerTierState.create({
        data: {
          id: uuidv4(),
          customerId,
          ...updateData,
          createdAt: now,
        },
        include: { effectiveTier: true },
      });
    }

    // Also update Customer.currentTierId for backward compatibility
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        currentTierId: winner.tierId,
        updatedAt: now,
      },
    });

    const changed = previousTierId !== winner.tierId || previousSource !== winner.source;

    // Log tier change if it actually changed
    if (changed) {
      await logTierChange(shop, customerId, previousTierId, winner.tierId, winner.source, context);
    }

    return {
      success: true,
      customerId,
      previousTierId,
      previousSource,
      newTierId: winner.tierId,
      newSource: winner.source,
      changed,
      reason: `${winner.source}: ${winner.tierName || 'No tier'}`,
    };
  } catch (error) {
    console.error(`[TierState] Error resolving tier for ${customerId}:`, error);
    return {
      success: false,
      customerId,
      previousTierId: null,
      previousSource: 'NONE',
      newTierId: null,
      newSource: 'NONE',
      changed: false,
      reason: 'Error during resolution',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Set a manual override for a customer's tier
 * This is the highest priority source and will take precedence over all others.
 */
export async function setManualOverride(
  shop: string,
  customerId: string,
  tierId: string | null,
  adminUserId: string,
  options?: {
    permanent?: boolean;
    expiresAt?: Date;
    note?: string;
  }
): Promise<ManualOverrideResult> {
  try {
    console.log(`[TierState] Setting manual override for customer ${customerId} to tier ${tierId}`);

    // Get or verify tier
    let tier: Tier | null = null;
    if (tierId) {
      tier = await prisma.tier.findUnique({ where: { id: tierId } });
      if (!tier) {
        return {
          success: false,
          customerId,
          tierId: null,
          tierName: null,
          isPermanent: false,
          expiresAt: null,
          error: 'Tier not found',
        };
      }
    }

    const now = new Date();
    const isPermanent = options?.permanent ?? !options?.expiresAt;
    const expiresAt = isPermanent ? null : options?.expiresAt || null;

    // Get or create CustomerTierState
    let tierState = await prisma.customerTierState.findUnique({
      where: { customerId },
    });

    const updateData = {
      shop,
      effectiveTierId: tierId,
      tierSource: 'MANUAL_OVERRIDE' as TierSource,
      tierSourceId: null,
      hasManualOverride: true,
      manualOverrideAt: now,
      manualOverrideBy: adminUserId,
      manualOverrideExpiry: expiresAt,
      manualOverrideNote: options?.note || null,
      lastResolvedAt: now,
      resolutionReason: `Manual override by admin ${adminUserId}`,
      updatedAt: now,
    };

    if (tierState) {
      await prisma.customerTierState.update({
        where: { customerId },
        data: updateData,
      });
    } else {
      await prisma.customerTierState.create({
        data: {
          id: uuidv4(),
          customerId,
          ...updateData,
          createdAt: now,
        },
      });
    }

    // Also update Customer.currentTierId for backward compatibility
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        currentTierId: tierId,
        updatedAt: now,
      },
    });

    // Log the change
    await logTierChange(shop, customerId, tierState?.effectiveTierId || null, tierId, 'MANUAL_OVERRIDE', {
      triggeredBy: 'MANUAL_OVERRIDE',
      adminUserId,
    });

    return {
      success: true,
      customerId,
      tierId,
      tierName: tier?.name || null,
      isPermanent,
      expiresAt,
      message: `Manual override set to ${tier?.name || 'no tier'}${isPermanent ? ' (permanent)' : ` until ${expiresAt?.toISOString()}`}`,
    };
  } catch (error) {
    console.error(`[TierState] Error setting manual override:`, error);
    return {
      success: false,
      customerId,
      tierId: null,
      tierName: null,
      isPermanent: false,
      expiresAt: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Remove manual override and recalculate tier based on other sources
 */
export async function removeManualOverride(
  shop: string,
  customerId: string,
  adminUserId: string
): Promise<ManualOverrideResult> {
  try {
    console.log(`[TierState] Removing manual override for customer ${customerId}`);

    const tierState = await prisma.customerTierState.findUnique({
      where: { customerId },
    });

    if (!tierState || !tierState.hasManualOverride) {
      return {
        success: false,
        customerId,
        tierId: null,
        tierName: null,
        isPermanent: false,
        expiresAt: null,
        error: 'No manual override found',
      };
    }

    // Clear manual override flags
    await prisma.customerTierState.update({
      where: { customerId },
      data: {
        hasManualOverride: false,
        manualOverrideAt: null,
        manualOverrideBy: null,
        manualOverrideExpiry: null,
        manualOverrideNote: null,
        updatedAt: new Date(),
      },
    });

    // Recalculate tier based on remaining sources
    const result = await resolveAndUpdateTierState(shop, customerId, {
      triggeredBy: 'MANUAL_OVERRIDE',
      adminUserId,
    });

    return {
      success: true,
      customerId,
      tierId: result.newTierId,
      tierName: null, // Would need to fetch tier name
      isPermanent: false,
      expiresAt: null,
      message: `Manual override removed. New tier source: ${result.newSource}`,
    };
  } catch (error) {
    console.error(`[TierState] Error removing manual override:`, error);
    return {
      success: false,
      customerId,
      tierId: null,
      tierName: null,
      isPermanent: false,
      expiresAt: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if customer has an active manual override
 * This is a fast O(1) check using the explicit boolean field.
 */
export async function hasActiveManualOverride(customerId: string): Promise<boolean> {
  const tierState = await prisma.customerTierState.findUnique({
    where: { customerId },
    select: {
      hasManualOverride: true,
      manualOverrideExpiry: true,
    },
  });

  if (!tierState || !tierState.hasManualOverride) {
    return false;
  }

  // Check if temporary override has expired
  if (tierState.manualOverrideExpiry && tierState.manualOverrideExpiry < new Date()) {
    return false;
  }

  return true;
}

/**
 * Ensure a CustomerTierState record exists for a customer
 * Called when a new customer is created or when migrating data.
 */
export async function ensureTierStateExists(
  shop: string,
  customerId: string
): Promise<CustomerTierState> {
  let tierState = await prisma.customerTierState.findUnique({
    where: { customerId },
  });

  if (!tierState) {
    tierState = await prisma.customerTierState.create({
      data: {
        id: uuidv4(),
        shop,
        customerId,
        tierSource: 'NONE',
        lastResolvedAt: new Date(),
        resolutionReason: 'Initial creation',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  return tierState;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Collect all tier sources for a customer
 */
async function collectTierSources(
  shop: string,
  customerId: string,
  tierState: CustomerTierState | null,
  context: { skipSpendingCalc?: boolean }
): Promise<TierSourceInfo[]> {
  const sources: TierSourceInfo[] = [];
  const now = new Date();

  // 1. Check manual override (from CustomerTierState, not TierChangeLog)
  if (tierState?.hasManualOverride) {
    const isExpired = tierState.manualOverrideExpiry && tierState.manualOverrideExpiry < now;

    if (!isExpired && tierState.effectiveTierId) {
      const tier = await prisma.tier.findUnique({ where: { id: tierState.effectiveTierId } });
      if (tier) {
        sources.push({
          source: 'MANUAL_OVERRIDE',
          priority: TIER_SOURCE_PRIORITY.MANUAL_OVERRIDE,
          tierId: tier.id,
          tierName: tier.name,
          tierMinSpend: tier.minSpend,
          sourceId: null,
          expiresAt: tierState.manualOverrideExpiry,
        });
      }
    }
  }

  // 2. Check active subscriptions
  const activeSubscription = await prisma.tierSubscription.findFirst({
    where: {
      customerId,
      status: 'ACTIVE',
    },
    include: { tier: true },
    orderBy: { tier: { minSpend: 'desc' } as any }, // Get highest tier subscription
  });

  if (activeSubscription?.tier) {
    sources.push({
      source: 'TIER_SUBSCRIPTION',
      priority: TIER_SOURCE_PRIORITY.TIER_SUBSCRIPTION,
      tierId: activeSubscription.tier.id,
      tierName: activeSubscription.tier.name,
      tierMinSpend: activeSubscription.tier.minSpend,
      sourceId: activeSubscription.id,
      expiresAt: activeSubscription.nextBillingDate,
    });
  }

  // 3. Check active purchases
  const activePurchase = await prisma.tierPurchase.findFirst({
    where: {
      customerId,
      status: 'ACTIVE',
      OR: [
        { endDate: null }, // Lifetime purchase
        { endDate: { gte: now } }, // Not expired
      ],
    },
    include: { tier: true },
    orderBy: { tier: { minSpend: 'desc' } as any }, // Get highest tier purchase
  });

  if (activePurchase?.tier) {
    sources.push({
      source: 'TIER_PURCHASE',
      priority: TIER_SOURCE_PRIORITY.TIER_PURCHASE,
      tierId: activePurchase.tier.id,
      tierName: activePurchase.tier.name,
      tierMinSpend: activePurchase.tier.minSpend,
      sourceId: activePurchase.id,
      expiresAt: activePurchase.endDate,
    });
  }

  // 4. Calculate spending-based tier (unless skipped)
  if (!context.skipSpendingCalc) {
    const spendingTier = await calculateSpendingBasedTier(shop, customerId);
    if (spendingTier) {
      sources.push({
        source: 'SPENDING_BASED',
        priority: TIER_SOURCE_PRIORITY.SPENDING_BASED,
        tierId: spendingTier.id,
        tierName: spendingTier.name,
        tierMinSpend: spendingTier.minSpend,
        sourceId: null,
        expiresAt: null, // Spending-based never expires
      });
    }
  }

  return sources;
}

/**
 * Calculate spending-based tier for a customer
 */
async function calculateSpendingBasedTier(
  shop: string,
  customerId: string
): Promise<Tier | null> {
  // Get customer's spending
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { netSpent: true },
  });

  if (!customer) return null;

  const netSpent = customer.netSpent?.toNumber() || 0;

  // Get all tiers for the shop, ordered by minSpend descending
  const tiers = await prisma.tier.findMany({
    where: { shop },
    orderBy: { minSpend: 'desc' },
  });

  // Find highest tier the customer qualifies for
  for (const tier of tiers) {
    if (netSpent >= tier.minSpend) {
      return tier;
    }
  }

  return null;
}

/**
 * Get expiration date from tier state
 */
function getExpirationDate(tierState: CustomerTierState): Date | null {
  if (tierState.tierSource === 'MANUAL_OVERRIDE') {
    return tierState.manualOverrideExpiry;
  }
  if (tierState.tierSource === 'TIER_PURCHASE') {
    return tierState.purchaseExpiresAt;
  }
  if (tierState.tierSource === 'TIER_SUBSCRIPTION') {
    return tierState.subscriptionExpiresAt;
  }
  return null;
}

/**
 * Log tier change to TierChangeLog (preserves audit trail)
 */
async function logTierChange(
  shop: string,
  customerId: string,
  fromTierId: string | null,
  toTierId: string | null,
  source: TierSource,
  context: {
    triggeredBy: string;
    adminUserId?: string;
    sourceId?: string;
  }
): Promise<void> {
  // Get tier names for historical reference
  const [fromTier, toTier] = await Promise.all([
    fromTierId ? prisma.tier.findUnique({ where: { id: fromTierId } }) : null,
    toTierId ? prisma.tier.findUnique({ where: { id: toTierId } }) : null,
  ]);

  // Determine change type
  let changeType: 'INITIAL_ASSIGNMENT' | 'UPGRADE' | 'DOWNGRADE' = 'INITIAL_ASSIGNMENT';
  if (fromTierId && toTierId) {
    const fromMinSpend = fromTier?.minSpend || 0;
    const toMinSpend = toTier?.minSpend || 0;
    changeType = toMinSpend > fromMinSpend ? 'UPGRADE' : 'DOWNGRADE';
  } else if (!fromTierId && toTierId) {
    changeType = 'INITIAL_ASSIGNMENT';
  } else if (fromTierId && !toTierId) {
    changeType = 'DOWNGRADE';
  }

  // Map source to trigger type
  const triggerTypeMap: Record<TierSource, string> = {
    MANUAL_OVERRIDE: 'MANUAL_ADMIN',
    TIER_SUBSCRIPTION: 'SUBSCRIPTION_STARTED',
    TIER_PURCHASE: 'PRODUCT_PURCHASE',
    SPENDING_BASED: 'SPENDING_MILESTONE',
    DEFAULT_BASE_TIER: 'DEFAULT_ASSIGNMENT',
    NONE: 'PERIODIC_REVIEW',
  };

  await prisma.tierChangeLog.create({
    data: {
      id: uuidv4(),
      customerId,
      shop,
      fromTierId,
      fromTierName: fromTier?.name || null,
      toTierId,
      toTierName: toTier?.name || null,
      changeType,
      triggerType: triggerTypeMap[source] || 'PERIODIC_REVIEW',
      processedBy: context.adminUserId || 'system',
      metadata: {
        source,
        triggeredBy: context.triggeredBy,
        resolvedAt: new Date().toISOString(),
      },
      createdAt: new Date(),
    },
  });
}

export default {
  getCustomerTierState,
  resolveAndUpdateTierState,
  setManualOverride,
  removeManualOverride,
  hasActiveManualOverride,
  ensureTierStateExists,
};
