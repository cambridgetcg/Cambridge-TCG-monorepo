import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// MOCKS
// ============================================

vi.mock('~/shopify.server', () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

vi.mock('~/db.server', () => ({
  default: {
    shopSettings: {
      findUnique: vi.fn(),
    },
    tier: {
      findMany: vi.fn(),
    },
    customer: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('~/services/entitlements.server', () => ({
  getEntitlements: vi.fn(),
}));

vi.mock('~/services/analytics-recommendations.server', () => ({
  AnalyticsRecommendationsService: vi.fn().mockImplementation(() => ({
    getActionRecommendations: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('~/services/analytics-metrics.server', () => ({
  getOverviewMetricsWithComparison: vi.fn(),
}));

vi.mock('~/services/tier-performance.server', () => ({
  getTierPerformanceMetrics: vi.fn(),
  getMonthlyTierRevenue: vi.fn(),
}));

vi.mock('~/services/program-impact.server', () => ({
  getProgramImpactMetrics: vi.fn(),
  getMonthlyImpactData: vi.fn(),
}));

vi.mock('~/services/cohort-analysis.server', () => ({
  getCohortAnalysis: vi.fn(),
}));

vi.mock('~/services/rfm-segmentation.server', () => ({
  getCustomerBehaviourData: vi.fn(),
}));

vi.mock('~/services/analytics/insight-engine.server', () => ({
  createInsightEngine: vi.fn(() => ({
    generateInsights: vi.fn().mockResolvedValue([]),
    calculateHealthScore: vi.fn().mockResolvedValue({
      overall: 75,
      dimensions: {},
    }),
  })),
}));

vi.mock('~/services/analytics/comparison.server', () => ({
  createComparisonService: vi.fn(() => ({
    compareMultipleMetrics: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('~/services/analytics/narrative-generator.server', () => ({
  createNarrativeGenerator: vi.fn(() => ({
    generateExecutiveSummary: vi.fn().mockReturnValue({
      headline: 'Test summary',
      highlights: [],
      concerns: [],
      recommendations: [],
    }),
  })),
}));

vi.mock('~/utils/currency', () => ({
  formatCurrency: vi.fn((amount: number) => `$${amount.toFixed(2)}`),
}));

vi.mock('~/utils/tier-styles', () => ({
  sortTiersByPriority: vi.fn((tiers: any[]) => tiers),
}));

// Mock chart.js and react-chartjs-2 to avoid DOM issues in node env
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: {},
  LinearScale: {},
  PointElement: {},
  LineElement: {},
  BarElement: {},
  ArcElement: {},
  RadialLinearScale: {},
  Title: {},
  Tooltip: {},
  Legend: {},
  Filler: {},
}));

vi.mock('react-chartjs-2', () => ({
  Line: () => null,
  Bar: () => null,
  Doughnut: () => null,
  Radar: () => null,
}));

vi.mock('~/components/TierBadge', () => ({
  TierBadge: () => null,
}));

vi.mock('~/components/analytics/TierPerformanceChart', () => ({
  TierPerformanceChart: () => null,
}));

vi.mock('~/components/analytics/ExecutiveSummary', () => ({
  ExecutiveSummary: () => null,
}));

vi.mock('~/components/analytics/widgets', () => ({
  InsightWidget: () => null,
  HealthScoreWidget: () => null,
  ComparisonWidget: () => null,
}));

// ============================================
// IMPORTS (after mocks)
// ============================================

import { authenticate } from '~/shopify.server';
import db from '~/db.server';
import { getEntitlements } from '~/services/entitlements.server';
import { getOverviewMetricsWithComparison } from '~/services/analytics-metrics.server';
import { getTierPerformanceMetrics, getMonthlyTierRevenue } from '~/services/tier-performance.server';
import { getProgramImpactMetrics, getMonthlyImpactData } from '~/services/program-impact.server';
import { getCohortAnalysis } from '~/services/cohort-analysis.server';
import { getCustomerBehaviourData } from '~/services/rfm-segmentation.server';
import { loader } from '~/routes/app.analytics';

// ============================================
// TEST HELPERS
// ============================================

const MOCK_SHOP = 'test-shop.myshopify.com';

const mockSession = {
  shop: MOCK_SHOP,
  state: '12345',
  isOnline: true,
  scope: 'read_customers,write_customers',
  accessToken: 'test-token',
};

const emptyMetrics = {
  totalRevenue: 0,
  totalOrders: 0,
  cashbackIssued: 0,
  activeCustomers: 0,
  avgOrderValue: 0,
  totalCustomers: 0,
};

const emptyCustomerBehaviour = {
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

const emptyCohort = {
  retentionCohorts: [], revenueCohorts: [], tierProgressionCohorts: [],
  summaryMetrics: {
    avgRetentionMonth1: 0, avgRetentionMonth3: 0,
    avgRetentionMonth6: 0, avgRetentionMonth12: 0,
    avgLTV30Days: 0, avgLTV90Days: 0,
    avgLTV180Days: 0, avgLTV365Days: 0,
    avgTimeToTierUpgrade: 0, tierUpgradeRate: 0,
  },
};

function setupDefaultMocks() {
  vi.mocked(authenticate.admin).mockResolvedValue({
    session: mockSession,
    admin: { graphql: vi.fn() },
    cors: vi.fn(),
  } as any);

  vi.mocked(db.shopSettings.findUnique).mockResolvedValue({
    storeCurrency: 'USD',
    currencyDisplayType: 'symbol',
    averageProfitMargin: 30,
    averageShippingCost: 5,
    averageTransactionFee: 2,
    averageReturnRate: 3,
    metricsLastUpdated: new Date('2026-03-20'),
    advancedAnalyticsEnabled: true,
  } as any);

  vi.mocked(db.tier.findMany).mockResolvedValue([
    { id: 'tier-1', name: 'Silver', minSpend: 0, cashbackPercent: 2 },
  ] as any);

  vi.mocked(getEntitlements).mockResolvedValue({
    limitMaxHistoricalDays: 30,
  } as any);

  // Analytics services
  vi.mocked(getOverviewMetricsWithComparison).mockResolvedValue({
    current: { ...emptyMetrics, totalRevenue: 5000, totalOrders: 100, totalCustomers: 50 },
    previous: emptyMetrics,
    changes: {
      revenueChange: 100, ordersChange: 100, cashbackChange: 0,
      activeCustomersChange: 0, avgOrderValueChange: 0, totalCustomersChange: 100,
    },
  });

  vi.mocked(getTierPerformanceMetrics).mockResolvedValue([
    {
      id: 'tier-1',
      name: 'Silver',
      members: 50,
      customerCount: 50,
      cashbackPercent: 2,
      monthlyOrderFrequency: 1.5,
      revenuePerOrder: 45,
      grossProfitPerCustomerPerMonth: 15,
      averageOrderValue: 45,
      lifetimeValue: 200,
      retentionRate: 60,
      totalCashbackEarned: 100,
    },
  ]);

  vi.mocked(getMonthlyTierRevenue).mockResolvedValue([]);
  vi.mocked(getProgramImpactMetrics).mockResolvedValue({
    currentUsageRate: 0,
    totalInfluencedSales: 0,
    previousUsageRate: 0,
    usageRateChange: 0,
  });
  vi.mocked(getMonthlyImpactData).mockResolvedValue([]);
  vi.mocked(getCustomerBehaviourData).mockResolvedValue(emptyCustomerBehaviour);
  vi.mocked(getCohortAnalysis).mockResolvedValue(emptyCohort);

  // Auto-calculated metrics DB calls
  vi.mocked(db.customer.aggregate).mockResolvedValue({
    _avg: { totalSpent: 200 },
  } as any);
  vi.mocked(db.customer.count).mockResolvedValue(10);
  vi.mocked(db.order.findMany).mockResolvedValue([]);
}

// ============================================
// TESTS
// ============================================

describe('app.analytics loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('should load analytics page without error', async () => {
    const request = new Request('https://app.example.com/app/analytics');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    // Core fields present
    expect(data.overviewMetrics).toBeDefined();
    expect(data.overviewMetrics.totalRevenue).toBe(5000);
    expect(data.overviewMetrics.totalOrders).toBe(100);

    expect(data.tierPerformance).toBeDefined();
    expect(data.tierPerformance).toHaveLength(1);
    expect(data.tierPerformance[0].name).toBe('Silver');

    expect(data.shopSettings).toBeDefined();
    expect(data.shopSettings.storeCurrency).toBe('USD');
  });

  it('should include metrics comparison data', async () => {
    const request = new Request('https://app.example.com/app/analytics');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.metricsChanges).toBeDefined();
    expect(data.metricsChanges.revenueChange).toBe(100);
    expect(data.previousMetrics).toBeDefined();
  });

  it('should include AI insights and health score', async () => {
    const request = new Request('https://app.example.com/app/analytics');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.aiInsights).toBeDefined();
    expect(Array.isArray(data.aiInsights)).toBe(true);
    expect(data.healthScore).toBeDefined();
    expect(data.healthScore.overall).toBe(75);
    expect(data.executiveSummary).toBeDefined();
  });

  it('should include auto-calculated business metrics', async () => {
    const request = new Request('https://app.example.com/app/analytics');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.autoCalculatedMetrics).toBeDefined();
    expect(data.autoCalculatedMetrics.customerLifetimeValue).toBe(200);
    expect(data.autoCalculatedMetrics.repeatPurchaseRate).toBeGreaterThanOrEqual(0);
  });

  it('should include max historical days from entitlements', async () => {
    const request = new Request('https://app.example.com/app/analytics');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.maxHistoricalDays).toBe(30);
  });

  it('should reject unauthenticated requests', async () => {
    vi.mocked(authenticate.admin).mockResolvedValue({
      session: { shop: '' },
      admin: { graphql: vi.fn() },
      cors: vi.fn(),
    } as any);

    const request = new Request('https://app.example.com/app/analytics');

    await expect(
      loader({ request, params: {}, context: {} })
    ).rejects.toThrow();
  });

  it('should handle analytics service failures gracefully (safeQuery fallback)', async () => {
    // Make all analytics services throw
    vi.mocked(getOverviewMetricsWithComparison).mockRejectedValue(
      new Error('Data API throttled')
    );
    vi.mocked(getTierPerformanceMetrics).mockRejectedValue(
      new Error('Data API throttled')
    );
    vi.mocked(getProgramImpactMetrics).mockRejectedValue(
      new Error('Data API throttled')
    );
    vi.mocked(getMonthlyImpactData).mockRejectedValue(
      new Error('Data API throttled')
    );
    vi.mocked(getCustomerBehaviourData).mockRejectedValue(
      new Error('Data API throttled')
    );
    vi.mocked(getCohortAnalysis).mockRejectedValue(
      new Error('Data API throttled')
    );
    vi.mocked(getMonthlyTierRevenue).mockRejectedValue(
      new Error('Data API throttled')
    );

    const request = new Request('https://app.example.com/app/analytics');
    // Should NOT throw — safeQuery wraps each with fallback
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    // Should return fallback data instead of crashing
    expect(data.overviewMetrics).toBeDefined();
    expect(data.overviewMetrics.totalRevenue).toBe(0); // fallback
    expect(data.tierPerformance).toEqual([]); // fallback
  });

  it('should respect date range query parameter', async () => {
    const request = new Request('https://app.example.com/app/analytics?range=7days');
    await loader({ request, params: {}, context: {} });

    // Verify metrics comparison was called (with some dateRange)
    expect(getOverviewMetricsWithComparison).toHaveBeenCalledWith(
      MOCK_SHOP,
      expect.objectContaining({
        start: expect.any(Date),
        end: expect.any(Date),
      })
    );
  });

  it('should handle null shopSettings', async () => {
    vi.mocked(db.shopSettings.findUnique).mockResolvedValue(null);

    const request = new Request('https://app.example.com/app/analytics');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.shopSettings).toBeNull();
  });

  it('should include cohort analysis data', async () => {
    const request = new Request('https://app.example.com/app/analytics');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.cohortAnalysis).toBeDefined();
    expect(data.cohortAnalysis.summaryMetrics).toBeDefined();
  });

  it('should include customer behaviour data', async () => {
    const request = new Request('https://app.example.com/app/analytics');
    const response = await loader({ request, params: {}, context: {} });
    const data = await response.json();

    expect(data.customerBehaviourData).toBeDefined();
    expect(data.customerBehaviourData.rfmSegments).toBeDefined();
  });
});
