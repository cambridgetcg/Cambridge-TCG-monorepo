/**
 * RewardsPro Renaissance Component Library
 * "The Merchant's Constellation" Design System
 *
 * Export all Renaissance-styled components
 */

// Cards
export { Card, CardGilded, CardSpotlight, CardParchment } from './Card';
export type { CardProps } from './Card';

// KPI Display
export { KPICard } from './KPICard';
export type { KPICardProps } from './KPICard';

// Tier System
export { TierBadge } from './TierBadge';
export type { TierBadgeProps, TierLevel } from './TierBadge';

// Progress Indicators
export { ProgressBar, ProgressJourney } from './Progress';
export type { ProgressBarProps, ProgressJourneyProps } from './Progress';

// Store Credit
export { TreasureDisplay } from './TreasureDisplay';
export type { TreasureDisplayProps } from './TreasureDisplay';

// Activity
export { ActivityFeed, ActivityItem, ActivityIndicator } from './ActivityFeed';
export type { ActivityFeedProps, ActivityItemProps, ActivityItemData } from './ActivityFeed';

// Buttons
export { Button, IconButton, ButtonGroup, LinkButton, TextLink } from './Button';
export type { ButtonProps } from './Button';

// Stats
export { StatsGrid, StatItem, StatInline, StatsSummary } from './StatsGrid';
export type { StatsGridProps, StatItemProps, StatItemData } from './StatsGrid';

// Additional exports from Progress
export { ProgressRing } from './Progress';
export type { TierMilestone } from './Progress';

// Additional exports from TierBadge
export { TierBadgeWithName, TierIndicator } from './TierBadge';

// Additional exports from TreasureDisplay
export { TreasureInline, CashbackPreview } from './TreasureDisplay';

// Dashboard-specific components
export {
  SystemStatusCard,
  SystemStatusGrid,
  SystemHealthBanner,
  FeatureToggle,
  FeatureManagerSection,
  UsageMeter,
  UsageIndicator,
} from './dashboard';
export type {
  SystemStatus,
  SystemStatusCardProps,
  FeatureToggleProps,
  UsageMeterProps,
} from './dashboard';

// Settings components
export {
  SettingsSection,
  SettingsField,
  SettingsDivider,
  SettingsActionBar,
  SettingsCallout,
  ColorPickerRenaissance,
  ColorSwatch,
} from './settings';
export type {
  SettingsSectionProps,
  ColorPickerProps,
} from './settings';
