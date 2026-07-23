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
import type { GiftCardBundle, IssuedGiftCard, ConvertResult } from '../hooks/useGiftCards';

// ============================================
// TYPES
// ============================================

interface GiftCardsTabProps {
  bundles: GiftCardBundle[];
  issuedGiftCards: IssuedGiftCard[];
  storeCredit: number;
  tierName: string | null;
  tierBonus: number;
  enableConversion: boolean;
  isLoading: boolean;
  error: string | null;
  customerId: string | null;
  onConvert: (amount: number) => Promise<ConvertResult>;
  translate: (key: string, options?: Record<string, string | number>) => string;
}

// ============================================
// HELPERS
// ============================================

function fmtCurrency(amount: number, compact?: boolean): string {
  if (compact && amount >= 1000) {
    return `£${(amount / 1000).toFixed(1)}k`;
  }
  return `£${amount.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ============================================
// SUB-COMPONENTS
// ============================================

interface BalanceCardProps {
  storeCredit: number;
  tierName: string | null;
  tierBonus: number;
  translate: GiftCardsTabProps['translate'];
}

function BalanceCard({ storeCredit, tierName, tierBonus, translate }: BalanceCardProps) {
  return (
    <View border="base" borderRadius="base" padding="base">
      <BlockStack spacing="tight">
        <Text size="small" appearance="subdued">
          {translate('giftCards.availableCredit')}
        </Text>
        <Text size="extraLarge" emphasis="bold">
          {fmtCurrency(storeCredit)}
        </Text>
        {tierName && tierBonus > 0 && (
          <InlineStack spacing="tight" blockAlignment="center">
            <Badge>{tierName}</Badge>
            <Text size="small" appearance="subdued">
              {translate('giftCards.tierBonus', { bonus: tierBonus })}
            </Text>
          </InlineStack>
        )}
      </BlockStack>
    </View>
  );
}

interface BundleCardProps {
  bundle: GiftCardBundle;
  storeCredit: number;
  isConverting: boolean;
  onConvert: (amount: number) => void;
  translate: GiftCardsTabProps['translate'];
}

function BundleCard({ bundle, storeCredit, isConverting, onConvert, translate }: BundleCardProps) {
  const canAfford = storeCredit >= bundle.price;

  return (
    <View border="base" borderRadius="base" padding="base">
      <BlockStack spacing="tight">
        <InlineStack blockAlignment="center" spacing="base">
          <BlockStack spacing="none">
            <Text emphasis="bold">{bundle.name}</Text>
            {bundle.description && (
              <Text size="small" appearance="subdued">{bundle.description}</Text>
            )}
          </BlockStack>
          {bundle.tierName && (
            <Badge>{bundle.tierName}</Badge>
          )}
        </InlineStack>
        <InlineStack blockAlignment="center" spacing="base">
          <BlockStack spacing="none">
            <Text size="small" appearance="subdued">{translate('giftCards.value')}</Text>
            <Text emphasis="bold">{fmtCurrency(bundle.giftCardValue)}</Text>
          </BlockStack>
          <BlockStack spacing="none">
            <Text size="small" appearance="subdued">{translate('giftCards.cost')}</Text>
            <Text emphasis={canAfford ? 'bold' : undefined} appearance={canAfford ? undefined : 'subdued'}>
              {fmtCurrency(bundle.price)}
            </Text>
          </BlockStack>
        </InlineStack>
        <Button
          kind="primary"
          disabled={!canAfford || isConverting}
          onPress={() => onConvert(bundle.price)}
          accessibilityLabel={translate('giftCards.convertA11y', { value: fmtCurrency(bundle.giftCardValue) })}
        >
          {isConverting
            ? translate('giftCards.converting')
            : canAfford
              ? translate('giftCards.convertCta', { value: fmtCurrency(bundle.giftCardValue) })
              : translate('giftCards.insufficientCredit')}
        </Button>
      </BlockStack>
    </View>
  );
}

interface IssuedCardRowProps {
  card: IssuedGiftCard;
  translate: GiftCardsTabProps['translate'];
}

function IssuedCardRow({ card, translate }: IssuedCardRowProps) {
  const label = card.lastFourDigits
    ? `•••• ${card.lastFourDigits}`
    : translate('giftCards.pendingCode');

  return (
    <View padding="base">
      <InlineStack blockAlignment="center" spacing="base">
        <BlockStack spacing="none">
          <Text emphasis="bold">{label}</Text>
          <Text size="small" appearance="subdued">
            {translate('giftCards.issued')} {fmtDate(card.createdAt)}
          </Text>
          {card.redeemedAt && (
            <Text size="small" appearance="subdued">
              {translate('giftCards.redeemed')} {fmtDate(card.redeemedAt)}
            </Text>
          )}
        </BlockStack>
        <BlockStack spacing="none" inlineAlignment="end">
          <Text emphasis="bold">{fmtCurrency(card.totalValue)}</Text>
          <Badge>
            {card.status.charAt(0) + card.status.slice(1).toLowerCase()}
          </Badge>
        </BlockStack>
      </InlineStack>
    </View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function GiftCardsTab({
  bundles,
  issuedGiftCards,
  storeCredit,
  tierName,
  tierBonus,
  enableConversion,
  isLoading,
  error,
  onConvert,
  translate,
}: GiftCardsTabProps) {
  const [convertingBundleIndex, setConvertingBundleIndex] = useState<number | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertSuccess, setConvertSuccess] = useState<string | null>(null);

  const handleConvert = useCallback(async (amount: number, index: number) => {
    setConvertingBundleIndex(index);
    setConvertError(null);
    setConvertSuccess(null);

    const result = await onConvert(amount);

    setConvertingBundleIndex(null);

    if (result.success) {
      setConvertSuccess(result.message || translate('giftCards.convertSuccess'));
    } else {
      setConvertError(result.error || translate('giftCards.convertError'));
    }
  }, [onConvert, translate]);

  // ── Loading state ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <BlockStack spacing="base">
        <SkeletonText size="medium" />
        <SkeletonText size="small" />
        <SkeletonText size="small" />
      </BlockStack>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (error) {
    return (
      <Banner status="critical">
        <Text>{error}</Text>
      </Banner>
    );
  }

  const hasAnything = bundles.length > 0 || issuedGiftCards.length > 0;

  // ── Empty state ───────────────────────────────────────────────────────
  if (!hasAnything && !enableConversion) {
    return (
      <View padding="base">
        <BlockStack spacing="tight" inlineAlignment="center">
          <Text size="extraLarge">🎁</Text>
          <Text emphasis="bold">{translate('giftCards.emptyTitle')}</Text>
          <Text appearance="subdued" size="small">{translate('giftCards.emptySubtitle')}</Text>
        </BlockStack>
      </View>
    );
  }

  return (
    <BlockStack spacing="base">
      {/* Success / error feedback */}
      {convertSuccess && (
        <Banner status="success" onDismiss={() => setConvertSuccess(null)}>
          <Text>{convertSuccess}</Text>
        </Banner>
      )}
      {convertError && (
        <Banner status="critical" onDismiss={() => setConvertError(null)}>
          <Text>{convertError}</Text>
        </Banner>
      )}

      {/* Balance card */}
      <BalanceCard
        storeCredit={storeCredit}
        tierName={tierName}
        tierBonus={tierBonus}
        translate={translate}
      />

      {/* Convert bundles */}
      {enableConversion && bundles.length > 0 && (
        <BlockStack spacing="tight">
          <Text emphasis="bold">{translate('giftCards.availableBundles')}</Text>
          {bundles.map((bundle, i) => (
            <BundleCard
              key={bundle.id}
              bundle={bundle}
              storeCredit={storeCredit}
              isConverting={convertingBundleIndex === i}
              onConvert={(amount) => handleConvert(amount, i)}
              translate={translate}
            />
          ))}
        </BlockStack>
      )}

      {/* Custom amount convert (when no bundles but conversion enabled) */}
      {enableConversion && bundles.length === 0 && storeCredit > 0 && (
        <View border="base" borderRadius="base" padding="base">
          <BlockStack spacing="base">
            <Text emphasis="bold">{translate('giftCards.convertAll')}</Text>
            <Text size="small" appearance="subdued">
              {translate('giftCards.convertAllDesc')}
            </Text>
            <Button
              kind="primary"
              disabled={convertingBundleIndex !== null}
              onPress={() => handleConvert(storeCredit, 0)}
            >
              {convertingBundleIndex !== null
                ? translate('giftCards.converting')
                : translate('giftCards.convertAllCta', { amount: fmtCurrency(storeCredit) })}
            </Button>
          </BlockStack>
        </View>
      )}

      {/* Issued cards history */}
      {issuedGiftCards.length > 0 && (
        <BlockStack spacing="tight">
          <Divider />
          <Text emphasis="bold">{translate('giftCards.myCards')}</Text>
          {issuedGiftCards.map((card, i) => (
            <View key={card.id}>
              <IssuedCardRow card={card} translate={translate} />
              {i < issuedGiftCards.length - 1 && <Divider />}
            </View>
          ))}
        </BlockStack>
      )}
    </BlockStack>
  );
}
