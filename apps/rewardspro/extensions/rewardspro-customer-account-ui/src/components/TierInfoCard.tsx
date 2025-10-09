/**
 * TierInfoCard - Displays current tier, cashback rate, and progress to next tier
 */

import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Progress,
  Badge,
  Icon,
  useApi,
} from '@shopify/ui-extensions-react/customer-account';

interface TierInfoCardProps {
  tierName: string;
  tierLevel: number;
  cashbackRate: number;
  currentSpend: number;
  nextTier: string | null;
  progressPercentage: number;
  remainingToNextTier: number;
  currency: string;
  formatCurrency: (amount: number) => string;
}

export function TierInfoCard({
  tierName,
  tierLevel,
  cashbackRate,
  currentSpend,
  nextTier,
  progressPercentage,
  remainingToNextTier,
  currency,
  formatCurrency,
}: TierInfoCardProps) {
  const { analytics } = useApi();

  // Determine badge tone based on tier level
  const getBadgeTone = (level: number): 'info' | 'success' | 'warning' | 'critical' => {
    if (level >= 4) return 'critical'; // Highest tier
    if (level >= 3) return 'success';
    if (level >= 2) return 'warning';
    return 'info';
  };

  // Track tier card view
  analytics.publish('tier_card_view', {
    tier_name: tierName,
    tier_level: tierLevel,
    cashback_rate: cashbackRate,
    has_next_tier: !!nextTier,
  });

  return (
    <Card>
      <BlockStack spacing="base" role="region" aria-label={`${tierName} tier information`}>
        {/* Header: Tier Name + Badge */}
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="large" emphasis="bold" id="tier-name">
            {tierName} Tier
          </Text>
          <Badge tone={getBadgeTone(tierLevel)}>
            Level {tierLevel}
          </Badge>
        </InlineStack>

        {/* Cashback Rate */}
        <BlockStack spacing="extraTight">
          <Text size="small" appearance="subdued" id="cashback-label">
            Cashback Rate
          </Text>
          <Text size="large" emphasis="bold" aria-labelledby="cashback-label">
            {cashbackRate}%
          </Text>
          <Text size="small" appearance="subdued">
            Earn {cashbackRate}% back on every purchase
          </Text>
        </BlockStack>

        {/* Progress to Next Tier */}
        {nextTier && (
          <BlockStack spacing="extraTight">
            <InlineStack spacing="tight" blockAlignment="center">
              <Text size="small" appearance="subdued" id="progress-label">
                Progress to {nextTier}
              </Text>
            </InlineStack>

            <Progress
              value={progressPercentage}
              label={`${Math.round(progressPercentage * 100)}%`}
              aria-label={`${Math.round(progressPercentage * 100)}% progress to ${nextTier} tier`}
            />

            <Text size="small" appearance="subdued" role="status">
              Spend {formatCurrency(remainingToNextTier)} more to unlock {nextTier} tier
            </Text>
          </BlockStack>
        )}

        {/* Current Spend */}
        {!nextTier && (
          <BlockStack spacing="extraTight">
            <Text size="small" appearance="subdued" id="spend-label">
              Total Lifetime Spend
            </Text>
            <Text size="medium" emphasis="bold" aria-labelledby="spend-label">
              {formatCurrency(currentSpend)}
            </Text>
            <Text size="small" appearance="subdued" role="status">
              🎉 You've reached the highest tier!
            </Text>
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
