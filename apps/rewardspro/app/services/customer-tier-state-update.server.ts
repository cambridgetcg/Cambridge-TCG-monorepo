/**
 * Customer Tier State Update Service
 *
 * Single entry point for updating CustomerTierState with all pre-computed values.
 * This ensures the widget can display data with a single query and no runtime calculations.
 *
 * Call this function whenever:
 * - An order is created or refunded
 * - A tier subscription is activated/cancelled
 * - A tier purchase is made
 * - An admin manually overrides a tier
 * - Tier configuration changes (affects progress calculation)
 *
 * @module customer-tier-state-update.server
 */

import prisma from "~/db.server";
import type { PrismaClient, Tier, TierSource } from "@prisma/client";
import { resolveEffectiveTier, type TierResolutionResult } from "./tier-resolution.server";

// Transaction client type for Prisma
type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ProgressData {
  progressPercent: number;
  nextTierId: string | null;
  nextTierName: string | null;
  nextTierMinSpend: number | null;
  amountToNextTier: number;
  isMaxTier: boolean;
}

export interface CustomerTierStateUpdateResult {
  customerId: string;
  effectiveTierId: string | null;
  effectiveTierName: string | null;
  tierSource: TierSource;
  progress: ProgressData;
  resolution: TierResolutionResult;
}

export interface UpdateOptions {
  tx?: TransactionClient;
  skipResolution?: boolean;  // Use when resolution already done externally
  existingResolution?: TierResolutionResult;  // Pass existing resolution to avoid re-running
}

// ============================================
// PROGRESS CALCULATION
// ============================================

/**
 * Calculate tier progress for a customer
 *
 * @param currentNetSpend - Customer's net spending (totalSpent - totalRefunded)
 * @param effectiveTierId - Customer's current effective tier ID
 * @param allTiers - All tiers for the shop, sorted by minSpend ascending
 * @returns Progress data for widget display
 */
export function calculateProgress(
  currentNetSpend: number,
  effectiveTierId: string | null,
  allTiers: Pick<Tier, 'id' | 'name' | 'minSpend'>[]
): ProgressData {
  // Sort tiers by minSpend ascending
  const sortedTiers = [...allTiers].sort((a, b) => a.minSpend - b.minSpend);

  // If no tiers configured, return empty progress
  if (sortedTiers.length === 0) {
    return {
      progressPercent: 0,
      nextTierId: null,
      nextTierName: null,
      nextTierMinSpend: null,
      amountToNextTier: 0,
      isMaxTier: false,
    };
  }

  // Find current tier index
  const currentTierIndex = sortedTiers.findIndex(t => t.id === effectiveTierId);

  // If no current tier or tier not found, progress towards first tier
  if (currentTierIndex === -1) {
    const firstTier = sortedTiers[0];
    const amountToNextTier = Math.max(0, firstTier.minSpend - currentNetSpend);
    const progressPercent = firstTier.minSpend > 0
      ? Math.min(99, Math.max(0, Math.round((currentNetSpend / firstTier.minSpend) * 100)))
      : 0;

    return {
      progressPercent,
      nextTierId: firstTier.id,
      nextTierName: firstTier.name,
      nextTierMinSpend: firstTier.minSpend,
      amountToNextTier,
      isMaxTier: false,
    };
  }

  // Check if at max tier
  const isMaxTier = currentTierIndex === sortedTiers.length - 1;

  if (isMaxTier) {
    return {
      progressPercent: 100,
      nextTierId: null,
      nextTierName: null,
      nextTierMinSpend: null,
      amountToNextTier: 0,
      isMaxTier: true,
    };
  }

  // Calculate progress to next tier
  const nextTier = sortedTiers[currentTierIndex + 1];
  const currentTier = sortedTiers[currentTierIndex];

  // Progress is calculated from current tier threshold to next tier threshold
  const rangeStart = currentTier.minSpend;
  const rangeEnd = nextTier.minSpend;
  const rangeSize = rangeEnd - rangeStart;

  let progressPercent: number;
  if (rangeSize <= 0) {
    progressPercent = 99;
  } else {
    const progressInRange = currentNetSpend - rangeStart;
    progressPercent = Math.min(99, Math.max(0, Math.round((progressInRange / rangeSize) * 100)));
  }

  const amountToNextTier = Math.max(0, nextTier.minSpend - currentNetSpend);

  return {
    progressPercent,
    nextTierId: nextTier.id,
    nextTierName: nextTier.name,
    nextTierMinSpend: nextTier.minSpend,
    amountToNextTier,
    isMaxTier: false,
  };
}

// ============================================
// MAIN UPDATE FUNCTION
// ============================================

/**
 * Update CustomerTierState with all pre-computed values
 *
 * This is the SINGLE ENTRY POINT for updating a customer's tier state.
 * It handles:
 * 1. Tier resolution (determines effective tier from all sources)
 * 2. Progress calculation (pre-computes progress for widget)
 * 3. Atomic upsert to CustomerTierState
 *
 * @param shop - Shop domain
 * @param customerId - Customer ID to update
 * @param options - Update options
 * @returns Updated tier state with all computed values
 */
