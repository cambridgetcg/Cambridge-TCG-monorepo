/**
 * Cohort Analysis Service
 * Optimized cohort calculations with caching
 * Reduces queries from ~10+ to 3 and limits data to recent months
 */

import prisma from "../db.server";
import { getCachedOrCompute } from "~/utils/analytics-cache.server";

// Types
interface RetentionDataPoint {
  monthIndex: number;
  activeCustomers: number;
  retentionRate: number;
  revenue: number;
}

interface RetentionCohort {
  cohortMonth: string;
  cohortLabel: string;
  initialCustomers: number;
  retention: RetentionDataPoint[];
}

interface RevenueDataPoint {
  monthIndex: number;
  totalRevenue: number;
  avgRevenuePerCustomer: number;
}

interface RevenueCohort {
  cohortMonth: string;
  cohortLabel: string;
  initialCustomers: number;
  cumulativeRevenue: RevenueDataPoint[];
}

interface TierDistributionDataPoint {
  tierName: string;
  tierId: string | null;
  customerCount: number;
  percentage: number;
}

interface TierProgressionMonth {
  monthIndex: number;
  tiers: TierDistributionDataPoint[];
}

interface TierProgressionCohort {
  cohortMonth: string;
  cohortLabel: string;
  initialCustomers: number;
  tierDistribution: TierProgressionMonth[];
}

interface SummaryMetrics {
  avgRetentionMonth1: number;
  avgRetentionMonth3: number;
  avgRetentionMonth6: number;
  avgRetentionMonth12: number;
  avgLTV30Days: number;
  avgLTV90Days: number;
  avgLTV180Days: number;
  avgLTV365Days: number;
  avgTimeToTierUpgrade: number;
  tierUpgradeRate: number;
}

export interface CohortAnalysis {
  retentionCohorts: RetentionCohort[];
  revenueCohorts: RevenueCohort[];
  tierProgressionCohorts: TierProgressionCohort[];
  summaryMetrics: SummaryMetrics;
}

// Helper functions
function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function monthsBetween(date1: Date, date2: Date): number {
  return (date2.getFullYear() - date1.getFullYear()) * 12 + (date2.getMonth() - date1.getMonth());
}

