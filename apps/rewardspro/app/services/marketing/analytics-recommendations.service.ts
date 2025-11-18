import db from "~/db.server";

export interface MarketingRecommendation {
  id: string;
  type: 'inactive_reengagement' | 'tier_upgrade' | 'reward_expiry' | 'vip_retention' | 'birthday' | 'low_balance';
  priority: 'high' | 'medium' | 'low';
  category: 'engagement' | 'growth' | 'retention' | 'revenue';
  title: string;
  description: string;
  affectedCustomers: number;
  potentialRevenue: number;
  expectedResponseRate: number;
  segmentRules: any;
  customerIds?: string[];
  metadata?: any;
}

export class AnalyticsRecommendationsService {
  /**
   * Get all marketing recommendations for a shop
   */
  static async getRecommendations(shop: string): Promise<MarketingRecommendation[]> {
    console.log('[Analytics Recommendations] Getting recommendations for shop:', shop);
    const recommendations: MarketingRecommendation[] = [];

    try {
      // Run all recommendations in parallel with individual error handling
      const results = await Promise.allSettled([
        this.getInactiveReengagementRecommendation(shop),
        this.getTierUpgradeRecommendation(shop),
        this.getRewardExpiryRecommendation(shop),
        this.getVIPRetentionRecommendation(shop),
        this.getBirthdayRecommendation(shop),
        this.getLowBalanceRecommendation(shop)
      ]);

      const labels = ['Inactive', 'TierUpgrade', 'ExpiringRewards', 'VIPRetention', 'Birthday', 'LowBalance'];

      // Process results
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          recommendations.push(result.value);
          console.log(`[Analytics Recommendations] ✓ ${labels[index]} recommendation added`);
        } else if (result.status === 'rejected') {
          console.error(`[Analytics Recommendations] ⚠️ ${labels[index]} failed:`, result.reason?.message);
        }
      });

      console.log('[Analytics Recommendations] Total recommendations:', recommendations.length);
      return recommendations;
    } catch (error: any) {
      console.error('[Analytics Recommendations] ❌ Fatal error getting recommendations:', error.message);
      console.error('[Analytics Recommendations] Stack:', error.stack);
      return [];
    }
  }

  /**
   * Get inactive customers who need re-engagement
   */
  private static async getInactiveReengagementRecommendation(shop: string): Promise<MarketingRecommendation | null> {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const inactiveCustomers = await db.customer.findMany({
      where: {
        shop,
        lastOrderDate: {
          lt: sixtyDaysAgo
        },
        totalLifetimeValue: {
          gt: 100 // Has made purchases before
        }
      },
      select: {
        id: true,
        shopifyCustomerId: true,
        totalLifetimeValue: true,
      }
    });

    if (inactiveCustomers.length === 0) return null;

    // Calculate potential revenue (assume 23% response rate, avg $50 order)
    const potentialRevenue = inactiveCustomers.length * 0.23 * 50;

    return {
      id: 'inactive_reengagement',
      type: 'inactive_reengagement',
      priority: 'high',
      category: 'engagement',
      title: 'Re-engage Inactive Customers',
      description: 'Target customers who haven\'t made a purchase in 60+ days with personalized incentives',
      affectedCustomers: inactiveCustomers.length,
      potentialRevenue: Math.round(potentialRevenue),
      expectedResponseRate: 23,
      segmentRules: {
        daysSinceLastOrder: { operator: 'greater_than', value: 60 },
        lifetimeValue: { operator: 'greater_than', value: 100 }
      },
      customerIds: inactiveCustomers.map(c => c.shopifyCustomerId).filter(Boolean) as string[],
      metadata: {
        averageLifetimeValue: inactiveCustomers.reduce((sum, c) => sum + (c.totalLifetimeValue || 0), 0) / inactiveCustomers.length
      }
    };
  }

  /**
   * Get customers close to tier upgrade
   */
  private static async getTierUpgradeRecommendation(shop: string): Promise<MarketingRecommendation | null> {
    // Get all tiers sorted by threshold
    const tiers = await db.tier.findMany({
      where: { shop },
      orderBy: { thresholdAmount: 'asc' }
    });

    if (tiers.length < 2) return null;

    const customers = await db.customer.findMany({
      where: {
        shop,
        totalLifetimeValue: { gt: 0 }
      },
      select: {
        id: true,
        shopifyCustomerId: true,
        totalLifetimeValue: true,
        currentTierId: true,
      }
    });

    // Find customers within 20% of next tier
    const upgradeCandidates = customers.filter(customer => {
      const currentTier = tiers.find(t => t.id === customer.currentTierId);
      if (!currentTier) return false;

      const nextTier = tiers.find(t => t.thresholdAmount > currentTier.thresholdAmount);
      if (!nextTier) return false;

      const gap = nextTier.thresholdAmount - (customer.totalLifetimeValue || 0);
      const gapPercentage = gap / nextTier.thresholdAmount;

      return gapPercentage <= 0.2 && gapPercentage > 0;
    });

    if (upgradeCandidates.length === 0) return null;

    // Calculate average gap
    const totalGap = upgradeCandidates.reduce((sum, customer) => {
      const currentTier = tiers.find(t => t.id === customer.currentTierId);
      if (!currentTier) return sum;
      const nextTier = tiers.find(t => t.thresholdAmount > currentTier.thresholdAmount);
      if (!nextTier) return sum;
      return sum + (nextTier.thresholdAmount - (customer.totalLifetimeValue || 0));
    }, 0);

    const avgGap = totalGap / upgradeCandidates.length;

    return {
      id: 'tier_upgrade',
      type: 'tier_upgrade',
      priority: 'medium',
      category: 'growth',
      title: 'Tier Upgrade Promotion',
      description: 'Encourage customers within 20% of the next tier with targeted incentives',
      affectedCustomers: upgradeCandidates.length,
      potentialRevenue: Math.round(totalGap * 0.41), // 41% conversion
      expectedResponseRate: 41,
      segmentRules: {
        gapToNextTier: { operator: 'percentage', value: 20 }
      },
      customerIds: upgradeCandidates.map(c => c.shopifyCustomerId).filter(Boolean) as string[],
      metadata: {
        averageGap: Math.round(avgGap)
      }
    };
  }

  /**
   * Get customers with expiring rewards
   */
  private static async getRewardExpiryRecommendation(shop: string): Promise<MarketingRecommendation | null> {
    const fourteenDaysFromNow = new Date();
    fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);

    const expiringRewards = await db.storeCreditLedger.findMany({
      where: {
        shop,
        expiresAt: {
          lte: fourteenDaysFromNow,
          gt: new Date()
        },
        remainingBalance: {
          gt: 0
        }
      },
      include: {
        customer: {
          select: {
            shopifyCustomerId: true
          }
        }
      }
    });

    if (expiringRewards.length === 0) return null;

    const totalAtRisk = expiringRewards.reduce((sum, r) => sum + (r.remainingBalance || 0), 0);
    const uniqueCustomers = new Set(expiringRewards.map(r => r.shopifyCustomerId));

    return {
      id: 'reward_expiry',
      type: 'reward_expiry',
      priority: 'high',
      category: 'retention',
      title: 'Reward Expiry Reminders',
      description: 'Notify customers with rewards expiring within 14 days to drive immediate action',
      affectedCustomers: uniqueCustomers.size,
      potentialRevenue: Math.round(totalAtRisk * 0.6), // 60% usage rate
      expectedResponseRate: 60,
      segmentRules: {
        rewardExpiryDays: { operator: 'less_than', value: 14 },
        hasUnusedRewards: true
      },
      customerIds: Array.from(uniqueCustomers).filter(Boolean) as string[],
      metadata: {
        totalRewardsAtRisk: totalAtRisk
      }
    };
  }

  /**
   * Get high-value customers who need retention
   */
  private static async getVIPRetentionRecommendation(shop: string): Promise<MarketingRecommendation | null> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get top tier
    const topTier = await db.tier.findFirst({
      where: { shop },
      orderBy: { thresholdAmount: 'desc' }
    });

    if (!topTier) return null;

    const vipCustomers = await db.customer.findMany({
      where: {
        shop,
        currentTierId: topTier.id,
        lastOrderDate: {
          lt: thirtyDaysAgo
        },
        totalLifetimeValue: {
          gt: 1000
        }
      },
      select: {
        id: true,
        shopifyCustomerId: true,
        totalLifetimeValue: true,
      }
    });

    if (vipCustomers.length === 0) return null;

    // Calculate annual value at risk
    const avgMonthlyValue = vipCustomers.reduce((sum, c) => sum + (c.totalLifetimeValue || 0), 0) / vipCustomers.length / 12;
    const annualValueAtRisk = avgMonthlyValue * 12 * vipCustomers.length;

    return {
      id: 'vip_retention',
      type: 'vip_retention',
      priority: 'high',
      category: 'revenue',
      title: 'VIP Customer Retention',
      description: 'Re-engage high-value customers who haven\'t purchased in 30+ days',
      affectedCustomers: vipCustomers.length,
      potentialRevenue: Math.round(annualValueAtRisk * 0.67), // 67% recovery rate
      expectedResponseRate: 67,
      segmentRules: {
        tierLevel: 'highest',
        daysSinceLastOrder: { operator: 'greater_than', value: 30 },
        lifetimeValue: { operator: 'greater_than', value: 1000 }
      },
      customerIds: vipCustomers.map(c => c.shopifyCustomerId).filter(Boolean) as string[],
      metadata: {
        annualValueAtRisk: Math.round(annualValueAtRisk)
      }
    };
  }

  /**
   * Get upcoming birthdays
   */
  private static async getBirthdayRecommendation(shop: string): Promise<MarketingRecommendation | null> {
    // Note: This assumes you have birthday data in customer metafields
    // For now, return a mock recommendation
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // This would need to query customer metafields for birthday data
    // For now, return null or mock data
    return {
      id: 'birthday',
      type: 'birthday',
      priority: 'medium',
      category: 'engagement',
      title: 'Birthday & Anniversary Campaign',
      description: 'Send special offers to customers celebrating birthdays in the next 30 days',
      affectedCustomers: 56, // Mock number
      potentialRevenue: 2240,
      expectedResponseRate: 40,
      segmentRules: {
        birthdayInDays: { operator: 'less_than', value: 30 }
      },
      metadata: {
        upcomingCount: 56
      }
    };
  }

  /**
   * Get customers with low unused balance
   */
  private static async getLowBalanceRecommendation(shop: string): Promise<MarketingRecommendation | null> {
    const customers = await db.customer.findMany({
      where: {
        shop,
        unusedStoreCreditBalance: {
          gt: 0,
          lt: 50 // Low balance threshold
        }
      },
      select: {
        id: true,
        shopifyCustomerId: true,
        unusedStoreCreditBalance: true,
      }
    });

    if (customers.length === 0) return null;

    const totalDormant = customers.reduce((sum, c) => sum + (c.unusedStoreCreditBalance || 0), 0);

    return {
      id: 'low_balance',
      type: 'low_balance',
      priority: 'medium',
      category: 'retention',
      title: 'Low Balance Activation',
      description: 'Remind customers with small reward balances to use them before expiry',
      affectedCustomers: customers.length,
      potentialRevenue: Math.round(totalDormant * 0.31 * 3), // 31% activation, avg $3x order
      expectedResponseRate: 31,
      segmentRules: {
        rewardBalance: { operator: 'between', value: [1, 50] }
      },
      customerIds: customers.map(c => c.shopifyCustomerId).filter(Boolean) as string[],
      metadata: {
        dormantRewards: totalDormant
      }
    };
  }
}
