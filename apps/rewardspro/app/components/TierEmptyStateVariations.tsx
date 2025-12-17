/**
 * Tier Empty State Variations - Benefits Grid Variants
 *
 * Three variations of the benefits-focused empty state for the Membership Tiers page.
 * All variations highlight the key benefits but with different visual treatments.
 *
 * Usage:
 *   import { TierEmptyStateV1A, TierEmptyStateV1B, TierEmptyStateV1C } from '~/components/TierEmptyStateVariations';
 */

import {
  Box,
  BlockStack,
  InlineStack,
  InlineGrid,
  Text,
  Button,
  Icon,
  Card,
  Divider,
} from '@shopify/polaris';
import {
  StarIcon,
  CashDollarIcon,
  ChartVerticalIcon,
  PersonIcon,
  TargetIcon,
  HeartIcon,
  ChartHistogramGrowthIcon,
} from '@shopify/polaris-icons';

interface TierEmptyStateProps {
  onCreateTier: () => void;
}

// ============================================================================
// VARIATION 1A: Centered Hero with Icon Grid Cards
// ============================================================================
// Clean, centered design with a hero icon, 2x2 benefit cards with shadows

export function TierEmptyStateV1A({ onCreateTier }: TierEmptyStateProps) {
  const benefits = [
    {
      icon: CashDollarIcon,
      title: 'Automatic Cashback',
      description: 'Reward customers with cashback on every purchase based on their tier',
      color: 'var(--p-color-bg-fill-success-secondary)',
      iconColor: 'success' as const,
    },
    {
      icon: ChartVerticalIcon,
      title: 'Increase Retention',
      description: 'Customers spend more to reach and maintain higher tier levels',
      color: 'var(--p-color-bg-fill-info-secondary)',
      iconColor: 'info' as const,
    },
    {
      icon: PersonIcon,
      title: 'Segment Customers',
      description: 'Automatically group customers by spending for targeted marketing',
      color: 'var(--p-color-bg-fill-warning-secondary)',
      iconColor: 'caution' as const,
    },
    {
      icon: TargetIcon,
      title: 'Drive Growth',
      description: 'Motivate customers to spend more to unlock better rewards',
      color: 'var(--p-color-bg-fill-magic-secondary)',
      iconColor: 'magic' as const,
    },
  ];

  return (
    <Box padding="800" background="bg-surface-secondary" borderRadius="300">
      <BlockStack gap="600" align="center">
        {/* Hero Icon */}
        <Box
          background="bg-fill-success-secondary"
          padding="500"
          borderRadius="full"
        >
          <div style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon source={StarIcon} tone="success" />
          </div>
        </Box>

        {/* Heading */}
        <BlockStack gap="200" align="center">
          <Text variant="headingXl" as="h2" alignment="center">
            Build Your Loyalty Program
          </Text>
          <Text variant="bodyLg" tone="subdued" alignment="center">
            Create tiers to reward your best customers and encourage repeat purchases
          </Text>
        </BlockStack>

        {/* Benefits Grid */}
        <Box paddingBlockStart="200" paddingBlockEnd="400" width="100%">
          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
            {benefits.map((benefit, index) => (
              <Box
                key={index}
                background="bg-surface"
                padding="400"
                borderRadius="200"
                shadow="100"
              >
                <InlineStack gap="300" align="start" blockAlign="start" wrap={false}>
                  <Box
                    background={benefit.color as any}
                    padding="200"
                    borderRadius="200"
                  >
                    <Icon source={benefit.icon} tone={benefit.iconColor} />
                  </Box>
                  <BlockStack gap="100">
                    <Text variant="headingSm" as="h3">
                      {benefit.title}
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      {benefit.description}
                    </Text>
                  </BlockStack>
                </InlineStack>
              </Box>
            ))}
          </InlineGrid>
        </Box>

        {/* CTA */}
        <Button variant="primary" size="large" onClick={onCreateTier}>
          Create Your First Tier
        </Button>
      </BlockStack>
    </Box>
  );
}

// ============================================================================
// VARIATION 1B: Horizontal Layout with Left Content, Right Visual
// ============================================================================
// Split layout with benefits list on left and decorative element on right

