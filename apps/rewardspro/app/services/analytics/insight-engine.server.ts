/**
 * Insight Engine - Transforms raw metrics into actionable insights
 *
 * Provides:
 * - Metric interpretation with historical context
 * - Anomaly detection
 * - Correlation analysis
 * - Health scoring
 */

import { db } from "~/db.server";
import { getCached, setCache } from "~/utils/analytics-cache.server";
import { APP_ROUTES } from "~/navigation/routes";

// Cache TTL constants
const INSIGHTS_CACHE_TTL = 60_000; // 60 seconds
const HEALTH_SCORE_CACHE_TTL = 60_000; // 60 seconds

// Helper to generate cache keys
function insightCacheKey(shop: string, type: string): string {
  return `insights:${shop}:${type}`;
}

// Helper to safely convert Decimal/number values (Data API returns plain numbers, Prisma returns Decimal objects)
// Uses Number() which calls valueOf() - more reliable than .toNumber() which can fail in minified builds
function toNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  // Use Number() instead of .toNumber() - it works via valueOf() and is more reliable
  // .toNumber() can fail in minified code due to prototype chain issues
  const num = Number(value);
  return isNaN(num) ? 0 : num;
}

// ============================================================================
// Types & Interfaces
// ============================================================================

export type InsightType = 'metric_change' | 'correlation' | 'anomaly' | 'prediction' | 'recommendation' | 'milestone';
export type InsightSeverity = 'info' | 'warning' | 'critical' | 'positive';
export type InsightCategory = 'revenue' | 'points' | 'tier' | 'cashback' | 'engagement' | 'health';

export interface AnalyticsInsight {
  id: string;
  type: InsightType;
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  description: string;
  metric: string;
  value: number;
  change?: {
    amount: number;
    percentage: number;
    period: string;
    direction: 'up' | 'down' | 'flat';
  };
  action?: {
    label: string;
    href: string;
    priority: 'high' | 'medium' | 'low';
  };
  context?: {
    explanation: string;
    benchmark?: number;
    benchmarkLabel?: string;
  };
  confidence?: number;
  createdAt: Date;
  expiresAt?: Date;
}

export interface HealthScore {
  overall: number;
  engagement: number;
  retention: number;
  roi: number;
  growth: number;
  breakdown: HealthBreakdown[];
}

export interface HealthBreakdown {
  category: string;
  score: number;
  weight: number;
  factors: string[];
}

export interface MetricTimeSeries {
  metric: string;
  values: { date: Date; value: number }[];
}

export interface AnomalyResult {
  metric: string;
  date: Date;
  value: number;
  expected: number;
  deviation: number;
  severity: 'low' | 'medium' | 'high';
}

export interface CorrelationResult {
  metric1: string;
  metric2: string;
  coefficient: number;
  strength: 'strong' | 'moderate' | 'weak' | 'none';
  direction: 'positive' | 'negative';
}

export interface ForecastResult {
  metric: string;
  periods: { date: Date; predicted: number; confidence: { low: number; high: number } }[];
}

// ============================================================================
// Insight Engine Class
// ============================================================================

export class InsightEngine {
  private shop: string;

  constructor(shop: string) {
    this.shop = shop;
  }

  /**
   * Generate all insights for the shop
   * Results are cached for 60 seconds to reduce DB load
   */
  async generateInsights(): Promise<AnalyticsInsight[]> {
    // Check cache first (KV-backed, survives cold starts)
    const cacheKey = insightCacheKey(this.shop, 'all');
    const cached = await getCached<AnalyticsInsight[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const insights: AnalyticsInsight[] = [];

    try {
      // Fetch all required data in parallel
      const [
        revenueInsights,
        pointsInsights,
        tierInsights,
        cashbackInsights,
        engagementInsights,
        anomalies,
      ] = await Promise.all([
        this.generateRevenueInsights(),
        this.generatePointsInsights(),
        this.generateTierInsights(),
        this.generateCashbackInsights(),
        this.generateEngagementInsights(),
        this.detectAnomalies(),
      ]);

      insights.push(
        ...revenueInsights,
        ...pointsInsights,
        ...tierInsights,
        ...cashbackInsights,
        ...engagementInsights,
        ...anomalies.map(a => this.anomalyToInsight(a))
      );

      // Sort by severity and confidence
      const result = this.prioritizeInsights(insights);

      // Cache the result (fire-and-forget; cache write shouldn't block return)
      void setCache(cacheKey, result, INSIGHTS_CACHE_TTL);

      return result;
    } catch (error) {
      console.error('[InsightEngine] Error generating insights:', error);
      return [];
    }
  }

  /**
   * Calculate overall program health score
   * Results are cached for 60 seconds to reduce DB load
   */
  async calculateHealthScore(): Promise<HealthScore> {
    // Check cache first (KV-backed, survives cold starts)
    const cacheKey = insightCacheKey(this.shop, 'healthScore');
    const cached = await getCached<HealthScore>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const [engagement, retention, roi, growth] = await Promise.all([
        this.calculateEngagementScore(),
        this.calculateRetentionScore(),
        this.calculateROIScore(),
        this.calculateGrowthScore(),
      ]);

      // Weighted average for overall score
      const weights = { engagement: 0.3, retention: 0.25, roi: 0.25, growth: 0.2 };
      const overall = Math.round(
        engagement.score * weights.engagement +
        retention.score * weights.retention +
        roi.score * weights.roi +
        growth.score * weights.growth
      );

      const result: HealthScore = {
        overall,
        engagement: engagement.score,
        retention: retention.score,
        roi: roi.score,
        growth: growth.score,
        breakdown: [
          { category: 'Engagement', score: engagement.score, weight: weights.engagement, factors: engagement.factors },
          { category: 'Retention', score: retention.score, weight: weights.retention, factors: retention.factors },
          { category: 'ROI', score: roi.score, weight: weights.roi, factors: roi.factors },
          { category: 'Growth', score: growth.score, weight: weights.growth, factors: growth.factors },
        ],
      };

      // Cache the result (fire-and-forget)
      void setCache(cacheKey, result, HEALTH_SCORE_CACHE_TTL);

      return result;
    } catch (error) {
      console.error('[InsightEngine] Error calculating health score:', error);
      return {
        overall: 0,
        engagement: 0,
        retention: 0,
        roi: 0,
        growth: 0,
        breakdown: [],
      };
    }
  }

