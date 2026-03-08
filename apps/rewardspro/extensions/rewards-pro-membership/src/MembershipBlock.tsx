import { useEffect, useState, useCallback, useMemo } from 'react';
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
  Pressable,
} from '@shopify/ui-extensions-react/customer-account';
import { useSessionToken } from './hooks/useSessionToken';
import { useApiClient } from './hooks/useApiClient';
import { useAuthenticatedCustomer } from './hooks/useAuthenticatedCustomer';
import { useRaffles } from './hooks/useRaffles';
import { useMysteryBoxes } from './hooks/useMysteryBoxes';
import { useChallenges } from './hooks/useChallenges';
import { useMissions } from './hooks/useMissions';
import { logger } from './utils/logger';
import { MAX_TRANSACTIONS_DISPLAY } from './config';
import { PointsSection, type PointsData, RafflesTab, MysteryBoxesTab, ChallengesTab, MissionsTab, UpgradeSection, type UpgradeOptionsInfo } from './components';
import {
  safeBalance,
  safeCustomer,
  safeTier,
  safeProgress,
  safeStats,
  safeMaintenance,
  safePendingCashback,
  safeTierChange,
  safeTransactions,
  safeAllTiers,
  isNewCustomerState,
  isDataStale,
  getDataAgeMinutes,
  safeNumber,
  safeString,
  safeBoolean,
  type SafePendingCashbackInfo,
  type SafeTierChangeInfo,
} from './utils/safeData';

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
  // Countdown fields for dual progress display
  daysRemaining?: number | null;
  expiryType?: 'renewal' | 'expiration' | 'none';
  willAutoRenew?: boolean;
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

