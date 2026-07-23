import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import { useState, useCallback, useMemo, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  Button,
  Tabs,
  BlockStack,
  InlineStack,
  Banner,
  Box,
  Divider,
  DataTable,
  ProgressBar,
  EmptyState,
  TextField,
  FormLayout,
} from "@shopify/polaris";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { TierBadge } from "../components/TierBadge";
import { TierPerformanceChart } from "../components/analytics/TierPerformanceChart";
import { sortTiersByPriority } from "../utils/tier-styles";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  PRICING_PLANS,
  UNLIMITED_PLAN_LIMIT,
} from "../constants/pricing-contract";
import { getEntitlements } from "../services/entitlements.server";
import { formatCurrency } from "../utils/currency";
import { AnalyticsRecommendationsService } from "~/services/analytics-recommendations.server";
import { getCachedOrCompute } from "~/utils/analytics-cache.server";
import {
  getOverviewMetricsWithComparison,
  type OverviewMetrics,
  type MetricsComparison
} from "~/services/analytics-metrics.server";
import { getTierPerformanceMetrics, getMonthlyTierRevenue } from "~/services/tier-performance.server";
import {
  getProgramImpactMetrics,
  getMonthlyImpactData,
  type ProgramImpactMetrics,
  type MonthlyImpactData
} from "~/services/program-impact.server";
import { getCohortAnalysis, type CohortAnalysis } from "~/services/cohort-analysis.server";
import { getCustomerBehaviourData, type CustomerBehaviourData } from "~/services/rfm-segmentation.server";
import {
  createInsightEngine,
  type AnalyticsInsight,
  type HealthScore,
} from "~/services/analytics/insight-engine.server";
import {
  createComparisonService,
  type ComparisonResult,
} from "~/services/analytics/comparison.server";
import {
  createNarrativeGenerator,
  type ExecutiveSummary as ExecutiveSummaryType,
} from "~/services/analytics/narrative-generator.server";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler
);

// ============================================
// TYPE DEFINITIONS
// ============================================

interface AnalyticsData {
  // Overview metrics - REAL DATA
  overviewMetrics: OverviewMetrics;
  previousMetrics: OverviewMetrics;
  metricsChanges: MetricsComparison['changes'];

  // Legacy metrics - NEW STRUCTURE (for tier analytics)
  monthlyOrderFrequency: number; // Orders per customer per month
  revenuePerOrder: number; // Average revenue per order
  grossProfitPerCustomerPerMonth: number; // Monthly gross profit per customer

  // Tier analytics - SIMPLIFIED
  tierPerformance: {
    id: string;
    name: string;
    members: number;
    customerCount: number; // For Doughnut chart
    cashbackPercent: number;
    monthlyOrderFrequency: number;
    revenuePerOrder: number;
    grossProfitPerCustomerPerMonth: number;
    // For Radar chart
    averageOrderValue: number;
    lifetimeValue: number;
    retentionRate: number;
    totalCashbackEarned: number;
  }[];

  // Monthly time-series data for charts (last 12 months)
  monthlyTierTrends: {
    month: string; // e.g., "Jan 2025"
    tiers: {
      tierName: string;
      orderFrequency: number;
      revenuePerOrder: number;
      grossProfit: number;
      revenue: number; // For Stacked Area chart
    }[];
  }[];

  // Program Impact - REAL DATA
  programImpact: ProgramImpactMetrics;
  monthlyImpactData: MonthlyImpactData[];

  // Placeholder for future implementation
  trends: {
    revenue: TrendData[];
    members: TrendData[];
    orders: TrendData[];
    credit: TrendData[];
  };

  // Legacy insights removed - use aiInsights instead

  financial: {
    directRevenue: number;
    creditIssued: number;
    creditRedeemed: number;
    netValue: number;
    roi: number;
    costBreakdown: {
      creditCost: number;
      operationalCost: number;
    };
  };
  
  // Customer segments
  segments: {
    vip: { count: number; revenue: number; avgCredit: number; };
    atRisk: { count: number; revenue: number; churnRisk: number; };
    new: { count: number; revenue: number; activationRate: number; };
    dormant: { count: number; lastRevenue: number; daysSinceLastOrder: number; };
  };
  
  // Comparison data
  comparison: {
    period: 'week' | 'month' | 'quarter' | 'year';
    current: number;
    previous: number;
    change: number;
  };
  
  shopSettings: {
    storeCurrency: string;
    currencyDisplayType: string;
    averageProfitMargin: string | null;
    averageShippingCost: string | null;
    averageTransactionFee: string | null;
    averageReturnRate: string | null;
    metricsLastUpdated: string | null;
    metricsLastUpdatedDisplay: string | null; // Pre-formatted for consistent SSR/CSR
    advancedAnalyticsEnabled: boolean;
  } | null;

  // Auto-calculated business metrics
  autoCalculatedMetrics: {
    customerLifetimeValue: number;
    repeatPurchaseRate: number;
    actualRetentionRate: number;
  };

  // Customer Behaviour Analysis - REAL DATA
  customerBehaviourData: {
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
    // RFM Customer Segments
    rfmSegments: {
      champions: number;      // High R, F, M - Best customers
      loyalCustomers: number; // High F, M - Regular big spenders
      potentialLoyalists: number; // Recent with medium frequency
      newCustomers: number;   // Very recent, low frequency
      promising: number;      // Recent, medium F & M
      needsAttention: number; // Above average but slipping
      aboutToSleep: number;   // Below average, not recent
      atRisk: number;         // High value but haven't purchased recently
      cantLoseThem: number;   // Used to be high value, declining
      hibernating: number;    // Low R, F, M - Inactive
      lost: number;           // Haven't purchased in long time
    };
    // Engagement Metrics
    engagementMetrics: {
      activeRate: number;           // % active in last 30 days
      dormantRate: number;          // % inactive 60-90 days
      churnRiskRate: number;        // % at risk of churning
      avgDaysBetweenOrders: number; // Average purchase gap
      avgDaysSinceLastOrder: number; // Recency indicator
      redemptionRate: number;       // % who redeemed rewards
      programEngagementScore: number; // 0-100 overall engagement
    };
    // Psychology-based Insights
    behavioralInsights: {
      habitStrength: number;        // 0-100, based on consistency
      emotionalLoyaltyScore: number; // 0-100, based on engagement
      churnProbability: number;     // 0-100, likelihood to churn
      upsellPotential: number;      // 0-100, likelihood to increase spend
    };
  };

  // Marketing recommendations from analytics insights
  recommendations?: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    affectedCount: number;
    predictedRevenue: number | null;
    priority: number;
    status: string;
  }>;

  // Advisory capacity guide; it never restricts access to existing history.
  maxHistoricalDays: number;

  // NEW: Insight Engine Data
  aiInsights: AnalyticsInsight[];
  healthScore: HealthScore | null;
  executiveSummary: ExecutiveSummaryType | null;
  keyComparisons: ComparisonResult[];

  // Cohort Analysis Data
  cohortAnalysis: {
    // Retention cohorts - grouped by first order month
    retentionCohorts: {
      cohortMonth: string; // e.g., "2024-07"
      cohortLabel: string; // e.g., "Jul 2024"
      initialCustomers: number;
      // Retention by month since first purchase (0 = first month, 1 = second month, etc.)
      retention: {
        monthIndex: number;
        activeCustomers: number;
        retentionRate: number; // percentage
        revenue: number;
      }[];
    }[];
    // Revenue cohorts - LTV progression
    revenueCohorts: {
      cohortMonth: string;
      cohortLabel: string;
      initialCustomers: number;
      // Cumulative revenue by month
      cumulativeRevenue: {
        monthIndex: number;
        totalRevenue: number;
        avgRevenuePerCustomer: number;
      }[];
    }[];
    // Tier progression cohorts
    tierProgressionCohorts: {
      cohortMonth: string;
      cohortLabel: string;
      initialCustomers: number;
      // Tier distribution over time
      tierDistribution: {
        monthIndex: number;
        tiers: {
          tierName: string;
          tierId: string | null;
          customerCount: number;
          percentage: number;
        }[];
      }[];
    }[];
    // Summary metrics
    summaryMetrics: {
      avgRetentionMonth1: number;
      avgRetentionMonth3: number;
      avgRetentionMonth6: number;
      avgRetentionMonth12: number;
      avgLTV30Days: number;
      avgLTV90Days: number;
      avgLTV180Days: number;
      avgLTV365Days: number;
      avgTimeToTierUpgrade: number; // days
      tierUpgradeRate: number; // percentage who upgraded at least once
    };
  };
}

interface TrendData {
  date: string;
  value: number;
  label?: string;
}

