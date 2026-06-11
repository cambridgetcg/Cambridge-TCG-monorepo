import { useState, useCallback, ReactNode } from 'react';
import {
  BlockStack,
  InlineStack,
  Text,
  View,
  Button,
  Divider,
  SkeletonText,
  Badge,
} from '@shopify/ui-extensions-react/customer-account';

// ============================================
// TYPES
// ============================================

export interface HistorySectionProps {
  /** Title for the history section */
  title: string;
  /** Whether history is loading */
  isLoading: boolean;
  /** Whether there are history items */
  hasItems: boolean;
  /** Callback to fetch history when expanded */
  onExpand: () => void;
  /** Child components (history items) */
  children: ReactNode;
  /** Translation function */
  translate: (key: string, options?: Record<string, string>) => string;
}

// ============================================
// HISTORY ITEM COMPONENTS
// ============================================

export interface RaffleHistoryItemProps {
  raffleName: string;
  entriesCount: number;
  pointsSpent: number;
  enteredAt: string;
  isWinner: boolean;
  prize?: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

export function RaffleHistoryItem({
  raffleName,
  entriesCount,
  pointsSpent,
  enteredAt,
  isWinner,
  prize,
  locale,
  translate,
}: RaffleHistoryItemProps) {
  const formattedDate = new Date(enteredAt).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <View padding="tight" background="subdued" cornerRadius="base">
      <BlockStack spacing="extraTight">
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="small" emphasis="bold">
            🎟️ {raffleName}
          </Text>
          {isWinner && <Badge tone="success">{translate('history.winner')}</Badge>}
        </InlineStack>
        <InlineStack spacing="base" blockAlignment="center">
          <Text size="small" appearance="subdued">
            {translate('history.entries', { count: String(entriesCount) })}
          </Text>
          <Text size="small" appearance="subdued">
            -{pointsSpent} pts
          </Text>
          <Text size="small" appearance="subdued">
            {formattedDate}
          </Text>
        </InlineStack>
        {isWinner && prize && (
          <Text size="small" appearance="success">
            🏆 {prize}
          </Text>
        )}
      </BlockStack>
    </View>
  );
}

export interface MysteryBoxHistoryItemProps {
  boxName: string;
  rewardName: string;
  rarity: string;
  pointsSpent: number;
  openedAt: string;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

export function MysteryBoxHistoryItem({
  boxName,
  rewardName,
  rarity,
  pointsSpent,
  openedAt,
  locale,
  translate,
}: MysteryBoxHistoryItemProps) {
  const formattedDate = new Date(openedAt).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
  });

  const rarityTone = getRarityTone(rarity);
  const rarityEmoji = getRarityEmoji(rarity);

  return (
    <View padding="tight" background="subdued" cornerRadius="base">
      <BlockStack spacing="extraTight">
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="small" emphasis="bold">
            🎁 {boxName}
          </Text>
          <Badge tone={rarityTone}>{rarity}</Badge>
        </InlineStack>
        <Text size="small">
          {rarityEmoji} {rewardName}
        </Text>
        <InlineStack spacing="base" blockAlignment="center">
          <Text size="small" appearance="subdued">
            -{pointsSpent} pts
          </Text>
          <Text size="small" appearance="subdued">
            {formattedDate}
          </Text>
        </InlineStack>
      </BlockStack>
    </View>
  );
}

export interface ChallengeHistoryItemProps {
  challengeName: string;
  objectiveType: string;
  rewardDescription: string;
  status: string;
  completedAt: string | null;
  locale: string;
  translate: (key: string, options?: Record<string, string>) => string;
}

export function ChallengeHistoryItem({
  challengeName,
  objectiveType,
  rewardDescription,
  status,
  completedAt,
  locale,
  translate,
}: ChallengeHistoryItemProps) {
  const formattedDate = completedAt
    ? new Date(completedAt).toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
      })
    : null;

  const objectiveIcon = getObjectiveIcon(objectiveType);
  const statusTone = status === 'CLAIMED' ? 'success' : 'info';

  return (
    <View padding="tight" background="subdued" cornerRadius="base">
      <BlockStack spacing="extraTight">
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="small" emphasis="bold">
            {objectiveIcon} {challengeName}
          </Text>
          <Badge tone={statusTone}>
            {translate(`history.status.${status.toLowerCase()}`)}
          </Badge>
        </InlineStack>
        <Text size="small">
          🎁 {rewardDescription}
        </Text>
        {formattedDate && (
          <Text size="small" appearance="subdued">
            {translate('history.completedOn', { date: formattedDate })}
          </Text>
        )}
      </BlockStack>
    </View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function HistorySection({
  title,
  isLoading,
  hasItems,
  onExpand,
  children,
  translate,
}: HistorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = useCallback(() => {
    if (!isExpanded) {
      onExpand();
    }
    setIsExpanded(!isExpanded);
  }, [isExpanded, onExpand]);

  return (
    <BlockStack spacing="tight">
      <Divider />
      <Button
        kind="plain"
        onPress={handleToggle}
      >
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="small">{isExpanded ? '▼' : '▶'}</Text>
          <Text size="small" emphasis="bold">{title}</Text>
        </InlineStack>
      </Button>

      {isExpanded && (
        <BlockStack spacing="tight">
          {isLoading ? (
            <HistoryLoadingSkeleton />
          ) : hasItems ? (
            children
          ) : (
            <View padding="base" background="subdued" cornerRadius="base">
              <Text size="small" appearance="subdued">
                {translate('history.noItems')}
              </Text>
            </View>
          )}
        </BlockStack>
      )}
    </BlockStack>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

function HistoryLoadingSkeleton() {
  return (
    <BlockStack spacing="tight">
      <View padding="tight" background="subdued" cornerRadius="base">
        <BlockStack spacing="extraTight">
          <SkeletonText size="small" />
          <SkeletonText size="small" />
        </BlockStack>
      </View>
      <View padding="tight" background="subdued" cornerRadius="base">
        <BlockStack spacing="extraTight">
          <SkeletonText size="small" />
          <SkeletonText size="small" />
        </BlockStack>
      </View>
    </BlockStack>
  );
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getRarityTone(rarity: string): 'info' | 'success' | 'warning' | 'critical' {
  switch (rarity) {
    case 'LEGENDARY':
      return 'critical';
    case 'EPIC':
      return 'warning';
    case 'RARE':
      return 'success';
    default:
      return 'info';
  }
}

function getRarityEmoji(rarity: string): string {
  switch (rarity) {
    case 'LEGENDARY':
      return '🌟';
    case 'EPIC':
      return '💜';
    case 'RARE':
      return '💙';
    case 'UNCOMMON':
      return '💚';
    default:
      return '⚪';
  }
}

function getObjectiveIcon(objectiveType: string): string {
  switch (objectiveType) {
    case 'SPENDING':
      return '💰';
    case 'ORDER_COUNT':
      return '🛒';
    case 'REFERRAL':
      return '👥';
    case 'PRODUCT_PURCHASE':
      return '📦';
    case 'REVIEW':
      return '⭐';
    case 'STREAK':
      return '🔥';
    default:
      return '🏆';
  }
}
