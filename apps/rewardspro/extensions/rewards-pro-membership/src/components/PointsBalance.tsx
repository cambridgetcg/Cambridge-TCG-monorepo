import {
  BlockStack,
  Text,
  View,
  InlineStack,
  Divider,
} from '@shopify/ui-extensions-react/customer-account';

export interface PointsBalanceInfo {
  available: number;
  lifetime: number;
  expiringSoon: { amount: number; expiresAt: string } | null;
}

export interface PointsCurrencyInfo {
  name: string;
  plural: string;
  icon: string;
}

interface PointsBalanceProps {
  balance: PointsBalanceInfo;
  currency: PointsCurrencyInfo;
  translate: (key: string, options?: Record<string, string>) => string;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function PointsBalance({ balance, currency, translate }: PointsBalanceProps) {
  const currencyLabel = balance.available === 1 ? currency.name : currency.plural;

  return (
    <View border="base" cornerRadius="base" padding="base" background="base">
      <BlockStack spacing="tight">
        {/* Available Points */}
        <BlockStack spacing="extraTight">
          <Text size="small" appearance="subdued">
            {translate('points.balance.available')}
          </Text>
          <InlineStack spacing="tight" blockAlignment="center">
            <Text size="large" emphasis="bold">
              {currency.icon}
            </Text>
            <Text size="large" emphasis="bold">
              {formatNumber(balance.available)} {currencyLabel}
            </Text>
          </InlineStack>
        </BlockStack>

        {/* Lifetime Stats */}
        {balance.lifetime > 0 && (
          <>
            <Divider />
            <InlineStack spacing="base" blockAlignment="center">
              <View inlineSize="fill">
                <BlockStack spacing="extraTight">
                  <Text size="small" appearance="subdued">
                    {translate('points.balance.lifetime')}
                  </Text>
                  <Text size="small" emphasis="bold">
                    {formatNumber(balance.lifetime)} {currency.plural}
                  </Text>
                </BlockStack>
              </View>
            </InlineStack>
          </>
        )}
      </BlockStack>
    </View>
  );
}