  // ============================================================================
  // Revenue Insights
  // ============================================================================

  private async generateRevenueInsights(): Promise<AnalyticsInsight[]> {
    const insights: AnalyticsInsight[] = [];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    try {
      // Get revenue metrics for current and previous period
      const [currentRevenue, previousRevenue] = await Promise.all([
        this.getRevenueForPeriod(thirtyDaysAgo, new Date()),
        this.getRevenueForPeriod(sixtyDaysAgo, thirtyDaysAgo),
      ]);

      if (previousRevenue > 0) {
        const change = ((currentRevenue - previousRevenue) / previousRevenue) * 100;

        if (change < -15) {
          insights.push({
            id: `revenue-drop-${Date.now()}`,
            type: 'metric_change',
            category: 'revenue',
            severity: 'warning',
            title: 'Revenue Declining',
            description: `Revenue is down ${Math.abs(change).toFixed(1)}% compared to the previous 30 days. Consider running a promotional campaign.`,
            metric: 'revenue',
            value: currentRevenue,
            change: {
              amount: currentRevenue - previousRevenue,
              percentage: change,
              period: '30d',
              direction: 'down',
            },
            action: {
              label: 'Launch Campaign',
              href: '/app/marketing/campaigns/create?type=multiplier',
              priority: 'high',
            },
            context: {
              explanation: 'A decline of over 15% may indicate reduced customer engagement or increased competition.',
            },
            confidence: 0.9,
            createdAt: new Date(),
          });
        } else if (change > 25) {
          insights.push({
            id: `revenue-spike-${Date.now()}`,
            type: 'metric_change',
            category: 'revenue',
            severity: 'positive',
            title: 'Revenue Growing Strong',
            description: `Revenue increased ${change.toFixed(1)}% compared to the previous 30 days. Great momentum!`,
            metric: 'revenue',
            value: currentRevenue,
            change: {
              amount: currentRevenue - previousRevenue,
              percentage: change,
              period: '30d',
              direction: 'up',
            },
            context: {
              explanation: 'Strong revenue growth indicates healthy program engagement.',
            },
            confidence: 0.95,
            createdAt: new Date(),
          });
        }
      }
    } catch (error) {
      console.error('[InsightEngine] Error generating revenue insights:', error);
    }

    return insights;
  }

  // ============================================================================
  // Points Economy Insights
  // ============================================================================

  private async generatePointsInsights(): Promise<AnalyticsInsight[]> {
    const insights: AnalyticsInsight[] = [];

    try {
      const [pointsStats, revenueStats] = await Promise.all([
        this.getPointsStats(),
        this.getRevenueStats(),
      ]);

      // High points liability check
      if (revenueStats.monthlyRevenue > 0) {
        const liabilityRatio = (pointsStats.outstanding / revenueStats.monthlyRevenue) * 100;

        if (liabilityRatio > 30) {
          insights.push({
            id: `high-liability-${Date.now()}`,
            type: 'recommendation',
            category: 'points',
            severity: 'warning',
            title: 'High Points Liability',
            description: `Outstanding points represent ${liabilityRatio.toFixed(0)}% of monthly revenue. Consider a redemption campaign.`,
            metric: 'points_liability_ratio',
            value: liabilityRatio,
            action: {
              label: 'Redemption Campaign',
              href: '/app/marketing/campaigns/create?type=redemption',
              priority: 'high',
            },
            context: {
              explanation: 'High points liability can affect cash flow and financial forecasting.',
              benchmark: 30,
              benchmarkLabel: 'Industry average',
            },
            confidence: 0.85,
            createdAt: new Date(),
          });
        }
      }

      // Low redemption rate check
      if (pointsStats.earned > 0) {
        const redemptionRate = (pointsStats.redeemed / pointsStats.earned) * 100;

        if (redemptionRate < 10) {
          insights.push({
            id: `low-redemption-${Date.now()}`,
            type: 'recommendation',
            category: 'points',
            severity: 'info',
            title: 'Low Redemption Rate',
            description: `Only ${redemptionRate.toFixed(1)}% of earned points are being redeemed. Customers may need reminders.`,
            metric: 'redemption_rate',
            value: redemptionRate,
            action: {
              label: 'Send Reminder',
              href: '/app/marketing/campaigns/create?type=reminder',
              priority: 'medium',
            },
            context: {
              explanation: 'Low redemption rates may indicate unclear redemption options or lack of awareness.',
              benchmark: 15,
              benchmarkLabel: 'Healthy rate',
            },
            confidence: 0.8,
            createdAt: new Date(),
          });
        }
      }

      // Points expiration warning
      const expiringPoints = await this.getExpiringPoints(7);
      if (expiringPoints.count > 100) {
        insights.push({
          id: `expiring-points-${Date.now()}`,
          type: 'recommendation',
          category: 'points',
          severity: 'warning',
          title: 'Points Expiring Soon',
          description: `${expiringPoints.count.toLocaleString()} points (${expiringPoints.customers} customers) expire in 7 days.`,
          metric: 'expiring_points',
          value: expiringPoints.count,
          action: {
            label: 'Send Expiry Reminder',
            href: '/app/marketing/campaigns/create?type=expiry_reminder',
            priority: 'high',
          },
          confidence: 0.95,
          createdAt: new Date(),
        });
      }
    } catch (error) {
      console.error('[InsightEngine] Error generating points insights:', error);
    }

    return insights;
  }

