import {
  BlockStack,
  InlineStack,
  Text,
  View,
  Button,
} from '@shopify/ui-extensions-react/customer-account';

// ============================================
// TYPES
// ============================================

export interface RaffleStreakInfo {
  currentStreak: number;
  longestStreak: number;
  streakEmoji: string;
  streakLabel: string;
  bonusMultiplier: number;
  bonusPercent: number;
  hoursUntilStreakLoss: number;
  freeEntriesAvailable: number;
  canClaimFreeEntry: boolean;
}

interface RaffleStreakBannerProps {
  streak: RaffleStreakInfo;
  onClaimFreeEntry: () => Promise<void>;
  isClaimingFreeEntry: boolean;
  translate: (key: string, options?: Record<string, string>) => string;
}

// ============================================
// COMPONENT
// ============================================

export function RaffleStreakBanner({
  streak,
  onClaimFreeEntry,
  isClaimingFreeEntry,
  translate,
}: RaffleStreakBannerProps) {
  const hasStreak = streak.currentStreak > 0;
  const hasBonus = streak.bonusPercent > 0;

  // Don't show if no streak and no free entries
  if (!hasStreak && !streak.canClaimFreeEntry) {
    return null;
  }

  // Calculate progress to next tier (simplified)
  const streakTiers = [3, 7, 14, 30];
  const nextTier = streakTiers.find((t) => t > streak.currentStreak) || 30;
  const prevTier = streakTiers.reverse().find((t) => t <= streak.currentStreak) || 0;
  const progress = prevTier === nextTier
    ? 100
    : ((streak.currentStreak - prevTier) / (nextTier - prevTier)) * 100;

  return (
    <View
      border="base"
      cornerRadius="base"
      padding="base"
      background="subdued"
    >
      <BlockStack spacing="base">
        {/* Header Row */}
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="medium" emphasis="bold">
            {streak.streakEmoji || '✨'} {streak.currentStreak > 0
              ? translate('raffles.streakDays', { days: String(streak.currentStreak) })
              : translate('raffles.startStreak')}
          </Text>
          {hasBonus && (
            <Text size="small" appearance="accent">
              +{streak.bonusPercent}% {translate('raffles.bonusEntries')}
            </Text>
          )}
        </InlineStack>

        {/* Progress Bar (custom - ProgressBar not available in customer-account extensions) */}
        {hasStreak && streak.currentStreak < 30 && (
          <BlockStack spacing="tight">
            <View
              border="base"
              cornerRadius="fullyRounded"
              background="subdued"
              minBlockSize="fill"
            >
              <View
                cornerRadius="fullyRounded"
                background="interactive"
                inlineSize={`${Math.min(100, Math.max(0, progress))}%`}
                minBlockSize="fill"
                padding="tight"
              />
            </View>
            <Text size="small" appearance="subdued">
              {nextTier - streak.currentStreak} {translate('raffles.daysToNextTier')}
            </Text>
          </BlockStack>
        )}

        {/* Streak Loss Warning */}
        {hasStreak && streak.hoursUntilStreakLoss > 0 && streak.hoursUntilStreakLoss <= 24 && (
          <Text size="small" appearance="warning">
            {translate('raffles.streakWarning', { hours: String(streak.hoursUntilStreakLoss) })}
          </Text>
        )}

        {/* Free Entry Button */}
        {streak.canClaimFreeEntry && (
          <Button
            kind="primary"
            onPress={onClaimFreeEntry}
            disabled={isClaimingFreeEntry}
          >
            {isClaimingFreeEntry
              ? translate('raffles.claimingFreeEntry')
              : `🎁 ${translate('raffles.claimFreeEntry')}`}
          </Button>
        )}
      </BlockStack>
    </View>
  );
}
