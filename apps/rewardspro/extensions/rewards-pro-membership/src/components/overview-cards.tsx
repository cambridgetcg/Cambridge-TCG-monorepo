/**
 * Membership overview cards — the entire presentation layer for the
 * "Membership" tab, split out of MembershipBlock.tsx 2026-04-23.
 *
 * Each component takes fully-normalized props and has no knowledge of
 * session tokens, API clients, or activity hooks. The orchestrator
 * (MembershipBlock.tsx) passes only the data each card needs.
 *
 * Conventions:
 *   - Every top-level function is exported so the orchestrator can
 *     compose them freely. Internal helpers (getTransactionIcon,
 *     TransactionRow* variants) are exported too for testability and
 *     reuse by a future tab; unused exports are tree-shaken.
 *   - No side-effecting imports. Formatters live in utils/format;
 *     safe-accessors in utils/safeData.
 *   - Shopify UI Extensions types have drifted in places (several
 *     `tone` → `status` and `"success"` → "Status" narrowings). Those
 *     are pre-existing mismatches in the Shopify types, not our code;
 *     they don't block build (only strict type-check).
 */
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Divider,
  Icon,
  InlineStack,
  Pressable,
  SkeletonText,
  Text,
  View,
} from "@shopify/ui-extensions-react/customer-account";
import { formatCurrency, formatDate, formatMonthYear } from "../utils/format";
import { isDataStale, getDataAgeMinutes, safeProgress } from "../utils/safeData";
import { MAX_TRANSACTIONS_DISPLAY } from "../config";
import type {
  AllTierInfo,
  BalanceInfo,
  CustomerInfo,
  MaintenanceInfo,
  PendingCashbackInfo,
  ProgressInfo,
  SpendingProgressInfo,
  TierChangeInfo,
  TierInfo,
  TransactionInfo,
} from "../types/loyaltyData";

/** Shared translate signature — identical to the one returned by
 *  `useTranslate()` in the orchestrator. Defined inline to avoid
 *  coupling this module to the hook. */
type Translate = (key: string, substitutions?: Record<string, string | number>) => string;

export function MembershipSkeleton() {
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

export interface ProgressBarProps {
  progress: number;
  height?: number;
}

export function TierProgressBar({ progress, height = 8 }: ProgressBarProps) {
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

export interface WelcomeHeaderProps {
  customer: CustomerInfo;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function WelcomeHeader({ customer, locale, translate, onRefresh, isRefreshing }: WelcomeHeaderProps) {
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

export interface TierSourceBadgeProps {
  tier: TierInfo;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

export function TierSourceBadge({ tier, locale, translate }: TierSourceBadgeProps) {
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

export interface MembershipCardProps {
  tier: TierInfo;
  benefits: string[];
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

export function MembershipCard({ tier, benefits, locale, translate }: MembershipCardProps) {
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

export interface BalanceCardProps {
  balance: BalanceInfo;
  currency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

export function BalanceCard({ balance, currency, locale, translate }: BalanceCardProps) {
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

export interface BalanceCardWithPendingProps extends BalanceCardProps {
  pendingCashback?: PendingCashbackInfo | null;
}

export function BalanceCardWithPending({ balance, currency, locale, translate, pendingCashback }: BalanceCardWithPendingProps) {
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

export interface WelcomeCardProps {
  customer: CustomerInfo;
  tier: TierInfo | null;
  currency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

export function WelcomeCard({ customer, tier, currency, locale, translate }: WelcomeCardProps) {
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

export interface TierChangeBannerProps {
  tierChange: TierChangeInfo;
  translate: (key: string, options?: Record<string, string>) => string;
}

export function TierChangeBanner({ tierChange, translate }: TierChangeBannerProps) {
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

export interface StaleDataBannerProps {
  lastUpdated?: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

export function StaleDataBanner({ lastUpdated, translate }: StaleDataBannerProps) {
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

export interface StarterTierCardProps {
  tier: TierInfo;
  progress: ProgressInfo;
  currency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

export function StarterTierCard({ tier, progress, currency, locale, translate }: StarterTierCardProps) {
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

export interface ProgressCardProps {
  progress: ProgressInfo;
  currency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
  maintenance?: MaintenanceInfo | null;
}

export function ProgressCard({ progress, currency, locale, translate, maintenance }: ProgressCardProps) {
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

export interface MaxTierCardProps {
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

export function MaxTierCard({ tier, stats, maintenance, currency, locale, translate }: MaxTierCardProps) {
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

export interface DualProgressCardProps {
  tier: TierInfo;
  spendingProgress: SpendingProgressInfo;
  currency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

export function DualProgressCard({
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

export interface TransactionRowProps {
  transaction: TransactionInfo;
  currency: string;
  locale: string;
}

// Get emoji icon based on transaction type
export function getTransactionIcon(type: string): string {
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
export function TransactionRowCompact({ transaction, currency, locale }: TransactionRowProps) {
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
export function TransactionRowTimeline({ transaction, currency, locale }: TransactionRowProps) {
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
export function TransactionRowCard({ transaction, currency, locale }: TransactionRowProps) {
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

export interface ActivityCardProps {
  transactions: TransactionInfo[];
  currency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
  variant?: ActivityVariant;
}

export function ActivityCard({
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

export interface TierRowProps {
  tier: AllTierInfo;
  currency: string;
  locale: string;
  currentSpending: number;
  translate: (key: string, options?: Record<string, string>) => string;
}

export function TierRow({ tier, currency, locale, currentSpending, translate }: TierRowProps) {
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

export interface AllTiersCardProps {
  tiers: AllTierInfo[];
  currency: string;
  locale: string;
  currentSpending: number;
  translate: (key: string, options?: Record<string, string>) => string;
}

export function AllTiersCard({ tiers, currency, locale, currentSpending, translate }: AllTiersCardProps) {
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
