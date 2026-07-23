import { useState } from 'react';
import {
  BlockStack,
  InlineStack,
  Text,
  View,
  Modal,
} from '@shopify/ui-extensions-react/customer-account';

// ============================================
// TYPES
// ============================================

export interface InstantWinPrize {
  name: string;
  rarity: string;
  prizeType: string;
}

export interface InstantWin {
  won: boolean;
  prize: InstantWinPrize | null;
  nearMiss: { name: string; rarity: string } | null;
  message: string;
}

export interface CelebrationEvent {
  type: 'STREAK_MILESTONE' | 'INSTANT_WIN' | 'LUCKY_NUMBER' | 'EARLY_BIRD';
  data: Record<string, unknown>;
  message: string;
  emoji: string;
}

interface InstantWinRevealProps {
  wins: InstantWin[];
  celebrations: CelebrationEvent[];
  onDismiss: () => void;
  translate: (key: string, options?: Record<string, string>) => string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getRarityLabel(rarity: string): string {
  return rarity.charAt(0) + rarity.slice(1).toLowerCase();
}

// ============================================
// COMPONENT
// ============================================

export function InstantWinReveal({
  wins,
  celebrations,
  onDismiss,
  translate,
}: InstantWinRevealProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Combine all celebrations
  const allCelebrations: Array<{
    type: string;
    title: string;
    message: string;
    emoji: string;
    rarity?: string;
  }> = [];

  // Add instant wins
  for (const win of wins) {
    if (win.won && win.prize) {
      allCelebrations.push({
        type: 'INSTANT_WIN',
        title: translate('raffles.instantWinTitle'),
        message: win.message,
        emoji: '✨',
        rarity: win.prize.rarity,
      });
    }
  }

  // Add other celebrations
  for (const celebration of celebrations) {
    if (celebration.type !== 'INSTANT_WIN') {
      allCelebrations.push({
        type: celebration.type,
        title: getCelebrationTitle(celebration.type, translate),
        message: celebration.message,
        emoji: celebration.emoji,
      });
    }
  }

  // Nothing to show
  if (allCelebrations.length === 0) {
    return null;
  }

  const current = allCelebrations[currentIndex];
  const hasMore = currentIndex < allCelebrations.length - 1;

  const handleNext = () => {
    if (hasMore) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      onDismiss();
    }
  };

  return (
    <Modal
      id="instant-win-reveal"
      title={current.title}
      onClose={onDismiss}
      primaryAction={{
        content: hasMore ? translate('raffles.next') : translate('raffles.continue'),
        onAction: handleNext,
      }}
    >
      <View padding="large">
        <BlockStack spacing="large" inlineAlignment="center">
          {/* Big Emoji */}
          <Text size="extraLarge">
            {current.emoji}
          </Text>

          {/* Rarity Badge (for instant wins) */}
          {current.rarity && (
            <View
              padding="tight"
              cornerRadius="base"
              background="subdued"
            >
              <Text
                size="small"
                emphasis="bold"
              >
                {getRarityLabel(current.rarity)}
              </Text>
            </View>
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

// ============================================
// HELPER
// ============================================

function getCelebrationTitle(
  type: string,
  translate: (key: string, options?: Record<string, string>) => string
): string {
  switch (type) {
    case 'STREAK_MILESTONE':
      return translate('raffles.streakMilestoneTitle');
    case 'LUCKY_NUMBER':
      return translate('raffles.luckyNumberTitle');
    case 'EARLY_BIRD':
      return translate('raffles.earlyBirdTitle');
    default:
      return translate('raffles.bonusTitle');
  }
}

// ============================================
// PURCHASE RESULT WITH CELEBRATIONS
// ============================================

interface PurchaseResultDisplayProps {
  entriesCount: number;
  finalEntries: number;
  pointsSpent: number;
  wins: InstantWin[];
  celebrations: CelebrationEvent[];
  onDismiss: () => void;
  translate: (key: string, options?: Record<string, string>) => string;
}

export function PurchaseResultDisplay({
  entriesCount,
  finalEntries,
  pointsSpent,
  wins,
  celebrations,
  onDismiss,
  translate,
}: PurchaseResultDisplayProps) {
  const [showCelebrations, setShowCelebrations] = useState(true);
  const bonusEntries = finalEntries - entriesCount;
  const hasWins = wins.some((w) => w.won);
  const hasCelebrations = celebrations.length > 0 || hasWins;

  // Show celebration modal first, then summary
  if (showCelebrations && hasCelebrations) {
    return (
      <InstantWinReveal
        wins={wins}
        celebrations={celebrations}
        onDismiss={() => setShowCelebrations(false)}
        translate={translate}
      />
    );
  }

  // Show summary
  return (
    <Modal
      id="purchase-result"
      title={translate('raffles.purchaseSuccess')}
      onClose={onDismiss}
      primaryAction={{
        content: translate('raffles.continue'),
        onAction: onDismiss,
      }}
    >
      <View padding="base">
        <BlockStack spacing="base">
          {/* Entries summary */}
          <InlineStack spacing="tight" blockAlignment="center">
            <Text size="large">🎟️</Text>
            <Text size="medium" emphasis="bold">
              {finalEntries} {translate('raffles.entriesAdded')}
            </Text>
          </InlineStack>

          {/* Bonus breakdown */}
          {bonusEntries > 0 && (
            <Text size="small" appearance="success">
              +{bonusEntries} {translate('raffles.bonusEntriesEarned')}
            </Text>
          )}

          {/* Points spent */}
          <Text size="small" appearance="subdued">
            {translate('raffles.pointsSpent', { points: String(pointsSpent) })}
          </Text>

          {/* Instant wins summary */}
          {hasWins && (
            <View padding="base" background="success" cornerRadius="base">
              <Text size="small" emphasis="bold">
                ✨ {wins.filter((w) => w.won).length} {translate('raffles.instantWinsWon')}
              </Text>
            </View>
          )}
        </BlockStack>
      </View>
    </Modal>
  );
}
