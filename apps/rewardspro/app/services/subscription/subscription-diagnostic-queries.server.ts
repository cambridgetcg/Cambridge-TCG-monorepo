/**
 * Subscription Diagnostic Queries
 *
 * Comprehensive audit and diagnostic queries for debugging subscription issues.
 * Provides deep insights into subscription state, billing patterns, and anomalies.
 *
 * Part of Neural Network Optimization - Debugging Infrastructure
 */

import { db } from "~/db.server";
import { subscriptionLogger } from "./subscription-correlation.server";
import { SUBSCRIPTION_NEURAL_CONFIG } from "./subscription-neural-config.server";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SubscriptionAuditReport {
  shop: string;
  generatedAt: Date;
  summary: {
    totalSubscriptions: number;
    activeSubscriptions: number;
    failedSubscriptions: number;
    cancelledSubscriptions: number;
    revenueAtRisk: number;
    healthScore: number; // 0-100
  };
  statusBreakdown: Record<string, number>;
  billingIntervalBreakdown: Record<string, number>;
  tierDistribution: Array<{ tierId: string; tierName: string; count: number }>;
  anomalies: AuditAnomaly[];
  recentActivity: RecentActivitySummary;
}

export interface AuditAnomaly {
  type: string;
  severity: "critical" | "warning" | "info";
  description: string;
  affectedCount: number;
  subscriptionIds?: string[];
}

export interface RecentActivitySummary {
  createdLast24h: number;
  createdLast7d: number;
  cancelledLast24h: number;
  cancelledLast7d: number;
  failedBillingLast24h: number;
  failedBillingLast7d: number;
  recoveredLast7d: number;
}

export interface CustomerSubscriptionHistory {
  customerId: string;
  customerEmail: string;
  subscriptions: Array<{
    id: string;
    status: string;
    tierName: string;
    startDate: Date;
    endDate: Date | null;
    billingInterval: string;
    totalBilled: number;
    failureCount: number;
    durationDays: number;
  }>;
  summary: {
    totalSubscriptions: number;
    activeSubscriptions: number;
    totalSpent: number;
    longestSubscriptionDays: number;
    churnCount: number;
    currentTier: string | null;
  };
}

export interface BillingHealthReport {
  shop: string;
  period: { start: Date; end: Date };
  metrics: {
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    successRate: number;
    totalRevenue: number;
    averageAmount: number;
  };
  failureAnalysis: {
    byErrorCode: Record<string, number>;
    byErrorMessage: Record<string, number>;
    topFailingSubscriptions: Array<{
      subscriptionId: string;
      customerId: string;
      failureCount: number;
      lastFailure: Date;
    }>;
  };
  trends: Array<{
    date: string;
    successCount: number;
    failureCount: number;
    revenue: number;
  }>;
}

// ============================================================================
// DIAGNOSTIC QUERIES SERVICE
// ============================================================================

export class SubscriptionDiagnosticQueries {
  /**
   * Generate comprehensive audit report for a shop
   */
  static async generateAuditReport(shop: string): Promise<SubscriptionAuditReport> {
    subscriptionLogger.operationStart("generateAuditReport", { shop });

    const generatedAt = new Date();

    // Run all queries in parallel for efficiency
    const [
      totalStats,
      statusBreakdown,
      billingIntervalBreakdown,
      tierDistribution,
      anomalies,
      recentActivity,
    ] = await Promise.all([
      this.getTotalStats(shop),
      this.getStatusBreakdown(shop),
      this.getBillingIntervalBreakdown(shop),
      this.getTierDistribution(shop),
      this.detectAnomalies(shop),
      this.getRecentActivity(shop),
    ]);

    // Calculate health score
    const healthScore = this.calculateHealthScore(totalStats, anomalies, recentActivity);

    const report: SubscriptionAuditReport = {
      shop,
      generatedAt,
      summary: {
        ...totalStats,
        healthScore,
      },
      statusBreakdown,
      billingIntervalBreakdown,
      tierDistribution,
      anomalies,
      recentActivity,
    };

    subscriptionLogger.operationComplete("generateAuditReport", {
      healthScore,
      anomalyCount: anomalies.length,
    });

    return report;
  }

