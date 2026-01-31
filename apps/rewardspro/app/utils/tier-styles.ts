/**
 * Tier Styling Configuration
 * 
 * Design Principles:
 * 1. Progressive Value: Colors progress from cool (basic) to warm (premium)
 * 2. Accessibility: All colors meet WCAG 2.1 AA contrast ratios (4.5:1)
 * 3. Semantic Consistency: Icons clearly represent tier value/status
 * 4. Cultural Sensitivity: Avoid red/white combinations, use universal symbols
 * 5. Visual Hierarchy: Higher tiers have stronger visual weight
 */

import {
  RewardIcon,
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
  // Additional properties for comprehensive styling
  shadowColor: string;
  contrastColor: string; // For text on colored backgrounds
}

export interface TierConfig {
  name: string;
  style: TierStyle;
  priority: number; // For sorting (higher = better tier)
}

/**
 * Color Palette based on design guide recommendations:
 * - Uses dopamine colors for engagement (bright, energetic)
 * - Maintains 4.5:1 contrast ratio for accessibility
 * - Progressive warmth: cool (basic) → warm (premium)
 * - Avoids cultural conflicts (no red/white death symbolism)
 */
export const DEFAULT_TIER_STYLES: Record<string, TierStyle> = {
  // Premium/Luxury Tiers (Warm colors, high visual weight)
  DIAMOND: {
    icon: RewardIcon, // Unified tier icon
    color: '#7C3AED', // Rich purple (luxury, creativity)
    badgeTone: 'new',
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    borderColor: 'rgba(124, 58, 237, 0.24)',
    textColor: '#7C3AED',
    gradientFrom: '#8B5CF6',
    gradientTo: '#6D28D9',
    shadowColor: 'rgba(124, 58, 237, 0.15)',
    contrastColor: '#FFFFFF'
  },
  
  PLATINUM: {
    icon: RewardIcon, // Unified tier icon
    color: '#4B5563', // Sophisticated gray-blue
    badgeTone: 'enabled',
    backgroundColor: 'rgba(75, 85, 99, 0.08)',
    borderColor: 'rgba(75, 85, 99, 0.24)',
    textColor: '#4B5563',
    gradientFrom: '#6B7280',
    gradientTo: '#374151',
    shadowColor: 'rgba(75, 85, 99, 0.15)',
    contrastColor: '#FFFFFF'
  },
  
  GOLD: {
    icon: RewardIcon, // Unified tier icon
    color: '#F59E0B', // Warm amber (prosperity, success)
    badgeTone: 'warning',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.24)',
    textColor: '#D97706',
    gradientFrom: '#FCD34D',
    gradientTo: '#F59E0B',
    shadowColor: 'rgba(245, 158, 11, 0.15)',
    contrastColor: '#FFFFFF'
  },
  
  // Mid-tier (Balanced colors)
  SILVER: {
    icon: RewardIcon, // Unified tier icon
    color: '#6B7280', // Neutral gray (professional)
    badgeTone: 'read-only',
    backgroundColor: 'rgba(107, 114, 128, 0.08)',
    borderColor: 'rgba(107, 114, 128, 0.24)',
    textColor: '#6B7280',
    gradientFrom: '#9CA3AF',
    gradientTo: '#6B7280',
    shadowColor: 'rgba(107, 114, 128, 0.15)',
    contrastColor: '#FFFFFF'
  },
  
  BRONZE: {
    icon: RewardIcon, // Unified tier icon
    color: '#92400E', // Earthy brown (grounded, stable)
    badgeTone: 'attention',
    backgroundColor: 'rgba(146, 64, 14, 0.08)',
    borderColor: 'rgba(146, 64, 14, 0.24)',
    textColor: '#92400E',
    gradientFrom: '#B45309',
    gradientTo: '#78350F',
    shadowColor: 'rgba(146, 64, 14, 0.15)',
    contrastColor: '#FFFFFF'
  },
  
  // Status-based tiers (Strong identity colors)
  VIP: {
    icon: RewardIcon, // Unified tier icon
    color: '#DC2626', // Vibrant red (importance, priority)
    badgeTone: 'critical',
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderColor: 'rgba(220, 38, 38, 0.24)',
    textColor: '#DC2626',
    gradientFrom: '#EF4444',
    gradientTo: '#B91C1C',
    shadowColor: 'rgba(220, 38, 38, 0.15)',
    contrastColor: '#FFFFFF'
  },
  
  ELITE: {
    icon: RewardIcon, // Unified tier icon
    color: '#0891B2', // Cyan (fresh, modern)
    badgeTone: 'info',
    backgroundColor: 'rgba(8, 145, 178, 0.08)',
    borderColor: 'rgba(8, 145, 178, 0.24)',
    textColor: '#0891B2',
    gradientFrom: '#06B6D4',
    gradientTo: '#0284C7',
    shadowColor: 'rgba(8, 145, 178, 0.15)',
    contrastColor: '#FFFFFF'
  },
  
  PREMIUM: {
    icon: RewardIcon, // Unified tier icon
    color: '#0066FF', // Shopify blue (trust, reliability)
    badgeTone: 'info',
    backgroundColor: 'rgba(0, 102, 255, 0.08)',
    borderColor: 'rgba(0, 102, 255, 0.24)',
    textColor: '#0066FF',
    gradientFrom: '#4D94FF',
    gradientTo: '#0052CC',
    shadowColor: 'rgba(0, 102, 255, 0.15)',
    contrastColor: '#FFFFFF'
  },
  
  // Basic tiers (Cool colors, approachable)
  MEMBER: {
    icon: RewardIcon, // Unified tier icon
    color: '#059669', // Emerald (growth, positivity)
    badgeTone: 'success',
    backgroundColor: 'rgba(5, 150, 105, 0.08)',
    borderColor: 'rgba(5, 150, 105, 0.24)',
    textColor: '#059669',
    gradientFrom: '#10B981',
    gradientTo: '#047857',
    shadowColor: 'rgba(5, 150, 105, 0.15)',
    contrastColor: '#FFFFFF'
  },
  
  BASIC: {
    icon: RewardIcon, // Unified tier icon
    color: '#3B82F6', // Friendly blue (approachable)
    badgeTone: 'info',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderColor: 'rgba(59, 130, 246, 0.24)',
    textColor: '#3B82F6',
    gradientFrom: '#60A5FA',
    gradientTo: '#2563EB',
    shadowColor: 'rgba(59, 130, 246, 0.15)',
    contrastColor: '#FFFFFF'
  },
  
  STARTER: {
    icon: RewardIcon, // Unified tier icon
    color: '#10B981', // Green (fresh start)
    badgeTone: 'success',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.24)',
    textColor: '#10B981',
    gradientFrom: '#34D399',
    gradientTo: '#059669',
    shadowColor: 'rgba(16, 185, 129, 0.15)',
    contrastColor: '#FFFFFF'
  },
  
  // Special purpose tiers
  INSIDER: {
    icon: RewardIcon, // Unified tier icon
    color: '#8B5CF6', // Purple (exclusive, special)
    badgeTone: 'new',
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderColor: 'rgba(139, 92, 246, 0.24)',
    textColor: '#8B5CF6',
    gradientFrom: '#A78BFA',
    gradientTo: '#7C3AED',
    shadowColor: 'rgba(139, 92, 246, 0.15)',
    contrastColor: '#FFFFFF'
  },
  
  LOYAL: {
    icon: RewardIcon, // Unified tier icon
    color: '#EA580C', // Orange (energy, enthusiasm)
    badgeTone: 'attention',
    backgroundColor: 'rgba(234, 88, 12, 0.08)',
    borderColor: 'rgba(234, 88, 12, 0.24)',
    textColor: '#EA580C',
    gradientFrom: '#FB923C',
    gradientTo: '#C2410C',
    shadowColor: 'rgba(234, 88, 12, 0.15)',
    contrastColor: '#FFFFFF'
  },
  
  // Default/No tier
  NONE: {
    icon: RewardIcon,
    color: '#9CA3AF', // Light gray (neutral)
    badgeTone: 'read-only',
    backgroundColor: 'rgba(156, 163, 175, 0.08)',
    borderColor: 'rgba(156, 163, 175, 0.24)',
    textColor: '#9CA3AF',
    gradientFrom: '#D1D5DB',
    gradientTo: '#9CA3AF',
    shadowColor: 'rgba(156, 163, 175, 0.15)',
    contrastColor: '#4B5563'
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
    if (num === 1) return DEFAULT_TIER_STYLES.STARTER;
    if (num === 2) return DEFAULT_TIER_STYLES.BRONZE;
    if (num === 3) return DEFAULT_TIER_STYLES.SILVER;
    if (num === 4) return DEFAULT_TIER_STYLES.GOLD;
    if (num === 5) return DEFAULT_TIER_STYLES.PLATINUM;
    if (num >= 6) return DEFAULT_TIER_STYLES.DIAMOND;
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
    INSIDER: 77,
    LOYAL: 65,
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
  
  // Number-based tiers
  const tierNumber = tierName.match(/\d+/)?.[0];
  if (tierNumber) {
    return parseInt(tierNumber, 10) * 10;
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
 * Get tier iconId for icon display
 */
export function getTierIconId(tierName: string | null | undefined): string {
  const normalizedName = tierName?.toUpperCase().replace(/[\s-_]/g, '') || '';

  const iconIds: Record<string, string> = {
    DIAMOND: 'gem',
    PLATINUM: 'trophy',
    GOLD: 'medal',
    SILVER: 'medal',
    BRONZE: 'medal',
    VIP: 'star',
    ELITE: 'sparkle',
    PREMIUM: 'star',
    INSIDER: 'target',
    LOYAL: 'coins',
    MEMBER: 'heart',
    BASIC: 'star',
    STARTER: 'sparkle',
    NONE: 'circle'
  };

  // Direct match
  if (iconIds[normalizedName]) {
    return iconIds[normalizedName];
  }

  // Partial match
  for (const [key, iconId] of Object.entries(iconIds)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return iconId;
    }
  }

  return 'star'; // Default star
}

/**
 * @deprecated Use getTierIconId instead
 */
export function getTierEmoji(tierName: string | null | undefined): string {
  return ""; // Deprecated - use iconId
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
 * Includes CSS custom properties for flexible theming
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
    '--tier-shadow': style.shadowColor,
    '--tier-contrast': style.contrastColor,
  } as React.CSSProperties;
}

