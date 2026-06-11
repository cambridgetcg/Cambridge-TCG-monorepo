/**
 * Tier Trial Eligibility Service
 *
 * Prevents trial abuse by tracking and validating tier subscription trials.
 * Mirrors the app billing trial eligibility system for tier subscriptions.
 *
 * Part of Trial Abuse Prevention - Phase 2
 */

import { db } from '~/db.server';
import { subscriptionLogger } from './subscription-correlation.server';
import { SUBSCRIPTION_NEURAL_CONFIG } from './subscription-neural-config.server';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Tier trial configuration
 * Centralized settings for trial abuse prevention
 */
export const TIER_TRIAL_CONFIG = Object.freeze({
  // Maximum total trial days a customer can use across all tiers
  maxLifetimeTrialDays: 30,

  // Default trial days per tier (can be overridden per tier)
  defaultTrialDays: 14,

  // Minimum days between trial attempts (prevents rapid switching)
  minDaysBetweenTrials: 30,

  // Whether to allow trials on different tiers after using one
  allowMultipleTierTrials: false, // Set to true to allow one trial per tier

  // Block reasons
  blockReasons: Object.freeze({
    ACTIVE_TRIAL: 'Customer is currently in an active trial period',
    TRIAL_ALREADY_USED: 'Customer has already used their tier trial allowance',
    SAME_TIER_TRIAL: 'Customer already used a trial for this specific tier',
    MAX_DAYS_EXCEEDED: 'Customer has exceeded maximum lifetime trial days',
    TOO_SOON: 'Not enough time has passed since last trial',
    INELIGIBLE_TIER: 'This tier does not offer trials',
  } as const),
});

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type TierTrialBlockReason = keyof typeof TIER_TRIAL_CONFIG.blockReasons;

export interface TierTrialEligibilityResult {
  eligible: boolean;
  reason?: TierTrialBlockReason;
  reasonMessage?: string;
  trialDaysAvailable: number;
  trialDaysRequested: number;
  previousTrials: TierTrialHistoryEntry[];
  customerTrialStats: {
    hasUsedTierTrial: boolean;
    totalDaysUsed: number;
    remainingDays: number;
    lastTrialDate?: Date;
  };
}

export interface TierTrialHistoryEntry {
  tierId: string;
  tierName: string;
  daysUsed: number;
  startedAt: Date;
  endedAt?: Date;
  converted: boolean; // Did they convert to paid?
}

export interface MarkTrialUsedInput {
  shop: string;
  customerId: string;
  tierId: string;
  tierName: string;
  trialDays: number;
  subscriptionId?: string;
  requestSource?: string;
}