interface MaintenanceInfo {
  evaluationPeriod: 'ANNUAL' | 'LIFETIME';
  minSpendToMaintain: number;
  annualSpent: number;
  isSecured: boolean;
  maintenancePercent: number;
  amountToMaintain: number;
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

interface SpendingProgressInfo {
  spendingBasedTierId: string | null;
  spendingBasedTierName: string | null;
  spendingBasedCashback: number | null;
  currentSpending: number;
  nextSpendingTierName: string | null;
  nextSpendingTierMinSpend: number | null;
  progressToNextSpendingTier: number;
  amountToNextSpendingTier: number;
  wouldDowngradeOnExpiry: boolean;
}

interface PendingCashbackInfo {
  amount: number;
  orderCount: number;
  orders: Array<{
    orderName: string;
    amount: number;
    date: string;
  }>;
}

interface TierChangeInfo {
  fromTier: string | null;
  toTier: string | null;
  changeType: 'UPGRADE' | 'DOWNGRADE' | 'LATERAL' | 'INITIAL';
  reason: string;
  changedAt: string;
  daysAgo: number;
}

interface DataFreshnessInfo {
  customerUpdatedAt: string | null;
  tierStateUpdatedAt: string | null;
  progressCalculatedAt: string | null;
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
    totalCashbackEarned?: number;
    annualSpent?: number;
  };
  maintenance?: MaintenanceInfo | null;
  allTiers: AllTierInfo[];
  recentTransactions: TransactionInfo[];
  currency: string;
  message?: string;
  canEnroll?: boolean;
  isPreview?: boolean;
  // Dual progress: spending-based progress for non-spending tier sources
  spendingProgress?: SpendingProgressInfo | null;
  // Edge case handling: new customer, pending cashback, tier changes
  isNewCustomer?: boolean;
  pendingCashback?: PendingCashbackInfo | null;
  recentTierChange?: TierChangeInfo | null;
  // Data freshness metadata
  lastUpdated?: string;
  dataFreshness?: DataFreshnessInfo;
  // Points system data
  points?: PointsData | null;
  // Upgrade options for tier products
  upgradeOptions?: UpgradeOptionsInfo | null;
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
  // Mock data simulates a subscription tier with dual progress display
  const nextBillingDate = new Date(Date.now() + 23 * 24 * 60 * 60 * 1000); // 23 days from now

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
      source: 'TIER_SUBSCRIPTION',
      sourceDetails: {
        type: 'subscription',
        nextBillingDate: nextBillingDate.toISOString(),
        billingInterval: 'MONTHLY',
        daysRemaining: 23,
        expiryType: 'renewal',
        willAutoRenew: true
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
      totalSpent: 420.00,
      lastOrderDate: new Date().toISOString()
    },
    allTiers: [
      { id: '1', name: 'Bronze', icon: '🥉', cashbackPercent: 2, minSpend: 0, isCurrentTier: false, isAchieved: true },
      { id: '2', name: 'Silver', icon: '🥈', cashbackPercent: 3, minSpend: 250, isCurrentTier: false, isAchieved: true },
      { id: '3', name: 'Gold', icon: '⭐', cashbackPercent: 5, minSpend: 500, isCurrentTier: true, isAchieved: false },
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
    // Dual progress: spending-based tier progress (customer has subscription but also building organic tier)
    spendingProgress: {
      spendingBasedTierId: 'mock-tier-silver',
      spendingBasedTierName: 'Silver',
      spendingBasedCashback: 3,
      currentSpending: 420,
      nextSpendingTierName: 'Gold',
      nextSpendingTierMinSpend: 500,
      progressToNextSpendingTier: 68,
      amountToNextSpendingTier: 80,
      wouldDowngradeOnExpiry: true // Customer would drop from Gold (5%) to Silver (3%)
    },
    totalEarned: 125.50,
    progressToNextTier: 65,
    amountToNextTier: 350,
    nextTier: { name: 'Platinum Member', cashbackPercent: 10, minSpend: 1000 },
    // Mock upgrade options
    upgradeOptions: {
      available: true,
      shopDomain: 'preview-store.myshopify.com',
      products: [
        {
          id: 'mock-upgrade-1',
          tierName: 'Platinum Member',
          tierCashback: 10,
          tierIcon: '💎',
          tierColor: '#E5E4E2',
          productHandle: 'platinum-membership-monthly',
          productUrl: 'https://preview-store.myshopify.com/products/platinum-membership-monthly',
          duration: 'MONTHLY' as const,
          price: 9.99,
          currency: 'USD',
        },
        {
          id: 'mock-upgrade-2',
          tierName: 'Platinum Member',
          tierCashback: 10,
          tierIcon: '💎',
          tierColor: '#E5E4E2',
          productHandle: 'platinum-membership-annual',
          productUrl: 'https://preview-store.myshopify.com/products/platinum-membership-annual',
          duration: 'ANNUAL' as const,
          price: 99.99,
          currency: 'USD',
        },
      ],
      message: 'Upgrade to Platinum Member for 10% cashback!',
    },
    // Mock points data
    points: {
      enabled: true,
      balance: {
        available: 1250,
        lifetime: 3500,
        expiringSoon: { amount: 200, expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() },
      },
      currency: {
        name: 'Star',
        plural: 'Stars',
        icon: '',
      },
      config: {
        pointsPerDollar: 10,
        tierMultiplier: 1.5,
      },
      activeBonus: {
        hasBonus: true,
        multiplier: 2,
        eventNames: ['Double Stars Weekend'],
        endsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      streak: {
        current: 5,
        bonusMultiplier: 1.25,
      },
      recentTransactions: [
        { id: 'pt-1', type: 'ORDER_POINTS', amount: 150, date: new Date().toISOString(), description: 'Order #1234' },
        { id: 'pt-2', type: 'STREAK_BONUS', amount: 50, date: new Date(Date.now() - 86400000).toISOString(), description: '5-day streak bonus' },
        { id: 'pt-3', type: 'REDEMPTION', amount: -500, date: new Date(Date.now() - 172800000).toISOString(), description: 'Redeemed $5 discount' },
      ],
    }
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
  // Handle NaN/undefined safely
  const safeProgress = Number.isFinite(progress) ? progress : 0;

  // Clamp to 0-100 range
  const clampedProgress = Math.min(100, Math.max(0, safeProgress));

  // Visual minimum for non-zero values (3% ensures visibility)
  const visualProgress = clampedProgress === 0
    ? 0
    : clampedProgress === 100
      ? 100
      : Math.max(3, Math.min(97, clampedProgress)); // Avoid looking "complete" when it's not

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
        inlineSize={`${visualProgress}%`}
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
      <BlockStack spacing="extraTight">
        <Text size="small" appearance="subdued">
          {translate('membership.balance.available')}
        </Text>
        <Text size="large" emphasis="bold">
          {formatCurrency(balance.current, currency, locale)}
        </Text>
      </BlockStack>
    </View>
  );
}

interface BalanceCardWithPendingProps extends BalanceCardProps {
  pendingCashback?: PendingCashbackInfo | null;
}

function BalanceCardWithPending({ balance, currency, locale, translate, pendingCashback }: BalanceCardWithPendingProps) {
  const hasPending = pendingCashback && pendingCashback.amount > 0;
  const justRedeemed = balance.current === 0 && balance.lifetimeEarned > 0;

  return (
    <View border="base" cornerRadius="base" padding="base" background="base">
      <BlockStack spacing="tight">
        {/* Current Balance */}
        <BlockStack spacing="extraTight">
          <Text size="small" appearance="subdued">
            {translate('membership.balance.available')}
          </Text>
          <Text size="large" emphasis="bold">
            {formatCurrency(balance.current, currency, locale)}
          </Text>
        </BlockStack>

        {/* Post-redemption encouragement - when balance is $0 but has earned before */}
        {justRedeemed && !hasPending && (
          <>
            <Divider />
            <InlineStack spacing="tight" blockAlignment="center">
              <Text size="small" appearance="success">✓</Text>
              <Text size="small">
                {translate('membership.balance.saved', {
                  amount: formatCurrency(balance.lifetimeEarned, currency, locale)
                })}
              </Text>
            </InlineStack>
          </>
        )}

        {/* Pending Cashback */}
        {hasPending && (
          <>
            <Divider />
            <InlineStack spacing="tight" blockAlignment="center">
              <Icon source="clock" size="small" appearance="subdued" />
              <View inlineSize="fill">
                <Text size="small" appearance="subdued">
                  {translate('membership.balance.pending', {
                    amount: formatCurrency(pendingCashback.amount, currency, locale)
                  })}
                </Text>
              </View>
            </InlineStack>
            {pendingCashback.orderCount > 0 && (
              <Text size="small" appearance="subdued">
                {pendingCashback.orderCount === 1
                  ? translate('membership.balance.pendingOrderSingle')
                  : translate('membership.balance.pendingOrders', {
                      count: String(pendingCashback.orderCount)
                    })
                }
              </Text>
            )}
          </>
        )}
      </BlockStack>
    </View>
  );
}

interface WelcomeCardProps {
  customer: CustomerInfo;
  tier: TierInfo | null;
  currency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

function WelcomeCard({ customer, tier, currency, locale, translate }: WelcomeCardProps) {
  const displayName = customer.firstName || null;

  return (
    <View border="base" cornerRadius="base" padding="base" background="subdued">
      <BlockStack spacing="base">
        {/* Welcome Message */}
        <BlockStack spacing="tight">
          <Text size="large" emphasis="bold">
            {translate('membership.welcome.newMember')}
          </Text>
          <Text size="small">
            {displayName
              ? translate('membership.welcome.newMemberMessage', { name: displayName })
              : translate('membership.welcome.newMemberMessageGeneric')
            }
          </Text>
        </BlockStack>

        <Divider />

        {/* How it Works */}
        <BlockStack spacing="tight">
          <Text size="small" emphasis="bold">
            {translate('membership.welcome.howItWorks')}
          </Text>
          <InlineStack spacing="tight" blockAlignment="start">
            <Text size="small">1.</Text>
            <Text size="small">{translate('membership.welcome.step1')}</Text>
          </InlineStack>
          <InlineStack spacing="tight" blockAlignment="start">
            <Text size="small">2.</Text>
            <Text size="small">{translate('membership.welcome.step2')}</Text>
          </InlineStack>
          <InlineStack spacing="tight" blockAlignment="start">
            <Text size="small">3.</Text>
            <Text size="small">{translate('membership.welcome.step3')}</Text>
          </InlineStack>
        </BlockStack>

        {/* Current Tier Info */}
        {tier && (
          <>
            <Divider />
            <InlineStack spacing="tight" blockAlignment="center">
              <Text size="small">{tier.icon}</Text>
              <Text size="small">
                {translate('membership.welcome.currentRate', {
                  tierName: tier.name,
                  percent: String(tier.cashbackPercent)
                })}
              </Text>
            </InlineStack>
          </>
        )}
      </BlockStack>
    </View>
  );
}

interface TierChangeBannerProps {
  tierChange: TierChangeInfo;
  translate: (key: string, options?: Record<string, string>) => string;
}

function TierChangeBanner({ tierChange, translate }: TierChangeBannerProps) {
  const isUpgrade = tierChange.changeType === 'UPGRADE';
  const isDowngrade = tierChange.changeType === 'DOWNGRADE';
  const isInitial = tierChange.changeType === 'INITIAL';

  // Skip if too old (API should filter, but double-check)
  if (tierChange.daysAgo > 7) return null;

  // Initial tier assignment - show welcome style
  if (isInitial && tierChange.toTier) {
    return (
      <Banner tone="info" title={translate('membership.tierChange.welcome')}>
        {translate('membership.tierChange.welcomeMessage', {
          tierName: tierChange.toTier
        })}
      </Banner>
    );
  }

  // Upgrade celebration
  if (isUpgrade && tierChange.toTier) {
    return (
      <Banner tone="success" title={translate('membership.tierChange.upgraded')}>
        {tierChange.fromTier
          ? translate('membership.tierChange.upgradedFrom', {
              fromTier: tierChange.fromTier,
              toTier: tierChange.toTier
            })
          : translate('membership.tierChange.upgradedTo', {
              tierName: tierChange.toTier
            })
        }
      </Banner>
    );
  }

  // Downgrade notice
  if (isDowngrade && tierChange.toTier) {
    return (
      <Banner tone="warning" title={translate('membership.tierChange.statusChanged')}>
        {tierChange.fromTier
          ? translate('membership.tierChange.downgraded', {
              fromTier: tierChange.fromTier,
              toTier: tierChange.toTier
            })
          : translate('membership.tierChange.changedTo', {
              tierName: tierChange.toTier
            })
        }
      </Banner>
    );
  }

  return null;
}

interface StaleDataBannerProps {
  lastUpdated?: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

function StaleDataBanner({ lastUpdated, translate }: StaleDataBannerProps) {
  // Only show if data is stale (> 15 minutes old)
  if (!lastUpdated || !isDataStale(lastUpdated, 15 * 60 * 1000)) {
    return null;
  }

  const ageMinutes = getDataAgeMinutes(lastUpdated);
  const displayTime = ageMinutes >= 60
    ? translate('membership.data.hoursAgo', { hours: String(Math.floor(ageMinutes / 60)) })
    : translate('membership.data.minutesAgo', { minutes: String(ageMinutes) });

  return (
    <Banner tone="warning">
      {translate('membership.data.stale', { time: displayTime })}
    </Banner>
  );
}

interface StarterTierCardProps {
  tier: TierInfo;
  progress: ProgressInfo;
  currency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

function StarterTierCard({ tier, progress, currency, locale, translate }: StarterTierCardProps) {
  return (
    <View border="base" cornerRadius="base" padding="base" background="base">
      <BlockStack spacing="base">
        {/* Header */}
        <BlockStack spacing="tight">
          <Text size="large" emphasis="bold">
            {translate('membership.starterTier.title')}
          </Text>
          <Text size="small">
            {translate('membership.starterTier.message', {
              amount: formatCurrency(progress.amountRemaining, currency, locale),
              percent: String(progress.nextTierCashback || 0)
            })}
          </Text>
        </BlockStack>

        {/* Progress to first cashback tier */}
        <TierProgressBar progress={progress.percent} />

        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="small" appearance="subdued">
            {translate('membership.progress.percentComplete', {
              percent: String(Math.round(progress.percent))
            })}
          </Text>
          {progress.nextTierName && (
            <>
              <Text size="small" appearance="subdued">•</Text>
              <Text size="small" appearance="subdued">
                {translate('membership.starterTier.nextTier', {
                  tierName: progress.nextTierName
                })}
              </Text>
            </>
          )}
        </InlineStack>
      </BlockStack>
    </View>
  );
}

interface ProgressCardProps {
  progress: ProgressInfo;
  currency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
  maintenance?: MaintenanceInfo | null;
}

function ProgressCard({ progress, currency, locale, translate, maintenance }: ProgressCardProps) {
  // Max tier is now handled by MaxTierCard component
  if (progress.isMaxTier) {
    return null;
  }

  // Calculate days until year end for annual evaluation warning
  const getDaysUntilYearEnd = (): number => {
    const now = new Date();
    const yearEnd = new Date(now.getFullYear(), 11, 31);
    return Math.ceil((yearEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const showEvaluationWarning =
    maintenance?.evaluationPeriod === 'ANNUAL' &&
    getDaysUntilYearEnd() <= 60;

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
          {translate('membership.progress.percentComplete', {
            percent: String(Math.round(progress.percent))
          })}
        </Text>

        {/* Annual evaluation countdown warning */}
        {showEvaluationWarning && (
          <>
            <Divider />
            <InlineStack spacing="tight" blockAlignment="center">
              <Icon source="calendar" size="small" appearance="warning" />
              <Text size="small" appearance="warning">
                {translate('membership.evaluation.warning', {
                  days: String(getDaysUntilYearEnd())
                })}
              </Text>
            </InlineStack>
          </>
        )}
      </BlockStack>
    </View>
  );
}

interface MaxTierCardProps {
  tier: TierInfo;
  stats: {
    orderCount: number;
    totalSpent: number;
    totalCashbackEarned?: number;
  };
  maintenance?: MaintenanceInfo | null;
  currency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

function MaxTierCard({ tier, stats, maintenance, currency, locale, translate }: MaxTierCardProps) {
  const showMaintenanceProgress =
    maintenance?.evaluationPeriod === 'ANNUAL' && !maintenance.isSecured;

  return (
    <View border="base" cornerRadius="base" padding="base" background="subdued">
      <BlockStack spacing="base">
        {/* Header */}
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="large" emphasis="bold">
            {tier.icon} {tier.name}
          </Text>
          <Badge tone="success">{translate('membership.maxTier.topTier')}</Badge>
        </InlineStack>

        <Divider />

        {/* Value Stats */}
        <BlockStack spacing="tight">
          <Text size="small" emphasis="bold">
            {translate('membership.maxTier.rewardsSummary')}
          </Text>

          <InlineStack spacing="base">
            <View inlineSize="fill">
              <BlockStack spacing="extraTight">
                <Text size="small" appearance="subdued">
                  {translate('membership.maxTier.cashbackEarned')}
                </Text>
                <Text size="medium" emphasis="bold">
                  {formatCurrency(stats.totalCashbackEarned || 0, currency, locale)}
                </Text>
              </BlockStack>
            </View>
            <View inlineSize="fill">
              <BlockStack spacing="extraTight">
                <Text size="small" appearance="subdued">
                  {translate('membership.maxTier.ordersPlaced')}
                </Text>
                <Text size="medium" emphasis="bold">
                  {stats.orderCount}
                </Text>
              </BlockStack>
            </View>
          </InlineStack>
        </BlockStack>

        {/* Maintenance Progress (Annual evaluation, not yet secured) */}
        {showMaintenanceProgress && maintenance && (
          <>
            <Divider />
            <BlockStack spacing="tight">
              <InlineStack spacing="tight" blockAlignment="center">
                <Text size="small" emphasis="bold">
                  {translate('membership.maxTier.maintainStatus')}
                </Text>
              </InlineStack>
              <TierProgressBar progress={maintenance.maintenancePercent} />
              <Text size="small" appearance="subdued">
                {translate('membership.maxTier.spendMoreToKeep', {
                  amount: formatCurrency(maintenance.amountToMaintain, currency, locale),
                  tierName: tier.name
                })}
              </Text>
            </BlockStack>
          </>
        )}

        {/* Status Secured (Annual evaluation, already secured) */}
        {maintenance?.evaluationPeriod === 'ANNUAL' && maintenance.isSecured && (
          <>
            <Divider />
            <InlineStack spacing="tight" blockAlignment="center">
              <Text size="small" appearance="success">✓</Text>
              <Text size="small">
                {translate('membership.maxTier.statusSecured', { tierName: tier.name })}
              </Text>
            </InlineStack>
          </>
        )}

        {/* Current Cashback Rate */}
        <BlockStack spacing="extraTight">
          <InlineStack spacing="tight" blockAlignment="center">
            <Text size="small" appearance="success">⭐</Text>
            <Text size="small">
              {translate('membership.maxTier.currentRate', {
                percent: String(tier.cashbackPercent)
              })}
            </Text>
          </InlineStack>
        </BlockStack>
      </BlockStack>
    </View>
  );
}

interface DualProgressCardProps {
  tier: TierInfo;
  spendingProgress: SpendingProgressInfo;
  currency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

function DualProgressCard({
  tier,
  spendingProgress,
  currency,
  locale,
  translate
}: DualProgressCardProps) {
  const sourceDetails = tier.sourceDetails;
  const sourceType = sourceDetails?.type;
  const daysRemaining = sourceDetails?.daysRemaining;

  // Helper to get countdown text
  const getCountdownText = () => {
    if (daysRemaining === null || daysRemaining === undefined) return null;

    if (sourceType === 'subscription') {
      if (daysRemaining === 1) {
        return translate('membership.dualProgress.renewsInOne');
      }
      return translate('membership.dualProgress.renewsIn', { days: String(daysRemaining) });
    }

    // For purchase or manual with expiration
    if (daysRemaining === 1) {
      return translate('membership.dualProgress.endsInOne');
    }
    return translate('membership.dualProgress.endsIn', { days: String(daysRemaining) });
  };

  // Helper to get date text
  const getDateText = () => {
    if (sourceType === 'subscription' && sourceDetails?.nextBillingDate) {
      return translate('membership.dualProgress.nextBilling', {
        date: formatDate(sourceDetails.nextBillingDate, locale)
      });
    }
    if ((sourceType === 'purchase' || sourceType === 'manual') && sourceDetails?.expiresAt) {
      return translate('membership.dualProgress.expiresOn', {
        date: formatDate(sourceDetails.expiresAt, locale)
      });
    }
    return null;
  };

  const countdownText = getCountdownText();
  const dateText = getDateText();
  const isLifetime = sourceType === 'purchase' && sourceDetails?.isLifetime;
  const isManualNoExpiry = sourceType === 'manual' && !sourceDetails?.expiresAt;

  return (
    <BlockStack spacing="tight">
      {/* Primary: Current Tier Status */}
      <View border="base" cornerRadius="base" padding="base" background="base">
        <BlockStack spacing="tight">
          <Text size="small" emphasis="bold">
            {translate('membership.dualProgress.currentStatus')}
          </Text>

          {/* Lifetime Purchase */}
          {isLifetime && (
            <InlineStack spacing="tight" blockAlignment="center">
              <Text size="small" appearance="success">✓</Text>
              <Text size="small">
                {translate('membership.dualProgress.lifetimeAccess')}
              </Text>
            </InlineStack>
          )}

          {/* Manual Override without expiry */}
          {isManualNoExpiry && (
            <InlineStack spacing="tight" blockAlignment="center">
              <Text size="small" appearance="success">✓</Text>
              <Text size="small">
                {translate('membership.dualProgress.specialAccess')}
              </Text>
            </InlineStack>
          )}

          {/* Countdown for subscription/expiring tiers */}
          {!isLifetime && !isManualNoExpiry && countdownText && (
            <>
              <InlineStack spacing="tight" blockAlignment="center">
                <Text size="small">{countdownText}</Text>
              </InlineStack>
              {dateText && (
                <Text size="small" appearance="subdued">{dateText}</Text>
              )}
            </>
          )}
        </BlockStack>
      </View>

      {/* Secondary: Spending Progress - only show if not lifetime */}
      {!isLifetime && (
        <View border="base" cornerRadius="base" padding="base" background="subdued">
          <BlockStack spacing="tight">
            <InlineStack spacing="base" blockAlignment="center">
              <View inlineSize="fill">
                <Text size="small" emphasis="bold">
                  {translate('membership.dualProgress.spendingProgress')}
                </Text>
              </View>
              {spendingProgress.wouldDowngradeOnExpiry && (
                <Badge tone="warning">
                  {translate('membership.dualProgress.buildingTowards')}
                </Badge>
              )}
            </InlineStack>

            {/* Spending-based tier status */}
            <Text size="small">
              {spendingProgress.spendingBasedTierName
                ? translate('membership.dualProgress.qualifiesFor', {
                    tierName: spendingProgress.spendingBasedTierName,
                    percent: String(spendingProgress.spendingBasedCashback || 0)
                  })
                : translate('membership.dualProgress.noSpendingTier')
              }
            </Text>

            {/* Progress bar to next spending tier */}
            {spendingProgress.nextSpendingTierName && (
              <>
                <TierProgressBar progress={spendingProgress.progressToNextSpendingTier} height={6} />
                <Text size="small" appearance="subdued">
                  {translate('membership.dualProgress.spendMore', {
                    amount: formatCurrency(spendingProgress.amountToNextSpendingTier, currency, locale),
                    tierName: spendingProgress.nextSpendingTierName
                  })}
                </Text>
              </>
            )}

            {/* Max spending tier reached */}
            {!spendingProgress.nextSpendingTierName && spendingProgress.spendingBasedTierName && (
              <Text size="small" appearance="success">
                {translate('membership.dualProgress.maxSpendingTier')}
              </Text>
            )}

            <Text size="small" appearance="subdued">
              {translate('membership.dualProgress.totalSpent', {
                amount: formatCurrency(spendingProgress.currentSpending, currency, locale)
              })}
            </Text>
          </BlockStack>
        </View>
      )}
    </BlockStack>
  );
}

// ============================================================================
// Activity Card Variations
// ============================================================================

type ActivityVariant = 'compact' | 'timeline' | 'cards';

interface TransactionRowProps {
  transaction: TransactionInfo;
  currency: string;
  locale: string;
}

// Get emoji icon based on transaction type
function getTransactionIcon(type: string): string {
  switch (type) {
    case 'CASHBACK_EARNED':
      return '💰';
    case 'ORDER_PAYMENT':
      return '🛒';
    case 'REFUND_CREDIT':
      return '↩️';
    case 'MANUAL_ADJUSTMENT':
      return '✏️';
    case 'BONUS':
      return '🎁';
    default:
      return '📝';
  }
}

// ----------------------------------------------------------------------------
// VARIATION 1: Compact List (with icons)
// ----------------------------------------------------------------------------
function TransactionRowCompact({ transaction, currency, locale }: TransactionRowProps) {
  const isPositive = transaction.amount > 0;
  const formattedAmount = formatCurrency(Math.abs(transaction.amount), currency, locale);
  const formattedDate = formatDate(transaction.date, locale);
  const icon = getTransactionIcon(transaction.type);

  return (
    <InlineStack spacing="tight" blockAlignment="center">
      <Text size="small">{icon}</Text>
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

// ----------------------------------------------------------------------------
// VARIATION 2: Timeline Style
// ----------------------------------------------------------------------------
function TransactionRowTimeline({ transaction, currency, locale }: TransactionRowProps) {
  const isPositive = transaction.amount > 0;
  const formattedAmount = formatCurrency(Math.abs(transaction.amount), currency, locale);
  const formattedDate = formatDate(transaction.date, locale);

  return (
    <InlineStack spacing="tight" blockAlignment="start">
      {/* Timeline dot and line */}
      <View>
        <BlockStack spacing="none">
          <View
            background={isPositive ? 'interactive' : 'subdued'}
            cornerRadius="fullyRounded"
            minBlockSize={12}
            maxBlockSize={12}
            minInlineSize={12}
            maxInlineSize={12}
          />
        </BlockStack>
      </View>
      {/* Content */}
      <View inlineSize="fill">
        <BlockStack spacing="extraTight">
          <InlineStack spacing="base" blockAlignment="center">
            <View inlineSize="fill">
              <Text size="small" emphasis="bold">
                {isPositive ? '+' : '-'}{formattedAmount}
              </Text>
            </View>
            <Text size="small" appearance="subdued">{formattedDate}</Text>
          </InlineStack>
          <Text size="small" appearance="subdued">{transaction.description}</Text>
        </BlockStack>
      </View>
    </InlineStack>
  );
}

// ----------------------------------------------------------------------------
// VARIATION 3: Mini Cards
// ----------------------------------------------------------------------------
function TransactionRowCard({ transaction, currency, locale }: TransactionRowProps) {
  const isPositive = transaction.amount > 0;
  const formattedAmount = formatCurrency(Math.abs(transaction.amount), currency, locale);
  const formattedDate = formatDate(transaction.date, locale);
  const icon = getTransactionIcon(transaction.type);

  return (
    <View
      border="base"
      cornerRadius="base"
      padding="tight"
      background={isPositive ? 'subdued' : 'base'}
    >
      <InlineStack spacing="tight" blockAlignment="center">
        <View
          background={isPositive ? 'interactive' : 'subdued'}
          cornerRadius="base"
          padding="extraTight"
          minInlineSize={32}
          maxInlineSize={32}
          minBlockSize={32}
          maxBlockSize={32}
        >
          <Text size="medium">{icon}</Text>
        </View>
        <View inlineSize="fill">
          <BlockStack spacing="none">
            <Text size="small" emphasis="bold">
              {isPositive ? '+' : '-'}{formattedAmount}
            </Text>
            <Text size="small" appearance="subdued">
              {transaction.description}
            </Text>
          </BlockStack>
        </View>
        <Text size="small" appearance="subdued">{formattedDate}</Text>
      </InlineStack>
    </View>
  );
}

interface ActivityCardProps {
  transactions: TransactionInfo[];
  currency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
  variant?: ActivityVariant;
}

function ActivityCard({
  transactions,
  currency,
  locale,
  translate,
  variant = 'compact'  // Default to compact style
}: ActivityCardProps) {
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

  const displayTransactions = transactions.slice(0, MAX_TRANSACTIONS_DISPLAY);

  // Render based on variant
  const renderTransactions = () => {
    switch (variant) {
      case 'timeline':
        return (
          <BlockStack spacing="base">
            {displayTransactions.map((tx) => (
              <TransactionRowTimeline
                key={tx.id}
                transaction={tx}
                currency={currency}
                locale={locale}
              />
            ))}
          </BlockStack>
        );

      case 'cards':
        return (
          <BlockStack spacing="tight">
            {displayTransactions.map((tx) => (
              <TransactionRowCard
                key={tx.id}
                transaction={tx}
                currency={currency}
                locale={locale}
              />
            ))}
          </BlockStack>
        );

      case 'compact':
      default:
        return (
          <BlockStack spacing="tight">
            {displayTransactions.map((tx) => (
              <TransactionRowCompact
                key={tx.id}
                transaction={tx}
                currency={currency}
                locale={locale}
              />
            ))}
          </BlockStack>
        );
    }
  };

  return (
    <View border="base" cornerRadius="base" padding="base" background="base">
      <BlockStack spacing="base">
        <Text emphasis="bold">{translate('membership.transactions.title')}</Text>
        <Divider />
        {renderTransactions()}
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
              ? translate('membership.tiers.noMinimum')
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
// Tab Navigation Component
// ============================================================================

type TabId = 'membership' | 'raffles' | 'boxes' | 'challenges' | 'missions';

interface TabInfo {
  id: TabId;
  icon: string;
  labelKey: string;
  badge?: number;
}

interface TabNavigationProps {
  tabs: TabInfo[];
  activeTab: TabId;
  onTabChange: (tabId: TabId) => void;
  translate: (key: string, options?: Record<string, string>) => string;
}

function TabNavigation({ tabs, activeTab, onTabChange, translate }: TabNavigationProps) {
  return (
    <View border="base" cornerRadius="base" padding="tight" background="subdued">
      <InlineStack spacing="tight" blockAlignment="center">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onTabChange(tab.id)}
            >
              <View
                padding="tight"
                cornerRadius="base"
                background={isActive ? 'base' : undefined}
                border={isActive ? 'base' : undefined}
              >
                <InlineStack spacing="extraTight" blockAlignment="center">
                  <Text size="small">{tab.icon}</Text>
                  <Text
                    size="small"
                    emphasis={isActive ? 'bold' : undefined}
                  >
                    {translate(tab.labelKey)}
                  </Text>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <Badge tone="info">{tab.badge}</Badge>
                  )}
                </InlineStack>
              </View>
            </Pressable>
          );
        })}
      </InlineStack>
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
  const [activeTab, setActiveTab] = useState<TabId>('membership');

  // Rewards Activity Hooks
  const {
    raffles,
    isEnabled: rafflesEnabled,
    isLoading: rafflesLoading,
    error: rafflesError,
    pointsBalance: rafflesPointsBalance,
    config: rafflesConfig,
    history: rafflesHistory,
    historyLoading: rafflesHistoryLoading,
    // Psychology data
    streak: raffleStreak,
    activities: raffleActivities,
    bonusEvents: raffleBonusEvents,
    bestBonusEvent: raffleBestBonusEvent,
    psychologyLoading: rafflePsychologyLoading,
    lastPurchaseResult: raffleLastPurchaseResult,
    clearPurchaseResult: raffleClearPurchaseResult,
    isClaimingFreeEntry: raffleIsClaimingFreeEntry,
    // Actions
    fetchRaffles,
    fetchHistory: fetchRafflesHistory,
    purchaseEntries,
    fetchPsychology: fetchRafflePsychology,
    claimFreeEntry: raffleClaimFreeEntry,
  } = useRaffles({ shopDomain });

  const {
    boxes,
    isEnabled: boxesEnabled,
    isLoading: boxesLoading,
    error: boxesError,
    pointsBalance: boxesPointsBalance,
    config: boxesConfig,
    history: boxesHistory,
    historyLoading: boxesHistoryLoading,
    fetchBoxes,
    fetchHistory: fetchBoxesHistory,
    openBox,
  } = useMysteryBoxes({ shopDomain });

  const {
    challenges,
    isEnabled: challengesEnabled,
    isLoading: challengesLoading,
    error: challengesError,
    pointsBalance: challengesPointsBalance,
    config: challengesConfig,
    message: challengesMessage,
    history: challengesHistory,
    historyLoading: challengesHistoryLoading,
    fetchChallenges,
    fetchHistory: fetchChallengesHistory,
    claimReward,
  } = useChallenges({ shopDomain });

  const {
    player: missionsPlayer,
    missions: missionsData,
    pendingEvents: missionsPendingEvents,
    config: missionsConfig,
    isEnabled: missionsEnabled,
    isLoading: missionsLoading,
    error: missionsError,
    message: missionsMessage,
    fetchMissions,
    claimReward: claimMissionReward,
    acknowledgeEvents: acknowledgeMissionEvents,
  } = useMissions({ shopDomain });

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

  // Fetch activity data when authenticated
  useEffect(() => {
    if (isAuthenticated && sessionToken && !isInEditor) {
      // Fetch all activity data in parallel
      fetchRaffles(sessionToken);
      fetchRafflePsychology(sessionToken);
      fetchBoxes(sessionToken);
      fetchChallenges(sessionToken);
      fetchMissions(sessionToken);
    }
  }, [isAuthenticated, sessionToken, isInEditor, fetchRaffles, fetchRafflePsychology, fetchBoxes, fetchChallenges, fetchMissions]);

  const handleRefresh = useCallback(() => {
    if (!isRefreshing) {
      fetchLoyaltyData(true);
    }
  }, [isRefreshing, fetchLoyaltyData]);

  // Points redemption API client (separate base URL for points endpoint)
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

  // Detect new customer state using safe utilities
  const safeStatsData = safeStats(loyaltyData.stats);
  const safeBalanceData = safeBalance(loyaltyData.balance);
  const isNewCustomer = isNewCustomerState(safeStatsData, safeBalanceData, loyaltyData.isNewCustomer);

  // Get tier change info if available
  const tierChange = loyaltyData.recentTierChange;

  // Edge case detection
  const isSingleTierProgram = (loyaltyData.allTiers?.length ?? 0) === 1;
  const isZeroCashbackTier = loyaltyData.tier?.cashbackPercent === 0 && !progress.isMaxTier;
  const hasHigherTiers = loyaltyData.allTiers?.some(t => t.cashbackPercent > 0) ?? false;

  // Tab configuration - only show tabs for enabled features with data
  const hasActivities = rafflesEnabled || boxesEnabled || challengesEnabled || missionsEnabled;
  const tabs: TabInfo[] = [
    { id: 'membership', icon: '⭐', labelKey: 'tabs.membership' },
    ...(rafflesEnabled ? [{ id: 'raffles' as TabId, icon: '🎟️', labelKey: 'tabs.raffles', badge: raffles.filter(r => r.status === 'ACTIVE').length }] : []),
    ...(boxesEnabled ? [{ id: 'boxes' as TabId, icon: '🎁', labelKey: 'tabs.boxes', badge: boxes.filter(b => b.status === 'ACTIVE').length }] : []),
    ...(challengesEnabled ? [{ id: 'challenges' as TabId, icon: '🏆', labelKey: 'tabs.challenges', badge: challenges.filter(c => c.status === 'ACTIVE' || c.status === 'COMPLETED').length }] : []),
    ...(missionsEnabled ? [{ id: 'missions' as TabId, icon: '🎯', labelKey: 'tabs.missions', badge: (missionsData.daily.length + missionsData.weekly.length + missionsData.monthly.length + missionsData.special.length) }] : []),
  ];

  // Handler for tab change
  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
  }, []);

  // Handler callbacks for activities
  const handlePurchaseEntries = useCallback(async (raffleId: string, quantity: number) => {
    if (!sessionToken) return { success: false, error: 'Not authenticated' };
    return purchaseEntries(sessionToken, raffleId, quantity);
  }, [sessionToken, purchaseEntries]);

  const handleClaimFreeEntry = useCallback(async (raffleId: string) => {
    if (!sessionToken) return { success: false, error: 'Not authenticated' };
    return raffleClaimFreeEntry(sessionToken, raffleId);
  }, [sessionToken, raffleClaimFreeEntry]);

  const handleOpenBox = useCallback(async (boxId: string) => {
    if (!sessionToken) return { success: false, error: 'Not authenticated' };
    return openBox(sessionToken, boxId);
  }, [sessionToken, openBox]);

  const handleClaimReward = useCallback(async (challengeId: string) => {
    if (!sessionToken) return { success: false, error: 'Not authenticated' };
    return claimReward(sessionToken, challengeId);
  }, [sessionToken, claimReward]);

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

      {/* Tab Navigation - only show if there are activities */}
      {hasActivities && tabs.length > 1 && (
        <TabNavigation
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          translate={translate}
        />
      )}

      {/* Tab Content */}
      {activeTab === 'raffles' && rafflesEnabled && (
        <RafflesTab
          raffles={raffles}
          isLoading={rafflesLoading}
          error={rafflesError}
          pointsBalance={rafflesPointsBalance}
          config={rafflesConfig}
          history={rafflesHistory}
          historyLoading={rafflesHistoryLoading}
          onPurchaseEntries={handlePurchaseEntries}
          onFetchHistory={() => sessionToken && fetchRafflesHistory(sessionToken)}
          streak={raffleStreak}
          activities={raffleActivities}
          bonusEvents={raffleBonusEvents}
          bestBonusEvent={raffleBestBonusEvent}
          psychologyLoading={rafflePsychologyLoading}
          lastPurchaseResult={raffleLastPurchaseResult}
          onClearPurchaseResult={raffleClearPurchaseResult}
          onClaimFreeEntry={handleClaimFreeEntry}
          isClaimingFreeEntry={raffleIsClaimingFreeEntry}
          translate={translate}
          locale={locale}
        />
      )}

      {activeTab === 'boxes' && boxesEnabled && (
        <MysteryBoxesTab
          boxes={boxes}
          isLoading={boxesLoading}
          error={boxesError}
          pointsBalance={boxesPointsBalance}
          config={boxesConfig}
          history={boxesHistory}
          historyLoading={boxesHistoryLoading}
          onOpenBox={handleOpenBox}
          onFetchHistory={() => sessionToken && fetchBoxesHistory(sessionToken)}
          translate={translate}
          locale={locale}
        />
      )}

      {activeTab === 'challenges' && challengesEnabled && (
        <ChallengesTab
          challenges={challenges}
          isLoading={challengesLoading}
          error={challengesError}
          pointsBalance={challengesPointsBalance}
          config={challengesConfig}
          message={challengesMessage}
          history={challengesHistory}
          historyLoading={challengesHistoryLoading}
          onClaimReward={handleClaimReward}
          onFetchHistory={() => sessionToken && fetchChallengesHistory(sessionToken)}
          translate={translate}
          locale={locale}
        />
      )}

      {activeTab === 'missions' && missionsEnabled && (
        <MissionsTab
          player={missionsPlayer}
          missions={missionsData}
          pendingEvents={missionsPendingEvents}
          isLoading={missionsLoading}
          error={missionsError}
          config={missionsConfig}
          message={missionsMessage}
          onClaimReward={async (missionId: string) => {
            if (!sessionToken) return { success: false, error: 'Not authenticated' };
            return claimMissionReward(sessionToken, missionId);
          }}
          onAcknowledgeEvents={async (eventIds: string[]) => {
            if (!sessionToken) return;
            return acknowledgeMissionEvents(sessionToken, eventIds);
          }}
          translate={translate}
        />
      )}

      {/* Membership Tab Content */}
      {activeTab === 'membership' && (
        <>
          {/* Preview Banner */}
          {loyaltyData.isPreview && (
            <Banner tone="info">
              {loyaltyData.message || translate('membership.preview.mode')}
            </Banner>
          )}

          {/* Stale Data Warning - when data is older than 15 minutes */}
          <StaleDataBanner
            lastUpdated={loyaltyData.lastUpdated}
            translate={translate}
          />

          {/* Tier Change Banner - Show upgrade/downgrade celebrations */}
          {tierChange && !isNewCustomer && (
            <TierChangeBanner
              tierChange={tierChange}
              translate={translate}
            />
          )}

          {/* New Customer Welcome Card */}
          {isNewCustomer ? (
            <WelcomeCard
              customer={customer}
              tier={loyaltyData.tier}
              currency={loyaltyData.currency}
              locale={locale}
              translate={translate}
            />
          ) : (
            /* Membership Status Card - for existing customers */
            loyaltyData.tier && (
              <MembershipCard
                tier={loyaltyData.tier}
                benefits={benefits}
                locale={locale}
                translate={translate}
              />
            )
          )}

          {/* Store Credit Balance - with pending cashback */}
          <BalanceCardWithPending
            balance={balance}
            currency={loyaltyData.currency}
            locale={locale}
            translate={translate}
            pendingCashback={loyaltyData.pendingCashback}
          />

          {/* Points Section - Reward Points engagement system */}
          {loyaltyData.points?.enabled && (
            <PointsSection
              points={loyaltyData.points}
              shopCurrency={loyaltyData.currency}
              locale={locale}
              translate={translate}
            />
          )}

          {/* Tier Progress - Different displays based on tier status and source */}
          {progress.isMaxTier && loyaltyData.tier ? (
            /* Max tier - show value reinforcement */
            <MaxTierCard
              tier={loyaltyData.tier}
              stats={loyaltyData.stats}
              maintenance={loyaltyData.maintenance}
              currency={loyaltyData.currency}
              locale={locale}
              translate={translate}
            />
          ) : isZeroCashbackTier && hasHigherTiers && loyaltyData.tier ? (
            /* Zero cashback starter tier - show encouraging progress card */
            <StarterTierCard
              tier={loyaltyData.tier}
              progress={progress}
              currency={loyaltyData.currency}
              locale={locale}
              translate={translate}
            />
          ) : loyaltyData.tier && loyaltyData.spendingProgress && loyaltyData.tier.sourceDetails?.type !== 'spending' ? (
            /* Non-spending tier source - show dual progress */
            <DualProgressCard
              tier={loyaltyData.tier}
              spendingProgress={loyaltyData.spendingProgress}
              currency={loyaltyData.currency}
              locale={locale}
              translate={translate}
            />
          ) : (
            /* Standard progress card */
            <ProgressCard
              progress={progress}
              currency={loyaltyData.currency}
              locale={locale}
              translate={translate}
              maintenance={loyaltyData.maintenance}
            />
          )}

          {/* Upgrade Section - Tier Products for higher tiers */}
          {loyaltyData.upgradeOptions && (
            <UpgradeSection
              upgradeOptions={loyaltyData.upgradeOptions}
              currentTierName={loyaltyData.tier?.name || null}
              isMaxTier={progress.isMaxTier}
              translate={translate}
              currency={loyaltyData.currency}
              locale={locale}
            />
          )}

          {/* Recent Activity */}
          {loyaltyData.recentTransactions && loyaltyData.recentTransactions.length > 0 && (
            <ActivityCard
              transactions={loyaltyData.recentTransactions}
              currency={loyaltyData.currency}
              locale={locale}
              translate={translate}
              variant="compact"
            />
          )}

          {/* View All Tiers Toggle - hide for single-tier programs */}
          {!isSingleTierProgram && loyaltyData.allTiers && loyaltyData.allTiers.length > 1 && (
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
