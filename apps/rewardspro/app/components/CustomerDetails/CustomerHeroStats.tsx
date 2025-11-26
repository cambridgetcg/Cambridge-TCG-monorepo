import {
  Box,
  InlineGrid,
  BlockStack,
  Text,
  Icon,
} from '@shopify/polaris';
import {
  CashDollarIcon,
  StarIcon,
  DiscountIcon,
  PackageIcon,
} from '@shopify/polaris-icons';

interface CustomerHeroStatsProps {
  storeCredit: string | number;
  tierName: string | null;
  cashbackPercent: number | null;
  ordersCount: number;
  formatAmount: (amount: string | number) => string;
  onStatClick?: (tab: number) => void;
}

export function CustomerHeroStats({
  storeCredit,
  tierName,
  cashbackPercent,
  ordersCount,
  formatAmount,
  onStatClick,
}: CustomerHeroStatsProps) {
  const stats = [
    {
      label: 'Store Credit',
      value: formatAmount(storeCredit),
      icon: CashDollarIcon,
      tone: 'success' as const,
      tab: 1,
    },
    {
      label: 'Current Tier',
      value: tierName || 'No Tier',
      icon: StarIcon,
      tone: tierName ? 'highlight' as const : 'subdued' as const,
      tab: 0,
    },
    {
      label: 'Cashback Rate',
      value: cashbackPercent !== null ? `${cashbackPercent}%` : '—',
      icon: DiscountIcon,
      tone: 'info' as const,
      tab: 0,
    },
    {
      label: 'Total Orders',
      value: ordersCount.toString(),
      icon: PackageIcon,
      tone: 'default' as const,
      tab: 2,
    },
  ];

  return (
    <Box
      background="bg-surface-secondary"
      padding="400"
      borderRadius="300"
    >
      <InlineGrid columns={{ xs: 2, sm: 4 }} gap="400">
        {stats.map((stat, index) => (
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
