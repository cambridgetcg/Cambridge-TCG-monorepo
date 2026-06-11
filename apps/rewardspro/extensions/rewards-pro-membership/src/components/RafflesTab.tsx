import { useState, useCallback, useMemo } from 'react';
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
  Modal,
} from '@shopify/ui-extensions-react/customer-account';
import type {
  RaffleInfo,
  RaffleEntryResult,
  RaffleHistoryEntry,
  RaffleStreakInfo,
  RaffleActivityItem,
  RaffleBonusEvent,
} from '../hooks/useRaffles';
import { RaffleImage } from './CardImage';
import { HistorySection, RaffleHistoryItem } from './HistorySection';
import { RaffleStreakBanner } from './RaffleStreakBanner';
import { RaffleBonusEventList } from './RaffleBonusEventBanner';
import { RaffleActivityFeed } from './RaffleActivityFeed';
import { PurchaseResultDisplay } from './InstantWinReveal';

// ============================================
// TYPES
// ============================================

interface RafflesTabProps {
  raffles: RaffleInfo[];
  isLoading: boolean;
  error: string | null;
  pointsBalance: number;
  config: { currencyName: string; currencyIcon: string } | null;
  history: RaffleHistoryEntry[];
  historyLoading: boolean;
  onPurchaseEntries: (raffleId: string, quantity: number) => Promise<RaffleEntryResult>;
  onFetchHistory: () => void;
  // Psychology props
  streak: RaffleStreakInfo | null;
  activities: RaffleActivityItem[];
  bonusEvents: RaffleBonusEvent[];
  bestBonusEvent: RaffleBonusEvent | null;
  psychologyLoading: boolean;
  lastPurchaseResult: RaffleEntryResult | null;
  onClearPurchaseResult: () => void;
  onClaimFreeEntry: (raffleId: string) => Promise<RaffleEntryResult>;
  isClaimingFreeEntry: boolean;
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
  onOpenPurchase: () => void;
  isPurchasing: boolean;
  translate: (key: string, options?: Record<string, string>) => string;
}

function RaffleCard({
  raffle,
  pointsBalance,
  currencyName,
  currencyIcon,
  onOpenPurchase,
  isPurchasing,
  translate,
}: RaffleCardProps) {
  const canAfford = pointsBalance >= raffle.entryCost;
  const hasRemainingEntries = raffle.customerEntries < raffle.maxEntriesPerCustomer;
  const canEnter = raffle.canEnter && canAfford && hasRemainingEntries;

  const isActive = raffle.status === 'ACTIVE';
  const endTime = formatTimeRemaining(raffle.endsAt, translate);

  return (
    <View border="base" cornerRadius="base" padding="none" background="base" overflow="hidden">
      <BlockStack spacing="none">
        {/* Image */}
        <RaffleImage imageUrl={raffle.imageUrl} name={raffle.name} />

        {/* Content */}
        <View padding="base">
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

        {/* Ineligibility reason (e.g. tier restriction) */}
        {isActive && !raffle.canEnter && raffle.reason && (
          <Text size="small" appearance="warning">
            {raffle.reason}
          </Text>
        )}

        {/* Action Button */}
        {isActive && (
          <>
            <Divider />
            <Button
              kind="primary"
              disabled={!canEnter || isPurchasing}
              loading={isPurchasing}
              onPress={onOpenPurchase}
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
          </>
        )}
          </BlockStack>
        </View>
      </BlockStack>
    </View>
  );
}

// ============================================
// PURCHASE CONFIRMATION MODAL
// ============================================

interface PurchaseConfirmModalProps {
  raffle: RaffleInfo;
  pointsBalance: number;
  currencyName: string;
  currencyIcon: string;
  isPurchasing: boolean;
  onConfirm: (quantity: number) => void;
  onClose: () => void;
  translate: (key: string, options?: Record<string, string>) => string;
}

