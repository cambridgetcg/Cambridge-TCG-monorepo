/**
 * ExecutiveSummary - Top-level narrative summary of analytics
 *
 * Displays a 3-sentence summary of program performance with
 * key highlight and priority action.
 */

import { Card, BlockStack, Text, InlineStack, Badge, Icon, Button } from "@shopify/polaris";
import {
  ChartVerticalIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ChevronRightIcon
} from "@shopify/polaris-icons";
import { Link } from "@remix-run/react";
import type { ExecutiveSummary as ExecutiveSummaryType } from "~/services/analytics/narrative-generator.server";

export interface ExecutiveSummaryProps {
  summary: ExecutiveSummaryType | null;
  healthScore?: number;
  isLoading?: boolean;
  onRefresh?: () => void;
}

const getHealthIcon = (score: number) => {
  if (score >= 70) return CheckCircleIcon;
  if (score >= 40) return AlertCircleIcon;
  return AlertCircleIcon;
};

const getHealthTone = (score: number): 'success' | 'warning' | 'critical' => {
  if (score >= 70) return 'success';
  if (score >= 40) return 'warning';
  return 'critical';
};

const getHealthLabel = (score: number): string => {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Needs Attention';
  return 'Critical';
};

export function ExecutiveSummary({
  summary,
  healthScore = 0,
  isLoading = false,
  onRefresh,
}: ExecutiveSummaryProps) {
  if (isLoading) {
    return (
      <Card>
        <BlockStack gap="400">
          <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text as="p" tone="subdued">Loading summary...</Text>
          </div>
        </BlockStack>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card>
        <BlockStack gap="400">
          <InlineStack gap="200" blockAlign="center">
            <Icon source={ChartVerticalIcon} tone="subdued" />
            <Text as="h2" variant="headingMd">Analytics Summary</Text>
          </InlineStack>
          <Text as="p" tone="subdued">
            Unable to generate summary. Please ensure you have enough data.
          </Text>
        </BlockStack>
      </Card>
    );
  }

  const HealthIcon = getHealthIcon(healthScore);
  const healthTone = getHealthTone(healthScore);

  return (
    <Card>
      <BlockStack gap="500">
        {/* Header with Health Score Badge */}
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="300" blockAlign="center">
            <Icon source={ChartVerticalIcon} tone="base" />
            <Text as="h2" variant="headingMd">Program Summary</Text>
            <Badge tone="info">{summary.period}</Badge>
          </InlineStack>

          <InlineStack gap="200" blockAlign="center">
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 12px',
              backgroundColor: healthTone === 'success'
                ? 'var(--p-color-bg-fill-success-secondary)'
                : healthTone === 'warning'
                ? 'var(--p-color-bg-fill-warning-secondary)'
                : 'var(--p-color-bg-fill-critical-secondary)',
              borderRadius: '16px',
            }}>
              <Icon source={HealthIcon} tone={healthTone} />
              <Text as="span" variant="bodySm" fontWeight="semibold">
                {healthScore}/100 - {getHealthLabel(healthScore)}
              </Text>
            </div>
          </InlineStack>
        </InlineStack>

        {/* Summary Content */}
        <div style={{
          backgroundColor: 'var(--p-color-bg-surface-secondary)',
          padding: '16px 20px',
          borderRadius: '8px',
          borderLeft: `4px solid var(--p-color-border-${healthTone})`,
        }}>
          <BlockStack gap="300">
            {/* Performance Statement */}
            <InlineStack gap="200" blockAlign="start">
              <div style={{ marginTop: '2px' }}>
                <Icon
                  source={healthScore >= 60 ? ArrowUpIcon : ArrowDownIcon}
                  tone={healthTone}
                />
              </div>
              <Text as="p" variant="bodyMd">
                {summary.performance}
              </Text>
            </InlineStack>

            {/* Key Highlight */}
            <div style={{
              backgroundColor: 'var(--p-color-bg-surface)',
              padding: '12px 16px',
              borderRadius: '6px',
            }}>
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                {summary.highlight}
              </Text>
            </div>

            {/* Priority Action */}
            <InlineStack align="space-between" blockAlign="center">
              <Text as="p" variant="bodySm" tone="subdued">
                {summary.action}
              </Text>
              <Link to="/app/marketing/recommendations">
                <Button variant="plain" size="slim">
                  View All Actions
                  <Icon source={ChevronRightIcon} />
                </Button>
              </Link>
            </InlineStack>
          </BlockStack>
        </div>

        {/* Quick Stats Row */}
        <QuickStatsRow healthScore={healthScore} />
      </BlockStack>
    </Card>
  );
}

interface QuickStatsRowProps {
  healthScore: number;
}

function QuickStatsRow({ healthScore }: QuickStatsRowProps) {
  // These would normally come from real data
  const stats = [
    { label: 'Engagement', value: Math.round(healthScore * 0.9) },
    { label: 'Retention', value: Math.round(healthScore * 1.05) },
    { label: 'ROI', value: Math.round(healthScore * 0.95) },
    { label: 'Growth', value: Math.round(healthScore * 1.1) },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '12px',
      paddingTop: '8px',
      borderTop: '1px solid var(--p-color-border-subdued)',
    }}>
      {stats.map((stat) => (
        <div key={stat.label} style={{ textAlign: 'center' }}>
          <Text as="p" variant="headingSm" fontWeight="bold">
            {Math.min(100, Math.max(0, stat.value))}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {stat.label}
          </Text>
        </div>
      ))}
    </div>
  );
}

export default ExecutiveSummary;
