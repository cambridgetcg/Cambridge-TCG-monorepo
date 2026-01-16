import { useState, useCallback } from 'react';
import {
  BlockStack,
  Text,
  View,
  InlineStack,
  Divider,
  Button,
  Badge,
  Spinner,
  Banner,
} from '@shopify/ui-extensions-react/customer-account';

export interface RedemptionTierInfo {
  id: string;
  name: string;
  pointsCost: number;
  discountValue: number;
  discountType: 'fixed' | 'percentage';
  available: boolean;
}

export interface RedemptionResult {
  success: boolean;
  discountCode?: string;
  discountValue?: number;
  expiresAt?: string;
  pointsSpent?: number;
  remainingBalance?: number;
  error?: string;
}

interface PointsRedemptionProps {
  availablePoints: number;
  redemptionTiers: RedemptionTierInfo[];
  currencyName: string;
  shopCurrency: string;
  translate: (key: string, options?: Record<string, string>) => string;
  onRedeem: (tierId: string) => Promise<RedemptionResult>;
}

function formatCurrency(
  amount: number,
  currency: string,
  locale: string = 'en-US'
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function RedemptionTierRow({
  tier,
  availablePoints,
  currencyName,
  shopCurrency,
  translate,
  onSelect,
  isLoading,
  selectedTierId
}: {
  tier: RedemptionTierInfo;
  availablePoints: number;
  currencyName: string;
  shopCurrency: string;
  translate: (key: string, options?: Record<string, string>) => string;
  onSelect: (tierId: string) => void;
  isLoading: boolean;
  selectedTierId: string | null;
}) {
  const canAfford = availablePoints >= tier.pointsCost;
  const isSelected = selectedTierId === tier.id;

  const discountLabel = tier.discountType === 'percentage'
    ? `${tier.discountValue}% off`
    : formatCurrency(tier.discountValue, shopCurrency);

  return (
    <View
      border="base"
      cornerRadius="base"
      padding="tight"
      background={canAfford ? 'base' : 'subdued'}
    >
      <InlineStack spacing="tight" blockAlignment="center">
        <View inlineSize="fill">
          <BlockStack spacing="extraTight">
            <Text size="small" emphasis="bold">
              {tier.name}
            </Text>
            <Text size="small" appearance="subdued">
              {tier.pointsCost.toLocaleString()} {currencyName}
            </Text>
          </BlockStack>
        </View>
        <Badge>
          {discountLabel}
        </Badge>
        <Button
          kind={canAfford ? 'primary' : 'secondary'}
          disabled={!canAfford || isLoading || !tier.available}
          loading={isLoading && isSelected}
          onPress={() => onSelect(tier.id)}
          accessibilityLabel={translate('points.redemption.redeemAccess', {
            tierName: tier.name
          })}
        >
          {translate('points.redemption.redeemButton')}
        </Button>
      </InlineStack>
    </View>
  );
}

function RedemptionSuccess({
  result,
  shopCurrency,
  translate
}: {
  result: RedemptionResult;
  shopCurrency: string;
  translate: (key: string, options?: Record<string, string>) => string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (result.discountCode) {
      try {
        await navigator.clipboard.writeText(result.discountCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Fallback if clipboard API not available
      }
    }
  }, [result.discountCode]);

  return (
    <View border="base" cornerRadius="base" padding="base" background="subdued">
      <BlockStack spacing="base">
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="large"></Text>
          <Text size="medium" emphasis="bold">
            {translate('points.redemption.success')}
          </Text>
        </InlineStack>

        <Divider />

        <BlockStack spacing="tight">
          <Text size="small" appearance="subdued">
            {translate('points.redemption.discountCode')}
          </Text>
          <InlineStack spacing="tight" blockAlignment="center">
            <View
              border="base"
              cornerRadius="base"
              padding="tight"
              background="base"
            >
              <Text size="medium" emphasis="bold">
                {result.discountCode}
              </Text>
            </View>
            <Button kind="secondary" onPress={handleCopy}>
              {copied
                ? translate('points.redemption.copied')
                : translate('points.redemption.copy')
              }
            </Button>
          </InlineStack>
        </BlockStack>

        {result.discountValue && (
          <Text size="small">
            {translate('points.redemption.discountAmount', {
              amount: formatCurrency(result.discountValue, shopCurrency)
            })}
          </Text>
        )}

        {result.remainingBalance !== undefined && (
          <Text size="small" appearance="subdued">
            {translate('points.redemption.remainingBalance', {
              balance: String(result.remainingBalance)
            })}
          </Text>
        )}
      </BlockStack>
    </View>
  );
}

export function PointsRedemption({
  availablePoints,
  redemptionTiers,
  currencyName,
  shopCurrency,
  translate,
  onRedeem
}: PointsRedemptionProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [result, setResult] = useState<RedemptionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRedeem = useCallback(async (tierId: string) => {
    setIsLoading(true);
    setSelectedTierId(tierId);
    setError(null);
    setResult(null);

    try {
      const redemptionResult = await onRedeem(tierId);

      if (redemptionResult.success) {
        setResult(redemptionResult);
      } else {
        setError(redemptionResult.error || translate('points.redemption.error'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('points.redemption.error'));
    } finally {
      setIsLoading(false);
      setSelectedTierId(null);
    }
  }, [onRedeem, translate]);

  const handleReset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  // Show success state
  if (result?.success) {
    return (
      <BlockStack spacing="tight">
        <RedemptionSuccess
          result={result}
          shopCurrency={shopCurrency}
          translate={translate}
        />
        <Button kind="plain" onPress={handleReset}>
          {translate('points.redemption.redeemAnother')}
        </Button>
      </BlockStack>
    );
  }

  // Filter to available tiers only
  const availableTiers = redemptionTiers.filter(t => t.available);

  if (availableTiers.length === 0) {
    return (
      <View border="base" cornerRadius="base" padding="base" background="subdued">
        <Text size="small" appearance="subdued">
          {translate('points.redemption.noTiers')}
        </Text>
      </View>
    );
  }

  return (
    <View border="base" cornerRadius="base" padding="base" background="base">
      <BlockStack spacing="base">
        <Text emphasis="bold">{translate('points.redemption.title')}</Text>
        <Divider />

        {error && (
          <Banner status="critical">{error}</Banner>
        )}

        <BlockStack spacing="tight">
          {availableTiers.map((tier) => (
            <RedemptionTierRow
              key={tier.id}
              tier={tier}
              availablePoints={availablePoints}
              currencyName={currencyName}
              shopCurrency={shopCurrency}
              translate={translate}
              onSelect={handleRedeem}
              isLoading={isLoading}
              selectedTierId={selectedTierId}
            />
          ))}
        </BlockStack>

        <Text size="small" appearance="subdued">
          {translate('points.redemption.balance', {
            balance: availablePoints.toLocaleString(),
            currencyName
          })}
        </Text>
      </BlockStack>
    </View>
  );
}