export function TierEmptyStateV1B({ onCreateTier }: TierEmptyStateProps) {
  const benefits = [
    {
      icon: CashDollarIcon,
      title: 'Automatic Cashback',
      description: 'Customers earn rewards on every purchase',
      iconColor: 'success' as const,
    },
    {
      icon: ChartHistogramGrowthIcon,
      title: 'Boost Retention',
      description: 'Increase customer lifetime value by 25%+',
      iconColor: 'info' as const,
    },
    {
      icon: PersonIcon,
      title: 'Smart Segmentation',
      description: 'Auto-group customers by spending behavior',
      iconColor: 'caution' as const,
    },
    {
      icon: TargetIcon,
      title: 'Drive Revenue',
      description: 'Motivate higher spending with tier rewards',
      iconColor: 'magic' as const,
    },
  ];

  return (
    <Box padding="600">
      <InlineStack gap="800" align="space-between" blockAlign="center" wrap={false}>
        {/* Left Content */}
        <Box minWidth="60%">
          <BlockStack gap="500">
            <BlockStack gap="200">
              <Text variant="headingXl" as="h2">
                Reward Your Best Customers
              </Text>
              <Text variant="bodyLg" tone="subdued">
                Create a tiered loyalty program that keeps customers coming back
              </Text>
            </BlockStack>

            {/* Benefits List */}
            <BlockStack gap="300">
              {benefits.map((benefit, index) => (
                <InlineStack key={index} gap="300" blockAlign="center" wrap={false}>
                  <Box
                    background="bg-surface-secondary"
                    padding="200"
                    borderRadius="full"
                  >
                    <Icon source={benefit.icon} tone={benefit.iconColor} />
                  </Box>
                  <BlockStack gap="050">
                    <Text variant="bodyMd" fontWeight="semibold" as="span">
                      {benefit.title}
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="span">
                      {benefit.description}
                    </Text>
                  </BlockStack>
                </InlineStack>
              ))}
            </BlockStack>

            {/* CTA */}
            <Box paddingBlockStart="200">
              <Button variant="primary" size="large" onClick={onCreateTier}>
                Create Your First Tier
              </Button>
            </Box>
          </BlockStack>
        </Box>

        {/* Right Visual - Stacked Tier Preview */}
        <Box minWidth="35%">
          <BlockStack gap="200">
            {['Gold', 'Silver', 'Bronze'].map((tier, index) => {
              const colors = {
                Gold: { bg: 'rgba(212, 175, 55, 0.15)', border: '#D4AF37', text: '#B8860B' },
                Silver: { bg: 'rgba(168, 169, 173, 0.15)', border: '#A8A9AD', text: '#6B6B6B' },
                Bronze: { bg: 'rgba(205, 127, 50, 0.15)', border: '#CD7F32', text: '#8B4513' },
              }[tier]!;
              const cashback = { Gold: '10%', Silver: '5%', Bronze: '2%' }[tier];

              return (
                <div
                  key={tier}
                  style={{
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    opacity: 0.7 + (0.1 * (2 - index)),
                  }}
                >
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={StarIcon} tone="base" />
                    <Text variant="bodyMd" fontWeight="semibold" as="span">
                      {tier}
                    </Text>
                  </InlineStack>
                  <Text variant="bodySm" as="span">
                    <span style={{ color: colors.text }}>{cashback} cashback</span>
                  </Text>
                </div>
              );
            })}
            <Text variant="bodySm" tone="subdued" alignment="center">
              Example tiers
            </Text>
          </BlockStack>
        </Box>
      </InlineStack>
    </Box>
  );
}

// ============================================================================
// VARIATION 1C: Minimal with Large Icons in a Row
// ============================================================================
// Clean, minimal design with large icons in a horizontal row and subtle descriptions

export function TierEmptyStateV1C({ onCreateTier }: TierEmptyStateProps) {
  const benefits = [
    {
      icon: CashDollarIcon,
      title: 'Cashback',
      description: 'Auto rewards',
      gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    },
    {
      icon: HeartIcon,
      title: 'Loyalty',
      description: 'Keep customers',
      gradient: 'linear-gradient(135deg, #F472B6 0%, #EC4899 100%)',
    },
    {
      icon: ChartVerticalIcon,
      title: 'Growth',
      description: 'More revenue',
      gradient: 'linear-gradient(135deg, #60A5FA 0%, #3B82F6 100%)',
    },
    {
      icon: StarIcon,
      title: 'Tiers',
      description: 'VIP levels',
      gradient: 'linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%)',
    },
  ];

  return (
    <Box padding="800">
      <BlockStack gap="800" align="center">
        {/* Heading */}
        <BlockStack gap="300" align="center">
          <Text variant="heading2xl" as="h2" alignment="center">
            Launch Your Loyalty Program
          </Text>
          <Text variant="bodyLg" tone="subdued" alignment="center">
            Turn one-time buyers into lifelong customers with tiered rewards
          </Text>
        </BlockStack>

        {/* Large Icon Row */}
        <InlineStack gap="600" align="center" blockAlign="start">
          {benefits.map((benefit, index) => (
            <BlockStack key={index} gap="300" align="center">
              <div
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '16px',
                  background: benefit.gradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                }}
              >
                <div style={{ color: 'white', display: 'flex' }}>
                  <Icon source={benefit.icon} tone="inherit" />
                </div>
              </div>
              <BlockStack gap="100" align="center">
                <Text variant="headingSm" as="h3" alignment="center">
                  {benefit.title}
                </Text>
                <Text variant="bodySm" tone="subdued" alignment="center">
                  {benefit.description}
                </Text>
              </BlockStack>
            </BlockStack>
          ))}
        </InlineStack>

        {/* CTA Section */}
        <BlockStack gap="200" align="center">
          <Button variant="primary" size="large" onClick={onCreateTier}>
            Create Your First Tier
          </Button>
          <Text variant="bodySm" tone="subdued">
            Set up in under 60 seconds
          </Text>
        </BlockStack>
      </BlockStack>
    </Box>
  );
}

// ============================================================================
// COMBINED COMPONENT - For displaying all 3 variations
// ============================================================================

interface AllVariationsProps {
  onCreateTier: () => void;
}

export function TierEmptyStateAllVariations({ onCreateTier }: AllVariationsProps) {
  return (
    <BlockStack gap="800">
      {/* Variation 1A */}
      <Card>
        <Box padding="300" background="bg-surface-secondary">
          <Text variant="headingSm" tone="subdued" as="h4">
            Variation 1A: Centered Hero with Card Grid
          </Text>
        </Box>
        <TierEmptyStateV1A onCreateTier={onCreateTier} />
      </Card>

      {/* Variation 1B */}
      <Card>
        <Box padding="300" background="bg-surface-secondary">
          <Text variant="headingSm" tone="subdued" as="h4">
            Variation 1B: Horizontal Split Layout
          </Text>
        </Box>
        <TierEmptyStateV1B onCreateTier={onCreateTier} />
      </Card>

      {/* Variation 1C */}
      <Card>
        <Box padding="300" background="bg-surface-secondary">
          <Text variant="headingSm" tone="subdued" as="h4">
            Variation 1C: Minimal with Large Icon Row
          </Text>
        </Box>
        <TierEmptyStateV1C onCreateTier={onCreateTier} />
      </Card>
    </BlockStack>
  );
}
