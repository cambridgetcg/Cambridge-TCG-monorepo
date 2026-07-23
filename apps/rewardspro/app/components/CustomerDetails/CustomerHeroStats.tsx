import {
  Box,
  InlineGrid,
  BlockStack,
  Text,
  Icon,
  Badge,
} from '@shopify/polaris';
import {
  CashDollarIcon,
  StarIcon,
  DiscountIcon,
  PackageIcon,
} from '@shopify/polaris-icons';

// TierSource type for display (kept for prop type compatibility)
type TierSource = 'MANUAL_OVERRIDE' | 'TIER_SUBSCRIPTION' | 'TIER_PURCHASE' | 'SPENDING_BASED' | 'NONE';

interface CustomerHeroStatsProps {
  storeCredit: string | number;
  tierName: string | null;
  cashbackPercent: number | null;
  ordersCount: number;
  formatAmount: (amount: string | number) => string;
  onStatClick?: (tab: number) => void;
  tierSource?: TierSource | null;
  tierExpiry?: string | null;
}

export function CustomerHeroStats({
  storeCredit,
  tierName,
  cashbackPercent,
  ordersCount,
  formatAmount,
  onStatClick,
  tierExpiry,
}: CustomerHeroStatsProps) {
  // Calculate days remaining if there's an expiry
  let expiryText: string | null = null;
  if (tierExpiry) {
    const expiryDate = new Date(tierExpiry);
    const now = new Date();
    const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysRemaining > 0) {
      expiryText = `${daysRemaining}d left`;
    } else if (daysRemaining === 0) {
      expiryText = 'Expires today';
    }
  }

  const stats = [
    {
      label: 'Store Credit',
      value: formatAmount(storeCredit),
      icon: CashDollarIcon,
      tone: 'success' as const,
      tab: 1,
      badge: null as { label: string; tone: 'info' | 'success' | 'warning' | 'attention' } | null,
    },
    {
      label: 'Current Tier',
      value: tierName || 'No Tier',
      icon: StarIcon,
      tone: tierName ? 'highlight' as const : 'subdued' as const,
      tab: 0,
      badge: null, // Removed tier source badge to prevent UI distortion
    },
    {
      label: 'Cashback Rate',
      value: cashbackPercent !== null ? `${cashbackPercent}%` : '—',
      icon: DiscountIcon,
      tone: 'info' as const,
      tab: 0,
      badge: expiryText ? { label: expiryText, tone: 'warning' as const } : null,
    },
    {
      label: 'Total Orders',
      value: ordersCount.toString(),
      icon: PackageIcon,
      tone: 'default' as const,
      tab: 2,
      badge: null,
    },
  ];

  return (
    <Box
      background="bg-surface-secondary"
      padding="400"
      borderRadius="300"
    >
      <InlineGrid columns={{ xs: 2, sm: 4 }} gap="400">
        {stats.map((stat) => (
          <Box
            key={stat.label}
            background="bg-surface"
            padding="400"
            borderRadius="200"
            shadow="100"
            {...(onStatClick && {
              as: 'button' as any,
              onClick: () => onStatClick(stat.tab),
            })}
          >
            <BlockStack gap="200" align="center">
              <Box
                background={
                  stat.tone === 'success' ? 'bg-fill-success-secondary' :
                  stat.tone === 'highlight' ? 'bg-fill-warning-secondary' :
                  stat.tone === 'info' ? 'bg-fill-info-secondary' :
                  'bg-surface-secondary'
                }
                padding="200"
                borderRadius="200"
              >
                <Icon
                  source={stat.icon}
                  tone={
                    stat.tone === 'success' ? 'success' :
                    stat.tone === 'highlight' ? 'caution' :
                    stat.tone === 'info' ? 'info' :
                    'subdued'
                  }
                />
              </Box>
              <Text
                as="span"
                variant="headingLg"
                fontWeight="bold"
                alignment="center"
              >
                {stat.value}
              </Text>
              {stat.badge && (
                <Badge tone={stat.badge.tone} size="small">
                  {stat.badge.label}
                </Badge>
              )}
              <Text
                as="span"
                variant="bodySm"
                tone="subdued"
                alignment="center"
              >
                {stat.label}
              </Text>
            </BlockStack>
          </Box>
        ))}
      </InlineGrid>
    </Box>
  );
}
