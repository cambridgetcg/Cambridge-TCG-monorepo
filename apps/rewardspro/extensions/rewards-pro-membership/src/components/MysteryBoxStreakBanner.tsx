import {
  BlockStack,
  InlineStack,
  Text,
  View,
  Button,
  Progress,
} from '@shopify/ui-extensions-react/customer-account';

// ============================================
// TYPES
// ============================================

export interface MysteryBoxStreakInfo {
  currentStreak: number;
  longestStreak: number;
  streakEmoji: string;
  streakLabel: string;
  bonusMultiplier: number;
  bonusPercent: number;
  hoursUntilStreakLoss: number;
  freeOpensAvailable: number;
  canClaimFreeOpen: boolean;
}

interface MysteryBoxStreakBannerProps {
  streak: MysteryBoxStreakInfo;
  onClaimFreeOpen: () => Promise<void>;
  isClaimingFreeOpen: boolean;
  translate: (key: string, options?: Record<string, string>) => string;
}

// ============================================
// COMPONENT
// ============================================

export function MysteryBoxStreakBanner({
  streak,
  onClaimFreeOpen,
  isClaimingFreeOpen,
  translate,
}: MysteryBoxStreakBannerProps) {
  const hasStreak = streak.currentStreak > 0;
  const hasBonus = streak.bonusPercent > 0;

  // Don't show if no streak and no free opens
  if (!hasStreak && !streak.canClaimFreeOpen) {
    return null;
  }

  // Calculate progress to next tier (simplified)
  const streakTiers = [3, 7, 14, 30];
  const nextTier = streakTiers.find((t) => t > streak.currentStreak) || 30;
  const prevTier = [...streakTiers].reverse().find((t) => t <= streak.currentStreak) || 0;
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
            {streak.streakEmoji || '📦'} {streak.currentStreak > 0
              ? translate('mysteryBoxes.streakDays', { days: String(streak.currentStreak) })
              : translate('mysteryBoxes.startStreak')}
          </Text>
          {hasBonus && (
            <Text size="small" appearance="accent">
              +{streak.bonusPercent}% {translate('mysteryBoxes.bonusRewards')}
            </Text>
          )}
        </InlineStack>

        {/* Progress Bar */}
        {hasStreak && streak.currentStreak < 30 && (
          <View>
            <Progress progress={progress} size="small" />
            <Text size="small" appearance="subdued">
              {nextTier - streak.currentStreak} {translate('mysteryBoxes.daysToNextTier')}
            </Text>
          </View>
        )}

        {/* Streak Loss Warning */}
        {hasStreak && streak.hoursUntilStreakLoss > 0 && streak.hoursUntilStreakLoss <= 24 && (
          <Text size="small" appearance="warning">
            {translate('mysteryBoxes.streakWarning', { hours: String(streak.hoursUntilStreakLoss) })}
          </Text>
        )}

        {/* Free Open Button */}
        {streak.canClaimFreeOpen && (
          <Button
            kind="primary"
            onPress={onClaimFreeOpen}
            disabled={isClaimingFreeOpen}
          >
            {isClaimingFreeOpen
              ? translate('mysteryBoxes.claimingFreeOpen')
              : `🎁 ${translate('mysteryBoxes.claimFreeOpen')}`}
          </Button>
        )}
      </BlockStack>
    </View>
  );
}