function avgArr(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/**
 * Fetch cohort analysis data with optimized queries
 * OPTIMIZATION: Limits data to last 12 months and caps customer count
 */
async function fetchCohortAnalysis(shop: string): Promise<CohortAnalysis> {
  const startTime = Date.now();
  console.log(`[Cohort Analysis] Starting analysis for ${shop}`);

  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // Get tiers for tier progression analysis
  const tiers = await prisma.tier.findMany({
    where: { shop },
    orderBy: { minSpend: 'asc' },
    select: { id: true, name: true },
  });

  // OPTIMIZED: Only fetch customers created in last 12 months
  // Limit to 5000 customers max to prevent memory issues
  const customersWithOrders = await prisma.customer.findMany({
    where: {
      shop,
      orderCount: { gt: 0 },
      createdAt: { gte: twelveMonthsAgo },
    },
    select: {
      id: true,
      lastOrderDate: true,
      totalSpent: true,
      orderCount: true,
      currentTierId: true,
      createdAt: true,
    },
    take: 5000,
    orderBy: { createdAt: 'desc' },
  });

  console.log(`[Cohort Analysis] Fetched ${customersWithOrders.length} customers`);

  // OPTIMIZED: Only fetch orders for the customers we're analyzing
  const customerIds = customersWithOrders.map(c => c.id);

  const allOrders = customerIds.length > 0 ? await prisma.order.findMany({
    where: {
      shop,
      customerId: { in: customerIds },
      financialStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
      shopifyCreatedAt: { gte: twelveMonthsAgo },
    },
    select: {
      customerId: true,
      totalPrice: true,
      shopifyCreatedAt: true,
    },
    orderBy: { shopifyCreatedAt: 'asc' },
  }) : [];

  console.log(`[Cohort Analysis] Fetched ${allOrders.length} orders`);

  // OPTIMIZED: Only fetch tier changes for analyzed customers
  const tierChangeLogs = customerIds.length > 0 ? await prisma.tierChangeLog.findMany({
    where: {
      shop,
      customerId: { in: customerIds },
      createdAt: { gte: twelveMonthsAgo },
    },
    select: {
      customerId: true,
      toTierId: true,
      fromTierId: true,
      createdAt: true,
      changeType: true,
    },
    orderBy: { createdAt: 'asc' },
  }) : [];

  console.log(`[Cohort Analysis] Fetched ${tierChangeLogs.length} tier changes`);

  // Build lookup maps
  const cohortMap = new Map<string, typeof customersWithOrders>();
  customersWithOrders.forEach(customer => {
    if (customer.createdAt) {
      const cohortKey = getMonthKey(customer.createdAt);
      if (!cohortMap.has(cohortKey)) {
        cohortMap.set(cohortKey, []);
      }
      cohortMap.get(cohortKey)!.push(customer);
    }
  });

  const ordersByCustomer = new Map<string, typeof allOrders>();
  allOrders.forEach(order => {
    if (order.customerId) {
      if (!ordersByCustomer.has(order.customerId)) {
        ordersByCustomer.set(order.customerId, []);
      }
      ordersByCustomer.get(order.customerId)!.push(order);
    }
  });

  // Generate cohort months
  const cohortMonths: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    cohortMonths.push(getMonthKey(date));
  }

  // Calculate retention cohorts
  const retentionCohorts: RetentionCohort[] = cohortMonths
    .filter(month => cohortMap.has(month))
    .map(cohortMonth => {
      const cohortCustomers = cohortMap.get(cohortMonth) || [];
      const cohortStartDate = new Date(cohortMonth + '-01');
      const monthsToAnalyze = monthsBetween(cohortStartDate, now);

      const retention: RetentionDataPoint[] = [];
      for (let monthIndex = 0; monthIndex <= Math.min(monthsToAnalyze, 11); monthIndex++) {
        const targetMonth = new Date(cohortStartDate.getFullYear(), cohortStartDate.getMonth() + monthIndex, 1);
        const targetMonthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0, 23, 59, 59);

        let activeCustomers = 0;
        let monthRevenue = 0;

        cohortCustomers.forEach(customer => {
          const customerOrders = ordersByCustomer.get(customer.id) || [];
          const ordersInMonth = customerOrders.filter(order => {
            const orderDate = new Date(order.shopifyCreatedAt);
            return orderDate >= targetMonth && orderDate <= targetMonthEnd;
          });

          if (ordersInMonth.length > 0) {
            activeCustomers++;
            monthRevenue += ordersInMonth.reduce((sum, o) => sum + Number(o.totalPrice), 0);
          }
        });

        retention.push({
          monthIndex,
          activeCustomers,
          retentionRate: cohortCustomers.length > 0 ? (activeCustomers / cohortCustomers.length) * 100 : 0,
          revenue: Math.round(monthRevenue * 100) / 100,
        });
      }

      return {
        cohortMonth,
        cohortLabel: getMonthLabel(cohortMonth),
        initialCustomers: cohortCustomers.length,
        retention,
      };
    });

  // Calculate revenue cohorts (cumulative LTV)
  const revenueCohorts: RevenueCohort[] = cohortMonths
    .filter(month => cohortMap.has(month))
    .map(cohortMonth => {
      const cohortCustomers = cohortMap.get(cohortMonth) || [];
      const cohortStartDate = new Date(cohortMonth + '-01');
      const monthsToAnalyze = monthsBetween(cohortStartDate, now);

      const cumulativeRevenue: RevenueDataPoint[] = [];
      let runningTotal = 0;

      for (let monthIndex = 0; monthIndex <= Math.min(monthsToAnalyze, 11); monthIndex++) {
        const targetMonth = new Date(cohortStartDate.getFullYear(), cohortStartDate.getMonth() + monthIndex, 1);
        const targetMonthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0, 23, 59, 59);

        let monthRevenue = 0;
        cohortCustomers.forEach(customer => {
          const customerOrders = ordersByCustomer.get(customer.id) || [];
          const ordersInMonth = customerOrders.filter(order => {
            const orderDate = new Date(order.shopifyCreatedAt);
            return orderDate >= targetMonth && orderDate <= targetMonthEnd;
          });
          monthRevenue += ordersInMonth.reduce((sum, o) => sum + Number(o.totalPrice), 0);
        });

        runningTotal += monthRevenue;

        cumulativeRevenue.push({
          monthIndex,
          totalRevenue: Math.round(runningTotal * 100) / 100,
          avgRevenuePerCustomer: cohortCustomers.length > 0
            ? Math.round((runningTotal / cohortCustomers.length) * 100) / 100
            : 0,
        });
      }

      return {
        cohortMonth,
        cohortLabel: getMonthLabel(cohortMonth),
        initialCustomers: cohortCustomers.length,
        cumulativeRevenue,
      };
    });

  // Calculate tier progression cohorts (only last 6 months for performance)
  const tierProgressionCohorts: TierProgressionCohort[] = cohortMonths
    .filter(month => cohortMap.has(month))
    .slice(0, 6) // Only 6 months for tier progression
    .map(cohortMonth => {
      const cohortCustomers = cohortMap.get(cohortMonth) || [];
      const cohortStartDate = new Date(cohortMonth + '-01');
      const monthsToAnalyze = monthsBetween(cohortStartDate, now);

      const tierDistribution: TierProgressionMonth[] = [];

      for (let monthIndex = 0; monthIndex <= Math.min(monthsToAnalyze, 11); monthIndex++) {
        const targetMonthEnd = new Date(cohortStartDate.getFullYear(), cohortStartDate.getMonth() + monthIndex + 1, 0, 23, 59, 59);

        const tierCounts = new Map<string | null, number>();
        tierCounts.set(null, 0);
        tiers.forEach(tier => tierCounts.set(tier.id, 0));

        cohortCustomers.forEach(customer => {
          const relevantChanges = tierChangeLogs.filter(log =>
            log.customerId === customer.id && new Date(log.createdAt) <= targetMonthEnd
          );

          if (relevantChanges.length > 0) {
            const lastChange = relevantChanges[relevantChanges.length - 1];
            tierCounts.set(lastChange.toTierId, (tierCounts.get(lastChange.toTierId) || 0) + 1);
          } else if (customer.currentTierId && customer.createdAt && new Date(customer.createdAt) <= targetMonthEnd) {
            tierCounts.set(customer.currentTierId, (tierCounts.get(customer.currentTierId) || 0) + 1);
          } else {
            tierCounts.set(null, (tierCounts.get(null) || 0) + 1);
          }
        });

        const tierDist: TierDistributionDataPoint[] = [
          {
            tierName: 'No Tier',
            tierId: null,
            customerCount: tierCounts.get(null) || 0,
            percentage: cohortCustomers.length > 0 ? ((tierCounts.get(null) || 0) / cohortCustomers.length) * 100 : 0,
          },
          ...tiers.map(tier => ({
            tierName: tier.name,
            tierId: tier.id,
            customerCount: tierCounts.get(tier.id) || 0,
            percentage: cohortCustomers.length > 0 ? ((tierCounts.get(tier.id) || 0) / cohortCustomers.length) * 100 : 0,
          })),
        ];

        tierDistribution.push({
          monthIndex,
          tiers: tierDist,
        });
      }

      return {
        cohortMonth,
        cohortLabel: getMonthLabel(cohortMonth),
        initialCustomers: cohortCustomers.length,
        tierDistribution,
      };
    });

  // Calculate summary metrics
  const allRetentionRates = retentionCohorts.flatMap(c => c.retention);
  const month1Retentions = allRetentionRates.filter(r => r.monthIndex === 1).map(r => r.retentionRate);
  const month3Retentions = allRetentionRates.filter(r => r.monthIndex === 3).map(r => r.retentionRate);
  const month6Retentions = allRetentionRates.filter(r => r.monthIndex === 6).map(r => r.retentionRate);
  const month12Retentions = allRetentionRates.filter(r => r.monthIndex === 11).map(r => r.retentionRate);

  const allLTVs = revenueCohorts.flatMap(c => c.cumulativeRevenue);
  const ltv30 = allLTVs.filter(r => r.monthIndex === 0).map(r => r.avgRevenuePerCustomer);
  const ltv90 = allLTVs.filter(r => r.monthIndex === 2).map(r => r.avgRevenuePerCustomer);
  const ltv180 = allLTVs.filter(r => r.monthIndex === 5).map(r => r.avgRevenuePerCustomer);
  const ltv365 = allLTVs.filter(r => r.monthIndex === 11).map(r => r.avgRevenuePerCustomer);

  // Calculate tier upgrade metrics
  const customersWithUpgrades = tierChangeLogs.filter(log => log.changeType === 'UPGRADE');
  const uniqueUpgradedCustomers = new Set(customersWithUpgrades.map(log => log.customerId));
  const tierUpgradeRate = customersWithOrders.length > 0
    ? (uniqueUpgradedCustomers.size / customersWithOrders.length) * 100
    : 0;

  // Calculate average time to first tier upgrade
  const upgradeDelays: number[] = [];
  uniqueUpgradedCustomers.forEach(customerId => {
    const customer = customersWithOrders.find(c => c.id === customerId);
    const firstUpgrade = customersWithUpgrades.find(log => log.customerId === customerId);
    if (customer?.createdAt && firstUpgrade) {
      const days = Math.floor((new Date(firstUpgrade.createdAt).getTime() - new Date(customer.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      if (days >= 0) upgradeDelays.push(days);
    }
  });
  const avgTimeToTierUpgrade = upgradeDelays.length > 0
    ? upgradeDelays.reduce((a, b) => a + b, 0) / upgradeDelays.length
    : 0;

  const summaryMetrics: SummaryMetrics = {
    avgRetentionMonth1: Math.round(avgArr(month1Retentions) * 10) / 10,
    avgRetentionMonth3: Math.round(avgArr(month3Retentions) * 10) / 10,
    avgRetentionMonth6: Math.round(avgArr(month6Retentions) * 10) / 10,
    avgRetentionMonth12: Math.round(avgArr(month12Retentions) * 10) / 10,
    avgLTV30Days: Math.round(avgArr(ltv30) * 100) / 100,
    avgLTV90Days: Math.round(avgArr(ltv90) * 100) / 100,
    avgLTV180Days: Math.round(avgArr(ltv180) * 100) / 100,
    avgLTV365Days: Math.round(avgArr(ltv365) * 100) / 100,
    avgTimeToTierUpgrade: Math.round(avgTimeToTierUpgrade),
    tierUpgradeRate: Math.round(tierUpgradeRate * 10) / 10,
  };

  const duration = Date.now() - startTime;
  console.log(`[Cohort Analysis] Completed in ${duration}ms`);

  return {
    retentionCohorts,
    revenueCohorts,
    tierProgressionCohorts,
    summaryMetrics,
  };
}

/**
 * Get cohort analysis with caching
 * Cache TTL: 5 minutes (300000ms)
 */
export async function getCohortAnalysis(shop: string): Promise<CohortAnalysis> {
  const cacheKey = `cohort-analysis:${shop}`;

  return getCachedOrCompute(
    cacheKey,
    () => fetchCohortAnalysis(shop),
    300000 // 5 minute cache
  );
}
