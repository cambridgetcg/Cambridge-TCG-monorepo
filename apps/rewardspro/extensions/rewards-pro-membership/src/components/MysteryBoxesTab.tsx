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
import type { MysteryBoxInfo, OpenBoxResult, MysteryBoxReward, MysteryBoxHistoryEntry } from '../hooks/useMysteryBoxes';
import { MysteryBoxImage } from './CardImage';
import { HistorySection, MysteryBoxHistoryItem } from './HistorySection';

// ============================================
// TYPES
// ============================================

interface MysteryBoxesTabProps {
  boxes: MysteryBoxInfo[];
  isLoading: boolean;
  error: string | null;
  pointsBalance: number;
  config: { currencyName: string; currencyIcon: string } | null;
  history: MysteryBoxHistoryEntry[];
  historyLoading: boolean;
  onOpenBox: (boxId: string) => Promise<OpenBoxResult>;
  onFetchHistory: () => void;
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
    return translate('mysteryBoxes.ended');
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) {
    return translate('mysteryBoxes.endsInDays', { days: String(days) });
  }
  if (hours > 0) {
    return translate('mysteryBoxes.endsInHours', { hours: String(hours) });
  }
  return translate('mysteryBoxes.endsSoon');
}

function getRarityBadgeTone(rarity: string): 'info' | 'success' | 'warning' | 'critical' {
  switch (rarity) {
    case 'LEGENDARY':
      return 'critical';
    case 'EPIC':
      return 'warning';
    case 'RARE':
      return 'success';
    case 'UNCOMMON':
      return 'info';
    default:
      return 'info';
  }
}

function getRarityEmoji(rarity: string): string {
  switch (rarity) {
    case 'LEGENDARY':
      return '🌟';
    case 'EPIC':
      return '💜';
    case 'RARE':
      return '💙';
    case 'UNCOMMON':
      return '💚';
    default:
      return '⚪';
  }
}

// ============================================
// SUB-COMPONENTS
// ============================================

