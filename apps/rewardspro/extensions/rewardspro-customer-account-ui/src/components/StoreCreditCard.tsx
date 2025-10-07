/**
 * StoreCreditCard - Displays available store credit balance
 */

import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
} from '@shopify/ui-extensions-react/customer-account';

interface StoreCreditCardProps {
  balance: number;
  balanceFormatted: string;
  pendingCredit: number;
  currency: string;
}

export function StoreCreditCard({
  balance,
  balanceFormatted,
  pendingCredit,
  currency,
}: StoreCreditCardProps) {
  return (
    <Card>
      <BlockStack spacing="base">
        {/* Header */}
        <Text size="large" emphasis="bold">
          Store Credit
        </Text>

        {/* Available Balance */}
        <BlockStack spacing="extraTight">
          <Text size="small" appearance="subdued">
            Available Balance
          </Text>
          <Text size="extraLarge" emphasis="bold">
            {balanceFormatted}
          </Text>
          {balance > 0 && (
            <Text size="small" appearance="subdued">
              Apply at checkout to save on your next purchase
            </Text>
          )}
          {balance === 0 && (
            <Text size="small" appearance="subdued">
              Start earning credit with your purchases
            </Text>
          )}
        </BlockStack>

        {/* Pending Credit */}
        {pendingCredit > 0 && (
          <BlockStack spacing="extraTight">
            <InlineStack spacing="tight" blockAlignment="center">
              <Text size="small" appearance="subdued">
                Pending Credit
              </Text>
              <Badge tone="warning">Processing</Badge>
            </InlineStack>
            <Text size="medium" emphasis="bold">
              {currency}{pendingCredit.toFixed(2)}
            </Text>
            <Text size="small" appearance="subdued">
              Will be available once your order is fulfilled
            </Text>
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
