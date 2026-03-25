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

import prisma from "~/db.server";
import type { Prisma, PrismaClient, TierSource as TierSourceEnum } from "@prisma/client";
import { getManualOverride } from "./manual-tier-assignment.server";
import { calculateCustomerTierFromDB } from "./tier-calculation.server";
import { getBaseTier, getBaseTierConfig } from "./base-tier.server";
import { calculateProgress } from "./customer-tier-state-update.server";
import { createLogger } from "~/services/logger.server";
import { SentryService } from "~/services/monitoring/sentry.service";

const logger = createLogger('TierResolution');

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
    setAt?: string;
    setBy?: string;
    expiresAt?: string;
    note?: string;
    totalSpending?: number;
    isDefault?: boolean;
    autoDetected?: boolean;
    [key: string]: unknown;
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
  const prisma = options?.tx || prisma;

  const resolutionLogger = logger.withContext({ shop, customerId });
  resolutionLogger.info('Resolving effective tier', { useTransaction: !!options?.tx });

  // Get customer data
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, shop },
    include: { currentTier: true }
  });

  if (!customer) {
    resolutionLogger.warn('Customer not found');
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
    // FIX: Clear expired overrides from database to prevent stale data
    const overrideInfo = await getManualOverride(customerId, prisma as any, { clearIfExpired: true });

    if (overrideInfo.hasOverride && overrideInfo.tierId) {
      resolutionLogger.debug('Manual override detected', { tierName: overrideInfo.tierName, tierId: overrideInfo.tierId });

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
          setBy: overrideInfo.setBy ?? undefined,
          expiresAt: overrideInfo.expiresAt?.toISOString(),
          note: overrideInfo.note ?? undefined,
        }
      });
    } else {
      resolutionLogger.debug('No manual override');
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
    resolutionLogger.warn('Found tier subscriptions with missing tier records', { invalidCount });
  }

  // Sort by tier minSpend in memory (highest first)
  const activeTierSubscription = validSubscriptions.sort((a, b) =>
    (b.tier?.minSpend ?? 0) - (a.tier?.minSpend ?? 0)
  )[0];

  if (activeTierSubscription && activeTierSubscription.tier) {
    resolutionLogger.debug('Active tier subscription found', { tierName: activeTierSubscription.tier.name });

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
    resolutionLogger.warn('Active tier subscription has missing tier', { subscriptionId: activeTierSubscription.id });
  } else {
    resolutionLogger.debug('No active tier subscription');
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

    resolutionLogger.warn('Found tier purchases with missing tier records - cleanup required', {
      invalidCount,
      invalidPurchaseIds: invalidPurchases.map(p => p.id),
      invalidTierIds: invalidPurchases.map(p => p.tierId)
    });
  }

  // Sort by tier minSpend in memory (highest first) with null-safe access
  const activeTierPurchase = validPurchases.sort((a, b) =>
    (b.tier?.minSpend ?? 0) - (a.tier?.minSpend ?? 0)
  )[0];

  if (activeTierPurchase && activeTierPurchase.tier) {
    const isExpired = activeTierPurchase.endDate && activeTierPurchase.endDate < now;

    if (isExpired && !options?.includeExpired) {
      resolutionLogger.debug('Tier purchase found but expired', { tierName: activeTierPurchase.tier.name });
    } else {
      resolutionLogger.debug('Active tier purchase found', { tierName: activeTierPurchase.tier.name });

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
    resolutionLogger.warn('Active tier purchase has missing tier', { purchaseId: activeTierPurchase.id });
  } else {
    resolutionLogger.debug('No active tier purchase');
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
        resolutionLogger.debug('Spending-based tier calculated', { tierName: spendingTierResult.newTierName });

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
        resolutionLogger.debug('No spending-based tier qualifies');
      }
    } catch (error) {
      resolutionLogger.error('Error calculating spending-based tier', error);
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
          resolutionLogger.debug('Default base tier available', { tierName: baseTier.name });

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
          resolutionLogger.debug('Base tier enabled but no tier available');
        }
      } else {
        resolutionLogger.debug('Base tier assignment disabled for shop');
      }
    } catch (error) {
      resolutionLogger.error('Error checking base tier', error);
    }
  }

  // ============================================
  // RESOLVE CONFLICTS
  // ============================================

  if (sources.length === 0) {
    resolutionLogger.info('No tier sources found - customer has no tier');
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

  resolutionLogger.info('Resolution complete', {
    winningSource: winningSource.source,
    effectiveTier: winningSource.tierName,
    effectiveTierId: winningSource.tierId,
    conflictResolved: hasConflict,
    ...(hasConflict && {
      otherSources: sources.slice(1).map(s => ({
        source: s.source,
        tier: s.tierName,
        priority: s.priority
      }))
    })
  });

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
  const updateLogger = logger.withContext({ shop, customerId, triggeredBy: context?.triggeredBy || 'unknown' });
  updateLogger.info('Updating customer to effective tier');

  // Start Sentry transaction for tier resolution
  const sentryTier = SentryService.startTierResolutionTransaction(
    shop,
    customerId,
    context?.triggeredBy
  );

  try {
    // Wrap ALL reads and writes in a transaction to prevent race conditions
    // Using ReadCommitted isolation to prevent dirty reads while allowing concurrent access
    const result = await prisma.$transaction(async (tx) => {
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
        updateLogger.debug('No tier change needed - customer already has effective tier');

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

        updateLogger.debug('CustomerTierState progress updated', { progressPercent: progress.progressPercent });

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

      updateLogger.info('Customer tier updated', { previousTier: previousTierName || 'none', newTier: newTierName || 'none' });

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
          createdAt: new Date()
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

      updateLogger.debug('CustomerTierState updated with progress', { progressPercent: progress.progressPercent, nextTier: progress.nextTierName || 'MAX' });

      return {
        success: true,
        previousTierId,
        newTierId,
        changed: true,
        source: resolution.effectiveSource
      };
    }) as { success: boolean; previousTierId: string | null; newTierId: string | null; changed: boolean; source: TierSource; error?: string };

    // Record successful tier resolution in Sentry
    sentryTier.recordResult({
      effectiveSource: result.source,
      effectiveTierId: result.newTierId,
      conflictResolved: false, // Would need to get from resolution
      changed: result.changed,
    });

    // Track tier change event if tier actually changed
    if (result.changed) {
      SentryService.events.tierChanged({
        shop,
        customerId,
        fromTier: result.previousTierId,
        toTier: result.newTierId,
        source: result.source,
        triggered_by: context?.triggeredBy || 'unknown',
      });
    }

    sentryTier.finish('ok');
    return result;

  } catch (error) {
    updateLogger.error('Error updating customer to effective tier', error);

    // Capture tier resolution error in Sentry with business impact
    SentryService.captureException(error, {
      shop: { domain: shop },
      customer: { id: customerId },
      operation: {
        type: 'sync',
        name: 'tier.resolution',
      },
      businessImpact: {
        affectedCustomers: 1,
      },
      tags: {
        'tier.trigger': context?.triggeredBy || 'unknown',
      },
      level: 'error',
    });
    sentryTier.finish('error');

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
 *
 * Valid enum values:
 * ACCOUNT_CREATED, PERIODIC_REVIEW, SPENDING_MILESTONE, MANUAL_ADMIN,
 * PRODUCT_PURCHASE, SUBSCRIPTION_STARTED, SUBSCRIPTION_RENEWED,
 * SUBSCRIPTION_UPGRADED, SUBSCRIPTION_DOWNGRADED, SUBSCRIPTION_CANCELLED,
 * SUBSCRIPTION_PURCHASE
 */
function mapContextToTriggerType(trigger?: string): string {
  const mapping: Record<string, string> = {
    'order_paid': 'SPENDING_MILESTONE',
    'customer_webhook': 'ACCOUNT_CREATED',
    'subscription_created': 'SUBSCRIPTION_STARTED',
    'subscription_updated': 'SUBSCRIPTION_RENEWED',
    'subscription_cancelled': 'SUBSCRIPTION_CANCELLED',
    'purchase_created': 'PRODUCT_PURCHASE',
    'purchase_expired': 'PRODUCT_PURCHASE',
    'manual_assignment': 'MANUAL_ADMIN',
    'tier_recalculation': 'PERIODIC_REVIEW'
  };

  return mapping[trigger || ''] || 'PERIODIC_REVIEW';
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
