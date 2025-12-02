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

    // 2. Tier Upgrade Opportunities - Get tiers and find customers near boundaries
    const tiers = await db.tier.findMany({
      where: { shop: this.shop },
      orderBy: { minSpend: 'asc' }
    });

    // Get customers with significant spending
    const customersWithSpending = await db.customer.findMany({
      where: {
        shop: this.shop,
        totalSpent: { gte: 0 }
      },
      select: {
        id: true,
        currentTierId: true,
        totalSpent: true
      }
    });

    // Find customers within 20% of next tier threshold
    const nearTierBoundary = customersWithSpending.filter(customer => {
      const currentTier = tiers.find(t => t.id === customer.currentTierId);
      if (!currentTier) return false;

      const nextTier = tiers.find(t => t.minSpend > currentTier.minSpend);
      if (!nextTier) return false;

      const customerSpent = Number(customer.totalSpent || 0);
      const gap = nextTier.minSpend - customerSpent;
      const gapPercentage = nextTier.minSpend > 0 ? gap / nextTier.minSpend : 0;

      return gapPercentage <= 0.2 && gapPercentage > 0;
    });

    if (nearTierBoundary.length > 5) {
      // Calculate total gap for all candidates
      const totalGap = nearTierBoundary.reduce((sum, customer) => {
        const currentTier = tiers.find(t => t.id === customer.currentTierId);
        if (!currentTier) return sum;
        const nextTier = tiers.find(t => t.minSpend > currentTier.minSpend);
        if (!nextTier) return sum;
        return sum + (nextTier.minSpend - Number(customer.totalSpent || 0));
      }, 0);

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
        predictedRevenue: totalGap * 0.3, // 30% conversion estimate
        affectedCount: nearTierBoundary.length,
        priority: 9
      });
    }

    // 3. Expiring Rewards - Find ledger entries with expiring credits
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const expiringRewards = await db.storeCreditLedger.findMany({
      where: {
        shop: this.shop,
        expiresAt: {
          gte: new Date(),
          lte: sevenDaysFromNow
        },
        amount: { gt: 0 } // Only credit entries
      },
      include: {
        customer: {
          select: {
            id: true,
            email: true,
            storeCredit: true
          }
        }
      }
    });

    // Filter to customers with positive balances
    const customersWithExpiringRewards = expiringRewards.filter(r => Number(r.customer.storeCredit || 0) > 0);

    if (customersWithExpiringRewards.length > 0) {
      const uniqueCustomers = [...new Set(customersWithExpiringRewards.map(r => r.customer.id))];
      const totalExpiringValue = customersWithExpiringRewards.reduce((sum, r) => sum + Number(r.customer.storeCredit || 0), 0);

      insights.push({
        type: 'expiring_rewards',
        title: 'Expiring Rewards Alert',
        description: `${uniqueCustomers.length} customers have rewards expiring soon`,
        segmentPayload: {
          criteria: [{
            field: 'hasExpiringRewards',
            operator: 'equals' as const,
            value: true
          }],
          customerIds: uniqueCustomers,
          estimatedSize: uniqueCustomers.length
        },
        metadata: {
          suggestedContent: {
            subject: "Don't lose your {{credit_amount}} in rewards!",
            previewText: "Your rewards expire in {{days_left}} days",
            bodyHtml: "<p>You have {{credit_amount}} in rewards expiring soon. Use them before {{expiry_date}}!</p>"
          }
        },
        predictedRevenue: totalExpiringValue * 1.5, // Assume 1.5x spend when using credits
        affectedCount: uniqueCustomers.length,
        priority: 10 // Highest priority - time sensitive
      });
    }

    // 4. VIP at Risk - Find high-tier customers with no recent orders
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // Get top 2 tiers (highest minSpend values) - skip if no tiers
    const topTiers = tiers.length > 0 ? tiers.slice(-2).map(t => t.id) : [];

    // Only query if we have tiers to search for
    const vipAtRisk = topTiers.length > 0 ? await db.customer.findMany({
      where: {
        shop: this.shop,
        currentTierId: { in: topTiers },
        lastOrderDate: {
          lt: sixtyDaysAgo
        }
      },
      select: {
        id: true,
        totalSpent: true,
        currentTierId: true
      }
    }) : [];

    if (vipAtRisk.length > 0) {
      const avgVipSpent = vipAtRisk.reduce((sum, c) => sum + Number(c.totalSpent || 0), 0) / vipAtRisk.length;
      insights.push({
        type: 'vip_at_risk',
        title: 'VIP Retention Campaign',
        description: `${vipAtRisk.length} VIP customers showing declining engagement`,
        segmentPayload: {
          criteria: [
            {
              field: 'currentTierId',
              operator: 'contains' as const,
              value: topTiers
            },
            {
              field: 'lastOrderDate',
              operator: 'lessThan' as const,
              value: sixtyDaysAgo
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