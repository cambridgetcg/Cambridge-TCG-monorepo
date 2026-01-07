/**
 * TierPerformanceChart - Neural-Crystalline Architecture
 *
 * Optimized radar chart with:
 * - Memoized data transformation (single-pass neural computation)
 * - Crystalline design token system
 * - Zero-waste rendering pipeline
 */

import { useMemo, memo } from 'react';
import { Radar } from 'react-chartjs-2';
import { Card, Box, BlockStack, InlineStack, Text } from '@shopify/polaris';
import { TierBadge } from '../TierBadge';
import type { ChartOptions, ChartData } from 'chart.js';

// ═══════════════════════════════════════════════════════════════════════════
// CRYSTALLINE DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════

const CRYSTAL_PALETTE = {
  amethyst: { border: '#5C6AC4', bg: 'rgba(92, 106, 196, 0.15)' },
  sapphire: { border: '#006FBB', bg: 'rgba(0, 111, 187, 0.15)' },
  emerald: { border: '#00848E', bg: 'rgba(0, 132, 142, 0.15)' },
  aquamarine: { border: '#47C1BF', bg: 'rgba(71, 193, 191, 0.15)' },
  topaz: { border: '#9C6ADE', bg: 'rgba(156, 106, 222, 0.15)' },
} as const;

const CRYSTAL_SEQUENCE = ['amethyst', 'sapphire', 'emerald', 'aquamarine', 'topaz'] as const;