function PurchaseConfirmModal({
  raffle,
  pointsBalance,
  currencyName,
  currencyIcon,
  isPurchasing,
  onConfirm,
  onClose,
  translate,
}: PurchaseConfirmModalProps) {
  const [quantity, setQuantity] = useState(1);

  const remainingEntries = raffle.maxEntriesPerCustomer - raffle.customerEntries;
  const maxAffordable = Math.floor(pointsBalance / raffle.entryCost);
  const maxQuantity = Math.min(remainingEntries, maxAffordable);
  const totalCost = quantity * raffle.entryCost;
  const balanceAfter = pointsBalance - totalCost;
  const canConfirm = quantity >= 1 && quantity <= maxQuantity && !isPurchasing;

  const handleDecrement = useCallback(() => {
    setQuantity((q) => Math.max(1, q - 1));
  }, []);

  const handleIncrement = useCallback(() => {
    setQuantity((q) => Math.min(maxQuantity, q + 1));
  }, [maxQuantity]);

  // Quick-select presets
  const presets = useMemo(() => {
    const values = [1, 5, 10, maxQuantity].filter(
      (v, i, arr) => v >= 1 && v <= maxQuantity && arr.indexOf(v) === i
    );
    return values.slice(0, 4);
  }, [maxQuantity]);

  return (
    <Modal
      id={`purchase-confirm-${raffle.id}`}
      title={`🎟️ ${raffle.name}`}
      onClose={onClose}
      primaryAction={{
        content: isPurchasing
          ? translate('raffles.purchasing')
          : translate('raffles.confirmPurchase'),
        onAction: () => {
          if (canConfirm) onConfirm(quantity);
        },
      }}
    >
      <View padding="base">
        <BlockStack spacing="base">
          {/* Quantity Selector */}
          <BlockStack spacing="tight">
            <Text size="small" emphasis="bold">
              {translate('raffles.selectQuantity')}
            </Text>
            <InlineStack spacing="base" blockAlignment="center">
              <Button
                kind="secondary"
                disabled={quantity <= 1}
                onPress={handleDecrement}
              >
                -
              </Button>
              <View padding="tight" minInlineSize={60}>
                <Text size="large" emphasis="bold">
                  {String(quantity)}
                </Text>
              </View>
              <Button
                kind="secondary"
                disabled={quantity >= maxQuantity}
                onPress={handleIncrement}
              >
                +
              </Button>
            </InlineStack>
          </BlockStack>

          {/* Quick-Select Presets */}
          {presets.length > 1 && (
            <InlineStack spacing="tight">
              {presets.map((preset) => (
                <Button
                  key={preset}
                  kind={quantity === preset ? 'primary' : 'secondary'}
                  onPress={() => setQuantity(preset)}
                >
                  {preset === maxQuantity ? `Max (${preset})` : String(preset)}
                </Button>
              ))}
            </InlineStack>
          )}

          <Divider />

          {/* Cost Breakdown */}
          <BlockStack spacing="tight">
            <InlineStack spacing="base" blockAlignment="center">
              <View inlineSize="fill">
                <Text size="small" appearance="subdued">
                  {translate('raffles.pricePerEntry')}
                </Text>
              </View>
              <Text size="small">
                {currencyIcon} {raffle.entryCost.toLocaleString()} {currencyName}
              </Text>
            </InlineStack>

            <InlineStack spacing="base" blockAlignment="center">
              <View inlineSize="fill">
                <Text size="small" appearance="subdued">
                  {translate('raffles.quantity')}
                </Text>
              </View>
              <Text size="small">
                x{quantity}
              </Text>
            </InlineStack>

            <Divider />

            <InlineStack spacing="base" blockAlignment="center">
              <View inlineSize="fill">
                <Text size="medium" emphasis="bold">
                  {translate('raffles.totalCost')}
                </Text>
              </View>
              <Text size="medium" emphasis="bold">
                {currencyIcon} {totalCost.toLocaleString()} {currencyName}
              </Text>
            </InlineStack>
          </BlockStack>

          <Divider />

          {/* Balance Info */}
          <BlockStack spacing="tight">
            <InlineStack spacing="base" blockAlignment="center">
              <View inlineSize="fill">
                <Text size="small" appearance="subdued">
                  {translate('raffles.currentBalance')}
                </Text>
              </View>
              <Text size="small">
                {currencyIcon} {pointsBalance.toLocaleString()}
              </Text>
            </InlineStack>

            <InlineStack spacing="base" blockAlignment="center">
              <View inlineSize="fill">
                <Text size="small" appearance="subdued">
                  {translate('raffles.balanceAfter')}
                </Text>
              </View>
              <Text size="small" emphasis="bold">
                {currencyIcon} {balanceAfter.toLocaleString()}
              </Text>
            </InlineStack>

            {maxAffordable > 0 && (
              <Text size="small" appearance="subdued">
                {translate('raffles.youCanAfford', {
                  count: String(Math.min(maxAffordable, remainingEntries)),
                  currency: currencyName,
                })}
              </Text>
            )}
          </BlockStack>

          {/* Entry Limit Info */}
          <View padding="tight" background="subdued" cornerRadius="base">
            <Text size="small" appearance="subdued">
              {translate('raffles.entryLimitInfo', {
                current: String(raffle.customerEntries),
                max: String(raffle.maxEntriesPerCustomer),
                remaining: String(remainingEntries),
              })}
            </Text>
          </View>
        </BlockStack>
      </View>
    </Modal>
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
  history,
  historyLoading,
  onPurchaseEntries,
  onFetchHistory,
  streak,
  activities,
  bonusEvents,
  bestBonusEvent,
  psychologyLoading,
  lastPurchaseResult,
  onClearPurchaseResult,
  onClaimFreeEntry,
  isClaimingFreeEntry,
  translate,
  locale,
}: RafflesTabProps) {
  const [purchasingRaffleId, setPurchasingRaffleId] = useState<string | null>(null);
  const [confirmRaffleId, setConfirmRaffleId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const confirmRaffle = confirmRaffleId
    ? raffles.find((r) => r.id === confirmRaffleId) || null
    : null;

  const handleConfirmPurchase = useCallback(async (quantity: number) => {
    if (!confirmRaffleId) return;
    const raffleId = confirmRaffleId;

    setConfirmRaffleId(null);
    setPurchasingRaffleId(raffleId);
    setActionError(null);
    setSuccessMessage(null);

    const result = await onPurchaseEntries(raffleId, quantity);

    if (result.success) {
      // Only show plain banner if there are no celebrations to display via modal
      const hasCelebrations = (result.instantWins && result.instantWins.some(w => w.won)) ||
        (result.celebrations && result.celebrations.length > 0);
      if (!hasCelebrations) {
        const bonusText = result.finalEntries && result.finalEntries > quantity
          ? ` (+${result.finalEntries - quantity} bonus!)`
          : '';
        setSuccessMessage((result.message || translate('raffles.entrySuccess')) + bonusText);
      }
      // If there are celebrations, PurchaseResultDisplay modal handles the feedback
    } else {
      setActionError(result.error || translate('raffles.entryError'));
    }

    setPurchasingRaffleId(null);
  }, [confirmRaffleId, onPurchaseEntries, translate]);

  const handleClaimFree = useCallback(async () => {
    if (raffles.length === 0) return;
    // Claim free entry on the first active raffle
    const activeRaffle = raffles.find(r => r.status === 'ACTIVE');
    if (!activeRaffle) return;
    setActionError(null);
    const result = await onClaimFreeEntry(activeRaffle.id);
    if (result.success) {
      setSuccessMessage(result.message || translate('raffles.freeEntrySuccess'));
    } else {
      setActionError(result.error || translate('raffles.freeEntryError'));
    }
  }, [raffles, onClaimFreeEntry, translate]);

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

  // Show celebration modal for purchase results with instant wins or celebrations
  const showCelebrationModal = lastPurchaseResult?.success &&
    ((lastPurchaseResult.instantWins && lastPurchaseResult.instantWins.some(w => w.won)) ||
     (lastPurchaseResult.celebrations && lastPurchaseResult.celebrations.length > 0));

  return (
    <BlockStack spacing="base">
      {/* Purchase Result Celebration Modal */}
      {showCelebrationModal && lastPurchaseResult && (
        <PurchaseResultDisplay
          entriesCount={lastPurchaseResult.entriesCount || 1}
          finalEntries={lastPurchaseResult.finalEntries || lastPurchaseResult.entriesCount || 1}
          pointsSpent={lastPurchaseResult.pointsSpent || 0}
          wins={lastPurchaseResult.instantWins || []}
          celebrations={lastPurchaseResult.celebrations || []}
          onDismiss={onClearPurchaseResult}
          translate={translate}
        />
      )}

      {/* Points Balance Header */}
      <View border="base" cornerRadius="base" padding="base" background="subdued">
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="small">{translate('raffles.yourBalance')}</Text>
          <Text size="medium" emphasis="bold">
            {currencyIcon} {pointsBalance.toLocaleString()} {currencyName}
          </Text>
        </InlineStack>
      </View>

      {/* Streak Banner */}
      {streak && (
        <RaffleStreakBanner
          streak={streak}
          onClaimFreeEntry={handleClaimFree}
          isClaimingFreeEntry={isClaimingFreeEntry}
          translate={translate}
        />
      )}

      {/* Bonus Event Banner */}
      {bonusEvents && bonusEvents.length > 0 && (
        <RaffleBonusEventList
          events={bonusEvents}
          translate={translate}
        />
      )}

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

      {/* Purchase Confirmation Modal */}
      {confirmRaffle && (
        <PurchaseConfirmModal
          raffle={confirmRaffle}
          pointsBalance={pointsBalance}
          currencyName={currencyName}
          currencyIcon={currencyIcon}
          isPurchasing={purchasingRaffleId === confirmRaffle.id}
          onConfirm={handleConfirmPurchase}
          onClose={() => setConfirmRaffleId(null)}
          translate={translate}
        />
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
            onOpenPurchase={() => setConfirmRaffleId(raffle.id)}
            isPurchasing={purchasingRaffleId === raffle.id}
            translate={translate}
          />
        ))
      )}

      {/* Live Activity Feed */}
      {activities && activities.length > 0 && (
        <RaffleActivityFeed
          activities={activities}
          translate={translate}
          maxItems={5}
        />
      )}

      {/* History Section */}
      <HistorySection
        title={translate('raffles.historyTitle')}
        isLoading={historyLoading}
        hasItems={history.length > 0}
        onExpand={onFetchHistory}
        translate={translate}
      >
        {history.map((entry) => (
          <RaffleHistoryItem
            key={entry.id}
            raffleName={entry.raffleName}
            entriesCount={entry.entriesCount}
            pointsSpent={entry.pointsSpent}
            enteredAt={entry.enteredAt}
            isWinner={entry.isWinner}
            prize={entry.prize?.name ?? undefined}
            locale={locale}
            translate={translate}
          />
        ))}
      </HistorySection>
    </BlockStack>
  );
}
