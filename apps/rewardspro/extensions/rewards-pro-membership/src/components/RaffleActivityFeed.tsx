import {
  BlockStack,
  InlineStack,
  Text,
  View,
  ScrollView,
} from '@shopify/ui-extensions-react/customer-account';

// ============================================
// TYPES
// ============================================

export interface ActivityFeedItem {
  id: string;
  activityType: string;
  displayName: string;
  data: Record<string, unknown>;
  timeAgo: string;
  emoji: string;
}

interface RaffleActivityFeedProps {
  activities: ActivityFeedItem[];
  translate: (key: string, options?: Record<string, string>) => string;
  maxItems?: number;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getActivityMessage(
  activity: ActivityFeedItem,
  translate: (key: string, options?: Record<string, string>) => string
): string {
  const data = activity.data;

  switch (activity.activityType) {
    case 'ENTRY_PURCHASED':
      return translate('raffles.activity.entryPurchased', {
        count: String(data.entriesCount || 1),
      });
    case 'INSTANT_WIN':
      return translate('raffles.activity.instantWin', {
        prize: String(data.prizeName || 'prize'),
      });
    case 'GRAND_WINNER':
      return translate('raffles.activity.grandWinner', {
        prize: String(data.prizeName || 'prize'),
      });
    case 'STREAK_MILESTONE':
      return translate('raffles.activity.streakMilestone', {
        days: String(data.streakDays || 7),
      });
    case 'EARLY_BIRD':
      return translate('raffles.activity.earlyBird');
    case 'LUCKY_NUMBER':
      return translate('raffles.activity.luckyNumber', {
        number: String(data.luckyNumber || ''),
      });
    default:
      return '';
  }
}

// ============================================
// COMPONENT
// ============================================

export function RaffleActivityFeed({
  activities,
  translate,
  maxItems = 5,
}: RaffleActivityFeedProps) {
  if (!activities || activities.length === 0) {
    return null;
  }

  const visibleActivities = activities.slice(0, maxItems);

  return (
    <View
      border="base"
      cornerRadius="base"
      padding="base"
      background="base"
    >
      <BlockStack spacing="base">
        {/* Header */}
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="small" emphasis="bold">
            📢 {translate('raffles.liveActivity')}
          </Text>
        </InlineStack>

        {/* Activity List */}
        <ScrollView maxBlockSize={200}>
          <BlockStack spacing="tight">
            {visibleActivities.map((activity) => (
              <ActivityItem
                key={activity.id}
                activity={activity}
                translate={translate}
              />
            ))}
          </BlockStack>
        </ScrollView>
      </BlockStack>
    </View>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

interface ActivityItemProps {
  activity: ActivityFeedItem;
  translate: (key: string, options?: Record<string, string>) => string;
}

function ActivityItem({ activity, translate }: ActivityItemProps) {
  const message = getActivityMessage(activity, translate);

  return (
    <View padding="tight" background="subdued" cornerRadius="base">
      <InlineStack spacing="tight" blockAlignment="center">
        <Text size="small">{activity.emoji}</Text>
        <View inlineSize="fill">
          <Text size="small">
            <Text emphasis="bold">{activity.displayName}</Text> {message}
          </Text>
        </View>
        <Text size="small" appearance="subdued">
          {activity.timeAgo}
        </Text>
      </InlineStack>
    </View>
  );
}
