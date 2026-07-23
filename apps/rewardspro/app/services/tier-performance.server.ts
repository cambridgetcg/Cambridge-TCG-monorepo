/**
 * Tier Performance Analytics Service
 * Optimized database queries for tier-level performance metrics
 */

import prisma from "../db.server";
import { getCachedOrCompute } from "~/utils/analytics-cache.server";

export interface TierPerformanceMetrics {
  id: string;
  name: string;
  members: number; // Customer count in this tier
  customerCount: number; // For Doughnut chart
  cashbackPercent: number;
  monthlyOrderFrequency: number; // Orders per customer this month
  revenuePerOrder: number; // Average revenue per order
  grossProfitPerCustomerPerMonth: number; // Monthly gross profit per customer
  // For Radar chart
  averageOrderValue: number; // Same as revenuePerOrder
  lifetimeValue: number; // Average total spending per customer
  retentionRate: number; // Percentage retained from last month
  totalCashbackEarned: number; // Average cashback per customer this month
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
 * Fetch tier performance metrics for a specific period
 * OPTIMIZED: Batched queries instead of per-tier queries
 * Reduced from ~5N queries (N = number of tiers) to ~8 total queries
 */
async function fetchTierPerformanceMetrics(
  shop: string,
  year: number,
  month: number
): Promise<TierPerformanceMetrics[]> {
  const currentMonthRange = getMonthRange(year, month);
  const previousPeriod = getPreviousPeriod();
  const previousMonthRange = getMonthRange(previousPeriod.year, previousPeriod.month);

  console.log(`[Tier Performance] Fetching metrics for ${shop} (OPTIMIZED)`);
  console.log(`[Tier Performance] Current period: ${year}-${month}`);

  // BATCH QUERY 1: Get all tiers and shop settings in parallel
  const [tiers, shopSettings] = await Promise.all([
    prisma.tier.findMany({
      where: { shop },
      orderBy: { minSpend: 'asc' },
      select: {
        id: true,
        name: true,
        cashbackPercent: true,
      },
    }),
    prisma.shopSettings.findUnique({
      where: { shop },
      select: { averageProfitMargin: true },
    }),
  ]);

  if (tiers.length === 0) {
    console.log('[Tier Performance] No tiers found for shop');
    return [];
  }

  const profitMargin = shopSettings?.averageProfitMargin
    ? Number(shopSettings.averageProfitMargin)
    : 40;

  // OPTIMIZED: Use COUNT and AGGREGATE queries instead of fetching all customers
  // This avoids loading 100K+ customer records into memory

  // BATCH QUERY 2a: Get customer counts per tier (parallel COUNT queries)
  const customerCountResults = await Promise.all(
    tiers.map(tier =>
      prisma.customer.count({
        where: { shop, currentTierId: tier.id },
      }).then(count => ({ tierId: tier.id, count }))
    )
  );

  // BATCH QUERY 2b: Get average LTV per tier (parallel AGGREGATE queries)
  const ltvResults = await Promise.all(
    tiers.map(tier =>
      prisma.customer.aggregate({
        where: { shop, currentTierId: tier.id },
        _avg: { totalSpent: true },
      }).then(result => ({ tierId: tier.id, avgLtv: Number(result._avg.totalSpent || 0) }))
    )
  );

  // Build lookup maps from aggregate results (no memory-intensive loops)
  const customerCountMap = new Map<string, number>(
    customerCountResults.map(r => [r.tierId, r.count])
  );
  const ltvMap = new Map<string, number>(
    ltvResults.map(r => [r.tierId, r.avgLtv])
  );

  // BATCH QUERY 2c: Get customer IDs per tier for order queries
  // Data API adapter doesn't support Prisma relation filters (customer: { currentTierId: ... })
  // So we need to fetch customer IDs first and use customerId: { in: [...] }
  const customerIdsPerTier = await Promise.all(
    tiers.map(async tier => {
      const customers = await prisma.customer.findMany({
        where: { shop, currentTierId: tier.id },
        select: { id: true },
        take: 10000, // Safety limit
      });
      return { tierId: tier.id, customerIds: customers.map(c => c.id) };
    })
  );
  const customerIdsByTier = new Map<string, string[]>(
    customerIdsPerTier.map(r => [r.tierId, r.customerIds])
  );

  // BATCH QUERY 3: Get order aggregates per tier using customerId filter
  // Uses customerId: { in: [...] } instead of relation filter for Data API compatibility
  const orderAggregateResults = await Promise.all(
    tiers.map(async tier => {
      const customerIds = customerIdsByTier.get(tier.id) || [];

      // Skip if no customers in this tier
      if (customerIds.length === 0) {
        return {
          tierId: tier.id,
          revenue: 0,
          cashback: 0,
          orderCount: 0,
          activeCustomerCount: 0,
        };
      }

      const [orderAggregate, activeCustomerCount] = await Promise.all([
        // Aggregate order metrics for this tier
        prisma.order.aggregate({
          where: {
            shop,
            customerId: { in: customerIds },
            shopifyCreatedAt: {
              gte: currentMonthRange.start,
              lte: currentMonthRange.end,
            },
            financialStatus: {
              in: ['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'],
            },
          },
          _sum: { netAmount: true, cashbackAmount: true },
          _count: true,
        }),
        // Count distinct active customers (who ordered this month)
        prisma.order.findMany({
          where: {
            shop,
            customerId: { in: customerIds },
            shopifyCreatedAt: {
              gte: currentMonthRange.start,
              lte: currentMonthRange.end,
            },
            financialStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
          },
          distinct: ['customerId'],
          select: { customerId: true },
        }),
      ]);

      return {
        tierId: tier.id,
        revenue: Number(orderAggregate._sum.netAmount || 0),
        cashback: Number(orderAggregate._sum.cashbackAmount || 0),
        orderCount: orderAggregate._count || 0,
        activeCustomerCount: activeCustomerCount.length,
      };
    })
  );

  // Build order data lookup maps
  const orderDataByTier = new Map(
    orderAggregateResults.map(r => [
      r.tierId,
      { revenue: r.revenue, cashback: r.cashback, orderCount: r.orderCount },
    ])
  );
  const activeCustomerCountByTier = new Map(
    orderAggregateResults.map(r => [r.tierId, r.activeCustomerCount])
  );

  // BATCH QUERY 4: Calculate retention per tier
  // Uses customerId: { in: [...] } instead of relation filter for Data API compatibility
  const retentionResults = await Promise.all(
    tiers.map(async tier => {
      const customerIds = customerIdsByTier.get(tier.id) || [];

      // Skip if no customers in this tier
      if (customerIds.length === 0) {
        return { tierId: tier.id, retentionRate: 0 };
      }

      // Get distinct customers who ordered last month for this tier
      const lastMonthCustomers = await prisma.order.findMany({
        where: {
          shop,
          customerId: { in: customerIds },
          shopifyCreatedAt: {
            gte: previousMonthRange.start,
            lte: previousMonthRange.end,
          },
          financialStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
        },
        distinct: ['customerId'],
        select: { customerId: true },
        take: 5000, // Safety limit for very large tiers
      });

      if (lastMonthCustomers.length === 0) {
        return { tierId: tier.id, retentionRate: 0 };
      }

      const lastMonthCustomerIds = lastMonthCustomers.map(o => o.customerId);

      // Check how many of those customers ordered this month
      const retainedCustomers = await prisma.order.findMany({
        where: {
          shop,
          customerId: { in: lastMonthCustomerIds },
          shopifyCreatedAt: { gte: currentMonthRange.start },
          financialStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
        },
        distinct: ['customerId'],
        select: { customerId: true },
      });

      const retentionRate = (retainedCustomers.length / lastMonthCustomers.length) * 100;
      return { tierId: tier.id, retentionRate };
    })
  );

  const retentionByTier = new Map(
    retentionResults.map(r => [r.tierId, r.retentionRate])
  );

  // Build final metrics from aggregated data
  const tierMetrics = tiers.map(tier => {
    const customerCount = customerCountMap.get(tier.id) || 0;
    const lifetimeValue = ltvMap.get(tier.id) || 0;
    const orderData = orderDataByTier.get(tier.id) || { revenue: 0, cashback: 0, orderCount: 0 };
    const activeCustomerCount = activeCustomerCountByTier.get(tier.id) || 0;
    const retentionRate = retentionByTier.get(tier.id) || 0;

    const monthlyOrderFrequency = activeCustomerCount > 0
      ? orderData.orderCount / activeCustomerCount
      : 0;
    const revenuePerOrder = orderData.orderCount > 0
      ? orderData.revenue / orderData.orderCount
      : 0;
    const totalGrossProfit = orderData.revenue * (profitMargin / 100);
    const grossProfitPerCustomerPerMonth = customerCount > 0
      ? totalGrossProfit / customerCount
      : 0;
    const cashbackPerCustomer = customerCount > 0
      ? orderData.cashback / customerCount
      : 0;

    console.log(`[Tier Performance] ${tier.name}: ${customerCount} members, ${orderData.orderCount} orders`);

    return {
      id: tier.id,
      name: tier.name,
      members: customerCount,
      customerCount: customerCount,
      cashbackPercent: tier.cashbackPercent,
      monthlyOrderFrequency: Math.round(monthlyOrderFrequency * 100) / 100,
      revenuePerOrder: Math.round(revenuePerOrder * 100) / 100,
      grossProfitPerCustomerPerMonth: Math.round(grossProfitPerCustomerPerMonth * 100) / 100,
      averageOrderValue: Math.round(revenuePerOrder * 100) / 100,
      lifetimeValue: Math.round(lifetimeValue * 100) / 100,
      retentionRate: Math.round(retentionRate * 10) / 10,
      totalCashbackEarned: Math.round(cashbackPerCustomer * 100) / 100,
    };
  });

  console.log(`[Tier Performance] Metrics fetched successfully (${tiers.length} tiers)`);
  return tierMetrics;
}

/**
 * Get tier performance metrics with caching
 */
export async function getTierPerformanceMetrics(
  shop: string
): Promise<TierPerformanceMetrics[]> {
  const currentPeriod = getCurrentPeriod();

  const cacheKey = `tier-performance:${shop}:${currentPeriod.year}-${currentPeriod.month}`;

  return getCachedOrCompute(
    cacheKey,
    () => fetchTierPerformanceMetrics(shop, currentPeriod.year, currentPeriod.month),
    60000 // 60 second cache
  );
}

// ============================================
// MONTHLY TIER REVENUE (HISTORICAL DATA)
// ============================================

export interface MonthlyTierRevenue {
  month: string; // e.g., "Jan"
  tiers: {
    tierName: string;
    tierId: string;
    revenue: number;
    orderFrequency: number;
    revenuePerOrder: number;
    grossProfit: number;
  }[];
}

/**
 * Fetch historical tier revenue for the last 12 months
 * Uses aggregate queries per month for efficiency
 */
async function fetchMonthlyTierRevenue(shop: string): Promise<MonthlyTierRevenue[]> {
  console.log(`[Tier Revenue] Fetching monthly historical data for ${shop}`);

  const now = new Date();

  // Get all tiers first
  const tiers = await prisma.tier.findMany({
    where: { shop },
    orderBy: { minSpend: 'asc' },
    select: { id: true, name: true },
  });

  if (tiers.length === 0) {
    console.log('[Tier Revenue] No tiers found');
    return [];
  }

  // Get profit margin for gross profit calculation
  const shopSettings = await prisma.shopSettings.findUnique({
    where: { shop },
    select: { averageProfitMargin: true },
  });
  const profitMargin = shopSettings?.averageProfitMargin
    ? Number(shopSettings.averageProfitMargin)
    : 40;

  // Get all customer IDs by tier (needed for Data API compatibility)
  const customerIdsByTier = new Map<string, string[]>();
  await Promise.all(
    tiers.map(async (tier) => {
      const customers = await prisma.customer.findMany({
        where: { shop, currentTierId: tier.id },
        select: { id: true },
        take: 10000, // Safety limit
      });
      customerIdsByTier.set(tier.id, customers.map(c => c.id));
    })
  );

  // Build month ranges for the last 12 months
  const monthRanges: Array<{ start: Date; end: Date; name: string }> = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    monthRanges.push({
      start: date,
      end: endOfMonth,
      name: date.toLocaleDateString('en-US', { month: 'short' }),
    });
  }

