/**
 * Trial Eligibility Service
 *
 * Prevents trial abuse by tracking and validating trial usage.
 * Merchants can only use one free trial per shop, regardless of plan switching.
 *
 * @module trial-eligibility.server
 */

import db from "../../db.server";
import { v4 as uuidv4 } from "uuid";

// ============================================
// TYPES
// ============================================

export interface TrialEligibilityResult {
  eligible: boolean;
  reason?: TrialBlockReason;
  message: string;
  details: {
    hasUsedTrial: boolean;
    isCurrentlyInTrial: boolean;
    trialDaysRemaining?: number;
    firstTrialStartedAt?: Date | null;
    totalTrialDaysUsed: number;
    lastTrialPlanId?: string | null;
  };
}

export type TrialBlockReason =
  | "ACTIVE_TRIAL"           // Currently in a trial period
  | "TRIAL_ALREADY_USED"     // Previously used a trial
  | "SAME_PLAN_TRIAL"        // Trying to get trial on same plan again
  | "TEST_MODE";             // Test mode - trials may be allowed

export interface TrialAuditLogInput {
  shop: string;
  planId: string;
  planName?: string;
  trialDaysRequested: number;
  trialDaysGranted: number;
  previousPlanId?: string | null;
  previousPlanName?: string | null;
  wasInTrial: boolean;
  wasBlocked: boolean;
  blockReason?: string | null;
  eligibilityCheck?: TrialEligibilityResult;
  requestSource?: string;
  ipAddress?: string;
  userAgent?: string;
}

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Check if a shop is eligible for a free trial
 *
 * Rules:
 * 1. If never used a trial → eligible
 * 2. If currently in trial → not eligible (ACTIVE_TRIAL)
 * 3. If previously used trial → not eligible (TRIAL_ALREADY_USED)
 *
 * @param shop - Shop domain
 * @param targetPlanId - The plan they're trying to subscribe to (optional)
 * @returns Eligibility result with reason and details
 */
