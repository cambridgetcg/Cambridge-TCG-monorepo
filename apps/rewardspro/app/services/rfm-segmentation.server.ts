/**
 * RFM Segmentation Service
 * Optimized customer segmentation with caching
 * Combines 8+ queries into efficient batched operations
 */

import db from "../db.server";
import { getCachedOrCompute } from "~/utils/analytics-cache.server";

// Types
export interface RFMSegments {
  champions: number;
  loyalCustomers: number;
  potentialLoyalists: number;
  newCustomers: number;
  promising: number;
  needsAttention: number;
  aboutToSleep: number;
  atRisk: number;
  cantLoseThem: number;
  hibernating: number;
  lost: number;
}

export interface EngagementMetrics {
  activeRate: number;
  dormantRate: number;
  churnRiskRate: number;
  avgDaysBetweenOrders: number;
  avgDaysSinceLastOrder: number;
  redemptionRate: number;
  programEngagementScore: number;
}

export interface BehavioralInsights {
  habitStrength: number;
  emotionalLoyaltyScore: number;
  churnProbability: number;
  upsellPotential: number;
}

export interface MemberStats {
  totalMembers: number;
  totalNonMembers: number;
  memberPercentage: number;
  orderFrequencyLift: number;
  aovIncrease: number;
  revenueLift: number;
  members: {
    avgOrders: number;
    avgOrderValue: number;
    lifetimeValue: number;
    repeatPurchaseRate: number;
  };
  nonMembers: {
    avgOrders: number;
    avgOrderValue: number;
    lifetimeValue: number;
    repeatPurchaseRate: number;
  };
}

export interface CustomerBehaviourData extends MemberStats {
  rfmSegments: RFMSegments;
  engagementMetrics: EngagementMetrics;
  behavioralInsights: BehavioralInsights;
}

/**
 * Fetch all customer behaviour data with optimized queries
 * Combines member stats, RFM segmentation, and engagement metrics
 */
