/**
 * Insight Rules - Rule-based insight generation system
 *
 * Defines rules for generating actionable insights with specific
 * thresholds, triggers, and recommended actions.
 */

import type { InsightCategory, InsightSeverity, InsightType } from "./insight-engine.server";
import { APP_ROUTES } from "~/navigation/routes";

// ============================================================================
// Types
// ============================================================================

export interface InsightRule {
  id: string;
  name: string;
  description: string;
  category: InsightCategory;
  type: InsightType;
  defaultSeverity: InsightSeverity;
  trigger: InsightTrigger;
  action?: InsightAction;
  cooldownHours?: number; // Prevent duplicate alerts
  enabled: boolean;
}

export interface InsightTrigger {
  metric: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'between' | 'change_gt' | 'change_lt';
  value: number;
  value2?: number; // For 'between' operator
  period?: string; // Time period for comparison (e.g., '30d', '7d')
  comparisonPeriod?: string; // For change operators
}

export interface InsightAction {
  label: string;
  href: string;
  priority: 'high' | 'medium' | 'low';
}

export interface InsightTemplate {
  title: string;
  description: string;
  explanation?: string;
}

// ============================================================================
// Rule Definitions
// ============================================================================

export const INSIGHT_RULES: InsightRule[] = [
  // =====================
  // REVENUE RULES
  // =====================
  {
    id: 'revenue_drop_warning',
    name: 'Revenue Drop Warning',
    description: 'Alerts when revenue drops significantly',
    category: 'revenue',
    type: 'metric_change',
    defaultSeverity: 'warning',
    trigger: {
      metric: 'revenue',
      operator: 'change_lt',
      value: -15,
      period: '30d',
      comparisonPeriod: '30d',
    },
    action: {
      label: 'Launch Campaign',
      href: `${APP_ROUTES.MARKETING.CAMPAIGNS.CREATE}?type=multiplier`,
      priority: 'high',
    },
    cooldownHours: 168, // 1 week
    enabled: true,
  },
  {
    id: 'revenue_spike_positive',
    name: 'Revenue Growth',
    description: 'Celebrates significant revenue growth',
    category: 'revenue',
    type: 'metric_change',
    defaultSeverity: 'positive',
    trigger: {
      metric: 'revenue',
      operator: 'change_gt',
      value: 25,
      period: '30d',
      comparisonPeriod: '30d',
    },
    cooldownHours: 168,
    enabled: true,
  },

  // =====================
  // POINTS ECONOMY RULES
  // =====================
  {
    id: 'high_points_liability',
    name: 'High Points Liability',
    description: 'Warns when points liability exceeds threshold',
    category: 'points',
    type: 'recommendation',
    defaultSeverity: 'warning',
    trigger: {
      metric: 'points_liability_ratio',
      operator: 'gt',
      value: 30, // 30% of monthly revenue
    },
    action: {
      label: 'Redemption Campaign',
      href: `${APP_ROUTES.MARKETING.CAMPAIGNS.CREATE}?type=redemption`,
      priority: 'high',
    },
    cooldownHours: 336, // 2 weeks
    enabled: true,
  },
  {
    id: 'low_redemption_rate',
    name: 'Low Redemption Rate',
    description: 'Identifies low point redemption engagement',
    category: 'points',
    type: 'recommendation',
    defaultSeverity: 'info',
    trigger: {
      metric: 'redemption_rate',
      operator: 'lt',
      value: 10,
      period: '30d',
    },
    action: {
      label: 'Send Reminder',
      href: `${APP_ROUTES.MARKETING.CAMPAIGNS.CREATE}?type=reminder`,
      priority: 'medium',
    },
    cooldownHours: 168,
    enabled: true,
  },
  {
    id: 'points_expiration_spike',
    name: 'Points Expiring Soon',
    description: 'Warns about large point expiration',
    category: 'points',
    type: 'recommendation',
    defaultSeverity: 'warning',
    trigger: {
      metric: 'expiring_points_7d',
      operator: 'gt',
      value: 1000,
    },
    action: {
      label: 'Send Expiry Reminder',
      href: `${APP_ROUTES.MARKETING.CAMPAIGNS.CREATE}?type=expiry_reminder`,
      priority: 'high',
    },
    cooldownHours: 72, // 3 days
    enabled: true,
  },
  {
    id: 'healthy_points_velocity',
    name: 'Healthy Points Velocity',
    description: 'Confirms good points earning/redemption balance',
    category: 'points',
    type: 'milestone',
    defaultSeverity: 'positive',
    trigger: {
      metric: 'points_velocity',
      operator: 'between',
      value: 0.8,
      value2: 1.2,
    },
    cooldownHours: 672, // 4 weeks
    enabled: true,
  },

  // =====================
  // TIER HEALTH RULES
  // =====================
  {
    id: 'tier_stagnation',
    name: 'Tier Stagnation',
    description: 'Low tier movement indicates engagement issues',
    category: 'tier',
    type: 'recommendation',
    defaultSeverity: 'info',
    trigger: {
      metric: 'tier_movement_rate',
      operator: 'lt',
      value: 5,
      period: '30d',
    },
    action: {
      label: 'Review Tier Settings',
      href: APP_ROUTES.MEMBERS.TIERS,
      priority: 'low',
    },
    cooldownHours: 336,
    enabled: true,
  },
  {
    id: 'vip_churn_risk',
    name: 'VIP Churn Risk',
    description: 'High-value customers at risk of churning',
    category: 'tier',
    type: 'recommendation',
    defaultSeverity: 'critical',
    trigger: {
      metric: 'vip_inactive_count',
      operator: 'gt',
      value: 0,
    },
    action: {
      label: 'Re-engage VIPs',
      href: '/app/members?tier=vip&inactive=45',
      priority: 'high',
    },
    cooldownHours: 168,
    enabled: true,
  },
  {
    id: 'rapid_upgrades',
    name: 'Strong Tier Progression',
    description: 'Many customers upgrading tiers',
    category: 'tier',
    type: 'milestone',
    defaultSeverity: 'positive',
    trigger: {
      metric: 'tier_upgrades_weekly',
      operator: 'gt',
      value: 20,
    },
    cooldownHours: 168,
    enabled: true,
  },
  {
    id: 'bulk_downgrade_alert',
    name: 'Bulk Tier Downgrade',
    description: 'Large number of customers downgraded',
    category: 'tier',
    type: 'anomaly',
    defaultSeverity: 'warning',
    trigger: {
      metric: 'tier_downgrades_24h',
      operator: 'gt',
      value: 10,
    },
    action: {
      label: 'Review Tier Rules',
      href: APP_ROUTES.MEMBERS.TIERS,
      priority: 'medium',
    },
    cooldownHours: 48,
    enabled: true,
  },

  // =====================
  // CASHBACK RULES
  // =====================
  {
    id: 'cashback_utilization_low',
    name: 'Low Cashback Utilization',
    description: 'Customers not using earned cashback',
    category: 'cashback',
    type: 'recommendation',
    defaultSeverity: 'info',
    trigger: {
      metric: 'cashback_utilization',
      operator: 'lt',
      value: 50,
      period: '60d',
    },
    action: {
      label: 'Send Reminder',
      href: `${APP_ROUTES.MARKETING.CAMPAIGNS.CREATE}?type=cashback_reminder`,
      priority: 'medium',
    },
    cooldownHours: 336,
    enabled: true,
  },
  {
    id: 'cashback_roi_negative',
    name: 'Cashback Profitability Concern',
    description: 'Cashback cost exceeds target ratio',
    category: 'cashback',
    type: 'recommendation',
    defaultSeverity: 'warning',
    trigger: {
      metric: 'cashback_cost_ratio',
      operator: 'gt',
      value: 5,
    },
    action: {
      label: 'Review Cashback Rates',
      href: APP_ROUTES.REWARDS.CONFIG,
      priority: 'medium',
    },
    cooldownHours: 336,
    enabled: true,
  },

  // =====================
  // ENGAGEMENT RULES
  // =====================
  {
    id: 'raffle_low_participation',
    name: 'Low Raffle Participation',
    description: 'Active raffles have low entry rate',
    category: 'engagement',
    type: 'recommendation',
    defaultSeverity: 'info',
    trigger: {
      metric: 'raffle_participation_rate',
      operator: 'lt',
      value: 10,
    },
    action: {
      label: 'Promote Raffles',
      href: '/app/rewards/raffles',
      priority: 'low',
    },
    cooldownHours: 168,
    enabled: true,
  },
  {
    id: 'strong_member_growth',
    name: 'Strong Member Growth',
    description: 'Significant new member acquisition',
    category: 'engagement',
    type: 'milestone',
    defaultSeverity: 'positive',
    trigger: {
      metric: 'new_members_weekly',
      operator: 'gt',
      value: 50,
    },
    cooldownHours: 168,
    enabled: true,
  },
  {
    id: 'declining_engagement',
    name: 'Declining Engagement',
    description: 'Overall engagement metrics declining',
    category: 'engagement',
    type: 'recommendation',
    defaultSeverity: 'warning',
    trigger: {
      metric: 'engagement_score',
      operator: 'change_lt',
      value: -20,
      period: '30d',
      comparisonPeriod: '30d',
    },
    action: {
      label: 'Review Engagement',
      href: '/app/analytics',
      priority: 'medium',
    },
    cooldownHours: 168,
    enabled: true,
  },

  // =====================
  // HEALTH RULES
  // =====================
  {
    id: 'program_health_critical',
    name: 'Program Health Critical',
    description: 'Overall program health needs attention',
    category: 'health',
    type: 'recommendation',
    defaultSeverity: 'critical',
    trigger: {
      metric: 'health_score',
      operator: 'lt',
      value: 40,
    },
    action: {
      label: 'View Recommendations',
      href: '/app/marketing/recommendations',
      priority: 'high',
    },
    cooldownHours: 168,
    enabled: true,
  },
  {
    id: 'program_health_excellent',
    name: 'Excellent Program Health',
    description: 'Program performing exceptionally',
    category: 'health',
    type: 'milestone',
    defaultSeverity: 'positive',
    trigger: {
      metric: 'health_score',
      operator: 'gt',
      value: 80,
    },
    cooldownHours: 672, // Monthly
    enabled: true,
  },
];

