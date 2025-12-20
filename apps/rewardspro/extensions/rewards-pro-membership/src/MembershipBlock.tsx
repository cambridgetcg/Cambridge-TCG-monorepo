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
  Icon,
} from '@shopify/ui-extensions-react/customer-account';
import { useSessionToken } from './hooks/useSessionToken';
import { useApiClient } from './hooks/useApiClient';
import { useAuthenticatedCustomer } from './hooks/useAuthenticatedCustomer';
import { logger } from './utils/logger';
import { MAX_TRANSACTIONS_DISPLAY } from './config';

// ============================================================================
// Types - Updated for new API response
// ============================================================================

interface CustomerInfo {
  firstName: string | null;
  lastName: string | null;
  memberSince: string;
  tags: string[];
}

interface BalanceInfo {
  current: number;
  lifetimeEarned: number;
}

interface TierSourceDetails {
  type: 'spending' | 'subscription' | 'purchase' | 'manual';
  nextBillingDate?: string | null;
  billingInterval?: string;
  expiresAt?: string | null;
  isLifetime?: boolean;
  annualSpend?: number;
  evaluationPeriod?: string;
  note?: string | null;
}

interface TierInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
  cashbackPercent: number;
  minSpend: number;
  source?: string;
  sourceDetails?: TierSourceDetails;
}

interface ProgressInfo {
  nextTierName: string | null;
  nextTierCashback: number | null;
  percent: number;
  amountRemaining: number;
  isMaxTier: boolean;
}

interface TransactionInfo {
  id: string;
  type: string;
  amount: number;
  date: string;
  description: string;
  orderNumber?: string | null;
}

interface AllTierInfo {
  id: string;
  name: string;
  icon: string;
  cashbackPercent: number;
  minSpend: number;
  isCurrentTier: boolean;
  isAchieved: boolean;
}

interface LoyaltyData {
  success: boolean;
  enrolled: boolean;
  customer: CustomerInfo;
  balance: BalanceInfo;
  tier: TierInfo | null;
  benefits: string[];
  progress: ProgressInfo;
  stats: {
    orderCount: number;
    totalSpent: number;
    lastOrderDate: string | null;
  };
  allTiers: AllTierInfo[];
  recentTransactions: TransactionInfo[];
  currency: string;
  message?: string;
  canEnroll?: boolean;
  isPreview?: boolean;
  // Legacy fields for backward compatibility
  totalEarned?: number;
  progressToNextTier?: number;
  amountToNextTier?: number;
  nextTier?: { name: string; cashbackPercent: number; minSpend: number } | null;
}

// ============================================================================
// Utility Functions
// ============================================================================

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
    return `${currency} ${amount.toFixed(2)}`;
  }
}

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