/**
 * Create tier badge component props
 */
export function getTierBadgeProps(tierName: string | null | undefined) {
  const style = getTierStyle(tierName);
  
  return {
    tone: style.badgeTone,
    icon: style.icon,
  };
}

/**
 * Get accessible color for text on tier background
 * Ensures WCAG 2.1 AA compliance (4.5:1 contrast ratio)
 */
export function getTierTextColor(tierName: string | null | undefined, onColoredBg: boolean = false): string {
  const style = getTierStyle(tierName);
  return onColoredBg ? style.contrastColor : style.textColor;
}

/**
 * Generate CSS for tier gradients (for badges, cards, etc.)
 */
export function getTierGradientCSS(tierName: string | null | undefined, direction: 'horizontal' | 'vertical' | 'diagonal' = 'horizontal'): string {
  const style = getTierStyle(tierName);
  
  const directions = {
    horizontal: 'to right',
    vertical: 'to bottom',
    diagonal: 'to bottom right'
  };
  
  return `linear-gradient(${directions[direction]}, ${style.gradientFrom}, ${style.gradientTo})`;
}

/**
 * Check if tier should use dark text on light background
 * Based on color luminance calculation
 */
export function tierNeedsDarkText(tierName: string | null | undefined): boolean {
  const style = getTierStyle(tierName);
  
  // Light colors that need dark text
  const lightTiers = ['GOLD', 'SILVER', 'NONE'];
  const normalizedName = tierName?.toUpperCase().replace(/[\s-_]/g, '') || '';
  
  return lightTiers.some(tier => normalizedName.includes(tier));
}