// ============================================================================
// Rule Management Functions
// ============================================================================

/**
 * Get all enabled rules
 */
export function getEnabledRules(): InsightRule[] {
  return INSIGHT_RULES.filter(rule => rule.enabled);
}

/**
 * Get rules by category
 */
export function getRulesByCategory(category: InsightCategory): InsightRule[] {
  return INSIGHT_RULES.filter(rule => rule.category === category && rule.enabled);
}

/**
 * Get rule by ID
 */
export function getRuleById(id: string): InsightRule | undefined {
  return INSIGHT_RULES.find(rule => rule.id === id);
}

/**
 * Evaluate a rule against metric data
 */
export function evaluateRule(
  rule: InsightRule,
  currentValue: number,
  previousValue?: number
): boolean {
  const { trigger } = rule;

  switch (trigger.operator) {
    case 'gt':
      return currentValue > trigger.value;
    case 'lt':
      return currentValue < trigger.value;
    case 'gte':
      return currentValue >= trigger.value;
    case 'lte':
      return currentValue <= trigger.value;
    case 'eq':
      return currentValue === trigger.value;
    case 'between':
      return currentValue >= trigger.value && currentValue <= (trigger.value2 || trigger.value);
    case 'change_gt':
      if (previousValue === undefined || previousValue === 0) return false;
      const changeGt = ((currentValue - previousValue) / previousValue) * 100;
      return changeGt > trigger.value;
    case 'change_lt':
      if (previousValue === undefined || previousValue === 0) return false;
      const changeLt = ((currentValue - previousValue) / previousValue) * 100;
      return changeLt < trigger.value;
    default:
      return false;
  }
}

