/**
 * Email Usage Control Service
 *
 * Tracks monthly email usage and reports plan-capacity advisories. Email
 * capacities never pause delivery; merchants can move to a larger fixed plan
 * when sustained volume calls for it.
 *
 * @module email-usage-control.server
 */

import prisma from "../db.server";
import { PRICING_PLANS } from "~/constants/pricing-contract";
import { getLimit, getEffectivePlan } from "./entitlements.server";

const FREE_EMAIL_LIMIT = PRICING_PLANS.free.limits.emails;

// ============================================
// TYPES
// ============================================

export type EmailType = "campaign" | "automation" | "transactional";

export interface EmailUsageResult {
  allowed: true;
  currentUsage: number;
  limit: number;
  percentage: number;
  remaining: number;
  message: string;
  capacityExceeded: boolean;
  advisory?: boolean;
  /** @deprecated Email capacity never requires an upgrade to continue. */
  upgradeRequired?: false;
}

export interface EmailUsageStats {
  totalEmails: number;
  campaignEmails: number;
  automationEmails: number;
  transactionalEmails: number;
  limit: number;
  percentage: number;
  remaining: number;
  isLocked: boolean;
  legacyLockRecorded?: boolean;
  planName: string;
}

function getCapacityPercentage(currentUsage: number, limit: number): number {
  if (limit >= 999999) return 0;
  if (limit <= 0) return currentUsage > 0 ? 100 : 0;
  return Math.min(100, Math.round((currentUsage / limit) * 100));
}

// ============================================
// USAGE TRACKING
// ============================================

/**
 * Get or create monthly email usage record for a shop
 */
async function getOrCreateMonthlyUsage(shop: string) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12

  // Try to find existing record
  let usage = await prisma.monthlyEmailUsage.findUnique({
    where: {
      shop_year_month: { shop, year, month },
    },
  });

  // Create if not exists
  if (!usage) {
    const [limit, planName] = await Promise.all([
      getLimit(shop, "maxEmails"),
      getEffectivePlan(shop),
    ]);

    usage = await prisma.monthlyEmailUsage.create({
      data: {
        shop,
        year,
        month,
        emailCount: 0,
        planLimit: limit,
        planName,
        campaignEmails: 0,
        automationEmails: 0,
        transactionalEmails: 0,
      },
    });
  }

  return usage;
}

/**
 * Check current email capacity without blocking delivery.
 *
 * @param shop - Shop domain
 * @param count - Number of emails to send (default 1)
 * @returns Usage result with advisory status and details
 */
export async function checkEmailLimit(
  shop: string,
  count: number = 1
): Promise<EmailUsageResult> {
  try {
    const [usage, limit] = await Promise.all([
      getOrCreateMonthlyUsage(shop),
      getLimit(shop, "maxEmails"),
    ]);

    const currentUsage = usage.emailCount;
    const remaining = Math.max(0, limit - currentUsage);
    const percentage = getCapacityPercentage(currentUsage, limit);

    if (limit >= 999999) {
      return {
        allowed: true,
        currentUsage,
        limit,
        percentage: 0,
        remaining: 999999,
        message: "Unlimited emails available",
        capacityExceeded: false,
      };
    }

    const capacityExceeded = currentUsage + count > limit;

    if (usage.isLocked) {
      console.warn(
        `[EmailUsageControl] Ignoring legacy email lock for ${shop}; delivery remains available`,
      );
    }

    if (capacityExceeded) {
      const message = `Email capacity advisory: ${currentUsage}/${limit} emails used this month and ${count} requested. Sending remains available; consider a larger fixed plan if this is sustained.`;
      console.warn(`[EmailUsageControl] ${message} shop=${shop}`);

      return {
        allowed: true,
        currentUsage,
        limit,
        percentage,
        remaining,
        message,
        capacityExceeded: true,
        advisory: true,
      };
    }

    return {
      allowed: true,
      currentUsage,
      limit,
      percentage,
      remaining,
      message: `${remaining} emails remaining this month`,
      capacityExceeded: false,
    };
  } catch (error) {
    console.error("[EmailUsageControl] Error checking limit:", error);
    // Fail open - allow sending if we can't check (but log it)
    return {
      allowed: true,
      currentUsage: 0,
      limit: 999999,
      percentage: 0,
      remaining: 999999,
      message: "Unable to verify limit - allowing email",
      capacityExceeded: false,
    };
  }
}

/**
 * Record that emails were sent (increment counter)
 *
 * @param shop - Shop domain
 * @param count - Number of emails sent
 * @param type - Type of email (campaign, automation, transactional)
 */
