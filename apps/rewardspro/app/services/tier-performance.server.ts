/**
 * Tier Performance Analytics Service
 * Optimized database queries for tier-level performance metrics
 */

import db from "../db.server";
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
 * Calculate retention rate for a tier
 */
async function calculateRetentionRate(
  shop: string,
  tierCustomerIds: string[],
  currentMonthRange: { start: Date; end: Date },
  previousMonthRange: { start: Date; end: Date }
): Promise<number> {
  // Get distinct customers who ordered in previous month for this tier
  const previousMonthCustomers = await db.order.findMany({
    where: {
      shop,
      customerId: { in: tierCustomerIds },
      shopifyCreatedAt: {
        gte: previousMonthRange.start,
        lte: previousMonthRange.end,
      },
      financialStatus: {
        in: ['PAID', 'PARTIALLY_PAID'],
      },
    },
    distinct: ['customerId'],
    select: {
      customerId: true,
    },
  });

  if (previousMonthCustomers.length === 0) {
    return 0;
  }

  const previousCustomerIds = new Set(previousMonthCustomers.map(o => o.customerId));

  // Get distinct customers who ordered in current month for this tier
  const currentMonthCustomers = await db.order.findMany({
    where: {
      shop,
      customerId: {
        in: Array.from(previousCustomerIds), // Only check if they were in previous month
      },
      shopifyCreatedAt: {
        gte: currentMonthRange.start,
        lte: currentMonthRange.end,
      },
      financialStatus: {
        in: ['PAID', 'PARTIALLY_PAID'],
      },
    },
    distinct: ['customerId'],
    select: {
      customerId: true,
    },
  });

  // Calculate retention rate
  const retainedCount = currentMonthCustomers.length;
  const retentionRate = (retainedCount / previousMonthCustomers.length) * 100;

  return retentionRate;
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
    db.tier.findMany({
      where: { shop },
      orderBy: { minSpend: 'asc' },
      select: {
        id: true,
        name: true,
        cashbackPercent: true,
      },
    }),
    db.shopSettings.findUnique({
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

  const tierIds = tiers.map(t => t.id);

  // BATCH QUERY 2: Get all customers with their tier IDs and totalSpent for aggregation
  // NOTE: Aurora Data API doesn't support groupBy, so we fetch all and aggregate in memory
  const allCustomersWithTier = await db.customer.findMany({
    where: {
      shop,
      currentTierId: { in: tierIds },
    },
    select: {
      id: true,
      currentTierId: true,
      totalSpent: true,
    },
  });

  // Aggregate customer counts and LTV by tier in memory
  const customerCountMap = new Map<string, number>();
  const ltvTotals = new Map<string, { total: number; count: number }>();
  const customersByTier = new Map<string, string[]>();

  allCustomersWithTier.forEach(c => {
    if (c.currentTierId) {
      // Count customers per tier
      customerCountMap.set(c.currentTierId, (customerCountMap.get(c.currentTierId) || 0) + 1);

      // Track total spent for LTV calculation
      const existing = ltvTotals.get(c.currentTierId) || { total: 0, count: 0 };
      existing.total += Number(c.totalSpent || 0);
      existing.count += 1;
      ltvTotals.set(c.currentTierId, existing);

      // Group customer IDs by tier
      const customerIds = customersByTier.get(c.currentTierId) || [];
      customerIds.push(c.id);
      customersByTier.set(c.currentTierId, customerIds);
    }
  });

  // Calculate average LTV per tier
  const ltvMap = new Map<string, number>();
  ltvTotals.forEach((data, tierId) => {
    ltvMap.set(tierId, data.count > 0 ? data.total / data.count : 0);
  });

  // Get all customer IDs for order queries
  const allCustomerIds = allCustomersWithTier.map(c => c.id);

  // BATCH QUERY 3: Get all order data for current month in one query
  const [allOrders, allActiveCustomerOrders] = await Promise.all([
    // All orders in current month for all tier customers
    db.order.findMany({
      where: {
        shop,
        customerId: { in: allCustomerIds },
        shopifyCreatedAt: {
          gte: currentMonthRange.start,
          lte: currentMonthRange.end,
        },
        financialStatus: {
          in: ['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'],
        },
      },
      select: {
        customerId: true,
        netAmount: true,
        cashbackAmount: true,
      },
    }),
    // Distinct customers who ordered this month (for active count)
    db.order.findMany({
      where: {
        shop,
        customerId: { in: allCustomerIds },
        shopifyCreatedAt: {
          gte: currentMonthRange.start,
          lte: currentMonthRange.end,
        },
        financialStatus: {
          in: ['PAID', 'PARTIALLY_PAID'],
        },
      },
      distinct: ['customerId'],
      select: { customerId: true },
    }),
  ]);

  // Create customer to tier lookup
  const customerToTier = new Map(
    allCustomersWithTier.map(c => [c.id, c.currentTierId])
  );

  // Aggregate order data by tier in memory (much faster than N queries)
  const orderDataByTier = new Map<string, { revenue: number; cashback: number; orderCount: number }>();
  allOrders.forEach(order => {
    const tierId = customerToTier.get(order.customerId);
    if (tierId) {
      const existing = orderDataByTier.get(tierId) || { revenue: 0, cashback: 0, orderCount: 0 };
      existing.revenue += Number(order.netAmount || 0);
      existing.cashback += Number(order.cashbackAmount || 0);
      existing.orderCount += 1;
      orderDataByTier.set(tierId, existing);
    }
  });

  // Count active customers by tier
  const activeCustomersByTier = new Map<string, Set<string>>();
  allActiveCustomerOrders.forEach(order => {
    const tierId = customerToTier.get(order.customerId);
    if (tierId) {
      const existing = activeCustomersByTier.get(tierId) || new Set();
      existing.add(order.customerId);
      activeCustomersByTier.set(tierId, existing);
    }
  });

  // BATCH QUERY 4: Get retention data (previous month orders)
  const [lastMonthOrders, thisMonthOrders] = await Promise.all([
    db.order.findMany({
      where: {
        shop,
        customerId: { in: allCustomerIds },
        shopifyCreatedAt: {
          gte: previousMonthRange.start,
          lte: previousMonthRange.end,
        },
        financialStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
      },
      distinct: ['customerId'],
      select: { customerId: true },
    }),
    db.order.findMany({
      where: {
        shop,
        customerId: { in: allCustomerIds },
        shopifyCreatedAt: { gte: currentMonthRange.start },
        financialStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
      },
      distinct: ['customerId'],
      select: { customerId: true },
    }),
  ]);

  // Calculate retention by tier
  const lastMonthCustomerIds = new Set(lastMonthOrders.map(o => o.customerId));
  const thisMonthCustomerIds = new Set(thisMonthOrders.map(o => o.customerId));

  const retentionByTier = new Map<string, number>();
  tierIds.forEach(tierId => {
    const tierCustomerIds = customersByTier.get(tierId) || [];
    const lastMonthTierCustomers = tierCustomerIds.filter(id => lastMonthCustomerIds.has(id));
    if (lastMonthTierCustomers.length === 0) {
      retentionByTier.set(tierId, 0);
    } else {
      const retained = lastMonthTierCustomers.filter(id => thisMonthCustomerIds.has(id));
      retentionByTier.set(tierId, (retained.length / lastMonthTierCustomers.length) * 100);
    }
  });

  // Build final metrics from aggregated data
  const tierMetrics = tiers.map(tier => {
    const customerCount = customerCountMap.get(tier.id) || 0;
    const lifetimeValue = ltvMap.get(tier.id) || 0;
    const orderData = orderDataByTier.get(tier.id) || { revenue: 0, cashback: 0, orderCount: 0 };
    const activeCustomerCount = activeCustomersByTier.get(tier.id)?.size || 0;
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
