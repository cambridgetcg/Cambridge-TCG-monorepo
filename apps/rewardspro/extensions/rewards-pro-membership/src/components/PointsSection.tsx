import {
  BlockStack,
  Text,
  Divider,
} from '@shopify/ui-extensions-react/customer-account';
import { BonusEventBadge, type ActiveBonusInfo } from './BonusEventBadge';
import { StreakDisplay, type StreakInfo } from './StreakDisplay';
import { ExpirationWarning, type ExpiringPointsInfo } from './ExpirationWarning';
import { PointsBalance, type PointsBalanceInfo, type PointsCurrencyInfo } from './PointsBalance';
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
  recentTransactions?: PointsTransactionInfo[];
}

interface PointsSectionProps {
  points: PointsData;
  shopCurrency: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

export function PointsSection({
  points,
  shopCurrency,
  locale,
  translate,
}: PointsSectionProps) {
  if (!points.enabled) {
    return null;
  }

  const {
    balance,
    currency,
    activeBonus,
    streak,
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
  PointsTransactionInfo,
};
