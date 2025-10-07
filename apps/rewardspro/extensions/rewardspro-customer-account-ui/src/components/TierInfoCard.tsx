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
}: TierInfoCardProps) {
  // Determine badge tone based on tier level
  const getBadgeTone = (level: number): 'info' | 'success' | 'warning' | 'critical' => {
    if (level >= 4) return 'critical'; // Highest tier
    if (level >= 3) return 'success';
    if (level >= 2) return 'warning';
    return 'info';
  };

  return (
    <Card>
      <BlockStack spacing="base">
        {/* Header: Tier Name + Badge */}
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="large" emphasis="bold">
            {tierName} Tier
          </Text>
          <Badge tone={getBadgeTone(tierLevel)}>
            Level {tierLevel}
          </Badge>
        </InlineStack>

        {/* Cashback Rate */}
        <BlockStack spacing="extraTight">
          <Text size="small" appearance="subdued">
            Cashback Rate
          </Text>
          <Text size="large" emphasis="bold">
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
              <Text size="small" appearance="subdued">
                Progress to {nextTier}
              </Text>
            </InlineStack>

            <Progress
              value={progressPercentage}
              label={`${Math.round(progressPercentage * 100)}%`}
            />

            <Text size="small" appearance="subdued">
              Spend {currency}{remainingToNextTier.toFixed(2)} more to unlock {nextTier} tier
            </Text>
          </BlockStack>
        )}

        {/* Current Spend */}
        {!nextTier && (
          <BlockStack spacing="extraTight">
            <Text size="small" appearance="subdued">
              Total Lifetime Spend
            </Text>
            <Text size="medium" emphasis="bold">
              {currency}{currentSpend.toFixed(2)}
            </Text>
            <Text size="small" appearance="subdued">
              🎉 You've reached the highest tier!
            </Text>
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