export interface LogTrialAttemptInput {
  shop: string;
  customerId: string;
  tierId: string;
  tierName: string;
  wasBlocked: boolean;
  blockReason?: TierTrialBlockReason;
  trialDaysRequested: number;
  trialDaysGranted: number;
  previousTierId?: string;
  previousTierName?: string;
  subscriptionId?: string;
  requestSource?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// TIER TRIAL ELIGIBILITY SERVICE
// ============================================================================

export class TierTrialEligibilityService {
  /**
   * Check if a customer is eligible for a tier trial
   *
   * This is the main entry point for trial eligibility checks.
   * Should be called before creating any tier subscription with a trial.
   */
  static async checkEligibility(
    shop: string,
    customerId: string,
    tierId: string,
    requestedTrialDays?: number
  ): Promise<TierTrialEligibilityResult> {
    subscriptionLogger.debug('Checking tier trial eligibility', {
      shop,
      customerId,
      tierId,
      requestedTrialDays,
    });

    const trialDays = requestedTrialDays || TIER_TRIAL_CONFIG.defaultTrialDays;

    // Get customer with trial tracking fields
    const customer = await db.customer.findFirst({
      where: { id: customerId },
    });

    if (!customer || customer.shop !== shop) {
      subscriptionLogger.warn('Customer not found for trial check', { customerId, shop });
      return this.buildIneligibleResult(trialDays, 'TRIAL_ALREADY_USED', [], {
        hasUsedTierTrial: false,
        totalDaysUsed: 0,
        remainingDays: 0,
      });
    }

    const previousTrials = this.parseTrialHistory(customer.tierTrialHistory);
    const remainingDays = TIER_TRIAL_CONFIG.maxLifetimeTrialDays - (customer.totalTierTrialDaysUsed || 0);

    const customerStats = {
      hasUsedTierTrial: customer.hasUsedTierTrial,
      totalDaysUsed: customer.totalTierTrialDaysUsed || 0,
      remainingDays: Math.max(0, remainingDays),
      lastTrialDate: customer.firstTierTrialStartedAt || undefined,
    };

    // Check 1: Is customer currently in an active trial?
    const activeTrialSub = await db.tierSubscription.findFirst({
      where: {
        customerId,
        shop,
        status: 'ACTIVE',
        trialEndsAt: { gt: new Date() },
      },
    });

    if (activeTrialSub) {
      subscriptionLogger.info('Customer has active tier trial', {
        customerId,
        activeSubscriptionId: activeTrialSub.id,
      });
      return this.buildIneligibleResult(trialDays, 'ACTIVE_TRIAL', previousTrials, customerStats);
    }

    // Check 2: Has customer already used their trial allowance?
    if (customer.hasUsedTierTrial && !TIER_TRIAL_CONFIG.allowMultipleTierTrials) {
      subscriptionLogger.info('Customer has already used tier trial', { customerId });
      return this.buildIneligibleResult(trialDays, 'TRIAL_ALREADY_USED', previousTrials, customerStats);
    }

    // Check 3: If multiple trials allowed, check same-tier restriction
    if (TIER_TRIAL_CONFIG.allowMultipleTierTrials && customer.lastTierTrialTierId === tierId) {
      const alreadyTriedThisTier = previousTrials.some((t) => t.tierId === tierId);
      if (alreadyTriedThisTier) {
        subscriptionLogger.info('Customer already used trial for this tier', { customerId, tierId });
        return this.buildIneligibleResult(trialDays, 'SAME_TIER_TRIAL', previousTrials, customerStats);
      }
    }

    // Check 4: Maximum lifetime trial days exceeded?
    if (remainingDays <= 0) {
      subscriptionLogger.info('Customer exceeded max lifetime trial days', {
        customerId,
        totalUsed: customer.totalTierTrialDaysUsed,
        max: TIER_TRIAL_CONFIG.maxLifetimeTrialDays,
      });
      return this.buildIneligibleResult(trialDays, 'MAX_DAYS_EXCEEDED', previousTrials, customerStats);
    }

    // Check 5: Minimum time between trials (if applicable)
    if (customer.firstTierTrialStartedAt && TIER_TRIAL_CONFIG.minDaysBetweenTrials > 0) {
      const daysSinceLastTrial = Math.floor(
        (Date.now() - customer.firstTierTrialStartedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceLastTrial < TIER_TRIAL_CONFIG.minDaysBetweenTrials) {
        subscriptionLogger.info('Too soon since last trial', {
          customerId,
          daysSinceLastTrial,
          minRequired: TIER_TRIAL_CONFIG.minDaysBetweenTrials,
        });
        return this.buildIneligibleResult(trialDays, 'TOO_SOON', previousTrials, customerStats);
      }
    }

    // All checks passed - customer is eligible
    const grantedDays = Math.min(trialDays, remainingDays);

    subscriptionLogger.info('Customer eligible for tier trial', {
      customerId,
      tierId,
      requestedDays: trialDays,
      grantedDays,
    });

    return {
      eligible: true,
      trialDaysAvailable: grantedDays,
      trialDaysRequested: trialDays,
      previousTrials,
      customerTrialStats: customerStats,
    };
  }

  /**
   * Mark a tier trial as used
   *
   * Should be called when a subscription with trial is successfully created.
   * Updates customer trial tracking fields and creates audit log.
   */
  static async markTrialUsed(input: MarkTrialUsedInput): Promise<void> {
    const { shop, customerId, tierId, tierName, trialDays, subscriptionId, requestSource } = input;

    subscriptionLogger.info('Marking tier trial as used', {
      customerId,
      tierId,
      trialDays,
    });

    const customer = await db.customer.findFirst({
      where: { id: customerId },
    });

    const existingHistory = this.parseTrialHistory(customer?.tierTrialHistory);
    const now = new Date();

    // Build new history entry
    const newHistoryEntry: TierTrialHistoryEntry = {
      tierId,
      tierName,
      daysUsed: trialDays,
      startedAt: now,
      converted: false,
    };

    const updatedHistory = [...existingHistory, newHistoryEntry];

    // Calculate new total trial days
    const currentTotalDays = customer?.totalTierTrialDaysUsed || 0;
    const newTotalDays = currentTotalDays + trialDays;

    // Update customer and create audit log in transaction
    await db.$transaction(async (tx: any) => {
      await tx.customer.update({
        where: { id: customerId },
        data: {
          hasUsedTierTrial: true,
          firstTierTrialStartedAt: customer?.firstTierTrialStartedAt || now,
          totalTierTrialDaysUsed: newTotalDays,
          lastTierTrialTierId: tierId,
          tierTrialHistory: updatedHistory as any,
          updatedAt: now,
        },
      });
      await tx.tierTrialAuditLog.create({
        data: {
          shop,
          customerId,
          tierId,
          tierName,
          action: 'TRIAL_GRANTED',
          wasBlocked: false,
          trialDaysRequested: trialDays,
          trialDaysGranted: trialDays,
          subscriptionId,
          requestSource: requestSource || 'subscription_creation',
          metadata: {
            previousTrialCount: existingHistory.length,
            totalDaysAfterThis: newTotalDays,
          },
        },
      });
    });

    subscriptionLogger.info('Tier trial marked as used', {
      customerId,
      tierId,
      trialDays,
      totalTrials: updatedHistory.length,
    });
  }

  /**
   * Log a trial attempt (whether granted or blocked)
   *
   * Creates an audit trail for all trial requests.
   */
  static async logTrialAttempt(input: LogTrialAttemptInput): Promise<void> {
    const {
      shop,
      customerId,
      tierId,
      tierName,
      wasBlocked,
      blockReason,
      trialDaysRequested,
      trialDaysGranted,
      previousTierId,
      previousTierName,
      subscriptionId,
      requestSource,
      metadata,
    } = input;

    await db.tierTrialAuditLog.create({
      data: {
        shop,
        customerId,
        tierId,
        tierName,
        action: wasBlocked ? 'TRIAL_BLOCKED' : 'TRIAL_GRANTED',
        wasBlocked,
        blockReason,
        trialDaysRequested,
        trialDaysGranted,
        previousTierId,
        previousTierName,
        subscriptionId,
        requestSource,
        metadata: metadata as any,
      },
    });

    if (wasBlocked) {
      subscriptionLogger.info('Tier trial attempt blocked', {
        customerId,
        tierId,
        blockReason,
      });
    }
  }

  /**
   * Mark a trial as converted (customer became paying)
   *
   * Called when a trial subscription successfully bills for the first time.
   */
  static async markTrialConverted(
    shop: string,
    customerId: string,
    tierId: string,
    subscriptionId: string
  ): Promise<void> {
    const customer = await db.customer.findFirst({
      where: { id: customerId },
    });

    const history = this.parseTrialHistory(customer?.tierTrialHistory);
    const trialEntry = history.find((t: TierTrialHistoryEntry) => t.tierId === tierId && !t.converted);

    if (trialEntry) {
      trialEntry.converted = true;
      trialEntry.endedAt = new Date();

      await db.$transaction(async (tx: any) => {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            tierTrialHistory: history as any,
            updatedAt: new Date(),
          },
        });
        await tx.tierTrialAuditLog.create({
          data: {
            shop,
            customerId,
            tierId,
            tierName: trialEntry.tierName,
            action: 'TRIAL_CONVERTED',
            wasBlocked: false,
            trialDaysRequested: trialEntry.daysUsed,
            trialDaysGranted: trialEntry.daysUsed,
            subscriptionId,
            requestSource: 'billing_success',
          },
        });
      });

