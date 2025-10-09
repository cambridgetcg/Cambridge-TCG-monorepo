/**
 * Membership Page - Full Page Loyalty View
 *
 * Displays as a dedicated "Membership" page in customer account navigation.
 * Shows expanded view with: Tier details, store credit, transactions, lifetime stats.
 *
 * Notes:
 * - Uses same data source as ProfileBlock
 * - Provides more detailed view for customers who want to explore rewards
 * - Can be extended with transaction history, tier benefits, etc.
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

// Type definitions matching API response
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
      progressPercentage: number;
      remainingToNextTier: number;
    };
    lifetime: {
      earned: number;
      spent: number;
      redeemed: number;
      orderCount?: number;
    };
  };
  message?: string;
  benefits?: string[];
}

// Register extension for full page
export default reactExtension(
  'customer-account.page.render',
  () => <MembershipPage />
);

function MembershipPage() {
  const { sessionToken, i18n, analytics } = useApi();
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLoyaltyData = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await sessionToken.get();

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

      if (result.success) {
        analytics.publish('rewardspro:membership_page_viewed', {
          enrolled: result.enrolled,
          tier: result.data?.tier.name || 'none',
        });
      }
    } catch (err) {
      console.error('[MembershipPage] Error fetching loyalty data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load loyalty data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoyaltyData();
  }, []);

  // Loading state
  if (loading) {
    return (
      <BlockStack spacing="loose">
        <Heading level={1}>Membership</Heading>
        <Card>
          <BlockStack spacing="base">
            <SkeletonText />
            <SkeletonText />
            <SkeletonText />
          </BlockStack>
        </Card>
      </BlockStack>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <BlockStack spacing="loose">
        <Heading level={1}>Membership</Heading>
        <Card>
          <BlockStack spacing="base">
            <Banner status="critical">
              Unable to load your membership information.
            </Banner>
            <Button onClick={fetchLoyaltyData}>Try Again</Button>
          </BlockStack>
        </Card>
      </BlockStack>
    );
  }

  // Not enrolled state
  if (!data.enrolled || !data.data) {
    return (
      <BlockStack spacing="loose">
        <Heading level={1}>Membership</Heading>
        <Card>
          <BlockStack spacing="base">
            <Heading level={2}>Join Our Rewards Program</Heading>
            <Text>{data.message || 'Start earning rewards on every purchase!'}</Text>
            {data.benefits && data.benefits.length > 0 && (
              <BlockStack spacing="tight">
                <Text emphasis="bold">Benefits:</Text>
                {data.benefits.map((benefit, index) => (
                  <Text key={index} size="small">
                    ✓ {benefit}
                  </Text>
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    );
  }

  const { balance, tier, progress, lifetime } = data.data;
  const constrainedProgress = Math.min(100, Math.max(0, progress.progressPercentage));
  const progressRatio = constrainedProgress / 100;
  const formatAmount = (amount: number) => i18n.formatCurrency(amount);

  return (
    <BlockStack spacing="loose">
      {/* Page Header */}
      <Heading level={1}>Membership</Heading>

      {/* Welcome Message */}
      <Card>
        <BlockStack spacing="tight">
          <Text size="large" emphasis="bold">
            Welcome back, {data.customer?.displayName || 'Member'}!
          </Text>
          <Text appearance="subdued">
            You're currently a <Text emphasis="bold">{tier.name}</Text> member
          </Text>
        </BlockStack>
      </Card>

      {/* Tier & Progress Card */}
      <Card>
        <BlockStack spacing="base">
          <Heading level={2}>Your Tier</Heading>

          <InlineStack spacing="base" blockAlignment="center">
            <BlockStack spacing="extraTight">
              <Text size="extraLarge" emphasis="bold">
                {tier.name}
              </Text>
              <Text appearance="subdued" size="small">
                Level {tier.level}
              </Text>
            </BlockStack>

            <BlockStack spacing="extraTight">
              <Text size="large" emphasis="bold">
                {tier.cashbackRate}%
              </Text>
              <Text appearance="subdued" size="small">
                Cashback rate
              </Text>
            </BlockStack>
          </InlineStack>

          {progress.nextTier && (
            <BlockStack spacing="tight">
              <Text size="small" emphasis="bold">
                Progress to {progress.nextTier}
              </Text>

              <Progress
                value={progressRatio}
                label={`${Math.round(constrainedProgress)}%`}
                accessibilityLabel={`${Math.round(constrainedProgress)}% progress to ${progress.nextTier} tier`}
              />

              <Text size="small" appearance="subdued">
                Spend {formatAmount(progress.remainingToNextTier)} more to reach{' '}
                {progress.nextTier} tier and unlock higher rewards!
              </Text>
            </BlockStack>
          )}

          {!progress.nextTier && (
            <Banner status="success">
              Congratulations! You've reached the highest tier. Keep shopping to
              maintain your status.
            </Banner>
          )}

          {tier.benefits && tier.benefits.length > 0 && (
            <BlockStack spacing="tight">
              <Text size="small" emphasis="bold">
                Your Benefits:
              </Text>
              {tier.benefits.map((benefit, index) => (
                <Text key={index} size="small">
                  • {benefit}
                </Text>
              ))}
            </BlockStack>
          )}
        </BlockStack>
      </Card>

      {/* Store Credit Card */}
      <Card>
        <BlockStack spacing="base">
          <Heading level={2}>Store Credit Balance</Heading>

          <BlockStack spacing="tight">
            <Text size="extraLarge" emphasis="bold">
              {balance.storeCreditFormatted}
            </Text>
            <Text size="small" appearance="subdued">
              Available to spend on your next order
            </Text>
          </BlockStack>

          {balance.pendingCredit > 0 && (
            <Banner status="info">
              You have {formatAmount(balance.pendingCredit)} in pending credit that will
              be available soon.
            </Banner>
          )}
        </BlockStack>
      </Card>

      {/* Lifetime Stats Card */}
      <Card>
        <BlockStack spacing="base">
          <Heading level={2}>Lifetime Statistics</Heading>

          <InlineStack spacing="base">
            <BlockStack spacing="tight">
              <Text size="small" appearance="subdued">
                Total Spent
              </Text>
              <Text size="large" emphasis="bold">
                {formatAmount(lifetime.spent)}
              </Text>
            </BlockStack>

            <BlockStack spacing="tight">
              <Text size="small" appearance="subdued">
                Total Earned
              </Text>
              <Text size="large" emphasis="bold">
                {formatAmount(lifetime.earned)}
              </Text>
            </BlockStack>

            <BlockStack spacing="tight">
              <Text size="small" appearance="subdued">
                Total Redeemed
              </Text>
              <Text size="large" emphasis="bold">
                {formatAmount(lifetime.redeemed)}
              </Text>
            </BlockStack>
          </InlineStack>

          {lifetime.orderCount !== undefined && (
            <BlockStack spacing="tight">
              <Text size="small" appearance="subdued">
                Orders Placed
              </Text>
              <Text size="medium" emphasis="bold">
                {lifetime.orderCount} {lifetime.orderCount === 1 ? 'order' : 'orders'}
              </Text>
            </BlockStack>
          )}
        </BlockStack>
      </Card>

      {/* How It Works Card */}
      <Card>
        <BlockStack spacing="base">
          <Heading level={2}>How It Works</Heading>

          <BlockStack spacing="tight">
            <Text size="small">
              <Text emphasis="bold">1. Shop:</Text> Make purchases and earn {tier.cashbackRate}%
              cashback on every order.
            </Text>
            <Text size="small">
              <Text emphasis="bold">2. Earn:</Text> Cashback is automatically added to your
              store credit balance.
            </Text>
            <Text size="small">
              <Text emphasis="bold">3. Redeem:</Text> Use your store credit at checkout on
              future purchases.
            </Text>
            <Text size="small">
              <Text emphasis="bold">4. Level Up:</Text> Spend more to unlock higher tiers
              with better rewards!
            </Text>
          </BlockStack>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
