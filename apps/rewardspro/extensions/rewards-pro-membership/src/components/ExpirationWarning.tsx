import {
  Banner,
  Text,
  View,
  BlockStack,
  InlineStack,
} from '@shopify/ui-extensions-react/customer-account';

export interface ExpiringPointsInfo {
  amount: number;
  expiresAt: string;
}

interface ExpirationWarningProps {
  expiringSoon: ExpiringPointsInfo | null;
  currencyName: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

function formatExpirationDate(dateString: string, locale: string = 'en-US'): string {
  try {
    return new Date(dateString).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

function getDaysUntilExpiration(dateString: string): number {
  const expiry = new Date(dateString);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function ExpirationWarning({
  expiringSoon,
  currencyName,
  translate
}: ExpirationWarningProps) {
  if (!expiringSoon || expiringSoon.amount <= 0) {
    return null;
  }

  const daysLeft = getDaysUntilExpiration(expiringSoon.expiresAt);

  // Only show warning if expiring within 30 days
  if (daysLeft > 30) {
    return null;
  }

  const formattedDate = formatExpirationDate(expiringSoon.expiresAt);

  return (
    <Banner status="warning" title={translate('points.expiration.title')}>
      {translate('points.expiration.message', {
        amount: String(expiringSoon.amount),
        currencyName,
        date: formattedDate
      })}
    </Banner>
  );
}
