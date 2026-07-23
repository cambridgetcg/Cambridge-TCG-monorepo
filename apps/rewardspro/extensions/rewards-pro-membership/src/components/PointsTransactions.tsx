import {
  BlockStack,
  Text,
  View,
  InlineStack,
  Divider,
} from '@shopify/ui-extensions-react/customer-account';

export interface PointsTransactionInfo {
  id: string;
  type: string;
  amount: number;
  date: string;
  description: string;
  orderNumber?: string | null;
}

interface PointsTransactionsProps {
  transactions: PointsTransactionInfo[];
  currencyName: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
  maxDisplay?: number;
}

function getTransactionIcon(type: string): string {
  switch (type) {
    case 'POINTS_EARNED':
    case 'ORDER_POINTS':
      return '';
    case 'POINTS_REDEEMED':
    case 'REDEMPTION':
      return '';
    case 'BONUS_POINTS':
    case 'STREAK_BONUS':
      return '';
    case 'POINTS_EXPIRED':
      return '';
    case 'MANUAL_ADJUSTMENT':
      return '';
    case 'REFERRAL_BONUS':
      return '';
    default:
      return '';
  }
}

function formatDate(dateString: string, locale: string = 'en-US'): string {
  try {
    return new Date(dateString).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

function TransactionRow({
  transaction,
  locale
}: {
  transaction: PointsTransactionInfo;
  currencyName: string;
  locale: string;
}) {
  const isPositive = transaction.amount > 0;
  const icon = getTransactionIcon(transaction.type);
  const formattedDate = formatDate(transaction.date, locale);
  const formattedAmount = Math.abs(transaction.amount).toLocaleString();

  return (
    <InlineStack spacing="tight" blockAlignment="center">
      <Text size="small">{icon}</Text>
      <View inlineSize="fill">
        <BlockStack spacing="extraTight">
          <Text size="small">{transaction.description}</Text>
          <Text size="small" appearance="subdued">{formattedDate}</Text>
        </BlockStack>
      </View>
      <Text
        size="small"
        emphasis="bold"
        appearance={isPositive ? 'success' : 'subdued'}
      >
        {isPositive ? '+' : '-'}{formattedAmount}
      </Text>
    </InlineStack>
  );
}

export function PointsTransactions({
  transactions,
  currencyName,
  locale,
  translate,
  maxDisplay = 5
}: PointsTransactionsProps) {
  if (transactions.length === 0) {
    return (
      <View border="base" cornerRadius="base" padding="base" background="base">
        <BlockStack spacing="tight">
          <Text emphasis="bold">{translate('points.transactions.title')}</Text>
          <Divider />
          <Text size="small" appearance="subdued">
            {translate('points.transactions.empty')}
          </Text>
        </BlockStack>
      </View>
    );
  }

  const displayTransactions = transactions.slice(0, maxDisplay);

  return (
    <View border="base" cornerRadius="base" padding="base" background="base">
      <BlockStack spacing="base">
        <Text emphasis="bold">{translate('points.transactions.title')}</Text>
        <Divider />
        <BlockStack spacing="tight">
          {displayTransactions.map((tx) => (
            <TransactionRow
              key={tx.id}
              transaction={tx}
              currencyName={currencyName}
              locale={locale}
            />
          ))}
        </BlockStack>
      </BlockStack>
    </View>
  );
}
