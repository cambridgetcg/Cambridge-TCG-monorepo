/**
 * Points Analytics API
 *
 * Provides comprehensive analytics for the Points Engagement System.
 * Used by the merchant dashboard to monitor points economy health,
 * track engagement metrics, and identify optimization opportunities.
 *
 * Endpoint: GET /api/points-analytics
 *
 * @security Requires authenticated Shopify admin session
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { calculateEconomyHealth } from "~/services/points-maintenance.server";
import { getBonusEvents, getActiveEvents } from "~/services/points-bonus-events.server";
import { getRedemptionTiers } from "~/services/points-redemption.server";

// ============================================
// TYPES
// ============================================

interface PointsAnalytics {
  overview: {
    totalPointsInCirculation: number;
    totalPointsEarnedAllTime: number;
    totalPointsRedeemedAllTime: number;
    totalPointsExpiredAllTime: number;
    averagePointsPerCustomer: number;
    customersWithPoints: number;
    totalCustomers: number;
  };
  economy: {
    healthScore: number;
    healthStatus: "healthy" | "warning" | "critical";
    circulationRatio: number;
    redemptionRate: number;
    expirationRate: number;
    velocityScore: number;
    recommendations: string[];
  };
  engagement: {
    last30Days: {
      pointsEarned: number;
      pointsRedeemed: number;
      transactionCount: number;
      uniqueCustomers: number;
    };
    last7Days: {
      pointsEarned: number;
      pointsRedeemed: number;
      transactionCount: number;
      uniqueCustomers: number;
    };
    streakMetrics: {
      activeStreaks: number;
      averageStreakLength: number;
      longestActiveStreak: number;
    };
  };
  redemption: {
    byTier: Array<{
      tierId: string;
      tierName: string;
      redemptionCount: number;
      totalPointsRedeemed: number;
      averageDiscount: number;
    }>;
    conversionRate: number;
    averageRedemptionValue: number;
  };
  bonusEvents: {
    activeEvents: Array<{
      id: string;
      name: string;
      multiplier: number;
      endsAt: string;
    }>;
    upcomingEvents: Array<{
      id: string;
      name: string;
      multiplier: number;
      startsAt: string;
    }>;
    recentEventPerformance: Array<{
      eventName: string;
      totalPointsAwarded: number;
      ordersAffected: number;
      bonusPointsGenerated: number;
    }>;
  };
  tierBreakdown: Array<{
    tierId: string;
    tierName: string;
    customerCount: number;
    totalPoints: number;
    averagePoints: number;
    multiplier: number;
  }>;
  trends: {
    monthlyData: Array<{
      month: string;
      pointsEarned: number;
      pointsRedeemed: number;
      pointsExpired: number;
      netChange: number;
    }>;
  };
}

// ============================================
// LOADER
// ============================================

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const analytics = await getPointsAnalytics(shop);
    return json({ success: true, analytics });
  } catch (error: any) {
    console.error("[PointsAnalytics] Error:", error);
    return json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// ============================================
// ANALYTICS FUNCTIONS
// ============================================

async function getPointsAnalytics(shop: string): Promise<PointsAnalytics> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  // Parallel fetch all data
  const [
    economyHealth,
    overviewData,
    last30DaysData,
    last7DaysData,
    streakData,
    redemptionData,
    bonusEvents,
    activeEvents,
    tierData,
    monthlyTrends,
  ] = await Promise.all([
    calculateEconomyHealth(shop),
    getOverviewData(shop),
    getEngagementPeriodData(shop, thirtyDaysAgo, now),
    getEngagementPeriodData(shop, sevenDaysAgo, now),
    getStreakMetrics(shop),
    getRedemptionAnalytics(shop),
    getBonusEvents(shop, { includeExpired: false, includeInactive: false }),
    getActiveEvents(shop),
    getTierBreakdown(shop),
    getMonthlyTrends(shop, sixMonthsAgo),
  ]);

  // Separate active and upcoming events
  const upcomingEvents = bonusEvents.filter((e) => e.startsAt > now);
  const currentlyActiveEvents = activeEvents.events;

  return {
    overview: overviewData,
    economy: {
      healthScore: economyHealth.overallScore,
      healthStatus: getHealthStatus(economyHealth.overallScore),
      circulationRatio: economyHealth.circulationRatio,
      redemptionRate: economyHealth.redemptionRate,
      expirationRate: economyHealth.expirationRate,
      velocityScore: economyHealth.velocityScore,
      recommendations: economyHealth.recommendations,
    },
    engagement: {
      last30Days: last30DaysData,
      last7Days: last7DaysData,
      streakMetrics: streakData,
    },
    redemption: redemptionData,
    bonusEvents: {
      activeEvents: currentlyActiveEvents.map((e) => ({
        id: e.id,
        name: e.name,
        multiplier: e.multiplier,
        endsAt: e.endsAt.toISOString(),
      })),
      upcomingEvents: upcomingEvents.map((e) => ({
        id: e.id,
        name: e.name,
        multiplier: e.multiplier,
        startsAt: e.startsAt.toISOString(),
      })),
      recentEventPerformance: [], // Would need event tracking in ledger
    },
    tierBreakdown: tierData,
    trends: {
      monthlyData: monthlyTrends,
    },
  };
}

async function getOverviewData(shop: string) {
  // Get customer totals
  // DATA API COMPATIBLE: groupBy is not supported by Aurora Data API adapter
  // Instead, fetch type and amount fields and aggregate in memory
  const [customerStats, ledgerEntries] = await Promise.all([
    db.customer.aggregate({
      where: { shop },
      _sum: { pointsBalance: true, lifetimePoints: true },
      _count: true,
      _avg: { pointsBalance: true },
    }),
    db.pointsLedger.findMany({
      where: { shop },
      select: { type: true, amount: true },
    }),
  ]);

  // Aggregate by type in memory (replaces groupBy + _sum)
  const ledgerStatsByType: Record<string, number> = {};
  for (const entry of ledgerEntries) {
    ledgerStatsByType[entry.type] = (ledgerStatsByType[entry.type] || 0) + entry.amount;
  }

  // Count customers with positive balance
  const customersWithPoints = await db.customer.count({
    where: { shop, pointsBalance: { gt: 0 } },
  });

  // Calculate totals from ledger
  const earnTypes = [
    "PURCHASE",
    "REFERRAL_BONUS",
    "SIGN_UP_BONUS",
    "BIRTHDAY_BONUS",
    "TIER_UPGRADE_BONUS",
    "MANUAL_ADJUSTMENT",
    "BONUS_EVENT",
    "STREAK_BONUS",
  ];

  const redeemTypes = ["REDEMPTION"];
  const expireTypes = ["EXPIRATION"];

  const totalEarned = Object.entries(ledgerStatsByType)
    .filter(([type]) => earnTypes.includes(type))
    .reduce((sum, [, amount]) => sum + amount, 0);

  const totalRedeemed = Math.abs(
    Object.entries(ledgerStatsByType)
      .filter(([type]) => redeemTypes.includes(type))
      .reduce((sum, [, amount]) => sum + amount, 0)
  );

  const totalExpired = Math.abs(
    Object.entries(ledgerStatsByType)
      .filter(([type]) => expireTypes.includes(type))
      .reduce((sum, [, amount]) => sum + amount, 0)
  );

  return {
    totalPointsInCirculation: customerStats._sum.amountBalance || 0,
    totalPointsEarnedAllTime: totalEarned,
    totalPointsRedeemedAllTime: totalRedeemed,
    totalPointsExpiredAllTime: totalExpired,
    averagePointsPerCustomer: Math.round(customerStats._avg.pointsBalance || 0),
    customersWithPoints,
    totalCustomers: customerStats._count,
  };
}

async function getEngagementPeriodData(shop: string, startDate: Date, endDate: Date) {
  const earnTypes = [
    "PURCHASE",
    "REFERRAL_BONUS",
    "SIGN_UP_BONUS",
    "BIRTHDAY_BONUS",
    "TIER_UPGRADE_BONUS",
    "MANUAL_ADJUSTMENT",
    "BONUS_EVENT",
    "STREAK_BONUS",
  ];

  // DATA API COMPATIBLE: groupBy is not supported by Aurora Data API adapter
  // Replace with findMany and count in memory
  const [earnedData, redeemedData, transactionEntries] = await Promise.all([
    db.pointsLedger.aggregate({
      where: {
        shop,
        createdAt: { gte: startDate, lte: endDate },
        type: { in: earnTypes },
      },
      _sum: { amount: true },
    }),
    db.pointsLedger.aggregate({
      where: {
        shop,
        createdAt: { gte: startDate, lte: endDate },
        type: "REDEMPTION",
      },
      _sum: { amount: true },
    }),
    db.pointsLedger.findMany({
      where: {
        shop,
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { customerId: true },
    }),
  ]);

  // Count total transactions and unique customers in memory
  const transactionCount = transactionEntries.length;
  const uniqueCustomerIds = new Set(transactionEntries.map(e => e.customerId));

  return {
    pointsEarned: earnedData._sum.amount || 0,
    pointsRedeemed: Math.abs(redeemedData._sum.amount || 0),
    transactionCount,
    uniqueCustomers: uniqueCustomerIds.size,
  };
}

async function getStreakMetrics(shop: string) {
  // Get customers with active streaks from metadata
  const customersWithStreaks = await db.customer.findMany({
    where: {
      shop,
      metadata: { path: ["streak", "currentStreak"], gte: 1 },
    },
    select: { metadata: true },
  });

  const streaks = customersWithStreaks
    .map((c) => {
      const metadata = c.metadata as Record<string, any> | null;
      return metadata?.streak?.currentStreak || 0;
    })
    .filter((s) => s > 0);

  const activeStreaks = streaks.length;
  const averageStreakLength = activeStreaks > 0
    ? Math.round(streaks.reduce((a, b) => a + b, 0) / activeStreaks)
    : 0;
  const longestActiveStreak = activeStreaks > 0 ? Math.max(...streaks) : 0;

  return {
    activeStreaks,
    averageStreakLength,
    longestActiveStreak,
  };
}

async function getRedemptionAnalytics(shop: string) {
  // Get redemption tiers
  const tiers = await getRedemptionTiers(shop);

  // Get redemption transactions grouped by tier
  const redemptions = await db.pointsLedger.findMany({
    where: { shop, type: "REDEMPTION" },
    select: { points: true, metadata: true },
  });

  // Calculate tier-level stats
  const tierStats = new Map<string, { count: number; points: number; discount: number }>();

  for (const redemption of redemptions) {
    const metadata = redemption.metadata as Record<string, any> | null;
    const tierId = metadata?.redemptionTierId || "unknown";
    const discountValue = metadata?.discountValue || 0;

    const current = tierStats.get(tierId) || { count: 0, points: 0, discount: 0 };
    tierStats.set(tierId, {
      count: current.count + 1,
      points: current.points + Math.abs(redemption.points),
      discount: current.discount + discountValue,
    });
  }

  const byTier = tiers.map((tier) => {
    const stats = tierStats.get(tier.id) || { count: 0, points: 0, discount: 0 };
    return {
      tierId: tier.id,
      tierName: tier.name,
      redemptionCount: stats.count,
      totalPointsRedeemed: stats.points,
      averageDiscount: stats.count > 0 ? stats.discount / stats.count : 0,
    };
  });

  // Calculate overall stats
  const totalRedemptions = redemptions.length;
  const totalPoints = redemptions.reduce((sum, r) => sum + Math.abs(r.points), 0);
  const totalDiscount = redemptions.reduce((sum, r) => {
    const metadata = r.metadata as Record<string, any> | null;
    return sum + (metadata?.discountValue || 0);
  }, 0);

  // Get customers who have ever earned points
  const customersWithHistory = await db.customer.count({
    where: { shop, lifetimePoints: { gt: 0 } },
  });

  // Get customers who have redeemed
  // DATA API COMPATIBLE: groupBy is not supported by Aurora Data API adapter
  // Instead, fetch customerIds and count distinct in memory
  const redemptionEntries = await db.pointsLedger.findMany({
    where: { shop, type: "REDEMPTION" },
    select: { customerId: true },
  });
  const uniqueRedeemers = new Set(redemptionEntries.map(e => e.customerId));

  const conversionRate = customersWithHistory > 0
    ? (uniqueRedeemers.size / customersWithHistory) * 100
    : 0;

  return {
    byTier,
    conversionRate: Math.round(conversionRate * 10) / 10,
    averageRedemptionValue: totalRedemptions > 0
      ? Math.round(totalDiscount / totalRedemptions * 100) / 100
      : 0,
  };
}

async function getTierBreakdown(shop: string) {
  const tiers = await db.tier.findMany({
    where: { shop },
    select: {
      id: true,
      name: true,
      pointsMultiplier: true,
      _count: { select: { customers: true } },
    },
  });

  const tierBreakdown = await Promise.all(
    tiers.map(async (tier) => {
      const stats = await db.customer.aggregate({
        where: { shop, tierId: tier.id },
        _sum: { pointsBalance: true },
        _avg: { pointsBalance: true },
      });

      return {
        tierId: tier.id,
        tierName: tier.name,
        customerCount: tier._count.customers,
        totalPoints: stats._sum.amountBalance || 0,
        averagePoints: Math.round(stats._avg.pointsBalance || 0),
        multiplier: tier.pointsMultiplier || 1.0,
      };
    })
  );

  return tierBreakdown;
}

async function getMonthlyTrends(shop: string, startDate: Date) {
  // Get all ledger entries since start date
  const entries = await db.pointsLedger.findMany({
    where: {
      shop,
      createdAt: { gte: startDate },
    },
    select: { type: true, points: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Group by month
  const monthlyData = new Map<string, { earned: number; redeemed: number; expired: number }>();

  const earnTypes = [
    "PURCHASE",
    "REFERRAL_BONUS",
    "SIGN_UP_BONUS",
    "BIRTHDAY_BONUS",
    "TIER_UPGRADE_BONUS",
    "MANUAL_ADJUSTMENT",
    "BONUS_EVENT",
    "STREAK_BONUS",
  ];

  for (const entry of entries) {
    const monthKey = `${entry.createdAt.getFullYear()}-${String(entry.createdAt.getMonth() + 1).padStart(2, "0")}`;

    const current = monthlyData.get(monthKey) || { earned: 0, redeemed: 0, expired: 0 };

    if (earnTypes.includes(entry.type)) {
      current.earned += entry.points;
    } else if (entry.type === "REDEMPTION") {
      current.redeemed += Math.abs(entry.points);
    } else if (entry.type === "EXPIRATION") {
      current.expired += Math.abs(entry.points);
    }

    monthlyData.set(monthKey, current);
  }

  // Convert to array
  return Array.from(monthlyData.entries())
    .map(([month, data]) => ({
      month,
      pointsEarned: data.earned,
      pointsRedeemed: data.redeemed,
      pointsExpired: data.expired,
      netChange: data.earned - data.redeemed - data.expired,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function getHealthStatus(score: number): "healthy" | "warning" | "critical" {
  if (score >= 70) return "healthy";
  if (score >= 40) return "warning";
  return "critical";
}
