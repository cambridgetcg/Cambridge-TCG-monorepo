/**
 * BaseWidget - Common wrapper for all dashboard widgets
 *
 * Provides:
 * - Consistent card styling
 * - Loading and error states
 * - Expand/collapse functionality
 * - Refresh capability
 * - Size presets
 */

import { Card, BlockStack, InlineStack, Text, Spinner, Icon, Button, Tooltip } from "@shopify/polaris";
import { RefreshIcon, MaximizeIcon, MinimizeIcon, QuestionCircleIcon } from "@shopify/polaris-icons";
import { useState, useCallback, type ReactNode } from "react";

export type WidgetSize = 'small' | 'medium' | 'large' | 'full';

export interface WidgetProps {
  id: string;
  title: string;
  subtitle?: string;
  size?: WidgetSize;
  children: ReactNode;
  isLoading?: boolean;
  error?: string | null;
  helpText?: string;
  onRefresh?: () => void;
  expandable?: boolean;
  actions?: ReactNode;
  footer?: ReactNode;
}

const sizeStyles: Record<WidgetSize, React.CSSProperties> = {
  small: { gridColumn: 'span 1' },
  medium: { gridColumn: 'span 2' },
  large: { gridColumn: 'span 3' },
  full: { gridColumn: '1 / -1' },
};

export function BaseWidget({
  id,
  title,
  subtitle,
  size = 'medium',
  children,
  isLoading = false,
  error = null,
  helpText,
  onRefresh,
  expandable = false,
  actions,
  footer,
}: WidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleExpand = useCallback(() => {
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  const handleRefresh = useCallback(() => {
    if (onRefresh) {
      onRefresh();
    }
  }, [onRefresh]);

  // Render content based on state
  const renderContent = () => {
    if (isLoading) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '120px'
        }}>
          <Spinner size="small" />
        </div>
      );
    }

    if (error) {
      return (
        <div style={{
          padding: '16px',
          backgroundColor: 'var(--p-color-bg-critical-subdued)',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <Text as="p" tone="critical">{error}</Text>
          {onRefresh && (
            <div style={{ marginTop: '8px' }}>
              <Button onClick={handleRefresh} size="slim">Retry</Button>
            </div>
          )}
        </div>
      );
    }

    return children;
  };

  const widgetStyle: React.CSSProperties = {
    ...sizeStyles[isExpanded ? 'full' : size],
    transition: 'all 0.3s ease',
  };

  return (
    <div
      id={`widget-${id}`}
      style={widgetStyle}
      data-widget-id={id}
      data-widget-size={size}
    >
      <Card>
        <BlockStack gap="400">
          {/* Header */}
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h3" variant="headingMd">{title}</Text>
                {helpText && (
                  <Tooltip content={helpText}>
                    <Icon source={QuestionCircleIcon} tone="subdued" />
                  </Tooltip>
                )}
              </InlineStack>
              {subtitle && (
                <Text as="p" variant="bodySm" tone="subdued">{subtitle}</Text>
              )}
            </BlockStack>

            <InlineStack gap="200">
              {actions}
              {onRefresh && !isLoading && (
                <Button
                  icon={RefreshIcon}
                  onClick={handleRefresh}
                  variant="plain"
                  accessibilityLabel="Refresh widget"
                />
              )}
              {expandable && (
                <Button
                  icon={isExpanded ? MinimizeIcon : MaximizeIcon}
                  onClick={handleExpand}
                  variant="plain"
                  accessibilityLabel={isExpanded ? "Minimize" : "Maximize"}
                />
              )}
            </InlineStack>
          </InlineStack>

          {/* Content */}
          {renderContent()}

          {/* Footer */}
          {footer && !isLoading && !error && (
            <div style={{
              borderTop: '1px solid var(--p-color-border-subdued)',
              paddingTop: '12px',
              marginTop: '4px'
            }}>
              {footer}
            </div>
          )}
        </BlockStack>
      </Card>
    </div>
  );
}

export default BaseWidget;
