import { useEffect, useState, useCallback } from 'react';
import {
  reactExtension,
  Banner,
  BlockStack,
  Text,
  useTranslate,
  useLanguage,
  InlineStack,
  Badge,
  Divider,
  View,
  useExtension,
  Button,
  SkeletonText,
} from '@shopify/ui-extensions-react/customer-account';
import { useSessionToken } from './hooks/useSessionToken';
import { useApiClient } from './hooks/useApiClient';
import { useAuthenticatedCustomer } from './hooks/useAuthenticatedCustomer';
import { logger } from './utils/logger';
import { MAX_TRANSACTIONS_DISPLAY } from './config';

// ============================================================================
// Types
// ============================================================================

interface TierInfo {
  name: string;
  cashbackPercent: number;
  minSpend: number;
}

interface TransactionInfo {
  id: number;
  type: string;
  amount: number;
  date: string;
  description: string;
}

interface LoyaltyData {
  success: boolean;
  enrolled: boolean;
  balance: number;
  tier: TierInfo | null;
  nextTier: TierInfo | null;
  progressToNextTier: number;
  amountToNextTier: number;
  totalEarned: number;
  stats: {
    orderCount: number;
    totalSpent: number;
    netSpent: number;
    averageCashbackPerOrder: number;
    lastOrderDate: string | null;
  };
  allTiers: TierInfo[];
  recentTransactions: TransactionInfo[];
  currency: string;
  message?: string;
  canEnroll?: boolean;
  isPreview?: boolean;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format currency with proper locale support
 */
function formatCurrency(
  amount: number,
  currency: string,
  locale: string = 'en-US'
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  } catch {
    // Fallback for invalid currency codes
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Format date for display
 */
function formatDate(dateString: string, locale: string = 'en-US'): string {
  try {
    return new Date(dateString).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Generate mock data for editor/preview mode
 */
function getMockData(): LoyaltyData {
  return {
    success: true,
    enrolled: true,
    balance: 50.00,
    tier: {
      name: 'Gold Member',
      cashbackPercent: 5,
      minSpend: 500
    },
    nextTier: {
      name: 'Platinum Member',
      cashbackPercent: 10,
      minSpend: 1000
    },
    progressToNextTier: 65,
    amountToNextTier: 350,
    totalEarned: 125.50,
    stats: {
      orderCount: 12,
      totalSpent: 650.00,
      netSpent: 650.00,
      averageCashbackPerOrder: 10.46,
      lastOrderDate: new Date().toISOString()
    },
    allTiers: [
      { name: 'Bronze Member', cashbackPercent: 2, minSpend: 0 },
      { name: 'Silver Member', cashbackPercent: 3, minSpend: 250 },
      { name: 'Gold Member', cashbackPercent: 5, minSpend: 500 },
      { name: 'Platinum Member', cashbackPercent: 10, minSpend: 1000 }
    ],
    recentTransactions: [
      { id: 1, type: 'CASHBACK_EARNED', amount: 12.50, date: new Date().toISOString(), description: 'Cashback from order #1234' },
      { id: 2, type: 'ORDER_PAYMENT', amount: -5.00, date: new Date(Date.now() - 86400000).toISOString(), description: 'Used for order #1235' },
      { id: 3, type: 'CASHBACK_EARNED', amount: 8.00, date: new Date(Date.now() - 172800000).toISOString(), description: 'Cashback from order #1233' },
    ],
    currency: 'USD',
    message: 'Preview - This is sample membership data',
    isPreview: true
  };
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Skeleton loading state
 */
function MembershipSkeleton() {
  return (
    <BlockStack spacing="base">
      <SkeletonText size="large" />

      <View border="base" cornerRadius="base" padding="base" background="base">
        <BlockStack spacing="base">
          <SkeletonText size="small" />
          <SkeletonText size="large" />
          <Divider />
          <SkeletonText size="small" />
          <SkeletonText size="small" />
          <Divider />
          <InlineStack spacing="base">
            <BlockStack spacing="extraTight">
              <SkeletonText size="small" />
              <SkeletonText size="medium" />
            </BlockStack>
            <BlockStack spacing="extraTight">
              <SkeletonText size="small" />
              <SkeletonText size="medium" />
            </BlockStack>
          </InlineStack>
        </BlockStack>
      </View>

      <View border="base" cornerRadius="base" padding="base" background="base">
        <BlockStack spacing="tight">
          <SkeletonText size="small" />
          <SkeletonText size="extraLarge" />
          <SkeletonText size="small" />
        </BlockStack>
      </View>
    </BlockStack>
  );
}

/**
 * Custom progress bar component
 */
interface ProgressBarProps {
  progress: number;
  height?: number;
}

function TierProgressBar({ progress, height = 8 }: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <View
      border="base"
      cornerRadius="fullyRounded"
      background="subdued"
      minBlockSize={height}
      maxBlockSize={height}
    >
      <View
        cornerRadius="fullyRounded"
        background="interactive"
        minBlockSize={height}
        maxBlockSize={height}
        inlineSize={`${clampedProgress}%`}
      />
    </View>
  );
}

/**
 * Transaction row component
 */
interface TransactionRowProps {
  transaction: TransactionInfo;
  currency: string;
  locale: string;
}

function TransactionRow({ transaction, currency, locale }: TransactionRowProps) {
  const isPositive = transaction.amount > 0;
  const formattedAmount = formatCurrency(Math.abs(transaction.amount), currency, locale);
  const formattedDate = formatDate(transaction.date, locale);

  return (
    <InlineStack spacing="base" blockAlignment="center">
      <View inlineSize="fill">
        <BlockStack spacing="extraTight">
          <Text size="small">{transaction.description}</Text>
          <Text size="small" appearance="subdued">{formattedDate}</Text>
        </BlockStack>
      </View>
      <Text
        size="small"
        emphasis="bold"
        appearance={isPositive ? undefined : "subdued"}
      >
        {isPositive ? '+' : '-'}{formattedAmount}
      </Text>
    </InlineStack>
  );
}

/**
 * Tier row for "View All Tiers" section
 */
interface TierRowProps {
  tier: TierInfo;
  isCurrent: boolean;
  isAchieved: boolean;
  currency: string;
  locale: string;
}

function TierRow({ tier, isCurrent, isAchieved, currency, locale }: TierRowProps) {
  return (
    <InlineStack spacing="base" blockAlignment="center">
      <View inlineSize="fill">
        <BlockStack spacing="extraTight">
          <InlineStack spacing="tight" blockAlignment="center">
            <Text size="small" emphasis={isCurrent ? "bold" : undefined}>
              {tier.name}
            </Text>
            {isCurrent && <Badge tone="success">Current</Badge>}
            {isAchieved && !isCurrent && <Badge tone="info">Achieved</Badge>}
          </InlineStack>
          <Text size="small" appearance="subdued">
            Min spend: {formatCurrency(tier.minSpend, currency, locale)}
          </Text>
        </BlockStack>
      </View>
      <Badge>{tier.cashbackPercent}%</Badge>
    </InlineStack>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function MembershipBlock() {
  const translate = useTranslate();
  const language = useLanguage();
  const locale = language.isoCode || 'en-US';

  // Detect if we're in the theme editor
  const { editor } = useExtension();
  const isInEditor = editor?.type === 'checkout';

  // Authenticated customer (simpler, direct access)
  const {
    customerId: authCustomerId,
    isAuthenticated: authIsAuthenticated,
  } = useAuthenticatedCustomer();

  // Session token management (for API calls)
  const {
    sessionToken,
    customerId: tokenCustomerId,
    isAuthenticated: tokenIsAuthenticated,
    isLoading: tokenLoading,
    decodedToken
  } = useSessionToken();

  // Extract shop domain from decoded token
  const shopDomain = decodedToken?.claims?.dest;

  // API client
  const apiClient = useApiClient({
    shopDomain: shopDomain,
  });

  // State
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllTiers, setShowAllTiers] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Derive authentication state
  const customerId = authCustomerId || tokenCustomerId;
  const isAuthenticated = authIsAuthenticated || tokenIsAuthenticated;

  // Combined loading state
  const isLoading = tokenLoading || dataLoading;

  logger.debug('Component state:', {
    customerId,
    isAuthenticated,
    hasSessionToken: !!sessionToken,
    isLoading,
  });

  // Fetch loyalty data
  const fetchLoyaltyData = useCallback(async (isRefresh = false) => {
    logger.debug('fetchLoyaltyData called', { isAuthenticated, hasSessionToken: !!sessionToken, isInEditor });

    // If in editor mode, show mock data
    if (isInEditor) {
      logger.debug('Editor mode - using mock data');
      setLoyaltyData(getMockData());
      return;
    }

    if (!isAuthenticated || !sessionToken) {
      logger.debug('Skipping fetch - not authenticated or no session token');
      return;
    }

    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setDataLoading(true);
      }
      setError(null);

      const response = await apiClient.get<LoyaltyData>(sessionToken, '');

      logger.debug('API response:', {
        success: response.success,
        hasData: !!response.data,
        enrolled: response.data?.enrolled,
      });

      if (response.success && response.data) {
        setLoyaltyData(response.data);
      } else if (response.data?.isPreview) {
        setLoyaltyData(getMockData());
      } else {
        const errorMsg = response.error || translate('membership.error.generic');
        logger.error('API error:', errorMsg);
        setError(errorMsg);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Exception during fetch:', errorMessage);
      if (isAuthenticated) {
        setError(errorMessage);
      }
    } finally {
      setDataLoading(false);
      setIsRefreshing(false);
    }
  }, [isAuthenticated, sessionToken, apiClient, isInEditor, translate]);

  // Initial data fetch
  useEffect(() => {
    fetchLoyaltyData();
  }, [fetchLoyaltyData]);

  // Manual refresh handler
  const handleRefresh = useCallback(() => {
    if (!isRefreshing) {
      fetchLoyaltyData(true);
    }
  }, [isRefreshing, fetchLoyaltyData]);

  // ============================================================================
  // Render States
  // ============================================================================

  // Unauthenticated state
  if (!isAuthenticated && !isInEditor) {
    return (
      <View border="base" cornerRadius="base" padding="base" background="subdued">
        <BlockStack spacing="base">
          <Text size="medium" emphasis="bold">
            {translate('membership.preview.title')}
          </Text>
          <Text appearance="subdued">
            {translate('membership.preview.signInMessage')}
          </Text>
          <Divider />
          <BlockStack spacing="tight">
            <Text size="small" appearance="subdued">
              {translate('membership.preview.exampleTier')}
            </Text>
            <Text size="small" appearance="subdued">
              {translate('membership.preview.exampleBalance')}
            </Text>
          </BlockStack>
        </BlockStack>
      </View>
    );
  }

  // Loading state with skeleton
  if (isLoading && !loyaltyData) {
    return <MembershipSkeleton />;
  }

  // Error state
  if (error && !loyaltyData) {
    return (
      <Banner tone="critical" title={translate('membership.error.title')}>
        {error}
      </Banner>
    );
  }

  // Not enrolled state
  if (loyaltyData && !loyaltyData.enrolled) {
    return (
      <Banner tone="info" title={translate('membership.notEnrolled.title')}>
        {loyaltyData.message || translate('membership.notEnrolled.message')}
      </Banner>
    );
  }

  // No data state
  if (!loyaltyData) {
    return null;
  }

  // ============================================================================
  // Main Enrolled View
  // ============================================================================

  return (
    <BlockStack spacing="base">
      {/* Header with Refresh Button */}
      <InlineStack spacing="base" blockAlignment="center">
        <View inlineSize="fill">
          <Text size="large" emphasis="bold">
            {translate('membership.title')}
          </Text>
        </View>
        <Button
          kind="plain"
          accessibilityLabel={translate('membership.refresh')}
          onPress={handleRefresh}
          loading={isRefreshing}
          disabled={isRefreshing}
        >
          {translate('membership.refresh')}
        </Button>
      </InlineStack>

      {/* Preview Banner */}
      {loyaltyData.isPreview && (
        <Banner tone="info">
          {loyaltyData.message || 'Preview mode'}
        </Banner>
      )}

      {/* Membership Tier Card */}
      {loyaltyData.tier && (
        <View border="base" cornerRadius="base" padding="base" background="base">
          <BlockStack spacing="base">
            {/* Current Tier */}
            <BlockStack spacing="tight">
              <Text appearance="subdued">
                {translate('membership.tier.current')}
              </Text>
              <InlineStack spacing="tight" blockAlignment="center">
                <Text size="large" emphasis="bold">{loyaltyData.tier.name}</Text>
                <Badge tone="success">{loyaltyData.tier.cashbackPercent}% cashback</Badge>
              </InlineStack>
            </BlockStack>

            {/* Next Tier Progress */}
            {loyaltyData.nextTier ? (
              <BlockStack spacing="tight">
                <Divider />
                <Text size="medium" emphasis="bold">
                  {translate('membership.tier.next', { tierName: loyaltyData.nextTier.name })}
                </Text>
                <Text size="small" appearance="subdued">
                  {translate('membership.tier.spendMore', {
                    amount: formatCurrency(loyaltyData.amountToNextTier, loyaltyData.currency, locale),
                    percent: loyaltyData.nextTier.cashbackPercent.toString()
                  })}
                </Text>
                <TierProgressBar progress={loyaltyData.progressToNextTier} />
                <Text size="small" appearance="subdued">
                  {translate('membership.tier.progress', {
                    percent: loyaltyData.progressToNextTier.toFixed(0)
                  })}
                </Text>
              </BlockStack>
            ) : (
              <BlockStack spacing="tight">
                <Divider />
                <Text size="small" appearance="subdued">
                  {translate('membership.tier.atHighest')}
                </Text>
              </BlockStack>
            )}

            {/* Stats */}
            <BlockStack spacing="tight">
              <Divider />
              <InlineStack spacing="base">
                <BlockStack spacing="extraTight">
                  <Text size="small" appearance="subdued">
                    {translate('membership.stats.totalSpent')}
                  </Text>
                  <Text emphasis="bold">
                    {formatCurrency(loyaltyData.stats.totalSpent, loyaltyData.currency, locale)}
                  </Text>
                </BlockStack>
                <BlockStack spacing="extraTight">
                  <Text size="small" appearance="subdued">
                    {translate('membership.stats.orders')}
                  </Text>
                  <Text emphasis="bold">{loyaltyData.stats.orderCount}</Text>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </BlockStack>
        </View>
      )}

      {/* Store Credit Balance Card */}
      <View border="base" cornerRadius="base" padding="base" background="base">
        <BlockStack spacing="tight">
          <Text appearance="subdued">
            {translate('membership.balance.available')}
          </Text>
          <Text size="extraLarge" emphasis="bold">
            {formatCurrency(loyaltyData.balance, loyaltyData.currency, locale)}
          </Text>
          {loyaltyData.totalEarned > 0 && (
            <Text size="small" appearance="subdued">
              {translate('membership.balance.totalEarned', {
                amount: formatCurrency(loyaltyData.totalEarned, loyaltyData.currency, locale)
              })}
            </Text>
          )}
        </BlockStack>
      </View>

      {/* Transaction History */}
      {loyaltyData.recentTransactions && loyaltyData.recentTransactions.length > 0 && (
        <View border="base" cornerRadius="base" padding="base" background="base">
          <BlockStack spacing="base">
            <Text emphasis="bold">
              {translate('membership.transactions.title')}
            </Text>
            <Divider />
            <BlockStack spacing="tight">
              {loyaltyData.recentTransactions.slice(0, MAX_TRANSACTIONS_DISPLAY).map((tx) => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                  currency={loyaltyData.currency}
                  locale={locale}
                />
              ))}
            </BlockStack>
          </BlockStack>
        </View>
      )}

      {/* View All Tiers Toggle */}
      {loyaltyData.allTiers && loyaltyData.allTiers.length > 0 && (
        <>
          <Button
            kind="plain"
            onPress={() => setShowAllTiers(!showAllTiers)}
          >
            {showAllTiers ? 'Hide tiers' : 'View all tiers'}
          </Button>

          {showAllTiers && (
            <View border="base" cornerRadius="base" padding="base" background="subdued">
              <BlockStack spacing="tight">
                <Text emphasis="bold">All Membership Tiers</Text>
                <Divider />
                {loyaltyData.allTiers.map((t, i) => (
                  <TierRow
                    key={i}
                    tier={t}
                    isCurrent={t.name === loyaltyData.tier?.name}
                    isAchieved={loyaltyData.stats.totalSpent >= t.minSpend}
                    currency={loyaltyData.currency}
                    locale={locale}
                  />
                ))}
              </BlockStack>
            </View>
          )}
        </>
      )}
    </BlockStack>
  );
}

// ============================================================================
// Extension Export
// ============================================================================

export default reactExtension(
  'customer-account.profile.block.render',
  () => <MembershipBlock />
);