export async function checkTrialEligibility(
  shop: string,
  targetPlanId?: string
): Promise<TrialEligibilityResult> {
  try {
    // Get current subscription
    const subscription = await db.appSubscription.findUnique({
      where: { shop },
      select: {
        hasUsedTrial: true,
        firstTrialStartedAt: true,
        totalTrialDaysUsed: true,
        lastTrialPlanId: true,
        trialDays: true,
        trialEndsAt: true,
        planName: true,
        status: true,
        test: true,
      },
    });

    // No subscription record - first time user, eligible
    if (!subscription) {
      return {
        eligible: true,
        message: "Eligible for free trial - first time user",
        details: {
          hasUsedTrial: false,
          isCurrentlyInTrial: false,
          totalTrialDaysUsed: 0,
        },
      };
    }

    // Check if currently in trial
    const now = new Date();
    const isCurrentlyInTrial = subscription.trialEndsAt
      ? now < subscription.trialEndsAt
      : false;

    // Calculate remaining trial days if in trial
    let trialDaysRemaining: number | undefined;
    if (isCurrentlyInTrial && subscription.trialEndsAt) {
      trialDaysRemaining = Math.ceil(
        (subscription.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    // Build details object
    const details = {
      hasUsedTrial: subscription.hasUsedTrial,
      isCurrentlyInTrial,
      trialDaysRemaining,
      firstTrialStartedAt: subscription.firstTrialStartedAt,
      totalTrialDaysUsed: subscription.totalTrialDaysUsed,
      lastTrialPlanId: subscription.lastTrialPlanId,
    };

    // Case 1: Currently in an active trial - NOT eligible
    if (isCurrentlyInTrial) {
      return {
        eligible: false,
        reason: "ACTIVE_TRIAL",
        message: `Already in trial period with ${trialDaysRemaining} days remaining`,
        details,
      };
    }

    // Case 2: Previously used a trial - NOT eligible
    if (subscription.hasUsedTrial) {
      // Special case: If trying to get trial on the same plan they already trialed
      if (targetPlanId && subscription.lastTrialPlanId === targetPlanId) {
        return {
          eligible: false,
          reason: "SAME_PLAN_TRIAL",
          message: "Already used trial on this plan",
          details,
        };
      }

      return {
        eligible: false,
        reason: "TRIAL_ALREADY_USED",
        message: "Free trial already used on this store",
        details,
      };
    }

    // Case 3: Never used a trial - eligible
    return {
      eligible: true,
      message: "Eligible for free trial",
      details,
    };
  } catch (error) {
    console.error("[TrialEligibility] Error checking eligibility:", error);

    // On error, default to not eligible for safety
    return {
      eligible: false,
      reason: "TRIAL_ALREADY_USED",
      message: "Unable to verify trial eligibility",
      details: {
        hasUsedTrial: true, // Assume used for safety
        isCurrentlyInTrial: false,
        totalTrialDaysUsed: 0,
      },
    };
  }
}

/**
 * Mark a shop as having used their trial
 *
 * Called when a trial is successfully activated (typically from webhook)
 *
 * @param shop - Shop domain
 * @param planId - Plan ID that granted the trial
 * @param trialDays - Number of trial days granted
 */
export async function markTrialUsed(
  shop: string,
  planId: string,
  trialDays: number
): Promise<void> {
  try {
    const now = new Date();

    await db.appSubscription.update({
      where: { shop },
      data: {
        hasUsedTrial: true,
        firstTrialStartedAt: now,
        totalTrialDaysUsed: trialDays,
        lastTrialPlanId: planId,
        trialEndsAt: new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000),
      },
    });

    console.log(`[TrialEligibility] Marked trial as used for shop: ${shop}, plan: ${planId}, days: ${trialDays}`);
  } catch (error) {
    console.error("[TrialEligibility] Error marking trial as used:", error);
    throw error;
  }
}

/**
 * Log a trial grant attempt (successful or blocked)
 *
 * Creates an audit trail for all trial requests
 *
 * @param input - Audit log details
 */
export async function logTrialAttempt(input: TrialAuditLogInput): Promise<void> {
  try {
    await db.trialAuditLog.create({
      data: {
        id: uuidv4(),
        shop: input.shop,
        planId: input.planId,
        planName: input.planName,
        trialDaysRequested: input.trialDaysRequested,
        trialDaysGranted: input.trialDaysGranted,
        previousPlanId: input.previousPlanId,
        previousPlanName: input.previousPlanName,
        wasInTrial: input.wasInTrial,
        wasBlocked: input.wasBlocked,
        blockReason: input.blockReason,
        eligibilityCheck: input.eligibilityCheck as any,
        requestSource: input.requestSource,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });

    console.log(
      `[TrialEligibility] Logged trial attempt for ${input.shop}: ` +
      `${input.wasBlocked ? "BLOCKED" : "ALLOWED"} - ${input.blockReason || "eligible"}`
    );
  } catch (error) {
    // Don't throw on audit log failure - just log it
    console.error("[TrialEligibility] Error logging trial attempt:", error);
  }
}

/**
 * Get trial audit history for a shop
 *
 * Useful for debugging and support
 *
 * @param shop - Shop domain
 * @param limit - Max records to return
 */
export async function getTrialAuditHistory(
  shop: string,
  limit: number = 50
): Promise<any[]> {
  try {
    const logs = await db.trialAuditLog.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return logs;
  } catch (error) {
    console.error("[TrialEligibility] Error fetching audit history:", error);
    return [];
  }
}

/**
 * Get trial abuse statistics
 *
 * Returns metrics on blocked trial attempts for monitoring
 */
export async function getTrialAbuseStats(): Promise<{
  totalAttempts: number;
  blockedAttempts: number;
  blockRate: number;
  topBlockReasons: { reason: string; count: number }[];
}> {
  try {
    // Get total attempts
    const totalAttempts = await db.trialAuditLog.count();

    // Get blocked attempts
    const blockedAttempts = await db.trialAuditLog.count({
      where: { wasBlocked: true },
    });

    // Calculate block rate
    const blockRate = totalAttempts > 0 ? (blockedAttempts / totalAttempts) * 100 : 0;

    // Note: groupBy with count would be ideal but may not work with Data API
    // For now, return basic stats
    return {
      totalAttempts,
      blockedAttempts,
      blockRate,
      topBlockReasons: [], // Would require raw SQL or different approach
    };
  } catch (error) {
    console.error("[TrialEligibility] Error fetching abuse stats:", error);
    return {
      totalAttempts: 0,
      blockedAttempts: 0,
      blockRate: 0,
      topBlockReasons: [],
    };
  }
}

/**
 * Check if a shop should receive trial days in a billing request
 *
 * This is the main function to call before creating a subscription
 *
 * @param shop - Shop domain
 * @param planId - Target plan ID
 * @param planTrialDays - Trial days configured for the plan
 * @returns Number of trial days to include (0 if not eligible)
 */
export async function getTrialDaysForRequest(
  shop: string,
  planId: string,
  planTrialDays: number
): Promise<{
  trialDays: number;
  eligibility: TrialEligibilityResult;
}> {
  const eligibility = await checkTrialEligibility(shop, planId);

  return {
    trialDays: eligibility.eligible ? planTrialDays : 0,
    eligibility,
  };
}
