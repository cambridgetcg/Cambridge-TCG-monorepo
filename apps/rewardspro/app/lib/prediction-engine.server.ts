/**
 * Prediction Engine - Path Foundation for Predictive Analytics
 *
 * PURPOSE:
 * Infrastructure for churn prediction, LTV forecasting, and next-best-action.
 * This pattern enables:
 * - Customer churn risk scoring
 * - Lifetime value predictions
 * - Proactive retention interventions
 * - Behavior-based segmentation
 *
 * USAGE:
 * ```typescript
 * // Get churn risk for a customer
 * const risk = await predictionEngine.getChurnRisk(shop, customerId);
 *
 * // Get at-risk customers
 * const atRisk = await predictionEngine.getAtRiskCustomers(shop, { threshold: 0.7 });
 *
 * // Trigger intervention for high-risk customer
 * await predictionEngine.triggerIntervention(shop, customerId, 'retention_email');
 * ```
 *
 * ARCHITECTURE:
 * ```
 * Customer Data → Feature Extraction → Scoring Model → Risk Assessment
 *                                            ↓
 *                                    Intervention Engine
 * ```
 */

import { db } from "~/db.server";

// ============================================================================
// Types - Risk Assessment
// ============================================================================

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ChurnRiskScore {
  customerId: string;
  score: number; // 0-1, higher = more likely to churn
  level: RiskLevel;
  factors: ChurnFactor[];
  predictedChurnDate?: Date;
  confidence: number;
  calculatedAt: Date;
}

export interface ChurnFactor {
  name: string;
  impact: number; // -1 to 1, negative = reduces risk
  description: string;
  value: any;
}

export interface CustomerFeatures {
  // Recency features
  daysSinceLastOrder: number;
  daysSinceLastActivity: number;

  // Frequency features
  orderCount: number;
  ordersLast30Days: number;
  ordersLast90Days: number;
  averageOrderGap: number;

  // Monetary features
  totalSpent: number;
  averageOrderValue: number;
  lifetimeValue: number;

  // Engagement features
  pointsBalance: number;
  pointsEarnedLast30Days: number;
  pointsRedeemedLast30Days: number;
  challengesCompleted: number;
  rafflesEntered: number;

  // Tier features
  currentTier: string | null;
  tierDuration: number; // days
  tierUpgrades: number;
  tierDowngrades: number;

  // Behavioral features
  emailOpens: number;
  emailClicks: number;
  lastEmailEngagement?: Date;
}

// ============================================================================
// Types - Interventions
// ============================================================================

export type InterventionType =
  | 'retention_email'
  | 'bonus_points'
  | 'exclusive_offer'
  | 'personal_outreach'
  | 'win_back_campaign'
  | 'tier_upgrade_prompt'
  | 'challenge_invite';

export interface Intervention {
  type: InterventionType;
  customerId: string;
  triggeredAt: Date;
  reason: string;
  metadata?: Record<string, any>;
  outcome?: 'pending' | 'success' | 'failed' | 'no_response';
  outcomeAt?: Date;
}

export interface InterventionRecommendation {
  type: InterventionType;
  priority: number;
  reason: string;
  expectedImpact: number; // estimated risk reduction
}

// ============================================================================
// Types - Predictions
// ============================================================================

export interface LTVPrediction {
  customerId: string;
  currentLTV: number;
  predictedLTV: number;
  timeHorizon: number; // months
  confidence: number;
  growthFactors: string[];
  riskFactors: string[];
}

export interface NextBestAction {
  customerId: string;
  action: string;
  channel: 'email' | 'sms' | 'push' | 'in_app';
  priority: number;
  reason: string;
  expectedOutcome: string;
}

// ============================================================================
// Feature Extraction
// ============================================================================

