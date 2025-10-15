/**
 * Profile Block - Simple Loyalty Display
 *
 * Displays on /account/profile page as a block.
 * Shows: Current tier, cashback rate, store credit, lifetime stats, progress to next tier.
 *
 * Notes:
 * - Uses React components from @shopify/ui-extensions-react/customer-account
 * - Backend returns progressPercentage as integer (0-100); normalize to 0-1 for Progress
 * - Formats currency using i18n.formatCurrency for locale support
 * - Only emits analytics after successful data load with rewardspro: prefix
 */

import { useEffect, useState } from 'react';
import {
  reactExtension,
  Banner,
  BlockStack,
  Button,
  Card,
  Heading,
  InlineStack,
  Progress,
  SkeletonText,
  Text,
  useApi,
} from '@shopify/ui-extensions-react/customer-account';

// Type definitions matching API response from app/routes/api.customer-account.loyalty.tsx
interface LoyaltyData {
  success: boolean;
  enrolled: boolean;
  customer?: {
    id: string;
    displayName: string;
    email: string;
  };
  data?: {
    balance: {
      storeCredit: number;
      storeCreditFormatted: string;
      pendingCredit: number;
      pendingCreditFormatted: string;
    };
    tier: {
      name: string;
      level: number;
      cashbackRate: number;
      benefits: string[];
    };
    progress: {
      currentSpend: number;
      nextTier: string | null;
      progressPercentage: number; // 0-100 integer
      remainingToNextTier: number;
      remainingToNextTierFormatted: string;
    };
    lifetime: {
      earned: number;
      earnedFormatted: string;
      spent: number;
      spentFormatted: string;
      redeemed: number;
      orderCount?: number;
    };
  };
  message?: string;
  benefits?: string[];
}

// Register extension for profile block
export default reactExtension(
  'customer-account.profile.block.render',
  () => <ProfileBlock />
);

function ProfileBlock() {
  // Get Shopify APIs
  const { sessionToken, i18n, analytics } = useApi();

  // State management
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch loyalty data from backend
  const fetchLoyaltyData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get session token for authentication
      const token = await sessionToken.get();

      // Call backend API
      // TODO: Update this URL when deploying to different environments
      const response = await fetch(
        'https://rewardspro-production-nnwf.vercel.app/api/customer-account/loyalty',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const result: LoyaltyData = await response.json();
      setData(result);

      // Only emit analytics after successful load with rewardspro: prefix
      if (result.success) {
        analytics.publish('rewardspro:loyalty_display_viewed', {
          enrolled: result.enrolled,
          tier: result.data?.tier.name || 'none',
        });
      }
    } catch (err) {
      console.error('[ProfileBlock] Error fetching loyalty data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load loyalty data');
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    fetchLoyaltyData();
  }, []);

  // Loading state with skeleton screens
  if (loading) {
    return (
      <Card>
        <BlockStack spacing="base">
          <SkeletonText />
          <SkeletonText />
          <SkeletonText />
        </BlockStack>
      </Card>
    );
  }

  // Error state with retry button
  if (error || !data) {
    return (
      <Card>
        <BlockStack spacing="base">
          <Banner status="critical">
            Unable to load your rewards information.
          </Banner>
          <Button onClick={fetchLoyaltyData}>Try Again</Button>
        </BlockStack>
      </Card>
    );
  }

  // Not enrolled state with CTA
  if (!data.enrolled || !data.data) {
    return (
      <Card>
        <BlockStack spacing="base">
          <Banner status="info">
            {data.message || 'Join our rewards program to start earning!'}
          </Banner>
          {data.benefits && data.benefits.length > 0 && (
            <BlockStack spacing="extraTight">
              {data.benefits.map((benefit, index) => (
                <Text key={index} size="small">
                  • {benefit}
                </Text>
              ))}
            </BlockStack>
          )}
        </BlockStack>
      </Card>
    );
  }

  // Main display - customer is enrolled
  const { balance, tier, progress, lifetime } = data.data;

  // Constrain progress percentage to 0-100 range and normalize to 0-1 for Progress component
  const constrainedProgress = Math.min(100, Math.max(0, progress.progressPercentage));
  const progressRatio = constrainedProgress / 100;

  return (
    <BlockStack spacing="loose">
      {/* Tier Card */}
      <Card>
        <BlockStack spacing="base">
          <Heading level={2}>Membership Tier</Heading>

          <InlineStack spacing="tight" blockAlignment="center">
            <Text size="large" emphasis="bold">
              {tier.name}
            </Text>
            <Text appearance="subdued">Level {tier.level}</Text>
          </InlineStack>

          <BlockStack spacing="tight">
            <Text appearance="subdued" size="small">
              Current cashback rate
            </Text>
            <Text size="extraLarge" emphasis="bold">
              {tier.cashbackRate}%
            </Text>
          </BlockStack>

          {/* Progress to next tier */}
          {progress.nextTier && (
            <BlockStack spacing="tight">
              <InlineStack spacing="base" blockAlignment="center">
                <Text size="small" appearance="subdued">
                  Progress to {progress.nextTier}
                </Text>
                <Text size="small" appearance="subdued">
                  {Math.round(constrainedProgress)}%
                </Text>
              </InlineStack>

              <Progress
                value={progressRatio}
                label={`${Math.round(constrainedProgress)}%`}
                accessibilityLabel={`${Math.round(constrainedProgress)}% progress to ${progress.nextTier} tier`}
              />

              <Text size="small" appearance="subdued">
                Spend {progress.remainingToNextTierFormatted} more to unlock{' '}
                {progress.nextTier}
              </Text>
            </BlockStack>
          )}

          {/* Max tier reached */}
          {!progress.nextTier && (
            <Text appearance="success">
              🎉 You've reached the highest tier!
            </Text>
          )}
        </BlockStack>
      </Card>

      {/* Store Credit Card */}
      <Card>
        <BlockStack spacing="base">
          <Heading level={2}>Store Credit</Heading>

          <BlockStack spacing="tight">
            <Text size="extraLarge" emphasis="bold">
              {balance.storeCreditFormatted}
            </Text>
            <Text size="small" appearance="subdued">
              Available to use on your next order
            </Text>
          </BlockStack>

          {balance.pendingCredit > 0 && (
            <Text size="small" appearance="subdued">
              + {balance.pendingCreditFormatted} pending
            </Text>
          )}
        </BlockStack>
      </Card>

      {/* Lifetime Stats Card */}
      <Card>
        <BlockStack spacing="base">
          <Heading level={2}>Your Stats</Heading>

          <InlineStack spacing="base">
            {/* Total Spent */}
            <BlockStack spacing="extraTight">
              <Text size="small" appearance="subdued">
                Total Spent
              </Text>
              <Text size="medium" emphasis="bold">
                {lifetime.spentFormatted}
              </Text>
            </BlockStack>

            {/* Total Earned */}
            <BlockStack spacing="extraTight">
              <Text size="small" appearance="subdued">
                Total Earned
              </Text>
              <Text size="medium" emphasis="bold">
                {lifetime.earnedFormatted}
              </Text>
            </BlockStack>

            {/* Order Count */}
            {lifetime.orderCount !== undefined && (
              <BlockStack spacing="extraTight">
                <Text size="small" appearance="subdued">
                  Orders
                </Text>
                <Text size="medium" emphasis="bold">
                  {lifetime.orderCount}
                </Text>
              </BlockStack>
            )}
          </InlineStack>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
