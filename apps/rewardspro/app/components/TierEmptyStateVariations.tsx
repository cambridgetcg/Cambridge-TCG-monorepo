/**
 * Tier Empty State Variations
 *
 * Three distinct UI approaches for the "no tiers created" state on the Membership Tiers page.
 * Import and use the variation that best fits your needs.
 *
 * Usage:
 *   import { TierEmptyStateV1, TierEmptyStateV2, TierEmptyStateV3 } from '~/components/TierEmptyStateVariations';
 *
 *   <TierEmptyStateV1 onCreateTier={() => openTierModal()} />
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
  CheckCircleIcon,
  ArrowRightIcon,
  TargetIcon,
  GiftCardIcon,
} from '@shopify/polaris-icons';

interface TierEmptyStateProps {
  onCreateTier: () => void;
}

// ============================================================================
// VARIATION 1: Benefits-Focused with Icon Grid
// ============================================================================
// Modern card-based design highlighting the key benefits of creating tiers.
// Uses a 2x2 grid of benefit cards with icons and descriptions.

export function TierEmptyStateV1({ onCreateTier }: TierEmptyStateProps) {
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
// VARIATION 2: Step-by-Step Getting Started Guide
// ============================================================================
// A numbered walkthrough showing how easy it is to set up tiers.
// Reduces friction by making the process feel achievable.

export function TierEmptyStateV2({ onCreateTier }: TierEmptyStateProps) {
  const steps = [
    {
      number: '1',
      title: 'Create a tier',
      description: 'Define your first tier with a name like "Bronze" or "Silver"',
    },
    {
      number: '2',
      title: 'Set the requirements',
      description: 'Choose the minimum spend needed to qualify for this tier',
    },
    {
      number: '3',
      title: 'Add cashback rewards',
      description: 'Set a cashback percentage that customers earn on purchases',
    },
  ];

  return (
    <Box padding="600">
      <BlockStack gap="600">
        {/* Header Section */}
        <InlineStack align="space-between" blockAlign="center" wrap={false}>
          <BlockStack gap="200">
            <Text variant="headingLg" as="h2">
              Get Started with Loyalty Tiers
            </Text>
            <Text variant="bodyMd" tone="subdued">
              Set up your first tier in under a minute
            </Text>
          </BlockStack>
          <Button variant="primary" onClick={onCreateTier}>
            Create First Tier
          </Button>
        </InlineStack>

        <Divider />

        {/* Steps */}
        <BlockStack gap="500">
          {steps.map((step, index) => (
            <InlineStack key={index} gap="400" align="start" blockAlign="start" wrap={false}>
              {/* Step Number */}
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'var(--p-color-bg-fill-brand)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Text variant="headingMd" as="span" fontWeight="bold">
                  <span style={{ color: 'white' }}>{step.number}</span>
                </Text>
              </div>

              {/* Step Content */}
              <BlockStack gap="100">
                <Text variant="headingMd" as="h3">
                  {step.title}
                </Text>
                <Text variant="bodyMd" tone="subdued">
                  {step.description}
                </Text>
              </BlockStack>

              {/* Arrow (except last) */}
              {index < steps.length - 1 && (
                <Box paddingBlockStart="200">
                  <div
                    style={{
                      position: 'absolute',
                      left: '19px',
                      marginTop: '48px',
                      width: '2px',
                      height: '32px',
                      background: 'var(--p-color-border-secondary)',
                    }}
                  />
                </Box>
              )}
            </InlineStack>
          ))}
        </BlockStack>

        {/* Bottom Banner */}
        <Box
          background="bg-surface-secondary"
          padding="400"
          borderRadius="200"
        >
          <InlineStack gap="300" align="start" blockAlign="center">
            <Icon source={GiftCardIcon} tone="info" />
            <BlockStack gap="100">
              <Text variant="bodySm" fontWeight="semibold" as="span">
                Pro tip: Start with 3 tiers
              </Text>
              <Text variant="bodySm" tone="subdued" as="span">
                Most successful loyalty programs use Bronze, Silver, and Gold tiers with increasing rewards.
              </Text>
            </BlockStack>
          </InlineStack>
        </Box>
      </BlockStack>
    </Box>
  );
}

// ============================================================================
// VARIATION 3: Visual Preview with Example Tiers
// ============================================================================
// Shows what completed tiers look like with example Bronze, Silver, Gold cards.
// Makes the end result tangible and reduces uncertainty.