async function fetchCustomerBehaviourData(shop: string): Promise<CustomerBehaviourData> {
  const startTime = Date.now();
  console.log(`[RFM Segmentation] Starting analysis for ${shop}`);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  // BATCH 1: Get member/non-member aggregations in parallel
  const [memberStats, nonMemberStats, memberRepeatCount, nonMemberRepeatCount] = await Promise.all([
    db.customer.aggregate({
      where: { shop, currentTierId: { not: null } },
      _count: true,
      _avg: {
        orderCount: true,
        totalSpent: true,
        annualSpent: true,
      },
    }),
    db.customer.aggregate({
      where: { shop, currentTierId: null },
      _count: true,
      _avg: {
        orderCount: true,
        totalSpent: true,
        annualSpent: true,
      },
    }),
    db.customer.count({
      where: { shop, currentTierId: { not: null }, orderCount: { gt: 1 } },
    }),
    db.customer.count({
      where: { shop, currentTierId: null, orderCount: { gt: 1 } },
    }),
  ]);

  console.log(`[RFM Segmentation] Member stats fetched`);

  // Calculate base metrics needed for RFM thresholds
  const totalMembers = memberStats._count;
  const totalNonMembers = nonMemberStats._count;
  const totalCustomers = totalMembers + totalNonMembers;

  const memberAvgOrders = Number(memberStats._avg.orderCount || 0);
  const nonMemberAvgOrders = Number(nonMemberStats._avg.orderCount || 0);

  const memberAvgTotalSpent = Number(memberStats._avg.totalSpent || 0);
  const nonMemberAvgTotalSpent = Number(nonMemberStats._avg.totalSpent || 0);

  const memberLTV = Number(memberStats._avg.annualSpent || 0);
  const nonMemberLTV = Number(nonMemberStats._avg.annualSpent || 0);

  const memberAOV = memberAvgOrders > 0 ? memberAvgTotalSpent / memberAvgOrders : 0;
  const nonMemberAOV = nonMemberAvgOrders > 0 ? nonMemberAvgTotalSpent / nonMemberAvgOrders : 0;

  const memberRepeatPurchaseRate = totalMembers > 0 ? (memberRepeatCount / totalMembers) * 100 : 0;
  const nonMemberRepeatPurchaseRate = totalNonMembers > 0 ? (nonMemberRepeatCount / totalNonMembers) * 100 : 0;

  const memberPercentage = totalCustomers > 0 ? (totalMembers / totalCustomers) * 100 : 0;
  const orderFrequencyLift = nonMemberAvgOrders > 0 ? memberAvgOrders / nonMemberAvgOrders : 0;
  const aovIncrease = nonMemberAOV > 0 ? ((memberAOV - nonMemberAOV) / nonMemberAOV) * 100 : 0;
  const revenueLift = nonMemberLTV > 0 ? ((memberLTV - nonMemberLTV) / nonMemberLTV) * 100 : 0;

  // Use memberLTV for thresholds, fallback to reasonable defaults
  const ltvThreshold = memberLTV > 0 ? memberLTV : 500;

  // BATCH 2: Get RFM segment counts in parallel
  const [
    activeCustomers,
    dormantCustomers,
    atRiskCustomers,
    newCustomers,
    championsCount,
    loyalCount,
    hibernatingCount,
    redeemingCustomers,
  ] = await Promise.all([
    // Active in last 30 days
    db.customer.count({
      where: { shop, lastOrderDate: { gte: thirtyDaysAgo } },
    }),
    // Dormant (60-90 days)
    db.customer.count({
      where: { shop, lastOrderDate: { gte: ninetyDaysAgo, lt: sixtyDaysAgo } },
    }),
    // At risk (high value but slipping)
    db.customer.count({
      where: {
        shop,
        totalSpent: { gte: ltvThreshold * 0.5 },
        lastOrderDate: { gte: oneEightyDaysAgo, lt: sixtyDaysAgo },
      },
    }),
    // New customers (first order in last 30 days)
    db.customer.count({
      where: { shop, createdAt: { gte: thirtyDaysAgo }, orderCount: { lte: 1 } },
    }),
    // Champions: Recent, frequent, high value
    db.customer.count({
      where: {
        shop,
        lastOrderDate: { gte: thirtyDaysAgo },
        orderCount: { gte: 5 },
        totalSpent: { gte: ltvThreshold },
      },
    }),
    // Loyal: Frequent buyers with good value
    db.customer.count({
      where: { shop, orderCount: { gte: 3 }, totalSpent: { gte: ltvThreshold * 0.5 } },
    }),
    // Hibernating: Old customers, low value
    db.customer.count({
      where: { shop, lastOrderDate: { lt: ninetyDaysAgo }, totalSpent: { lt: ltvThreshold * 0.3 } },
    }),
    // Customers who used store credit
    db.customer.count({
      where: { shop, storeCredit: { lt: 0 } },
    }).catch(() => 0),
  ]);

  console.log(`[RFM Segmentation] RFM counts fetched`);

  // Calculate derived segments
  const potentialLoyalists = Math.max(0, Math.round(totalCustomers * 0.15) - championsCount);
  const promising = Math.max(0, Math.round(totalCustomers * 0.10));
  const needsAttention = Math.max(0, Math.round(dormantCustomers * 0.3));
  const aboutToSleep = Math.max(0, Math.round(dormantCustomers * 0.4));
  const cantLoseThem = Math.max(0, Math.round(atRiskCustomers * 0.5));
  const lost = Math.max(0, hibernatingCount - Math.round(hibernatingCount * 0.3));

  // Calculate engagement metrics
  const activeRate = totalCustomers > 0 ? (activeCustomers / totalCustomers) * 100 : 0;
  const dormantRate = totalCustomers > 0 ? (dormantCustomers / totalCustomers) * 100 : 0;
  const churnRiskRate = totalCustomers > 0 ? ((atRiskCustomers + hibernatingCount) / totalCustomers) * 100 : 0;

  const avgDaysBetweenOrders = memberAvgOrders > 1 ? Math.round(365 / memberAvgOrders) : 365;
  const avgDaysSinceLastOrder = activeRate > 0 ? Math.round(30 * (100 / activeRate)) : 90;
  const redemptionRate = memberRepeatPurchaseRate * 0.6;

  const programEngagementScore = Math.round(
    (activeRate * 0.3) +
    (memberRepeatPurchaseRate * 0.3) +
    ((100 - churnRiskRate) * 0.2) +
    (memberPercentage * 0.2)
  );

  // Calculate behavioral insights
  const habitStrength = Math.round(Math.min(100, (memberRepeatPurchaseRate * 0.5) + (orderFrequencyLift * 20)));
  const emotionalLoyaltyScore = Math.round(Math.min(100, (memberPercentage * 0.3) + (activeRate * 0.3) + (habitStrength * 0.4)));
  const churnProbability = Math.round(Math.min(100, Math.max(0, churnRiskRate * 1.2)));
  const upsellPotential = Math.round(Math.min(100, (100 - churnProbability) * 0.5 + (aovIncrease > 0 ? 30 : 10) + (activeRate * 0.2)));

  const duration = Date.now() - startTime;
  console.log(`[RFM Segmentation] Completed in ${duration}ms`);

  return {
    totalMembers,
    totalNonMembers,
    memberPercentage,
    orderFrequencyLift,
    aovIncrease,
    revenueLift,
    members: {
      avgOrders: memberAvgOrders,
      avgOrderValue: memberAOV,
      lifetimeValue: memberLTV,
      repeatPurchaseRate: memberRepeatPurchaseRate,
    },
    nonMembers: {
      avgOrders: nonMemberAvgOrders,
      avgOrderValue: nonMemberAOV,
      lifetimeValue: nonMemberLTV,
      repeatPurchaseRate: nonMemberRepeatPurchaseRate,
    },
    rfmSegments: {
      champions: championsCount,
      loyalCustomers: loyalCount,
      potentialLoyalists,
      newCustomers,
      promising,
      needsAttention,
      aboutToSleep,
      atRisk: atRiskCustomers,
      cantLoseThem,
      hibernating: hibernatingCount,
      lost,
    },
    engagementMetrics: {
      activeRate: Math.round(activeRate * 10) / 10,
      dormantRate: Math.round(dormantRate * 10) / 10,
      churnRiskRate: Math.round(churnRiskRate * 10) / 10,
      avgDaysBetweenOrders,
      avgDaysSinceLastOrder,
      redemptionRate: Math.round(redemptionRate * 10) / 10,
      programEngagementScore,
    },
    behavioralInsights: {
      habitStrength,
      emotionalLoyaltyScore,
      churnProbability,
      upsellPotential,
    },
  };
}

/**
 * Get customer behaviour data with caching
 * Cache TTL: 5 minutes (300000ms)
 */
export async function getCustomerBehaviourData(shop: string): Promise<CustomerBehaviourData> {
  const cacheKey = `customer-behaviour:${shop}`;

  return getCachedOrCompute(
    cacheKey,
    () => fetchCustomerBehaviourData(shop),
    300000 // 5 minute cache
  );
}
