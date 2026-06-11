import {
  InlineStack,
  Badge,
  Text,
  View,
} from '@shopify/ui-extensions-react/customer-account';

export interface ActiveBonusInfo {
  hasBonus: boolean;
  multiplier: number;
  eventNames: string[];
  endsAt: string | null;
}

interface BonusEventBadgeProps {
  activeBonus: ActiveBonusInfo;
  translate: (key: string, options?: Record<string, string>) => string;
}

function formatTimeRemaining(endsAt: string): string {
  const end = new Date(endsAt);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();

  if (diffMs <= 0) return '';

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return days === 1 ? '1 day left' : `${days} days left`;
  }
  if (hours > 0) {
    return hours === 1 ? '1 hour left' : `${hours} hours left`;
  }
  return 'Ending soon';
}

export function BonusEventBadge({ activeBonus, translate }: BonusEventBadgeProps) {
  if (!activeBonus.hasBonus) {
    return null;
  }

  const eventName = activeBonus.eventNames[0] || translate('points.bonus.default');
  const timeRemaining = activeBonus.endsAt ? formatTimeRemaining(activeBonus.endsAt) : null;

  return (
    <View
      border="base"
      cornerRadius="base"
      padding="tight"
      background="subdued"
    >
      <InlineStack spacing="tight" blockAlignment="center">
        <Text size="small"></Text>
        <Text size="small" emphasis="bold">
          {translate('points.bonus.active', {
            multiplier: String(activeBonus.multiplier),
            eventName
          })}
        </Text>
        {timeRemaining && (
          <Badge>{timeRemaining}</Badge>
        )}
      </InlineStack>
    </View>
  );
}