function MysteryBoxesLoadingSkeleton() {
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

interface RewardRevealProps {
  reward: MysteryBoxReward;
  onClose: () => void;
  translate: (key: string, options?: Record<string, string>) => string;
}

function RewardReveal({ reward, onClose, translate }: RewardRevealProps) {
  const rarityEmoji = getRarityEmoji(reward.rarity);

  return (
    <View border="base" cornerRadius="base" padding="loose" background="subdued">
      <BlockStack spacing="base" inlineAlignment="center">
        <Text size="large">{rarityEmoji}</Text>
        <Text size="large" emphasis="bold">
          {translate('mysteryBoxes.youWon')}
        </Text>
        <Badge tone={getRarityBadgeTone(reward.rarity)}>
          {reward.rarity}
        </Badge>
        <Text size="medium" emphasis="bold">
          {reward.name}
        </Text>
        <Text size="small" appearance="subdued">
          {reward.type}
        </Text>
        <Button kind="primary" onPress={onClose}>
          {translate('mysteryBoxes.awesome')}
        </Button>
      </BlockStack>
    </View>
  );
}

interface MysteryBoxCardProps {
  box: MysteryBoxInfo;
  pointsBalance: number;
  currencyName: string;
  currencyIcon: string;
  onOpen: () => Promise<void>;
  isOpening: boolean;
  translate: (key: string, options?: Record<string, string>) => string;
}

function MysteryBoxCard({
  box,
  pointsBalance,
  currencyName,
  currencyIcon,
  onOpen,
  isOpening,
  translate,
}: MysteryBoxCardProps) {
  const canAfford = pointsBalance >= box.openCost;
  const hasRemainingOpens = box.opensRemaining > 0;
  const canOpen = box.canOpen && canAfford && hasRemainingOpens;

  const isActive = box.status === 'ACTIVE';
  const endTime = formatTimeRemaining(box.endsAt, translate);

  return (
    <View border="base" cornerRadius="base" padding="none" background="base" overflow="hidden">
      <BlockStack spacing="none">
        {/* Image */}
        <MysteryBoxImage imageUrl={box.imageUrl} name={box.name} />

        {/* Content */}
        <View padding="base">
          <BlockStack spacing="base">
            {/* Header */}
            <InlineStack spacing="tight" blockAlignment="center">
              <Text size="medium" emphasis="bold">
                🎁 {box.name}
              </Text>
              {isActive && <Badge tone="success">{translate('mysteryBoxes.active')}</Badge>}
            </InlineStack>

        {/* Description */}
        {box.description && (
          <Text size="small" appearance="subdued">
            {box.description}
          </Text>
        )}

        <Divider />

        {/* Open Info */}
        <BlockStack spacing="tight">
          <InlineStack spacing="base" blockAlignment="center">
            <View inlineSize="fill">
              <Text size="small">
                {translate('mysteryBoxes.openCost', {
                  cost: String(box.openCost),
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
                {translate('mysteryBoxes.opensRemaining', {
                  remaining: String(box.opensRemaining),
                  max: String(box.maxOpensPerCustomer),
                })}
              </Text>
            </View>
            <Text size="small" appearance="subdued">
              📦 {box.totalOpens} {translate('mysteryBoxes.totalOpens')}
            </Text>
          </InlineStack>
        </BlockStack>

        {/* Reason if can't open */}
        {!box.canOpen && box.reason && (
          <Text size="small" appearance="critical">
            {box.reason}
          </Text>
        )}

        {/* Action Button */}
        {isActive && (
          <>
            <Divider />
            <Button
              kind="primary"
              disabled={!canOpen || isOpening}
              loading={isOpening}
              onPress={onOpen}
            >
              {canOpen
                ? translate('mysteryBoxes.openBox')
                : !canAfford
                  ? translate('mysteryBoxes.notEnoughPoints')
                  : !hasRemainingOpens
                    ? translate('mysteryBoxes.maxOpensReached')
                    : translate('mysteryBoxes.cannotOpen')
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
// MAIN COMPONENT
// ============================================

export function MysteryBoxesTab({
  boxes,
  isLoading,
  error,
  pointsBalance,
  config,
  history,
  historyLoading,
  onOpenBox,
  onFetchHistory,
  translate,
  locale,
}: MysteryBoxesTabProps) {
  const [openingBoxId, setOpeningBoxId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [wonReward, setWonReward] = useState<MysteryBoxReward | null>(null);

  const handleOpen = useCallback(async (boxId: string) => {
    setOpeningBoxId(boxId);
    setActionError(null);
    setWonReward(null);

    const result = await onOpenBox(boxId);

    if (result.success && result.reward) {
      setWonReward(result.reward);
    } else if (!result.success) {
      setActionError(result.error || translate('mysteryBoxes.openError'));
    }

    setOpeningBoxId(null);
  }, [onOpenBox, translate]);

  const handleCloseReveal = useCallback(() => {
    setWonReward(null);
  }, []);

  if (isLoading) {
    return <MysteryBoxesLoadingSkeleton />;
  }

  if (error) {
    return (
      <Banner tone="critical" title={translate('mysteryBoxes.errorTitle')}>
        {error}
      </Banner>
    );
  }

  const currencyName = config?.currencyName || 'points';
  const currencyIcon = config?.currencyIcon || '⭐';

  // Show reward reveal if we just won something
  if (wonReward) {
    return (
      <RewardReveal
        reward={wonReward}
        onClose={handleCloseReveal}
        translate={translate}
      />
    );
  }

  return (
    <BlockStack spacing="base">
      {/* Points Balance Header */}
      <View border="base" cornerRadius="base" padding="base" background="subdued">
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="small">{translate('mysteryBoxes.yourBalance')}</Text>
          <Text size="medium" emphasis="bold">
            {currencyIcon} {pointsBalance.toLocaleString()} {currencyName}
          </Text>
        </InlineStack>
      </View>

      {/* Error Message */}
      {actionError && (
        <Banner tone="critical" onDismiss={() => setActionError(null)}>
          {actionError}
        </Banner>
      )}

      {/* Mystery Boxes List */}
      {boxes.length === 0 ? (
        <View border="base" cornerRadius="base" padding="loose" background="base">
          <BlockStack spacing="tight" inlineAlignment="center">
            <Text size="large">🎁</Text>
            <Text size="medium" emphasis="bold">
              {translate('mysteryBoxes.noActiveBoxes')}
            </Text>
            <Text size="small" appearance="subdued">
              {translate('mysteryBoxes.checkBackLater')}
            </Text>
          </BlockStack>
        </View>
      ) : (
        boxes.map((box) => (
          <MysteryBoxCard
            key={box.id}
            box={box}
            pointsBalance={pointsBalance}
            currencyName={currencyName}
            currencyIcon={currencyIcon}
            onOpen={() => handleOpen(box.id)}
            isOpening={openingBoxId === box.id}
            translate={translate}
          />
        ))
      )}

      {/* History Section */}
      <HistorySection
        title={translate('mysteryBoxes.historyTitle')}
        isLoading={historyLoading}
        hasItems={history.length > 0}
        onExpand={onFetchHistory}
        translate={translate}
      >
        {history.map((entry) => (
          <MysteryBoxHistoryItem
            key={entry.id}
            boxName={entry.boxName}
            rewardName={entry.rewardName}
            rarity={entry.rarity}
            pointsSpent={entry.pointsSpent}
            openedAt={entry.openedAt}
            locale={locale}
            translate={translate}
          />
        ))}
      </HistorySection>
    </BlockStack>
  );
}