export async function updateCustomerTierState(
  shop: string,
  customerId: string,
  options?: UpdateOptions
): Promise<CustomerTierStateUpdateResult> {
  // Rebind to `db` — the previous `const prisma = options?.tx || prisma;`
  // shadowed the module-level import with an uninitialized local (TS7022 +
  // TS2448). That inference collapse propagated `any` through every
  // prisma.* access in this function, silently erasing tier-state type
  // safety. Fix is trivial; the consequences were widespread.
  const db = options?.tx || prisma;

  // 1. Get customer with spending data
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      netSpent: true,
      shop: true,
    }
  });

  if (!customer) {
    throw new Error(`Customer not found: ${customerId}`);
  }

  // 2. Resolve effective tier (skip if provided externally)
  let resolution: TierResolutionResult;

  if (options?.skipResolution && options?.existingResolution) {
    resolution = options.existingResolution;
  } else {
    resolution = await resolveEffectiveTier(shop, customerId, {
      tx: db as TransactionClient,
    });
  }

  // 3. Get all tiers for progress calculation
  const allTiers = await db.tier.findMany({
    where: { shop },
    select: { id: true, name: true, minSpend: true },
    orderBy: { minSpend: 'asc' }
  });

  // 4. Calculate progress
  const currentNetSpend = Number(customer.netSpent || 0);
  const progress = calculateProgress(
    currentNetSpend,
    resolution.effectiveTierId,
    allTiers
  );

  // 5. Map resolution source to TierSource enum
  const tierSourceMap: Record<string, TierSource> = {
    'MANUAL_OVERRIDE': 'MANUAL_OVERRIDE',
    'TIER_SUBSCRIPTION': 'TIER_SUBSCRIPTION',
    'TIER_PURCHASE': 'TIER_PURCHASE',
    'SPENDING_BASED': 'SPENDING_BASED',
    'DEFAULT_BASE_TIER': 'DEFAULT_BASE_TIER',
    'NONE': 'NONE',
  };
  const tierSource = tierSourceMap[resolution.effectiveSource] || 'NONE';

  // 6. Upsert CustomerTierState with all pre-computed values
  await db.customerTierState.upsert({
    where: { customerId },
    create: {
      customerId,
      shop,
      // Effective tier
      effectiveTierId: resolution.effectiveTierId,
      tierSource,
      // Pre-computed progress
      progressPercent: progress.progressPercent,
      nextTierId: progress.nextTierId,
      nextTierName: progress.nextTierName,
      nextTierMinSpend: progress.nextTierMinSpend,
      amountToNextTier: progress.amountToNextTier,
      isMaxTier: progress.isMaxTier,
      progressCalculatedAt: new Date(),
      // Resolution tracking
      lastResolvedAt: new Date(),
      resolutionReason: resolution.resolutionReason,
    },
    update: {
      // Effective tier
      effectiveTierId: resolution.effectiveTierId,
      tierSource,
      // Pre-computed progress
      progressPercent: progress.progressPercent,
      nextTierId: progress.nextTierId,
      nextTierName: progress.nextTierName,
      nextTierMinSpend: progress.nextTierMinSpend,
      amountToNextTier: progress.amountToNextTier,
      isMaxTier: progress.isMaxTier,
      progressCalculatedAt: new Date(),
      // Resolution tracking
      lastResolvedAt: new Date(),
      resolutionReason: resolution.resolutionReason,
      updatedAt: new Date(),
    }
  });

  // 7. Also update Customer.currentTierId for backwards compatibility
  // This keeps the existing Customer.currentTierId in sync
  if (resolution.effectiveTierId !== customer.id) {
    await db.customer.update({
      where: { id: customerId },
      data: { currentTierId: resolution.effectiveTierId }
    });
  }

  return {
    customerId,
    effectiveTierId: resolution.effectiveTierId,
    effectiveTierName: resolution.effectiveTierName,
    tierSource,
    progress,
    resolution,
  };
}

// ============================================
// BATCH UPDATE FUNCTION
// ============================================

/**
 * Batch update tier state for multiple customers
 *
 * Useful for:
 * - Cron jobs that recalculate tiers
 * - Tier configuration changes affecting many customers
 * - Initial sync/backfill operations
 *
 * @param shop - Shop domain
 * @param customerIds - Array of customer IDs to update
 * @param options - Update options
 * @returns Summary of updates
 */
export async function batchUpdateCustomerTierState(
  shop: string,
  customerIds: string[],
  options?: { batchSize?: number }
): Promise<{ updated: number; failed: number; errors: Array<{ customerId: string; error: string }> }> {
  const batchSize = options?.batchSize || 50;
  let updated = 0;
  let failed = 0;
  const errors: Array<{ customerId: string; error: string }> = [];

  // Process in batches to avoid overwhelming the database
  for (let i = 0; i < customerIds.length; i += batchSize) {
    const batch = customerIds.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (customerId) => {
        try {
          await updateCustomerTierState(shop, customerId);
          updated++;
        } catch (error: any) {
          failed++;
          errors.push({ customerId, error: error.message || 'Unknown error' });
        }
      })
    );
  }

  return { updated, failed, errors };
}

// ============================================
// UTILITY FUNCTION
// ============================================

/**
 * Refresh progress for all customers in a shop
 *
 * Call this when tier configuration changes (e.g., minSpend thresholds updated)
 * to ensure all customers have accurate progress data.
 *
 * @param shop - Shop domain
 * @returns Summary of updates
 */
export async function refreshShopProgress(
  shop: string
): Promise<{ totalCustomers: number; updated: number; failed: number }> {
  // Get all customer IDs for the shop
  const customers = await prisma.customer.findMany({
    where: { shop },
    select: { id: true }
  });

  const customerIds = customers.map(c => c.id);
  const result = await batchUpdateCustomerTierState(shop, customerIds);

  return {
    totalCustomers: customerIds.length,
    updated: result.updated,
    failed: result.failed,
  };
}
