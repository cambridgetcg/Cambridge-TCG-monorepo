/**
 * InsightWidget - Display AI-generated insights with actions
 */

import { Text, InlineStack, Badge, Button, BlockStack, Divider, Icon } from "@shopify/polaris";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  InfoIcon,
  ChevronRightIcon,
  StatusActiveIcon
} from "@shopify/polaris-icons";
import { Link } from "@remix-run/react";
import { BaseWidget, type WidgetSize } from "./BaseWidget";
import type { AnalyticsInsight, InsightSeverity } from "~/services/analytics/insight-engine.server";

export interface InsightWidgetProps {
  id: string;
  title?: string;
  insights: AnalyticsInsight[];
  maxItems?: number;
  size?: WidgetSize;
  isLoading?: boolean;
  onRefresh?: () => void;
  onDismiss?: (insightId: string) => void;
}

const severityConfig: Record<InsightSeverity, {
  icon: typeof AlertCircleIcon;
  tone: 'critical' | 'warning' | 'success' | 'info';
  badgeTone: 'critical' | 'warning' | 'success' | 'info';
}> = {
  critical: { icon: AlertCircleIcon, tone: 'critical', badgeTone: 'critical' },
  warning: { icon: StatusActiveIcon, tone: 'warning', badgeTone: 'warning' },
  positive: { icon: CheckCircleIcon, tone: 'success', badgeTone: 'success' },
  info: { icon: InfoIcon, tone: 'info', badgeTone: 'info' },
};

export function InsightWidget({
  id,
  title = "Insights & Recommendations",
  insights,
  maxItems = 5,
  size = 'large',
  isLoading = false,
  onRefresh,
  onDismiss,
}: InsightWidgetProps) {
  const displayInsights = insights.slice(0, maxItems);

  return (
    <BaseWidget
      id={id}
      title={title}
      subtitle={`${insights.length} actionable insights`}
      size={size}
      isLoading={isLoading}
      onRefresh={onRefresh}
      expandable={insights.length > maxItems}
    >
      <BlockStack gap="400">
        {displayInsights.length === 0 ? (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            backgroundColor: 'var(--p-color-bg-surface-secondary)',
            borderRadius: '8px'
          }}>
            <Icon source={CheckCircleIcon} tone="success" />
            <Text as="p" tone="subdued">No actionable insights at this time. Your program is running smoothly!</Text>
          </div>
        ) : (
          displayInsights.map((insight, index) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onDismiss={onDismiss}
              showDivider={index < displayInsights.length - 1}
            />
          ))
        )}

        {insights.length > maxItems && (
          <div style={{ textAlign: 'center' }}>
            <Button variant="plain">
              View all {insights.length} insights
            </Button>
          </div>
        )}
      </BlockStack>
    </BaseWidget>
  );
}

interface InsightCardProps {
  insight: AnalyticsInsight;
  onDismiss?: (insightId: string) => void;
  showDivider?: boolean;
}

function InsightCard({ insight, onDismiss, showDivider }: InsightCardProps) {
  const config = severityConfig[insight.severity];
  const SeverityIcon = config.icon;

  return (
    <>
      <div style={{
        padding: '12px',
        backgroundColor: 'var(--p-color-bg-surface-secondary)',
        borderRadius: '8px',
        borderLeft: `4px solid var(--p-color-border-${config.tone === 'info' ? 'subdued' : config.tone})`
      }}>
        <BlockStack gap="300">
          {/* Header */}
          <InlineStack align="space-between" blockAlign="start">
            <InlineStack gap="200" blockAlign="center">
              <Icon source={SeverityIcon} tone={config.tone} />
              <Text as="h4" variant="headingSm" fontWeight="semibold">
                {insight.title}
              </Text>
            </InlineStack>
            <Badge tone={config.badgeTone}>
              {insight.category}
            </Badge>
          </InlineStack>

          {/* Description */}
          <Text as="p" variant="bodyMd">
            {insight.description}
          </Text>

          {/* Context/Explanation */}
          {insight.context?.explanation && (
            <div style={{
              padding: '8px 12px',
              backgroundColor: 'var(--p-color-bg-surface)',
              borderRadius: '4px',
              fontSize: '13px'
            }}>
              <Text as="p" variant="bodySm" tone="subdued">
                {insight.context.explanation}
              </Text>
            </div>
          )}

          {/* Metric Value */}
          {insight.change && (
            <InlineStack gap="200">
              <Text as="span" variant="bodySm" fontWeight="semibold">
                {insight.change.direction === 'up' ? '+' : ''}{insight.change.percentage.toFixed(1)}%
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">
                vs {insight.change.period}
              </Text>
            </InlineStack>
          )}

          {/* Actions */}
          <InlineStack gap="200">
            {insight.action && (
              <Link to={insight.action.href}>
                <Button size="slim" variant="primary">
                  {insight.action.label}
                  <Icon source={ChevronRightIcon} />
                </Button>
              </Link>
            )}
            {onDismiss && (
              <Button
                size="slim"
                variant="plain"
                onClick={() => onDismiss(insight.id)}
              >
                Dismiss
              </Button>
            )}
          </InlineStack>
        </BlockStack>
      </div>
      {showDivider && <Divider />}
    </>
  );
}

export default InsightWidget;
