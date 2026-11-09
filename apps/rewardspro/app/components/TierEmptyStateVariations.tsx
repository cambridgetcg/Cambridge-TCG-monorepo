/**
 * Tier Empty State Component
 *
 * Horizontal split layout with benefits list on left and tier preview on right.
 * Used on the Membership Tiers page when no tiers have been created yet.
 *
 * Usage:
 *   import { TierEmptyStateV1B } from '~/components/TierEmptyStateVariations';
 *   <TierEmptyStateV1B onCreateTier={() => openTierModal()} />
 */

import {
  Box,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Icon,
} from '@shopify/polaris';
import {
  StarIcon,
  CashDollarIcon,
  PersonIcon,
  TargetIcon,
  ChartHistogramGrowthIcon,
} from '@shopify/polaris-icons';

interface TierEmptyStateProps {
  onCreateTier: () => void;
}

/**
 * Horizontal Split Layout Empty State
 *
 * Left side: Heading + vertical benefits list with icons
 * Right side: Stacked Gold/Silver/Bronze tier preview cards
 */
export function TierEmptyStateV1B({ onCreateTier }: TierEmptyStateProps) {
  // What tiers do, not results nobody measured
  const benefits = [
    {
      icon: CashDollarIcon,
      title: 'Cashback as store credit',
      description: 'Each tier sets the share of an order customers get back as Shopify store credit.',
      iconColor: 'success' as const,
    },
    {
      icon: ChartHistogramGrowthIcon,
      title: 'Tiers by spend',
      description: 'Customers move into a tier once their spend reaches its minimum.',
      iconColor: 'info' as const,
    },
    {
      icon: PersonIcon,
      title: 'Shown on your store',
      description: 'The rewards widget shows customers their tier and store credit.',
      iconColor: 'caution' as const,
    },
    {
      icon: TargetIcon,
      title: 'Your rates',
      description: 'You choose each tier\'s minimum spend and cashback, and can change them later.',
      iconColor: 'magic' as const,
    },
  ];

  const exampleTiers = [
    { name: 'Gold', cashback: '10%', colors: { bg: 'rgba(212, 175, 55, 0.15)', border: '#D4AF37', text: '#B8860B' } },
    { name: 'Silver', cashback: '5%', colors: { bg: 'rgba(168, 169, 173, 0.15)', border: '#A8A9AD', text: '#6B6B6B' } },
    { name: 'Bronze', cashback: '2%', colors: { bg: 'rgba(205, 127, 50, 0.15)', border: '#CD7F32', text: '#8B4513' } },
  ];

  return (
    <Box padding="600">
      <InlineStack gap="800" align="space-between" blockAlign="center" wrap={false}>
        {/* Left Content */}
        <Box minWidth="60%">
          <BlockStack gap="500">
            {/* Heading */}
            <BlockStack gap="200">
              <Text variant="headingXl" as="h2">
                Reward Your Best Customers
              </Text>
              <Text variant="bodyLg" as="span" tone="subdued">
                Give customers cashback as store credit, at a rate set by their tier
              </Text>
            </BlockStack>

            {/* Benefits List. Each row sets align: Polaris passes it to
                nested stacks through an inherited CSS variable, so without
                it a row takes the outer row's space-between and pushes its
                text away from its icon. */}
            <BlockStack gap="300">
              {benefits.map((benefit, index) => (
                <InlineStack key={index} gap="150" align="start" blockAlign="center" wrap={false}>
                  <Box
                    background="bg-surface-secondary"
                    padding="200"
                    borderRadius="full"
                  >
                    <Icon source={benefit.icon} tone={benefit.iconColor} />
                  </Box>
                  <BlockStack gap="050">
                    <Text variant="bodyMd" as="span" fontWeight="semibold">
                      {benefit.title}
                    </Text>
                    <Text variant="bodySm" as="span" tone="subdued">
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
            {exampleTiers.map((tier, index) => (
              <div
                key={tier.name}
                style={{
                  background: tier.colors.bg,
                  border: `1px solid ${tier.colors.border}`,
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
                  <Text variant="bodyMd" as="span" fontWeight="semibold">
                    {tier.name}
                  </Text>
                </InlineStack>
                <Text variant="bodySm" as="span">
                  <span style={{ color: tier.colors.text }}>{tier.cashback} cashback</span>
                </Text>
              </div>
            ))}
            <Text variant="bodySm" as="span" tone="subdued" alignment="center">
              Example tiers
            </Text>
          </BlockStack>
        </Box>
      </InlineStack>
    </Box>
  );
}

// Default export for convenience
export default TierEmptyStateV1B;