export function TierEmptyStateV3({ onCreateTier }: TierEmptyStateProps) {
  const exampleTiers = [
    {
      name: 'Bronze',
      minSpend: '$0',
      cashback: '2%',
      color: '#CD7F32',
      bgColor: 'rgba(205, 127, 50, 0.1)',
    },
    {
      name: 'Silver',
      minSpend: '$500',
      cashback: '5%',
      color: '#A8A9AD',
      bgColor: 'rgba(168, 169, 173, 0.15)',
    },
    {
      name: 'Gold',
      minSpend: '$1,500',
      cashback: '10%',
      color: '#D4AF37',
      bgColor: 'rgba(212, 175, 55, 0.15)',
    },
  ];

  return (
    <Box padding="600">
      <BlockStack gap="600" align="center">
        {/* Header */}
        <BlockStack gap="200" align="center">
          <Text variant="headingXl" as="h2" alignment="center">
            Create Tiers Like These
          </Text>
          <Text variant="bodyLg" tone="subdued" alignment="center">
            Design a tier structure that fits your business
          </Text>
        </BlockStack>

        {/* Example Tier Cards */}
        <Box paddingBlock="400" width="100%">
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            {exampleTiers.map((tier, index) => (
              <Box
                key={index}
                padding="0"
                borderRadius="300"
                shadow="200"
                background="bg-surface"
              >
                {/* Colored Header Bar */}
                <div
                  style={{
                    height: '8px',
                    background: tier.color,
                    borderTopLeftRadius: '12px',
                    borderTopRightRadius: '12px',
                  }}
                />

                <Box padding="400">
                  <BlockStack gap="400" align="center">
                    {/* Tier Icon */}
                    <div
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: tier.bgColor,
                        border: `2px solid ${tier.color}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon source={StarIcon} tone="base" />
                    </div>

                    {/* Tier Name */}
                    <Text variant="headingLg" as="h3" alignment="center">
                      {tier.name}
                    </Text>

                    {/* Stats */}
                    <BlockStack gap="200" align="center">
                      <InlineStack gap="100" blockAlign="center">
                        <Text variant="bodySm" tone="subdued" as="span">
                          Min spend:
                        </Text>
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                          {tier.minSpend}
                        </Text>
                      </InlineStack>

                      <div
                        style={{
                          background: tier.bgColor,
                          padding: '4px 12px',
                          borderRadius: '16px',
                          border: `1px solid ${tier.color}`,
                        }}
                      >
                        <Text variant="headingSm" as="span">
                          <span style={{ color: tier.color }}>{tier.cashback} Cashback</span>
                        </Text>
                      </div>
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Box>
            ))}
          </InlineGrid>
        </Box>

        {/* Dimmed overlay text */}
        <Text variant="bodySm" tone="subdued" alignment="center">
          These are examples. You can customize tier names, spending thresholds, and cashback rates.
        </Text>

        {/* CTA Section */}
        <Box paddingBlockStart="200">
          <BlockStack gap="300" align="center">
            <Button variant="primary" size="large" onClick={onCreateTier}>
              Create Your First Tier
            </Button>
            <Text variant="bodySm" tone="subdued" alignment="center">
              Takes less than 30 seconds
            </Text>
          </BlockStack>
        </Box>
      </BlockStack>
    </Box>
  );
}

// ============================================================================
// COMBINED COMPONENT - For easy testing of all variations
// ============================================================================
// Use this to display all 3 variations at once for comparison

interface AllVariationsProps {
  onCreateTier: () => void;
}

export function TierEmptyStateAllVariations({ onCreateTier }: AllVariationsProps) {
  return (
    <BlockStack gap="800">
      {/* Variation 1 */}
      <Card>
        <Box padding="200">
          <Text variant="headingSm" tone="subdued" as="h4">
            Variation 1: Benefits Grid
          </Text>
        </Box>
        <Divider />
        <TierEmptyStateV1 onCreateTier={onCreateTier} />
      </Card>

      {/* Variation 2 */}
      <Card>
        <Box padding="200">
          <Text variant="headingSm" tone="subdued" as="h4">
            Variation 2: Step-by-Step Guide
          </Text>
        </Box>
        <Divider />
        <TierEmptyStateV2 onCreateTier={onCreateTier} />
      </Card>

      {/* Variation 3 */}
      <Card>
        <Box padding="200">
          <Text variant="headingSm" tone="subdued" as="h4">
            Variation 3: Visual Preview
          </Text>
        </Box>
        <Divider />
        <TierEmptyStateV3 onCreateTier={onCreateTier} />
      </Card>
    </BlockStack>
  );
}
