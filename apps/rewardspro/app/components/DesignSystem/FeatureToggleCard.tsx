/**
 * FeatureToggleCard - Unified feature toggle for config pages
 * Replaces inline-styled custom toggle switches with accessible, consistent UI
 */

import React from 'react';
import {
  Box,
  InlineStack,
  BlockStack,
  Text,
  Icon,
  Badge,
} from '@shopify/polaris';
import type { IconSource } from '@shopify/polaris';

// ============================================
// TYPES
// ============================================

interface FeatureToggleCardProps {
  /** Polaris icon to display */
  icon: IconSource;
  /** Feature title */
  title: string;
  /** Feature description */
  description: string;
  /** Whether the feature is enabled */
  enabled: boolean;
  /** Callback when toggle changes */
  onChange: (enabled: boolean) => void;
}

// ============================================
// FEATURE TOGGLE CARD COMPONENT
// ============================================

export function FeatureToggleCard({
  icon,
  title,
  description,
  enabled,
  onChange,
}: FeatureToggleCardProps) {
  const handleToggle = () => {
    onChange(!enabled);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onChange(!enabled);
    }
  };

  return (
    <Box
      padding="300"
      background="bg-surface-secondary"
      borderRadius="200"
      borderWidth="025"
      borderColor="border"
    >
      <InlineStack align="space-between" blockAlign="center">
        <InlineStack gap="300" blockAlign="center">
          <Box
            padding="200"
            borderRadius="200"
            background={enabled ? 'bg-surface-success' : 'bg-surface-secondary'}
          >
            <Icon source={icon} tone={enabled ? 'success' : 'subdued'} />
          </Box>
          <BlockStack gap="050">
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              {title}
            </Text>
            <Text variant="bodySm" tone="subdued" as="span">
              {description}
            </Text>
          </BlockStack>
        </InlineStack>
        <InlineStack gap="300" blockAlign="center">
          <Badge tone={enabled ? 'success' : undefined}>
            {enabled ? 'Enabled' : 'Disabled'}
          </Badge>
          <div
            role="switch"
            aria-checked={enabled}
            aria-label={`Toggle ${title}`}
            tabIndex={0}
            onClick={handleToggle}
            onKeyDown={handleKeyDown}
            style={{
              width: '52px',
              height: '28px',
              borderRadius: '14px',
              backgroundColor: enabled ? 'var(--p-color-bg-fill-success)' : 'var(--p-color-bg-fill-disabled)',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: 'white',
                position: 'absolute',
                top: '2px',
                left: enabled ? '26px' : '2px',
                transition: 'left 0.15s ease',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
            />
          </div>
        </InlineStack>
      </InlineStack>
    </Box>
  );
}

// ============================================
// FEATURE TOGGLES LIST COMPONENT
// ============================================

interface FeatureToggle {
  id: string;
  icon: IconSource;
  title: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

interface FeatureTogglesListProps {
  toggles: FeatureToggle[];
}

export function FeatureTogglesList({ toggles }: FeatureTogglesListProps) {
  return (
    <BlockStack gap="200">
      {toggles.map((toggle) => (
        <FeatureToggleCard
          key={toggle.id}
          icon={toggle.icon}
          title={toggle.title}
          description={toggle.description}
          enabled={toggle.enabled}
          onChange={toggle.onChange}
        />
      ))}
    </BlockStack>
  );
}

export default FeatureToggleCard;
