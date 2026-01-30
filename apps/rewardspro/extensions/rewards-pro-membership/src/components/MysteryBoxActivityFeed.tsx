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

export interface MysteryBoxActivityItem {
  id: string;
  activityType: string;
  displayName: string;
  data: {
    rewardName?: string;
    rarity?: string;
    pointsWon?: number;
    streakDays?: number;
    luckyStreakCount?: number;
    boxName?: string;
  };
  timeAgo: string;
  emoji: string;
}

interface MysteryBoxActivityFeedProps {
  activities: MysteryBoxActivityItem[];
  translate: (key: string, options?: Record<string, string>) => string;
  maxItems?: number;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getActivityMessage(
  activity: MysteryBoxActivityItem,
  translate: (key: string, options?: Record<string, string>) => string
): string {
  const data = activity.data;

  switch (activity.activityType) {
    case 'BOX_OPENED':
      return translate('mysteryBoxes.activity.boxOpened', {
        reward: String(data.rewardName || 'a reward'),
      });
    case 'RARE_WIN':
      return translate('mysteryBoxes.activity.rareWin', {
        reward: String(data.rewardName || 'Rare prize'),
      });
    case 'EPIC_WIN':
      return translate('mysteryBoxes.activity.epicWin', {
        reward: String(data.rewardName || 'Epic prize'),
      });
    case 'LEGENDARY_WIN':
      return translate('mysteryBoxes.activity.legendaryWin', {
        reward: String(data.rewardName || 'Legendary prize'),
      });
    case 'STREAK_MILESTONE':
      return translate('mysteryBoxes.activity.streakMilestone', {
        days: String(data.streakDays || 7),
      });
    case 'PITY_TRIGGERED':
      return translate('mysteryBoxes.activity.pityTriggered', {
        reward: String(data.rewardName || 'guaranteed reward'),
      });
    case 'LUCKY_STREAK':
      return translate('mysteryBoxes.activity.luckyStreak', {
        count: String(data.luckyStreakCount || 3),
      });
    case 'FREE_OPEN_CLAIMED':
      return translate('mysteryBoxes.activity.freeOpenClaimed');
    default:
      return '';
  }
}

// ============================================
// COMPONENT
// ============================================

export function MysteryBoxActivityFeed({
  activities,
  translate,
  maxItems = 5,
}: MysteryBoxActivityFeedProps) {
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
            📢 {translate('mysteryBoxes.liveActivity')}
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
  activity: MysteryBoxActivityItem;
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