  // ============================================================================
  // Tier Health Insights
  // ============================================================================

  private async generateTierInsights(): Promise<AnalyticsInsight[]> {
    const insights: AnalyticsInsight[] = [];

    try {
      const tierStats = await this.getTierStats();

      // VIP churn risk
      if (tierStats.vipInactive > 0) {
        insights.push({
          id: `vip-churn-risk-${Date.now()}`,
          type: 'recommendation',
          category: 'tier',
          severity: 'critical',
          title: 'VIP Customers at Risk',
          description: `${tierStats.vipInactive} VIP customers haven't ordered in 45+ days. Re-engage before they churn.`,
          metric: 'vip_inactive',
          value: tierStats.vipInactive,
          action: {
            label: 'View Inactive VIPs',
            href: '/app/members?tier=vip&inactive=45',
            priority: 'high',
          },
          context: {
            explanation: 'VIP customers represent your highest-value segment. Losing them impacts revenue significantly.',
          },
          confidence: 0.9,
          createdAt: new Date(),
        });
      }

      // Tier stagnation
      if (tierStats.upgradeRate < 5) {
        insights.push({
          id: `tier-stagnation-${Date.now()}`,
          type: 'recommendation',
          category: 'tier',
          severity: 'info',
          title: 'Low Tier Movement',
          description: `Only ${tierStats.upgradeRate.toFixed(1)}% tier movement in the last 30 days. Consider adjusting thresholds.`,
          metric: 'tier_upgrade_rate',
          value: tierStats.upgradeRate,
          action: {
            label: 'Review Tier Settings',
            href: APP_ROUTES.MEMBERS.TIERS,
            priority: 'low',
          },
          context: {
            explanation: 'Low tier movement may indicate thresholds are too difficult to achieve.',
            benchmark: 5,
            benchmarkLabel: 'Healthy movement rate',
          },
          confidence: 0.75,
          createdAt: new Date(),
        });
      }

      // Rapid upgrades (positive)
      if (tierStats.recentUpgrades > 20) {
        insights.push({
          id: `rapid-upgrades-${Date.now()}`,
          type: 'milestone',
          category: 'tier',
          severity: 'positive',
          title: 'Strong Tier Progression',
          description: `${tierStats.recentUpgrades} customers upgraded tiers this week. Your tier program is driving engagement!`,
          metric: 'tier_upgrades_weekly',
          value: tierStats.recentUpgrades,
          confidence: 0.95,
          createdAt: new Date(),
        });
      }
    } catch (error) {
      console.error('[InsightEngine] Error generating tier insights:', error);
    }

    return insights;
  }

  // ============================================================================
  // Cashback Insights
  // ============================================================================

