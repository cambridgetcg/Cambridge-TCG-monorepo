/**
 * Centralized tier styling configuration
 * Ensures consistent visual representation of tiers across all modules
 */

import {
  DiamondIcon,
  StarFilledIcon,
  TrophyIcon,
  AwardIcon,
  CrownIcon,
  HeartIcon,
  FlameIcon,
  GlobeIcon,
} from "@shopify/polaris-icons";

export interface TierStyle {
  icon: any;
  color: string;
  badgeTone: 'info' | 'success' | 'warning' | 'critical' | 'attention' | 'new' | 'read-only' | 'enabled';
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  gradientFrom: string;
  gradientTo: string;
}

export interface TierConfig {
  name: string;
  style: TierStyle;
  priority: number; // For sorting
}

// Default tier styles by common naming patterns
export const DEFAULT_TIER_STYLES: Record<string, TierStyle> = {
  // Premium tiers
  DIAMOND: {
    icon: DiamondIcon,
    color: '#8B5CF6', // Purple
    badgeTone: 'new',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderColor: 'rgba(139, 92, 246, 0.3)',
    textColor: '#8B5CF6',
    gradientFrom: '#8B5CF6',
    gradientTo: '#7C3AED'
  },
  PLATINUM: {
    icon: CrownIcon,
    color: '#6B7280', // Gray
    badgeTone: 'enabled',
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    borderColor: 'rgba(107, 114, 128, 0.3)',
    textColor: '#6B7280',
    gradientFrom: '#9CA3AF',
    gradientTo: '#6B7280'
  },
  GOLD: {
    icon: TrophyIcon,
    color: '#F59E0B', // Amber
    badgeTone: 'warning',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    textColor: '#F59E0B',
    gradientFrom: '#FCD34D',
    gradientTo: '#F59E0B'
  },
  SILVER: {
    icon: AwardIcon,
    color: '#9CA3AF', // Light gray
    badgeTone: 'read-only',
    backgroundColor: 'rgba(156, 163, 175, 0.1)',
    borderColor: 'rgba(156, 163, 175, 0.3)',
    textColor: '#9CA3AF',
    gradientFrom: '#D1D5DB',
    gradientTo: '#9CA3AF'
  },
  BRONZE: {
    icon: StarFilledIcon,
    color: '#92400E', // Brown
    badgeTone: 'attention',
    backgroundColor: 'rgba(146, 64, 14, 0.1)',
    borderColor: 'rgba(146, 64, 14, 0.3)',
    textColor: '#92400E',
    gradientFrom: '#B45309',
    gradientTo: '#92400E'
  },
  
  // Status-based tiers
  VIP: {
    icon: CrownIcon,
    color: '#DC2626', // Red
    badgeTone: 'critical',
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderColor: 'rgba(220, 38, 38, 0.3)',
    textColor: '#DC2626',
    gradientFrom: '#EF4444',
    gradientTo: '#DC2626'
  },
  ELITE: {
    icon: FlameIcon,
    color: '#7C3AED', // Violet
    badgeTone: 'new',
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
    borderColor: 'rgba(124, 58, 237, 0.3)',
    textColor: '#7C3AED',
    gradientFrom: '#8B5CF6',
    gradientTo: '#7C3AED'
  },
  PREMIUM: {
    icon: DiamondIcon,
    color: '#0891B2', // Cyan
    badgeTone: 'info',
    backgroundColor: 'rgba(8, 145, 178, 0.1)',
    borderColor: 'rgba(8, 145, 178, 0.3)',
    textColor: '#0891B2',
    gradientFrom: '#06B6D4',
    gradientTo: '#0891B2'
  },
  
  // Basic tiers
  MEMBER: {
    icon: HeartIcon,
    color: '#059669', // Emerald
    badgeTone: 'success',
    backgroundColor: 'rgba(5, 150, 105, 0.1)',
    borderColor: 'rgba(5, 150, 105, 0.3)',
    textColor: '#059669',
    gradientFrom: '#10B981',
    gradientTo: '#059669'
  },
  BASIC: {
    icon: StarFilledIcon,
    color: '#3B82F6', // Blue
    badgeTone: 'info',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    textColor: '#3B82F6',
    gradientFrom: '#60A5FA',
    gradientTo: '#3B82F6'
  },
  STARTER: {
    icon: GlobeIcon,
    color: '#10B981', // Green
    badgeTone: 'success',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    textColor: '#10B981',
    gradientFrom: '#34D399',
    gradientTo: '#10B981'
  },
  
  // Default/No tier
  NONE: {
    icon: StarFilledIcon,
    color: '#6B7280',
    badgeTone: 'read-only',
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    borderColor: 'rgba(107, 114, 128, 0.3)',
    textColor: '#6B7280',
    gradientFrom: '#9CA3AF',
    gradientTo: '#6B7280'
  }
};

/**
 * Get tier style based on tier name
 * Performs case-insensitive matching and handles common variations
 */
