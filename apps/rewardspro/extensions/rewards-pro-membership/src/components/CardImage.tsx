import {
  Image,
  View,
  Text,
  BlockStack,
} from '@shopify/ui-extensions-react/customer-account';

// ============================================
// TYPES
// ============================================

export interface CardImageProps {
  /** URL of the image to display */
  imageUrl: string | null | undefined;
  /** Fallback emoji to show when no image is provided */
  fallbackEmoji: string;
  /** Alt text for the image */
  altText: string;
  /** Aspect ratio of the image container (default: 2 = 2:1 wide) */
  aspectRatio?: number;
  /** Size of the fallback emoji (default: 'extraLarge') */
  fallbackSize?: 'small' | 'medium' | 'large' | 'extraLarge';
  /** Optional corner radius (default: 'base') */
  cornerRadius?: 'none' | 'small' | 'base' | 'large' | 'fullyRounded';
}

// ============================================
// COMPONENT
// ============================================

/**
 * CardImage component for displaying images in reward cards.
 * Shows the image if provided, otherwise displays a fallback emoji.
 *
 * Usage:
 * ```tsx
 * <CardImage
 *   imageUrl={raffle.imageUrl}
 *   fallbackEmoji="🎟️"
 *   altText={raffle.name}
 * />
 * ```
 */
export function CardImage({
  imageUrl,
  fallbackEmoji,
  altText,
  aspectRatio = 2,
  fallbackSize = 'extraLarge',
  cornerRadius = 'base',
}: CardImageProps) {
  // If we have an image URL, render the image
  if (imageUrl) {
    return (
      <View
        cornerRadius={cornerRadius}
        border="none"
        overflow="hidden"
      >
        <Image
          source={imageUrl}
          accessibilityLabel={altText}
          aspectRatio={aspectRatio}
          fit="cover"
          cornerRadius={cornerRadius}
        />
      </View>
    );
  }

  // Fallback: show emoji in a styled container
  return (
    <View
      cornerRadius={cornerRadius}
      background="subdued"
      padding="loose"
    >
      <BlockStack inlineAlignment="center" blockAlignment="center">
        <Text size={fallbackSize}>{fallbackEmoji}</Text>
      </BlockStack>
    </View>
  );
}

// ============================================
// PRESET VARIANTS
// ============================================

export interface RaffleImageProps {
  imageUrl: string | null | undefined;
  name: string;
}

/**
 * Pre-configured CardImage for raffles
 */
export function RaffleImage({ imageUrl, name }: RaffleImageProps) {
  return (
    <CardImage
      imageUrl={imageUrl}
      fallbackEmoji="🎟️"
      altText={name}
      aspectRatio={2}
    />
  );
}

export interface MysteryBoxImageProps {
  imageUrl: string | null | undefined;
  name: string;
}

/**
 * Pre-configured CardImage for mystery boxes
 */
export function MysteryBoxImage({ imageUrl, name }: MysteryBoxImageProps) {
  return (
    <CardImage
      imageUrl={imageUrl}
      fallbackEmoji="🎁"
      altText={name}
      aspectRatio={1.5}
    />
  );
}

export interface ChallengeImageProps {
  imageUrl: string | null | undefined;
  name: string;
  objectiveType?: string;
}

/**
 * Pre-configured CardImage for challenges
 * Uses objective-specific emoji as fallback
 */
export function ChallengeImage({ imageUrl, name, objectiveType }: ChallengeImageProps) {
  const fallbackEmoji = getObjectiveEmoji(objectiveType);

  return (
    <CardImage
      imageUrl={imageUrl}
      fallbackEmoji={fallbackEmoji}
      altText={name}
      aspectRatio={2}
    />
  );
}

// Helper for challenge objective emojis
function getObjectiveEmoji(objectiveType?: string): string {
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