  private async generateCashbackInsights(): Promise<AnalyticsInsight[]> {
    const insights: AnalyticsInsight[] = [];

    try {
      const cashbackStats = await this.getCashbackStats();

      // Low utilization
      if (cashbackStats.earned > 0) {
        const utilizationRate = (cashbackStats.used / cashbackStats.earned) * 100;

        if (utilizationRate < 50) {
          insights.push({
            id: `cashback-utilization-${Date.now()}`,
            type: 'recommendation',
            category: 'cashback',
            severity: 'info',
            title: 'Unused Cashback',
            description: `Only ${utilizationRate.toFixed(0)}% of earned cashback has been used. Send reminders to customers.`,
            metric: 'cashback_utilization',
            value: utilizationRate,
            action: {
              label: 'Send Reminder',
              href: '/app/marketing/campaigns/create?type=cashback_reminder',
              priority: 'medium',
            },
            context: {
              explanation: 'Unused cashback represents unrealized customer engagement opportunity.',
              benchmark: 70,
              benchmarkLabel: 'Target utilization',
            },
            confidence: 0.8,
            createdAt: new Date(),
          });
        }
      }

      // ROI check - enhanced with target comparison
      const roiStats = await this.getROIStats();

      if (cashbackStats.influencedRevenue > 0) {
        // If target ROI is configured, compare actual vs target
        if (roiStats.targetROI !== null && roiStats.roiGap !== null) {
          if (roiStats.meetsTarget && roiStats.roiGap >= 50) {
            // Exceeding target significantly - positive insight
            insights.push({
              id: `roi-exceeding-target-${Date.now()}`,
              type: 'milestone',
              category: 'cashback',
              severity: 'positive',
              title: 'ROI Exceeds Target',
              description: `Your loyalty program ROI of ${roiStats.actualROI.toFixed(0)}% exceeds your ${roiStats.targetROI}% target by ${roiStats.roiGap.toFixed(0)} percentage points!`,
              metric: 'actual_vs_target_roi',
              value: roiStats.actualROI,
              context: {
                explanation: 'Your loyalty program is delivering strong returns. Consider reinvesting some gains into customer engagement.',
                benchmark: roiStats.targetROI,
                benchmarkLabel: 'Your target ROI',
              },
              confidence: 0.9,
              createdAt: new Date(),
            });
          } else if (!roiStats.meetsTarget && roiStats.roiGap < -25) {
            // Below target significantly - warning
            insights.push({
              id: `roi-below-target-${Date.now()}`,
              type: 'recommendation',
              category: 'cashback',
              severity: 'warning',
              title: 'ROI Below Target',
              description: `Current ROI of ${roiStats.actualROI.toFixed(0)}% is ${Math.abs(roiStats.roiGap).toFixed(0)} points below your ${roiStats.targetROI}% target.`,
              metric: 'actual_vs_target_roi',
              value: roiStats.actualROI,
              action: {
                label: 'Review Cashback Rates',
                href: '/app/members/tiers',
                priority: 'high',
              },
              context: {
                explanation: 'Consider adjusting tier cashback percentages or running targeted campaigns to improve program efficiency.',
                benchmark: roiStats.targetROI,
                benchmarkLabel: 'Your target ROI',
              },
              confidence: 0.85,
              createdAt: new Date(),
            });
          }
        } else {
          // No target configured - use benchmark-based check
          const roiRatio = (cashbackStats.spent / cashbackStats.influencedRevenue) * 100;

          if (roiRatio > 5) {
            insights.push({
              id: `cashback-roi-${Date.now()}`,
              type: 'recommendation',
              category: 'cashback',
              severity: 'warning',
              title: 'Cashback Profitability',
              description: `Cashback cost is ${roiRatio.toFixed(1)}% of influenced revenue. Review rates for profitability.`,
              metric: 'cashback_roi',
              value: roiRatio,
              action: {
                label: 'Review Cashback Rates',
                href: '/app/members/tiers',
                priority: 'medium',
              },
              context: {
                explanation: 'High cashback costs relative to revenue may impact program sustainability. Set a target ROI in Settings > Store Metrics for personalized tracking.',
                benchmark: 3,
                benchmarkLabel: 'Industry benchmark',
              },
              confidence: 0.85,
              createdAt: new Date(),
            });
          }
        }
      }
    } catch (error) {
      console.error('[InsightEngine] Error generating cashback insights:', error);
    }

    return insights;
  }

  // ============================================================================
  // Engagement Insights
  // ============================================================================

  private async generateEngagementInsights(): Promise<AnalyticsInsight[]> {
    const insights: AnalyticsInsight[] = [];

    try {
      const engagementStats = await this.getEngagementStats();

      // Low raffle participation
      if (engagementStats.activeRaffles > 0 && engagementStats.raffleParticipation < 10) {
        insights.push({
          id: `raffle-participation-${Date.now()}`,
          type: 'recommendation',
          category: 'engagement',
          severity: 'info',
          title: 'Low Raffle Participation',
          description: `Only ${engagementStats.raffleParticipation.toFixed(0)}% of eligible customers entered active raffles.`,
          metric: 'raffle_participation',
          value: engagementStats.raffleParticipation,
          action: {
            label: 'Promote Raffles',
            href: '/app/rewards/raffles',
            priority: 'low',
          },
          context: {
            explanation: 'Raffles can drive engagement when properly promoted.',
          },
          confidence: 0.75,
          createdAt: new Date(),
        });
      }

      // Milestone: New member growth
      if (engagementStats.newMembersThisWeek > 50) {
        insights.push({
          id: `member-growth-${Date.now()}`,
          type: 'milestone',
          category: 'engagement',
          severity: 'positive',
          title: 'Strong Member Growth',
          description: `${engagementStats.newMembersThisWeek} new members joined this week. Great acquisition!`,
          metric: 'new_members_weekly',
          value: engagementStats.newMembersThisWeek,
          confidence: 0.95,
          createdAt: new Date(),
        });
      }
    } catch (error) {
      console.error('[InsightEngine] Error generating engagement insights:', error);
    }

    return insights;
  }

