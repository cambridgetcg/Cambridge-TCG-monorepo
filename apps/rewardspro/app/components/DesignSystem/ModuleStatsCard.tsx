/**
 * ModuleStatsCard - Unified stats card for rewards module pages
 * Provides consistent styling across raffles, mystery boxes, challenges, etc.
 */

import React from 'react';
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Icon,
  Box,
  SkeletonDisplayText,
  SkeletonBodyText,
} from '@shopify/polaris';
import type { IconSource } from '@shopify/polaris';

// ============================================
// TYPES
// ============================================

interface ModuleStatsCardProps {
  /** Label displayed below the value */
  label: string;
  /** Primary value to display */
  value: string | number;
  /** Optional Polaris icon */
  icon?: IconSource;
  /** Optional subtext below the label */
  subtext?: string;
  /** Visual tone for the card */
  tone?: 'default' | 'success' | 'warning' | 'critical';
  /** Loading state */
  loading?: boolean;
  /** Children rendered below value (e.g., LimitHint) */
  children?: React.ReactNode;
}

interface ModuleStatsRowProps {
  /** Array of stats to display */
  stats: Array<{
    label: string;
    value: string | number;
    icon?: IconSource;
    subtext?: string;
    tone?: 'default' | 'success' | 'warning' | 'critical';
    children?: React.ReactNode;
  }>;
  /** Loading state for all cards */
  loading?: boolean;
}

// ============================================
// MODULE STATS CARD COMPONENT
// ============================================

export function ModuleStatsCard({
  label,
  value,
  icon,
  subtext,
  tone = 'default',
  loading = false,
  children,
}: ModuleStatsCardProps) {
  if (loading) {
    return (
      <Card>
        <BlockStack gap="200">
          <SkeletonDisplayText size="small" />
          <SkeletonBodyText lines={1} />
        </BlockStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="200">
        {icon && (
          <Box>
            <Icon source={icon} tone={tone === 'default' ? undefined : tone} />
          </Box>
        )}
        <BlockStack gap="100">
          <Text variant="bodySm" tone="subdued" as="p">
            {label}
          </Text>
          <Text variant="headingLg" as="p">
            {value}
          </Text>
          {subtext && (
            <Text variant="bodySm" tone="subdued" as="p">
              {subtext}
            </Text>
          )}
        </BlockStack>
        {children}
      </BlockStack>
    </Card>
  );
}

// ============================================
// MODULE STATS ROW COMPONENT
// ============================================

export function ModuleStatsRow({ stats, loading = false }: ModuleStatsRowProps) {
  return (
    <InlineStack gap="400" wrap>
      {stats.map((stat, index) => (
        <div key={index} style={{ flex: '1 1 150px', minWidth: '150px' }}>
          <ModuleStatsCard
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            subtext={stat.subtext}
            tone={stat.tone}
            loading={loading}
          >
            {stat.children}
          </ModuleStatsCard>
        </div>
      ))}
    </InlineStack>
  );
}

export default ModuleStatsCard;