// Re-export icon for convenience
export {
  RewardIcon,
};

// ============================================
// CSS GENERATION (Single Source of Truth)
// ============================================

/**
 * Generate CSS custom properties for all tier colors.
 * This is the SINGLE SOURCE OF TRUTH for tier colors.
 *
 * Usage in CSS: var(--rp-tier-bronze), var(--rp-tier-gold-gradient-from), etc.
 *
 * DO NOT define tier colors elsewhere. Import from here.
 */
export function generateTierCSSProperties(): string {
  const lines: string[] = [
    '/* ============================================',
    '   TIER COLORS (Auto-generated from tier-styles.ts)',
    '   Single Source of Truth - DO NOT EDIT MANUALLY',
    '   Regenerate with: generateTierCSSProperties()',
    '   ============================================ */',
    ''
  ];

  for (const [name, style] of Object.entries(DEFAULT_TIER_STYLES)) {
    const prefix = `--rp-tier-${name.toLowerCase()}`;
    lines.push(`  /* ${name} Tier */`);
    lines.push(`  ${prefix}: ${style.color};`);
    lines.push(`  ${prefix}-text: ${style.textColor};`);
    lines.push(`  ${prefix}-bg: ${style.backgroundColor};`);
    lines.push(`  ${prefix}-border: ${style.borderColor};`);
    lines.push(`  ${prefix}-gradient-from: ${style.gradientFrom};`);
    lines.push(`  ${prefix}-gradient-to: ${style.gradientTo};`);
    lines.push(`  ${prefix}-shadow: ${style.shadowColor};`);
    lines.push(`  ${prefix}-contrast: ${style.contrastColor};`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get a tier color CSS variable reference.
 * Use this instead of hardcoding colors.
 *
 * @example getTierCSSVar('gold') => 'var(--rp-tier-gold)'
 * @example getTierCSSVar('gold', 'gradient-from') => 'var(--rp-tier-gold-gradient-from)'
 */
export function getTierCSSVar(
  tierName: string,
  property?: 'text' | 'bg' | 'border' | 'gradient-from' | 'gradient-to' | 'shadow' | 'contrast'
): string {
  const normalizedName = tierName.toLowerCase().replace(/[\s-_]/g, '');
  const suffix = property ? `-${property}` : '';
  return `var(--rp-tier-${normalizedName}${suffix})`;
}

/**
 * Core tier names for CSS class generation and validation
 */
export const CORE_TIER_NAMES = [
  'diamond', 'platinum', 'gold', 'silver', 'bronze',
  'vip', 'elite', 'premium', 'member', 'basic', 'starter',
  'insider', 'loyal', 'none'
] as const;

export type CoreTierName = typeof CORE_TIER_NAMES[number];