// ============================================
// LOADER - Fetch and calculate analytics
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const shop = session.shop;

  // Parse date range from query params (e.g. ?range=7days, ?range=30days, ?range=90days)
  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '30days';
  let dateRange: { start: Date; end: Date } | undefined;

  const rangeDaysMatch = range.match(/^(\d+)days$/);
  if (rangeDaysMatch) {
    const days = parseInt(rangeDaysMatch[1], 10);
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    dateRange = { start, end };
  }
  // If range doesn't match pattern, dateRange stays undefined → default month behavior

  try {
    // Fetch minimal data for UI structure, recommendations, and entitlements
    const [shopSettings, , entitlements] = await Promise.all([
      prisma.shopSettings.findUnique({ where: { shop } }),
      prisma.tier.findMany({
        where: { shop },
        orderBy: { minSpend: 'asc' },
      }),
      getEntitlements(shop),
    ]);

    const maxHistoricalDays =
      entitlements.limitMaxHistoricalDays ??
      PRICING_PLANS.free.limits.historicalDataDays;

    // Debug: Log shopSettings to verify advancedAnalyticsEnabled is being returned
    console.log('[Analytics Loader] shopSettings:', JSON.stringify({
      shop: shopSettings?.shop,
      advancedAnalyticsEnabled: (shopSettings as any)?.advancedAnalyticsEnabled,
      allKeys: shopSettings ? Object.keys(shopSettings) : []
    }));

    // Fetch analytics-powered recommendations
    let recommendations: any[] = [];
    try {
      const recommendationsService = new AnalyticsRecommendationsService(shop);
      recommendations = await recommendationsService.getActionRecommendations({
        status: 'pending',
        limit: 5 // Show top 5 recommendations in analytics view
      });
    } catch (error) {
      console.error('[Analytics] Error fetching recommendations:', error);
      // Continue without recommendations if there's an error
    }

    // Fetch REAL overview metrics, tier performance, program impact, and customer behaviour with caching
    // RESILIENT: Each query is wrapped so a single Data API failure doesn't crash the entire page.
    // Aurora Data API can throttle when too many concurrent requests fire at once.
    const SLOW_QUERY_MS = 1000;
    const safeQuery = async <T,>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> => {
      const start = Date.now();
      try {
        const result = await fn();
        const ms = Date.now() - start;
        if (ms >= SLOW_QUERY_MS) {
          console.warn(`[Analytics] ${label} slow: ${ms}ms`);
        } else {
          console.log(`[Analytics] ${label} ok: ${ms}ms`);
        }
        return result;
      } catch (error) {
        const ms = Date.now() - start;
        console.error(`[Analytics] ${label} failed after ${ms}ms (using fallback):`, error);
        return fallback;
      }
    };

    const emptyMetrics: OverviewMetrics = {
      totalRevenue: 0, totalOrders: 0, cashbackIssued: 0,
      activeCustomers: 0, avgOrderValue: 0, totalCustomers: 0,
    };
    const emptyComparison: MetricsComparison = {
      current: emptyMetrics, previous: emptyMetrics,
      changes: {
        revenueChange: 0, ordersChange: 0, cashbackChange: 0,
        activeCustomersChange: 0, avgOrderValueChange: 0, totalCustomersChange: 0,
      },
    };
    const emptyCustomerBehaviour: CustomerBehaviourData = {
      totalMembers: 0, totalNonMembers: 0, memberPercentage: 0,
      orderFrequencyLift: 0, aovIncrease: 0, revenueLift: 0,
      members: { avgOrders: 0, avgOrderValue: 0, lifetimeValue: 0, repeatPurchaseRate: 0 },
      nonMembers: { avgOrders: 0, avgOrderValue: 0, lifetimeValue: 0, repeatPurchaseRate: 0 },
      rfmSegments: {
        champions: 0, loyalCustomers: 0, potentialLoyalists: 0, newCustomers: 0,
        promising: 0, needsAttention: 0, aboutToSleep: 0, atRisk: 0,
        cantLoseThem: 0, hibernating: 0, lost: 0,
      },
      engagementMetrics: {
        activeRate: 0, dormantRate: 0, churnRiskRate: 0,
        avgDaysBetweenOrders: 0, avgDaysSinceLastOrder: 0,
        redemptionRate: 0, programEngagementScore: 0,
      },
      behavioralInsights: {
        habitStrength: 0, emotionalLoyaltyScore: 0, churnProbability: 0, upsellPotential: 0,
      },
    };
    const emptyCohort: CohortAnalysis = {
      retentionCohorts: [], revenueCohorts: [], tierProgressionCohorts: [],
      summaryMetrics: {
        avgRetentionMonth1: 0, avgRetentionMonth3: 0,
        avgRetentionMonth6: 0, avgRetentionMonth12: 0,
        avgLTV30Days: 0, avgLTV90Days: 0,
        avgLTV180Days: 0, avgLTV365Days: 0,
        avgTimeToTierUpgrade: 0, tierUpgradeRate: 0,
      },
    };

    // Bundled insights computation — runs in parallel with the other queries
    // below. Internally still does 2 round-trips (insights+health, then
    // comparisons), but those are no longer sequential with the metrics batch.
    const generateInsightsBlock = async (): Promise<{
      insights: AnalyticsInsight[];
      healthScore: HealthScore | null;
      executiveSummary: ExecutiveSummaryType | null;
      keyComparisons: ComparisonResult[];
    }> => {
      const insightEngine = createInsightEngine(shop);
      const comparisonService = createComparisonService(shop);
      const narrativeGenerator = createNarrativeGenerator();

      const [generatedInsights, generatedHealthScore] = await Promise.all([
        insightEngine.generateInsights(),
        insightEngine.calculateHealthScore(),
      ]);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

      const keyComparisons = await comparisonService.compareMultipleMetrics(
        ['revenue', 'orders', 'new_members', 'redemption_rate'],
        { start: thirtyDaysAgo, end: new Date() },
        { start: sixtyDaysAgo, end: thirtyDaysAgo }
      );

      const executiveSummary = narrativeGenerator.generateExecutiveSummary(
        generatedHealthScore,
        generatedInsights,
        keyComparisons,
        'this month'
      );

      return {
        insights: generatedInsights,
        healthScore: generatedHealthScore,
        executiveSummary,
        keyComparisons,
      };
    };

    const emptyInsightsBlock = {
      insights: [] as AnalyticsInsight[],
      healthScore: null as HealthScore | null,
      executiveSummary: null as ExecutiveSummaryType | null,
      keyComparisons: [] as ComparisonResult[],
    };

    const [
      metricsComparison,
      tierPerformance,
      programImpact,
      monthlyImpactData,
      customerBehaviourData,
      cohortAnalysis,
      monthlyTierRevenue,
      insightsBlock,
    ] = await Promise.all([
      safeQuery(() => getOverviewMetricsWithComparison(shop, dateRange), emptyComparison, 'OverviewMetrics'),
      safeQuery(() => getTierPerformanceMetrics(shop), [], 'TierPerformance'),
      safeQuery(() => getProgramImpactMetrics(shop), { currentUsageRate: 0, totalInfluencedSales: 0, previousUsageRate: 0, usageRateChange: 0 }, 'ProgramImpact'),
      safeQuery(() => getMonthlyImpactData(shop), [], 'MonthlyImpactData'),
      safeQuery(() => getCustomerBehaviourData(shop), emptyCustomerBehaviour, 'CustomerBehaviour'),
      safeQuery(() => getCohortAnalysis(shop), emptyCohort, 'CohortAnalysis'),
      safeQuery(() => getMonthlyTierRevenue(shop), [], 'MonthlyTierRevenue'),
      safeQuery(generateInsightsBlock, emptyInsightsBlock, 'InsightsBlock'),
    ]);

    const { insights, healthScore, executiveSummary, keyComparisons } = insightsBlock;

    console.log('[Analytics] InsightEngine generated:', {
      insightsCount: insights.length,
      healthScore: healthScore?.overall,
      comparisonsCount: keyComparisons.length,
    });

    // Calculate auto-metrics for business metrics configuration
    // OPTIMIZED: Reuse totalCustomers from metricsComparison instead of duplicate query
    const totalCustomersCount = metricsComparison.current.totalCustomers;

    // ============================================
    // OPTIMIZED: Cached + raw-SQL retention (Tier-1 perf pass)
    // ----------------------------------------------------------------
    // Previously these 3 queries fired uncached on every page load and
    // the retention block did 2 unbounded findMany calls. Now wrapped
    // in 5-min KV cache (survives cold starts) and retention computes
    // in a single round-trip via CTE.
    // ============================================
    const [ltv, repeatCustomersCount, retention] = await Promise.all([
      safeQuery(
        () => getCachedOrCompute(
          `analytics:ltv:${shop}`,
          () => prisma.customer.aggregate({ where: { shop }, _avg: { totalSpent: true } }),
          5 * 60_000,
        ),
        { _avg: { totalSpent: null } } as any,
        'CustomerLTV'
      ),
      safeQuery(
        () => getCachedOrCompute(
          `analytics:repeatCustomers:${shop}`,
          () => prisma.customer.count({ where: { shop, orderCount: { gt: 1 } } }),
          5 * 60_000,
        ),
        0,
        'RepeatCustomers'
      ),
      safeQuery(
        () => getCachedOrCompute(
          `analytics:retention:${shop}`,
          async () => {
            // Two findMany calls via the model proxy (Prisma's $queryRaw is
            // broken in the Data API adapter — joins template literals with
            // `?` instead of `:named`). Cached for 5 min so the O(N) cost
            // amortises.
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

            const lastMonthCustomers = await prisma.order.findMany({
              where: {
                shop,
                shopifyCreatedAt: { gte: lastMonthStart, lte: lastMonthEnd },
                financialStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
              },
              distinct: ['customerId'],
              select: { customerId: true },
            });

            if (lastMonthCustomers.length === 0) return 0;

            const lastMonthIds = new Set(lastMonthCustomers.map(o => o.customerId));

            const thisMonthRetained = await prisma.order.findMany({
              where: {
                shop,
                customerId: { in: Array.from(lastMonthIds) },
                shopifyCreatedAt: { gte: currentMonthStart },
                financialStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
              },
              distinct: ['customerId'],
              select: { customerId: true },
            });

            return (thisMonthRetained.length / lastMonthCustomers.length) * 100;
          },
          5 * 60_000,
        ),
        0,
        'RetentionRate'
      )
    ]);

    const customerLifetimeValue = Number(ltv._avg.totalSpent || 0);

    // OPTIMIZED: Calculate repeat purchase rate from database count
    const repeatPurchaseRate = totalCustomersCount > 0
      ? (repeatCustomersCount / totalCustomersCount) * 100
      : 0;
    const actualRetentionRate = retention;

    // ========================================
    // CUSTOMER BEHAVIOUR & RFM SEGMENTATION
    // ========================================
    // OPTIMIZED: Now handled by getCustomerBehaviourData() service with 5-minute caching
    // See app/services/rfm-segmentation.server.ts for implementation

    // ============================================
    // COHORT ANALYSIS
    // ============================================
    // OPTIMIZED: Now handled by getCohortAnalysis() service with 5-minute caching
    // See app/services/cohort-analysis.server.ts for implementation
    // - Limits customers to last 12 months (was fetching ALL customers)
    // - Caps at 5,000 customers max (prevents memory issues)
    // - Uses database aggregations where possible
    // - Reduces queries from ~10 full table scans to 3 optimized queries

    // Calculate weighted averages from tier performance data
    const totalCustomers = tierPerformance.reduce((sum, tier) => sum + tier.members, 0);
    const weightedOrderFreq = totalCustomers > 0
      ? tierPerformance.reduce((sum, tier) => sum + (tier.monthlyOrderFrequency * tier.members), 0) / totalCustomers
      : 0;
    const weightedGrossProfit = totalCustomers > 0
      ? tierPerformance.reduce((sum, tier) => sum + (tier.grossProfitPerCustomerPerMonth * tier.members), 0) / totalCustomers
      : 0;

    const analyticsData: AnalyticsData = {
      // REAL Overview metrics
      overviewMetrics: metricsComparison.current,
      previousMetrics: metricsComparison.previous,
      metricsChanges: metricsComparison.changes,

      // Legacy metrics (weighted average across all tiers)
      monthlyOrderFrequency: Math.round(weightedOrderFreq * 100) / 100,
      revenuePerOrder: metricsComparison.current.avgOrderValue, // Use real AOV
      grossProfitPerCustomerPerMonth: Math.round(weightedGrossProfit * 100) / 100,

      // REAL Tier performance data
      tierPerformance: tierPerformance,

      // REAL 12 months of historical tier revenue data from database
      monthlyTierTrends: monthlyTierRevenue.map(month => ({
        month: month.month,
        tiers: month.tiers.map(tier => ({
          tierName: tier.tierName,
          orderFrequency: tier.orderFrequency,
          revenuePerOrder: tier.revenuePerOrder,
          grossProfit: tier.grossProfit,
          revenue: tier.revenue, // For Stacked Area chart
        })),
      })),

      // REAL Program Impact data
      programImpact: programImpact,
      monthlyImpactData: monthlyImpactData,

      // Placeholder trend data (empty for now)
      trends: {
        revenue: [],
        members: [],
        orders: [],
        credit: [],
      },

      // Legacy insights removed - aiInsights is now the single source

      // Placeholder financial data
      financial: {
        directRevenue: 0,
        creditIssued: 0,
        creditRedeemed: 0,
        netValue: 0,
        roi: 0,
        costBreakdown: {
          creditCost: 0,
          operationalCost: 0,
        },
      },

      // Placeholder segments
      segments: {
        vip: { count: 0, revenue: 0, avgCredit: 0 },
        atRisk: { count: 0, revenue: 0, churnRisk: 0 },
        new: { count: 0, revenue: 0, activationRate: 0 },
        dormant: { count: 0, lastRevenue: 0, daysSinceLastOrder: 0 },
      },

      // Placeholder comparison
      comparison: {
        period: 'month' as const,
        current: 0,
        previous: 0,
        change: 0,
      },

      shopSettings: shopSettings ? {
        storeCurrency: shopSettings.storeCurrency,
        currencyDisplayType: shopSettings.currencyDisplayType,
        averageProfitMargin: shopSettings.averageProfitMargin?.toString() || null,
        averageShippingCost: shopSettings.averageShippingCost?.toString() || null,
        averageTransactionFee: shopSettings.averageTransactionFee?.toString() || null,
        averageReturnRate: shopSettings.averageReturnRate?.toString() || null,
        metricsLastUpdated: shopSettings.metricsLastUpdated?.toISOString() || null,
        // Pre-format date to avoid hydration mismatch (server/client locale differences)
        metricsLastUpdatedDisplay: shopSettings.metricsLastUpdated
          ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(shopSettings.metricsLastUpdated)
          : null,
        advancedAnalyticsEnabled: (shopSettings as any).advancedAnalyticsEnabled ?? false,
      } : null,

      // Advisory capacity guide; analytics queries and exports remain available.
      maxHistoricalDays,

      // Auto-calculated business metrics
      autoCalculatedMetrics: {
        customerLifetimeValue,
        repeatPurchaseRate,
        actualRetentionRate,
      },

      // REAL Customer Behaviour Analysis data
      customerBehaviourData,

      // Add marketing recommendations from analytics insights
      recommendations: recommendations.map(rec => ({
        id: rec.id,
        type: rec.type,
        title: rec.title,
        description: rec.description,
        affectedCount: rec.affectedCount,
        predictedRevenue: rec.predictedRevenue,
        priority: rec.priority,
        status: rec.status
      })),

      // NEW: Insight Engine data
      aiInsights: insights,
      healthScore,
      executiveSummary,
      keyComparisons,

      // Cohort Analysis data
      cohortAnalysis,
    };

    return json(analyticsData);
  } catch (error) {
    console.error("Analytics loader error:", error);
    throw new Response("Failed to load analytics", { status: 500 });
  }
};

