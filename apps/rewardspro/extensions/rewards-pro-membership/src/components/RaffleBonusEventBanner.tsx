import { useState, useEffect } from 'react';
import {
  BlockStack,
  InlineStack,
  Text,
  View,
  Badge,
} from '@shopify/ui-extensions-react/customer-account';

// ============================================
// TYPES
// ============================================

export interface BonusEventInfo {
  id: string;
  name: string;
  description: string | null;
  eventType: string;
  bonusMultiplier: number;
  bonusEntriesFlat: number;
  discountPercent: number;
  endsAt: string;
  timeRemaining: string | null;
  secondsRemaining: number;
}

interface RaffleBonusEventBannerProps {
  event: BonusEventInfo;
  translate: (key: string, options?: Record<string, string>) => string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getEventEmoji(eventType: string): string {
  switch (eventType) {
    case 'HAPPY_HOUR':
      return '🎉';
    case 'FLASH_BONUS':
      return '⚡';
    case 'EARLY_BIRD':
      return '🐦';
    case 'LAST_CHANCE':
      return '⏰';
    case 'MILESTONE':
      return '🎯';
    default:
      return '🎁';
  }
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Ended';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function getBonusDescription(event: BonusEventInfo): string {
  const parts: string[] = [];

  if (event.bonusMultiplier > 1) {
    parts.push(`${event.bonusMultiplier}x entries`);
  }
  if (event.bonusEntriesFlat > 0) {
    parts.push(`+${event.bonusEntriesFlat} bonus entries`);
  }
  if (event.discountPercent > 0) {
    parts.push(`${event.discountPercent}% off`);
  }

  return parts.join(' + ') || 'Bonus active';
}

// ============================================
// COMPONENT
// ============================================

export function RaffleBonusEventBanner({
  event,
  translate,
}: RaffleBonusEventBannerProps) {
  const [secondsLeft, setSecondsLeft] = useState(event.secondsRemaining);

  // Countdown timer
  useEffect(() => {
    if (secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft]);

  // Reset when event changes
  useEffect(() => {
    setSecondsLeft(event.secondsRemaining);
  }, [event.id, event.secondsRemaining]);

  if (secondsLeft <= 0) {
    return null;
  }

  const emoji = getEventEmoji(event.eventType);
  const bonusText = getBonusDescription(event);
  const isUrgent = secondsLeft < 300; // Less than 5 minutes

  return (
    <View
      border="base"
      cornerRadius="base"
      padding="base"
      background={isUrgent ? 'critical' : 'success'}
    >
      <BlockStack spacing="tight">
        {/* Header */}
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="medium" emphasis="bold">
            {emoji} {event.name}
          </Text>
          <Badge tone={isUrgent ? 'critical' : 'success'}>
            {formatCountdown(secondsLeft)}
          </Badge>
        </InlineStack>

        {/* Bonus Description */}
        <Text size="small">
          {bonusText}
        </Text>

        {/* Description if available */}
        {event.description && (
          <Text size="small" appearance="subdued">
            {event.description}
          </Text>
        )}

        {/* Urgency message */}
        {isUrgent && (
          <Text size="small" emphasis="bold">
            {translate('raffles.bonusEndingSoon')}
          </Text>
        )}
      </BlockStack>
    </View>
  );
}

// ============================================
// MULTIPLE EVENTS DISPLAY
// ============================================

interface RaffleBonusEventListProps {
  events: BonusEventInfo[];
  translate: (key: string, options?: Record<string, string>) => string;
}

export function RaffleBonusEventList({
  events,
  translate,
}: RaffleBonusEventListProps) {
  if (!events || events.length === 0) {
    return null;
  }

  // Show only the best/most urgent event
  const sortedEvents = [...events].sort((a, b) => {
    // Prioritize by urgency (ending soonest), then by multiplier
    if (a.secondsRemaining < 300 && b.secondsRemaining >= 300) return -1;
    if (b.secondsRemaining < 300 && a.secondsRemaining >= 300) return 1;
    return b.bonusMultiplier - a.bonusMultiplier;
  });

  return (
    <BlockStack spacing="tight">
      {sortedEvents.slice(0, 1).map((event) => (
        <RaffleBonusEventBanner
          key={event.id}
          event={event}
          translate={translate}
        />
      ))}
    </BlockStack>
  );
}
