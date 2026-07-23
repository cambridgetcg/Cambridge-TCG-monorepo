/**
 * Plan-Based Access Control
 * Reports order capacity without locking merchant access.
 */

import prisma from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import { getOrderLimit } from "~/constants/plan-limits";

export interface AccessCheckResult {
  hasAccess: boolean;
  isLocked: boolean;
  orderCount: number;
  planLimit: number;
  planName: string;
  reason?: string;
  usagePercentage: number;
  currentMonth: string;
  daysRemaining: number;
}

/**
 * Check if shop has access based on monthly order limit
 * Uses existing MonthlyOrderUsage tracking
 */
export async function checkPlanAccess(shop: string): Promise<AccessCheckResult> {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  // Calculate current month name and days remaining
  const currentMonth = now.toLocaleDateString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  const endOfMonth = new Date(Date.UTC(year, month, 1));
  const daysRemaining = Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // Get or create current month's usage record
  // Note: Using findFirst instead of findUnique for Aurora Data API compatibility
  let usage = await prisma.monthlyOrderUsage.findFirst({
    where: {
      shop: shop,
      year: year,
      month: month
    }
  });

  // If no record exists, create one with default free plan
  if (!usage) {
    console.log(`[PlanAccess] No usage record for ${shop}, creating with Free plan defaults`);

    usage = await prisma.monthlyOrderUsage.create({
      data: {
        id: uuidv4(),
        shop,
        year,
        month,
        orderCount: 0,
        planLimit: getOrderLimit('RewardsPro Free'),
        planName: 'RewardsPro Free',
        isLocked: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  }

  // Preserve larger legacy/custom snapshots while repairing stale low defaults.
  const contractLimit = getOrderLimit(usage.planName);
  const planLimit = Math.max(usage.planLimit, contractLimit);
  const usagePercentage = planLimit > 0
    ? Math.min((usage.orderCount / planLimit) * 100, 100)
    : 0;

  // Clear old hard-lock state and repair the contract snapshot. Capacity is
  // advisory: admin access, balances, and loyalty processing remain available.
  if (usage.isLocked || usage.planLimit !== planLimit) {
    await prisma.monthlyOrderUsage.update({
      where: { id: usage.id },
      data: {
        planLimit,
        isLocked: false,
        lockedAt: null,
        lockReason: null,
        updatedAt: new Date(),
      }
    });
  }

  const overCapacity = usage.orderCount >= planLimit;
  console.log(`[PlanAccess] Shop ${shop} usage ${usage.orderCount}/${planLimit} (${usagePercentage.toFixed(1)}%); advisory=${overCapacity}`);

  return {
    hasAccess: true,
    isLocked: false,
    orderCount: usage.orderCount,
    planLimit,
    planName: usage.planName,
    reason: overCapacity
      ? `Monthly plan capacity reached (${usage.orderCount}/${planLimit}); consider a larger plan.`
      : undefined,
    usagePercentage,
    currentMonth,
    daysRemaining
  };
}

/**
 * Unlock shop after plan upgrade
 */
export async function unlockShop(shop: string): Promise<void> {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  console.log(`[PlanAccess] Unlocking shop ${shop} for ${year}-${month.toString().padStart(2, '0')}`);

  await prisma.monthlyOrderUsage.updateMany({
    where: {
      shop,
      year,
      month
    },
    data: {
      isLocked: false,
      lockedAt: null,
      lockReason: null,
      updatedAt: new Date()
    }
  });

  console.log(`[PlanAccess] Shop ${shop} unlocked successfully`);
}

/**
 * Update plan limit after subscription change
 * Automatically unlocks if new limit is higher than current usage
 */
export async function updatePlanLimit(
  shop: string,
  newPlanName: string,
  newLimit: number
): Promise<void> {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  console.log(`[PlanAccess] Updating ${shop} to ${newPlanName} (limit: ${newLimit})`);

  // Get current usage
  // Note: Using findFirst instead of findUnique for Aurora Data API compatibility
  const usage = await prisma.monthlyOrderUsage.findFirst({
    where: {
      shop: shop,
      year: year,
      month: month
    }
  });

  console.log(`[PlanAccess] Current usage: ${usage?.orderCount || 0}, New limit: ${newLimit}`);

  if (usage) {
    // Plan changes update the reporting snapshot and always clear old locks.
    await prisma.monthlyOrderUsage.update({
      where: { id: usage.id },
      data: {
        planName: newPlanName,
        planLimit: newLimit,
        isLocked: false,
        lockedAt: null,
        lockReason: null,
        updatedAt: new Date()
      }
    });
  } else {
    // Create new record with updated plan
    await prisma.monthlyOrderUsage.create({
      data: {
        id: uuidv4(),
        shop,
        year,
        month,
        orderCount: 0,
        planLimit: newLimit,
        planName: newPlanName,
        isLocked: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  }

  console.log(`[PlanAccess] Plan updated successfully for ${shop}`);
}

/**
 * Get plan limit for a given plan name
 * Delegates to plan-limits.ts (single source of truth)
 */
export function getPlanLimit(planName: string): number {
  return getOrderLimit(planName);
}

/**
 * Check if shop is approaching limit (for warnings)
 */
export async function isApproachingLimit(shop: string, threshold: number = 80): Promise<boolean> {
  const accessCheck = await checkPlanAccess(shop);
  return accessCheck.usagePercentage >= threshold;
}

/**
 * Get usage summary for display
 */
export async function getUsageSummary(shop: string) {
  const accessCheck = await checkPlanAccess(shop);

  return {
    orderCount: accessCheck.orderCount,
    planLimit: accessCheck.planLimit,
    planName: accessCheck.planName,
    currentMonth: accessCheck.currentMonth,
    daysRemaining: accessCheck.daysRemaining,
    usagePercentage: accessCheck.usagePercentage,
    isLocked: accessCheck.isLocked,
    lockReason: accessCheck.reason,
    isApproaching80: accessCheck.usagePercentage >= 80,
    isApproaching90: accessCheck.usagePercentage >= 90,
  };
}