// ============================================
// ACTION - Handle form submissions
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const actionType = formData.get("action");

  if (actionType === "save-metrics") {
    const parseDecimal = (value: string | null) => {
      if (!value || value.trim() === "") return null;
      const parsed = parseFloat(value);
      return isNaN(parsed) ? null : parsed;
    };

    await prisma.shopSettings.update({
      where: { shop },
      data: {
        averageProfitMargin: parseDecimal(formData.get("averageProfitMargin") as string),
        averageShippingCost: parseDecimal(formData.get("averageShippingCost") as string),
        averageTransactionFee: parseDecimal(formData.get("averageTransactionFee") as string),
        averageReturnRate: parseDecimal(formData.get("averageReturnRate") as string),
        metricsLastUpdated: new Date(),
      },
    });

    return json({ success: true, message: "Business metrics updated successfully" });
  }

  return json({ success: false, message: "Invalid action" });
};

// ============================================
// HELPER FUNCTIONS
// ============================================

// Chart.js Configuration for Shopify Analytics Style
const _getShopifyChartOptions = (yAxisConfig?: {
  max?: number;
  callback?: (value: any) => string;
}): ChartOptions<'line'> => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false, // We'll use custom legend
    },
    tooltip: {
      mode: 'index',
      intersect: false,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      padding: 12,
      cornerRadius: 4,
      titleColor: '#fff',
      bodyColor: '#fff',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      borderWidth: 1,
    },
  },
  scales: {
    x: {
      grid: {
        display: false, // No vertical grid lines
      },
      ticks: {
        color: '#8c9196',
        font: {
          size: 12,
        },
      },
      border: {
        display: false,
      },
    },
    y: {
      beginAtZero: true,
      max: yAxisConfig?.max,
      grid: {
        color: '#e3e5e7',
        lineWidth: 0.5,
      },
      ticks: {
        color: '#8c9196',
        font: {
          size: 12,
        },
        callback: yAxisConfig?.callback || ((value) => value.toString()),
      },
      border: {
        display: false,
      },
    },
  },
  elements: {
    line: {
      tension: 0.1, // Slight curve for smoother lines
      borderWidth: 2,
    },
    point: {
      radius: 0, // No points by default
      hitRadius: 8, // Larger hit area for hover
      hoverRadius: 4, // Show point on hover
    },
  },
  interaction: {
    mode: 'index',
    intersect: false,
  },
});

// ============================================
// MARGIN RECALIBRATION FORM COMPONENT
// ============================================

interface MarginRecalibrationFormProps {
  initialValues: {
    averageProfitMargin: string;
    averageShippingCost: string;
    averageTransactionFee: string;
    averageReturnRate: string;
  };
  currentAOV: number; // Real-time calculated from database
  autoCalculatedMetrics: {
    customerLifetimeValue: number;
    repeatPurchaseRate: number;
    actualRetentionRate: number;
  };
  shopSettings: any; // Shop settings for currency formatting
}

