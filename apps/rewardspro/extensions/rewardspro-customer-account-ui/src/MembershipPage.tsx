/**
 * Membership Page - Main loyalty program page
 * Displays tier info, store credit, and rewards summary
 */

import {
  reactExtension,
  Page,
  BlockStack,
  InlineStack,
  Grid,
  Text,
  Banner,
  SkeletonText,
  SkeletonTextBlock,
  useApi,
} from '@shopify/ui-extensions-react/customer-account';
import { useLoyaltyData } from './hooks/useLoyaltyData';
import { TierInfoCard } from './components/TierInfoCard';
import { StoreCreditCard } from './components/StoreCreditCard';

// Global error handlers for Web Worker
// Must be at module level to capture all errors
self.addEventListener('unhandledrejection', (event) => {
  console.error('[RewardsPro] Unhandled promise rejection:', event.reason);

  // Send error to backend for monitoring
  const token = event.reason?.token; // If available from context
  fetch('https://rewardspro-production-nnwf.vercel.app/api/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'unhandledRejection',
      message: event.reason?.toString(),
      stack: event.reason?.stack,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {
    // Silently fail if error logging fails
  });

  event.preventDefault();
});

self.addEventListener('error', (event) => {
  console.error('[RewardsPro] Uncaught error:', event.error);

  fetch('https://rewardspro-production-nnwf.vercel.app/api/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'uncaughtError',
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});

  event.preventDefault();
});

export default reactExtension(
  'customer-account.page.render',
  () => <MembershipPage />
);

function MembershipPage() {
  const { i18n } = useApi();
  const { data, loading, error } = useLoyaltyData();

  return (
    <Page
      title={i18n.translate('membershipTitle', { fallback: 'Rewards Membership' })}
    >
      <BlockStack spacing="base">
        {/* Loading State */}
        {loading && <LoadingSkeleton />}

        {/* Error State */}
        {error && (
          <Banner status="critical">
            <Text>
              {i18n.translate('errorLoading', {
                fallback: 'Unable to load your rewards information. Please try again later.',
              })}
            </Text>
          </Banner>
        )}

        {/* Not Enrolled State */}
        {data && !data.enrolled && (
          <Banner status="info">
            <BlockStack spacing="tight">
              <Text emphasis="bold">
                {i18n.translate('notEnrolled', {
                  fallback: 'Join our Rewards Program',
                })}
              </Text>
              <Text>
                {data.message || 'Start earning rewards on every purchase!'}
              </Text>
            </BlockStack>
          </Banner>
        )}

        {/* Enrolled - Show Loyalty Data */}
        {data && data.enrolled && data.data && (
          <BlockStack spacing="base">
            {/* Welcome Message */}
            <Text size="medium">
              {i18n.translate('welcome', {
                fallback: `Welcome back, ${data.customer?.displayName || 'Member'}!`,
              })}
            </Text>

            {/* Main Cards Grid */}
            <Grid
              columns={['fill', 'fill']}
              spacing="base"
            >
              {/* Tier Information Card */}
              <TierInfoCard
                tierName={data.data.tier.name}
                tierLevel={data.data.tier.level}
                cashbackRate={data.data.tier.cashbackRate}
                currentSpend={data.data.progress.currentSpend}
                nextTier={data.data.progress.nextTier}
                progressPercentage={data.data.progress.progressPercentage}
                remainingToNextTier={data.data.progress.remainingToNextTier}
                currency="$" // TODO: Use shop currency
              />

              {/* Store Credit Card */}
              <StoreCreditCard
                balance={data.data.balance.storeCredit}
                balanceFormatted={data.data.balance.storeCreditFormatted}
                pendingCredit={data.data.balance.pendingCredit}
                currency="$" // TODO: Use shop currency
              />
            </Grid>

            {/* Lifetime Stats */}
            <Grid
              columns={['fill', 'fill', 'fill']}
              spacing="base"
            >
              <StatCard
                label={i18n.translate('lifetimeEarned', { fallback: 'Lifetime Earned' })}
                value={`$${data.data.lifetime.earned.toFixed(2)}`}
              />
              <StatCard
                label={i18n.translate('totalSpent', { fallback: 'Total Spent' })}
                value={`$${data.data.lifetime.spent.toFixed(2)}`}
              />
              <StatCard
                label={i18n.translate('rewardsRedeemed', { fallback: 'Rewards Redeemed' })}
                value={`$${data.data.lifetime.redeemed.toFixed(2)}`}
              />
            </Grid>

            {/* Tier Benefits */}
            {data.data.tier.benefits.length > 0 && (
              <BlockStack spacing="tight">
                <Text size="medium" emphasis="bold">
                  {i18n.translate('yourBenefits', { fallback: 'Your Benefits' })}
                </Text>
                <BlockStack spacing="extraTight">
                  {data.data.tier.benefits.map((benefit, index) => (
                    <InlineStack key={index} spacing="tight">
                      <Text>✓</Text>
                      <Text>{benefit}</Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            )}
          </BlockStack>
        )}
      </BlockStack>
    </Page>
  );
}

// Loading Skeleton Component
function LoadingSkeleton() {
  return (
    <BlockStack spacing="base">
      <SkeletonText lines={1} />
      <Grid columns={['fill', 'fill']} spacing="base">
        <SkeletonTextBlock lines={5} />
        <SkeletonTextBlock lines={5} />
      </Grid>
    </BlockStack>
  );
}

// Stat Card Component
interface StatCardProps {
  label: string;
  value: string;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <BlockStack spacing="extraTight">
      <Text size="small" appearance="subdued">
        {label}
      </Text>
      <Text size="large" emphasis="bold">
        {value}
      </Text>
    </BlockStack>
  );
}
