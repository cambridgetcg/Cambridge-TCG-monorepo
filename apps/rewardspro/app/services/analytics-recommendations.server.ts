import db from "~/db.server";
import { v4 as uuidv4 } from "uuid";

// Industry benchmark conversion rates (used as fallback when no historical data)
const BENCHMARK_RATES = {
  inactive_customers: 0.15,
  tier_upgrade_opportunity: 0.30,
  expiring_rewards: 0.50,
  vip_at_risk: 0.25,
  birthday_upcoming: 0.35,
  low_balance_reengagement: 0.20,
} as const;

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
   * Calculate historical conversion rate from past campaigns
   */
  private async getHistoricalConversionRate(
    campaignType: keyof typeof BENCHMARK_RATES
  ): Promise<{ rate: number; isHistorical: boolean; sampleSize: number }> {
    try {
      const campaigns = await db.emailCampaign.findMany({
        where: {
          shop: this.shop,
          status: 'sent',
          metrics: { not: null },
        },
        select: { metrics: true },
        take: 50,
      });

      if (campaigns.length < 3) {
        return { rate: BENCHMARK_RATES[campaignType], isHistorical: false, sampleSize: 0 };
      }

      let totalSent = 0;
      let totalConverted = 0;

      for (const campaign of campaigns) {
        const metrics = campaign.metrics as { sent?: number; clicked?: number; orders?: number } | null;
        if (metrics?.sent && metrics.sent > 0) {
          totalSent += metrics.sent;
          totalConverted += metrics.orders || Math.round((metrics.clicked || 0) * 0.1);
        }
      }

      if (totalSent < 100) {
        return { rate: BENCHMARK_RATES[campaignType], isHistorical: false, sampleSize: totalSent };
      }

      const historicalRate = Math.max(0.05, Math.min(0.70, totalConverted / totalSent));
      return { rate: historicalRate, isHistorical: true, sampleSize: totalSent };
    } catch {
      return { rate: BENCHMARK_RATES[campaignType], isHistorical: false, sampleSize: 0 };
    }
  }

  /**
   * Get average order value for revenue calculations
   */
  private async getAverageOrderValue(): Promise<number> {
    try {
      const customers = await db.customer.findMany({
        where: {
          shop: this.shop,
          orderCount: { gt: 0 },
          totalSpent: { gt: 0 },
        },
        select: { totalSpent: true, orderCount: true },
        take: 1000,
      });

      if (customers.length === 0) return 50;

      const totalSpent = customers.reduce((sum, c) => sum + Number(c.totalSpent || 0), 0);
      const totalOrders = customers.reduce((sum, c) => sum + (c.orderCount || 0), 0);

      return totalOrders > 0 ? totalSpent / totalOrders : 50;
    } catch {
      return 50;
    }
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

    // Pre-fetch conversion rates and average order value for all recommendation types
    const [
      inactiveRate,
      tierUpgradeRate,
      expiringRate,
      vipRate,
      birthdayRate,
      lowBalanceRate,
      avgOrderValue
    ] = await Promise.all([
      this.getHistoricalConversionRate('inactive_customers'),
      this.getHistoricalConversionRate('tier_upgrade_opportunity'),
      this.getHistoricalConversionRate('expiring_rewards'),
      this.getHistoricalConversionRate('vip_at_risk'),
      this.getHistoricalConversionRate('birthday_upcoming'),
      this.getHistoricalConversionRate('low_balance_reengagement'),
      this.getAverageOrderValue(),
    ]);

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
      const avgSpent = inactiveCustomers.reduce((sum, c) => sum + Number(c.totalSpent || 0), 0) / inactiveCustomers.length;
      const predictedRevenue = inactiveCustomers.length * inactiveRate.rate * avgOrderValue;

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
          },
          conversionRateSource: inactiveRate.isHistorical ? 'historical' : 'benchmark',
          avgOrderValue: Math.round(avgOrderValue),
        },
        predictedRevenue,
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

      const predictedRevenue = totalGap * tierUpgradeRate.rate;

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
          },
          conversionRateSource: tierUpgradeRate.isHistorical ? 'historical' : 'benchmark',
          totalGapValue: Math.round(totalGap),
        },
        predictedRevenue,
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

      // Revenue = redeemed credits + additional spend (customers typically spend more than credit value)
      const avgBalance = totalExpiringValue / uniqueCustomers.length;
      const multiplier = avgOrderValue > avgBalance ? 1.5 : 1.2;
      const predictedRevenue = totalExpiringValue * expiringRate.rate * multiplier;

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
          },
          conversionRateSource: expiringRate.isHistorical ? 'historical' : 'benchmark',
          totalRewardsAtRisk: Math.round(totalExpiringValue),
          avgRewardBalance: Math.round(avgBalance),
        },
        predictedRevenue,
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
      const totalLTV = vipAtRisk.reduce((sum, c) => sum + Number(c.totalSpent || 0), 0);
      const avgLTV = totalLTV / vipAtRisk.length;
      // Estimate annual value assuming 2.5 year customer lifespan
      const estimatedAnnualValue = avgLTV / 2.5;
      const totalAnnualValueAtRisk = estimatedAnnualValue * vipAtRisk.length;
      const predictedRevenue = totalAnnualValueAtRisk * vipRate.rate;

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
          },
          conversionRateSource: vipRate.isHistorical ? 'historical' : 'benchmark',
          annualValueAtRisk: Math.round(totalAnnualValueAtRisk),
          avgCustomerLTV: Math.round(avgLTV),
        },
        predictedRevenue,
        affectedCount: vipAtRisk.length,
        priority: 9
      });
    }

    // 5. Birthday Upcoming - Find customers with birthdays in next 30 days
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const customersWithBirthday = await db.customer.findMany({
      where: {
        shop: this.shop,
        birthday: { not: null },
      },
      select: {
        id: true,
        birthday: true,
        totalSpent: true,
      }
    });

    if (customersWithBirthday.length > 0) {
      const currentYear = now.getFullYear();
      const upcomingBirthdays = customersWithBirthday.filter(customer => {
        if (!customer.birthday) return false;

        const birthday = new Date(customer.birthday);
        const birthdayMonth = birthday.getMonth();
        const birthdayDay = birthday.getDate();

        let thisYearBirthday = new Date(currentYear, birthdayMonth, birthdayDay);
        if (thisYearBirthday < now) {
          thisYearBirthday = new Date(currentYear + 1, birthdayMonth, birthdayDay);
        }

        return thisYearBirthday >= now && thisYearBirthday <= thirtyDaysFromNow;
      });

      if (upcomingBirthdays.length > 0) {
        const avgCustomerSpent = upcomingBirthdays.reduce((sum, c) => sum + Number(c.totalSpent || 0), 0) / upcomingBirthdays.length;
        const predictedRevenue = upcomingBirthdays.length * birthdayRate.rate * avgOrderValue;

        insights.push({
          type: 'birthday_upcoming',
          title: 'Birthday Campaign',
          description: `${upcomingBirthdays.length} customers have birthdays in the next 30 days`,
          segmentPayload: {
            criteria: [{
              field: 'birthdayInDays',
              operator: 'lessThan' as const,
              value: 30
            }],
            customerIds: upcomingBirthdays.map(c => c.id),
            estimatedSize: upcomingBirthdays.length
          },
          metadata: {
            suggestedContent: {
              subject: "Happy Birthday! Here's a special gift for you",
              previewText: "Celebrate with an exclusive birthday reward",
              bodyHtml: "<p>Wishing you a wonderful birthday! As our gift to you, enjoy a special birthday discount on your next purchase.</p>"
            },
            suggestedIncentive: {
              type: 'percentage' as const,
              value: 20
            },
            conversionRateSource: birthdayRate.isHistorical ? 'historical' : 'benchmark',
            totalCustomersWithBirthday: customersWithBirthday.length,
            avgCustomerLTV: Math.round(avgCustomerSpent),
          },
          predictedRevenue,
          affectedCount: upcomingBirthdays.length,
          priority: 7
        });
      }
    }

    // 6. Low Balance Reengagement - Customers with small unused balances
    const lowBalanceCustomers = await db.customer.findMany({
      where: {
        shop: this.shop,
        storeCredit: {
          gt: 0,
          lt: 50
        }
      },
      select: {
        id: true,
        storeCredit: true,
      }
    });

    if (lowBalanceCustomers.length > 0) {
      const totalDormant = lowBalanceCustomers.reduce((sum, c) => sum + Number(c.storeCredit || 0), 0);
      const avgBalance = totalDormant / lowBalanceCustomers.length;
      const predictedRevenue = lowBalanceCustomers.length * lowBalanceRate.rate * (avgBalance + avgOrderValue);

      insights.push({
        type: 'low_balance_reengagement',
        title: 'Low Balance Activation',
        description: `${lowBalanceCustomers.length} customers have small unused reward balances`,
        segmentPayload: {
          criteria: [{
            field: 'storeCredit',
            operator: 'between' as const,
            value: [1, 50]
          }],
          customerIds: lowBalanceCustomers.map(c => c.id),
          estimatedSize: lowBalanceCustomers.length
        },
        metadata: {
          suggestedContent: {
            subject: "Don't forget about your {{credit_amount}} reward!",
            previewText: "Put your rewards to good use",
            bodyHtml: "<p>You have {{credit_amount}} in rewards waiting for you. Shop now and put them to good use!</p>"
          },
          conversionRateSource: lowBalanceRate.isHistorical ? 'historical' : 'benchmark',
          dormantRewards: Math.round(totalDormant),
          avgBalance: Math.round(avgBalance),
          avgOrderValue: Math.round(avgOrderValue),
        },
        predictedRevenue,
        affectedCount: lowBalanceCustomers.length,
        priority: 6
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