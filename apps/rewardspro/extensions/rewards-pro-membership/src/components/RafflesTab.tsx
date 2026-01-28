import { useState, useCallback } from 'react';
import {
  BlockStack,
  InlineStack,
  Text,
  View,
  Button,
  Banner,
  Badge,
  Divider,
  SkeletonText,
} from '@shopify/ui-extensions-react/customer-account';
import type { RaffleInfo, RaffleEntryResult } from '../hooks/useRaffles';

// ============================================
// TYPES
// ============================================

interface RafflesTabProps {
  raffles: RaffleInfo[];
  isLoading: boolean;
  error: string | null;
  pointsBalance: number;
  config: { currencyName: string; currencyIcon: string } | null;
  onPurchaseEntries: (raffleId: string, quantity: number) => Promise<RaffleEntryResult>;
  translate: (key: string, options?: Record<string, string>) => string;
  locale: string;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatTimeRemaining(endsAt: string, translate: (key: string, options?: Record<string, string>) => string): string {
  const end = new Date(endsAt);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();

  if (diffMs <= 0) {
    return translate('raffles.ended');
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) {
    return translate('raffles.endsInDays', { days: String(days) });
  }
  if (hours > 0) {
    return translate('raffles.endsInHours', { hours: String(hours) });
  }
  return translate('raffles.endsSoon');
}

// ============================================
// SUB-COMPONENTS
// ============================================

function RafflesLoadingSkeleton() {
  return (
    <BlockStack spacing="base">
      <View border="base" cornerRadius="base" padding="base" background="base">
        <BlockStack spacing="base">
          <SkeletonText size="large" />
          <SkeletonText size="small" />
          <SkeletonText size="small" />
        </BlockStack>
      </View>
      <View border="base" cornerRadius="base" padding="base" background="base">
        <BlockStack spacing="base">
          <SkeletonText size="large" />
          <SkeletonText size="small" />
          <SkeletonText size="small" />
        </BlockStack>
      </View>
    </BlockStack>
  );
}

interface RaffleCardProps {
  raffle: RaffleInfo;
  pointsBalance: number;
  currencyName: string;
  currencyIcon: string;
  onPurchase: (quantity: number) => Promise<void>;
  isPurchasing: boolean;
  translate: (key: string, options?: Record<string, string>) => string;
}

function RaffleCard({
  raffle,
  pointsBalance,
  currencyName,
  currencyIcon,
  onPurchase,
  isPurchasing,
  translate,
}: RaffleCardProps) {
  const canAfford = pointsBalance >= raffle.entryCost;
  const hasRemainingEntries = raffle.customerEntries < raffle.maxEntriesPerCustomer;
  const canEnter = raffle.canEnter && canAfford && hasRemainingEntries;
  const remainingEntries = raffle.maxEntriesPerCustomer - raffle.customerEntries;

  const isActive = raffle.status === 'ACTIVE';
  const endTime = formatTimeRemaining(raffle.endsAt, translate);

  return (
    <View border="base" cornerRadius="base" padding="base" background="base">
      <BlockStack spacing="base">
        {/* Header */}
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="medium" emphasis="bold">
            🎟️ {raffle.name}
          </Text>
          {isActive && <Badge tone="success">{translate('raffles.active')}</Badge>}
        </InlineStack>

        {/* Description */}
        {raffle.description && (
          <Text size="small" appearance="subdued">
            {raffle.description}
          </Text>
        )}

        <Divider />

        {/* Entry Info */}
        <BlockStack spacing="tight">
          <InlineStack spacing="base" blockAlignment="center">
            <View inlineSize="fill">
              <Text size="small">
                {translate('raffles.entryCost', {
                  cost: String(raffle.entryCost),
                  currency: currencyName,
                })}
              </Text>
            </View>
            <Text size="small" appearance="subdued">
              ⏰ {endTime}
            </Text>
          </InlineStack>

          <InlineStack spacing="base" blockAlignment="center">
            <View inlineSize="fill">
              <Text size="small">
                {translate('raffles.yourEntries', {
                  count: String(raffle.customerEntries),
                  max: String(raffle.maxEntriesPerCustomer),
                })}
              </Text>
            </View>
            <Text size="small" appearance="subdued">
              👥 {raffle.totalEntries} {translate('raffles.totalEntries')}
            </Text>
          </InlineStack>
        </BlockStack>

        {/* Action Button */}
        {isActive && (
          <>
            <Divider />
            <InlineStack spacing="tight">
              <Button
                kind="primary"
                disabled={!canEnter || isPurchasing}
                loading={isPurchasing}
                onPress={() => onPurchase(1)}
              >
                {canEnter
                  ? translate('raffles.addEntry')
                  : !canAfford
                    ? translate('raffles.notEnoughPoints')
                    : !hasRemainingEntries
                      ? translate('raffles.maxEntriesReached')
                      : translate('raffles.cannotEnter')
                }
              </Button>
              {canEnter && remainingEntries > 1 && (
                <Button
                  kind="secondary"
                  disabled={isPurchasing || pointsBalance < raffle.entryCost * 5}
                  onPress={() => onPurchase(Math.min(5, remainingEntries))}
                >
                  +5
                </Button>
              )}
            </InlineStack>
          </>
        )}
      </BlockStack>
    </View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function RafflesTab({
  raffles,
  isLoading,
  error,
  pointsBalance,
  config,
  onPurchaseEntries,
  translate,
}: RafflesTabProps) {
  const [purchasingRaffleId, setPurchasingRaffleId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handlePurchase = useCallback(async (raffleId: string, quantity: number) => {
    setPurchasingRaffleId(raffleId);
    setActionError(null);
    setSuccessMessage(null);

    const result = await onPurchaseEntries(raffleId, quantity);

    if (result.success) {
      setSuccessMessage(result.message || translate('raffles.entrySuccess'));
    } else {
      setActionError(result.error || translate('raffles.entryError'));
    }

    setPurchasingRaffleId(null);
  }, [onPurchaseEntries, translate]);

  if (isLoading) {
    return <RafflesLoadingSkeleton />;
  }

  if (error) {
    return (
      <Banner tone="critical" title={translate('raffles.errorTitle')}>
        {error}
      </Banner>
    );
  }

  const currencyName = config?.currencyName || 'points';
  const currencyIcon = config?.currencyIcon || '⭐';

  return (
    <BlockStack spacing="base">
      {/* Points Balance Header */}
      <View border="base" cornerRadius="base" padding="base" background="subdued">
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="small">{translate('raffles.yourBalance')}</Text>
          <Text size="medium" emphasis="bold">
            {currencyIcon} {pointsBalance.toLocaleString()} {currencyName}
          </Text>
        </InlineStack>
      </View>

      {/* Success Message */}
      {successMessage && (
        <Banner tone="success" onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Banner>
      )}

      {/* Error Message */}
      {actionError && (
        <Banner tone="critical" onDismiss={() => setActionError(null)}>
          {actionError}
        </Banner>
      )}

      {/* Raffles List */}
      {raffles.length === 0 ? (
        <View border="base" cornerRadius="base" padding="loose" background="base">
          <BlockStack spacing="tight" inlineAlignment="center">
            <Text size="large">🎟️</Text>
            <Text size="medium" emphasis="bold">
              {translate('raffles.noActiveRaffles')}
            </Text>
            <Text size="small" appearance="subdued">
              {translate('raffles.checkBackLater')}
            </Text>
          </BlockStack>
        </View>
      ) : (
        raffles.map((raffle) => (
          <RaffleCard
            key={raffle.id}
            raffle={raffle}
            pointsBalance={pointsBalance}
            currencyName={currencyName}
            currencyIcon={currencyIcon}
            onPurchase={(quantity) => handlePurchase(raffle.id, quantity)}
            isPurchasing={purchasingRaffleId === raffle.id}
            translate={translate}
          />
        ))
      )}
    </BlockStack>
  );
}
