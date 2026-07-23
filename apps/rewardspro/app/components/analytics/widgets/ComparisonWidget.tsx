/**
 * ComparisonWidget - Period comparison visualization
 */

import { Text, InlineStack, BlockStack, Select, Icon } from "@shopify/polaris";
import { ArrowUpIcon, ArrowDownIcon, MinusIcon } from "@shopify/polaris-icons";
import { useState, useCallback } from "react";
import { BaseWidget, type WidgetSize } from "./BaseWidget";

export interface ComparisonData {
  metric: string;
  label: string;
  current: number;
  previous: number;
  format?: 'number' | 'currency' | 'percent';
}

export interface ComparisonWidgetProps {
  id: string;
  title?: string;
  data: ComparisonData[];
  periods?: { label: string; value: string }[];
  selectedPeriod?: string;
  onPeriodChange?: (period: string) => void;
  size?: WidgetSize;
  isLoading?: boolean;
  onRefresh?: () => void;
}

const defaultPeriods = [
  { label: 'vs Last Week', value: '7d' },
  { label: 'vs Last Month', value: '30d' },
  { label: 'vs Last Quarter', value: '90d' },
  { label: 'vs Last Year', value: '365d' },
];

export function ComparisonWidget({
  id,
  title = "Period Comparison",
  data,
  periods = defaultPeriods,
  selectedPeriod: initialPeriod,
  onPeriodChange,
  size = 'medium',
  isLoading = false,
  onRefresh,
}: ComparisonWidgetProps) {
  const [selectedPeriod, setSelectedPeriod] = useState(initialPeriod || periods[0]?.value || '30d');

  const handlePeriodChange = useCallback((value: string) => {
    setSelectedPeriod(value);
    if (onPeriodChange) {
      onPeriodChange(value);
    }
  }, [onPeriodChange]);

  const formatValue = (val: number, format?: string): string => {
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

  const calculateChange = (current: number, previous: number): {
    value: number;
    direction: 'up' | 'down' | 'flat';
    tone: 'success' | 'critical' | 'subdued';
  } => {
    if (previous === 0) return { value: 0, direction: 'flat', tone: 'subdued' };

    const change = ((current - previous) / previous) * 100;

    return {
      value: change,
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
      tone: change > 0 ? 'success' : change < 0 ? 'critical' : 'subdued',
    };
  };

  const periodSelector = (
    <Select
      label="Comparison period"
      labelHidden
      options={periods}
      value={selectedPeriod}
      onChange={handlePeriodChange}
    />
  );

  return (
    <BaseWidget
      id={id}
      title={title}
      size={size}
      isLoading={isLoading}
      onRefresh={onRefresh}
      actions={periodSelector}
    >
      <BlockStack gap="400">
        {data.map((item) => {
          const change = calculateChange(item.current, item.previous);
          const ChangeIcon = change.direction === 'up' ? ArrowUpIcon :
                            change.direction === 'down' ? ArrowDownIcon : MinusIcon;

          return (
            <div
              key={item.metric}
              style={{
                padding: '12px',
                backgroundColor: 'var(--p-color-bg-surface-secondary)',
                borderRadius: '8px'
              }}
            >
              <InlineStack align="space-between" blockAlign="start">
                {/* Metric Label & Values */}
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{item.label}</Text>
                  <InlineStack gap="300" blockAlign="baseline">
                    <Text as="p" variant="headingLg" fontWeight="bold">
                      {formatValue(item.current, item.format)}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      vs {formatValue(item.previous, item.format)}
                    </Text>
                  </InlineStack>
                </BlockStack>

                {/* Change Indicator */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: change.tone === 'success'
                    ? 'var(--p-color-bg-fill-success-secondary)'
                    : change.tone === 'critical'
                    ? 'var(--p-color-bg-fill-critical-secondary)'
                    : 'var(--p-color-bg-surface-secondary)'
                }}>
                  <Icon source={ChangeIcon} tone={change.tone} />
                  <Text as="span" variant="bodySm" tone={change.tone} fontWeight="semibold">
                    {change.value > 0 ? '+' : ''}{change.value.toFixed(1)}%
                  </Text>
                </div>
              </InlineStack>

              {/* Visual Bar Comparison */}
              <div style={{ marginTop: '8px' }}>
                <ComparisonBars
                  current={item.current}
                  previous={item.previous}
                  tone={change.tone}
                />
              </div>
            </div>
          );
        })}
      </BlockStack>
    </BaseWidget>
  );
}

interface ComparisonBarsProps {
  current: number;
  previous: number;
  tone: 'success' | 'critical' | 'subdued';
}

function ComparisonBars({ current, previous, tone }: ComparisonBarsProps) {
  const max = Math.max(current, previous);
  const currentWidth = max > 0 ? (current / max) * 100 : 0;
  const previousWidth = max > 0 ? (previous / max) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {/* Current Period */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Text as="span" variant="bodySm" tone="subdued" alignment="end">
          Current
        </Text>
        <div style={{
          flex: 1,
          height: '8px',
          backgroundColor: 'var(--p-color-bg-surface-tertiary)',
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${currentWidth}%`,
            height: '100%',
            backgroundColor: tone === 'success'
              ? 'var(--p-color-bg-fill-success)'
              : tone === 'critical'
              ? 'var(--p-color-bg-fill-critical)'
              : 'var(--p-color-bg-fill-secondary)',
            borderRadius: '4px',
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>

      {/* Previous Period */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Text as="span" variant="bodySm" tone="subdued" alignment="end">
          Previous
        </Text>
        <div style={{
          flex: 1,
          height: '8px',
          backgroundColor: 'var(--p-color-bg-surface-tertiary)',
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${previousWidth}%`,
            height: '100%',
            backgroundColor: 'var(--p-color-bg-fill-secondary)',
            borderRadius: '4px',
            opacity: 0.5,
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>
    </div>
  );
}

export default ComparisonWidget;