function _MarginRecalibrationForm({ initialValues, currentAOV, autoCalculatedMetrics, shopSettings }: MarginRecalibrationFormProps) {
  const fetcher = useFetcher();

  // Format currency helper
  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, shopSettings);
  }, [shopSettings]);

  const [formValues, setFormValues] = useState(initialValues);

  const handleChange = useCallback((field: string) => (value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "save-metrics");
    formData.append("averageProfitMargin", formValues.averageProfitMargin);
    formData.append("averageShippingCost", formValues.averageShippingCost);
    formData.append("averageTransactionFee", formValues.averageTransactionFee);
    formData.append("averageReturnRate", formValues.averageReturnRate);

    fetcher.submit(formData, { method: "post" });
  }, [formValues, fetcher]);

  const isSaving = fetcher.state === "submitting";
  const showSuccess = (fetcher.data as any)?.success && fetcher.state === "idle";

  return (
    <BlockStack gap="400">
      {showSuccess && (
        <Banner tone="success" onDismiss={() => {}}>
          Business metrics updated successfully
        </Banner>
      )}

      <FormLayout>
        <Text variant="headingSm" as="h3">Revenue & Costs</Text>
        <FormLayout.Group>
          <TextField
            label="Average Profit Margin (%)"
            type="number"
            value={formValues.averageProfitMargin}
            onChange={handleChange('averageProfitMargin')}
            helpText="e.g., 45 for 45% profit margin"
            autoComplete="off"
            min={0}
            max={100}
            step={0.01}
          />
          <TextField
            label="Average Shipping Cost"
            type="number"
            value={formValues.averageShippingCost}
            onChange={handleChange('averageShippingCost')}
            helpText="Average cost per order in your currency"
            autoComplete="off"
            min={0}
            step={0.01}
          />
        </FormLayout.Group>

        <FormLayout.Group>
          <TextField
            label="Average Transaction Fee (%)"
            type="number"
            value={formValues.averageTransactionFee}
            onChange={handleChange('averageTransactionFee')}
            helpText="Payment processing fees (e.g., 2.9 for 2.9%)"
            autoComplete="off"
            min={0}
            max={100}
            step={0.01}
          />
          <TextField
            label="Average Return/Refund Rate (%)"
            type="number"
            value={formValues.averageReturnRate}
            onChange={handleChange('averageReturnRate')}
            helpText="% of orders that get returned or refunded"
            autoComplete="off"
            min={0}
            max={100}
            step={0.01}
          />
        </FormLayout.Group>

        <Divider />

        <Text variant="headingSm" as="h3">Auto-Calculated Metrics</Text>
        <FormLayout.Group>
          <TextField
            label="Average Order Value"
            type="text"
            value={formatAmount(currentAOV)}
            onChange={() => {}} // Read-only
            helpText="Automatically calculated from your actual order data"
            autoComplete="off"
            disabled
          />
          <TextField
            label="Customer Lifetime Value"
            type="text"
            value={formatAmount(autoCalculatedMetrics.customerLifetimeValue)}
            onChange={() => {}} // Read-only
            helpText="Average total spending per customer"
            autoComplete="off"
            disabled
          />
        </FormLayout.Group>

        <FormLayout.Group>
          <TextField
            label="Repeat Purchase Rate (%)"
            type="text"
            value={`${autoCalculatedMetrics.repeatPurchaseRate.toFixed(1)}%`}
            onChange={() => {}} // Read-only
            helpText="% of customers who made more than one purchase"
            autoComplete="off"
            disabled
          />
          <TextField
            label="Actual Retention Rate (%)"
            type="text"
            value={`${autoCalculatedMetrics.actualRetentionRate.toFixed(1)}%`}
            onChange={() => {}} // Read-only
            helpText="Month-over-month customer retention rate"
            autoComplete="off"
            disabled
          />
        </FormLayout.Group>
      </FormLayout>

      <InlineStack align="end">
        <Button
          variant="primary"
          onClick={handleSubmit}
          loading={isSaving}
        >
          Save Business Metrics
        </Button>
      </InlineStack>
    </BlockStack>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function AnalyticsPage() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  // Check if advanced analytics is enabled via Feature Manager toggle
  const hasAdvancedAnalytics = data.shopSettings?.advancedAnalyticsEnabled ?? false;

  const [selectedTab, setSelectedTab] = useState(0);
  // Reset to Overview tab if user doesn't have advanced analytics access
  useEffect(() => {
    if (!hasAdvancedAnalytics && selectedTab > 0) {
      setSelectedTab(0);
    }
  }, [hasAdvancedAnalytics, selectedTab]);

  // Format currency helper
  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, data.shopSettings as any);
  }, [data.shopSettings]);
  
  // Build tabs based on feature access - Overview is always visible
  // Advanced tabs require Advanced Analytics feature (from Feature Manager toggle)
  const tabs = useMemo(() => {
    const baseTabs: Array<{ id: string; content: string; badge?: string }> = [{ id: 'overview', content: 'Overview' }];

    if (hasAdvancedAnalytics) {
      baseTabs.push(
        { id: 'actions', content: 'Actions & Insights', badge: data.recommendations?.length.toString() || '0' },
        { id: 'retention', content: 'Retention' },
      );
    }

    return baseTabs;
  }, [hasAdvancedAnalytics, data.recommendations?.length]);

  // Determine quick health status for merchant-friendly summary
  const getQuickHealthStatus = useCallback(() => {
    const healthScore = data.healthScore?.overall || 0;
    const usageRate = data.programImpact.currentUsageRate;
    const hasCustomers = data.overviewMetrics.totalCustomers > 0;
    const hasActiveMembers = data.overviewMetrics.activeCustomers > 0;

    if (!hasCustomers || !hasActiveMembers) {
      return {
        status: 'getting-started' as const,
        message: "You're just getting started",
        description: "Once customers start joining your loyalty program, you'll see their performance data here.",
        tone: 'info' as const,
      };
    }

    if (healthScore >= 70 && usageRate >= 50) {
      return {
        status: 'excellent' as const,
        message: "Your loyalty program is performing excellently",
        description: "Customers are actively engaging with rewards and your retention metrics look strong.",
        tone: 'success' as const,
      };
    }

    if (healthScore >= 50) {
      return {
        status: 'good' as const,
        message: "Your loyalty program is performing well",
        description: "There are some opportunities to improve engagement, but overall your program is healthy.",
        tone: 'success' as const,
      };
    }

    if (healthScore >= 30) {
      return {
        status: 'needs-attention' as const,
        message: "Your loyalty program needs some attention",
        description: "Customer engagement could be improved. Check the recommendations below for actions you can take.",
        tone: 'warning' as const,
      };
    }

    return {
      status: 'action-needed' as const,
      message: "Your loyalty program needs action",
      description: "Customer engagement is low. Consider adjusting your rewards or reaching out to inactive members.",
      tone: 'critical' as const,
    };
  }, [data.healthScore, data.programImpact.currentUsageRate, data.overviewMetrics]);

  const quickHealth = getQuickHealthStatus();

  return (
    <Page
      title="Analytics"
      subtitle="See how your loyalty program is performing and what you can do to improve it"
    >
      <Layout>
        {/* Historical data capacity is advisory during the free-first rollout. */}
        {data.maxHistoricalDays < UNLIMITED_PLAN_LIMIT && (
          <Layout.Section>
            <Banner tone="info" title="Historical data capacity guide">
              <p>
                Your plan includes a {data.maxHistoricalDays}-day planning guide.
                This is advisory during rollout; your existing history and exports remain available.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {/* Tabbed Content */}
        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              {/* Overview Tab */}
              {selectedTab === 0 && (
                <Box padding="400">
                  <BlockStack gap="500">
                    {/* Quick Health Summary */}
                    <Banner
                      tone={quickHealth.tone}
                      title={quickHealth.message}
                    >
                      <BlockStack gap="300">
                        <p>{quickHealth.description}</p>
                        {quickHealth.status !== 'getting-started' && (
                          <InlineStack gap="400" wrap>
                            <Box padding="200" background="bg-surface" borderRadius="100">
                              <BlockStack gap="100">
                                <Text as="span" variant="bodySm" tone="subdued">Health Score</Text>
                                <Text as="span" variant="headingSm">{data.healthScore?.overall || 0}/100</Text>
                              </BlockStack>
                            </Box>
                            <Box padding="200" background="bg-surface" borderRadius="100">
                              <BlockStack gap="100">
                                <Text as="span" variant="bodySm" tone="subdued">Active Members</Text>
                                <Text as="span" variant="headingSm">{data.overviewMetrics.activeCustomers.toLocaleString()}</Text>
                              </BlockStack>
                            </Box>
                            <Box padding="200" background="bg-surface" borderRadius="100">
                              <BlockStack gap="100">
                                <Text as="span" variant="bodySm" tone="subdued">Reward Usage</Text>
                                <Text as="span" variant="headingSm">{data.programImpact.currentUsageRate.toFixed(0)}%</Text>
                              </BlockStack>
                            </Box>
                          </InlineStack>
                        )}
                      </BlockStack>
                    </Banner>

                    {/* 4 Key Metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                      <Card>
                        <Box padding="400">
                          <BlockStack gap="200">
                            <Text variant="bodySm" tone="subdued" as="span">Revenue</Text>
                            <Text variant="headingLg" as="p" fontWeight="bold">{formatAmount(data.overviewMetrics.totalRevenue)}</Text>
                            {data.overviewMetrics.totalRevenue > 0 && data.metricsChanges.revenueChange !== 0 ? (
                              <Text variant="bodySm" tone={data.metricsChanges.revenueChange >= 0 ? 'success' : 'critical'} as="span">
                                {data.metricsChanges.revenueChange >= 0 ? '↑' : '↓'} {Math.abs(data.metricsChanges.revenueChange).toFixed(1)}% vs last period
                              </Text>
                            ) : (
                              <Text variant="bodySm" tone="subdued" as="span">No prior data</Text>
                            )}
                          </BlockStack>
                        </Box>
                      </Card>
                      <Card>
                        <Box padding="400">
                          <BlockStack gap="200">
                            <Text variant="bodySm" tone="subdued" as="span">Orders</Text>
                            <Text variant="headingLg" as="p" fontWeight="bold">{data.overviewMetrics.totalOrders.toLocaleString()}</Text>
                            {data.overviewMetrics.totalOrders > 0 && data.metricsChanges.ordersChange !== 0 ? (
                              <Text variant="bodySm" tone={data.metricsChanges.ordersChange >= 0 ? 'success' : 'critical'} as="span">
                                {data.metricsChanges.ordersChange >= 0 ? '↑' : '↓'} {Math.abs(data.metricsChanges.ordersChange).toFixed(1)}% vs last period
                              </Text>
                            ) : (
                              <Text variant="bodySm" tone="subdued" as="span">No prior data</Text>
                            )}
                          </BlockStack>
                        </Box>
                      </Card>
                      <Card>
                        <Box padding="400">
                          <BlockStack gap="200">
                            <Text variant="bodySm" tone="subdued" as="span">Active Members</Text>
                            <Text variant="headingLg" as="p" fontWeight="bold">{data.overviewMetrics.activeCustomers.toLocaleString()}</Text>
                            {data.overviewMetrics.activeCustomers > 0 && data.metricsChanges.activeCustomersChange !== 0 ? (
                              <Text variant="bodySm" tone={data.metricsChanges.activeCustomersChange >= 0 ? 'success' : 'critical'} as="span">
                                {data.metricsChanges.activeCustomersChange >= 0 ? '↑' : '↓'} {Math.abs(data.metricsChanges.activeCustomersChange).toFixed(1)}% vs last period
                              </Text>
                            ) : (
                              <Text variant="bodySm" tone="subdued" as="span">No prior data</Text>
                            )}
                          </BlockStack>
                        </Box>
                      </Card>
                      <Card>
                        <Box padding="400">
                          <BlockStack gap="200">
                            <Text variant="bodySm" tone="subdued" as="span">Avg Order Value</Text>
                            <Text variant="headingLg" as="p" fontWeight="bold">{formatAmount(data.overviewMetrics.avgOrderValue)}</Text>
                            {data.overviewMetrics.avgOrderValue > 0 && data.metricsChanges.avgOrderValueChange !== 0 ? (
                              <Text variant="bodySm" tone={data.metricsChanges.avgOrderValueChange >= 0 ? 'success' : 'critical'} as="span">
                                {data.metricsChanges.avgOrderValueChange >= 0 ? '↑' : '↓'} {Math.abs(data.metricsChanges.avgOrderValueChange).toFixed(1)}% vs last period
                              </Text>
                            ) : (
                              <Text variant="bodySm" tone="subdued" as="span">No prior data</Text>
                            )}
                          </BlockStack>
                        </Box>
                      </Card>
                    </div>

                    <BlockStack gap="400">
                      <BlockStack gap="200">
                        <Text variant="headingMd" as="h2">
                          How Your Tiers Are Performing
                        </Text>
                        <Text variant="bodyMd" tone="subdued" as="p">
                          Compare how customers in each tier shop with you. Higher tiers typically show better engagement and spending.
                        </Text>
                      </BlockStack>
                      {data.tierPerformance.length > 0 ? (
                        <DataTable
                          columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric']}
                          headings={[
                            'Tier',
                            'Members',
                            'Orders/Month',
                            'Avg Order Value',
                            'Monthly Profit/Customer',
                          ]}
                          rows={sortTiersByPriority(data.tierPerformance).map(tier => [
                            <TierBadge
                              tierName={tier.name}
                              size="small"
                              showIcon={true}
                              cashbackPercent={tier.cashbackPercent}
                            />,
                            tier.members,
                            tier.monthlyOrderFrequency.toFixed(2),
                            formatAmount(tier.revenuePerOrder),
                            formatAmount(tier.grossProfitPerCustomerPerMonth),
                          ])}
                        />
                      ) : (
                        <EmptyState
                          heading="No tier data yet"
                          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        >
                          <p>Tier performance will appear here once you have data.</p>
                        </EmptyState>
                      )}
                    </BlockStack>

                    <Divider />

                    {/* Tier Performance - Optimized Radar Chart */}
                    {data.tierPerformance.length > 0 && (
                      <TierPerformanceChart
                        tiers={data.tierPerformance}
                        formatAmount={formatAmount}
                      />
                    )}

                    <Divider />

                    {/* Program Impact */}
                    <BlockStack gap="400">
                      <BlockStack gap="200">
                        <Text variant="headingMd" as="h2">
                          Is Your Loyalty Program Working?
                        </Text>
                        <Text variant="bodyMd" tone="subdued" as="p">
                          These metrics show how effectively your loyalty program drives sales. Higher reward usage means customers are engaged and coming back.
                        </Text>
                      </BlockStack>

                      {/* Metrics Grid */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: '16px',
                        marginBottom: '20px'
                      }}>
                        {/* Reward Usage Rate */}
                        <Card>
                          <Box padding="400">
                            <BlockStack gap="200">
                              <BlockStack gap="050">
                                <Text variant="bodySm" tone="subdued" as="p">
                                  Reward Usage Rate
                                </Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  % of earned rewards that customers actually use
                                </Text>
                              </BlockStack>
                              <Text variant="headingLg" as="h3">
                                {data.programImpact.currentUsageRate.toFixed(1)}%
                              </Text>
                              <InlineStack gap="200" blockAlign="center">
                                {data.programImpact.usageRateChange !== 0 ? (
                                  <>
                                    <Badge tone={data.programImpact.usageRateChange > 0 ? 'success' : 'critical'}>
                                      {`${data.programImpact.usageRateChange > 0 ? '+' : ''}${data.programImpact.usageRateChange.toFixed(1)}%`}
                                    </Badge>
                                    <Text variant="bodySm" tone="subdued" as="span">
                                      vs last month
                                    </Text>
                                  </>
                                ) : (
                                  <Badge tone="info">Current Period</Badge>
                                )}
                              </InlineStack>
                              <Text variant="bodySm" tone="subdued" as="p">
                                {data.programImpact.currentUsageRate >= 60
                                  ? "Great! Customers are actively using their rewards."
                                  : data.programImpact.currentUsageRate >= 30
                                  ? "There's room to encourage more reward redemptions."
                                  : "Consider promoting rewards to boost engagement."}
                              </Text>
                            </BlockStack>
                          </Box>
                        </Card>

                        {/* Total Influenced Sales */}
                        <Card>
                          <Box padding="400">
                            <BlockStack gap="200">
                              <BlockStack gap="050">
                                <Text variant="bodySm" tone="subdued" as="p">
                                  Sales from Loyalty Members
                                </Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  Revenue from customers in your loyalty program
                                </Text>
                              </BlockStack>
                              <Text variant="headingLg" as="h3">
                                {formatAmount(data.programImpact.totalInfluencedSales)}
                              </Text>
                              <InlineStack gap="200" blockAlign="center">
                                <Badge tone="info">All-time total</Badge>
                              </InlineStack>
                            </BlockStack>
                          </Box>
                        </Card>
                      </div>

                      {/* Historical Data Charts */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
                        gap: '24px',
                        marginTop: '16px'
                      }}>
                        {/* Combined Reward Usage & Influenced Sales Chart */}
                        <Card>
                          <Box padding="400">
                            <BlockStack gap="300">
                              <BlockStack gap="100">
                                <Text variant="headingSm" as="h3">
                                  Program Growth Over Time
                                </Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  See how reward usage and total revenue have changed month over month
                                </Text>
                              </BlockStack>

                              {/* Custom Legend */}
                              <InlineStack gap="400" blockAlign="center">
                                <InlineStack gap="200" blockAlign="center">
                                  <div style={{ width: '12px', height: '12px', backgroundColor: '#8B5CF6', borderRadius: '2px' }}></div>
                                  <Text variant="bodySm" as="span">Usage Rate (%)</Text>
                                </InlineStack>
                                <InlineStack gap="200" blockAlign="center">
                                  <div style={{ width: '12px', height: '12px', backgroundColor: '#22c55e', borderRadius: '2px' }}></div>
                                  <Text variant="bodySm" as="span">Cumulative Sales</Text>
                                </InlineStack>
                              </InlineStack>

                              <div style={{ height: '300px' }}>
                                <Line
                                  data={{
                                    labels: data.monthlyImpactData.map(m => m.month),
                                    datasets: [
                                      {
                                        label: 'Usage Rate',
                                        data: data.monthlyImpactData.map(m => m.usageRate),
                                        borderColor: '#8B5CF6',
                                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                                        fill: true,
                                        tension: 0.4,
                                        yAxisID: 'y',
                                      },
                                      {
                                        label: 'Cumulative Sales',
                                        data: data.monthlyImpactData.map(m => m.cumulativeSales),
                                        borderColor: '#22c55e',
                                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                        fill: true,
                                        tension: 0.1,
                                        yAxisID: 'y1',
                                      }
                                    ],
                                  }}
                                  options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    interaction: {
                                      mode: 'index',
                                      intersect: false,
                                    },
                                    plugins: {
                                      legend: {
                                        display: false,
                                      },
                                      tooltip: {
                                        mode: 'index',
                                        intersect: false,
                                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                        padding: 12,
                                        cornerRadius: 4,
                                        callbacks: {
                                          label: (context) => {
                                            const label = context.dataset.label || '';
                                            const value = context.parsed.y;
                                            if (context.datasetIndex === 0) {
                                              return `${label}: ${(value ?? 0).toFixed(1)}%`;
                                            } else {
                                              return `${label}: ${formatAmount(value ?? 0)}`;
                                            }
                                          },
                                        },
                                      },
                                    },
                                    scales: {
                                      x: {
                                        grid: {
                                          display: false,
                                        },
                                        border: {
                                          display: false,
                                        },
                                      },
                                      y: {
                                        type: 'linear',
                                        display: true,
                                        position: 'left',
                                        max: 100,
                                        grid: {
                                          color: 'rgba(0, 0, 0, 0.05)',
                                        },
                                        border: {
                                          display: false,
                                        },
                                        ticks: {
                                          callback: (value) => `${value}%`,
                                        },
                                      },
                                      y1: {
                                        type: 'linear',
                                        display: true,
                                        position: 'right',
                                        grid: {
                                          drawOnChartArea: false,
                                        },
                                        border: {
                                          display: false,
                                        },
                                        ticks: {
                                          callback: (value) => formatAmount(Number(value)),
                                        },
                                      },
                                    },
                                  }}
                                />
                              </div>
                            </BlockStack>
                          </Box>
                        </Card>
                      </div>

                      <Text variant="bodySm" tone="subdued" as="p">
                        The purple line shows what percentage of earned rewards customers are actually redeeming each month. The green line shows your total revenue from loyalty members over time. A rising green line means your program is driving more sales.
                      </Text>
                    </BlockStack>
                  </BlockStack>
                </Box>
              )}

              {/* Charts Tab - HIDDEN */}

              {selectedTab === 1 && (
                <Box padding="400">
                  <BlockStack gap="600">
                    {/* Header Section */}
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="200">
                          <Text variant="headingMd" as="h2">
                            Things You Can Do to Grow
                          </Text>
                          <Text variant="bodyMd" tone="subdued" as="p">
                            Based on your data, here are opportunities to engage customers and increase sales
                          </Text>
                        </BlockStack>
                        {/* Hidden until marketing page is ready */}
                        {/* <Button onClick={() => navigate('/app/marketing/recommendations')}>
                          View All
                        </Button> */}
                      </InlineStack>

                      {/* Summary Metrics - Dynamic from actual recommendations */}
                      {data.recommendations && data.recommendations.length > 0 && (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                          gap: '12px',
                          marginTop: '8px'
                        }}>
                          <Card>
                            <Box padding="300">
                              <BlockStack gap="100">
                                <Text variant="bodySm" tone="subdued" as="p">
                                  High Priority
                                </Text>
                                <Text variant="headingLg" as="h3">
                                  {data.recommendations.filter(r => r.priority >= 8).length}
                                </Text>
                              </BlockStack>
                            </Box>
                          </Card>
                          <Card>
                            <Box padding="300">
                              <BlockStack gap="100">
                                <Text variant="bodySm" tone="subdued" as="p">
                                  Customers Affected
                                </Text>
                                <Text variant="headingLg" as="h3">
                                  {data.recommendations.reduce((sum, r) => sum + r.affectedCount, 0).toLocaleString()}
                                </Text>
                              </BlockStack>
                            </Box>
                          </Card>
                          <Card>
                            <Box padding="300">
                              <BlockStack gap="100">
                                <Text variant="bodySm" tone="subdued" as="p">
                                  Potential Revenue
                                </Text>
                                <Text variant="headingLg" as="h3">
                                  {formatAmount(data.recommendations.reduce((sum, r) => sum + (r.predictedRevenue || 0), 0))}
                                </Text>
                              </BlockStack>
                            </Box>
                          </Card>
                        </div>
                      )}
                    </BlockStack>

                    {/* Action Cards - Dynamic from recommendations */}
                    {!data.recommendations || data.recommendations.length === 0 ? (
                      <Card>
                        <Box padding="400">
                          <EmptyState
                            heading="No recommendations yet"
                            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                          >
                            <p>We'll generate marketing recommendations as your customer base grows and patterns emerge.</p>
                            {/* Hidden until marketing page is ready */}
                            {/* <Button onClick={() => navigate('/app/marketing')}>
                              Go to Marketing Hub
                            </Button> */}
                          </EmptyState>
                        </Box>
                      </Card>
                    ) : (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
                        gap: '20px',
                        marginTop: '16px'
                      }}>
                        {data.recommendations.map((recommendation) => (
                          <Card key={recommendation.id}>
                            <Box padding="400">
                              <BlockStack gap="300">
                                {/* Header with badges */}
                                <InlineStack gap="200" blockAlign="center">
                                  <Badge tone={recommendation.priority >= 8 ? 'critical' : recommendation.priority >= 5 ? 'attention' : 'info'}>
                                    {`${recommendation.priority >= 8 ? 'High' : recommendation.priority >= 5 ? 'Medium' : 'Low'} Priority`}
                                  </Badge>
                                  <Badge tone="info">
                                    {recommendation.type.replace(/_/g, ' ')}
                                  </Badge>
                                </InlineStack>

                                {/* Title and Description */}
                                <BlockStack gap="200">
                                  <Text variant="headingSm" as="h3" fontWeight="semibold">
                                    {recommendation.title}
                                  </Text>
                                  <Text variant="bodySm" tone="subdued" as="p">
                                    {recommendation.description}
                                  </Text>
                                </BlockStack>

                                {/* Metrics */}
                                <div style={{
                                  padding: '12px',
                                  backgroundColor: '#f9fafb',
                                  borderRadius: '8px'
                                }}>
                                  <BlockStack gap="200">
                                    <InlineStack align="space-between" blockAlign="center">
                                      <Text variant="bodySm" as="span" tone="subdued">
                                        Affected Customers
                                      </Text>
                                      <Text variant="bodyMd" as="span" fontWeight="semibold">
                                        {recommendation.affectedCount} customers
                                      </Text>
                                    </InlineStack>
                                    {recommendation.predictedRevenue && (
                                      <InlineStack align="space-between" blockAlign="center">
                                        <Text variant="bodySm" as="span" tone="subdued">
                                          Potential Revenue
                                        </Text>
                                        <Text variant="bodyMd" as="span" fontWeight="semibold" tone="success">
                                          {formatAmount(recommendation.predictedRevenue)}
                                        </Text>
                                      </InlineStack>
                                    )}
                                  </BlockStack>
                                </div>

                                {/* Action Buttons */}
                                <InlineStack gap="200" align="end">
                                  <Button onClick={() => navigate(`/app/marketing/campaigns/smart-create?recommendationId=${recommendation.id}`)}>
                                    View Details
                                  </Button>
                                  <Button
                                    variant="primary"
                                    onClick={() => navigate(`/app/marketing/campaigns/smart-create?recommendationId=${recommendation.id}`)}
                                  >
                                    Create Campaign
                                  </Button>
                                </InlineStack>
                              </BlockStack>
                            </Box>
                          </Card>
                        ))}
                      </div>
                    )}

                    <Divider />

                    {/* Header - Health Score is shown in Overview tab */}
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <Text variant="headingMd" as="h2">
                            Understanding Your Customers
                          </Text>
                          <Text variant="bodyMd" tone="subdued" as="p">
                            See how your customers are engaging with your store and what drives their loyalty
                          </Text>
                        </BlockStack>
                        <Badge tone="info">
                          {`Engagement Score: ${data.healthScore?.overall || data.customerBehaviourData.engagementMetrics.programEngagementScore}/100`}
                        </Badge>
                      </InlineStack>
                    </BlockStack>

                    {/* Behavioral Psychology Insights - The "Why" Behind Numbers */}
                    <Card>
                      <Box padding="400">
                        <BlockStack gap="400">
                          <BlockStack gap="100">
                            <Text variant="headingSm" as="h3">
                              Customer Loyalty Indicators
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="p">
                              These scores show how likely customers are to stay loyal to your brand
                            </Text>
                          </BlockStack>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                            {/* Habit Strength */}
                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="200">
                                <InlineStack align="space-between" blockAlign="center">
                                  <Text variant="bodySm" as="span">Habit Strength</Text>
                                  <Badge tone={data.customerBehaviourData.behavioralInsights.habitStrength >= 60 ? 'success' : 'warning'}>
                                    {`${data.customerBehaviourData.behavioralInsights.habitStrength}%`}
                                  </Badge>
                                </InlineStack>
                                <ProgressBar
                                  progress={data.customerBehaviourData.behavioralInsights.habitStrength}
                                  size="small"
                                  tone={data.customerBehaviourData.behavioralInsights.habitStrength >= 60 ? 'primary' : 'highlight'}
                                />
                                <Text variant="bodySm" tone="subdued" as="p">
                                  {data.customerBehaviourData.behavioralInsights.habitStrength >= 70
                                    ? "Strong purchase habits forming"
                                    : data.customerBehaviourData.behavioralInsights.habitStrength >= 40
                                    ? "Building consistent patterns"
                                    : "Habits still developing"}
                                </Text>
                              </BlockStack>
                            </Box>

                            {/* Emotional Loyalty */}
                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="200">
                                <InlineStack align="space-between" blockAlign="center">
                                  <Text variant="bodySm" as="span">Emotional Loyalty</Text>
                                  <Badge tone={data.customerBehaviourData.behavioralInsights.emotionalLoyaltyScore >= 60 ? 'success' : 'warning'}>
                                    {`${data.customerBehaviourData.behavioralInsights.emotionalLoyaltyScore}%`}
                                  </Badge>
                                </InlineStack>
                                <ProgressBar
                                  progress={data.customerBehaviourData.behavioralInsights.emotionalLoyaltyScore}
                                  size="small"
                                  tone="success"
                                />
                                <Text variant="bodySm" tone="subdued" as="p">
                                  {data.customerBehaviourData.behavioralInsights.emotionalLoyaltyScore >= 70
                                    ? "Deep brand connection"
                                    : data.customerBehaviourData.behavioralInsights.emotionalLoyaltyScore >= 40
                                    ? "Growing attachment"
                                    : "Primarily transactional"}
                                </Text>
                              </BlockStack>
                            </Box>

                            {/* Churn Risk */}
                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="200">
                                <InlineStack align="space-between" blockAlign="center">
                                  <Text variant="bodySm" as="span">Churn Risk</Text>
                                  <Badge tone={data.customerBehaviourData.behavioralInsights.churnProbability <= 30 ? 'success' : data.customerBehaviourData.behavioralInsights.churnProbability <= 60 ? 'warning' : 'critical'}>
                                    {`${data.customerBehaviourData.behavioralInsights.churnProbability}%`}
                                  </Badge>
                                </InlineStack>
                                <ProgressBar
                                  progress={data.customerBehaviourData.behavioralInsights.churnProbability}
                                  size="small"
                                  tone="critical"
                                />
                                <Text variant="bodySm" tone="subdued" as="p">
                                  {data.customerBehaviourData.behavioralInsights.churnProbability <= 20
                                    ? "Very stable base"
                                    : data.customerBehaviourData.behavioralInsights.churnProbability <= 40
                                    ? "Moderate retention"
                                    : "Attention needed"}
                                </Text>
                              </BlockStack>
                            </Box>

                            {/* Upsell Potential */}
                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="200">
                                <InlineStack align="space-between" blockAlign="center">
                                  <Text variant="bodySm" as="span">Upsell Potential</Text>
                                  <Badge tone={data.customerBehaviourData.behavioralInsights.upsellPotential >= 60 ? 'success' : 'info'}>
                                    {`${data.customerBehaviourData.behavioralInsights.upsellPotential}%`}
                                  </Badge>
                                </InlineStack>
                                <ProgressBar
                                  progress={data.customerBehaviourData.behavioralInsights.upsellPotential}
                                  size="small"
                                  tone="primary"
                                />
                                <Text variant="bodySm" tone="subdued" as="p">
                                  {data.customerBehaviourData.behavioralInsights.upsellPotential >= 70
                                    ? "High growth opportunity"
                                    : data.customerBehaviourData.behavioralInsights.upsellPotential >= 40
                                    ? "Room to grow"
                                    : "Focus on retention first"}
                                </Text>
                              </BlockStack>
                            </Box>
                          </div>
                        </BlockStack>
                      </Box>
                    </Card>

                    {/* RFM Customer Segmentation */}
                    <Card>
                      <Box padding="400">
                        <BlockStack gap="400">
                          <BlockStack gap="100">
                            <Text variant="headingSm" as="h3">
                              Your Customer Groups
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="p">
                              Customers grouped by how recently they bought, how often they buy, and how much they spend
                            </Text>
                          </BlockStack>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                            {/* Champions */}
                            <Box padding="300" background="bg-fill-success-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <InlineStack gap="200" blockAlign="center">
                                  <span style={{ fontSize: '20px' }}>🏆</span>
                                  <Text variant="bodyMd" as="span" fontWeight="semibold">Champions</Text>
                                </InlineStack>
                                <Text variant="headingMd" as="p">{data.customerBehaviourData.rfmSegments.champions}</Text>
                                <Text variant="bodySm" tone="subdued" as="p">Best customers - recent, frequent, high spend</Text>
                              </BlockStack>
                            </Box>

                            {/* Loyal Customers */}
                            <Box padding="300" background="bg-fill-success-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <InlineStack gap="200" blockAlign="center">
                                  <span style={{ fontSize: '20px' }}>💎</span>
                                  <Text variant="bodyMd" as="span" fontWeight="semibold">Loyal</Text>
                                </InlineStack>
                                <Text variant="headingMd" as="p">{data.customerBehaviourData.rfmSegments.loyalCustomers}</Text>
                                <Text variant="bodySm" tone="subdued" as="p">Frequent buyers with good lifetime value</Text>
                              </BlockStack>
                            </Box>

                            {/* Potential Loyalists */}
                            <Box padding="300" background="bg-fill-info-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <InlineStack gap="200" blockAlign="center">
                                  <span style={{ fontSize: '20px' }}>⭐</span>
                                  <Text variant="bodyMd" as="span" fontWeight="semibold">Potential</Text>
                                </InlineStack>
                                <Text variant="headingMd" as="p">{data.customerBehaviourData.rfmSegments.potentialLoyalists}</Text>
                                <Text variant="bodySm" tone="subdued" as="p">Recent customers with growth potential</Text>
                              </BlockStack>
                            </Box>

                            {/* New Customers */}
                            <Box padding="300" background="bg-fill-info-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <InlineStack gap="200" blockAlign="center">
                                  <span style={{ fontSize: '20px' }}>🌱</span>
                                  <Text variant="bodyMd" as="span" fontWeight="semibold">New</Text>
                                </InlineStack>
                                <Text variant="headingMd" as="p">{data.customerBehaviourData.rfmSegments.newCustomers}</Text>
                                <Text variant="bodySm" tone="subdued" as="p">First purchase in last 30 days</Text>
                              </BlockStack>
                            </Box>

                            {/* Needs Attention */}
                            <Box padding="300" background="bg-fill-warning-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <InlineStack gap="200" blockAlign="center">
                                  <span style={{ fontSize: '20px' }}>👀</span>
                                  <Text variant="bodyMd" as="span" fontWeight="semibold">Needs Attention</Text>
                                </InlineStack>
                                <Text variant="headingMd" as="p">{data.customerBehaviourData.rfmSegments.needsAttention}</Text>
                                <Text variant="bodySm" tone="subdued" as="p">Above average but starting to slip</Text>
                              </BlockStack>
                            </Box>

                            {/* At Risk */}
                            <Box padding="300" background="bg-fill-warning-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <InlineStack gap="200" blockAlign="center">
                                  <span style={{ fontSize: '20px' }}>⚠️</span>
                                  <Text variant="bodyMd" as="span" fontWeight="semibold">At Risk</Text>
                                </InlineStack>
                                <Text variant="headingMd" as="p">{data.customerBehaviourData.rfmSegments.atRisk}</Text>
                                <Text variant="bodySm" tone="subdued" as="p">High value but haven't purchased recently</Text>
                              </BlockStack>
                            </Box>

                            {/* About to Sleep */}
                            <Box padding="300" background="bg-fill-caution-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <InlineStack gap="200" blockAlign="center">
                                  <span style={{ fontSize: '20px' }}>😴</span>
                                  <Text variant="bodyMd" as="span" fontWeight="semibold">About to Sleep</Text>
                                </InlineStack>
                                <Text variant="headingMd" as="p">{data.customerBehaviourData.rfmSegments.aboutToSleep}</Text>
                                <Text variant="bodySm" tone="subdued" as="p">Below average, becoming inactive</Text>
                              </BlockStack>
                            </Box>

                            {/* Hibernating */}
                            <Box padding="300" background="bg-fill-critical-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <InlineStack gap="200" blockAlign="center">
                                  <span style={{ fontSize: '20px' }}>❄️</span>
                                  <Text variant="bodyMd" as="span" fontWeight="semibold">Hibernating</Text>
                                </InlineStack>
                                <Text variant="headingMd" as="p">{data.customerBehaviourData.rfmSegments.hibernating}</Text>
                                <Text variant="bodySm" tone="subdued" as="p">No recent activity, low value</Text>
                              </BlockStack>
                            </Box>
                          </div>
                        </BlockStack>
                      </Box>
                    </Card>

                    {/* Engagement Metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                      {/* Activity Breakdown */}
                      <Card>
                        <Box padding="400">
                          <BlockStack gap="400">
                            <Text variant="headingSm" as="h3">
                              ⚡ Customer Activity
                            </Text>

                            <BlockStack gap="300">
                              {/* Active */}
                              <BlockStack gap="100">
                                <InlineStack align="space-between">
                                  <Text variant="bodyMd" as="span">Active (last 30 days)</Text>
                                  <Text variant="bodyMd" as="span" fontWeight="semibold" tone="success">
                                    {data.customerBehaviourData.engagementMetrics.activeRate}%
                                  </Text>
                                </InlineStack>
                                <ProgressBar progress={data.customerBehaviourData.engagementMetrics.activeRate} size="small" tone="success" />
                              </BlockStack>

                              {/* Dormant */}
                              <BlockStack gap="100">
                                <InlineStack align="space-between">
                                  <Text variant="bodyMd" as="span">Dormant (60-90 days)</Text>
                                  <Text variant="bodyMd" as="span" fontWeight="semibold" tone="caution">
                                    {data.customerBehaviourData.engagementMetrics.dormantRate}%
                                  </Text>
                                </InlineStack>
                                <ProgressBar progress={data.customerBehaviourData.engagementMetrics.dormantRate} size="small" tone="highlight" />
                              </BlockStack>

                              {/* Churn Risk */}
                              <BlockStack gap="100">
                                <InlineStack align="space-between">
                                  <Text variant="bodyMd" as="span">Churn Risk (90+ days)</Text>
                                  <Text variant="bodyMd" as="span" fontWeight="semibold" tone="critical">
                                    {data.customerBehaviourData.engagementMetrics.churnRiskRate}%
                                  </Text>
                                </InlineStack>
                                <ProgressBar progress={data.customerBehaviourData.engagementMetrics.churnRiskRate} size="small" tone="critical" />
                              </BlockStack>
                            </BlockStack>

                            <Divider />

                            <BlockStack gap="200">
                              <InlineStack align="space-between">
                                <Text variant="bodySm" tone="subdued" as="span">Avg. days between orders</Text>
                                <Text variant="bodyMd" as="span" fontWeight="semibold">
                                  {data.customerBehaviourData.engagementMetrics.avgDaysBetweenOrders} days
                                </Text>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text variant="bodySm" tone="subdued" as="span">Reward redemption rate</Text>
                                <Text variant="bodyMd" as="span" fontWeight="semibold">
                                  {data.customerBehaviourData.engagementMetrics.redemptionRate}%
                                </Text>
                              </InlineStack>
                            </BlockStack>
                          </BlockStack>
                        </Box>
                      </Card>

                      {/* Member vs Non-Member Comparison */}
                      <Card>
                        <Box padding="400">
                          <BlockStack gap="400">
                            <Text variant="headingSm" as="h3">
                              📈 Program Impact
                            </Text>

                            <BlockStack gap="300">
                              {/* Order Frequency */}
                              <BlockStack gap="100">
                                <InlineStack align="space-between">
                                  <Text variant="bodyMd" as="span">Order Frequency</Text>
                                  <Badge tone={data.customerBehaviourData.orderFrequencyLift >= 1.3 ? 'success' : 'info'}>
                                    {`${data.customerBehaviourData.orderFrequencyLift.toFixed(1)}x`}
                                  </Badge>
                                </InlineStack>
                                <InlineStack gap="400">
                                  <BlockStack gap="050">
                                    <Text variant="bodySm" tone="success" as="span">Members: {data.customerBehaviourData.members.avgOrders.toFixed(1)}</Text>
                                    <div style={{ width: '100px', height: '8px', backgroundColor: '#22c55e', borderRadius: '4px' }} />
                                  </BlockStack>
                                  <BlockStack gap="050">
                                    <Text variant="bodySm" tone="subdued" as="span">Others: {data.customerBehaviourData.nonMembers.avgOrders.toFixed(1)}</Text>
                                    <div style={{ width: `${Math.round(100 / data.customerBehaviourData.orderFrequencyLift)}px`, height: '8px', backgroundColor: '#9ca3af', borderRadius: '4px' }} />
                                  </BlockStack>
                                </InlineStack>
                              </BlockStack>

                              {/* AOV */}
                              <BlockStack gap="100">
                                <InlineStack align="space-between">
                                  <Text variant="bodyMd" as="span">Avg Order Value</Text>
                                  <Badge tone={data.customerBehaviourData.aovIncrease >= 10 ? 'success' : 'info'}>
                                    {`+${Math.round(data.customerBehaviourData.aovIncrease)}%`}
                                  </Badge>
                                </InlineStack>
                                <InlineStack gap="200">
                                  <Text variant="bodySm" tone="success" as="span">{formatAmount(data.customerBehaviourData.members.avgOrderValue)}</Text>
                                  <Text variant="bodySm" tone="subdued" as="span">vs {formatAmount(data.customerBehaviourData.nonMembers.avgOrderValue)}</Text>
                                </InlineStack>
                              </BlockStack>

                              {/* LTV */}
                              <BlockStack gap="100">
                                <InlineStack align="space-between">
                                  <Text variant="bodyMd" as="span">12mo Lifetime Value</Text>
                                  <Badge tone={data.customerBehaviourData.revenueLift >= 20 ? 'success' : 'info'}>
                                    {`+${Math.round(data.customerBehaviourData.revenueLift)}%`}
                                  </Badge>
                                </InlineStack>
                                <InlineStack gap="200">
                                  <Text variant="bodySm" tone="success" as="span">{formatAmount(data.customerBehaviourData.members.lifetimeValue)}</Text>
                                  <Text variant="bodySm" tone="subdued" as="span">vs {formatAmount(data.customerBehaviourData.nonMembers.lifetimeValue)}</Text>
                                </InlineStack>
                              </BlockStack>

                              {/* Repeat Purchase Rate */}
                              <BlockStack gap="100">
                                <InlineStack align="space-between">
                                  <Text variant="bodyMd" as="span">Repeat Purchase Rate</Text>
                                  <Badge tone={data.customerBehaviourData.members.repeatPurchaseRate > data.customerBehaviourData.nonMembers.repeatPurchaseRate ? 'success' : 'info'}>
                                    {`+${(data.customerBehaviourData.members.repeatPurchaseRate - data.customerBehaviourData.nonMembers.repeatPurchaseRate).toFixed(0)}%`}
                                  </Badge>
                                </InlineStack>
                                <InlineStack gap="200">
                                  <Text variant="bodySm" tone="success" as="span">{data.customerBehaviourData.members.repeatPurchaseRate.toFixed(0)}%</Text>
                                  <Text variant="bodySm" tone="subdued" as="span">vs {data.customerBehaviourData.nonMembers.repeatPurchaseRate.toFixed(0)}%</Text>
                                </InlineStack>
                              </BlockStack>
                            </BlockStack>
                          </BlockStack>
                        </Box>
                      </Card>
                    </div>

                    {/* Actionable Insights Banner */}
                    <Banner
                      tone={
                        data.customerBehaviourData.engagementMetrics.programEngagementScore >= 70 ? "success" :
                        data.customerBehaviourData.engagementMetrics.programEngagementScore >= 40 ? "info" : "warning"
                      }
                    >
                      <BlockStack gap="200">
                        <Text variant="bodyMd" as="p" fontWeight="semibold">
                          {data.customerBehaviourData.engagementMetrics.programEngagementScore >= 70
                            ? "🎉 Your loyalty program is creating strong emotional connections"
                            : data.customerBehaviourData.engagementMetrics.programEngagementScore >= 40
                            ? "📊 Your program is building momentum - here's how to accelerate"
                            : "💡 Key opportunities to strengthen customer loyalty"}
                        </Text>
                        <Text variant="bodySm" as="p">
                          {data.customerBehaviourData.rfmSegments.atRisk > 0 && (
                            <>
                              <strong>{data.customerBehaviourData.rfmSegments.atRisk} high-value customers</strong> are at risk of churning - consider a win-back campaign.{' '}
                            </>
                          )}
                          {data.customerBehaviourData.rfmSegments.potentialLoyalists > 0 && (
                            <>
                              <strong>{data.customerBehaviourData.rfmSegments.potentialLoyalists} potential loyalists</strong> could be upgraded with targeted engagement.{' '}
                            </>
                          )}
                          {data.customerBehaviourData.behavioralInsights.habitStrength < 50 && (
                            <>
                              Focus on <strong>habit formation</strong> through consistent rewards and reminders to drive repeat purchases.
                            </>
                          )}
                          {data.customerBehaviourData.behavioralInsights.emotionalLoyaltyScore < 50 && (
                            <>
                              Strengthen <strong>emotional loyalty</strong> through personalized experiences and exclusive member benefits.
                            </>
                          )}
                        </Text>
                      </BlockStack>
                    </Banner>

                    {/* Psychology Tips Card */}
                    <Card>
                      <Box padding="400">
                        <BlockStack gap="300">
                          <Text variant="headingSm" as="h3">
                            💡 Psychology-Based Tips to Increase Loyalty
                          </Text>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <Text variant="bodyMd" as="p" fontWeight="semibold">🎯 Loss Aversion</Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  People fear losing status more than gaining it. Remind members when they're close to losing their tier.
                                </Text>
                              </BlockStack>
                            </Box>
                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <Text variant="bodyMd" as="p" fontWeight="semibold">🏅 Endowment Effect</Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  Customers overvalue what they own. Show their accumulated points and benefits prominently.
                                </Text>
                              </BlockStack>
                            </Box>
                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <Text variant="bodyMd" as="p" fontWeight="semibold">👥 Social Identity</Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  Make members feel part of an exclusive group. Use tier names that convey status and belonging.
                                </Text>
                              </BlockStack>
                            </Box>
                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="100">
                                <Text variant="bodyMd" as="p" fontWeight="semibold">🧪 Variable Rewards</Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  Unexpected rewards trigger dopamine. Add surprise bonuses to keep engagement high.
                                </Text>
                              </BlockStack>
                            </Box>
                          </div>
                        </BlockStack>
                      </Box>
                    </Card>
                  </BlockStack>
                </Box>
              )}

              {/* ============================================ */}
              {/* TAB 5: COHORT ANALYSIS */}
              {/* ============================================ */}
              {selectedTab === 2 && (
                <Box padding="400">
                  <BlockStack gap="500">
                    {/* Header */}
                    <BlockStack gap="200">
                      <Text variant="headingMd" as="h2">
                        Customer Retention Over Time
                      </Text>
                      <Text variant="bodyMd" tone="subdued" as="p">
                        See how well you're keeping customers month after month. A "cohort" is a group of customers who made their first purchase in the same month.
                      </Text>
                    </BlockStack>

                    {/* Summary Metrics Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                      {/* Retention Summary */}
                      <Card>
                        <Box padding="400">
                          <BlockStack gap="200">
                            <Text variant="bodySm" tone="subdued" as="span">Avg Retention (Month 1)</Text>
                            <Text variant="headingLg" as="p" fontWeight="bold">
                              {data.cohortAnalysis.summaryMetrics.avgRetentionMonth1.toFixed(1)}%
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="span">
                              Month 3: {data.cohortAnalysis.summaryMetrics.avgRetentionMonth3.toFixed(1)}% |
                              Month 6: {data.cohortAnalysis.summaryMetrics.avgRetentionMonth6.toFixed(1)}%
                            </Text>
                          </BlockStack>
                        </Box>
                      </Card>

                      {/* LTV Progression */}
                      <Card>
                        <Box padding="400">
                          <BlockStack gap="200">
                            <Text variant="bodySm" tone="subdued" as="span">Avg LTV (90 Days)</Text>
                            <Text variant="headingLg" as="p" fontWeight="bold">
                              {formatCurrency(data.cohortAnalysis.summaryMetrics.avgLTV90Days, data.shopSettings as any)}
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="span">
                              30d: {formatCurrency(data.cohortAnalysis.summaryMetrics.avgLTV30Days, data.shopSettings as any)} |
                              180d: {formatCurrency(data.cohortAnalysis.summaryMetrics.avgLTV180Days, data.shopSettings as any)}
                            </Text>
                          </BlockStack>
                        </Box>
                      </Card>

                      {/* Tier Upgrade Rate */}
                      <Card>
                        <Box padding="400">
                          <BlockStack gap="200">
                            <Text variant="bodySm" tone="subdued" as="span">Tier Upgrade Rate</Text>
                            <Text variant="headingLg" as="p" fontWeight="bold">
                              {data.cohortAnalysis.summaryMetrics.tierUpgradeRate.toFixed(1)}%
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="span">
                              Avg time: {data.cohortAnalysis.summaryMetrics.avgTimeToTierUpgrade} days
                            </Text>
                          </BlockStack>
                        </Box>
                      </Card>

                      {/* 12-Month LTV */}
                      <Card>
                        <Box padding="400">
                          <BlockStack gap="200">
                            <Text variant="bodySm" tone="subdued" as="span">Avg LTV (12 Months)</Text>
                            <Text variant="headingLg" as="p" fontWeight="bold">
                              {formatCurrency(data.cohortAnalysis.summaryMetrics.avgLTV365Days, data.shopSettings as any)}
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="span">
                              12-month retention: {data.cohortAnalysis.summaryMetrics.avgRetentionMonth12.toFixed(1)}%
                            </Text>
                          </BlockStack>
                        </Box>
                      </Card>
                    </div>

                    {/* Retention Cohort Heatmap */}
                    <Card>
                      <Box padding="400">
                        <BlockStack gap="400">
                          <BlockStack gap="200">
                            <Text variant="headingMd" as="h3">Customer Retention by Cohort</Text>
                            <Text variant="bodySm" tone="subdued" as="p">
                              Track how customers from each signup month return over time. Higher percentages (darker green) indicate stronger retention.
                            </Text>
                          </BlockStack>

                          {data.cohortAnalysis.retentionCohorts.length === 0 ? (
                            <Banner tone="info">
                              <Text as="p" variant="bodyMd">
                                No cohort data available yet. Cohorts are created when customers make their first purchase.
                              </Text>
                            </Banner>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                  <tr>
                                    <th style={{
                                      padding: '8px 12px',
                                      textAlign: 'left',
                                      borderBottom: '2px solid var(--p-color-border)',
                                      fontWeight: 600,
                                      backgroundColor: 'var(--p-color-bg-surface-secondary)',
                                      position: 'sticky',
                                      left: 0,
                                      zIndex: 1
                                    }}>
                                      Cohort
                                    </th>
                                    <th style={{
                                      padding: '8px 12px',
                                      textAlign: 'center',
                                      borderBottom: '2px solid var(--p-color-border)',
                                      fontWeight: 600,
                                      backgroundColor: 'var(--p-color-bg-surface-secondary)'
                                    }}>
                                      Users
                                    </th>
                                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(month => (
                                      <th key={month} style={{
                                        padding: '8px 12px',
                                        textAlign: 'center',
                                        borderBottom: '2px solid var(--p-color-border)',
                                        fontWeight: 600,
                                        backgroundColor: 'var(--p-color-bg-surface-secondary)',
                                        minWidth: '60px'
                                      }}>
                                        M{month}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {data.cohortAnalysis.retentionCohorts.map((cohort) => (
                                    <tr key={cohort.cohortMonth}>
                                      <td style={{
                                        padding: '8px 12px',
                                        fontWeight: 500,
                                        borderBottom: '1px solid var(--p-color-border)',
                                        backgroundColor: 'var(--p-color-bg-surface-secondary)',
                                        position: 'sticky',
                                        left: 0,
                                        zIndex: 1
                                      }}>
                                        {cohort.cohortLabel}
                                      </td>
                                      <td style={{
                                        padding: '8px 12px',
                                        textAlign: 'center',
                                        borderBottom: '1px solid var(--p-color-border)',
                                        fontWeight: 500
                                      }}>
                                        {cohort.initialCustomers}
                                      </td>
                                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(monthIndex => {
                                        const monthData = cohort.retention.find(r => r.monthIndex === monthIndex);
                                        if (!monthData) {
                                          return (
                                            <td key={monthIndex} style={{
                                              padding: '8px 12px',
                                              textAlign: 'center',
                                              borderBottom: '1px solid var(--p-color-border)',
                                              backgroundColor: 'var(--p-color-bg-surface-secondary)'
                                            }}>
                                              -
                                            </td>
                                          );
                                        }
                                        // Color scale: 0% = light gray, 100% = dark green
                                        const rate = monthData.retentionRate;
                                        const hue = 142; // Green hue
                                        const saturation = rate > 0 ? 40 + (rate * 0.3) : 0;
                                        const lightness = rate > 0 ? 95 - (rate * 0.5) : 95;
                                        const bgColor = rate > 0
                                          ? `hsl(${hue}, ${saturation}%, ${lightness}%)`
                                          : 'var(--p-color-bg-surface-secondary)';
                                        const textColor = rate > 60 ? '#fff' : 'inherit';

                                        return (
                                          <td key={monthIndex} style={{
                                            padding: '8px 12px',
                                            textAlign: 'center',
                                            borderBottom: '1px solid var(--p-color-border)',
                                            backgroundColor: bgColor,
                                            color: textColor,
                                            fontWeight: rate > 50 ? 600 : 400
                                          }}>
                                            {rate.toFixed(0)}%
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </BlockStack>
                      </Box>
                    </Card>

                    {/* Revenue Cohort Chart */}
                    <Card>
                      <Box padding="400">
                        <BlockStack gap="400">
                          <BlockStack gap="200">
                            <Text variant="headingMd" as="h3">Cumulative LTV by Cohort</Text>
                            <Text variant="bodySm" tone="subdued" as="p">
                              Track how customer lifetime value grows over time for each cohort.
                            </Text>
                          </BlockStack>

                          {data.cohortAnalysis.revenueCohorts.length === 0 ? (
                            <Banner tone="info">
                              <Text as="p" variant="bodyMd">
                                No revenue cohort data available yet.
                              </Text>
                            </Banner>
                          ) : (
                            <div style={{ height: '300px' }}>
                              <Line
                                data={{
                                  labels: ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11'],
                                  datasets: data.cohortAnalysis.revenueCohorts.slice(0, 6).map((cohort, index) => {
                                    const colors = [
                                      'rgb(75, 192, 192)',
                                      'rgb(54, 162, 235)',
                                      'rgb(153, 102, 255)',
                                      'rgb(255, 159, 64)',
                                      'rgb(255, 99, 132)',
                                      'rgb(201, 203, 207)'
                                    ];
                                    return {
                                      label: cohort.cohortLabel,
                                      data: cohort.cumulativeRevenue.map(r => r.avgRevenuePerCustomer),
                                      borderColor: colors[index % colors.length],
                                      backgroundColor: colors[index % colors.length],
                                      tension: 0.3,
                                      fill: false,
                                    };
                                  }),
                                }}
                                options={{
                                  responsive: true,
                                  maintainAspectRatio: false,
                                  plugins: {
                                    legend: {
                                      position: 'bottom',
                                    },
                                    tooltip: {
                                      callbacks: {
                                        label: function(context) {
                                          return `${context.dataset.label}: ${formatCurrency(context.parsed.y ?? 0, data.shopSettings as any)}`;
                                        }
                                      }
                                    }
                                  },
                                  scales: {
                                    y: {
                                      beginAtZero: true,
                                      title: {
                                        display: true,
                                        text: 'Avg LTV per Customer'
                                      }
                                    },
                                    x: {
                                      title: {
                                        display: true,
                                        text: 'Months Since First Purchase'
                                      }
                                    }
                                  }
                                }}
                              />
                            </div>
                          )}
                        </BlockStack>
                      </Box>
                    </Card>

                    {/* Tier Progression Cohorts */}
                    <Card>
                      <Box padding="400">
                        <BlockStack gap="400">
                          <BlockStack gap="200">
                            <Text variant="headingMd" as="h3">Tier Progression by Cohort</Text>
                            <Text variant="bodySm" tone="subdued" as="p">
                              See how customers progress through membership tiers over time.
                            </Text>
                          </BlockStack>

                          {data.cohortAnalysis.tierProgressionCohorts.length === 0 ? (
                            <Banner tone="info">
                              <Text as="p" variant="bodyMd">
                                No tier progression data available yet. Tier changes will be tracked here.
                              </Text>
                            </Banner>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              {data.cohortAnalysis.tierProgressionCohorts.slice(0, 4).map(cohort => (
                                <div key={cohort.cohortMonth} style={{ marginBottom: '24px' }}>
                                  <Text variant="bodyMd" as="p" fontWeight="semibold">
                                    {cohort.cohortLabel} ({cohort.initialCustomers} customers)
                                  </Text>
                                  <div style={{ height: '120px', marginTop: '8px' }}>
                                    <Bar
                                      data={{
                                        labels: cohort.tierDistribution.map(d => `M${d.monthIndex}`),
                                        datasets: cohort.tierDistribution[0]?.tiers.map((tier, tierIndex) => {
                                          const tierColors = [
                                            'rgb(200, 200, 200)', // No Tier - gray
                                            'rgb(205, 127, 50)',  // Bronze
                                            'rgb(192, 192, 192)', // Silver
                                            'rgb(255, 215, 0)',   // Gold
                                            'rgb(229, 228, 226)', // Platinum
                                            'rgb(75, 0, 130)',    // Diamond
                                          ];
                                          return {
                                            label: tier.tierName,
                                            data: cohort.tierDistribution.map(d => {
                                              const tierData = d.tiers.find(t => t.tierId === tier.tierId);
                                              return tierData?.percentage || 0;
                                            }),
                                            backgroundColor: tierColors[tierIndex % tierColors.length],
                                          };
                                        }) || [],
                                      }}
                                      options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                          legend: {
                                            display: false,
                                          },
                                          tooltip: {
                                            callbacks: {
                                              label: function(context) {
                                                return `${context.dataset.label}: ${(context.parsed.y ?? 0).toFixed(1)}%`;
                                              }
                                            }
                                          }
                                        },
                                        scales: {
                                          x: {
                                            stacked: true,
                                          },
                                          y: {
                                            stacked: true,
                                            max: 100,
                                            ticks: {
                                              callback: (value) => `${value}%`
                                            }
                                          }
                                        }
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </BlockStack>
                      </Box>
                    </Card>

                    {/* Cohort Insights */}
                    <Card>
                      <Box padding="400">
                        <BlockStack gap="300">
                          <Text variant="headingMd" as="h3">
                            📊 Cohort Analysis Insights
                          </Text>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="200">
                                <Text variant="bodyMd" as="p" fontWeight="semibold">🔄 Retention Benchmark</Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  {data.cohortAnalysis.summaryMetrics.avgRetentionMonth1 >= 40
                                    ? `Great! Your Month 1 retention of ${data.cohortAnalysis.summaryMetrics.avgRetentionMonth1.toFixed(0)}% is above the 30-40% industry average.`
                                    : `Your Month 1 retention of ${data.cohortAnalysis.summaryMetrics.avgRetentionMonth1.toFixed(0)}% has room to grow. Industry average is 30-40%.`
                                  }
                                </Text>
                              </BlockStack>
                            </Box>
                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="200">
                                <Text variant="bodyMd" as="p" fontWeight="semibold">💰 LTV Growth Pattern</Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  {data.cohortAnalysis.summaryMetrics.avgLTV90Days > data.cohortAnalysis.summaryMetrics.avgLTV30Days * 2
                                    ? "Strong LTV growth! Customers are returning and spending more over time."
                                    : "Focus on re-engagement campaigns to boost repeat purchases and LTV growth."
                                  }
                                </Text>
                              </BlockStack>
                            </Box>
                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="200">
                                <Text variant="bodyMd" as="p" fontWeight="semibold">🏆 Tier Progression</Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  {data.cohortAnalysis.summaryMetrics.tierUpgradeRate >= 20
                                    ? `${data.cohortAnalysis.summaryMetrics.tierUpgradeRate.toFixed(0)}% of customers upgraded tiers - your program is driving engagement!`
                                    : `Only ${data.cohortAnalysis.summaryMetrics.tierUpgradeRate.toFixed(0)}% upgraded tiers. Consider adjusting tier thresholds or rewards.`
                                  }
                                </Text>
                              </BlockStack>
                            </Box>
                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                              <BlockStack gap="200">
                                <Text variant="bodyMd" as="p" fontWeight="semibold">⏱️ Time to Upgrade</Text>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  {data.cohortAnalysis.summaryMetrics.avgTimeToTierUpgrade > 0
                                    ? `Average time to first tier upgrade: ${data.cohortAnalysis.summaryMetrics.avgTimeToTierUpgrade} days. ${
                                        data.cohortAnalysis.summaryMetrics.avgTimeToTierUpgrade <= 60
                                          ? "Quick progression keeps customers engaged!"
                                          : "Consider adding intermediate rewards to maintain momentum."
                                      }`
                                    : "Track tier upgrades to understand customer progression velocity."
                                  }
                                </Text>
                              </BlockStack>
                            </Box>
                          </div>
                        </BlockStack>
                      </Box>
                    </Card>
                  </BlockStack>
                </Box>
              )}
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Page animations handled by PageAnimation system - see app/components/PageAnimation */}
    </Page>
  );
}

                    <Divider />
