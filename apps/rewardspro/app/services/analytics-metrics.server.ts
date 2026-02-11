/**
 * Analytics Metrics Service
 * Optimized database queries for analytics overview metrics
 */

import db from "../db.server";
import { getCachedOrCompute, getMetricsCacheKey } from "~/utils/analytics-cache.server";

export interface OverviewMetrics {
  totalRevenue: number;
  totalOrders: number;
  cashbackIssued: number;
  activeCustomers: number;
  avgOrderValue: number;
  totalCustomers: number;
}

export interface MetricsComparison {
  current: OverviewMetrics;
  previous: OverviewMetrics;
  changes: {
    revenueChange: number;
    ordersChange: number;
    cashbackChange: number;
    activeCustomersChange: number;
    avgOrderValueChange: number;
    totalCustomersChange: number;
  };
}

/**
 * Get start and end dates for a given month
 */
function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1); // month is 1-indexed
  const end = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month
  return { start, end };
}

/**
 * Get current month and year
 */
function getCurrentPeriod(): { year: number; month: number } {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1, // Convert to 1-indexed
  };
}

/**
 * Get previous month and year
 */
function getPreviousPeriod(): { year: number; month: number } {
  const now = new Date();
  const prevMonth = now.getMonth(); // This gives us 0-indexed previous month
  const year = prevMonth === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = prevMonth === 0 ? 12 : prevMonth;
  return { year, month };
}

/**
 * Fetch metrics for a specific period
 * Optimized: Single aggregation query for multiple metrics
 */
async function fetchPeriodMetrics(
  shop: string,
  year: number,
  month: number
): Promise<OverviewMetrics> {
  const { start, end } = getMonthRange(year, month);

  // Single optimized query for Revenue, Cashback, Active Customers, Orders
  const orderAggregation = await db.order.aggregate({
    where: {
      shop,
      shopifyCreatedAt: {
        gte: start,
        lte: end,
      },
      financialStatus: {
        in: ['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'],
      },
    },
    _sum: {
      netAmount: true,
      cashbackAmount: true,
    },
    _count: {
      id: true,
      customerId: true, // Will count all, but we need distinct separately
    },
  });

  // Get distinct active customers count via COUNT DISTINCT (avoids loading all IDs into memory)
  const activeCustomersResult = await db.$queryRaw`
    SELECT COUNT(DISTINCT "customerId") as count
    FROM "Order"
    WHERE shop = ${shop}
      AND "shopifyCreatedAt" >= ${start}
      AND "shopifyCreatedAt" <= ${end}
      AND "financialStatus" IN ('PAID', 'PARTIALLY_PAID')
  ` as { count: number | bigint }[];

  // Try to get order count from MonthlyOrderUsage (cached)
  let orderCount = orderAggregation._count.id;
  try {
    const cachedUsage = await db.monthlyOrderUsage.findFirst({
      where: { shop, year, month },
    });
    if (cachedUsage) {
      orderCount = cachedUsage.orderCount;
      console.log(`[Analytics] Using cached order count: ${orderCount}`);
    }
  } catch (e) {
    console.log('[Analytics] MonthlyOrderUsage not available, using direct count');
  }

  // Get total customers (all-time)
  const totalCustomersCount = await db.customer.count({
    where: { shop },
  });

  // Calculate metrics
  const totalRevenue = Number(orderAggregation._sum.netAmount || 0);
  const cashbackIssued = Number(orderAggregation._sum.cashbackAmount || 0);
  const activeCustomersCount = Number(activeCustomersResult[0]?.count || 0);
  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

  // Data integrity check: activeCustomers should not exceed totalCustomers
  if (activeCustomersCount > totalCustomersCount) {
    console.warn(
      `[Analytics] Data inconsistency detected:`,
      `Active customers (${activeCustomersCount}) > Total customers (${totalCustomersCount})`,
      `This indicates Customer table may not be fully synced or there are orphaned Order records.`
    );
  }

  return {
    totalRevenue,
    totalOrders: orderCount,
    cashbackIssued,
    activeCustomers: activeCustomersCount,
    avgOrderValue,
    totalCustomers: totalCustomersCount,
  };
}

/**
 * Fetch metrics for an arbitrary date range (used by custom date range selector)
 */