export async function recordEmailSent(
  shop: string,
  count: number = 1,
  type: EmailType = "transactional"
): Promise<void> {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Get current limit and plan for new records
    const [limit, planName] = await Promise.all([
      getLimit(shop, "maxEmails"),
      getEffectivePlan(shop),
    ]);

    // Upsert to handle concurrent requests gracefully
    await prisma.monthlyEmailUsage.upsert({
      where: {
        shop_year_month: { shop, year, month },
      },
      update: {
        emailCount: { increment: count },
        lastEmailDate: now,
        // Increment type-specific counter
        ...(type === "campaign" && { campaignEmails: { increment: count } }),
        ...(type === "automation" && { automationEmails: { increment: count } }),
        ...(type === "transactional" && { transactionalEmails: { increment: count } }),
      },
      create: {
        shop,
        year,
        month,
        emailCount: count,
        planLimit: limit,
        planName,
        lastEmailDate: now,
        campaignEmails: type === "campaign" ? count : 0,
        automationEmails: type === "automation" ? count : 0,
        transactionalEmails: type === "transactional" ? count : 0,
      },
    });

    console.log(`[EmailUsageControl] Recorded ${count} ${type} email(s) for ${shop}`);
  } catch (error) {
    console.error("[EmailUsageControl] Error recording email:", error);
    // Don't throw - recording failure shouldn't block email sending
  }
}

/**
 * Get email usage statistics for a shop
 *
 * @param shop - Shop domain
 * @returns Usage statistics for the current month
 */
export async function getEmailUsageStats(shop: string): Promise<EmailUsageStats> {
  try {
    const [usage, limit, planName] = await Promise.all([
      getOrCreateMonthlyUsage(shop),
      getLimit(shop, "maxEmails"),
      getEffectivePlan(shop),
    ]);

    const remaining = Math.max(0, limit - usage.emailCount);
    const percentage = getCapacityPercentage(usage.emailCount, limit);

    if (usage.isLocked) {
      console.warn(
        `[EmailUsageControl] Legacy lock recorded for ${shop}; reporting it as non-blocking`,
      );
    }

    return {
      totalEmails: usage.emailCount,
      campaignEmails: usage.campaignEmails,
      automationEmails: usage.automationEmails,
      transactionalEmails: usage.transactionalEmails,
      limit,
      percentage,
      remaining,
      isLocked: false,
      legacyLockRecorded: usage.isLocked,
      planName,
    };
  } catch (error) {
    console.error("[EmailUsageControl] Error getting stats:", error);
    // Return safe defaults
    return {
      totalEmails: 0,
      campaignEmails: 0,
      automationEmails: 0,
      transactionalEmails: 0,
      limit: FREE_EMAIL_LIMIT,
      percentage: 0,
      remaining: FREE_EMAIL_LIMIT,
      isLocked: false,
      planName: PRICING_PLANS.free.displayName,
    };
  }
}

/**
 * Check and record email in one atomic operation
 * Records the send after checking advisory capacity.
 *
 * @param shop - Shop domain
 * @param count - Number of emails to send
 * @param type - Type of email
 * @returns Non-blocking usage and capacity details
 */
export async function checkAndRecordEmail(
  shop: string,
  count: number = 1,
  type: EmailType = "transactional"
): Promise<EmailUsageResult> {
  const result = await checkEmailLimit(shop, count);

  await recordEmailSent(shop, count, type);
  result.remaining = Math.max(0, result.remaining - count);
  result.currentUsage += count;

  return result;
}

/**
 * Legacy compatibility no-op.
 *
 * Capacity controls no longer lock email sending. Existing persisted lock
 * metadata is left untouched for audit/history and is ignored by send checks.
 */
export async function lockEmailSending(
  shop: string,
  reason: string
): Promise<void> {
  console.warn(
    `[EmailUsageControl] Ignored legacy lock request for ${shop}: ${reason}`,
  );
}

/**
 * Unlock email sending for a shop (admin action)
 *
 * @param shop - Shop domain
 */
export async function unlockEmailSending(shop: string): Promise<void> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  await prisma.monthlyEmailUsage.updateMany({
    where: {
      shop,
      year,
      month,
    },
    data: {
      isLocked: false,
      lockedAt: null,
      lockReason: null,
    },
  });

  console.log(`[EmailUsageControl] Unlocked email sending for ${shop}`);
}

/**
 * Update plan limits when a shop changes plans
 * Called when entitlements are invalidated
 *
 * @param shop - Shop domain
 */
export async function updateEmailPlanLimits(shop: string): Promise<void> {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const [limit, planName] = await Promise.all([
      getLimit(shop, "maxEmails"),
      getEffectivePlan(shop),
    ]);

    await prisma.monthlyEmailUsage.updateMany({
      where: {
        shop,
        year,
        month,
      },
      data: {
        planLimit: limit,
        planName,
        // Unlock if upgrading to a higher limit
        isLocked: false,
        lockedAt: null,
        lockReason: null,
      },
    });

    console.log(`[EmailUsageControl] Updated plan limits for ${shop}: ${limit} emails (${planName})`);
  } catch (error) {
    console.error("[EmailUsageControl] Error updating plan limits:", error);
  }
}