  /**
   * Get customer subscription history
   */
  static async getCustomerHistory(
    shop: string,
    customerId: string
  ): Promise<CustomerSubscriptionHistory | null> {
    const customer = await db.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer || customer.shop !== shop) {
      return null;
    }

    const subscriptions = await db.tierSubscription.findMany({
      where: { shop, customerId },
      include: { tier: true },
      orderBy: { createdAt: "desc" },
    });

    const billingAttempts = await db.subscriptionBillingAttempt.findMany({
      where: { subscriptionId: { in: subscriptions.map((s) => s.id) } },
    });

    // Group billing by subscription
    const billingBySubscription = new Map<string, typeof billingAttempts>();
    for (const attempt of billingAttempts) {
      const existing = billingBySubscription.get(attempt.subscriptionId) || [];
      existing.push(attempt);
      billingBySubscription.set(attempt.subscriptionId, existing);
    }

    const now = new Date();
    const subscriptionDetails = subscriptions.map((sub) => {
      const attempts = billingBySubscription.get(sub.id) || [];
      const successfulAttempts = attempts.filter((a) => a.status === "SUCCESS");
      const totalBilled = successfulAttempts.reduce(
        (sum, a) => sum + (Number(a.amount) || 0),
        0
      );

      const endDate = sub.endDate || (sub.status === "ACTIVE" ? null : sub.updatedAt);
      const durationMs = (endDate || now).getTime() - sub.createdAt.getTime();
      const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));

