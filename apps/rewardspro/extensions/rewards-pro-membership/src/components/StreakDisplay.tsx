import {
  InlineStack,
  Text,
  View,
  Badge,
} from '@shopify/ui-extensions-react/customer-account';

export interface StreakInfo {
  current: number;
  bonusMultiplier: number;
}

interface StreakDisplayProps {
  streak: StreakInfo;
  translate: (key: string, options?: Record<string, string>) => string;
}

function getStreakEmoji(current: number): string {
  if (current >= 10) return '';
  if (current >= 5) return '';
  if (current >= 3) return '';
  return '';
}

export function StreakDisplay({ streak, translate }: StreakDisplayProps) {
  if (streak.current <= 0) {
    return null;
  }

  const emoji = getStreakEmoji(streak.current);
  const hasBonus = streak.bonusMultiplier > 1;

  return (
    <View border="base" cornerRadius="base" padding="tight" background="subdued">
      <InlineStack spacing="tight" blockAlignment="center">
        <Text size="small">{emoji}</Text>
        <View inlineSize="fill">
          <Text size="small" emphasis="bold">
            {translate('points.streak.current', {
              count: String(streak.current)
            })}
          </Text>
        </View>
        {hasBonus && (
          <Badge>
            {translate('points.streak.bonus', {
              multiplier: String(streak.bonusMultiplier)
            })}
          </Badge>
        )}
      </InlineStack>
    </View>
  );
}
