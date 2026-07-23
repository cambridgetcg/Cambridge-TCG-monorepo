/**
 * TierPerformanceChart - Professional Analytics Module
 *
 * Modern dashboard-style visualization with:
 * - Tier summary cards with key KPIs
 * - Grouped horizontal bar chart for metric comparison
 * - Clean, professional design language
 */

import { useMemo, memo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Card, Box, BlockStack, InlineStack, Text, Divider, Tabs } from '@shopify/polaris';
import type { ChartOptions, ChartData } from 'chart.js';

// ═══════════════════════════════════════════════════════════════════════════
// PROFESSIONAL COLOR SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

const TIER_COLORS = [
  { primary: '#6366F1', secondary: '#818CF8', bg: 'rgba(99, 102, 241, 0.08)', gradient: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' },
  { primary: '#0EA5E9', secondary: '#38BDF8', bg: 'rgba(14, 165, 233, 0.08)', gradient: 'linear-gradient(135deg, #0EA5E9 0%, #06B6D4 100%)' },
  { primary: '#10B981', secondary: '#34D399', bg: 'rgba(16, 185, 129, 0.08)', gradient: 'linear-gradient(135deg, #10B981 0%, #14B8A6 100%)' },
  { primary: '#F59E0B', secondary: '#FBBF24', bg: 'rgba(245, 158, 11, 0.08)', gradient: 'linear-gradient(135deg, #F59E0B 0%, #F97316 100%)' },
  { primary: '#EC4899', secondary: '#F472B6', bg: 'rgba(236, 72, 153, 0.08)', gradient: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)' },
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface TierMetric {
  id: string;
  name: string;
  cashbackPercent: number;
  monthlyOrderFrequency: number;
  averageOrderValue: number;
  lifetimeValue: number;
  retentionRate: number;
  revenuePerOrder: number;
  totalCashbackEarned: number;
}

interface TierPerformanceChartProps {
  tiers: TierMetric[];
  formatAmount: (value: number) => string;
}

type MetricKey = 'orderFrequency' | 'aov' | 'ltv' | 'retention' | 'revenue' | 'cashback';

interface MetricConfig {
  key: MetricKey;
  label: string;
  shortLabel: string;
  getValue: (tier: TierMetric) => number;
  format: (value: number, formatAmount: (v: number) => string) => string;
  icon: string;
  description: string;
}

const METRICS: MetricConfig[] = [
  {
    key: 'ltv',
    label: 'Customer Lifetime Value',
    shortLabel: 'LTV',
    getValue: (tier) => tier.lifetimeValue,
    format: (value, formatAmount) => formatAmount(value),
    icon: '💎',
    description: 'Total expected revenue per customer',
  },
  {
    key: 'aov',
    label: 'Average Order Value',
    shortLabel: 'AOV',
    getValue: (tier) => tier.averageOrderValue,
    format: (value, formatAmount) => formatAmount(value),
    icon: '🛒',
    description: 'Average spend per transaction',
  },
  {
    key: 'retention',
    label: 'Retention Rate',
    shortLabel: 'Retention',
    getValue: (tier) => tier.retentionRate,
    format: (value) => `${value.toFixed(1)}%`,
    icon: '🔄',
    description: 'Customers who return to purchase',
  },
  {
    key: 'orderFrequency',
    label: 'Monthly Order Frequency',
    shortLabel: 'Frequency',
    getValue: (tier) => tier.monthlyOrderFrequency,
    format: (value) => `${value.toFixed(2)}/mo`,
    icon: '📊',
    description: 'Average orders per month per customer',
  },
  {
    key: 'revenue',
    label: 'Revenue per Order',
    shortLabel: 'Rev/Order',
    getValue: (tier) => tier.revenuePerOrder,
    format: (value, formatAmount) => formatAmount(value),
    icon: '💰',
    description: 'Net revenue after cashback per order',
  },
  {
    key: 'cashback',
    label: 'Total Cashback Earned',
    shortLabel: 'Cashback',
    getValue: (tier) => tier.totalCashbackEarned,
    format: (value, formatAmount) => formatAmount(value),
    icon: '🎁',
    description: 'Average cashback earned per customer',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// TIER SUMMARY CARD
// ═══════════════════════════════════════════════════════════════════════════

interface TierSummaryCardProps {
  tier: TierMetric;
  colorIndex: number;
  formatAmount: (value: number) => string;
  isHighlighted: boolean;
  onHover: () => void;
  onLeave: () => void;
}

const TierSummaryCard = memo(function TierSummaryCard({
  tier,
  colorIndex,
  formatAmount,
  isHighlighted,
  onHover,
  onLeave,
}: TierSummaryCardProps) {
  const color = TIER_COLORS[colorIndex % TIER_COLORS.length];

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        flex: '1 1 180px',
        minWidth: 180,
        maxWidth: 220,
        padding: '16px',
        borderRadius: '12px',
        background: isHighlighted ? color.bg : '#FAFAFA',
        border: `2px solid ${isHighlighted ? color.primary : 'transparent'}`,
        transition: 'all 0.2s ease',
        cursor: 'pointer',
      }}
    >
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: color.gradient,
              boxShadow: `0 2px 8px ${color.primary}40`,
            }}
          />
          <Text variant="bodySm" tone="subdued" as="span">
            {tier.cashbackPercent}% cashback
          </Text>
        </InlineStack>

        <Text variant="headingSm" as="h3" fontWeight="semibold">
          {tier.name}
        </Text>

        <div style={{ borderTop: `1px solid ${isHighlighted ? color.primary + '30' : '#E5E5E5'}`, paddingTop: 12 }}>
          <BlockStack gap="200">
            <InlineStack align="space-between">
              <Text variant="bodySm" tone="subdued" as="span">LTV</Text>
              <Text variant="bodyMd" fontWeight="semibold" as="span">
                {formatAmount(tier.lifetimeValue)}
              </Text>
            </InlineStack>
            <InlineStack align="space-between">
              <Text variant="bodySm" tone="subdued" as="span">Retention</Text>
              <Text variant="bodyMd" fontWeight="semibold" as="span">
                {tier.retentionRate.toFixed(1)}%
              </Text>
            </InlineStack>
          </BlockStack>
        </div>
      </BlockStack>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// METRIC COMPARISON BAR
// ═══════════════════════════════════════════════════════════════════════════

interface MetricComparisonProps {
  metric: MetricConfig;
  tiers: TierMetric[];
  formatAmount: (value: number) => string;
  highlightedTier: number | null;
}

const MetricComparison = memo(function MetricComparison({
  metric,
  tiers,
  formatAmount,
  highlightedTier,
}: MetricComparisonProps) {
  const maxValue = useMemo(() => {
    return Math.max(...tiers.map(t => metric.getValue(t)), 1);
  }, [tiers, metric]);

  return (
    <Box paddingBlockStart="400" paddingBlockEnd="400">
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <span style={{ fontSize: 16 }}>{metric.icon}</span>
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              {metric.label}
            </Text>
          </InlineStack>
          <Text variant="bodySm" tone="subdued" as="span">
            {metric.description}
          </Text>
        </InlineStack>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tiers.map((tier, index) => {
            const value = metric.getValue(tier);
            const percentage = (value / maxValue) * 100;
            const color = TIER_COLORS[index % TIER_COLORS.length];
            const isHighlighted = highlightedTier === index;

            return (
              <div key={tier.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 80, flexShrink: 0 }}>
                  <Text variant="bodySm" fontWeight={isHighlighted ? 'semibold' : 'regular'} as="span">
                    {tier.name}
                  </Text>
                </div>
                <div
                  style={{
                    flex: 1,
                    height: 28,
                    background: '#F3F4F6',
                    borderRadius: 6,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${Math.max(percentage, 2)}%`,
                      background: isHighlighted ? color.gradient : color.primary,
                      borderRadius: 6,
                      transition: 'all 0.3s ease',
                      opacity: isHighlighted ? 1 : 0.75,
                      boxShadow: isHighlighted ? `0 2px 8px ${color.primary}40` : 'none',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: 12,
                      fontWeight: 600,
                      color: percentage > 70 ? 'white' : '#374151',
                      textShadow: percentage > 70 ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
                    }}
                  >
                    {metric.format(value, formatAmount)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </BlockStack>
    </Box>
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// GROUPED BAR CHART
// ═══════════════════════════════════════════════════════════════════════════

interface GroupedBarChartProps {
  tiers: TierMetric[];
  formatAmount: (value: number) => string;
  selectedMetrics: MetricKey[];
}

const GroupedBarChart = memo(function GroupedBarChart({
  tiers,
  formatAmount,
  selectedMetrics,
}: GroupedBarChartProps) {
  const activeMetrics = METRICS.filter(m => selectedMetrics.includes(m.key));

  const chartData: ChartData<'bar'> = useMemo(() => {
    return {
      labels: tiers.map(t => t.name),
      datasets: activeMetrics.map((metric, metricIndex) => {
        // Normalize values to percentages for comparison
        const values = tiers.map(t => metric.getValue(t));
        const max = Math.max(...values, 1);

        return {
          label: metric.shortLabel,
          data: values.map(v => (v / max) * 100),
          backgroundColor: tiers.map((_, tierIndex) => {
            const color = TIER_COLORS[tierIndex % TIER_COLORS.length];
            return `${color.primary}${metricIndex === 0 ? 'CC' : metricIndex === 1 ? '99' : '66'}`;
          }),
          borderColor: tiers.map((_, tierIndex) => TIER_COLORS[tierIndex % TIER_COLORS.length].primary),
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.8,
          categoryPercentage: 0.85,
        };
      }),
    };
  }, [tiers, activeMetrics]);

  const chartOptions: ChartOptions<'bar'> = useMemo(() => ({
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 500,
      easing: 'easeOutQuart',
    },
    scales: {
      x: {
        beginAtZero: true,
        max: 100,
        grid: {
          color: 'rgba(0, 0, 0, 0.04)',
        },
        ticks: {
          callback: (value) => `${value}%`,
          font: { size: 11 },
          color: '#6B7280',
        },
        title: {
          display: true,
          text: 'Relative Performance (%)',
          font: { size: 11, weight: 500 },
          color: '#9CA3AF',
        },
      },
      y: {
        grid: {
          display: false,
        },
        ticks: {
          font: { size: 12, weight: 500 },
          color: '#374151',
        },
      },
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          padding: 16,
          usePointStyle: true,
          pointStyle: 'rectRounded',
          font: { size: 11, weight: 500 },
          color: '#6B7280',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        padding: 12,
        cornerRadius: 8,
        titleFont: { size: 13, weight: 600 },
        bodyFont: { size: 12 },
        titleColor: '#F9FAFB',
        bodyColor: '#D1D5DB',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        callbacks: {
          title: (items) => items[0]?.label || '',
          label: (context) => {
            const metricIndex = context.datasetIndex;
            const tierIndex = context.dataIndex;
            const metric = activeMetrics[metricIndex];
            const tier = tiers[tierIndex];

            if (!metric || !tier) return '';

            const actualValue = metric.getValue(tier);
            return `${metric.shortLabel}: ${metric.format(actualValue, formatAmount)}`;
          },
        },
      },
    },
  }), [tiers, activeMetrics, formatAmount]);

  return (
    <div style={{ height: Math.max(tiers.length * 60, 200), minHeight: 200 }}>
      <Bar data={chartData} options={chartOptions} />
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const TierPerformanceChart = memo(function TierPerformanceChart({
  tiers,
  formatAmount,
}: TierPerformanceChartProps) {
  const [highlightedTier, setHighlightedTier] = useState<number | null>(null);
  const [selectedTab, setSelectedTab] = useState(1); // Default to Quick Compare tab
  const [selectedMetrics] = useState<MetricKey[]>(['ltv', 'aov', 'retention']);

  const tabs = [
    { id: 'detailed', content: 'Detailed View' },
    { id: 'comparison', content: 'Quick Compare' },
  ];

  if (tiers.length === 0) {
    return null;
  }

  return (
    <Card>
      <Box padding="500">
        <BlockStack gap="500">
          {/* Header */}
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">
                  Tier Performance Analysis
                </Text>
                <Text variant="bodySm" tone="subdued" as="p">
                  Compare key metrics across your loyalty tiers
                </Text>
              </BlockStack>
            </InlineStack>
          </BlockStack>

          {/* Tier Summary Cards */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              justifyContent: 'flex-start',
            }}
          >
            {tiers.map((tier, index) => (
              <TierSummaryCard
                key={tier.id}
                tier={tier}
                colorIndex={index}
                formatAmount={formatAmount}
                isHighlighted={highlightedTier === index}
                onHover={() => setHighlightedTier(index)}
                onLeave={() => setHighlightedTier(null)}
              />
            ))}
          </div>

          <Divider />

          {/* Tabs */}
          <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
            <Box paddingBlockStart="400">
              {selectedTab === 0 ? (
                /* Detailed Metric Comparisons */
                <BlockStack gap="100">
                  {METRICS.slice(0, 4).map((metric) => (
                    <div key={metric.key}>
                      <MetricComparison
                        metric={metric}
                        tiers={tiers}
                        formatAmount={formatAmount}
                        highlightedTier={highlightedTier}
                      />
                      <Divider />
                    </div>
                  ))}
                  {METRICS.slice(4).map((metric) => (
                    <MetricComparison
                      key={metric.key}
                      metric={metric}
                      tiers={tiers}
                      formatAmount={formatAmount}
                      highlightedTier={highlightedTier}
                    />
                  ))}
                </BlockStack>
              ) : (
                /* Grouped Bar Chart */
                <BlockStack gap="400">
                  <Text variant="bodySm" tone="subdued" as="p">
                    Normalized comparison showing relative performance across tiers
                  </Text>
                  <GroupedBarChart
                    tiers={tiers}
                    formatAmount={formatAmount}
                    selectedMetrics={selectedMetrics}
                  />
                </BlockStack>
              )}
            </Box>
          </Tabs>

          {/* Footer Note */}
          <Box paddingBlockStart="200">
            <InlineStack gap="200" blockAlign="center">
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#10B981',
                }}
              />
              <Text variant="bodySm" tone="subdued" as="p">
                Metrics are normalized for easy comparison. Hover over tiers to highlight their performance.
              </Text>
            </InlineStack>
          </Box>
        </BlockStack>
      </Box>
    </Card>
  );
});

export default TierPerformanceChart;