  // ============================================================================
  // Anomaly Detection
  // ============================================================================

  async detectAnomalies(): Promise<AnomalyResult[]> {
    const anomalies: AnomalyResult[] = [];

    try {
      // Get time series data for key metrics
      const metrics = ['revenue', 'orders', 'points_earned', 'redemptions'];

      for (const metric of metrics) {
        const timeSeries = await this.getMetricTimeSeries(metric, 30);
        const detected = this.detectTimeSeriesAnomalies(timeSeries);
        anomalies.push(...detected);
      }
    } catch (error) {
      console.error('[InsightEngine] Error detecting anomalies:', error);
    }

    return anomalies;
  }

  private detectTimeSeriesAnomalies(timeSeries: MetricTimeSeries): AnomalyResult[] {
    const anomalies: AnomalyResult[] = [];
    const values = timeSeries.values.map(v => v.value);

    if (values.length < 7) return anomalies;

    // Calculate mean and standard deviation
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Check last 7 days for anomalies (values > 2 std dev from mean)
    const recentValues = timeSeries.values.slice(-7);

    for (const point of recentValues) {
      const deviation = Math.abs(point.value - mean) / (stdDev || 1);

      if (deviation > 2) {
        anomalies.push({
          metric: timeSeries.metric,
          date: point.date,
          value: point.value,
          expected: mean,
          deviation,
          severity: deviation > 3 ? 'high' : deviation > 2.5 ? 'medium' : 'low',
        });
      }
    }

    return anomalies;
  }

  private anomalyToInsight(anomaly: AnomalyResult): AnalyticsInsight {
    const direction = anomaly.value > anomaly.expected ? 'spike' : 'drop';
    const metricLabels: Record<string, string> = {
      revenue: 'Revenue',
      orders: 'Orders',
      points_earned: 'Points Earned',
      redemptions: 'Redemptions',
    };

    return {
      id: `anomaly-${anomaly.metric}-${anomaly.date.getTime()}`,
      type: 'anomaly',
      category: anomaly.metric === 'revenue' ? 'revenue' : 'engagement',
      severity: anomaly.severity === 'high' ? 'warning' : 'info',
      title: `Unusual ${metricLabels[anomaly.metric] || anomaly.metric} ${direction}`,
      description: `${metricLabels[anomaly.metric] || anomaly.metric} was ${anomaly.deviation.toFixed(1)}x standard deviation from average on ${anomaly.date.toLocaleDateString()}.`,
      metric: anomaly.metric,
      value: anomaly.value,
      context: {
        explanation: `Expected around ${anomaly.expected.toFixed(0)} based on historical patterns.`,
      },
      confidence: 0.7,
      createdAt: new Date(),
    };
  }

  // ============================================================================
  // Health Score Calculations
  // ============================================================================

  private async calculateEngagementScore(): Promise<{ score: number; factors: string[] }> {
    const factors: string[] = [];
    let score = 50; // Base score

    try {
      const stats = await this.getEngagementStats();

      // Active member ratio (+/- 20 points)
      if (stats.activeMemberRatio > 0.5) {
        score += 20;
        factors.push('High active member ratio');
      } else if (stats.activeMemberRatio < 0.2) {
        score -= 20;
        factors.push('Low active member ratio');
      }

      // Points activity (+/- 15 points)
      if (stats.pointsActivityRate > 0.3) {
        score += 15;
        factors.push('Strong points activity');
      } else if (stats.pointsActivityRate < 0.1) {
        score -= 15;
        factors.push('Low points activity');
      }

      // Redemption rate (+/- 15 points)
      if (stats.redemptionRate > 0.2) {
        score += 15;
        factors.push('Healthy redemption rate');
      } else if (stats.redemptionRate < 0.05) {
        score -= 15;
        factors.push('Low redemption rate');
      }
    } catch (error) {
      console.error('[InsightEngine] Error calculating engagement score:', error);
    }

    return { score: Math.max(0, Math.min(100, score)), factors };
  }

  private async calculateRetentionScore(): Promise<{ score: number; factors: string[] }> {
    const factors: string[] = [];
    let score = 50;

    try {
      const stats = await this.getRetentionStats();

      // VIP retention (+/- 25 points)
      if (stats.vipRetention > 0.8) {
        score += 25;
        factors.push('Excellent VIP retention');
      } else if (stats.vipRetention < 0.5) {
        score -= 25;
        factors.push('VIP churn risk');
      }

      // Overall retention (+/- 25 points)
      if (stats.overallRetention > 0.6) {
        score += 25;
        factors.push('Strong overall retention');
      } else if (stats.overallRetention < 0.3) {
        score -= 25;
        factors.push('Low retention rate');
      }
    } catch (error) {
      console.error('[InsightEngine] Error calculating retention score:', error);
    }

    return { score: Math.max(0, Math.min(100, score)), factors };
  }

