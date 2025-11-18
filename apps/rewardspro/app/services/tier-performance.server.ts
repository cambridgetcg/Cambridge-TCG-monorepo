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
 */
async function fetchTierPerformanceMetrics(
  shop: string,
  year: number,
  month: number
): Promise<TierPerformanceMetrics[]> {
  const currentMonthRange = getMonthRange(year, month);
  const previousPeriod = getPreviousPeriod();
  const previousMonthRange = getMonthRange(previousPeriod.year, previousPeriod.month);

  console.log(`[Tier Performance] Fetching metrics for ${shop}`);
  console.log(`[Tier Performance] Current period: ${year}-${month}`);

  // Get all tiers for this shop
  const tiers = await db.tier.findMany({
    where: { shop },
    orderBy: { minSpend: 'asc' },
    select: {
      id: true,
      name: true,
      cashbackPercent: true,
    },
  });

  if (tiers.length === 0) {
    console.log('[Tier Performance] No tiers found for shop');
    return [];
  }

  // Get shop profit margin setting
  const shopSettings = await db.shopSettings.findUnique({
    where: { shop },
    select: { averageProfitMargin: true },
  });
  const profitMargin = shopSettings?.averageProfitMargin
    ? Number(shopSettings.averageProfitMargin)
    : 40; // Default 40% if not set

  console.log(`[Tier Performance] Using profit margin: ${profitMargin}%`);

  // Build metrics for each tier
  const tierMetrics = await Promise.all(
    tiers.map(async (tier) => {
      // 1. Get all customers in this tier
      const tierCustomers = await db.customer.findMany({
        where: {
          shop,
          currentTierId: tier.id,
        },
        select: {
          id: true,
        },
      });

      const customerCount = tierCustomers.length;
      const tierCustomerIds = tierCustomers.map(c => c.id);

      // If no customers in this tier, return empty metrics
      if (tierCustomerIds.length === 0) {
        console.log(`[Tier Performance] ${tier.name}: No customers`);
        return {
          id: tier.id,
          name: tier.name,
          members: 0,
          customerCount: 0,
          cashbackPercent: tier.cashbackPercent,
          monthlyOrderFrequency: 0,
          revenuePerOrder: 0,
          grossProfitPerCustomerPerMonth: 0,
          averageOrderValue: 0,
          lifetimeValue: 0,
          retentionRate: 0,
          totalCashbackEarned: 0,
        };
      }

      // 2-6, 8. Order metrics for current month
      const orderAggregation = await db.order.aggregate({
        where: {
          shop,
          customerId: { in: tierCustomerIds },
          shopifyCreatedAt: {
            gte: currentMonthRange.start,
            lte: currentMonthRange.end,
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
        },
      });

      // Get distinct customers who ordered this month (for active customer count)
      const activeCustomers = await db.order.findMany({
        where: {
          shop,
          customerId: { in: tierCustomerIds },
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

      const activeCustomerCount = activeCustomers.length;
      const orderCount = orderAggregation._count.id;
      const totalRevenue = Number(orderAggregation._sum.netAmount || 0);
      const totalCashback = Number(orderAggregation._sum.cashbackAmount || 0);

      // 2. Monthly Order Frequency (orders per customer)
      const monthlyOrderFrequency =
        activeCustomerCount > 0 ? orderCount / activeCustomerCount : 0;

      // 3 & 5. Revenue Per Order / Average Order Value
      const revenuePerOrder = orderCount > 0 ? totalRevenue / orderCount : 0;

      // 4. Monthly Gross Profit Per Customer
      const totalGrossProfit = totalRevenue * (profitMargin / 100);
      const grossProfitPerCustomerPerMonth =
        customerCount > 0 ? totalGrossProfit / customerCount : 0;

      // 6. Customer Lifetime Value (all-time average)
      const lifetimeValueAgg = await db.customer.aggregate({
        where: {
          shop,
          id: { in: tierCustomerIds },
        },
        _avg: {
          totalSpent: true,
        },
      });
      const lifetimeValue = Number(lifetimeValueAgg._avg.totalSpent || 0);

      // 7. Retention Rate
      let retentionRate = 0;
      try {
        retentionRate = await calculateRetentionRate(
          shop,
          tierCustomerIds,
          currentMonthRange,
          previousMonthRange
        );
      } catch (error) {
        console.error(`[Tier Performance] Error calculating retention for ${tier.name}:`, error);
        retentionRate = 0;
      }

      // 8. Total Cashback Earned (per customer average)
      const cashbackPerCustomer =
        customerCount > 0 ? totalCashback / customerCount : 0;

      console.log(`[Tier Performance] ${tier.name}:`);
      console.log(`  - Members: ${customerCount}`);
      console.log(`  - Active Customers (ordered this month): ${activeCustomerCount}`);
      console.log(`  - Orders: ${orderCount}`);
      console.log(`  - Monthly Order Frequency: ${monthlyOrderFrequency.toFixed(2)}`);
      console.log(`  - Revenue Per Order: $${revenuePerOrder.toFixed(2)}`);
      console.log(`  - Gross Profit/Customer/Month: $${grossProfitPerCustomerPerMonth.toFixed(2)}`);
      console.log(`  - Lifetime Value: $${lifetimeValue.toFixed(2)}`);
      console.log(`  - Retention Rate: ${retentionRate.toFixed(1)}%`);
      console.log(`  - Cashback/Customer: $${cashbackPerCustomer.toFixed(2)}`);

      return {
        id: tier.id,
        name: tier.name,
        members: customerCount,
        customerCount: customerCount,
        cashbackPercent: tier.cashbackPercent,
        monthlyOrderFrequency: Math.round(monthlyOrderFrequency * 100) / 100,
        revenuePerOrder: Math.round(revenuePerOrder * 100) / 100,
        grossProfitPerCustomerPerMonth: Math.round(grossProfitPerCustomerPerMonth * 100) / 100,
        averageOrderValue: Math.round(revenuePerOrder * 100) / 100, // Same as revenuePerOrder
        lifetimeValue: Math.round(lifetimeValue * 100) / 100,
        retentionRate: Math.round(retentionRate * 10) / 10,
        totalCashbackEarned: Math.round(cashbackPerCustomer * 100) / 100,
      };
    })
  );

  console.log('[Tier Performance] Metrics fetched successfully');
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