      subscriptionLogger.info('Tier trial converted to paid', {
        customerId,
        tierId,
        subscriptionId,
      });
    }
  }

  /**
   * Get trial abuse statistics for a shop
   * Note: Simplified implementation for Data API adapter compatibility
   */
  static async getAbuseStats(shop: string): Promise<{
    totalAttempts: number;
    blockedAttempts: number;
    grantedAttempts: number;
    blockRate: number;
    conversionRate: number;
    topBlockReasons: Array<{ reason: string; count: number }>;
    recentAbusers: Array<{ customerId: string; attempts: number; lastAttempt: Date }>;
  }> {
    // Get basic counts (supported by adapter)
    const [totalAttempts, blockedAttempts, conversions] = await Promise.all([
      db.tierTrialAuditLog.count({ where: { shop } }),
      db.tierTrialAuditLog.count({ where: { shop, wasBlocked: true } }),
      db.tierTrialAuditLog.count({ where: { shop, action: 'TRIAL_CONVERTED' } }),
    ]);

    const grantedAttempts = totalAttempts - blockedAttempts;

    // Get recent blocked attempts to analyze block reasons manually
    const recentBlocked = await db.tierTrialAuditLog.findMany({
      where: { shop, wasBlocked: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Aggregate block reasons manually
    const reasonCounts: Record<string, number> = {};
    for (const log of recentBlocked) {
      const reason = log.blockReason || 'UNKNOWN';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }
    const topBlockReasons = Object.entries(reasonCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalAttempts,
      blockedAttempts,
      grantedAttempts,
      blockRate: totalAttempts > 0 ? (blockedAttempts / totalAttempts) * 100 : 0,
      conversionRate: grantedAttempts > 0 ? (conversions / grantedAttempts) * 100 : 0,
      topBlockReasons,
      recentAbusers: [], // Simplified - would need raw SQL for proper groupBy
    };
  }

  /**
   * Get trial history for a specific customer
   */
  static async getCustomerTrialHistory(
    shop: string,
    customerId: string
  ): Promise<{
    customer: {
      hasUsedTierTrial: boolean;
      totalDaysUsed: number;
      remainingDays: number;
      firstTrialDate?: Date;
    };
    trials: TierTrialHistoryEntry[];
    auditLog: Array<{
      action: string;
      tierId: string;
      tierName: string;
      wasBlocked: boolean;
      blockReason?: string;
      trialDaysGranted: number;
      createdAt: Date;
    }>;
  }> {
    const [customer, auditLog] = await Promise.all([
      db.customer.findFirst({
        where: { id: customerId },
      }),
      db.tierTrialAuditLog.findMany({
        where: { shop, customerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          action: true,
          tierId: true,
          tierName: true,
          wasBlocked: true,
          blockReason: true,
          trialDaysGranted: true,
          createdAt: true,
        },
      }),
    ]);

    const trials = this.parseTrialHistory(customer?.tierTrialHistory);
    const remainingDays = TIER_TRIAL_CONFIG.maxLifetimeTrialDays - (customer?.totalTierTrialDaysUsed || 0);

    return {
      customer: {
        hasUsedTierTrial: customer?.hasUsedTierTrial || false,
        totalDaysUsed: customer?.totalTierTrialDaysUsed || 0,
        remainingDays: Math.max(0, remainingDays),
        firstTrialDate: customer?.firstTierTrialStartedAt || undefined,
      },
      trials,
      auditLog,
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Parse trial history JSON into typed array
   */
  private static parseTrialHistory(history: unknown): TierTrialHistoryEntry[] {
    if (!history || !Array.isArray(history)) {
      return [];
    }

    return history.map((entry: any) => ({
      tierId: entry.tierId || '',
      tierName: entry.tierName || 'Unknown',
      daysUsed: entry.daysUsed || 0,
      startedAt: entry.startedAt ? new Date(entry.startedAt) : new Date(),
      endedAt: entry.endedAt ? new Date(entry.endedAt) : undefined,
      converted: entry.converted || false,
    }));
  }

  /**
   * Build an ineligible result with consistent structure
   */
  private static buildIneligibleResult(
    requestedDays: number,
    reason: TierTrialBlockReason,
    previousTrials: TierTrialHistoryEntry[],
    customerStats: TierTrialEligibilityResult['customerTrialStats']
  ): TierTrialEligibilityResult {
    return {
      eligible: false,
      reason,
      reasonMessage: TIER_TRIAL_CONFIG.blockReasons[reason],
      trialDaysAvailable: 0,
      trialDaysRequested: requestedDays,
      previousTrials,
      customerTrialStats: customerStats,
    };
  }
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const checkTierTrialEligibility = TierTrialEligibilityService.checkEligibility.bind(
  TierTrialEligibilityService
);
export const markTierTrialUsed = TierTrialEligibilityService.markTrialUsed.bind(
  TierTrialEligibilityService
);
export const logTierTrialAttempt = TierTrialEligibilityService.logTrialAttempt.bind(
  TierTrialEligibilityService
);
export const markTierTrialConverted = TierTrialEligibilityService.markTrialConverted.bind(
  TierTrialEligibilityService
);
export const getTierTrialAbuseStats = TierTrialEligibilityService.getAbuseStats.bind(
  TierTrialEligibilityService
);
export const getCustomerTierTrialHistory = TierTrialEligibilityService.getCustomerTrialHistory.bind(
  TierTrialEligibilityService
);
