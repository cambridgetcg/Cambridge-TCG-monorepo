/**
 * Comparison Service - Period and benchmark comparisons for analytics
 *
 * Provides:
 * - Time period comparisons (week, month, quarter, year)
 * - Internal benchmarking (historical average, best period, goals)
 * - Industry benchmarks
 * - Cohort comparisons
 * - Segment comparisons
 */

import { db } from "~/db.server";
import { analyticsCache } from "./cache.service";

// Cache TTL constants
const COMPARISON_CACHE_TTL = 60_000; // 60 seconds
const BENCHMARK_CACHE_TTL = 120_000; // 2 minutes (benchmarks change less frequently)

// Helper to generate cache keys
function comparisonCacheKey(shop: string, metric: string, start: Date, end: Date): string {
  return `comparison:${shop}:${metric}:${start.getTime()}:${end.getTime()}`;
}

function benchmarkCacheKey(shop: string, metric: string): string {
  return `benchmark:${shop}:${metric}`;
}

// Helper to safely convert Decimal/number values (Data API returns plain numbers, Prisma returns Decimal objects)
// Uses Number() which calls valueOf() - more reliable than .toNumber() which can fail in minified builds
function toNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  // Use Number() instead of .toNumber() - it works via valueOf() and is more reliable
  // .toNumber() can fail in minified code due to prototype chain issues
  const num = Number(value);
  return isNaN(num) ? 0 : num;
}

// ============================================================================
// Types
// ============================================================================

export type ComparisonType = 'period' | 'benchmark' | 'cohort' | 'segment';
export type PeriodType = '7d' | '30d' | '90d' | '365d' | 'custom';
export type DisplayFormat = 'side-by-side' | 'overlay' | 'variance' | 'sparkline';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface ComparisonConfig {
  metric: string;
  primaryPeriod: DateRange;
  comparisonPeriod: DateRange;
  comparisonType: ComparisonType;
  displayFormat: DisplayFormat;
}

export interface MetricValue {
  value: number;
  formatted: string;
  date?: Date;
}

export interface ChangeResult {
  absolute: number;
  percentage: number;
  direction: 'up' | 'down' | 'flat';
  significance: 'significant' | 'marginal' | 'none';
}

export interface ComparisonResult {
  metric: string;
  primary: MetricValue;
  comparison: MetricValue;
  change: ChangeResult;
  insight?: string;
}

export interface BenchmarkData {
  metric: string;
  value: number;
  label: string;
  source: 'historical_average' | 'best_period' | 'goal' | 'industry';
}

// Industry benchmark defaults
export const INDUSTRY_BENCHMARKS: Record<string, BenchmarkData> = {
  redemption_rate: {
    metric: 'redemption_rate',
    value: 20,
    label: 'Industry Average',
    source: 'industry',
  },
  points_to_revenue_ratio: {
    metric: 'points_to_revenue_ratio',
    value: 2,
    label: 'Industry Average',
    source: 'industry',
  },
  vip_customer_percentage: {
    metric: 'vip_customer_percentage',
    value: 12,
    label: 'Industry Average',
    source: 'industry',
  },
  tier_progression_rate: {
    metric: 'tier_progression_rate',
    value: 7.5,
    label: 'Industry Average',
    source: 'industry',
  },
  customer_retention_rate: {
    metric: 'customer_retention_rate',
    value: 65,
    label: 'Industry Average',
    source: 'industry',
  },
  cashback_utilization: {
    metric: 'cashback_utilization',
    value: 70,
    label: 'Industry Target',
    source: 'industry',
  },
};

// ============================================================================
// Comparison Service Class
// ============================================================================

export class ComparisonService {
  private shop: string;

  constructor(shop: string) {
    this.shop = shop;
  }

  /**
   * Compare a metric across two time periods
   */
  async comparePeriods(
    metric: string,
    primaryPeriod: DateRange,
    comparisonPeriod: DateRange
  ): Promise<ComparisonResult> {
    const [primaryValue, comparisonValue] = await Promise.all([
      this.getMetricValue(metric, primaryPeriod),
      this.getMetricValue(metric, comparisonPeriod),
    ]);

    const change = this.calculateChange(primaryValue.value, comparisonValue.value);
    const insight = this.generateInsight(metric, change, primaryValue.value, comparisonValue.value);

    return {
      metric,
      primary: primaryValue,
      comparison: comparisonValue,
      change,
      insight,
    };
  }

