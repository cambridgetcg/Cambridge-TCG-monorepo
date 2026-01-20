/**
 * MetricCardWidget - Single KPI display with trend indicator
 */

import { Text, InlineStack, Badge, Tooltip, Icon } from "@shopify/polaris";
import { ArrowUpIcon, ArrowDownIcon, MinusIcon, InfoIcon } from "@shopify/polaris-icons";
import { BaseWidget, type WidgetSize } from "./BaseWidget";

export interface MetricCardProps {
  id: string;
  title: string;
  value: string | number;
  format?: 'number' | 'currency' | 'percent';
  change?: {
    value: number;
    period: string;
  };
  benchmark?: {
    value: number;
    label: string;
  };
  explanation?: string;
  size?: WidgetSize;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function MetricCardWidget({
  id,
  title,
  value,
  format = 'number',
  change,
  benchmark,
  explanation,
  size = 'small',
  isLoading = false,
  onRefresh,
}: MetricCardProps) {
  // Format value based on type
  const formatValue = (val: string | number): string => {
    if (typeof val === 'string') return val;

    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(val);
      case 'percent':
        return `${val.toFixed(1)}%`;
      default:
        return new Intl.NumberFormat('en-US').format(val);
    }
  };

  // Determine trend direction
  const getTrendIcon = () => {
    if (!change) return null;
    if (change.value > 0) return ArrowUpIcon;
    if (change.value < 0) return ArrowDownIcon;
    return MinusIcon;
  };

  const getTrendTone = (): 'success' | 'critical' | 'subdued' => {
    if (!change) return 'subdued';
    if (change.value > 0) return 'success';
    if (change.value < 0) return 'critical';
    return 'subdued';
  };

  const TrendIcon = getTrendIcon();

  return (
    <BaseWidget
      id={id}
      title={title}
      size={size}
      isLoading={isLoading}
      onRefresh={onRefresh}
      helpText={explanation}
    >
      <div style={{ padding: '8px 0' }}>
        {/* Main Value */}
        <Text as="p" variant="heading2xl" fontWeight="bold">
          {formatValue(value)}
        </Text>

        {/* Change Indicator */}
        {change && (
          <InlineStack gap="200" blockAlign="center">
            {TrendIcon && (
              <Icon source={TrendIcon} tone={getTrendTone()} />
            )}
            <Text
              as="span"
              variant="bodySm"
              tone={getTrendTone()}
            >
              {change.value > 0 ? '+' : ''}{change.value.toFixed(1)}%
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              vs {change.period}
            </Text>
          </InlineStack>
        )}

        {/* Benchmark Comparison */}
        {benchmark && (
          <div style={{ marginTop: '12px' }}>
            <InlineStack gap="200" blockAlign="center">
              <Badge
                tone={
                  typeof value === 'number' && value >= benchmark.value
                    ? 'success'
                    : 'attention'
                }
              >
                {typeof value === 'number' && value >= benchmark.value
                  ? 'Above'
                  : 'Below'} {benchmark.label}
              </Badge>
              <Tooltip content={`${benchmark.label}: ${formatValue(benchmark.value)}`}>
                <Icon source={InfoIcon} tone="subdued" />
              </Tooltip>
            </InlineStack>
          </div>
        )}
      </div>
    </BaseWidget>
  );
}

export default MetricCardWidget;
