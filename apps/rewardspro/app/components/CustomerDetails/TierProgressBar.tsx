import {
  Box,
  BlockStack,
  InlineStack,
  Text,
  ProgressBar,
} from '@shopify/polaris';

interface TierProgressBarProps {
  currentTierName: string | null;
  nextTierName: string | null;
  currentSpending: number;
  nextTierThreshold: number;
  isMaxTier: boolean;
  formatAmount: (amount: string | number) => string;
}

export function TierProgressBar({
  currentTierName,
  nextTierName,
  currentSpending,
  nextTierThreshold,
  isMaxTier,
  formatAmount,
}: TierProgressBarProps) {
  const progress = isMaxTier
    ? 100
    : nextTierThreshold > 0
      ? Math.min(100, (currentSpending / nextTierThreshold) * 100)
      : 0;

  const amountToNext = nextTierThreshold - currentSpending;

  if (!currentTierName) {
    return null;
  }

  return (
    <Box
      background="bg-surface-secondary"
      padding="400"
      borderRadius="200"
    >
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="span" variant="headingSm">
            Tier Progress
          </Text>
          {isMaxTier ? (
            <Text as="span" variant="bodySm" tone="success" fontWeight="semibold">
              ✓ Highest Tier
            </Text>
          ) : (
            <Text as="span" variant="bodySm" tone="subdued">
              {formatAmount(amountToNext)} to {nextTierName}
            </Text>
          )}
        </InlineStack>

        <ProgressBar
          progress={progress}
          tone={isMaxTier ? 'success' : 'highlight'}
          size="small"
        />

        <InlineStack align="space-between">
          <InlineStack gap="100" blockAlign="center">
            <Box
              background="bg-fill-success-secondary"
              padding="100"
              borderRadius="100"
            >
              <Text as="span" variant="bodySm" fontWeight="semibold">
                {currentTierName}
              </Text>
            </Box>
          </InlineStack>

          {!isMaxTier && nextTierName && (
            <InlineStack gap="100" blockAlign="center">
              <Text as="span" variant="bodySm" tone="subdued">→</Text>
              <Box
                background="bg-surface-secondary"
                borderColor="border"
                borderWidth="025"
                padding="100"
                borderRadius="100"
              >
                <Text as="span" variant="bodySm" tone="subdued">
                  {nextTierName}
                </Text>
              </Box>
            </InlineStack>
          )}
        </InlineStack>

        <Text as="span" variant="bodySm" tone="subdued">
          Current spending: {formatAmount(currentSpending)}
          {!isMaxTier && ` / ${formatAmount(nextTierThreshold)}`}
        </Text>
      </BlockStack>
    </Box>
  );
}
