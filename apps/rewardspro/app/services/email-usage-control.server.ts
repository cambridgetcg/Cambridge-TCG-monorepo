/**
 * Email Usage Control Service
 *
 * Tracks and enforces email sending limits based on the rate-based gating model.
 * Free: 50/month, Pro: 500/month, Max: 2000/month, Ultra: unlimited
 *
 * @module email-usage-control.server
 */

import prisma from "../db.server";
import { getLimit, getEffectivePlan } from "./entitlements.server";

// ============================================
// TYPES
// ============================================

export type EmailType = "campaign" | "automation" | "transactional";

export interface EmailUsageResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  percentage: number;
  remaining: number;
  message: string;
  upgradeRequired?: boolean;
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
  planName: string;
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
 * Check if a shop can send more emails
 *
 * @param shop - Shop domain
 * @param count - Number of emails to send (default 1)
 * @returns Usage result with allowed status and details
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
    const percentage = limit >= 999999 ? 0 : Math.round((currentUsage / limit) * 100);

    // Unlimited plan (999999)
    if (limit >= 999999) {
      return {
        allowed: true,
        currentUsage,
        limit,
        percentage: 0,
        remaining: 999999,
        message: "Unlimited emails available",
      };
    }

    // Check if adding count would exceed limit
    if (currentUsage + count > limit) {
      return {
        allowed: false,
        currentUsage,
        limit,
        percentage,
        remaining,
        message: `Email limit reached (${currentUsage}/${limit}). Upgrade your plan for more emails.`,
        upgradeRequired: true,
      };
    }

    // Check if already locked
    if (usage.isLocked) {
      return {
        allowed: false,
        currentUsage,
        limit,
        percentage,
        remaining,
        message: `Email sending is paused. ${usage.lockReason || "Contact support for assistance."}`,
        upgradeRequired: true,
      };
    }

    return {
      allowed: true,
      currentUsage,
      limit,
      percentage,
      remaining,
      message: `${remaining} emails remaining this month`,
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
    const percentage = limit >= 999999 ? 0 : Math.round((usage.emailCount / limit) * 100);

    return {
      totalEmails: usage.emailCount,
      campaignEmails: usage.campaignEmails,
      automationEmails: usage.automationEmails,
      transactionalEmails: usage.transactionalEmails,
      limit,
      percentage,
      remaining,
      isLocked: usage.isLocked,
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
      limit: 50, // Default to free plan limit
      percentage: 0,
      remaining: 50,
      isLocked: false,
      planName: "Free",
    };
  }
}

/**
 * Check and record email in one atomic operation
 * Returns whether the email can be sent
 *
 * @param shop - Shop domain
 * @param count - Number of emails to send
 * @param type - Type of email
 * @returns Whether the email(s) can be sent
 */
export async function checkAndRecordEmail(
  shop: string,
  count: number = 1,
  type: EmailType = "transactional"
): Promise<EmailUsageResult> {
  // First check if allowed
  const result = await checkEmailLimit(shop, count);

  // If allowed, record the usage
  if (result.allowed) {
    await recordEmailSent(shop, count, type);
    // Update remaining count
    result.remaining = Math.max(0, result.remaining - count);
    result.currentUsage += count;
  }

  return result;
}

/**
 * Lock email sending for a shop (admin action)
 *
 * @param shop - Shop domain
 * @param reason - Reason for locking
 */
export async function lockEmailSending(
  shop: string,
  reason: string
): Promise<void> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  await prisma.monthlyEmailUsage.upsert({
    where: {
      shop_year_month: { shop, year, month },
    },
    update: {
      isLocked: true,
      lockedAt: now,
      lockReason: reason,
    },
    create: {
      shop,
      year,
      month,
      emailCount: 0,
      planLimit: 50,
      planName: "Free",
      isLocked: true,
      lockedAt: now,
      lockReason: reason,
      campaignEmails: 0,
      automationEmails: 0,
      transactionalEmails: 0,
    },
  });

  console.log(`[EmailUsageControl] Locked email sending for ${shop}: ${reason}`);
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
