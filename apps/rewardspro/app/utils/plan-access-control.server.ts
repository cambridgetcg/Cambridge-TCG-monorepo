/**
 * Plan-Based Access Control
 * Enforces order limits based on merchant subscription plans
 */

import db from "~/db.server";
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
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Calculate current month name and days remaining
  const currentMonth = now.toLocaleDateString('en-US', { month: 'long' });
  const endOfMonth = new Date(year, month, 0);
  const daysRemaining = Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // Get or create current month's usage record
  // Note: Using findFirst instead of findUnique for Aurora Data API compatibility
  let usage = await db.monthlyOrderUsage.findFirst({
    where: {
      shop: shop,
      year: year,
      month: month
    }
  });

  // If no record exists, create one with default free plan
  if (!usage) {
    console.log(`[PlanAccess] No usage record for ${shop}, creating with Free plan defaults`);

    usage = await db.monthlyOrderUsage.create({
      data: {
        id: uuidv4(),
        shop,
        year,
        month,
        orderCount: 0,
        planLimit: 50, // Free plan default (matches plan-limits.ts)
        planName: 'RewardsPro Free',
        isLocked: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  }

  const usagePercentage = usage.planLimit > 0
    ? Math.min((usage.orderCount / usage.planLimit) * 100, 100)
    : 0;

  // Check if already locked
  if (usage.isLocked) {
    console.log(`[PlanAccess] Shop ${shop} is LOCKED: ${usage.lockReason}`);

    return {
      hasAccess: false,
      isLocked: true,
      orderCount: usage.orderCount,
      planLimit: usage.planLimit,
      planName: usage.planName,
      reason: usage.lockReason || 'Monthly order limit reached',
      usagePercentage,
      currentMonth,
      daysRemaining
    };
  }

  // Check if limit reached (auto-lock if needed)
  if (usage.orderCount >= usage.planLimit) {
    console.log(`[PlanAccess] Shop ${shop} reached limit (${usage.orderCount}/${usage.planLimit}), auto-locking...`);

    // Auto-lock the shop
    const lockReason = `Order limit reached (${usage.orderCount}/${usage.planLimit})`;

    await db.monthlyOrderUsage.update({
      where: { id: usage.id },
      data: {
        isLocked: true,
        lockedAt: new Date(),
        lockReason,
        updatedAt: new Date()
      }
    });

    return {
      hasAccess: false,
      isLocked: true,
      orderCount: usage.orderCount,
      planLimit: usage.planLimit,
      planName: usage.planName,
      reason: lockReason,
      usagePercentage: 100,
      currentMonth,
      daysRemaining
    };
  }

  // Has access
  console.log(`[PlanAccess] Shop ${shop} has access (${usage.orderCount}/${usage.planLimit} = ${usagePercentage.toFixed(1)}%)`);

  return {
    hasAccess: true,
    isLocked: false,
    orderCount: usage.orderCount,
    planLimit: usage.planLimit,
    planName: usage.planName,
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
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  console.log(`[PlanAccess] Unlocking shop ${shop} for ${year}-${month.toString().padStart(2, '0')}`);

  await db.monthlyOrderUsage.updateMany({
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
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  console.log(`[PlanAccess] Updating ${shop} to ${newPlanName} (limit: ${newLimit})`);

  // Get current usage
  // Note: Using findFirst instead of findUnique for Aurora Data API compatibility
  const usage = await db.monthlyOrderUsage.findFirst({
    where: {
      shop: shop,
      year: year,
      month: month
    }
  });

  // Determine if we should unlock (new limit > current usage)
  const shouldUnlock = usage
    ? newLimit > usage.orderCount
    : true;

  console.log(`[PlanAccess] Current usage: ${usage?.orderCount || 0}, New limit: ${newLimit}, Will unlock: ${shouldUnlock}`);

  if (usage) {
    // Update existing record and unlock if new limit exceeds current usage
    await db.monthlyOrderUsage.update({
      where: { id: usage.id },
      data: {
        planName: newPlanName,
        planLimit: newLimit,
        ...(shouldUnlock ? {
          isLocked: false,
          lockedAt: null,
          lockReason: null,
        } : {}),
        updatedAt: new Date()
      }
    });
  } else {
    // Create new record with updated plan
    await db.monthlyOrderUsage.create({
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