  /**
   * Compare multiple metrics at once
   */
  async compareMultipleMetrics(
    metrics: string[],
    primaryPeriod: DateRange,
    comparisonPeriod: DateRange
  ): Promise<ComparisonResult[]> {
    return Promise.all(
      metrics.map(metric => this.comparePeriods(metric, primaryPeriod, comparisonPeriod))
    );
  }

  /**
   * Get benchmark comparison for a metric
   * Results are cached for 2 minutes to reduce DB load
   */
  async getBenchmarkComparison(metric: string): Promise<{
    current: MetricValue;
    benchmarks: Array<BenchmarkData & { comparison: 'above' | 'below' | 'at' }>;
  }> {
    // Check cache first
    const cacheKey = benchmarkCacheKey(this.shop, metric);
    const cached = analyticsCache.get<{
      current: MetricValue;
      benchmarks: Array<BenchmarkData & { comparison: 'above' | 'below' | 'at' }>;
    }>(cacheKey);
    if (cached) {
      return cached;
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const current = await this.getMetricValue(metric, { start: thirtyDaysAgo, end: new Date() });

    const benchmarks: Array<BenchmarkData & { comparison: 'above' | 'below' | 'at' }> = [];

    // Industry benchmark
    const industryBenchmark = INDUSTRY_BENCHMARKS[metric];
    if (industryBenchmark) {
      benchmarks.push({
        ...industryBenchmark,
        comparison: this.compareToBenchmark(current.value, industryBenchmark.value),
      });
    }

    // Historical average
    const historicalAvg = await this.getHistoricalAverage(metric, 90);
    if (historicalAvg > 0) {
      benchmarks.push({
        metric,
        value: historicalAvg,
        label: '90-Day Average',
        source: 'historical_average',
        comparison: this.compareToBenchmark(current.value, historicalAvg),
      });
    }

    // Best period
    const bestPeriod = await this.getBestPeriodValue(metric, 365);
    if (bestPeriod > 0) {
      benchmarks.push({
        metric,
        value: bestPeriod,
        label: 'Best (12mo)',
        source: 'best_period',
        comparison: this.compareToBenchmark(current.value, bestPeriod),
      });
    }

    const result = { current, benchmarks };

    // Cache the result
    analyticsCache.set(cacheKey, result, BENCHMARK_CACHE_TTL);

    return result;
  }

  /**
   * Get period presets for comparison picker
   */
  getPeriodPresets(): Array<{ label: string; value: PeriodType; getPeriods: () => { primary: DateRange; comparison: DateRange } }> {
    return [
      {
        label: 'vs Last Week',
        value: '7d',
        getPeriods: () => ({
          primary: this.getDateRange(7),
          comparison: this.getDateRange(7, 7),
        }),
      },
      {
        label: 'vs Last Month',
        value: '30d',
        getPeriods: () => ({
          primary: this.getDateRange(30),
          comparison: this.getDateRange(30, 30),
        }),
      },
      {
        label: 'vs Last Quarter',
        value: '90d',
        getPeriods: () => ({
          primary: this.getDateRange(90),
          comparison: this.getDateRange(90, 90),
        }),
      },
      {
        label: 'vs Last Year',
        value: '365d',
        getPeriods: () => ({
          primary: this.getDateRange(365),
          comparison: this.getDateRange(365, 365),
        }),
      },
    ];
  }

  // ============================================================================
  // Metric Value Retrieval
  // ============================================================================

  private async getMetricValue(metric: string, period: DateRange): Promise<MetricValue> {
    // Check cache first
    const cacheKey = comparisonCacheKey(this.shop, metric, period.start, period.end);
    const cached = analyticsCache.get<MetricValue>(cacheKey);
    if (cached) {
      return cached;
    }

    let value = 0;
    let result: MetricValue;

    switch (metric) {
      case 'revenue':
        value = await this.getRevenue(period);
        result = { value, formatted: this.formatCurrency(value) };
        break;

      case 'orders':
        value = await this.getOrderCount(period);
        result = { value, formatted: this.formatNumber(value) };
        break;

      case 'customers':
        value = await this.getCustomerCount(period);
        result = { value, formatted: this.formatNumber(value) };
        break;

      case 'new_members':
        value = await this.getNewMemberCount(period);
        result = { value, formatted: this.formatNumber(value) };
        break;

      case 'points_earned':
        value = await this.getPointsEarned(period);
        result = { value, formatted: this.formatNumber(value) };
        break;

      case 'points_redeemed':
        value = await this.getPointsRedeemed(period);
        result = { value, formatted: this.formatNumber(value) };
        break;

      case 'redemption_rate':
        value = await this.getRedemptionRate(period);
        result = { value, formatted: this.formatPercent(value) };
        break;

      case 'cashback_earned':
        value = await this.getCashbackEarned(period);
        result = { value, formatted: this.formatCurrency(value) };
        break;

      case 'cashback_used':
        value = await this.getCashbackUsed(period);
        result = { value, formatted: this.formatCurrency(value) };
        break;

      case 'aov':
        value = await this.getAOV(period);
        result = { value, formatted: this.formatCurrency(value) };
        break;

      case 'tier_upgrades':
        value = await this.getTierUpgrades(period);
        result = { value, formatted: this.formatNumber(value) };
        break;

      default:
        result = { value: 0, formatted: '0' };
    }

    // Cache the result
    analyticsCache.set(cacheKey, result, COMPARISON_CACHE_TTL);

    return result;
  }

  // ============================================================================
  // Data Fetching Methods
  // ============================================================================

  private async getRevenue(period: DateRange): Promise<number> {
    const result = await db.order.aggregate({
      where: {
        shop: this.shop,
        createdAt: { gte: period.start, lte: period.end },
      },
      _sum: { totalPrice: true },
    });
    return toNumber(result._sum.totalPrice);
  }

  private async getOrderCount(period: DateRange): Promise<number> {
    return db.order.count({
      where: {
        shop: this.shop,
        createdAt: { gte: period.start, lte: period.end },
      },
    });
  }

  private async getCustomerCount(period: DateRange): Promise<number> {
    return db.customer.count({
      where: {
        shop: this.shop,
        lastOrderDate: { gte: period.start, lte: period.end },
      },
    });
  }

  private async getNewMemberCount(period: DateRange): Promise<number> {
    return db.customer.count({
      where: {
        shop: this.shop,
        createdAt: { gte: period.start, lte: period.end },
      },
    });
  }

  private async getPointsEarned(period: DateRange): Promise<number> {
    const result = await db.pointsLedger.aggregate({
      where: {
        shop: this.shop,
        createdAt: { gte: period.start, lte: period.end },
        type: 'EARN',
      },
      _sum: { amount: true },
    });
    return result._sum.amount || 0;
  }

  private async getPointsRedeemed(period: DateRange): Promise<number> {
    const result = await db.pointsLedger.aggregate({
      where: {
        shop: this.shop,
        createdAt: { gte: period.start, lte: period.end },
        type: 'REDEEM',
      },
      _sum: { amount: true },
    });
    return Math.abs(result._sum.amount || 0);
  }

  private async getRedemptionRate(period: DateRange): Promise<number> {
    const [earned, redeemed] = await Promise.all([
      this.getPointsEarned(period),
      this.getPointsRedeemed(period),
    ]);
    return earned > 0 ? (redeemed / earned) * 100 : 0;
  }

  private async getCashbackEarned(period: DateRange): Promise<number> {
    const result = await db.storeCreditLedger.aggregate({
      where: {
        shop: this.shop,
        createdAt: { gte: period.start, lte: period.end },
        type: 'EARN',
      },
      _sum: { amount: true },
    });
    return toNumber(result._sum.amount);
  }

  private async getCashbackUsed(period: DateRange): Promise<number> {
    const result = await db.storeCreditLedger.aggregate({
      where: {
        shop: this.shop,
        createdAt: { gte: period.start, lte: period.end },
        type: 'REDEEM',
      },
      _sum: { amount: true },
    });
    return Math.abs(toNumber(result._sum.amount));
  }

  private async getAOV(period: DateRange): Promise<number> {
    const [revenue, orders] = await Promise.all([
      this.getRevenue(period),
      this.getOrderCount(period),
    ]);
    return orders > 0 ? revenue / orders : 0;
  }

  private async getTierUpgrades(period: DateRange): Promise<number> {
    return db.tierEvent.count({
      where: {
        shop: this.shop,
        createdAt: { gte: period.start, lte: period.end },
        eventType: 'UPGRADE',
      },
    });
  }

  private async getHistoricalAverage(metric: string, days: number): Promise<number> {
    const period = this.getDateRange(days);
    const value = await this.getMetricValue(metric, period);
    return value.value;
  }

  private async getBestPeriodValue(metric: string, lookbackDays: number): Promise<number> {
    // Check cache first - best period values change slowly
    const cacheKey = `bestPeriod:${this.shop}:${metric}:${lookbackDays}`;
    const cached = analyticsCache.get<number>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Simplified - check monthly values and return best
    // Run queries in parallel for better performance
    const monthsToCheck = Math.min(Math.floor(lookbackDays / 30), 12);
    const periods = Array.from({ length: monthsToCheck }, (_, i) => this.getDateRange(30, i * 30));

    const values = await Promise.all(
      periods.map(period => this.getMetricValue(metric, period))
    );

    const best = Math.max(0, ...values.map(v => v.value));

    // Cache for 5 minutes (best period changes slowly)
    analyticsCache.set(cacheKey, best, 300_000);

    return best;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private calculateChange(current: number, previous: number): ChangeResult {
    if (previous === 0) {
      return {
        absolute: current,
        percentage: current > 0 ? 100 : 0,
        direction: current > 0 ? 'up' : 'flat',
        significance: current > 0 ? 'significant' : 'none',
      };
    }

    const absolute = current - previous;
    const percentage = (absolute / previous) * 100;

    let direction: 'up' | 'down' | 'flat';
    if (percentage > 0.5) direction = 'up';
    else if (percentage < -0.5) direction = 'down';
    else direction = 'flat';

    let significance: 'significant' | 'marginal' | 'none';
    const absPercentage = Math.abs(percentage);
    if (absPercentage >= 10) significance = 'significant';
    else if (absPercentage >= 2) significance = 'marginal';
    else significance = 'none';

    return { absolute, percentage, direction, significance };
  }

  private compareToBenchmark(value: number, benchmark: number): 'above' | 'below' | 'at' {
    const diff = ((value - benchmark) / benchmark) * 100;
    if (diff > 5) return 'above';
    if (diff < -5) return 'below';
    return 'at';
  }

  private generateInsight(metric: string, change: ChangeResult, current: number, previous: number): string {
    const metricLabels: Record<string, string> = {
      revenue: 'Revenue',
      orders: 'Order count',
      customers: 'Active customers',
      new_members: 'New member signups',
      points_earned: 'Points earned',
      points_redeemed: 'Points redeemed',
      redemption_rate: 'Redemption rate',
      cashback_earned: 'Cashback earned',
      cashback_used: 'Cashback used',
      aov: 'Average order value',
      tier_upgrades: 'Tier upgrades',
    };

    const label = metricLabels[metric] || metric;

    if (change.significance === 'none') {
      return `${label} remained stable compared to the previous period.`;
    }

    const direction = change.direction === 'up' ? 'increased' : 'decreased';
    const significance = change.significance === 'significant' ? 'significantly' : 'slightly';

    return `${label} ${significance} ${direction} by ${Math.abs(change.percentage).toFixed(1)}%.`;
  }

  private getDateRange(days: number, offsetDays: number = 0): DateRange {
    const end = new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    return { start, end };
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
  }

  private formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
  }
}

// ============================================================================
// Factory & Exports
// ============================================================================

export function createComparisonService(shop: string): ComparisonService {
  return new ComparisonService(shop);
}

export default ComparisonService;
