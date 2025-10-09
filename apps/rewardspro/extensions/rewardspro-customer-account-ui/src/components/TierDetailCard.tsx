/**
 * Tier Detail Card Component
 * Enhanced tier information card for Profile Block
 * Shows current tier, progress, stats, and benefits
 * Following Shopify customer account UX guidelines and reference implementation
 */

import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Divider,
  View,
} from '@shopify/ui-extensions-react/customer-account';

interface TierDetailCardProps {
  tierName: string;
  tierLevel: number;
  cashbackRate: number;
  currentSpend: number;
  nextTier: string | null;
  nextTierCashback?: number;
  progressPercentage: number;
  remainingToNextTier: number;
  totalOrders?: number;
  averageCashback?: number;
  benefits?: string[];
  formatCurrency: (amount: number) => string;
}

export function TierDetailCard({
  tierName,
  tierLevel,
  cashbackRate,
  currentSpend,
  nextTier,
  nextTierCashback,
  progressPercentage,
  remainingToNextTier,
  totalOrders,
  averageCashback,
  benefits = [],
  formatCurrency,
}: TierDetailCardProps) {
  // Determine badge tone based on tier name (following reference implementation)
  const getTierTone = (name: string): 'success' | 'info' | 'warning' => {
    const tierName = name.toLowerCase();
    if (tierName.includes('diamond') || tierName.includes('platinum')) return 'success';
    if (tierName.includes('gold')) return 'warning';
    if (tierName.includes('silver')) return 'info';
    return 'info';
  };

  const isMaxTier = !nextTier;
  const progress = Math.round(progressPercentage * 100);

  return (
    <Card>
      <BlockStack spacing="base">
        {/* Card Title - Semantic heading for accessibility */}
        <Text size="large" emphasis="bold">
          Membership Tier
        </Text>

        {/* Current Tier Header */}
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="medium" emphasis="bold">
            {tierName}
          </Text>
          <Badge tone={getTierTone(tierName)}>
            Level {tierLevel}
          </Badge>
        </InlineStack>

        {/* Cashback Rate - Primary benefit */}
        <BlockStack spacing="tight">
          <Text appearance="subdued" size="small">
            Current cashback rate
          </Text>
          <Text size="extraLarge" emphasis="bold">
            {cashbackRate}%
          </Text>
          <Text size="small">
            Earning {cashbackRate}% back on all purchases
          </Text>
        </BlockStack>

        <Divider />

        {/* Progress to Next Tier */}
        {!isMaxTier && nextTier && (
          <BlockStack spacing="base">
            <BlockStack spacing="tight">
              <InlineStack spacing="base" blockAlignment="center">
                <Text size="small" appearance="subdued">
                  Progress to {nextTier}
                </Text>
                <Text size="small" appearance="subdued">
                  {progress}%
                </Text>
              </InlineStack>

              {/* Custom Progress Bar - following reference implementation */}
              <View
                border="base"
                borderRadius="base"
                padding="none"
              >
                <View
                  backgroundColor="base"
                  borderRadius="base"
                  padding="extraTight"
                >
                  <View
                    backgroundColor="interactive"
                    borderRadius="base"
                    padding="none"
                    minInlineSize={`${progress}%`}
                    inlineSize={`${progress}%`}
                  >
                    <Text size="small" appearance="subdued"> </Text>
                  </View>
                </View>
              </View>

              <Text size="small" appearance="subdued">
                Spend {formatCurrency(remainingToNextTier)} more to unlock{' '}
                {nextTierCashback ? `${nextTierCashback}% cashback` : `${nextTier} benefits`}
              </Text>
            </BlockStack>
          </BlockStack>
        )}

        {/* Max Tier Reached */}
        {isMaxTier && (
          <BlockStack spacing="tight">
            <Text appearance="success" size="small">
              🎉 You've reached the highest tier!
            </Text>
            <Text size="small" appearance="subdued">
              Total lifetime spend: {formatCurrency(currentSpend)}
            </Text>
          </BlockStack>
        )}

        {/* Spending Stats - Horizontal layout like reference */}
        {(totalOrders !== undefined || currentSpend > 0 || averageCashback !== undefined) && (
          <>
            <Divider />
            <BlockStack spacing="tight">
              <View
                border="base"
                padding="base"
                borderRadius="base"
              >
                <InlineStack spacing="base">
                  {totalOrders !== undefined && (
                    <BlockStack spacing="extraTight">
                      <Text size="small" appearance="subdued">
                        Total Orders
                      </Text>
                      <Text size="medium" emphasis="bold">
                        {totalOrders}
                      </Text>
                    </BlockStack>
                  )}

                  {currentSpend > 0 && (
                    <>
                      <View
                        borderInlineStart="base"
                        paddingInlineStart="base"
                      >
                        <BlockStack spacing="extraTight">
                          <Text size="small" appearance="subdued">
                            Total Spent
                          </Text>
                          <Text size="medium" emphasis="bold">
                            {formatCurrency(currentSpend)}
                          </Text>
                        </BlockStack>
                      </View>
                    </>
                  )}

                  {averageCashback !== undefined && averageCashback > 0 && (
                    <>
                      <View
                        borderInlineStart="base"
                        paddingInlineStart="base"
                      >
                        <BlockStack spacing="extraTight">
                          <Text size="small" appearance="subdued">
                            Avg. Cashback
                          </Text>
                          <Text size="medium" emphasis="bold">
                            {formatCurrency(averageCashback)}
                          </Text>
                        </BlockStack>
                      </View>
                    </>
                  )}
                </InlineStack>
              </View>
            </BlockStack>
          </>
        )}

        {/* Tier Benefits */}
        {benefits.length > 0 && (
          <>
            <Divider />
            <BlockStack spacing="tight">
              <Text size="medium" emphasis="bold">
                Your benefits
              </Text>
              <BlockStack spacing="extraTight">
                {benefits.map((benefit, index) => (
                  <InlineStack key={index} spacing="tight">
                    <Text appearance="success" aria-hidden="true">
                      ✓
                    </Text>
                    <Text size="small">{benefit}</Text>
                  </InlineStack>
                ))}
              </BlockStack>
            </BlockStack>
          </>
        )}
      </BlockStack>
    </Card>
  );
}