// ============================================================================
// Message Templates
// ============================================================================

export const INSIGHT_TEMPLATES: Record<string, InsightTemplate> = {
  revenue_drop_warning: {
    title: 'Revenue Declining',
    description: 'Revenue is down {change}% compared to the previous period. Consider running a promotional campaign to re-engage customers.',
    explanation: 'A decline of over 15% may indicate reduced customer engagement, increased competition, or seasonal factors.',
  },
  revenue_spike_positive: {
    title: 'Revenue Growing Strong',
    description: 'Revenue increased {change}% compared to the previous period. Great momentum!',
    explanation: 'Strong revenue growth indicates healthy program engagement and effective loyalty strategies.',
  },
  high_points_liability: {
    title: 'High Points Liability',
    description: 'Outstanding points represent {value}% of monthly revenue. Consider a redemption campaign to reduce liability.',
    explanation: 'High points liability can affect cash flow and financial forecasting. Encouraging redemption helps manage this.',
  },
  low_redemption_rate: {
    title: 'Low Redemption Rate',
    description: 'Only {value}% of earned points are being redeemed. Customers may need reminders about their rewards.',
    explanation: 'Low redemption rates may indicate unclear redemption options, lack of awareness, or unappealing rewards.',
  },
  points_expiration_spike: {
    title: 'Points Expiring Soon',
    description: '{value} points are expiring in the next 7 days. Send reminders to affected customers.',
    explanation: 'Expired points represent lost engagement opportunities and may frustrate customers.',
  },
  tier_stagnation: {
    title: 'Low Tier Movement',
    description: 'Only {value}% tier movement in the last 30 days. Consider adjusting thresholds or running bonus events.',
    explanation: 'Low tier movement may indicate thresholds are too difficult to achieve or customers are disengaged.',
  },
  vip_churn_risk: {
    title: 'VIP Customers at Risk',
    description: '{value} VIP customers haven\'t ordered in 45+ days. Re-engage before they churn.',
    explanation: 'VIP customers represent your highest-value segment. Losing them significantly impacts revenue.',
  },
  rapid_upgrades: {
    title: 'Strong Tier Progression',
    description: '{value} customers upgraded tiers this week. Your tier program is driving engagement!',
    explanation: 'High tier progression indicates customers are motivated to earn status and benefits.',
  },
  cashback_utilization_low: {
    title: 'Unused Cashback',
    description: 'Only {value}% of earned cashback has been used. Send reminders to customers about their balance.',
    explanation: 'Unused cashback represents unrealized customer engagement opportunities.',
  },
  cashback_roi_negative: {
    title: 'Cashback Profitability Concern',
    description: 'Cashback cost is {value}% of influenced revenue. Review rates for profitability.',
    explanation: 'High cashback costs relative to revenue may impact program sustainability.',
  },
  strong_member_growth: {
    title: 'Strong Member Growth',
    description: '{value} new members joined this week. Great acquisition momentum!',
    explanation: 'Growing membership base indicates strong program appeal and effective marketing.',
  },
  program_health_critical: {
    title: 'Program Health Needs Attention',
    description: 'Your program health score is {value}. Review recommendations to improve performance.',
    explanation: 'A low health score indicates multiple areas need improvement for program success.',
  },
  program_health_excellent: {
    title: 'Excellent Program Performance',
    description: 'Your program health score is {value}. Keep up the great work!',
    explanation: 'A high health score indicates strong performance across engagement, retention, and ROI.',
  },
};

/**
 * Get template for a rule
 */
export function getTemplateForRule(ruleId: string): InsightTemplate | undefined {
  return INSIGHT_TEMPLATES[ruleId];
}

/**
 * Format template with values
 */
export function formatTemplate(template: InsightTemplate, values: Record<string, string | number>): InsightTemplate {
  let title = template.title;
  let description = template.description;
  let explanation = template.explanation;

  for (const [key, value] of Object.entries(values)) {
    const placeholder = `{${key}}`;
    title = title.replace(placeholder, String(value));
    description = description.replace(placeholder, String(value));
    if (explanation) {
      explanation = explanation.replace(placeholder, String(value));
    }
  }

  return { title, description, explanation };
}

export default INSIGHT_RULES;
