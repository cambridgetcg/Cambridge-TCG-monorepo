import { Card, BlockStack, InlineStack, Text, Button, Badge, Icon, Box, Avatar } from "@shopify/polaris";
import { ClockIcon, CashDollarFilledIcon, PersonAddIcon, StarFilledIcon } from "@shopify/polaris-icons";
import { memo } from "react";

interface ActivityItem {
  id: string;
  type: "CASHBACK_EARNED" | "CASHBACK_REDEEMED" | "TIER_UPGRADED" | "CUSTOMER_JOINED";
  customer: {
    email: string;
    name?: string;
  };
  amount?: number;
  description?: string;
  createdAt: string;
}

interface RecentActivityListProps {
  activities: ActivityItem[];
  onViewAll?: () => void;
  maxItems?: number;
}

export const RecentActivityList = memo(function RecentActivityList({
  activities,
  onViewAll,
  maxItems = 5,
}: RecentActivityListProps) {
  const displayActivities = activities.slice(0, maxItems);
  
  const getActivityConfig = (type: ActivityItem["type"]) => {
    switch (type) {
      case "CASHBACK_EARNED":
        return {
          icon: CashDollarFilledIcon,
          tone: "success" as const,
          label: "Earned",
          color: "bg-fill-success-secondary",
        };
      case "CASHBACK_REDEEMED":
        return {
          icon: StarFilledIcon,
          tone: "info" as const,
          label: "Redeemed",
          color: "bg-fill-info-secondary",
        };
      case "TIER_UPGRADED":
        return {
          icon: StarFilledIcon,
          tone: "warning" as const,
          label: "Tier Upgrade",
          color: "bg-fill-warning-secondary",
        };
      case "CUSTOMER_JOINED":
        return {
          icon: PersonAddIcon,
          tone: "base" as const,
          label: "New Customer",
          color: "bg-fill-secondary",
        };
      default:
        return {
          icon: ClockIcon,
          tone: "base" as const,
          label: "Activity",
          color: "bg-fill-secondary",
        };
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    
    return date.toLocaleDateString();
  };

  if (activities.length === 0) {
    return (
      <Card roundedAbove="sm">
        <Box padding="600">
          <BlockStack gap="300" align="center">
            <Icon source={ClockIcon} tone="subdued" />
            <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
              No recent activity yet
            </Text>
            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
              Activity will appear here as customers interact with your loyalty program
            </Text>
          </BlockStack>
        </Box>
      </Card>
    );
  }

  return (
    <Card roundedAbove="sm">
      <Box padding="400">
        <BlockStack gap="400">
          {/* Header */}
          <InlineStack align="space-between">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd" fontWeight="semibold">
                Recent Activity
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Latest customer interactions
              </Text>
            </BlockStack>
            
            {onViewAll && activities.length > maxItems && (
              <Button plain onClick={onViewAll}>
                View All ({activities.length})
              </Button>
            )}
          </InlineStack>

          {/* Activity Items */}
          <BlockStack gap="300">
            {displayActivities.map((activity) => {
              const config = getActivityConfig(activity.type);
              const initials = activity.customer.name
                ? activity.customer.name.split(" ").map(n => n[0]).join("").toUpperCase()
                : activity.customer.email[0].toUpperCase();

              return (
                <Box
                  key={activity.id}
                  padding="300"
                  background="bg-surface-secondary"
                  borderRadius="200"
                >
                  <InlineStack align="space-between" wrap={false}>
                    <InlineStack gap="300" blockAlign="center">
                      {/* Avatar */}
                      <Avatar 
                        customer
                        size="medium"
                        initials={initials}
                        name={activity.customer.name || activity.customer.email}
                      />
                      
                      {/* Content */}
                      <BlockStack gap="050">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            {activity.customer.name || activity.customer.email}
                          </Text>
                          <Badge size="small" tone={config.tone === "base" ? undefined : config.tone}>
                            {config.label}
                          </Badge>
                        </InlineStack>
                        
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={ClockIcon} tone="subdued" />
                          <Text as="p" variant="bodySm" tone="subdued">
                            {formatTimeAgo(activity.createdAt)}
                          </Text>
                          
                          {activity.description && (
                            <>
                              <Text as="span" variant="bodySm" tone="subdued">
                                •
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {activity.description}
                              </Text>
                            </>
                          )}
                        </InlineStack>
                      </BlockStack>
                    </InlineStack>
                    
                    {/* Amount */}
                    {activity.amount !== undefined && (
                      <Box
                        padding="150"
                        paddingInlineStart="300"
                        paddingInlineEnd="300"
                        borderRadius="100"
                      >
                        <Text 
                          as="p" 
                          variant="bodyMd" 
                          fontWeight="semibold"
                          tone={config.tone === "base" ? undefined : config.tone}
                        >
                          ${Math.abs(activity.amount).toFixed(2)}
                        </Text>
                      </Box>
                    )}
                  </InlineStack>
                </Box>
              );
            })}
          </BlockStack>
        </BlockStack>
      </Box>
    </Card>
  );
});