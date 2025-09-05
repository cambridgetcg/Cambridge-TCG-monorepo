import {
  Card,
  BlockStack,
  Text,
  Icon,
  InlineStack,
  Box,
  Badge,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  ClockIcon,
  CashDollarFilledIcon,
  ReturnIcon,
  EditIcon,
} from "@shopify/polaris-icons";

interface Activity {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  amount?: number;
}

export default function ActivityFeed({ activities }: { activities: Activity[] }) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatRelativeTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "CASHBACK_EARNED":
        return { source: CashDollarFilledIcon, tone: "success" as const };
      case "ORDER_PAYMENT":
        return { source: CheckCircleIcon, tone: "success" as const };
      case "REFUND_CREDIT":
        return { source: ReturnIcon, tone: "warning" as const };
      case "MANUAL_ADJUSTMENT":
        return { source: EditIcon, tone: "info" as const };
      default:
        return { source: ClockIcon, tone: "base" as const };
    }
  };

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text variant="headingMd" as="h3">
            Recent Activity
          </Text>
          <Badge tone="info">Last 5 transactions</Badge>
        </InlineStack>

        {activities.length === 0 ? (
          <Box paddingBlock="600">
            <BlockStack gap="200">
              <Text variant="bodyMd" alignment="center" tone="subdued" as="p">
                No activity yet
              </Text>
              <Text variant="bodySm" alignment="center" tone="subdued" as="p">
                Activity will appear here once customers start earning rewards
              </Text>
            </BlockStack>
          </Box>
        ) : (
          <BlockStack gap="300">
            {activities.map((activity) => {
              const iconProps = getActivityIcon(activity.type);
              
              return (
                <Box key={activity.id}>
                  <InlineStack align="space-between">
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Icon {...iconProps} />
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                          {activity.description}
                        </Text>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued" as="p">
                        {formatRelativeTime(activity.timestamp)}
                      </Text>
                    </BlockStack>
                    {activity.amount !== undefined && activity.amount !== 0 && (
                      <Text 
                        variant="bodyMd" 
                        fontWeight="semibold" 
                        as="span"
                        tone={activity.amount > 0 ? "success" : undefined}
                      >
                        {activity.amount > 0 && "+"}
                        {formatCurrency(activity.amount)}
                      </Text>
                    )}
                  </InlineStack>
                </Box>
              );
            })}
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}