  // Fetch revenue data for each tier for each month
  // This is O(tiers × months) queries, but each is a simple aggregate
  const monthlyData: MonthlyTierRevenue[] = await Promise.all(
    monthRanges.map(async (monthRange) => {
      const tierData = await Promise.all(
        tiers.map(async (tier) => {
          const customerIds = customerIdsByTier.get(tier.id) || [];

          if (customerIds.length === 0) {
            return {
              tierName: tier.name,
              tierId: tier.id,
              revenue: 0,
              orderFrequency: 0,
              revenuePerOrder: 0,
              grossProfit: 0,
            };
          }

          // Aggregate order data for this tier in this month
          const [orderAggregate, activeCustomers] = await Promise.all([
            prisma.order.aggregate({
              where: {
                shop,
                customerId: { in: customerIds },
                shopifyCreatedAt: {
                  gte: monthRange.start,
                  lte: monthRange.end,
                },
                financialStatus: {
                  in: ['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'],
                },
              },
              _sum: { netAmount: true },
              _count: true,
            }),
            prisma.order.findMany({
              where: {
                shop,
                customerId: { in: customerIds },
                shopifyCreatedAt: {
                  gte: monthRange.start,
                  lte: monthRange.end,
                },
                financialStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
              },
              distinct: ['customerId'],
              select: { customerId: true },
            }),
          ]);

          const revenue = Number(orderAggregate._sum.netAmount || 0);
          const orderCount = orderAggregate._count || 0;
          const activeCustomerCount = activeCustomers.length;

          const orderFrequency = activeCustomerCount > 0
            ? orderCount / activeCustomerCount
            : 0;
          const revenuePerOrder = orderCount > 0
            ? revenue / orderCount
            : 0;
          const grossProfit = revenue * (profitMargin / 100);

          return {
            tierName: tier.name,
            tierId: tier.id,
            revenue: Math.round(revenue * 100) / 100,
            orderFrequency: Math.round(orderFrequency * 100) / 100,
            revenuePerOrder: Math.round(revenuePerOrder * 100) / 100,
            grossProfit: Math.round(grossProfit * 100) / 100,
          };
        })
      );

      return {
        month: monthRange.name,
        tiers: tierData,
      };
    })
  );

  console.log(`[Tier Revenue] Fetched ${monthlyData.length} months of data`);
  return monthlyData;
}

/**
 * Get monthly tier revenue with caching (5 minute cache)
 */
export async function getMonthlyTierRevenue(shop: string): Promise<MonthlyTierRevenue[]> {
  const cacheKey = `tier-revenue-monthly:${shop}`;

  return getCachedOrCompute(
    cacheKey,
    () => fetchMonthlyTierRevenue(shop),
    300000 // 5 minute cache (historical data changes less frequently)
  );
}
