/**
 * Program Impact Analytics Service
 * Tracks loyalty program usage and influenced sales
 */

import db from "../db.server";
import { getCachedOrCompute } from "~/utils/analytics-cache.server";

export interface ProgramImpactMetrics {
  currentUsageRate: number; // Percentage of cashback earned that has been redeemed
  totalInfluencedSales: number; // Cumulative revenue from orders with cashback
  previousUsageRate: number; // Usage rate from previous month
  usageRateChange: number; // Percentage point change
}

export interface MonthlyImpactData {
  month: string; // e.g., "Nov"
  usageRate: number; // Percentage
  cumulativeSales: number; // Running total of influenced sales
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
 * Calculate reward usage rate
 * Usage Rate = (Total Earned - Current Balance) / Total Earned * 100
 */
async function calculateUsageRate(shop: string): Promise<number> {
  const customers = await db.customer.aggregate({
    where: { shop },
    _sum: {
      totalCashbackEarned: true, // Total earned
      storeCredit: true, // Current unused balance
    },
  });

  const totalEarned = Number(customers._sum.totalCashbackEarned || 0);
  const currentBalance = Number(customers._sum.storeCredit || 0);

  if (totalEarned === 0) {
    return 0; // No cashback earned yet
  }

  const totalUsed = totalEarned - currentBalance;
  const usageRate = (totalUsed / totalEarned) * 100;

  // Clamp to 0-100% range (shouldn't exceed, but just in case)
  return Math.max(0, Math.min(100, usageRate));
}

/**
 * Calculate total influenced sales (all-time)
 * Influenced sales = orders where cashback was processed
 */
async function calculateInfluencedSales(shop: string): Promise<number> {
  const result = await db.order.aggregate({
    where: {
      shop,
      cashbackProcessed: true, // Orders that earned cashback
      financialStatus: {
        in: ['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'],
      },
    },
    _sum: {
      netAmount: true,
    },
  });

  return Number(result._sum.netAmount || 0);
}

/**
 * Fetch program impact metrics
 */
async function fetchProgramImpactMetrics(shop: string): Promise<ProgramImpactMetrics> {
  console.log(`[Program Impact] Fetching metrics for ${shop}`);

  // Calculate current and previous usage rates in parallel
  const [currentUsageRate, totalInfluencedSales, previousUsageRate] = await Promise.all([
    calculateUsageRate(shop),
    calculateInfluencedSales(shop),
    // For simplicity, we're using current rate vs current rate as baseline
    // In a full implementation, you'd track historical usage rates
    calculateUsageRate(shop),
  ]);

  // For now, calculate a representative change
  // In production, you'd store historical usage rates
  const usageRateChange = 0; // Placeholder - would need historical tracking

  console.log(`[Program Impact] Current Usage Rate: ${currentUsageRate.toFixed(1)}%`);
  console.log(`[Program Impact] Total Influenced Sales: $${totalInfluencedSales.toFixed(2)}`);

  return {
    currentUsageRate,
    totalInfluencedSales,
    previousUsageRate: currentUsageRate, // Placeholder
    usageRateChange, // Placeholder
  };
}

/**
 * Fetch historical monthly data (last 12 months) - OPTIMIZED v2
 * Uses aggregate queries per month instead of fetching all records
 * This prevents loading millions of ledger entries into memory
 */
async function fetchMonthlyImpactData(shop: string): Promise<MonthlyImpactData[]> {
  console.log(`[Program Impact] Fetching monthly historical data for ${shop} (aggregate-based)`);

  const now = new Date();

  // Build month ranges for parallel aggregate queries
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

  // Parallel aggregate queries for each month (36 total, but each returns a single number)
  const [creditsPerMonth, debitsPerMonth, salesPerMonth] = await Promise.all([
    // Credits (earned) per month
    Promise.all(
      monthRanges.map(({ start, end }) =>
        db.storeCreditLedger.aggregate({
          where: {
            shop,
            createdAt: { gte: start, lte: end },
            amount: { gt: 0 },
            type: { in: ['CASHBACK_EARNED', 'REFUND_CREDIT', 'MANUAL_ADJUSTMENT'] },
          },
          _sum: { amount: true },
        }).then(r => Number(r._sum.amount || 0))
      )
    ),
    // Debits (redeemed) per month
    Promise.all(
      monthRanges.map(({ start, end }) =>
        db.storeCreditLedger.aggregate({
          where: {
            shop,
            createdAt: { gte: start, lte: end },
            amount: { lt: 0 },
            type: 'ORDER_PAYMENT',
          },
          _sum: { amount: true },
        }).then(r => Math.abs(Number(r._sum.amount || 0)))
      )
    ),
    // Influenced sales per month
    Promise.all(
      monthRanges.map(({ start, end }) =>
        db.order.aggregate({
          where: {
            shop,
            cashbackProcessed: true,
            financialStatus: { in: ['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'] },
            shopifyCreatedAt: { gte: start, lte: end },
          },
          _sum: { netAmount: true },
        }).then(r => Number(r._sum.netAmount || 0))
      )
    ),
  ]);

  console.log(`[Program Impact] Fetched aggregates for ${monthRanges.length} months`);

  // Calculate cumulative values from monthly totals
  let cumulativeEarned = 0;
  let cumulativeUsed = 0;
  let cumulativeSales = 0;

  const monthlyData: MonthlyImpactData[] = monthRanges.map((month, i) => {
    cumulativeEarned += creditsPerMonth[i];
    cumulativeUsed += debitsPerMonth[i];
    cumulativeSales += salesPerMonth[i];

    const usageRate = cumulativeEarned > 0
      ? (cumulativeUsed / cumulativeEarned) * 100
      : 0;

    console.log(`[Program Impact] ${month.name}: Usage=${usageRate.toFixed(1)}%, Sales=$${cumulativeSales.toFixed(2)}`);

    return {
      month: month.name,
      usageRate: Math.round(usageRate * 10) / 10,
      cumulativeSales: Math.round(cumulativeSales * 100) / 100,
    };
  });

  console.log(`[Program Impact] Generated ${monthlyData.length} months of data (aggregate-based)`);
  return monthlyData;
}

/**
 * Get program impact metrics with caching
 */
export async function getProgramImpactMetrics(shop: string): Promise<ProgramImpactMetrics> {
  const cacheKey = `program-impact:${shop}:current`;

  return getCachedOrCompute(
    cacheKey,
    () => fetchProgramImpactMetrics(shop),
    60000 // 60 second cache
  );
}

/**
 * Get monthly impact data with caching
 */
export async function getMonthlyImpactData(shop: string): Promise<MonthlyImpactData[]> {
  const cacheKey = `program-impact:${shop}:monthly`;

  return getCachedOrCompute(
    cacheKey,
    () => fetchMonthlyImpactData(shop),
    300000 // 5 minute cache (historical data changes less frequently)
  );
}