  private async calculateROIScore(): Promise<{ score: number; factors: string[] }> {
    const factors: string[] = [];
    let score = 50;

    try {
      const stats = await this.getROIStats();

      // Target ROI comparison (if configured) - prioritize this over benchmark
      if (stats.targetROI !== null && stats.meetsTarget !== null) {
        if (stats.meetsTarget && stats.roiGap !== null && stats.roiGap >= 50) {
          score += 25;
          factors.push(`Exceeding target ROI by ${Math.round(stats.roiGap)}%`);
        } else if (stats.meetsTarget) {
          score += 15;
          factors.push('Meeting target ROI');
        } else if (stats.roiGap !== null && stats.roiGap > -50) {
          score -= 10;
          factors.push(`${Math.abs(Math.round(stats.roiGap))}% below target ROI`);
        } else {
          score -= 25;
          factors.push('Significantly below target ROI');
        }
      } else {
        // Fallback to benchmark-based scoring if no target configured
        if (stats.cashbackROI > 5) {
          score += 25;
          factors.push('Excellent cashback ROI (5x+)');
        } else if (stats.cashbackROI > 3) {
          score += 15;
          factors.push('Good cashback ROI (3-5x)');
        } else if (stats.cashbackROI < 1) {
          score -= 25;
          factors.push('Poor cashback ROI (<1x)');
        }
      }

      // Customer LTV growth (+/- 25 points)
      if (stats.ltvGrowth > 0.1) {
        score += 25;
        factors.push('Growing customer LTV');
      } else if (stats.ltvGrowth < 0) {
        score -= 25;
        factors.push('Declining customer LTV');
      }
    } catch (error) {
      console.error('[InsightEngine] Error calculating ROI score:', error);
    }

    return { score: Math.max(0, Math.min(100, score)), factors };
  }

  private async calculateGrowthScore(): Promise<{ score: number; factors: string[] }> {
    const factors: string[] = [];
    let score = 50;

    try {
      const stats = await this.getGrowthStats();

      // Member growth (+/- 25 points)
      if (stats.memberGrowthRate > 0.1) {
        score += 25;
        factors.push('Strong member growth');
      } else if (stats.memberGrowthRate < 0) {
        score -= 25;
        factors.push('Member base declining');
      }

      // Revenue growth (+/- 25 points)
      if (stats.revenueGrowthRate > 0.15) {
        score += 25;
        factors.push('Revenue growing');
      } else if (stats.revenueGrowthRate < 0) {
        score -= 25;
        factors.push('Revenue declining');
      }
    } catch (error) {
      console.error('[InsightEngine] Error calculating growth score:', error);
    }

    return { score: Math.max(0, Math.min(100, score)), factors };
  }

  // ============================================================================
  // Data Fetching Helpers
  // ============================================================================

  private async getRevenueForPeriod(start: Date, end: Date): Promise<number> {
    const result = await db.order.aggregate({
      where: {
        shop: this.shop,
        createdAt: { gte: start, lte: end },
      },
      _sum: { totalPrice: true },
    });
    return toNumber(result._sum.totalPrice);
  }

