/**
 * HealthScoreWidget - Program health score visualization
 */

import { Text, InlineStack, ProgressBar, BlockStack, Tooltip, Icon } from "@shopify/polaris";
import { QuestionCircleIcon } from "@shopify/polaris-icons";
import { BaseWidget, type WidgetSize } from "./BaseWidget";
import type { HealthScore } from "~/services/analytics/insight-engine.server";

export interface HealthScoreWidgetProps {
  id: string;
  healthScore: HealthScore | null;
  size?: WidgetSize;
  isLoading?: boolean;
  onRefresh?: () => void;
}

const categoryDescriptions: Record<string, string> = {
  Engagement: "Measures customer activity with points, redemptions, and program features",
  Retention: "Tracks how well you keep customers active and returning",
  ROI: "Calculates the return on your loyalty program investment",
  Growth: "Monitors new member acquisition and revenue trends",
};

const getScoreColor = (score: number): string => {
  if (score >= 80) return 'var(--p-color-bg-fill-success)';
  if (score >= 60) return 'var(--p-color-bg-fill-warning)';
  if (score >= 40) return 'var(--p-color-bg-fill-caution)';
  return 'var(--p-color-bg-fill-critical)';
};

const getScoreLabel = (score: number): string => {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Needs Attention';
  return 'Critical';
};

const getScoreTone = (score: number): 'success' | 'warning' | 'critical' => {
  if (score >= 70) return 'success';
  if (score >= 50) return 'warning';
  return 'critical';
};

export function HealthScoreWidget({
  id,
  healthScore,
  size = 'medium',
  isLoading = false,
  onRefresh,
}: HealthScoreWidgetProps) {
  if (!healthScore) {
    return (
      <BaseWidget
        id={id}
        title="Program Health"
        size={size}
        isLoading={isLoading}
        onRefresh={onRefresh}
      >
        <Text as="p" tone="subdued">Unable to calculate health score</Text>
      </BaseWidget>
    );
  }

  return (
    <BaseWidget
      id={id}
      title="Program Health Score"
      subtitle="Overall performance assessment"
      size={size}
      isLoading={isLoading}
      onRefresh={onRefresh}
      helpText="A composite score based on engagement, retention, ROI, and growth metrics"
    >
      <BlockStack gap="500">
        {/* Main Score Circle */}
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            border: `8px solid ${getScoreColor(healthScore.overall)}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
            backgroundColor: 'var(--p-color-bg-surface-secondary)'
          }}>
            <Text as="p" variant="heading2xl" fontWeight="bold">
              {healthScore.overall}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">/ 100</Text>
          </div>
          <div style={{ marginTop: '12px' }}>
            <Text
              as="p"
              variant="headingSm"
              tone={getScoreTone(healthScore.overall) === 'warning' ? 'caution' : getScoreTone(healthScore.overall) as any}
            >
              {getScoreLabel(healthScore.overall)}
            </Text>
          </div>
        </div>

        {/* Category Breakdown */}
        <BlockStack gap="300">
          {healthScore.breakdown.map((item) => (
            <div key={item.category}>
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="100" blockAlign="center">
                  <Text as="span" variant="bodySm">{item.category}</Text>
                  <Tooltip content={categoryDescriptions[item.category] || item.category}>
                    <Icon source={QuestionCircleIcon} tone="subdued" />
                  </Tooltip>
                </InlineStack>
                <Text as="span" variant="bodySm" fontWeight="semibold">
                  {item.score}
                </Text>
              </InlineStack>
              <div style={{ marginTop: '4px' }}>
                <ProgressBar
                  progress={item.score}
                  tone={getScoreTone(item.score) === 'warning' ? 'primary' : getScoreTone(item.score) as any}
                  size="small"
                />
              </div>
              {/* Contributing Factors */}
              {item.factors.length > 0 && (
                <div style={{ marginTop: '4px', paddingLeft: '8px' }}>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {item.factors.join(' • ')}
                  </Text>
                </div>
              )}
            </div>
          ))}
        </BlockStack>
      </BlockStack>
    </BaseWidget>
  );
}

export default HealthScoreWidget;
