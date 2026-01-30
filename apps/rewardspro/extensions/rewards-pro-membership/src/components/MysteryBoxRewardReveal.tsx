import { useState } from 'react';
import {
  BlockStack,
  InlineStack,
  Text,
  View,
  Button,
  Modal,
  ProgressBar,
  Badge,
} from '@shopify/ui-extensions-react/customer-account';

// ============================================
// TYPES
// ============================================

export interface MysteryBoxReward {
  id: string;
  name: string;
  type: string;
  rarity: string;
  value: Record<string, unknown>;
  actualValue?: number;
}

export interface NearMissInfo {
  rewardId: string;
  rewardName: string;
  rarity: string;
  percentageAway: number;
  message: string;
}

export interface PityProgress {
  current: number;
  threshold: number;
  message: string;
}

export interface CelebrationEvent {
  type: 'STREAK_MILESTONE' | 'LUCKY_STREAK' | 'PITY_TRIGGERED' | 'RARE_WIN' | 'EPIC_WIN' | 'LEGENDARY_WIN';
  data: Record<string, unknown>;
  message: string;
  emoji: string;
}

export interface PsychologyBonuses {
  streak: {
    applied: boolean;
    multiplier: number;
    days: number;
  };
  luckyStreak: {
    applied: boolean;
    multiplier: number;
    count: number;
  };
  event: {
    applied: boolean;
    name: string;
    discount: number;
    multiplier: number;
  } | null;
  totalMultiplier: number;
}

interface MysteryBoxRewardRevealProps {
  reward: MysteryBoxReward;
  pointsSpent: number;
  originalCost: number;
  discountApplied: number;
  bonuses: PsychologyBonuses;
  nearMiss: NearMissInfo | null;
  pityProgress: PityProgress;
  celebrations: CelebrationEvent[];
  isFreeOpen: boolean;
  onDismiss: () => void;
  translate: (key: string, options?: Record<string, string>) => string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

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
      return '💎';
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

function getCelebrationTitle(
  type: string,
  translate: (key: string, options?: Record<string, string>) => string
): string {
  switch (type) {
    case 'STREAK_MILESTONE':
      return translate('mysteryBoxes.streakMilestoneTitle');
    case 'LUCKY_STREAK':
      return translate('mysteryBoxes.luckyStreakTitle');
    case 'PITY_TRIGGERED':
      return translate('mysteryBoxes.luckProtectionTitle');
    case 'LEGENDARY_WIN':
      return translate('mysteryBoxes.legendaryWinTitle');
    case 'EPIC_WIN':
      return translate('mysteryBoxes.epicWinTitle');
    case 'RARE_WIN':
      return translate('mysteryBoxes.rareWinTitle');
    default:
      return translate('mysteryBoxes.congratsTitle');
  }
}

// ============================================
// COMPONENT
// ============================================

export function MysteryBoxRewardReveal({
  reward,
  pointsSpent,
  originalCost,
  discountApplied,
  bonuses,
  nearMiss,
  pityProgress,
  celebrations,
  isFreeOpen,
  onDismiss,
  translate,
}: MysteryBoxRewardRevealProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);

  const allCelebrations: Array<{
    type: string;
    title: string;
    message: string;
    emoji: string;
    rarity?: string;
  }> = [];

  // Add rarity-based celebrations first
  const rarityCelebration = celebrations.find(
    (c) => c.type === 'LEGENDARY_WIN' || c.type === 'EPIC_WIN' || c.type === 'RARE_WIN'
  );
  if (rarityCelebration) {
    allCelebrations.push({
      type: rarityCelebration.type,
      title: getCelebrationTitle(rarityCelebration.type, translate),
      message: rarityCelebration.message,
      emoji: rarityCelebration.emoji,
      rarity: reward.rarity,
    });
  }

  // Add other celebrations
  for (const celebration of celebrations) {
    if (
      celebration.type !== 'LEGENDARY_WIN' &&
      celebration.type !== 'EPIC_WIN' &&
      celebration.type !== 'RARE_WIN'
    ) {
      allCelebrations.push({
        type: celebration.type,
        title: getCelebrationTitle(celebration.type, translate),
        message: celebration.message,
        emoji: celebration.emoji,
      });
    }
  }

  // If no celebrations, show the main reward
  if (allCelebrations.length === 0) {
    allCelebrations.push({
      type: 'REWARD',
      title: translate('mysteryBoxes.youWon'),
      message: reward.name,
      emoji: getRarityEmoji(reward.rarity),
      rarity: reward.rarity,
    });
  }

  const handleNext = () => {
    if (currentIndex < allCelebrations.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setShowSummary(true);
    }
  };

