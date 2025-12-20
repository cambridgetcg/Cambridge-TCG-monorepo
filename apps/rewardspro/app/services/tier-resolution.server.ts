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
 *
 * IMPORTANT: This service uses database transactions to prevent race conditions
 * when updating customer tiers. All tier-modifying operations go through
 * updateCustomerToEffectiveTier() which ensures atomic reads and writes.
 */

import db from "~/db.server";
import type { Prisma, PrismaClient, TierSource as TierSourceEnum } from "@prisma/client";
import { getManualOverride } from "./manual-tier-assignment.server";
import { calculateCustomerTierFromDB } from "./tier-calculation.server";
import { getBaseTier, getBaseTierConfig } from "./base-tier.server";
import { calculateProgress } from "./customer-tier-state-update.server";

// Transaction client type for Prisma
type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

// ============================================
// TYPE DEFINITIONS
// ============================================

export type TierSource =
  | 'MANUAL_OVERRIDE'
  | 'TIER_SUBSCRIPTION'
  | 'TIER_PURCHASE'
  | 'SPENDING_BASED'
  | 'DEFAULT_BASE_TIER'
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
 * 5. DEFAULT_BASE_TIER - Shop's configured default for new customers (lowest priority)
 */
const TIER_SOURCE_PRIORITY: Record<TierSource, number> = {
  MANUAL_OVERRIDE: 1,
  TIER_SUBSCRIPTION: 2,
  TIER_PURCHASE: 3,
  SPENDING_BASED: 4,
  DEFAULT_BASE_TIER: 5,
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
 *
 * @param shop - Shop domain
 * @param customerId - Customer ID to resolve tier for
 * @param options - Resolution options
 * @param options.skipManualCheck - Skip manual override check (for performance)
 * @param options.skipSpendingCalc - Skip spending calculation (if not needed)
 * @param options.includeExpired - Include expired purchases in analysis
 * @param options.tx - Optional transaction client for atomic operations
 */
export async function resolveEffectiveTier(
  shop: string,
  customerId: string,
  options?: {
    skipManualCheck?: boolean;
    skipSpendingCalc?: boolean;
    includeExpired?: boolean;
    tx?: TransactionClient;  // Transaction context for atomic operations
  }
): Promise<TierResolutionResult> {
  const sources: TierSourceInfo[] = [];
  // Use transaction client if provided, otherwise use default db client
  const prisma = options?.tx || db;

  console.log(`[TierResolution] ========== Resolving Effective Tier ==========`);
  console.log(`[TierResolution] Customer ID: ${customerId}`);
  console.log(`[TierResolution] Shop: ${shop}`);
  console.log(`[TierResolution] Using transaction: ${options?.tx ? 'YES' : 'NO'}`);

  // Get customer data
  const customer = await prisma.customer.findFirst({
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
    // FIX: Pass transaction client to getManualOverride for proper isolation
    // FIX: Use the stored override tier ID, not customer.currentTierId
    const overrideInfo = await getManualOverride(customerId, prisma);

    if (overrideInfo.hasOverride && overrideInfo.tierId) {
      console.log(`[TierResolution] ✓ Manual override detected: tier=${overrideInfo.tierName} (${overrideInfo.tierId})`);

      // Get tier details if not already included
      let tierMinSpend = 0;
      if (overrideInfo.tierId) {
        const tier = await prisma.tier.findFirst({
          where: { id: overrideInfo.tierId, shop }
        });
        tierMinSpend = tier?.minSpend || 0;
      }

      sources.push({
        source: 'MANUAL_OVERRIDE',
        priority: TIER_SOURCE_PRIORITY.MANUAL_OVERRIDE,
        tierId: overrideInfo.tierId,  // Use the stored override tier ID
        tierName: overrideInfo.tierName,
        tierMinSpend,
        metadata: {
          setAt: overrideInfo.setAt?.toISOString(),
          setBy: overrideInfo.setBy,
          expiresAt: overrideInfo.expiresAt?.toISOString(),
          note: overrideInfo.note,
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
  const activeTierSubscriptions = await prisma.tierSubscription.findMany({
    where: {
      customerId,
      shop,
      status: 'ACTIVE',
      // Optionally check currentPeriodEnd if you want strict expiry
    },
    include: { tier: true }
  });

  // Filter out subscriptions with missing tier records (tier may be null or undefined)
  const validSubscriptions = activeTierSubscriptions.filter((s) => s.tier != null);

  if (validSubscriptions.length !== activeTierSubscriptions.length) {
    const invalidCount = activeTierSubscriptions.length - validSubscriptions.length;
    console.warn(`[TierResolution] ⚠️ Found ${invalidCount} tier subscription(s) with missing tier records - skipping`);
  }

  // Sort by tier minSpend in memory (highest first)
  const activeTierSubscription = validSubscriptions.sort((a, b) =>
    (b.tier?.minSpend ?? 0) - (a.tier?.minSpend ?? 0)
  )[0];

  if (activeTierSubscription && activeTierSubscription.tier) {
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
  } else if (activeTierSubscription && !activeTierSubscription.tier) {
    console.warn(`[TierResolution] ⚠️ Active tier subscription ${activeTierSubscription.id} has missing tier - skipping`);
  } else {
    console.log(`[TierResolution] ✗ No active tier subscription`);
  }

  // ============================================
  // SOURCE 3: Active Tier Purchase (One-Time)
  // ============================================

  const now = new Date();

  // Get all active tier purchases (can't use relation orderBy with Aurora Data API)
  // FIX: Removed unnecessary OR clause - status: 'ACTIVE' already filters correctly
  // Lifetime purchases (endDate=null) with status=ACTIVE are included
  // Lifetime purchases with status=EXPIRED are correctly excluded by the status filter
  const activeTierPurchases = await prisma.tierPurchase.findMany({
    where: {
      customerId,
      shop,
      status: 'ACTIVE',
      // For time-limited purchases, also check endDate hasn't passed
      // Lifetime purchases (endDate=null) are always valid when ACTIVE
      ...(options?.includeExpired ? {} : {
        OR: [
          { endDate: null },           // Lifetime purchase - always valid when ACTIVE
          { endDate: { gte: now } },   // Time-limited purchase not yet expired
        ]
      })
    },
    include: { tier: true }
  });

  // CRITICAL: Filter out tier purchases with missing tier records
  // This prevents crashes when tier products reference non-existent tiers
  // Use != null to catch both null and undefined (Prisma may return either)
  const validPurchases = activeTierPurchases.filter((p) => p.tier != null);

  if (validPurchases.length !== activeTierPurchases.length) {
    const invalidCount = activeTierPurchases.length - validPurchases.length;
    const invalidPurchases = activeTierPurchases.filter((p) => p.tier == null);

    console.warn(`[TierResolution] ⚠️ Found ${invalidCount} tier purchase(s) with missing tier records!`);
    console.warn(`[TierResolution] Invalid purchase IDs: ${invalidPurchases.map(p => p.id).join(', ')}`);
    console.warn(`[TierResolution] Invalid tier IDs: ${invalidPurchases.map(p => p.tierId).join(', ')}`);
    console.warn(`[TierResolution] These purchases reference non-existent tiers and will be skipped.`);
    console.warn(`[TierResolution] Action required: Run cleanup script to fix orphaned tier products.`);
  }

  // Sort by tier minSpend in memory (highest first) with null-safe access
  const activeTierPurchase = validPurchases.sort((a, b) =>
    (b.tier?.minSpend ?? 0) - (a.tier?.minSpend ?? 0)
  )[0];

  if (activeTierPurchase && activeTierPurchase.tier) {
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
  } else if (activeTierPurchase && !activeTierPurchase.tier) {
    console.warn(`[TierResolution] ⚠️ Active tier purchase ${activeTierPurchase.id} has missing tier - skipping`);
  } else {
    console.log(`[TierResolution] ✗ No active tier purchase`);
  }

  // ============================================
  // SOURCE 4: Spending-Based Tier (Automatic)
  // ============================================

  if (!options?.skipSpendingCalc) {
    try {
      const spendingTierResult = await calculateCustomerTierFromDB(shop, customerId, {
        skipOverrideCheck: true,  // We already checked override above
        skipUpdate: true          // CRITICAL: Don't update DB - just get the calculated tier
      });

      if (spendingTierResult.newTierId) {
        console.log(`[TierResolution] ✓ Spending-based tier: ${spendingTierResult.newTierName}`);

        // Get tier details for minSpend (with shop validation for cross-shop isolation)
        const tier = await prisma.tier.findFirst({
          where: {
            id: spendingTierResult.newTierId,
            shop  // FIX: Add shop filter to prevent cross-shop data leakage
          }
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
  // SOURCE 5: Default Base Tier (Lowest Priority Fallback)
  // ============================================

  // Only check for base tier if no other sources qualified
  if (sources.length === 0) {
    try {
      const baseTierConfig = await getBaseTierConfig(shop);

      if (baseTierConfig.enabled) {
        const baseTier = await getBaseTier(shop);

        if (baseTier) {
          console.log(`[TierResolution] ✓ Default base tier available: ${baseTier.name}`);

          sources.push({
            source: 'DEFAULT_BASE_TIER',
            priority: TIER_SOURCE_PRIORITY.DEFAULT_BASE_TIER,
            tierId: baseTier.id,
            tierName: baseTier.name,
            tierMinSpend: baseTier.minSpend,
            metadata: {
              isDefault: true,
              autoDetected: baseTierConfig.autoDetect
            }
          });
        } else {
          console.log(`[TierResolution] ✗ Base tier enabled but no tier available`);
        }
      } else {
        console.log(`[TierResolution] ✗ Base tier assignment disabled for shop`);
      }
    } catch (error) {
      console.error(`[TierResolution] Error checking base tier:`, error);
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
 *
 * IMPORTANT: This function uses a database transaction to prevent race conditions.
 * All reads and writes are atomic, ensuring consistent tier state even under
 * concurrent updates from webhooks, cron jobs, or API calls.
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
  console.log(`[TierResolution] Updating customer to effective tier`);
  console.log(`[TierResolution] Triggered by: ${context?.triggeredBy || 'unknown'}`);

  try {
    // Wrap ALL reads and writes in a transaction to prevent race conditions
    // Using ReadCommitted isolation to prevent dirty reads while allowing concurrent access
    const result = await db.$transaction(async (tx) => {
      // Get current state within transaction
      const customer = await tx.customer.findFirst({
        where: { id: customerId, shop },
        include: { currentTier: true }
      });

      if (!customer) {
        return {
          success: false,
          previousTierId: null,
          newTierId: null,
          changed: false,
          source: 'NONE' as TierSource,
          error: 'Customer not found'
        };
      }

      const previousTierId = customer.currentTierId;
      const previousTierName = customer.currentTier?.name || null;

      // Resolve effective tier within the same transaction
      // This ensures we read consistent state for subscriptions, purchases, etc.
      const resolution = await resolveEffectiveTier(shop, customerId, { tx });

      const newTierId = resolution.effectiveTierId;
      const newTierName = resolution.effectiveTierName;

      // Check if tier changed
      const changed = previousTierId !== newTierId;

      if (!changed) {
        console.log(`[TierResolution] No tier change needed - customer already has effective tier`);

        // Still update CustomerTierState with progress (may have changed)
        const allTiers = await tx.tier.findMany({
          where: { shop },
          select: { id: true, name: true, minSpend: true },
          orderBy: { minSpend: 'asc' }
        });

        const progress = calculateProgress(
          Number(customer.netSpent || 0),
          newTierId,
          allTiers
        );

        const tierSourceMap: Record<string, TierSourceEnum> = {
          'MANUAL_OVERRIDE': 'MANUAL_OVERRIDE',
          'TIER_SUBSCRIPTION': 'TIER_SUBSCRIPTION',
          'TIER_PURCHASE': 'TIER_PURCHASE',
          'SPENDING_BASED': 'SPENDING_BASED',
          'DEFAULT_BASE_TIER': 'DEFAULT_BASE_TIER',
          'NONE': 'NONE',
        };
        const tierSource = tierSourceMap[resolution.effectiveSource] || 'NONE';

        await tx.customerTierState.upsert({
          where: { customerId },
          create: {
            id: crypto.randomUUID(),
            customerId,
            shop,
            effectiveTierId: newTierId,
            tierSource,
            progressPercent: progress.progressPercent,
            nextTierId: progress.nextTierId,
            nextTierName: progress.nextTierName,
            nextTierMinSpend: progress.nextTierMinSpend,
            amountToNextTier: progress.amountToNextTier,
            isMaxTier: progress.isMaxTier,
            progressCalculatedAt: new Date(),
            lastResolvedAt: new Date(),
            resolutionReason: resolution.resolutionReason,
          },
          update: {
            effectiveTierId: newTierId,
            tierSource,
            progressPercent: progress.progressPercent,
            nextTierId: progress.nextTierId,
            nextTierName: progress.nextTierName,
            nextTierMinSpend: progress.nextTierMinSpend,
            amountToNextTier: progress.amountToNextTier,
            isMaxTier: progress.isMaxTier,
            progressCalculatedAt: new Date(),
            lastResolvedAt: new Date(),
            resolutionReason: resolution.resolutionReason,
            updatedAt: new Date(),
          }
        });

        console.log(`[TierResolution] CustomerTierState progress updated: ${progress.progressPercent}%`);

        return {
          success: true,
          previousTierId,
          newTierId,
          changed: false,
          source: resolution.effectiveSource
        };
      }

      // Update customer tier within transaction
      await tx.customer.update({
        where: { id: customerId },
        data: {
          currentTierId: newTierId,
          updatedAt: new Date()
        }
      });

      console.log(`[TierResolution] Customer tier updated: ${previousTierName || 'none'} → ${newTierName || 'none'}`);

      // Log tier change within the same transaction
      const changeType = !previousTierId && newTierId ? 'INITIAL_ASSIGNMENT'
        : previousTierId && !newTierId ? 'REVOKED'
        : newTierId && previousTierId ? (
          (resolution.allSources.find(s => s.tierId === newTierId)?.tierMinSpend || 0) >
          (resolution.allSources.find(s => s.tierId === previousTierId)?.tierMinSpend || 0)
            ? 'UPGRADE'
            : 'DOWNGRADE'
        )
        : 'REASSIGNMENT';

      await tx.tierChangeLog.create({
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

      // ═══════════════════════════════════════════════════════════════════════
      // Update CustomerTierState with pre-computed progress for widget
      // This ensures the widget can display data with a single query
      // ═══════════════════════════════════════════════════════════════════════
      const allTiers = await tx.tier.findMany({
        where: { shop },
        select: { id: true, name: true, minSpend: true },
        orderBy: { minSpend: 'asc' }
      });

      const progress = calculateProgress(
        Number(customer.netSpent || 0),
        newTierId,
        allTiers
      );

      // Map TierSource string to enum value
      const tierSourceMap: Record<string, TierSourceEnum> = {
        'MANUAL_OVERRIDE': 'MANUAL_OVERRIDE',
        'TIER_SUBSCRIPTION': 'TIER_SUBSCRIPTION',
        'TIER_PURCHASE': 'TIER_PURCHASE',
        'SPENDING_BASED': 'SPENDING_BASED',
        'DEFAULT_BASE_TIER': 'DEFAULT_BASE_TIER',
        'NONE': 'NONE',
      };
      const tierSource = tierSourceMap[resolution.effectiveSource] || 'NONE';

      await tx.customerTierState.upsert({
        where: { customerId },
        create: {
          id: crypto.randomUUID(),
          customerId,
          shop,
          effectiveTierId: newTierId,
          tierSource,
          progressPercent: progress.progressPercent,
          nextTierId: progress.nextTierId,
          nextTierName: progress.nextTierName,
          nextTierMinSpend: progress.nextTierMinSpend,
          amountToNextTier: progress.amountToNextTier,
          isMaxTier: progress.isMaxTier,
          progressCalculatedAt: new Date(),
          lastResolvedAt: new Date(),
          resolutionReason: resolution.resolutionReason,
        },
        update: {
          effectiveTierId: newTierId,
          tierSource,
          progressPercent: progress.progressPercent,
          nextTierId: progress.nextTierId,
          nextTierName: progress.nextTierName,
          nextTierMinSpend: progress.nextTierMinSpend,
          amountToNextTier: progress.amountToNextTier,
          isMaxTier: progress.isMaxTier,
          progressCalculatedAt: new Date(),
          lastResolvedAt: new Date(),
          resolutionReason: resolution.resolutionReason,
          updatedAt: new Date(),
        }
      });

      console.log(`[TierResolution] CustomerTierState updated with progress: ${progress.progressPercent}% to ${progress.nextTierName || 'MAX'}`);

      return {
        success: true,
        previousTierId,
        newTierId,
        changed: true,
        source: resolution.effectiveSource
      };
    }, {
      // Transaction options for race condition prevention
      isolationLevel: 'ReadCommitted',  // Prevents dirty reads
      timeout: 10000,                   // 10 second timeout
    });

    return result;

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