function formatMonthYear(dateString: string, locale: string = 'en-US'): string {
  try {
    return new Date(dateString).toLocaleDateString(locale, {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

function getMockData(): LoyaltyData {
  return {
    success: true,
    enrolled: true,
    customer: {
      firstName: 'Sarah',
      lastName: 'Smith',
      memberSince: '2024-01-15T00:00:00.000Z',
      tags: []
    },
    balance: {
      current: 50.00,
      lifetimeEarned: 125.50
    },
    tier: {
      id: 'mock-tier-gold',
      name: 'Gold Member',
      icon: '⭐',
      color: '#FFD700',
      cashbackPercent: 5,
      minSpend: 500,
      source: 'SPENDING_BASED',
      sourceDetails: {
        type: 'spending',
        annualSpend: 650,
        evaluationPeriod: 'ANNUAL'
      }
    },
    benefits: [
      '5% cashback on every order',
      'Member-only promotions',
      'Early access to new products'
    ],
    progress: {
      nextTierName: 'Platinum Member',
      nextTierCashback: 10,
      percent: 65,
      amountRemaining: 350,
      isMaxTier: false
    },
    stats: {
      orderCount: 12,
      totalSpent: 650.00,
      lastOrderDate: new Date().toISOString()
    },
    allTiers: [
      { id: '1', name: 'Bronze', icon: '🥉', cashbackPercent: 2, minSpend: 0, isCurrentTier: false, isAchieved: true },
      { id: '2', name: 'Silver', icon: '🥈', cashbackPercent: 3, minSpend: 250, isCurrentTier: false, isAchieved: true },
      { id: '3', name: 'Gold', icon: '⭐', cashbackPercent: 5, minSpend: 500, isCurrentTier: true, isAchieved: true },
      { id: '4', name: 'Platinum', icon: '💎', cashbackPercent: 10, minSpend: 1000, isCurrentTier: false, isAchieved: false }
    ],
    recentTransactions: [
      { id: '1', type: 'CASHBACK_EARNED', amount: 12.50, date: new Date().toISOString(), description: 'Cashback from order #1234', orderNumber: '#1234' },
      { id: '2', type: 'ORDER_PAYMENT', amount: -5.00, date: new Date(Date.now() - 86400000).toISOString(), description: 'Used for order #1235', orderNumber: '#1235' },
      { id: '3', type: 'CASHBACK_EARNED', amount: 8.00, date: new Date(Date.now() - 172800000).toISOString(), description: 'Cashback from order #1233', orderNumber: '#1233' },
    ],
    currency: 'USD',
    message: 'Preview - This is sample membership data',
    isPreview: true,
    totalEarned: 125.50,
    progressToNextTier: 65,
    amountToNextTier: 350,
    nextTier: { name: 'Platinum Member', cashbackPercent: 10, minSpend: 1000 }
  };
}

// ============================================================================
// Sub-Components
// ============================================================================

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
        </BlockStack>
      </View>
      <View border="base" cornerRadius="base" padding="base" background="base">
        <BlockStack spacing="tight">
          <SkeletonText size="small" />
          <SkeletonText size="extraLarge" />
        </BlockStack>
      </View>
    </BlockStack>
  );
}

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

interface WelcomeHeaderProps {
  customer: CustomerInfo;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
  onRefresh: () => void;
  isRefreshing: boolean;
}

function WelcomeHeader({ customer, locale, translate, onRefresh, isRefreshing }: WelcomeHeaderProps) {
  const displayName = customer.firstName || null;
  const memberSinceFormatted = formatMonthYear(customer.memberSince, locale);

  return (
    <InlineStack spacing="base" blockAlignment="center">
      <View inlineSize="fill">
        <BlockStack spacing="extraTight">
          <Text size="large" emphasis="bold">
            {displayName
              ? translate('membership.welcome.greeting', { name: displayName })
              : translate('membership.welcome.greetingGeneric')
            }
          </Text>
          <Text size="small" appearance="subdued">
            {translate('membership.welcome.memberSince', { date: memberSinceFormatted })}
          </Text>
        </BlockStack>
      </View>
      <Button
        kind="plain"
        accessibilityLabel={translate('membership.refresh')}
        onPress={onRefresh}
        loading={isRefreshing}
        disabled={isRefreshing}
      >
        {translate('membership.refresh')}
      </Button>
    </InlineStack>
  );
}

interface TierSourceBadgeProps {
  tier: TierInfo;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

function TierSourceBadge({ tier, locale, translate }: TierSourceBadgeProps) {
  const sourceDetails = tier.sourceDetails;
  if (!sourceDetails) return null;

  let sourceText = '';
  let subText: string | null = null;

  switch (sourceDetails.type) {
    case 'subscription':
      sourceText = translate('membership.tier.earnedVia.subscription');
      if (sourceDetails.nextBillingDate) {
        subText = translate('membership.tier.subscriptionRenews', {
          date: formatDate(sourceDetails.nextBillingDate, locale)
        });
      }
      break;
    case 'purchase':
      sourceText = translate('membership.tier.earnedVia.purchase');
      if (sourceDetails.isLifetime) {
        subText = translate('membership.tier.purchaseLifetime');
      } else if (sourceDetails.expiresAt) {
        subText = translate('membership.tier.purchaseExpires', {
          date: formatDate(sourceDetails.expiresAt, locale)
        });
      }
      break;
    case 'manual':
      sourceText = translate('membership.tier.earnedVia.manual');
      break;
    default:
      sourceText = translate('membership.tier.earnedVia.spending');
  }

  return (
    <BlockStack spacing="extraTight">
      <Text size="small" appearance="subdued">{sourceText}</Text>
      {subText && <Text size="small" appearance="subdued">{subText}</Text>}
    </BlockStack>
  );
}

interface MembershipCardProps {
  tier: TierInfo;
  benefits: string[];
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

function MembershipCard({ tier, benefits, locale, translate }: MembershipCardProps) {
  return (
    <View border="base" cornerRadius="base" padding="base" background="base">
      <BlockStack spacing="base">
        {/* Tier Header */}
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="large" emphasis="bold">
            {tier.icon} {tier.name}
          </Text>
          <Badge tone="success">{tier.cashbackPercent}% cashback</Badge>
        </InlineStack>

        {/* Tier Source */}
        <TierSourceBadge tier={tier} locale={locale} translate={translate} />

        {/* Benefits */}
        {benefits.length > 0 && (
          <>
            <Divider />
            <BlockStack spacing="tight">
              <Text size="small" emphasis="bold">
                {translate('membership.benefits.title')}
              </Text>
              {benefits.map((benefit, index) => (
                <InlineStack key={index} spacing="tight" blockAlignment="start">
                  <Text size="small" appearance="success">✓</Text>
                  <Text size="small">{benefit}</Text>
                </InlineStack>
              ))}
            </BlockStack>
          </>
        )}
      </BlockStack>
    </View>
  );
}

interface BalanceCardProps {
  balance: BalanceInfo;
  currency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

function BalanceCard({ balance, currency, locale, translate }: BalanceCardProps) {
  return (
    <View border="base" cornerRadius="base" padding="base" background="base">
      <InlineStack spacing="base">
        <View inlineSize="fill">
          <BlockStack spacing="extraTight">
            <Text size="small" appearance="subdued">
              {translate('membership.balance.available')}
            </Text>
            <Text size="large" emphasis="bold">
              {formatCurrency(balance.current, currency, locale)}
            </Text>
          </BlockStack>
        </View>
        <View inlineSize="fill">
          <BlockStack spacing="extraTight">
            <Text size="small" appearance="subdued">
              {translate('membership.balance.totalEarned')}
            </Text>
            <Text size="medium" emphasis="bold">
              {formatCurrency(balance.lifetimeEarned, currency, locale)}
            </Text>
          </BlockStack>
        </View>
      </InlineStack>
    </View>
  );
}

interface ProgressCardProps {
  progress: ProgressInfo;
  currency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

function ProgressCard({ progress, currency, locale, translate }: ProgressCardProps) {
  if (progress.isMaxTier) {
    return (
      <View border="base" cornerRadius="base" padding="base" background="subdued">
        <BlockStack spacing="tight">
          <InlineStack spacing="tight" blockAlignment="center">
            <Text size="medium" emphasis="bold">
              🏆 {translate('membership.tier.maxTierCongrats')}
            </Text>
          </InlineStack>
          <TierProgressBar progress={100} />
          <Text size="small" appearance="subdued">
            {translate('membership.progress.maxTier')}
          </Text>
        </BlockStack>
      </View>
    );
  }

  return (
    <View border="base" cornerRadius="base" padding="base" background="base">
      <BlockStack spacing="tight">
        <InlineStack spacing="base" blockAlignment="center">
          <View inlineSize="fill">
            <Text size="small" emphasis="bold">
              {translate('membership.progress.nextTier', {
                tierName: progress.nextTierName || '',
                percent: String(progress.nextTierCashback || 0)
              })}
            </Text>
          </View>
          <Text size="small" appearance="subdued">
            {translate('membership.progress.amountToGo', {
              amount: formatCurrency(progress.amountRemaining, currency, locale)
            })}
          </Text>
        </InlineStack>
        <TierProgressBar progress={progress.percent} />
        <Text size="small" appearance="subdued">
          {progress.percent.toFixed(0)}% complete
        </Text>
      </BlockStack>
    </View>
  );
}

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
        appearance={isPositive ? 'success' : 'subdued'}
      >
        {isPositive ? '+' : '-'}{formattedAmount}
      </Text>
    </InlineStack>
  );
}

interface ActivityCardProps {
  transactions: TransactionInfo[];
  currency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

function ActivityCard({ transactions, currency, locale, translate }: ActivityCardProps) {
  if (transactions.length === 0) {
    return (
      <View border="base" cornerRadius="base" padding="base" background="base">
        <BlockStack spacing="tight">
          <Text emphasis="bold">{translate('membership.transactions.title')}</Text>
          <Divider />
          <Text size="small" appearance="subdued">
            {translate('membership.transactions.empty')}
          </Text>
        </BlockStack>
      </View>
    );
  }

  return (
    <View border="base" cornerRadius="base" padding="base" background="base">
      <BlockStack spacing="base">
        <Text emphasis="bold">{translate('membership.transactions.title')}</Text>
        <Divider />
        <BlockStack spacing="tight">
          {transactions.slice(0, MAX_TRANSACTIONS_DISPLAY).map((tx) => (
            <TransactionRow
              key={tx.id}
              transaction={tx}
              currency={currency}
              locale={locale}
            />
          ))}
        </BlockStack>
      </BlockStack>
    </View>
  );
}

interface TierRowProps {
  tier: AllTierInfo;
  currency: string;
  locale: string;
  currentSpending: number;
  translate: (key: string, options?: Record<string, string>) => string;
}

function TierRow({ tier, currency, locale, currentSpending, translate }: TierRowProps) {
  const amountToGo = tier.minSpend - currentSpending;

  return (
    <InlineStack spacing="base" blockAlignment="center">
      <View inlineSize="fill">
        <BlockStack spacing="extraTight">
          <InlineStack spacing="tight" blockAlignment="center">
            <Text size="small" emphasis={tier.isCurrentTier ? 'bold' : undefined}>
              {tier.icon} {tier.name}
            </Text>
            {tier.isCurrentTier && <Badge tone="success">{translate('membership.tiers.current')}</Badge>}
            {tier.isAchieved && !tier.isCurrentTier && <Badge tone="info">{translate('membership.tiers.achieved')}</Badge>}
          </InlineStack>
          <Text size="small" appearance="subdued">
            {tier.minSpend === 0
              ? 'No minimum'
              : translate('membership.tiers.minSpend', { amount: formatCurrency(tier.minSpend, currency, locale) })
            }
          </Text>
        </BlockStack>
      </View>
      <BlockStack spacing="none">
        <Badge>{tier.cashbackPercent}%</Badge>
        {!tier.isAchieved && amountToGo > 0 && (
          <Text size="small" appearance="subdued">
            {translate('membership.tiers.toGo', { amount: formatCurrency(amountToGo, currency, locale) })}
          </Text>
        )}
      </BlockStack>
    </InlineStack>
  );
}

interface AllTiersCardProps {
  tiers: AllTierInfo[];
  currency: string;
  locale: string;
  currentSpending: number;
  translate: (key: string, options?: Record<string, string>) => string;
}

function AllTiersCard({ tiers, currency, locale, currentSpending, translate }: AllTiersCardProps) {
  return (
    <View border="base" cornerRadius="base" padding="base" background="subdued">
      <BlockStack spacing="tight">
        <Text emphasis="bold">{translate('membership.tiers.allTitle')}</Text>
        <Divider />
        {tiers.map((tier) => (
          <TierRow
            key={tier.id}
            tier={tier}
            currency={currency}
            locale={locale}
            currentSpending={currentSpending}
            translate={translate}
          />
        ))}
      </BlockStack>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function MembershipBlock() {
  const translate = useTranslate();
  const language = useLanguage();
  const locale = language.isoCode || 'en-US';

  const { editor } = useExtension();
  const isInEditor = editor?.type === 'checkout';

  const {
    customerId: authCustomerId,
    isAuthenticated: authIsAuthenticated,
  } = useAuthenticatedCustomer();

  const {
    sessionToken,
    customerId: tokenCustomerId,
    isAuthenticated: tokenIsAuthenticated,
    isLoading: tokenLoading,
    decodedToken
  } = useSessionToken();

  const shopDomain = decodedToken?.claims?.dest;

  const apiClient = useApiClient({
    shopDomain: shopDomain,
  });

  const [loyaltyData, setLoyaltyData] = useState<LoyaltyData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllTiers, setShowAllTiers] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const customerId = authCustomerId || tokenCustomerId;
  const isAuthenticated = authIsAuthenticated || tokenIsAuthenticated;
  const isLoading = tokenLoading || dataLoading;

  logger.debug('Component state:', {
    customerId,
    isAuthenticated,
    hasSessionToken: !!sessionToken,
    isLoading,
  });

  const fetchLoyaltyData = useCallback(async (isRefresh = false) => {
    logger.debug('fetchLoyaltyData called', { isAuthenticated, hasSessionToken: !!sessionToken, isInEditor });

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

  useEffect(() => {
    fetchLoyaltyData();
  }, [fetchLoyaltyData]);

  const handleRefresh = useCallback(() => {
    if (!isRefreshing) {
      fetchLoyaltyData(true);
    }
  }, [isRefreshing, fetchLoyaltyData]);

  // ============================================================================
  // Render States
  // ============================================================================

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

  if (isLoading && !loyaltyData) {
    return <MembershipSkeleton />;
  }

  if (error && !loyaltyData) {
    return (
      <Banner tone="critical" title={translate('membership.error.title')}>
        {error}
      </Banner>
    );
  }

  if (loyaltyData && !loyaltyData.enrolled) {
    return (
      <Banner tone="info" title={translate('membership.notEnrolled.title')}>
        {loyaltyData.message || translate('membership.notEnrolled.message')}
      </Banner>
    );
  }

  if (!loyaltyData) {
    return null;
  }

  // ============================================================================
  // Main Enrolled View - New Design
  // ============================================================================

  // Handle both new and legacy API response formats
  const customer = loyaltyData.customer || {
    firstName: null,
    lastName: null,
    memberSince: new Date().toISOString(),
    tags: []
  };

  const balance = typeof loyaltyData.balance === 'object' && 'current' in loyaltyData.balance
    ? loyaltyData.balance
    : { current: loyaltyData.balance as unknown as number || 0, lifetimeEarned: loyaltyData.totalEarned || 0 };

  const progress = loyaltyData.progress || {
    nextTierName: loyaltyData.nextTier?.name || null,
    nextTierCashback: loyaltyData.nextTier?.cashbackPercent || null,
    percent: loyaltyData.progressToNextTier || 0,
    amountRemaining: loyaltyData.amountToNextTier || 0,
    isMaxTier: !loyaltyData.nextTier
  };

  const benefits = loyaltyData.benefits || [];

  return (
    <BlockStack spacing="base">
      {/* Welcome Header */}
      <WelcomeHeader
        customer={customer}
        locale={locale}
        translate={translate}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Preview Banner */}
      {loyaltyData.isPreview && (
        <Banner tone="info">
          {loyaltyData.message || 'Preview mode'}
        </Banner>
      )}

      {/* Membership Status Card */}
      {loyaltyData.tier && (
        <MembershipCard
          tier={loyaltyData.tier}
          benefits={benefits}
          locale={locale}
          translate={translate}
        />
      )}

      {/* Store Credit Balance - Compact */}
      <BalanceCard
        balance={balance}
        currency={loyaltyData.currency}
        locale={locale}
        translate={translate}
      />

      {/* Tier Progress */}
      <ProgressCard
        progress={progress}
        currency={loyaltyData.currency}
        locale={locale}
        translate={translate}
      />

      {/* Recent Activity */}
      {loyaltyData.recentTransactions && (
        <ActivityCard
          transactions={loyaltyData.recentTransactions}
          currency={loyaltyData.currency}
          locale={locale}
          translate={translate}
        />
      )}

      {/* View All Tiers Toggle */}
      {loyaltyData.allTiers && loyaltyData.allTiers.length > 0 && (
        <>
          <Button
            kind="plain"
            onPress={() => setShowAllTiers(!showAllTiers)}
          >
            {showAllTiers
              ? translate('membership.tiers.hide')
              : translate('membership.tiers.viewAll')
            }
          </Button>

          {showAllTiers && (
            <AllTiersCard
              tiers={loyaltyData.allTiers}
              currency={loyaltyData.currency}
              locale={locale}
              currentSpending={loyaltyData.stats.totalSpent}
              translate={translate}
            />
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