  // Show celebrations first
  if (!showSummary && allCelebrations.length > 0) {
    const current = allCelebrations[currentIndex];
    const hasMore = currentIndex < allCelebrations.length - 1;

    return (
      <Modal
        id="mystery-box-reveal"
        title={current.title}
        onClose={onDismiss}
        primaryAction={{
          content: hasMore ? translate('mysteryBoxes.next') : translate('mysteryBoxes.continue'),
          onAction: handleNext,
        }}
      >
        <View padding="large">
          <BlockStack spacing="large" inlineAlignment="center">
            {/* Big Emoji */}
            <Text size="extraLarge">
              {current.emoji}
            </Text>

            {/* Rarity Badge */}
            {current.rarity && (
              <Badge tone={getRarityBadgeTone(current.rarity)}>
                {current.rarity}
              </Badge>
            )}

            {/* Message */}
            <Text size="medium" emphasis="bold">
              {current.message}
            </Text>

            {/* Progress indicator */}
            {allCelebrations.length > 1 && (
              <Text size="small" appearance="subdued">
                {currentIndex + 1} / {allCelebrations.length}
              </Text>
            )}
          </BlockStack>
        </View>
      </Modal>
    );
  }

  // Show summary
  return (
    <Modal
      id="mystery-box-summary"
      title={translate('mysteryBoxes.openingSummary')}
      onClose={onDismiss}
      primaryAction={{
        content: translate('mysteryBoxes.awesome'),
        onAction: onDismiss,
      }}
    >
      <View padding="base">
        <BlockStack spacing="base">
          {/* Reward won */}
          <View padding="base" background="subdued" cornerRadius="base">
            <InlineStack spacing="tight" blockAlignment="center">
              <Text size="large">{getRarityEmoji(reward.rarity)}</Text>
              <View inlineSize="fill">
                <BlockStack spacing="extraTight">
                  <Text size="medium" emphasis="bold">{reward.name}</Text>
                  <Badge tone={getRarityBadgeTone(reward.rarity)}>
                    {reward.rarity}
                  </Badge>
                </BlockStack>
              </View>
            </InlineStack>
          </View>

          {/* Bonuses applied */}
          {(bonuses.streak.applied || bonuses.luckyStreak.applied || bonuses.event) && (
            <BlockStack spacing="tight">
              <Text size="small" emphasis="bold">
                {translate('mysteryBoxes.bonusesApplied')}
              </Text>
              {bonuses.streak.applied && (
                <Text size="small" appearance="success">
                  +{Math.round((bonuses.streak.multiplier - 1) * 100)}% {translate('mysteryBoxes.streakBonus', { days: String(bonuses.streak.days) })}
                </Text>
              )}
              {bonuses.luckyStreak.applied && (
                <Text size="small" appearance="success">
                  +{Math.round((bonuses.luckyStreak.multiplier - 1) * 100)}% {translate('mysteryBoxes.luckyStreakBonus', { count: String(bonuses.luckyStreak.count) })}
                </Text>
              )}
              {bonuses.event && (
                <Text size="small" appearance="success">
                  {bonuses.event.name}: {bonuses.event.discount > 0 ? `${bonuses.event.discount}% off` : ''} {bonuses.event.multiplier > 1 ? `${bonuses.event.multiplier}x` : ''}
                </Text>
              )}
            </BlockStack>
          )}

          {/* Cost breakdown */}
          <View padding="tight" background="subdued" cornerRadius="base">
            <BlockStack spacing="extraTight">
              {isFreeOpen ? (
                <Text size="small" appearance="success">
                  {translate('mysteryBoxes.freeOpenUsed')}
                </Text>
              ) : (
                <>
                  {discountApplied > 0 && (
                    <InlineStack spacing="base">
                      <Text size="small" appearance="subdued">
                        {translate('mysteryBoxes.originalCost')}: {originalCost}
                      </Text>
                      <Text size="small" appearance="success">
                        -{discountApplied} {translate('mysteryBoxes.saved')}
                      </Text>
                    </InlineStack>
                  )}
                  <Text size="small">
                    {translate('mysteryBoxes.pointsSpent', { points: String(pointsSpent) })}
                  </Text>
                </>
              )}
            </BlockStack>
          </View>

          {/* Near miss */}
          {nearMiss && (
            <View padding="base" background="warning" cornerRadius="base">
              <BlockStack spacing="tight">
                <Text size="small" emphasis="bold">
                  {translate('mysteryBoxes.soClose')}
                </Text>
                <Text size="small">
                  {nearMiss.message}
                </Text>
              </BlockStack>
            </View>
          )}

          {/* Pity progress */}
          {pityProgress.threshold > 0 && pityProgress.current < pityProgress.threshold && (
            <BlockStack spacing="tight">
              <Text size="small" appearance="subdued">
                {translate('mysteryBoxes.luckProtection')}
              </Text>
              <ProgressBar
                progress={(pityProgress.current / pityProgress.threshold) * 100}
                size="small"
              />
              <Text size="small" appearance="subdued">
                {pityProgress.message}
              </Text>
            </BlockStack>
          )}
        </BlockStack>
      </View>
    </Modal>
  );
}
