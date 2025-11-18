import db from "~/db.server";
import { v4 as uuidv4 } from "uuid";

export interface RecommendationSegmentPayload {
  criteria: {
    field: string;
    operator: 'equals' | 'greaterThan' | 'lessThan' | 'contains' | 'between';
    value: any;
  }[];
  customerIds?: string[];
  estimatedSize?: number;
}

export interface RecommendationMetadata {
  suggestedContent?: {
    subject?: string;
    previewText?: string;
    bodyHtml?: string;
  };
  suggestedTiming?: {
    sendTime?: string;
    dayOfWeek?: string;
  };
  suggestedIncentive?: {
    type: 'percentage' | 'fixed' | 'points';
    value: number;
  };
}

export class AnalyticsRecommendationsService {
  private readonly shop: string;

  constructor(shop: string) {
    this.shop = shop;
  }

  /**
   * Generate and persist analytics recommendations
   */
  async generateRecommendations() {
    const recommendations = [];

    // Analyze customer data and generate recommendations
    const insights = await this.analyzeCustomerBehavior();

    // Convert insights to recommendations and persist
    for (const insight of insights) {
      const recommendation = await this.createRecommendation(insight);
      if (recommendation) {
        recommendations.push(recommendation);
      }
    }

    return recommendations;
  }

  /**
   * Get all active recommendations for both analytics and marketing pages
   */
  async getActionRecommendations(options?: {
    status?: string;
    type?: string;
    limit?: number;
  }) {
    const where: any = {
      shop: this.shop,
      expiresAt: { gte: new Date() }
    };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.type) {
      where.type = options.type;
    }