async function extractCustomerFeatures(
  shop: string,
  customerId: string
): Promise<CustomerFeatures> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Get customer data
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: { tier: true },
  });

  if (!customer) {
    throw new Error(`Customer not found: ${customerId}`);
  }

  // Get order data
  const orders = await db.order.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
  });

  const ordersLast30Days = orders.filter(o => o.createdAt >= thirtyDaysAgo).length;
  const ordersLast90Days = orders.filter(o => o.createdAt >= ninetyDaysAgo).length;

  // Calculate average order gap
  let averageOrderGap = 0;
  if (orders.length > 1) {
    const gaps: number[] = [];
    for (let i = 1; i < orders.length; i++) {
      const gap = orders[i - 1].createdAt.getTime() - orders[i].createdAt.getTime();
      gaps.push(gap / (1000 * 60 * 60 * 24)); // Convert to days
    }
    averageOrderGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  }

  // Get points activity
  const pointsEarned = await db.pointsLedger.aggregate({
    where: {
      customerId,
      type: 'EARN',
      createdAt: { gte: thirtyDaysAgo },
    },
    _sum: { amount: true },
  });

  const pointsRedeemed = await db.pointsLedger.aggregate({
    where: {
      customerId,
      type: 'REDEEM',
      createdAt: { gte: thirtyDaysAgo },
    },
    _sum: { amount: true },
  });

  // Get engagement counts
  const challengesCompleted = await db.challengeParticipant.count({
    where: { customerId, status: 'CLAIMED' },
  });

  const rafflesEntered = await db.raffleEntry.count({
    where: { customerId },
  });

  // Get tier history for upgrades/downgrades
  const tierChanges = await db.tierChangeLog.findMany({
    where: { customerId },
    orderBy: { createdAt: 'asc' },
  });

  let tierUpgrades = 0;
  let tierDowngrades = 0;
  // Simple heuristic - would need tier rank comparison for accuracy
  tierChanges.forEach((change, i) => {
    if (i > 0 && change.changeReason === 'SPENDING_THRESHOLD') {
      tierUpgrades++;
    }
  });

  // Calculate days since last order
  const lastOrder = orders[0];
  const daysSinceLastOrder = lastOrder
    ? Math.floor((now.getTime() - lastOrder.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : 365; // Default to 1 year if no orders

  // Calculate average order value
  const totalSpent = Number(customer.totalSpent) || 0;
  const averageOrderValue = orders.length > 0 ? totalSpent / orders.length : 0;

  return {
    daysSinceLastOrder,
    daysSinceLastActivity: daysSinceLastOrder, // Simplified - could track other activities
    orderCount: customer.orderCount || 0,
    ordersLast30Days,
    ordersLast90Days,
    averageOrderGap,
    totalSpent,
    averageOrderValue,
    lifetimeValue: totalSpent, // Simplified - could factor in margins
    pointsBalance: customer.pointsBalance || 0,
    pointsEarnedLast30Days: pointsEarned._sum.amount || 0,
    pointsRedeemedLast30Days: Math.abs(pointsRedeemed._sum.amount || 0),
    challengesCompleted,
    rafflesEntered,
    currentTier: customer.tier?.name || null,
    tierDuration: customer.tierAssignedAt
      ? Math.floor((now.getTime() - customer.tierAssignedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0,
    tierUpgrades,
    tierDowngrades,
    emailOpens: 0, // Would need email tracking integration
    emailClicks: 0,
  };
}

// ============================================================================
// Churn Scoring Model
// ============================================================================

function calculateChurnScore(features: CustomerFeatures): { score: number; factors: ChurnFactor[] } {
  const factors: ChurnFactor[] = [];
  let score = 0.5; // Start at neutral

  // Recency factors (most important)
  if (features.daysSinceLastOrder > 90) {
    const impact = Math.min(0.3, (features.daysSinceLastOrder - 90) / 180 * 0.3);
    score += impact;
    factors.push({
      name: 'inactivity',
      impact,
      description: `No orders in ${features.daysSinceLastOrder} days`,
      value: features.daysSinceLastOrder,
    });
  } else if (features.daysSinceLastOrder < 30) {
    const impact = -0.15;
    score += impact;
    factors.push({
      name: 'recent_activity',
      impact,
      description: 'Recent order activity',
      value: features.daysSinceLastOrder,
    });
  }

  // Frequency factors
  if (features.ordersLast90Days === 0 && features.orderCount > 0) {
    score += 0.2;
    factors.push({
      name: 'declining_frequency',
      impact: 0.2,
      description: 'No orders in last 90 days (was active before)',
      value: features.ordersLast90Days,
    });
  }

  // Order frequency trend
  if (features.ordersLast30Days > 0) {
    score -= 0.1;
    factors.push({
      name: 'active_buyer',
      impact: -0.1,
      description: 'Recent purchase activity',
      value: features.ordersLast30Days,
    });
  }

  // Engagement factors
  if (features.pointsBalance > 1000 && features.pointsRedeemedLast30Days === 0) {
    score += 0.1;
    factors.push({
      name: 'unused_points',
      impact: 0.1,
      description: 'High points balance with no recent redemption',
      value: features.pointsBalance,
    });
  }

  if (features.challengesCompleted > 0 || features.rafflesEntered > 0) {
    score -= 0.1;
    factors.push({
      name: 'engaged_member',
      impact: -0.1,
      description: 'Active in challenges/raffles',
      value: features.challengesCompleted + features.rafflesEntered,
    });
  }

  // Tier factors
  if (features.tierDowngrades > 0) {
    score += 0.15;
    factors.push({
      name: 'tier_downgrade',
      impact: 0.15,
      description: 'Has experienced tier downgrade',
      value: features.tierDowngrades,
    });
  }

  // Value factors
  if (features.averageOrderValue > 100) {
    score -= 0.05;
    factors.push({
      name: 'high_value',
      impact: -0.05,
      description: 'High average order value',
      value: features.averageOrderValue,
    });
  }

  // Clamp score between 0 and 1
  score = Math.max(0, Math.min(1, score));

  return { score, factors };
}

function getRiskLevel(score: number): RiskLevel {
  if (score >= 0.8) return 'critical';
  if (score >= 0.6) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

// ============================================================================
// Prediction Engine Class
// ============================================================================

class PredictionEngine {
  /**
   * Get churn risk score for a customer
   */
  async getChurnRisk(shop: string, customerId: string): Promise<ChurnRiskScore> {
    const features = await extractCustomerFeatures(shop, customerId);
    const { score, factors } = calculateChurnScore(features);

    return {
      customerId,
      score,
      level: getRiskLevel(score),
      factors,
      confidence: 0.7, // Placeholder - would be model confidence
      calculatedAt: new Date(),
    };
  }

  /**
   * Get all at-risk customers for a shop
   */
  async getAtRiskCustomers(
    shop: string,
    options: { threshold?: number; limit?: number } = {}
  ): Promise<ChurnRiskScore[]> {
    const { threshold = 0.6, limit = 100 } = options;

    // Get active customers
    const customers = await db.customer.findMany({
      where: {
        shop,
        orderCount: { gt: 0 }, // Only customers who have ordered
      },
      select: { id: true },
      take: limit * 2, // Get more to filter by threshold
    });

    const riskScores: ChurnRiskScore[] = [];

    for (const customer of customers) {
      try {
        const risk = await this.getChurnRisk(shop, customer.id);
        if (risk.score >= threshold) {
          riskScores.push(risk);
        }
      } catch (error) {
        console.error(`[PredictionEngine] Error scoring customer ${customer.id}:`, error);
      }
    }

    // Sort by risk score descending
    riskScores.sort((a, b) => b.score - a.score);

    return riskScores.slice(0, limit);
  }

  /**
   * Get intervention recommendations for a customer
   */
  async getInterventionRecommendations(
    shop: string,
    customerId: string
  ): Promise<InterventionRecommendation[]> {
    const risk = await this.getChurnRisk(shop, customerId);
    const features = await extractCustomerFeatures(shop, customerId);
    const recommendations: InterventionRecommendation[] = [];

    // High points balance - encourage redemption
    if (features.pointsBalance > 500) {
      recommendations.push({
        type: 'bonus_points',
        priority: 3,
        reason: `Customer has ${features.pointsBalance} unused points`,
        expectedImpact: 0.1,
      });
    }

    // Inactive but previously engaged
    if (risk.level === 'high' && features.orderCount > 3) {
      recommendations.push({
        type: 'win_back_campaign',
        priority: 1,
        reason: 'Previously active customer showing disengagement',
        expectedImpact: 0.25,
      });
    }

    // Never participated in challenges
    if (features.challengesCompleted === 0 && features.orderCount > 1) {
      recommendations.push({
        type: 'challenge_invite',
        priority: 2,
        reason: 'Customer has not engaged with challenges',
        expectedImpact: 0.15,
      });
    }

    // Medium risk - general retention email
    if (risk.level === 'medium' || risk.level === 'high') {
      recommendations.push({
        type: 'retention_email',
        priority: 2,
        reason: `Customer at ${risk.level} churn risk`,
        expectedImpact: 0.1,
      });
    }

    // Critical risk - personal outreach
    if (risk.level === 'critical' && features.lifetimeValue > 500) {
      recommendations.push({
        type: 'personal_outreach',
        priority: 1,
        reason: 'High-value customer at critical churn risk',
        expectedImpact: 0.3,
      });
    }

    // Sort by priority
    recommendations.sort((a, b) => a.priority - b.priority);

    return recommendations;
  }

  /**
   * Trigger an intervention for a customer
   */
  async triggerIntervention(
    shop: string,
    customerId: string,
    type: InterventionType,
    metadata?: Record<string, any>
  ): Promise<Intervention> {
    const intervention: Intervention = {
      type,
      customerId,
      triggeredAt: new Date(),
      reason: `Manual trigger for ${type}`,
      metadata,
      outcome: 'pending',
    };

    // TODO: Implement actual intervention logic
    // - retention_email: Send via email service
    // - bonus_points: Award via points ledger
    // - exclusive_offer: Generate discount code
    // - etc.

    console.log(`[PredictionEngine] Triggered ${type} intervention for ${customerId}`);

    // Would save to InterventionLog table
    return intervention;
  }

  /**
   * Predict customer lifetime value
   */
  async predictLTV(
    shop: string,
    customerId: string,
    months: number = 12
  ): Promise<LTVPrediction> {
    const features = await extractCustomerFeatures(shop, customerId);

    // Simple LTV prediction based on historical patterns
    const monthsActive = Math.max(1, features.daysSinceLastOrder / 30);
    const monthlyValue = features.totalSpent / monthsActive;

    // Adjust based on engagement
    let growthMultiplier = 1;
    const growthFactors: string[] = [];
    const riskFactors: string[] = [];

    if (features.pointsBalance > 0) {
      growthMultiplier += 0.1;
      growthFactors.push('Active in points program');
    }

    if (features.challengesCompleted > 0) {
      growthMultiplier += 0.1;
      growthFactors.push('Completes challenges');
    }

    if (features.tierUpgrades > 0) {
      growthMultiplier += 0.15;
      growthFactors.push('Has upgraded tier');
    }

    if (features.daysSinceLastOrder > 60) {
      growthMultiplier -= 0.2;
      riskFactors.push('Declining purchase frequency');
    }

    if (features.tierDowngrades > 0) {
      growthMultiplier -= 0.15;
      riskFactors.push('Has downgraded tier');
    }

    const predictedLTV = monthlyValue * months * growthMultiplier;

    return {
      customerId,
      currentLTV: features.totalSpent,
      predictedLTV: Math.max(features.totalSpent, predictedLTV),
      timeHorizon: months,
      confidence: 0.6, // Placeholder
      growthFactors,
      riskFactors,
    };
  }

  /**
   * Get next best action for a customer
   */
  async getNextBestAction(shop: string, customerId: string): Promise<NextBestAction | null> {
    const recommendations = await this.getInterventionRecommendations(shop, customerId);

    if (recommendations.length === 0) {
      return null;
    }

    const top = recommendations[0];

    return {
      customerId,
      action: top.type,
      channel: top.type === 'personal_outreach' ? 'email' : 'in_app',
      priority: top.priority,
      reason: top.reason,
      expectedOutcome: `Expected ${Math.round(top.expectedImpact * 100)}% reduction in churn risk`,
    };
  }

  /**
   * Get churn risk summary for dashboard
   */
  async getChurnRiskSummary(shop: string): Promise<{
    totalCustomers: number;
    atRiskCount: number;
    criticalCount: number;
    averageRisk: number;
    topRiskCustomers: ChurnRiskScore[];
  }> {
    const totalCustomers = await db.customer.count({
      where: { shop, orderCount: { gt: 0 } },
    });

    const atRisk = await this.getAtRiskCustomers(shop, { threshold: 0.6, limit: 50 });
    const critical = atRisk.filter(r => r.level === 'critical');

    const averageRisk = atRisk.length > 0
      ? atRisk.reduce((sum, r) => sum + r.score, 0) / atRisk.length
      : 0;

    return {
      totalCustomers,
      atRiskCount: atRisk.length,
      criticalCount: critical.length,
      averageRisk,
      topRiskCustomers: atRisk.slice(0, 10),
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const predictionEngine = new PredictionEngine();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Schedule churn risk calculation for all customers (cron job)
 */
export async function calculateAllChurnRisks(shop: string): Promise<{
  processed: number;
  errors: number;
}> {
  let processed = 0;
  let errors = 0;

  const customers = await db.customer.findMany({
    where: { shop, orderCount: { gt: 0 } },
    select: { id: true },
  });

  for (const customer of customers) {
    try {
      await predictionEngine.getChurnRisk(shop, customer.id);
      processed++;
    } catch {
      errors++;
    }
  }

  return { processed, errors };
}