async function fetchPeriodMetricsForRange(
  shop: string,
  start: Date,
  end: Date
): Promise<OverviewMetrics> {
  const orderAggregation = await db.order.aggregate({
    where: {
      shop,
      shopifyCreatedAt: { gte: start, lte: end },
      financialStatus: { in: ['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'] },
    },
    _sum: { netAmount: true, cashbackAmount: true },
    _count: { id: true },
  });

  const activeCustomersResult = await db.$queryRaw`
    SELECT COUNT(DISTINCT "customerId") as count
    FROM "Order"
    WHERE shop = ${shop}
      AND "shopifyCreatedAt" >= ${start}
      AND "shopifyCreatedAt" <= ${end}
      AND "financialStatus" IN ('PAID', 'PARTIALLY_PAID')
  ` as { count: number | bigint }[];

  const totalCustomersCount = await db.customer.count({ where: { shop } });

  const totalRevenue = Number(orderAggregation._sum.netAmount || 0);
  const cashbackIssued = Number(orderAggregation._sum.cashbackAmount || 0);
  const activeCustomersCount = Number(activeCustomersResult[0]?.count || 0);
  const orderCount = orderAggregation._count.id;
  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

  return {
    totalRevenue,
    totalOrders: orderCount,
    cashbackIssued,
    activeCustomers: activeCustomersCount,
    avgOrderValue,
    totalCustomers: totalCustomersCount,
  };
}

/**
 * Get overview metrics with comparison to previous period
 * Uses caching for performance
 *
 * @param shop - Shop domain
 * @param dateRange - Optional custom date range. When provided, comparison period
 *   is an equal-length window immediately preceding the start date.
 */
export async function getOverviewMetricsWithComparison(
  shop: string,
  dateRange?: { start: Date; end: Date }
): Promise<MetricsComparison> {
  let current: OverviewMetrics;
  let previous: OverviewMetrics;

  if (dateRange) {
    // Custom date range: compute comparison as an equal-length window before start
    const rangeMs = dateRange.end.getTime() - dateRange.start.getTime();
    const comparisonStart = new Date(dateRange.start.getTime() - rangeMs);
    const comparisonEnd = new Date(dateRange.start.getTime() - 1); // 1ms before current range

    console.log(`[Analytics] Fetching metrics for ${shop} (custom range)`);
    console.log(`[Analytics] Current: ${dateRange.start.toISOString()} - ${dateRange.end.toISOString()}`);
    console.log(`[Analytics] Previous: ${comparisonStart.toISOString()} - ${comparisonEnd.toISOString()}`);

    [current, previous] = await Promise.all([
      fetchPeriodMetricsForRange(shop, dateRange.start, dateRange.end),
      fetchPeriodMetricsForRange(shop, comparisonStart, comparisonEnd),
    ]);
  } else {
    // Default: current vs previous month
    const currentPeriod = getCurrentPeriod();
    const previousPeriod = getPreviousPeriod();

    console.log(`[Analytics] Fetching metrics for ${shop}`);
    console.log(`[Analytics] Current: ${currentPeriod.year}-${currentPeriod.month}`);
    console.log(`[Analytics] Previous: ${previousPeriod.year}-${previousPeriod.month}`);

    [current, previous] = await Promise.all([
      getCachedOrCompute(
        getMetricsCacheKey(shop, 'current'),
        () => fetchPeriodMetrics(shop, currentPeriod.year, currentPeriod.month),
        300000
      ),
      getCachedOrCompute(
        getMetricsCacheKey(shop, 'previous'),
        () => fetchPeriodMetrics(shop, previousPeriod.year, previousPeriod.month),
        600000
      ),
    ]);
  }

  // Calculate percentage changes
  const calculateChange = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const changes = {
    revenueChange: calculateChange(current.totalRevenue, previous.totalRevenue),
    ordersChange: calculateChange(current.totalOrders, previous.totalOrders),
    cashbackChange: calculateChange(current.cashbackIssued, previous.cashbackIssued),
    activeCustomersChange: calculateChange(current.activeCustomers, previous.activeCustomers),
    avgOrderValueChange: calculateChange(current.avgOrderValue, previous.avgOrderValue),
    totalCustomersChange: calculateChange(current.totalCustomers, previous.totalCustomers),
  };

  console.log('[Analytics] Metrics fetched successfully');
  console.log(`[Analytics] Current Revenue: $${current.totalRevenue.toFixed(2)}`);
  console.log(`[Analytics] Previous Revenue: $${previous.totalRevenue.toFixed(2)}`);
  console.log(`[Analytics] Change: ${changes.revenueChange.toFixed(1)}%`);

  return {
    current,
    previous,
    changes,
  };
}

// Re-export shared formatting utilities
export { formatPercentageChange, getBadgeTone } from "~/utils/analytics-formatters";
