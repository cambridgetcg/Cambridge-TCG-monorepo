import {
  BlockStack,
  Text,
  Divider,
} from '@shopify/ui-extensions-react/customer-account';
import { BonusEventBadge, type ActiveBonusInfo } from './BonusEventBadge';
import { StreakDisplay, type StreakInfo } from './StreakDisplay';
import { ExpirationWarning, type ExpiringPointsInfo } from './ExpirationWarning';
import { PointsBalance, type PointsBalanceInfo, type PointsCurrencyInfo } from './PointsBalance';
import { PointsRedemption, type RedemptionTierInfo, type RedemptionResult } from './PointsRedemption';
import { PointsTransactions, type PointsTransactionInfo } from './PointsTransactions';

export interface PointsData {
  enabled: boolean;
  balance: PointsBalanceInfo;
  currency: PointsCurrencyInfo;
  config: {
    pointsPerDollar: number;
    tierMultiplier: number;
  };
  activeBonus: ActiveBonusInfo | null;
  streak: StreakInfo | null;
  redemptionOptions: RedemptionTierInfo[];
  recentTransactions?: PointsTransactionInfo[];
}

interface PointsSectionProps {
  points: PointsData;
  shopCurrency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
  onRedeem: (tierId: string) => Promise<RedemptionResult>;
}

export function PointsSection({
  points,
  shopCurrency,
  locale,
  translate,
  onRedeem
}: PointsSectionProps) {
  if (!points.enabled) {
    return null;
  }

  const {
    balance,
    currency,
    activeBonus,
    streak,
    redemptionOptions,
    recentTransactions
  } = points;

  // Check for expiring points
  const expiringSoon: ExpiringPointsInfo | null = balance.expiringSoon
    ? { amount: balance.expiringSoon.amount, expiresAt: balance.expiringSoon.expiresAt }
    : null;

  return (
    <BlockStack spacing="base">
      {/* Section Header */}
      <Text size="medium" emphasis="bold">
        {translate('points.title')}
      </Text>

      <Divider />

      {/* Active Bonus Event Badge */}
      {activeBonus && activeBonus.hasBonus && (
        <BonusEventBadge
          activeBonus={activeBonus}
          translate={translate}
        />
      )}

      {/* Expiration Warning */}
      <ExpirationWarning
        expiringSoon={expiringSoon}
        currencyName={currency.name}
        translate={translate}
      />

      {/* Points Balance */}
      <PointsBalance
        balance={balance}
        currency={currency}
        translate={translate}
      />

      {/* Streak Display */}
      {streak && streak.current > 0 && (
        <StreakDisplay
          streak={streak}
          translate={translate}
        />
      )}

      {/* Redemption Options */}
      {redemptionOptions.length > 0 && (
        <PointsRedemption
          availablePoints={balance.available}
          redemptionTiers={redemptionOptions}
          currencyName={currency.plural}
          shopCurrency={shopCurrency}
          translate={translate}
          onRedeem={onRedeem}
        />
      )}

      {/* Recent Points Transactions */}
      {recentTransactions && recentTransactions.length > 0 && (
        <PointsTransactions
          transactions={recentTransactions}
          currencyName={currency.plural}
          locale={locale}
          translate={translate}
          maxDisplay={5}
        />
      )}
    </BlockStack>
  );
}

// Re-export types for convenience
export type {
  ActiveBonusInfo,
  StreakInfo,
  ExpiringPointsInfo,
  PointsBalanceInfo,
  PointsCurrencyInfo,
  RedemptionTierInfo,
  RedemptionResult,
  PointsTransactionInfo,
};