    return await db.analyticsRecommendation.findMany({
      where,
      orderBy: { priority: 'desc' }, // Aurora Data API doesn't support array orderBy
      take: options?.limit || 10
    });
  }

  /**
   * Get a specific recommendation by ID
   */
  async getRecommendationById(recommendationId: string) {
    return await db.analyticsRecommendation.findFirst({
      where: {
        id: recommendationId,
        shop: this.shop
      }
    });
  }

  /**
   * Mark a recommendation as applied when converted to campaign
   */
  async applyRecommendation(recommendationId: string) {
    return await db.analyticsRecommendation.update({
      where: { id: recommendationId },
      data: {
        status: 'applied',
        appliedAt: new Date()
      }
    });
  }

  /**
   * Dismiss a recommendation
   */
  async dismissRecommendation(recommendationId: string) {
    return await db.analyticsRecommendation.update({
      where: { id: recommendationId },
      data: {
        status: 'dismissed',
        dismissedAt: new Date()
      }
    });
  }

  /**
   * Analyze customer behavior and generate insights
   */
  private async analyzeCustomerBehavior() {
    const insights = [];

    // 1. Inactive Customers (30+ days no activity)
    const inactiveCustomers = await db.customer.findMany({
      where: {
        shop: this.shop,
        lastOrderDate: {
          lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      },
      select: {
        id: true,
        totalSpent: true
      }
    });

    if (inactiveCustomers.length > 10) {
      const avgSpent = inactiveCustomers.reduce((sum, c) => sum + c.totalSpent, 0) / inactiveCustomers.length;
      insights.push({
        type: 'inactive_customers',
        title: 'Re-engage Inactive Customers',
        description: `${inactiveCustomers.length} customers haven't purchased in 30+ days`,
        segmentPayload: {
          criteria: [{
            field: 'lastOrderDate',
            operator: 'lessThan' as const,
            value: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }],
          customerIds: inactiveCustomers.map(c => c.id),
          estimatedSize: inactiveCustomers.length
        },
        metadata: {
          suggestedContent: {
            subject: "We miss you! Here's 15% off your next order",
            previewText: "It's been a while since your last visit...",
            bodyHtml: "<p>We've noticed you haven't shopped with us recently. Here's an exclusive 15% discount to welcome you back!</p>"
          },
          suggestedIncentive: {
            type: 'percentage' as const,
            value: 15
          }
        },
        predictedRevenue: avgSpent * inactiveCustomers.length * 0.15, // 15% conversion estimate
        affectedCount: inactiveCustomers.length,
        priority: 8
      });
    }

    // 2. Tier Upgrade Opportunities
    const nearTierBoundary = await db.customer.findMany({
      where: {
        shop: this.shop,
        OR: [
          {
            currentTier: 'BRONZE',
            totalSpent: { gte: 400 } // Close to Silver ($500)
          },
          {
            currentTier: 'SILVER',
            totalSpent: { gte: 900 } // Close to Gold ($1000)
          }
        ]
      },
      select: {
        id: true,
        currentTier: true,
        totalSpent: true
      }
    });

    if (nearTierBoundary.length > 5) {
      insights.push({
        type: 'tier_upgrade_opportunity',
        title: 'Tier Upgrade Campaign',
        description: `${nearTierBoundary.length} customers are close to tier upgrades`,
        segmentPayload: {
          criteria: [{
            field: 'nearTierBoundary',
            operator: 'equals' as const,
            value: true
          }],
          customerIds: nearTierBoundary.map(c => c.id),
          estimatedSize: nearTierBoundary.length
        },
        metadata: {
          suggestedContent: {
            subject: "You're so close to {{next_tier}} status!",
            previewText: "Just a little more to unlock exclusive benefits",
            bodyHtml: "<p>You're only {{amount_needed}} away from {{next_tier}} tier! Make a purchase today and enjoy enhanced rewards.</p>"
          }
        },
        predictedRevenue: nearTierBoundary.reduce((sum, c) => {
          const needed = c.currentTier === 'BRONZE' ? 500 - c.totalSpent : 1000 - c.totalSpent;
          return sum + needed;
        }, 0) * 0.3, // 30% conversion estimate
        affectedCount: nearTierBoundary.length,
        priority: 9
      });
    }

    // 3. Expiring Rewards
    const expiringRewards = await db.storeCredit.findMany({
      where: {
        shop: this.shop,
        expiresAt: {
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Next 7 days
        },
        balance: { gt: 0 }
      },
      include: {
        customer: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });

    if (expiringRewards.length > 0) {
      const totalExpiringValue = expiringRewards.reduce((sum, r) => sum + r.balance, 0);
      insights.push({
        type: 'expiring_rewards',
        title: 'Expiring Rewards Alert',
        description: `${expiringRewards.length} customers have rewards expiring soon`,
        segmentPayload: {
          criteria: [{
            field: 'hasExpiringRewards',
            operator: 'equals' as const,
            value: true
          }],
          customerIds: [...new Set(expiringRewards.map(r => r.customer.id))],
          estimatedSize: expiringRewards.length
        },
        metadata: {
          suggestedContent: {
            subject: "Don't lose your {{credit_amount}} in rewards!",
            previewText: "Your rewards expire in {{days_left}} days",
            bodyHtml: "<p>You have {{credit_amount}} in rewards expiring soon. Use them before {{expiry_date}}!</p>"
          }
        },
        predictedRevenue: totalExpiringValue * 1.5, // Assume 1.5x spend when using credits
        affectedCount: expiringRewards.length,
        priority: 10 // Highest priority - time sensitive
      });
    }

    // 4. VIP at Risk
    const vipAtRisk = await db.customer.findMany({
      where: {
        shop: this.shop,
        currentTier: { in: ['GOLD', 'PLATINUM'] },
        lastOrderDate: {
          lt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) // 60 days
        }
      },
      select: {
        id: true,
        totalSpent: true,
        currentTier: true
      }
    });

    if (vipAtRisk.length > 0) {
      const avgVipSpent = vipAtRisk.reduce((sum, c) => sum + c.totalSpent, 0) / vipAtRisk.length;
      insights.push({
        type: 'vip_at_risk',
        title: 'VIP Retention Campaign',
        description: `${vipAtRisk.length} VIP customers showing declining engagement`,
        segmentPayload: {
          criteria: [
            {
              field: 'currentTier',
              operator: 'contains' as const,
              value: ['GOLD', 'PLATINUM']
            },
            {
              field: 'lastOrderDate',
              operator: 'lessThan' as const,
              value: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
            }
          ],
          customerIds: vipAtRisk.map(c => c.id),
          estimatedSize: vipAtRisk.length
        },
        metadata: {
          suggestedContent: {
            subject: "A special thank you for being our VIP",
            previewText: "Exclusive offer just for you",
            bodyHtml: "<p>As one of our most valued customers, we want to show our appreciation with an exclusive 25% discount on your next purchase.</p>"
          },
          suggestedIncentive: {
            type: 'percentage' as const,
            value: 25
          }
        },
        predictedRevenue: avgVipSpent * vipAtRisk.length * 0.25, // 25% re-engagement rate
        affectedCount: vipAtRisk.length,
        priority: 9
      });
    }

    return insights;
  }

  /**
   * Create and persist a recommendation
   */
  private async createRecommendation(insight: any) {
    const slug = `${insight.type}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    try {
      // Check if similar recommendation already exists
      const existing = await db.analyticsRecommendation.findFirst({
        where: {
          shop: this.shop,
          type: insight.type,
          status: 'pending',
          expiresAt: { gte: new Date() }
        }
      });

      if (existing) {
        // Update existing recommendation with latest data
        return await db.analyticsRecommendation.update({
          where: { id: existing.id },
          data: {
            title: insight.title,
            description: insight.description,
            segmentPayload: insight.segmentPayload,
            metadata: insight.metadata,
            predictedRevenue: insight.predictedRevenue,
            affectedCount: insight.affectedCount,
            priority: insight.priority,
            updatedAt: new Date()
          }
        });
      }

      // Create new recommendation
      return await db.analyticsRecommendation.create({
        data: {
          id: uuidv4(),
          shop: this.shop,
          slug,
          type: insight.type,
          title: insight.title,
          description: insight.description,
          segmentPayload: insight.segmentPayload,
          metadata: insight.metadata,
          predictedRevenue: insight.predictedRevenue,
          affectedCount: insight.affectedCount,
          priority: insight.priority,
          status: 'pending',
          expiresAt
        }
      });
    } catch (error) {
      console.error('[Recommendations] Error creating recommendation:', error);
      return null;
    }
  }

  /**
   * Transform a recommendation into a draft campaign
   */
  async transformToCampaign(recommendationId: string) {
    const recommendation = await this.getRecommendationById(recommendationId);

    if (!recommendation) {
      throw new Error('Recommendation not found');
    }

    if (recommendation.status === 'applied') {
      throw new Error('Recommendation already applied');
    }

    const metadata = recommendation.metadata as RecommendationMetadata;
    const segmentPayload = recommendation.segmentPayload as RecommendationSegmentPayload;

    // Create draft campaign based on recommendation
    const campaign = {
      name: `${recommendation.title} - ${new Date().toLocaleDateString()}`,
      type: recommendation.type,
      status: 'draft',
      subject: metadata?.suggestedContent?.subject || recommendation.title,
      previewText: metadata?.suggestedContent?.previewText || '',
      bodyHtml: metadata?.suggestedContent?.bodyHtml || '',
      segmentCriteria: segmentPayload.criteria,
      targetCustomerIds: segmentPayload.customerIds,
      estimatedRevenue: recommendation.predictedRevenue,
      recommendationId: recommendation.id,
      metadata: {
        source: 'analytics_recommendation',
        recommendationType: recommendation.type,
        affectedCount: recommendation.affectedCount
      }
    };

    // Mark recommendation as applied
    await this.applyRecommendation(recommendationId);

    return campaign;
  }
}