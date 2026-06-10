/**
 * Analytics Widgets - Export all widget components
 */

// Base components
export { BaseWidget, type WidgetProps, type WidgetSize } from "./BaseWidget";

// KPI Widgets
export { MetricCardWidget, type MetricCardProps } from "./MetricCardWidget";

// Insight Widgets
export { InsightWidget, type InsightWidgetProps } from "./InsightWidget";
export { HealthScoreWidget, type HealthScoreWidgetProps } from "./HealthScoreWidget";

// Comparison Widgets
export { ComparisonWidget, type ComparisonWidgetProps, type ComparisonData } from "./ComparisonWidget";

// Registry
export {
  WIDGET_REGISTRY,
  DEFAULT_LAYOUT,
  getWidgetsByCategory,
  getDefaultWidgets,
  getWidgetById,
  getAllWidgets,
  type WidgetDefinition,
  type WidgetCategory,
  type DashboardLayout,
} from "./WidgetRegistry";