export function getTierStyle(tierName: string | null | undefined): TierStyle {
  if (!tierName) {
    return DEFAULT_TIER_STYLES.NONE;
  }
  
  const normalizedName = tierName.toUpperCase().replace(/[\s-_]/g, '');
  
  // Direct match
  if (DEFAULT_TIER_STYLES[normalizedName]) {
    return DEFAULT_TIER_STYLES[normalizedName];
  }
  
  // Partial match (contains)
  for (const [key, style] of Object.entries(DEFAULT_TIER_STYLES)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return style;
    }
  }
  
  // Check for number-based tiers (Tier 1, Tier 2, etc.)
  const tierNumber = tierName.match(/\d+/)?.[0];
  if (tierNumber) {
    const num = parseInt(tierNumber, 10);
    if (num === 1) return DEFAULT_TIER_STYLES.BRONZE;
    if (num === 2) return DEFAULT_TIER_STYLES.SILVER;
    if (num === 3) return DEFAULT_TIER_STYLES.GOLD;
    if (num === 4) return DEFAULT_TIER_STYLES.PLATINUM;
    if (num >= 5) return DEFAULT_TIER_STYLES.DIAMOND;
  }
  
  // Default fallback
  return DEFAULT_TIER_STYLES.BASIC;
}

/**
 * Get tier priority for sorting (higher is better)
 */
export function getTierPriority(tierName: string | null | undefined): number {
  if (!tierName) return 0;
  
  const normalizedName = tierName.toUpperCase().replace(/[\s-_]/g, '');
  
  const priorities: Record<string, number> = {
    DIAMOND: 100,
    PLATINUM: 90,
    GOLD: 80,
    SILVER: 70,
    BRONZE: 60,
    VIP: 95,
    ELITE: 85,
    PREMIUM: 75,
    MEMBER: 50,
    BASIC: 40,
    STARTER: 30,
    NONE: 0
  };
  
  // Direct match
  if (priorities[normalizedName]) {
    return priorities[normalizedName];
  }
  
  // Partial match
  for (const [key, priority] of Object.entries(priorities)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return priority;
    }
  }
  
  return 10; // Default low priority
}

/**
 * Format tier name for display
 */
export function formatTierName(tierName: string | null | undefined): string {
  if (!tierName) return 'No Tier';
  
  // Capitalize first letter of each word
  return tierName
    .split(/[\s-_]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Get tier emoji based on style (for text-only contexts)
 */
export function getTierEmoji(tierName: string | null | undefined): string {
  const normalizedName = tierName?.toUpperCase().replace(/[\s-_]/g, '') || '';
  
  const emojis: Record<string, string> = {
    DIAMOND: '💎',
    PLATINUM: '👑',
    GOLD: '🏆',
    SILVER: '🥈',
    BRONZE: '🥉',
    VIP: '⭐',
    ELITE: '🔥',
    PREMIUM: '💫',
    MEMBER: '❤️',
    BASIC: '⭐',
    STARTER: '🌟',
    NONE: '○'
  };
  
  // Direct match
  if (emojis[normalizedName]) {
    return emojis[normalizedName];
  }
  
  // Partial match
  for (const [key, emoji] of Object.entries(emojis)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return emoji;
    }
  }
  
  return '⭐'; // Default star
}

/**
 * Sort tiers by priority
 */
export function sortTiersByPriority<T extends { name?: string; tierName?: string }>(
  tiers: T[]
): T[] {
  return [...tiers].sort((a, b) => {
    const nameA = (a as any).tierName || (a as any).name;
    const nameB = (b as any).tierName || (b as any).name;
    return getTierPriority(nameB) - getTierPriority(nameA);
  });
}

/**
 * Get CSS classes for tier styling
 */
export function getTierClasses(tierName: string | null | undefined): string {
  const style = getTierStyle(tierName);
  const normalizedName = tierName?.toLowerCase().replace(/[\s-_]/g, '-') || 'none';
  
  return `tier tier--${normalizedName}`;
}

/**
 * Get inline styles for tier components
 */
export function getTierInlineStyles(tierName: string | null | undefined): React.CSSProperties {
  const style = getTierStyle(tierName);
  
  return {
    '--tier-color': style.color,
    '--tier-bg': style.backgroundColor,
    '--tier-border': style.borderColor,
    '--tier-text': style.textColor,
    '--tier-gradient-from': style.gradientFrom,
    '--tier-gradient-to': style.gradientTo,
  } as React.CSSProperties;
}

/**
 * Create a tier badge component props
 */
export function getTierBadgeProps(tierName: string | null | undefined) {
  const style = getTierStyle(tierName);
  
  return {
    tone: style.badgeTone,
    icon: style.icon,
  };
}

// Export for use in components
export type { TierStyle, TierConfig };
export { 
  DiamondIcon,
  StarFilledIcon,
  TrophyIcon,
  AwardIcon,
  CrownIcon,
  HeartIcon,
  FlameIcon,
  GlobeIcon,
};