const METRIC_LABELS = [
  'Order Frequency',
  'Avg Order Value',
  'Customer LTV',
  'Retention Rate',
  'Revenue/Order',
  'Cashback Earned',
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

// ═══════════════════════════════════════════════════════════════════════════
// NEURAL TRANSFORMATION LAYER
// Single-pass computation matrix for maximum efficiency
// ═══════════════════════════════════════════════════════════════════════════

interface NeuralMetricState {
  maxOrderFreq: number;
  maxAOV: number;
  maxLTV: number;
  maxRevenue: number;
  maxCashback: number;
}

/**
 * Neural single-pass aggregation - computes all max values in O(n)
 * Instead of 5 separate iterations, we traverse once
 */
function computeNeuralState(tiers: TierMetric[]): NeuralMetricState {
  return tiers.reduce(
    (state, tier) => ({
      maxOrderFreq: Math.max(state.maxOrderFreq, tier.monthlyOrderFrequency),
      maxAOV: Math.max(state.maxAOV, tier.averageOrderValue),
      maxLTV: Math.max(state.maxLTV, tier.lifetimeValue),
      maxRevenue: Math.max(state.maxRevenue, tier.revenuePerOrder),
      maxCashback: Math.max(state.maxCashback, tier.totalCashbackEarned),
    }),
    { maxOrderFreq: 1, maxAOV: 1, maxLTV: 1, maxRevenue: 1, maxCashback: 1 }
  );
}

/**
 * Crystalline normalization - transforms raw value to 0-100 scale
 * with 20% buffer for visual breathing room
 */
const crystallize = (value: number, max: number): number => {
  const bufferedMax = max * 1.2;
  return bufferedMax > 0 ? Math.min((value / bufferedMax) * 100, 100) : 0;
};

/**
 * Transform tier into normalized radar data points
 */
function transformTierToRadarPoints(tier: TierMetric, neuralState: NeuralMetricState): number[] {
  return [
    crystallize(tier.monthlyOrderFrequency, neuralState.maxOrderFreq),
    crystallize(tier.averageOrderValue, neuralState.maxAOV),
    crystallize(tier.lifetimeValue, neuralState.maxLTV),
    Math.min(tier.retentionRate, 100), // Already 0-100
    crystallize(tier.revenuePerOrder, neuralState.maxRevenue),
    crystallize(tier.totalCashbackEarned, neuralState.maxCashback),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// CHART DATA FACTORY
// ═══════════════════════════════════════════════════════════════════════════

function createChartData(tiers: TierMetric[]): ChartData<'radar'> {
  const neuralState = computeNeuralState(tiers);

  return {
    labels: [...METRIC_LABELS],
    datasets: tiers.map((tier, index) => {
      const crystalKey = CRYSTAL_SEQUENCE[index % CRYSTAL_SEQUENCE.length];
      const crystal = CRYSTAL_PALETTE[crystalKey];

      return {
        label: tier.name,
        data: transformTierToRadarPoints(tier, neuralState),
        borderColor: crystal.border,
        backgroundColor: crystal.bg,
        borderWidth: 2,
        pointBackgroundColor: crystal.border,
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: crystal.border,
        pointRadius: 3,
        pointHoverRadius: 5,
      };
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHART OPTIONS FACTORY
// ═══════════════════════════════════════════════════════════════════════════

function createChartOptions(
  tiers: TierMetric[],
  formatAmount: (value: number) => string
): ChartOptions<'radar'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 400,
      easing: 'easeOutQuart',
    },
    scales: {
      r: {
        angleLines: {
          display: true,
          color: 'rgba(0, 0, 0, 0.08)',
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.06)',
        },
        suggestedMin: 0,
        suggestedMax: 100,
        ticks: {
          stepSize: 20,
          callback: (value) => `${value}%`,
          font: { size: 10 },
          color: 'rgba(0, 0, 0, 0.5)',
        },
        pointLabels: {
          font: { size: 11, weight: 500 },
          color: 'rgba(0, 0, 0, 0.7)',
        },
      },
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          boxWidth: 12,
          padding: 16,
          usePointStyle: true,
          pointStyle: 'circle',
          font: { size: 12 },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        padding: 12,
        cornerRadius: 8,
        titleFont: { size: 13, weight: 600 },
        bodyFont: { size: 12 },
        callbacks: {
          label: (context) => {
            const tierIndex = context.datasetIndex;
            const metricIndex = context.dataIndex;
            const tier = tiers[tierIndex];

            if (!tier) return '';

            const formatters: Record<number, () => string> = {
              0: () => `${tier.monthlyOrderFrequency.toFixed(2)} orders/customer`,
              1: () => formatAmount(tier.averageOrderValue),
              2: () => formatAmount(tier.lifetimeValue),
              3: () => `${tier.retentionRate.toFixed(1)}%`,
              4: () => formatAmount(tier.revenuePerOrder),
              5: () => `${formatAmount(tier.totalCashbackEarned)}/customer`,
            };

            const formatter = formatters[metricIndex];
            const actualValue = formatter ? formatter() : `${context.parsed.r.toFixed(1)}%`;

            return `${tier.name}: ${actualValue}`;
          },
        },
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGEND COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface TierLegendProps {
  tiers: TierMetric[];
}

const TierLegend = memo(function TierLegend({ tiers }: TierLegendProps) {
  return (
    <InlineStack gap="400" blockAlign="center" wrap>
      {tiers.map((tier, index) => {
        const crystalKey = CRYSTAL_SEQUENCE[index % CRYSTAL_SEQUENCE.length];
        const crystal = CRYSTAL_PALETTE[crystalKey];

        return (
          <InlineStack key={tier.id} gap="200" blockAlign="center">
            <div
              style={{
                width: 12,
                height: 12,
                backgroundColor: crystal.border,
                borderRadius: '50%',
                border: '2px solid white',
                boxShadow: `0 0 0 1px ${crystal.border}`,
              }}
            />
            <TierBadge
              tierName={tier.name}
              size="small"
              showIcon={false}
              cashbackPercent={tier.cashbackPercent}
            />
          </InlineStack>
        );
      })}
    </InlineStack>
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const TierPerformanceChart = memo(function TierPerformanceChart({
  tiers,
  formatAmount,
}: TierPerformanceChartProps) {
  // Memoized chart data - only recomputes when tiers change
  const chartData = useMemo(() => createChartData(tiers), [tiers]);

  // Memoized chart options - stable reference prevents re-renders
  const chartOptions = useMemo(
    () => createChartOptions(tiers, formatAmount),
    [tiers, formatAmount]
  );

  if (tiers.length === 0) {
    return null;
  }

  return (
    <BlockStack gap="400">
      <Card>
        <Box padding="400">
          <BlockStack gap="400">
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">
                Tier Performance
              </Text>
              <Text variant="bodySm" tone="subdued" as="p">
                Compare multiple performance dimensions across tiers simultaneously
              </Text>
            </BlockStack>

            <div
              style={{
                height: 400,
                padding: '20px 0',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <Radar data={chartData} options={chartOptions} />
            </div>

            <TierLegend tiers={tiers} />

            <Text variant="bodySm" tone="subdued" as="p">
              Each axis shows relative performance across tiers. Values are automatically
              scaled to 0-100% based on your actual data for easy comparison.
            </Text>
          </BlockStack>
        </Box>
      </Card>
    </BlockStack>
  );
});

export default TierPerformanceChart;
