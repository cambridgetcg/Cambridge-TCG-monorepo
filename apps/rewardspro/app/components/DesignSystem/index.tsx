/**
 * RewardsPro Design System Components
 * Reusable components following our design system guidelines
 */

import React, { useState, useCallback, useEffect, ReactNode } from 'react';
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Box,
  Grid,
  SkeletonBodyText,
  SkeletonDisplayText,
  Spinner,
  EmptyState,
  Icon,
  Divider,
  ProgressBar,
  TextField,
  Select,
  DataTable,
  Thumbnail,
  Avatar,
  Banner,
  Modal,
  FormLayout,
  Tabs,
  Tooltip,
} from '@shopify/polaris';
import {
  PersonIcon,
  CashDollarIcon,
  StarIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  SearchIcon,
  FilterIcon,
  ExportIcon,
  ImportIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  RewardIcon,
} from '@shopify/polaris-icons';
// IconSource is replaced with Icon component in newer Polaris

// ============================================
// METRIC CARD COMPONENT
// ============================================

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon?: any;
  tone?: 'default' | 'success' | 'warning' | 'critical';
  loading?: boolean;
  onClick?: () => void;
}

export function MetricCard({
  title,
  value,
  change,
  icon = CashDollarIcon,
  tone = 'default',
  loading = false,
  onClick,
}: MetricCardProps) {
  const toneColors = {
    default: 'var(--p-color-bg-surface-brand)',
    success: 'var(--p-color-bg-surface-success)',
    warning: 'var(--p-color-bg-surface-warning)',
    critical: 'var(--p-color-bg-surface-critical)',
  };

  if (loading) {
    return (
      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            <SkeletonDisplayText size="small" />
            <SkeletonBodyText lines={2} />
          </BlockStack>
        </Box>
      </Card>
    );
  }

  return (
    <Card>
      <Box padding="400">
        <div
          onClick={onClick}
          style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
          <BlockStack gap="200">
            <InlineStack align="center" blockAlign="center" gap="200">
              <div 
                className="rp-metric-icon"
                style={{ 
                  background: toneColors[tone],
                  borderRadius: '8px',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Icon source={icon} />
              </div>
            </InlineStack>
            <Text variant="headingLg" as="h3" fontWeight="bold" alignment="center">
              {value}
            </Text>
            <Text variant="bodyMd" tone="subdued" as="p" alignment="center">
              {title}
            </Text>
            {change !== undefined && (
              <Box width="100%">
                <InlineStack gap="100" align="center" blockAlign="center">
                  <Icon
                    source={change > 0 ? ArrowUpIcon : ArrowDownIcon}
                    tone={change > 0 ? 'success' : 'critical'}
                  />
                  <Text
                    variant="bodySm"
                    fontWeight="semibold"
                    tone={change > 0 ? 'success' : 'critical'}
                    as="span"
                  >
                    {change > 0 ? '+' : ''}{change}%
                  </Text>
                </InlineStack>
              </Box>
            )}
          </BlockStack>
        </div>
      </Box>
    </Card>
  );
}

// ============================================
// ENHANCED DATA TABLE COMPONENT
// ============================================

interface EnhancedDataTableProps {
  columns: Array<{ 
    header: string; 
    type: 'text' | 'numeric' | 'badge' | 'actions';
    width?: string;
  }>;
  rows: any[][];
  loading?: boolean;
  selectable?: boolean;
  onSelectionChange?: (selected: string[]) => void;
  emptyState?: {
    heading: string;
    content: string;
    action?: {
      content: string;
      onAction: () => void;
    };
  };
}

export function EnhancedDataTable({
  columns,
  rows,
  loading = false,
  selectable = false,
  onSelectionChange,
  emptyState,
}: EnhancedDataTableProps) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const handleSelectionChange = useCallback((selected: string[]) => {
    setSelectedItems(selected);
    onSelectionChange?.(selected);
  }, [onSelectionChange]);

  if (loading) {
    return (
      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            <SkeletonDisplayText size="small" />
            <SkeletonBodyText lines={5} />
          </BlockStack>
        </Box>
      </Card>
    );
  }

  if (rows.length === 0 && emptyState) {
    return (
      <Card>
        <EmptyState
          heading={emptyState.heading}
          action={emptyState.action}
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <p>{emptyState.content}</p>
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card>
      <div className="rp-data-table">
        <DataTable
          columnContentTypes={columns.map(col => col.type === 'badge' || col.type === 'actions' ? 'text' : col.type as any)}
          headings={columns.map(col => col.header)}
          rows={rows}
        />
      </div>
    </Card>
  );
}

// ============================================
// CUSTOMER CARD COMPONENT
// ============================================

interface CustomerCardProps {
  customer: {
    id: string;
    email: string;
    name?: string;
    storeCredit: number;
    tier?: {
      name: string;
      cashbackPercent: number;
    };
    totalSpent?: number;
    orderCount?: number;
  };
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
  formatCurrency: (amount: number) => string;
}

export function CustomerCard({
  customer,
  onView,
  onEdit,
  formatCurrency,
}: CustomerCardProps) {
  const initials = customer.email.substring(0, 2).toUpperCase();

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="400">
          <InlineStack gap="300" align="space-between">
            <InlineStack gap="300">
              <Avatar customer size="md" initials={initials} />
              <BlockStack gap="050">
                <Text as="span" variant="bodyMd" fontWeight="semibold">
                  {customer.name || customer.email}
                </Text>
                <Text as="span" variant="bodySm" tone="subdued">
                  {customer.email}
                </Text>
              </BlockStack>
            </InlineStack>
            {customer.tier && (
              <Badge tone="success">
                {customer.tier.name}
              </Badge>
            )}
          </InlineStack>

          <Divider />

          <Grid columns={{ xs: 1, sm: 3 }}>
            <Grid.Cell>
              <BlockStack gap="100" align="center">
                <Text as="span" variant="headingMd" fontWeight="bold">
                  {formatCurrency(customer.storeCredit)}
                </Text>
                <Text as="span" variant="bodySm" tone="subdued">
                  Store Credit
                </Text>
              </BlockStack>
            </Grid.Cell>
            {customer.totalSpent !== undefined && (
              <Grid.Cell>
                <BlockStack gap="100" align="center">
                  <Text as="span" variant="headingMd" fontWeight="bold">
                    {formatCurrency(customer.totalSpent)}
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Total Spent
                  </Text>
                </BlockStack>
              </Grid.Cell>
            )}
            {customer.orderCount !== undefined && (
              <Grid.Cell>
                <BlockStack gap="100" align="center">
                  <Text as="span" variant="headingMd" fontWeight="bold">
                    {customer.orderCount}
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Orders
                  </Text>
                </BlockStack>
              </Grid.Cell>
            )}
          </Grid>

          <InlineStack gap="200" align="end">
            {onView && (
              <div style={{ flex: 1 }}>
                <Button fullWidth onClick={() => onView(customer.id)}>
                  View Details
                </Button>
              </div>
            )}
            {onEdit && (
              <div style={{ flex: 1 }}>
                <Button fullWidth variant="plain" onClick={() => onEdit(customer.id)}>
                  Edit
                </Button>
              </div>
            )}
          </InlineStack>
        </BlockStack>
      </Box>
    </Card>
  );
}

// ============================================
// SEARCH & FILTER BAR COMPONENT
// ============================================

interface SearchFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters?: Array<{
    label: string;
    value: string;
    options: Array<{ label: string; value: string }>;
    onChange: (value: string) => void;
  }>;
  actions?: Array<{
    content: string;
    icon?: any;
    onAction: () => void;
    loading?: boolean;
  }>;
}

