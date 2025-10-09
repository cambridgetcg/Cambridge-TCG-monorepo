/**
 * StoreCreditCard - Displays available store credit balance
 */

import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  useApi,
} from '@shopify/ui-extensions-react/customer-account';

interface StoreCreditCardProps {
  balance: number;
  balanceFormatted: string;
  pendingCredit: number;
  currency: string;
  formatCurrency: (amount: number) => string;
}

export function StoreCreditCard({
  balance,
  balanceFormatted,
  pendingCredit,
  currency,
  formatCurrency,
}: StoreCreditCardProps) {
  const { analytics } = useApi();

  // Track store credit view
  analytics.publish('store_credit_view', {
    balance,
    pending_credit: pendingCredit,
    has_balance: balance > 0,
    has_pending: pendingCredit > 0,
  });

  return (
    <Card>
      <BlockStack spacing="base" role="region" aria-label="Store credit balance">
        {/* Header */}
        <Text size="large" emphasis="bold" id="credit-header">
          Store Credit
        </Text>

        {/* Available Balance */}
        <BlockStack spacing="extraTight">
          <Text size="small" appearance="subdued" id="balance-label">
            Available Balance
          </Text>
          <Text
            size="extraLarge"
            emphasis="bold"
            aria-labelledby="balance-label"
            aria-live="polite"
          >
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
              <Text size="small" appearance="subdued" id="pending-label">
                Pending Credit
              </Text>
              <Badge tone="warning">Processing</Badge>
            </InlineStack>
            <Text
              size="medium"
              emphasis="bold"
              aria-labelledby="pending-label"
              role="status"
            >
              {formatCurrency(pendingCredit)}
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
