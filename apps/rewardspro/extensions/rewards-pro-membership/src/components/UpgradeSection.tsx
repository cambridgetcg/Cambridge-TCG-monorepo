import {
  BlockStack,
  Text,
  View,
  InlineStack,
  Divider,
  Button,
  Badge,
  Pressable,
} from '@shopify/ui-extensions-react/customer-account';

export interface UpgradeProduct {
  id: string;
  tierName: string;
  tierCashback: number;
  tierIcon: string;
  tierColor: string;
  productHandle: string;
  productUrl: string;
  duration: 'MONTHLY' | 'ANNUAL' | 'LIFETIME';
  price: number;
  currency: string;
}

export interface UpgradeOptionsInfo {
  available: boolean;
  shopDomain?: string;
  products: UpgradeProduct[];
  message: string | null;
}

interface UpgradeSectionProps {
  upgradeOptions: UpgradeOptionsInfo;
  currentTierName: string | null;
  isMaxTier: boolean;
  translate: (key: string, options?: Record<string, string>) => string;
  currency: string;
  locale?: string;
}

function formatCurrency(amount: number, currency: string, locale: string = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDuration(duration: string): string {
  switch (duration) {
    case 'MONTHLY': return '/month';
    case 'ANNUAL': return '/year';
    case 'LIFETIME': return 'one-time';
    default: return '';
  }
}

function getDurationLabel(duration: string): string {
  switch (duration) {
    case 'MONTHLY': return 'Monthly';
    case 'ANNUAL': return 'Annual';
    case 'LIFETIME': return 'Lifetime';
    default: return duration;
  }
}

// Group products by tier for cleaner display
function groupProductsByTier(products: UpgradeProduct[]): Map<string, UpgradeProduct[]> {
  const grouped = new Map<string, UpgradeProduct[]>();
  for (const product of products) {
    const existing = grouped.get(product.tierName) || [];
    existing.push(product);
    grouped.set(product.tierName, existing);
  }
  return grouped;
}

export function UpgradeSection({
  upgradeOptions,
  isMaxTier,
  locale = 'en-US',
}: UpgradeSectionProps) {
  // Don't render if at max tier or no upgrade options
  if (isMaxTier || !upgradeOptions.available || upgradeOptions.products.length === 0) {
    return null;
  }

  const groupedProducts = groupProductsByTier(upgradeOptions.products);
  const tierNames = Array.from(groupedProducts.keys());

  // Show only the next tier upgrade (first tier in the sorted list)
  const nextTierName = tierNames[0];
  const nextTierProducts = groupedProducts.get(nextTierName) || [];

  if (nextTierProducts.length === 0) {
    return null;
  }

  const firstProduct = nextTierProducts[0];

  return (
    <View border="base" cornerRadius="base" padding="base" background="base">
      <BlockStack spacing="base">
        {/* Header */}
        <BlockStack spacing="extraTight">
          <InlineStack spacing="tight" blockAlignment="center">
            <Text size="medium" emphasis="bold">
              {firstProduct.tierIcon} Upgrade to {firstProduct.tierName}
            </Text>
            <Badge tone="success">
              {firstProduct.tierCashback}% cashback
            </Badge>
          </InlineStack>
          <Text size="small" appearance="subdued">
            Unlock higher cashback rewards instantly
          </Text>
        </BlockStack>

        <Divider />

        {/* Product Options */}
        <BlockStack spacing="tight">
          {nextTierProducts.map((product) => (
            <Pressable
              key={product.id}
              to={product.productUrl}
            >
              <View
                border="base"
                cornerRadius="base"
                padding="tight"
                background="subdued"
              >
                <InlineStack spacing="base" blockAlignment="center">
                  <View inlineSize="fill">
                    <BlockStack spacing="extraTight">
                      <Text size="small" emphasis="bold">
                        {getDurationLabel(product.duration)}
                      </Text>
                      <Text size="small" appearance="subdued">
                        {formatCurrency(product.price, product.currency, locale)}
                        {product.duration !== 'LIFETIME' && formatDuration(product.duration)}
                      </Text>
                    </BlockStack>
                  </View>
                  <Button
                    kind="primary"
                    to={product.productUrl}
                  >
                    Upgrade
                  </Button>
                </InlineStack>
              </View>
            </Pressable>
          ))}
        </BlockStack>

        {/* Show more tiers link if available */}
        {tierNames.length > 1 && (
          <>
            <Divider />
            <Text size="small" appearance="subdued">
              {tierNames.length - 1} more tier{tierNames.length > 2 ? 's' : ''} available
            </Text>
          </>
        )}
      </BlockStack>
    </View>
  );
}