export function SearchFilterBar({
  searchValue,
  onSearchChange,
  filters = [],
  actions = [],
}: SearchFilterBarProps) {
  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="400">
          <InlineStack gap="300" align="space-between" blockAlign="center">
            <div style={{ flex: 1, maxWidth: '400px' }}>
              <TextField
                label=""
                value={searchValue}
                onChange={onSearchChange}
                placeholder="Search..."
                prefix={<Icon source={SearchIcon} />}
                clearButton
                onClearButtonClick={() => onSearchChange('')}
                autoComplete="off"
              />
            </div>
            
            {actions.length > 0 && (
              <InlineStack gap="200">
                {actions.map((action, index) => (
                  <Button
                    key={index}
                    onClick={action.onAction}
                    icon={action.icon}
                    loading={action.loading}
                  >
                    {action.content}
                  </Button>
                ))}
              </InlineStack>
            )}
          </InlineStack>

          {filters.length > 0 && (
            <InlineStack gap="300" wrap>
              {filters.map((filter, index) => (
                <div key={index} style={{ minWidth: '200px' }}>
                  <Select
                    label={filter.label}
                    options={filter.options}
                    value={filter.value}
                    onChange={filter.onChange}
                  />
                </div>
              ))}
            </InlineStack>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}

// ============================================
// TIER PROGRESS CARD COMPONENT
// ============================================

interface TierProgressCardProps {
  currentTier: string;
  nextTier?: {
    name: string;
    minSpend: number;
  };
  currentSpend: number;
  formatCurrency: (amount: number) => string;
}

export function TierProgressCard({
  currentTier,
  nextTier,
  currentSpend,
  formatCurrency,
}: TierProgressCardProps) {
  const progress = nextTier 
    ? Math.min((currentSpend / nextTier.minSpend) * 100, 100)
    : 100;

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="400">
          <InlineStack align="space-between">
            <BlockStack gap="100">
              <Text variant="headingMd" as="h3">
                Tier Progress
              </Text>
              <InlineStack gap="200" align="center">
                <Badge tone="success">
                  {currentTier}
                </Badge>
                {nextTier && (
                  <>
                    <Text as="span" variant="bodySm" tone="subdued">→</Text>
                    <Text as="span" variant="bodySm" fontWeight="semibold">
                      {nextTier.name}
                    </Text>
                  </>
                )}
              </InlineStack>
            </BlockStack>
          </InlineStack>

          {nextTier && (
            <>
              <ProgressBar 
                progress={progress} 
                size="small"
                tone="success"
              />
              <InlineStack align="space-between">
                <Text as="span" variant="bodySm" tone="subdued">
                  {formatCurrency(currentSpend)} spent
                </Text>
                <Text as="span" variant="bodySm" tone="subdued">
                  {formatCurrency(nextTier.minSpend - currentSpend)} to next tier
                </Text>
              </InlineStack>
            </>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}

// ============================================
// LOADING SKELETON COMPONENT
// ============================================

interface LoadingSkeletonProps {
  type?: 'page' | 'card' | 'table' | 'list';
  lines?: number;
}

export function LoadingSkeleton({ 
  type = 'card', 
  lines = 3 
}: LoadingSkeletonProps) {
  if (type === 'page') {
    return (
      <Page>
        <Layout>
          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <SkeletonDisplayText size="medium" />
                  <SkeletonBodyText lines={lines} />
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  if (type === 'table') {
    return (
      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            <SkeletonDisplayText size="small" />
            {Array.from({ length: lines }).map((_, i) => (
              <div key={i} style={{ paddingBottom: '8px' }}>
                <SkeletonBodyText lines={1} />
              </div>
            ))}
          </BlockStack>
        </Box>
      </Card>
    );
  }

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="300">
          <SkeletonDisplayText size="small" />
          <SkeletonBodyText lines={lines} />
        </BlockStack>
      </Box>
    </Card>
  );
}

// ============================================
// STATS OVERVIEW COMPONENT
// ============================================

interface StatsOverviewProps {
  stats: Array<{
    label: string;
    value: string | number;
    change?: number;
    icon?: any;
  }>;
  loading?: boolean;
}

export function StatsOverview({ stats, loading = false }: StatsOverviewProps) {
  if (loading) {
    return (
      <InlineStack gap="400" wrap={false}>
        {Array.from({ length: Math.min(4, stats?.length || 4) }).map((_, i) => (
          <div key={i} style={{ flex: 1, minWidth: '200px' }}>
            <LoadingSkeleton type="card" lines={2} />
          </div>
        ))}
      </InlineStack>
    );
  }

  return (
    <InlineStack gap="400" wrap={false}>
      {stats.map((stat, index) => (
        <div key={index} style={{ flex: 1, minWidth: '200px' }}>
          <MetricCard
            title={stat.label}
            value={stat.value}
            change={stat.change}
            icon={stat.icon}
          />
        </div>
      ))}
    </InlineStack>
  );
}

// ============================================
// ACTION BANNER COMPONENT
// ============================================

interface ActionBannerProps {
  title: string;
  content: string;
  tone?: 'info' | 'success' | 'warning' | 'critical';
  action?: {
    content: string;
    onAction: () => void;
  };
  onDismiss?: () => void;
}

export function ActionBanner({
  title,
  content,
  tone = 'info',
  action,
  onDismiss,
}: ActionBannerProps) {
  const iconMap = {
    info: InfoIcon,
    success: CheckCircleIcon,
    warning: AlertTriangleIcon,
    critical: AlertTriangleIcon,
  };

  return (
    <Banner
      title={title}
      tone={tone}
      icon={iconMap[tone]}
      action={action}
      onDismiss={onDismiss}
    >
      <p>{content}</p>
    </Banner>
  );
}

// ============================================
// RE-EXPORT MODULE COMPONENTS
// ============================================

// Module Stats Card - unified stats display for rewards modules
export { ModuleStatsCard, ModuleStatsRow } from './ModuleStatsCard';

// Feature Toggle Card - unified toggle for config pages
export { FeatureToggleCard, FeatureTogglesList } from './FeatureToggleCard';

// Export all components
export default {
  MetricCard,
  EnhancedDataTable,
  CustomerCard,
  SearchFilterBar,
  TierProgressCard,
  LoadingSkeleton,
  StatsOverview,
  ActionBanner,
};