  private async getRevenueStats(): Promise<{ monthlyRevenue: number }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const monthlyRevenue = await this.getRevenueForPeriod(thirtyDaysAgo, new Date());
    return { monthlyRevenue };
  }

  private async getPointsStats(): Promise<{ earned: number; redeemed: number; outstanding: number }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [earned, redeemed, outstanding] = await Promise.all([
      db.pointsLedger.aggregate({
        where: {
          shop: this.shop,
          createdAt: { gte: thirtyDaysAgo },
          type: 'EARN',
        },
        _sum: { amount: true },
      }),
      db.pointsLedger.aggregate({
        where: {
          shop: this.shop,
          createdAt: { gte: thirtyDaysAgo },
          type: 'REDEEM',
        },
        _sum: { amount: true },
      }),
      db.customer.aggregate({
        where: { shop: this.shop },
        _sum: { pointsBalance: true },
      }),
    ]);

    return {
      earned: earned._sum.amount || 0,
      redeemed: Math.abs(redeemed._sum.amount || 0),
      outstanding: outstanding._sum.pointsBalance || 0,
    };
  }

  private async getExpiringPoints(days: number): Promise<{ count: number; customers: number }> {
    const expiryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const now = new Date();

    // DATA API COMPATIBLE: groupBy is not supported, use findMany and aggregate in memory
    const expiringEntries = await db.pointsLedger.findMany({
      where: {
        shop: this.shop,
        expiresAt: { gte: now, lte: expiryDate },
      },
      select: { customerId: true, amount: true },
    });

    // Aggregate by customer in memory
    const customerPoints = new Map<string, number>();
    for (const entry of expiringEntries) {
      const current = customerPoints.get(entry.customerId) || 0;
      customerPoints.set(entry.customerId, current + (entry.amount || 0));
    }

    const totalPoints = Array.from(customerPoints.values()).reduce((sum, amt) => sum + amt, 0);
    return { count: totalPoints, customers: customerPoints.size };
  }

  private async getTierStats(): Promise<{ vipInactive: number; upgradeRate: number; recentUpgrades: number }> {
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get VIP tier IDs
    const vipTiers = await db.tier.findMany({
      where: { shop: this.shop },
      orderBy: { sortOrder: 'desc' },
      take: 1,
    });

    const vipTierId = vipTiers[0]?.id;

    const [vipInactive, totalCustomers, tierChanges, recentUpgrades] = await Promise.all([
      // VIP customers without recent orders
      vipTierId ? db.customer.count({
        where: {
          shop: this.shop,
          currentTierId: vipTierId,
          lastOrderDate: { lt: fortyFiveDaysAgo },
        },
      }) : 0,
      // Total customers
      db.customer.count({ where: { shop: this.shop } }),
      // Tier changes in last 30 days
      db.tierChangeLog.count({
        where: {
          shop: this.shop,
          createdAt: { gte: thirtyDaysAgo },
          changeType: { in: ['UPGRADE', 'DOWNGRADE'] },
        },
      }),
      // Recent upgrades
      db.tierChangeLog.count({
        where: {
          shop: this.shop,
          createdAt: { gte: sevenDaysAgo },
          changeType: 'UPGRADE',
        },
      }),
    ]);

    const upgradeRate = totalCustomers > 0 ? (tierChanges / totalCustomers) * 100 : 0;

    return { vipInactive, upgradeRate, recentUpgrades };
  }

  private async getCashbackStats(): Promise<{ earned: number; used: number; spent: number; influencedRevenue: number }> {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    try {
      const [earned, used, influencedOrders] = await Promise.all([
        // Cashback earned - stored in StoreCreditLedger with type CASHBACK_EARNED
        db.storeCreditLedger.aggregate({
          where: {
            shop: this.shop,
            createdAt: { gte: sixtyDaysAgo },
            type: 'CASHBACK_EARNED',
          },
          _sum: { amount: true },
        }),
        // Credit used for orders - stored in StoreCreditLedger with type ORDER_PAYMENT (negative amounts)
        db.storeCreditLedger.aggregate({
          where: {
            shop: this.shop,
            createdAt: { gte: sixtyDaysAgo },
            type: 'ORDER_PAYMENT',
          },
          _sum: { amount: true },
        }),
        // Orders that generated cashback (influenced orders)
        db.order.aggregate({
          where: {
            shop: this.shop,
            createdAt: { gte: sixtyDaysAgo },
            cashbackProcessed: true,
            cashbackAmount: { not: null },
          },
          _sum: { totalPrice: true, cashbackAmount: true },
        }),
      ]);

      return {
        earned: toNumber(earned._sum?.amount),
        used: Math.abs(toNumber(used._sum?.amount)), // ORDER_PAYMENT amounts are negative
        spent: toNumber(influencedOrders._sum?.cashbackAmount),
        influencedRevenue: toNumber(influencedOrders._sum?.totalPrice),
      };
    } catch (error) {
      console.error('[InsightEngine] Error in getCashbackStats:', error);
      return { earned: 0, used: 0, spent: 0, influencedRevenue: 0 };
    }
  }

  private async getEngagementStats(): Promise<{
    activeRaffles: number;
    raffleParticipation: number;
    newMembersThisWeek: number;
    activeMemberRatio: number;
    pointsActivityRate: number;
    redemptionRate: number;
  }> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // DATA API COMPATIBLE: groupBy is not supported, use findMany and count distinct in memory
    const [activeRaffles, totalCustomers, activeCustomers, newMembers, pointsActivityEntries] = await Promise.all([
      db.raffle.count({
        where: { shop: this.shop, status: 'active' },
      }),
      db.customer.count({ where: { shop: this.shop } }),
      db.customer.count({
        where: { shop: this.shop, lastOrderDate: { gte: thirtyDaysAgo } },
      }),
      db.customer.count({
        where: { shop: this.shop, createdAt: { gte: sevenDaysAgo } },
      }),
      db.pointsLedger.findMany({
        where: { shop: this.shop, createdAt: { gte: thirtyDaysAgo } },
        select: { customerId: true },
      }),
    ]);

    // Count unique customers with points activity in memory
    const uniqueCustomersWithActivity = new Set(pointsActivityEntries.map(e => e.customerId));

    // Raffle participation calculation would need entry data
    const raffleParticipation = 0; // Placeholder

    return {
      activeRaffles,
      raffleParticipation,
      newMembersThisWeek: newMembers,
      activeMemberRatio: totalCustomers > 0 ? activeCustomers / totalCustomers : 0,
      pointsActivityRate: totalCustomers > 0 ? uniqueCustomersWithActivity.size / totalCustomers : 0,
      redemptionRate: 0.15, // Default, would calculate from actual data
    };
  }

  private async getRetentionStats(): Promise<{ vipRetention: number; overallRetention: number }> {
    // Simplified retention calculation
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalPrevious, returnedCustomers] = await Promise.all([
      db.customer.count({
        where: {
          shop: this.shop,
          createdAt: { lt: thirtyDaysAgo },
        },
      }),
      db.customer.count({
        where: {
          shop: this.shop,
          createdAt: { lt: thirtyDaysAgo },
          lastOrderDate: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    const overallRetention = totalPrevious > 0 ? returnedCustomers / totalPrevious : 0;

    return {
      vipRetention: 0.75, // Would calculate from VIP-specific data
      overallRetention,
    };
  }

  private async getROIStats(): Promise<{
    cashbackROI: number;
    ltvGrowth: number;
    targetROI: number | null;
    actualROI: number;
    roiGap: number | null;
    meetsTarget: boolean | null;
  }> {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    try {
      // Fetch shop settings for target ROI and cashback stats in parallel
      const [shopSettings, cashbackStats, currentLTV, previousLTV] = await Promise.all([
        db.shopSettings.findUnique({
          where: { shop: this.shop },
          select: { targetRoiPercent: true, averageProfitMargin: true },
        }),
        this.getCashbackStats(),
        // Current period average LTV
        db.customer.aggregate({
          where: {
            shop: this.shop,
            createdAt: { gte: sixtyDaysAgo },
            totalSpent: { gt: 0 },
          },
          _avg: { totalSpent: true },
        }),
        // Previous period average LTV
        db.customer.aggregate({
          where: {
            shop: this.shop,
            createdAt: { gte: ninetyDaysAgo, lt: sixtyDaysAgo },
            totalSpent: { gt: 0 },
          },
          _avg: { totalSpent: true },
        }),
      ]);

      const targetROI = shopSettings?.targetRoiPercent
        ? Number(shopSettings.targetRoiPercent)
        : null;

      // Calculate actual ROI: (revenue - cashback cost) / cashback cost * 100
      // ROI formula: ((Return - Investment) / Investment) * 100
      // Here: Investment = cashback spent, Return = influenced revenue
      let actualROI = 0;
      if (cashbackStats.spent > 0) {
        actualROI = ((cashbackStats.influencedRevenue - cashbackStats.spent) / cashbackStats.spent) * 100;
      }

      // For backward compatibility, also express as multiplier (cashbackROI)
      // cashbackROI = influencedRevenue / spent (e.g., 3.5x means $3.50 revenue per $1 spent)
      const cashbackROI = cashbackStats.spent > 0
        ? cashbackStats.influencedRevenue / cashbackStats.spent
        : 0;

      // Calculate LTV growth
      const currentLTVValue = toNumber(currentLTV._avg?.totalSpent);
      const previousLTVValue = toNumber(previousLTV._avg?.totalSpent);
      const ltvGrowth = previousLTVValue > 0
        ? (currentLTVValue - previousLTVValue) / previousLTVValue
        : 0;

      // Calculate ROI gap (how far from target)
      const roiGap = targetROI !== null ? actualROI - targetROI : null;
      const meetsTarget = targetROI !== null ? actualROI >= targetROI : null;

      return {
        cashbackROI,
        ltvGrowth,
        targetROI,
        actualROI,
        roiGap,
        meetsTarget,
      };
    } catch (error) {
      console.error('[InsightEngine] Error calculating ROI stats:', error);
      return {
        cashbackROI: 0,
        ltvGrowth: 0,
        targetROI: null,
        actualROI: 0,
        roiGap: null,
        meetsTarget: null,
      };
    }
  }

  private async getGrowthStats(): Promise<{ memberGrowthRate: number; revenueGrowthRate: number }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const [currentMembers, previousMembers, currentRevenue, previousRevenue] = await Promise.all([
      db.customer.count({
        where: { shop: this.shop, createdAt: { gte: thirtyDaysAgo } },
      }),
      db.customer.count({
        where: { shop: this.shop, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      }),
      this.getRevenueForPeriod(thirtyDaysAgo, new Date()),
      this.getRevenueForPeriod(sixtyDaysAgo, thirtyDaysAgo),
    ]);

    return {
      memberGrowthRate: previousMembers > 0 ? (currentMembers - previousMembers) / previousMembers : 0,
      revenueGrowthRate: previousRevenue > 0 ? (currentRevenue - previousRevenue) / previousRevenue : 0,
    };
  }

  private async getMetricTimeSeries(metric: string, days: number): Promise<MetricTimeSeries> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const values: { date: Date; value: number }[] = [];

    // Generate daily data points
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);

      let value = 0;

      switch (metric) {
        case 'revenue':
          value = await this.getRevenueForPeriod(date, nextDate);
          break;
        case 'orders':
          value = await db.order.count({
            where: { shop: this.shop, createdAt: { gte: date, lt: nextDate } },
          });
          break;
        case 'points_earned':
          const points = await db.pointsLedger.aggregate({
            where: { shop: this.shop, createdAt: { gte: date, lt: nextDate }, type: 'EARN' },
            _sum: { amount: true },
          });
          value = points._sum.amount || 0;
          break;
        case 'redemptions':
          value = await db.pointsLedger.count({
            where: { shop: this.shop, createdAt: { gte: date, lt: nextDate }, type: 'REDEEM' },
          });
          break;
      }

      values.push({ date, value });
    }

    return { metric, values };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private prioritizeInsights(insights: AnalyticsInsight[]): AnalyticsInsight[] {
    const severityOrder = { critical: 0, warning: 1, positive: 2, info: 3 };

    return insights.sort((a, b) => {
      // First by severity
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;

      // Then by confidence
      return (b.confidence || 0) - (a.confidence || 0);
    });
  }
}

// ============================================================================
// Factory & Exports
// ============================================================================

export function createInsightEngine(shop: string): InsightEngine {
  return new InsightEngine(shop);
}

export default InsightEngine;
