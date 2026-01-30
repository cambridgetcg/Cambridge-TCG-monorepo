import {
  BlockStack,
  InlineStack,
  Text,
  View,
  ProgressBar,
} from '@shopify/ui-extensions-react/customer-account';

// ============================================
// TYPES
// ============================================

export interface PityProgressInfo {
  current: number;
  threshold: number;
  progress: number;
  willTrigger: boolean;
  minimumRarity: 'COMMON' | 'UNCOMMON' | 'RARE';
}

interface MysteryBoxPityProgressProps {
  pity: PityProgressInfo;
  translate: (key: string, options?: Record<string, string>) => string;
}

// ============================================
// COMPONENT
// ============================================

export function MysteryBoxPityProgress({
  pity,
  translate,
}: MysteryBoxPityProgressProps) {
  // Don't show if at 0 or if pity system is not enabled (threshold = 0)
  if (pity.threshold <= 0) {
    return null;
  }

  const opensUntilPity = Math.max(0, pity.threshold - pity.current);
  const isNearGuarantee = opensUntilPity <= 2;
  const isGuaranteed = pity.willTrigger;

  return (
    <View
      border="none"
      cornerRadius="base"
      padding="tight"
      background={isGuaranteed ? 'success' : 'subdued'}
    >
      <BlockStack spacing="extraTight">
        {/* Header */}
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="small" emphasis={isGuaranteed ? 'bold' : undefined}>
            {isGuaranteed ? '🎁 ' : '🛡️ '}{translate('mysteryBoxes.luckProtection')}
          </Text>
          {isGuaranteed && (
            <Text size="small" appearance="success" emphasis="bold">
              {translate('mysteryBoxes.guaranteedNext', { rarity: pity.minimumRarity })}
            </Text>
          )}
        </InlineStack>

        {/* Progress bar */}
        {!isGuaranteed && (
          <>
            <ProgressBar
              progress={pity.progress}
              size="small"
            />
            <Text size="small" appearance={isNearGuarantee ? 'warning' : 'subdued'}>
              {isNearGuarantee
                ? translate('mysteryBoxes.almostGuaranteed', { opens: String(opensUntilPity) })
                : translate('mysteryBoxes.opensUntilGuaranteed', { opens: String(opensUntilPity) })}
            </Text>
          </>
        )}
      </BlockStack>
    </View>
  );
}

// ============================================
// MINIMAL VERSION FOR CARD DISPLAY
// ============================================

interface MysteryBoxPityBadgeProps {
  pity: PityProgressInfo;
  translate: (key: string, options?: Record<string, string>) => string;
}

export function MysteryBoxPityBadge({
  pity,
  translate,
}: MysteryBoxPityBadgeProps) {
  if (pity.threshold <= 0) {
    return null;
  }

  const opensUntilPity = Math.max(0, pity.threshold - pity.current);
  const isNearGuarantee = opensUntilPity <= 2;

  if (!isNearGuarantee) {
    return null;
  }

  return (
    <View padding="tight" background="success" cornerRadius="base">
      <Text size="small" emphasis="bold">
        🎁 {pity.willTrigger
          ? translate('mysteryBoxes.guaranteedRare')
          : translate('mysteryBoxes.nearGuarantee', { opens: String(opensUntilPity) })}
      </Text>
    </View>
  );
}