      return {
        id: sub.id,
        status: sub.status,
        tierName: sub.tier?.name || "Unknown",
        startDate: sub.startDate || sub.createdAt,
        endDate: sub.endDate,
        billingInterval: sub.billingInterval,
        totalBilled,
        failureCount: sub.failureCount || 0,
        durationDays,
      };
    });

    const activeSubscriptions = subscriptions.filter((s) => s.status === "ACTIVE");
    const totalSpent = subscriptionDetails.reduce((sum, s) => sum + s.totalBilled, 0);
    const longestSubscriptionDays = Math.max(
      ...subscriptionDetails.map((s) => s.durationDays),
      0
    );
    const churnCount = subscriptions.filter(
      (s) => s.status === "CANCELLED" || s.status === "EXPIRED"
    ).length;

    // Get current tier
    const currentActiveSub = activeSubscriptions[0];
    const currentTier = currentActiveSub
      ? subscriptions.find((s) => s.id === currentActiveSub.id)?.tier?.name || null
      : null;

    return {
      customerId,
      customerEmail: customer.email || "",
      subscriptions: subscriptionDetails,
      summary: {
        totalSubscriptions: subscriptions.length,
        activeSubscriptions: activeSubscriptions.length,
        totalSpent,
        longestSubscriptionDays,
        churnCount,
        currentTier,
      },
    };
  }

  /**
   * Generate billing health report
   */
  static async getBillingHealthReport(
    shop: string,
    daysBack: number = 30
  ): Promise<BillingHealthReport> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - daysBack * 24 * 60 * 60 * 1000);

    // Get all subscriptions for the shop
    const subscriptions = await db.tierSubscription.findMany({
      where: { shop },
      select: { id: true, customerId: true },
    });

    const subscriptionIds = subscriptions.map((s) => s.id);

    // Get billing attempts in range
    const attempts = await db.subscriptionBillingAttempt.findMany({
      where: {
        subscriptionId: { in: subscriptionIds },
        billingDate: { gte: startDate, lte: endDate },
      },
      orderBy: { billingDate: "asc" },
    });

    const successful = attempts.filter((a) => a.status === "SUCCESS");
    const failed = attempts.filter((a) => a.status === "FAILED");

    const totalRevenue = successful.reduce(
      (sum, a) => sum + (Number(a.amount) || 0),
      0
    );
    const averageAmount =
      successful.length > 0 ? totalRevenue / successful.length : 0;

    // Failure analysis
    const byErrorCode: Record<string, number> = {};
    const byErrorMessage: Record<string, number> = {};

    for (const failure of failed) {
      const code = failure.errorCode || "UNKNOWN";
      const message = failure.errorMessage || "Unknown error";
      byErrorCode[code] = (byErrorCode[code] || 0) + 1;
      byErrorMessage[message] = (byErrorMessage[message] || 0) + 1;
    }

    // Top failing subscriptions
    const failuresBySubscription = new Map<string, number>();
    const lastFailureBySubscription = new Map<string, Date>();

    for (const failure of failed) {
      const current = failuresBySubscription.get(failure.subscriptionId) || 0;
      failuresBySubscription.set(failure.subscriptionId, current + 1);
      const lastDate = lastFailureBySubscription.get(failure.subscriptionId);
      if (!lastDate || failure.billingDate > lastDate) {
        lastFailureBySubscription.set(failure.subscriptionId, failure.billingDate);
      }
    }

    const subscriptionMap = new Map(subscriptions.map((s) => [s.id, s]));
    const topFailingSubscriptions = Array.from(failuresBySubscription.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([subId, count]) => ({
        subscriptionId: subId,
        customerId: subscriptionMap.get(subId)?.customerId || "",
        failureCount: count,
        lastFailure: lastFailureBySubscription.get(subId) || new Date(),
      }));

    // Daily trends
    const trendMap = new Map<string, { success: number; failure: number; revenue: number }>();

    for (const attempt of attempts) {
      const dateKey = attempt.billingDate.toISOString().split("T")[0];
      const existing = trendMap.get(dateKey) || { success: 0, failure: 0, revenue: 0 };

      if (attempt.status === "SUCCESS") {
        existing.success++;
        existing.revenue += Number(attempt.amount) || 0;
      } else {
        existing.failure++;
      }

      trendMap.set(dateKey, existing);
    }

    const trends = Array.from(trendMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => ({
        date,
        successCount: data.success,
        failureCount: data.failure,
        revenue: data.revenue,
      }));

    return {
      shop,
      period: { start: startDate, end: endDate },
      metrics: {
        totalAttempts: attempts.length,
        successfulAttempts: successful.length,
        failedAttempts: failed.length,
        successRate:
          attempts.length > 0 ? (successful.length / attempts.length) * 100 : 100,
        totalRevenue,
        averageAmount,
      },
      failureAnalysis: {
        byErrorCode,
        byErrorMessage,
        topFailingSubscriptions,
      },
      trends,
    };
  }

  /**
   * Find subscriptions approaching renewal
   */
  static async findUpcomingRenewals(
    shop: string,
    daysAhead: number = 7
  ): Promise<
    Array<{
      subscriptionId: string;
      customerId: string;
      customerEmail: string;
      tierName: string;
      nextBillingDate: Date;
      daysUntilRenewal: number;
      amount: number;
    }>
  > {
    const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

    const subscriptions = await db.tierSubscription.findMany({
      where: {
        shop,
        status: "ACTIVE",
        nextBillingDate: { lte: futureDate, gte: new Date() },
      },
      include: { customer: true, tier: true },
      orderBy: { nextBillingDate: "asc" },
    });

    return subscriptions.map((sub) => {
      const daysUntil = sub.nextBillingDate
        ? Math.ceil(
            (sub.nextBillingDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          )
        : 0;

      return {
        subscriptionId: sub.id,
        customerId: sub.customerId,
        customerEmail: sub.customer?.email || "",
        tierName: sub.tier?.name || "Unknown",
        nextBillingDate: sub.nextBillingDate || new Date(),
        daysUntilRenewal: daysUntil,
        amount: Number(sub.currentPrice) || 0,
      };
    });
  }

  /**
   * Find subscriptions in grace period
   */
  static async findSubscriptionsInGracePeriod(
    shop: string
  ): Promise<
    Array<{
      subscriptionId: string;
      customerId: string;
      failureCount: number;
      gracePeriodEnds: Date | null;
      hoursRemaining: number;
    }>
  > {
    const subscriptions = await db.tierSubscription.findMany({
      where: {
        shop,
        status: "FAILED",
      },
      select: {
        id: true,
        customerId: true,
        failureCount: true,
        metadata: true,
        updatedAt: true,
      },
    });

    const now = new Date();
    const gracePeriodMs = SUBSCRIPTION_NEURAL_CONFIG.gracePeriod.hours * 60 * 60 * 1000;

    return subscriptions
      .map((sub) => {
        const metadata = sub.metadata as Record<string, unknown> | null;
        let gracePeriodEnds: Date | null = null;

        if (metadata?.gracePeriodEnd) {
          gracePeriodEnds = new Date(metadata.gracePeriodEnd as string);
        } else {
          // Calculate based on last update
          gracePeriodEnds = new Date(sub.updatedAt.getTime() + gracePeriodMs);
        }

        const hoursRemaining = gracePeriodEnds
          ? Math.max(
              0,
              (gracePeriodEnds.getTime() - now.getTime()) / (1000 * 60 * 60)
            )
          : 0;

        return {
          subscriptionId: sub.id,
          customerId: sub.customerId,
          failureCount: sub.failureCount || 0,
          gracePeriodEnds,
          hoursRemaining: Math.round(hoursRemaining * 10) / 10,
        };
      })
      .filter((s) => s.hoursRemaining > 0);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════════════════

  private static async getTotalStats(shop: string) {
    const [total, active, failed, cancelled] = await Promise.all([
      db.tierSubscription.count({ where: { shop } }),
      db.tierSubscription.count({ where: { shop, status: "ACTIVE" } }),
      db.tierSubscription.count({ where: { shop, status: "FAILED" } }),
      db.tierSubscription.count({ where: { shop, status: "CANCELLED" } }),
    ]);

    // Calculate revenue at risk (failed subscriptions)
    const failedSubscriptions = await db.tierSubscription.findMany({
      where: { shop, status: "FAILED" },
      select: { currentPrice: true },
    });

    const revenueAtRisk = failedSubscriptions.reduce(
      (sum, s) => sum + (Number(s.currentPrice) || 0),
      0
    );

    return {
      totalSubscriptions: total,
      activeSubscriptions: active,
      failedSubscriptions: failed,
      cancelledSubscriptions: cancelled,
      revenueAtRisk,
    };
  }

  private static async getStatusBreakdown(shop: string): Promise<Record<string, number>> {
    // DATA API COMPATIBLE: groupBy is not supported by Aurora Data API adapter
    // Fetch status for all subscriptions and count in memory
    const subscriptions = await db.tierSubscription.findMany({
      where: { shop },
      select: { status: true },
    });

    const result: Record<string, number> = {};
    for (const sub of subscriptions) {
      result[sub.status] = (result[sub.status] || 0) + 1;
    }
    return result;
  }

  private static async getBillingIntervalBreakdown(
    shop: string
  ): Promise<Record<string, number>> {
    // DATA API COMPATIBLE: groupBy is not supported by Aurora Data API adapter
    // Fetch billingInterval for all subscriptions and count in memory
    const subscriptions = await db.tierSubscription.findMany({
      where: { shop },
      select: { billingInterval: true },
    });

    const result: Record<string, number> = {};
    for (const sub of subscriptions) {
      result[sub.billingInterval] = (result[sub.billingInterval] || 0) + 1;
    }
    return result;
  }

  private static async getTierDistribution(
    shop: string
  ): Promise<Array<{ tierId: string; tierName: string; count: number }>> {
    // DATA API COMPATIBLE: groupBy is not supported by Aurora Data API adapter
    // Fetch tierId for all subscriptions and count in memory
    const subscriptions = await db.tierSubscription.findMany({
      where: { shop },
      select: { tierId: true },
    });

    // Count by tierId in memory
    const tierCounts = new Map<string, number>();
    for (const sub of subscriptions) {
      tierCounts.set(sub.tierId, (tierCounts.get(sub.tierId) || 0) + 1);
    }

    const tierIds = Array.from(tierCounts.keys());
    const tiers = await db.tier.findMany({
      where: { id: { in: tierIds } },
      select: { id: true, name: true },
    });

    const tierMap = new Map(tiers.map((t) => [t.id, t.name]));

    return tierIds.map((tierId) => ({
      tierId,
      tierName: tierMap.get(tierId) || "Unknown",
      count: tierCounts.get(tierId) || 0,
    }));
  }

  private static async detectAnomalies(shop: string): Promise<AuditAnomaly[]> {
    const anomalies: AuditAnomaly[] = [];

    // 1. Subscriptions without Shopify contract ID
    const noContractId = await db.tierSubscription.count({
      where: { shop, shopifyContractId: null, status: "ACTIVE" },
    });
    if (noContractId > 0) {
      anomalies.push({
        type: "MISSING_CONTRACT_ID",
        severity: "warning",
        description: "Active subscriptions without Shopify contract ID",
        affectedCount: noContractId,
      });
    }

    // 2. Duplicate contract IDs
    const duplicates = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM (
        SELECT "shopifyContractId"
        FROM "TierSubscription"
        WHERE shop = ${shop} AND "shopifyContractId" IS NOT NULL
        GROUP BY "shopifyContractId"
        HAVING COUNT(*) > 1
      ) as dupes
    `;
    if (duplicates[0] && Number(duplicates[0].count) > 0) {
      anomalies.push({
        type: "DUPLICATE_CONTRACT_ID",
        severity: "critical",
        description: "Multiple subscriptions share the same Shopify contract ID",
        affectedCount: Number(duplicates[0].count),
      });
    }

    // 3. Stale FAILED subscriptions (> 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const staleFailed = await db.tierSubscription.count({
      where: { shop, status: "FAILED", updatedAt: { lt: sevenDaysAgo } },
    });
    if (staleFailed > 0) {
      anomalies.push({
        type: "STALE_FAILED_SUBSCRIPTIONS",
        severity: "warning",
        description: "Failed subscriptions not resolved for over 7 days",
        affectedCount: staleFailed,
      });
    }

    // 4. Active subscriptions past next billing date
    const pastDue = await db.tierSubscription.count({
      where: {
        shop,
        status: "ACTIVE",
        nextBillingDate: { lt: new Date() },
      },
    });
    if (pastDue > 0) {
      anomalies.push({
        type: "PAST_DUE_ACTIVE",
        severity: "warning",
        description: "Active subscriptions past their billing date without billing record",
        affectedCount: pastDue,
      });
    }

    // 5. High failure rate (> 20%)
    const totalActive = await db.tierSubscription.count({
      where: { shop, status: { in: ["ACTIVE", "FAILED"] } },
    });
    const failedCount = await db.tierSubscription.count({
      where: { shop, status: "FAILED" },
    });

    if (totalActive > 0 && failedCount / totalActive > 0.2) {
      anomalies.push({
        type: "HIGH_FAILURE_RATE",
        severity: "critical",
        description: `Failure rate exceeds 20% (${Math.round((failedCount / totalActive) * 100)}%)`,
        affectedCount: failedCount,
      });
    }

    // 6. Subscriptions with excessive failures (> max retry)
    const maxRetries = SUBSCRIPTION_NEURAL_CONFIG.dunning.maxRetryAttempts;
    const excessiveFailures = await db.tierSubscription.count({
      where: { shop, failureCount: { gt: maxRetries } },
    });
    if (excessiveFailures > 0) {
      anomalies.push({
        type: "EXCESSIVE_FAILURES",
        severity: "info",
        description: `Subscriptions with failure count exceeding max retries (${maxRetries})`,
        affectedCount: excessiveFailures,
      });
    }

    return anomalies;
  }

  private static async getRecentActivity(shop: string): Promise<RecentActivitySummary> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get subscription IDs for billing queries
    const subscriptionIds = await db.tierSubscription
      .findMany({
        where: { shop },
        select: { id: true },
      })
      .then((subs) => subs.map((s) => s.id));

    const [
      createdLast24h,
      createdLast7d,
      cancelledLast24h,
      cancelledLast7d,
      failedBillingLast24h,
      failedBillingLast7d,
      recoveredLast7d,
    ] = await Promise.all([
      db.tierSubscription.count({
        where: { shop, createdAt: { gte: oneDayAgo } },
      }),
      db.tierSubscription.count({
        where: { shop, createdAt: { gte: sevenDaysAgo } },
      }),
      db.tierSubscription.count({
        where: {
          shop,
          status: { in: ["CANCELLED", "EXPIRED"] },
          updatedAt: { gte: oneDayAgo },
        },
      }),
      db.tierSubscription.count({
        where: {
          shop,
          status: { in: ["CANCELLED", "EXPIRED"] },
          updatedAt: { gte: sevenDaysAgo },
        },
      }),
      db.subscriptionBillingAttempt.count({
        where: {
          subscriptionId: { in: subscriptionIds },
          status: "FAILED",
          createdAt: { gte: oneDayAgo },
        },
      }),
      db.subscriptionBillingAttempt.count({
        where: {
          subscriptionId: { in: subscriptionIds },
          status: "FAILED",
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      // Recovered = was FAILED, now ACTIVE, updated in last 7 days
      db.tierSubscription.count({
        where: {
          shop,
          status: "ACTIVE",
          updatedAt: { gte: sevenDaysAgo },
          metadata: { path: ["lastStatusChange", "from"], equals: "FAILED" },
        },
      }),
    ]);

    return {
      createdLast24h,
      createdLast7d,
      cancelledLast24h,
      cancelledLast7d,
      failedBillingLast24h,
      failedBillingLast7d,
      recoveredLast7d,
    };
  }

  private static calculateHealthScore(
    stats: Awaited<ReturnType<typeof this.getTotalStats>>,
    anomalies: AuditAnomaly[],
    activity: RecentActivitySummary
  ): number {
    let score = 100;

    // Deduct for failure rate
    if (stats.totalSubscriptions > 0) {
      const failureRate = stats.failedSubscriptions / stats.totalSubscriptions;
      score -= failureRate * 50; // Max -50 for high failure rate
    }

    // Deduct for critical anomalies
    const criticalCount = anomalies.filter((a) => a.severity === "critical").length;
    const warningCount = anomalies.filter((a) => a.severity === "warning").length;
    score -= criticalCount * 15;
    score -= warningCount * 5;

    // Deduct for recent cancellation spike
    if (activity.createdLast7d > 0) {
      const cancelRate = activity.cancelledLast7d / activity.createdLast7d;
      if (cancelRate > 0.3) {
        score -= 10;
      }
    }

    // Bonus for recoveries
    if (activity.recoveredLast7d > 0) {
      score += Math.min(activity.recoveredLast7d * 2, 10);
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const generateAuditReport = SubscriptionDiagnosticQueries.generateAuditReport.bind(
  SubscriptionDiagnosticQueries
);
export const getCustomerSubscriptionHistory =
  SubscriptionDiagnosticQueries.getCustomerHistory.bind(SubscriptionDiagnosticQueries);
export const getBillingHealthReport = SubscriptionDiagnosticQueries.getBillingHealthReport.bind(
  SubscriptionDiagnosticQueries
);
export const findUpcomingRenewals = SubscriptionDiagnosticQueries.findUpcomingRenewals.bind(
  SubscriptionDiagnosticQueries
);
export const findSubscriptionsInGracePeriod =
  SubscriptionDiagnosticQueries.findSubscriptionsInGracePeriod.bind(
    SubscriptionDiagnosticQueries
  );
