/**
 * WidgetRegistry - Central registry of all available dashboard widgets
 */

import type { WidgetSize } from "./BaseWidget";

export type WidgetCategory = 'kpi' | 'chart' | 'table' | 'insight' | 'comparison';

export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  component: string; // Component path for dynamic import
  defaultSize: WidgetSize;
  category: WidgetCategory;
  dataRequirements: string[];
  refreshInterval?: number; // Auto-refresh in seconds
  minWidth?: number;
  defaultEnabled?: boolean;
}

// Widget Registry
export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  // KPI Widgets
  'revenue-kpi': {
    id: 'revenue-kpi',
    name: 'Revenue',
    description: 'Total revenue from loyalty customers',
    component: 'MetricCardWidget',
    defaultSize: 'small',
    category: 'kpi',
    dataRequirements: ['revenue'],
    refreshInterval: 300,
    defaultEnabled: true,
  },
  'members-kpi': {
    id: 'members-kpi',
    name: 'Total Members',
    description: 'Total enrolled loyalty members',
    component: 'MetricCardWidget',
    defaultSize: 'small',
    category: 'kpi',
    dataRequirements: ['members'],
    refreshInterval: 300,
    defaultEnabled: true,
  },
  'points-kpi': {
    id: 'points-kpi',
    name: 'Points Outstanding',
    description: 'Total unredeemed points liability',
    component: 'MetricCardWidget',
    defaultSize: 'small',
    category: 'kpi',
    dataRequirements: ['points'],
    refreshInterval: 300,
    defaultEnabled: true,
  },
  'redemption-rate-kpi': {
    id: 'redemption-rate-kpi',
    name: 'Redemption Rate',
    description: 'Percentage of earned points redeemed',
    component: 'MetricCardWidget',
    defaultSize: 'small',
    category: 'kpi',
    dataRequirements: ['points'],
    refreshInterval: 600,
    defaultEnabled: true,
  },

  // Health & Insight Widgets
  'program-health': {
    id: 'program-health',
    name: 'Program Health',
    description: 'Overall loyalty program health score',
    component: 'HealthScoreWidget',
    defaultSize: 'medium',
    category: 'insight',
    dataRequirements: ['health'],
    refreshInterval: 900,
    defaultEnabled: true,
  },
  'insights-feed': {
    id: 'insights-feed',
    name: 'Insights & Actions',
    description: 'AI-generated insights and recommendations',
    component: 'InsightWidget',
    defaultSize: 'large',
    category: 'insight',
    dataRequirements: ['insights'],
    refreshInterval: 600,
    defaultEnabled: true,
  },

  // Comparison Widgets
  'revenue-comparison': {
    id: 'revenue-comparison',
    name: 'Revenue Comparison',
    description: 'Compare revenue across time periods',
    component: 'ComparisonWidget',
    defaultSize: 'medium',
    category: 'comparison',
    dataRequirements: ['revenue', 'comparison'],
    refreshInterval: 600,
    defaultEnabled: true,
  },
  'engagement-comparison': {
    id: 'engagement-comparison',
    name: 'Engagement Comparison',
    description: 'Compare engagement metrics',
    component: 'ComparisonWidget',
    defaultSize: 'medium',
    category: 'comparison',
    dataRequirements: ['engagement', 'comparison'],
    refreshInterval: 600,
    defaultEnabled: false,
  },

  // Chart Widgets (to be implemented)
  'tier-distribution': {
    id: 'tier-distribution',
    name: 'Tier Distribution',
    description: 'Customer distribution across tiers',
    component: 'TierChartWidget',
    defaultSize: 'medium',
    category: 'chart',
    dataRequirements: ['tiers'],
    refreshInterval: 600,
    defaultEnabled: true,
  },
  'revenue-trend': {
    id: 'revenue-trend',
    name: 'Revenue Trend',
    description: 'Revenue over time chart',
    component: 'TrendChartWidget',
    defaultSize: 'large',
    category: 'chart',
    dataRequirements: ['revenue', 'timeseries'],
    refreshInterval: 600,
    defaultEnabled: true,
  },
  'points-velocity': {
    id: 'points-velocity',
    name: 'Points Velocity',
    description: 'Points earning and redemption trends',
    component: 'TrendChartWidget',
    defaultSize: 'medium',
    category: 'chart',
    dataRequirements: ['points', 'timeseries'],
    refreshInterval: 600,
    defaultEnabled: false,
  },

  // Table Widgets
  'top-customers': {
    id: 'top-customers',
    name: 'Top Customers',
    description: 'Highest value customers',
    component: 'TableWidget',
    defaultSize: 'medium',
    category: 'table',
    dataRequirements: ['customers'],
    refreshInterval: 900,
    defaultEnabled: true,
  },
  'recent-redemptions': {
    id: 'recent-redemptions',
    name: 'Recent Redemptions',
    description: 'Latest point redemptions',
    component: 'TableWidget',
    defaultSize: 'medium',
    category: 'table',
    dataRequirements: ['redemptions'],
    refreshInterval: 300,
    defaultEnabled: false,
  },
};

// Get widgets by category
export function getWidgetsByCategory(category: WidgetCategory): WidgetDefinition[] {
  return Object.values(WIDGET_REGISTRY).filter(w => w.category === category);
}

// Get default enabled widgets
export function getDefaultWidgets(): WidgetDefinition[] {
  return Object.values(WIDGET_REGISTRY).filter(w => w.defaultEnabled);
}

// Get widget by ID
export function getWidgetById(id: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY[id];
}

// Get all widgets
export function getAllWidgets(): WidgetDefinition[] {
  return Object.values(WIDGET_REGISTRY);
}

// Default layout configuration
export interface DashboardLayout {
  widgets: Array<{
    id: string;
    position: number;
    size?: WidgetSize;
    visible: boolean;
  }>;
}

export const DEFAULT_LAYOUT: DashboardLayout = {
  widgets: [
    { id: 'revenue-kpi', position: 0, visible: true },
    { id: 'members-kpi', position: 1, visible: true },
    { id: 'points-kpi', position: 2, visible: true },
    { id: 'redemption-rate-kpi', position: 3, visible: true },
    { id: 'program-health', position: 4, visible: true },
    { id: 'revenue-comparison', position: 5, visible: true },
    { id: 'insights-feed', position: 6, visible: true },
    { id: 'tier-distribution', position: 7, visible: true },
    { id: 'revenue-trend', position: 8, visible: true },
    { id: 'top-customers', position: 9, visible: true },
  ],
};

export default WIDGET_REGISTRY;
