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

// Industry benchmark conversion rates (used as fallback)
const BENCHMARK_RATES = {
  inactive_reengagement: 0.15,
  tier_upgrade: 0.30,
  reward_expiry: 0.50,
  vip_retention: 0.25,
  birthday: 0.35,
  low_balance: 0.20,
} as const;

export class AnalyticsRecommendationsService {
  /**
   * Calculate historical conversion rate from past campaigns
   */
  private static async getHistoricalConversionRate(
    shop: string,
    campaignType: keyof typeof BENCHMARK_RATES
  ): Promise<{ rate: number; isHistorical: boolean; sampleSize: number }> {
    try {
      // Get completed campaigns with metrics
      const campaigns = await db.emailCampaign.findMany({
        where: {
          shop,
          status: 'sent',
          metrics: { not: null },
        },
        select: {
          metrics: true,
        },
        take: 50, // Last 50 campaigns
      });

      if (campaigns.length < 3) {
        // Not enough data, use benchmark
        return { rate: BENCHMARK_RATES[campaignType], isHistorical: false, sampleSize: 0 };
      }

      // Calculate weighted average conversion rate
      let totalSent = 0;
      let totalConverted = 0;

      for (const campaign of campaigns) {
        const metrics = campaign.metrics as { sent?: number; clicked?: number; orders?: number } | null;
        if (metrics?.sent && metrics.sent > 0) {
          totalSent += metrics.sent;
          // Use orders if available, otherwise use clicks as proxy
          totalConverted += metrics.orders || Math.round((metrics.clicked || 0) * 0.1);
        }
      }

      if (totalSent < 100) {
        // Not enough volume, use benchmark
        return { rate: BENCHMARK_RATES[campaignType], isHistorical: false, sampleSize: totalSent };
      }

      const historicalRate = totalConverted / totalSent;
      // Clamp between reasonable bounds and apply campaign-type adjustment
      const adjustedRate = Math.max(0.05, Math.min(0.70, historicalRate));

      return { rate: adjustedRate, isHistorical: true, sampleSize: totalSent };
    } catch {
      return { rate: BENCHMARK_RATES[campaignType], isHistorical: false, sampleSize: 0 };
    }
  }

  /**
   * Get average order value for revenue calculations
   */
  private static async getAverageOrderValue(shop: string): Promise<number> {
    try {
      const customers = await db.customer.findMany({
        where: {
          shop,
          orderCount: { gt: 0 },
          totalSpent: { gt: 0 },
        },
        select: {
          totalSpent: true,
          orderCount: true,
        },
        take: 1000,
      });

      if (customers.length === 0) return 50; // Fallback

      const totalSpent = customers.reduce((sum, c) => sum + Number(c.totalSpent || 0), 0);
      const totalOrders = customers.reduce((sum, c) => sum + (c.orderCount || 0), 0);

      return totalOrders > 0 ? totalSpent / totalOrders : 50;
    } catch {
      return 50; // Fallback
    }
  }

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
        totalSpent: {
          gt: 100 // Has made purchases before
        }
      },
      select: {
        id: true,
        shopifyCustomerId: true,
        totalSpent: true,
      }
    });

    if (inactiveCustomers.length === 0) return null;

    // Get historical conversion rate and average order value
    const [conversionData, avgOrderValue] = await Promise.all([
      this.getHistoricalConversionRate(shop, 'inactive_reengagement'),
      this.getAverageOrderValue(shop),
    ]);

    const avgLifetimeValue = inactiveCustomers.reduce((sum, c) => sum + Number(c.totalSpent || 0), 0) / inactiveCustomers.length;
    const potentialRevenue = inactiveCustomers.length * conversionData.rate * avgOrderValue;

    return {
      id: 'inactive_reengagement',
      type: 'inactive_reengagement',
      priority: 'high',
      category: 'engagement',
      title: 'Re-engage Inactive Customers',
      description: 'Target customers who haven\'t made a purchase in 60+ days with personalized incentives',
      affectedCustomers: inactiveCustomers.length,
      potentialRevenue: Math.round(potentialRevenue),
      expectedResponseRate: Math.round(conversionData.rate * 100),
      segmentRules: {
        daysSinceLastOrder: { operator: 'greater_than', value: 60 },
        lifetimeValue: { operator: 'greater_than', value: 100 }
      },
      customerIds: inactiveCustomers.map(c => c.shopifyCustomerId).filter(Boolean) as string[],
      metadata: {
        averageLifetimeValue: Math.round(avgLifetimeValue),
        avgOrderValue: Math.round(avgOrderValue),
        conversionRateSource: conversionData.isHistorical ? 'historical' : 'benchmark',
        historicalSampleSize: conversionData.sampleSize,
      }
    };
  }

  /**
   * Get customers close to tier upgrade
   */
  private static async getTierUpgradeRecommendation(shop: string): Promise<MarketingRecommendation | null> {
    // Get all tiers sorted by minSpend threshold
    const tiers = await db.tier.findMany({
      where: { shop },
      orderBy: { minSpend: 'asc' }
    });

    if (tiers.length < 2) return null;

    const customers = await db.customer.findMany({
      where: {
        shop,
        totalSpent: { gt: 0 }
      },
      select: {
        id: true,
        shopifyCustomerId: true,
        totalSpent: true,
        currentTierId: true,
      }
    });

    // Find customers within 20% of next tier
    const upgradeCandidates = customers.filter(customer => {
      const currentTier = tiers.find(t => t.id === customer.currentTierId);
      if (!currentTier) return false;

      const nextTier = tiers.find(t => t.minSpend > currentTier.minSpend);
      if (!nextTier) return false;

      const customerSpent = Number(customer.totalSpent || 0);
      const gap = nextTier.minSpend - customerSpent;
      const gapPercentage = gap / nextTier.minSpend;

      return gapPercentage <= 0.2 && gapPercentage > 0;
    });

    if (upgradeCandidates.length === 0) return null;

    // Calculate average gap
    const totalGap = upgradeCandidates.reduce((sum, customer) => {
      const currentTier = tiers.find(t => t.id === customer.currentTierId);
      if (!currentTier) return sum;
      const nextTier = tiers.find(t => t.minSpend > currentTier.minSpend);
      if (!nextTier) return sum;
      return sum + (nextTier.minSpend - Number(customer.totalSpent || 0));
    }, 0);

    const avgGap = totalGap / upgradeCandidates.length;

    // Get historical conversion rate
    const conversionData = await this.getHistoricalConversionRate(shop, 'tier_upgrade');
    const potentialRevenue = totalGap * conversionData.rate;

    return {
      id: 'tier_upgrade',
      type: 'tier_upgrade',
      priority: 'medium',
      category: 'growth',
      title: 'Tier Upgrade Promotion',
      description: 'Encourage customers within 20% of the next tier with targeted incentives',
      affectedCustomers: upgradeCandidates.length,
      potentialRevenue: Math.round(potentialRevenue),
      expectedResponseRate: Math.round(conversionData.rate * 100),
      segmentRules: {
        gapToNextTier: { operator: 'percentage', value: 20 }
      },
      customerIds: upgradeCandidates.map(c => c.shopifyCustomerId).filter(Boolean) as string[],
      metadata: {
        averageGap: Math.round(avgGap),
        totalGapValue: Math.round(totalGap),
        conversionRateSource: conversionData.isHistorical ? 'historical' : 'benchmark',
      }
    };
  }

  /**
   * Get customers with expiring rewards
   */
  private static async getRewardExpiryRecommendation(shop: string): Promise<MarketingRecommendation | null> {
    const fourteenDaysFromNow = new Date();
    fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);

    // Find customers with store credit that has expiring ledger entries
    const expiringRewards = await db.storeCreditLedger.findMany({
      where: {
        shop,
        expiresAt: {
          lte: fourteenDaysFromNow,
          gt: new Date()
        },
        amount: {
          gt: 0 // Only credit entries (positive amounts)
        }
      },
      include: {
        customer: {
          select: {
            id: true,
            shopifyCustomerId: true,
            storeCredit: true
          }
        }
      }
    });

    if (expiringRewards.length === 0) return null;

    // Filter to only include customers with positive store credit balance
    const customersWithBalance = expiringRewards.filter(r => Number(r.customer.storeCredit || 0) > 0);
    if (customersWithBalance.length === 0) return null;

    const totalAtRisk = customersWithBalance.reduce((sum, r) => sum + Number(r.customer.storeCredit || 0), 0);
    const uniqueCustomers = new Set(customersWithBalance.map(r => r.customer.shopifyCustomerId));

    // Get historical conversion rate and average order value
    const [conversionData, avgOrderValue] = await Promise.all([
      this.getHistoricalConversionRate(shop, 'reward_expiry'),
      this.getAverageOrderValue(shop),
    ]);

    // Revenue = redeemed credits + additional spend (customers typically spend more than credit value)
    const multiplier = avgOrderValue > totalAtRisk / uniqueCustomers.size ? 1.5 : 1.2;
    const potentialRevenue = totalAtRisk * conversionData.rate * multiplier;

    return {
      id: 'reward_expiry',
      type: 'reward_expiry',
      priority: 'high',
      category: 'retention',
      title: 'Reward Expiry Reminders',
      description: 'Notify customers with rewards expiring within 14 days to drive immediate action',
      affectedCustomers: uniqueCustomers.size,
      potentialRevenue: Math.round(potentialRevenue),
      expectedResponseRate: Math.round(conversionData.rate * 100),
      segmentRules: {
        rewardExpiryDays: { operator: 'less_than', value: 14 },
        hasUnusedRewards: true
      },
      customerIds: Array.from(uniqueCustomers).filter(Boolean) as string[],
      metadata: {
        totalRewardsAtRisk: Math.round(totalAtRisk),
        avgRewardBalance: Math.round(totalAtRisk / uniqueCustomers.size),
        conversionRateSource: conversionData.isHistorical ? 'historical' : 'benchmark',
      }
    };
  }

  /**
   * Get high-value customers who need retention
   */
  private static async getVIPRetentionRecommendation(shop: string): Promise<MarketingRecommendation | null> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get top tier by minSpend
    const topTier = await db.tier.findFirst({
      where: { shop },
      orderBy: { minSpend: 'desc' }
    });

    if (!topTier) return null;

    const vipCustomers = await db.customer.findMany({
      where: {
        shop,
        currentTierId: topTier.id,
        lastOrderDate: {
          lt: thirtyDaysAgo
        },
        totalSpent: {
          gt: 1000
        }
      },
      select: {
        id: true,
        shopifyCustomerId: true,
        totalSpent: true,
      }
    });

    if (vipCustomers.length === 0) return null;

    // Get historical conversion rate
    const conversionData = await this.getHistoricalConversionRate(shop, 'vip_retention');

    // Calculate value at risk based on actual spending patterns
    const totalLTV = vipCustomers.reduce((sum, c) => sum + Number(c.totalSpent || 0), 0);
    const avgLTV = totalLTV / vipCustomers.length;

    // Estimate annual value: if customer spent avgLTV over their lifetime,
    // estimate annual value as a portion (assume 2-3 year customer lifespan)
    const estimatedAnnualValue = avgLTV / 2.5;
    const totalAnnualValueAtRisk = estimatedAnnualValue * vipCustomers.length;
    const potentialRevenue = totalAnnualValueAtRisk * conversionData.rate;

    return {
      id: 'vip_retention',
      type: 'vip_retention',
      priority: 'high',
      category: 'revenue',
      title: 'VIP Customer Retention',
      description: 'Re-engage high-value customers who haven\'t purchased in 30+ days',
      affectedCustomers: vipCustomers.length,
      potentialRevenue: Math.round(potentialRevenue),
      expectedResponseRate: Math.round(conversionData.rate * 100),
      segmentRules: {
        tierLevel: 'highest',
        daysSinceLastOrder: { operator: 'greater_than', value: 30 },
        lifetimeValue: { operator: 'greater_than', value: 1000 }
      },
      customerIds: vipCustomers.map(c => c.shopifyCustomerId).filter(Boolean) as string[],
      metadata: {
        annualValueAtRisk: Math.round(totalAnnualValueAtRisk),
        avgCustomerLTV: Math.round(avgLTV),
        topTierName: topTier.name,
        conversionRateSource: conversionData.isHistorical ? 'historical' : 'benchmark',
      }
    };
  }

  /**
   * Get upcoming birthdays
   */
  private static async getBirthdayRecommendation(shop: string): Promise<MarketingRecommendation | null> {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Query customers with birthdays set
    const customersWithBirthday = await db.customer.findMany({
      where: {
        shop,
        birthday: { not: null },
      },
      select: {
        id: true,
        shopifyCustomerId: true,
        birthday: true,
        totalSpent: true,
      }
    });

    if (customersWithBirthday.length === 0) return null;

    // Filter to birthdays in the next 30 days (comparing month/day across year boundary)
    const currentYear = now.getFullYear();
    const upcomingBirthdays = customersWithBirthday.filter(customer => {
      if (!customer.birthday) return false;

      const birthday = new Date(customer.birthday);
      const birthdayMonth = birthday.getMonth();
      const birthdayDay = birthday.getDate();

      // Create date for this year's birthday
      let thisYearBirthday = new Date(currentYear, birthdayMonth, birthdayDay);

      // If birthday already passed this year, check next year
      if (thisYearBirthday < now) {
        thisYearBirthday = new Date(currentYear + 1, birthdayMonth, birthdayDay);
      }

      // Check if within next 30 days
      return thisYearBirthday >= now && thisYearBirthday <= thirtyDaysFromNow;
    });

    if (upcomingBirthdays.length === 0) return null;

    // Get historical conversion rate and average order value
    const [conversionData, avgOrderValue] = await Promise.all([
      this.getHistoricalConversionRate(shop, 'birthday'),
      this.getAverageOrderValue(shop),
    ]);

    const avgCustomerSpent = upcomingBirthdays.reduce((sum, c) => sum + Number(c.totalSpent || 0), 0) / upcomingBirthdays.length;
    const potentialRevenue = upcomingBirthdays.length * conversionData.rate * avgOrderValue;

    // Count how many customers have birthday data overall (for metadata)
    const totalWithBirthday = customersWithBirthday.length;

    return {
      id: 'birthday',
      type: 'birthday',
      priority: 'medium',
      category: 'engagement',
      title: 'Birthday Campaign',
      description: `Send special offers to ${upcomingBirthdays.length} customers celebrating birthdays in the next 30 days`,
      affectedCustomers: upcomingBirthdays.length,
      potentialRevenue: Math.round(potentialRevenue),
      expectedResponseRate: Math.round(conversionData.rate * 100),
      segmentRules: {
        birthdayInDays: { operator: 'less_than', value: 30 }
      },
      customerIds: upcomingBirthdays.map(c => c.shopifyCustomerId).filter(Boolean) as string[],
      metadata: {
        upcomingCount: upcomingBirthdays.length,
        totalCustomersWithBirthday: totalWithBirthday,
        avgCustomerLTV: Math.round(avgCustomerSpent),
        conversionRateSource: conversionData.isHistorical ? 'historical' : 'benchmark',
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
        storeCredit: {
          gt: 0,
          lt: 50 // Low balance threshold
        }
      },
      select: {
        id: true,
        shopifyCustomerId: true,
        storeCredit: true,
      }
    });

    if (customers.length === 0) return null;

    // Get historical conversion rate and average order value
    const [conversionData, avgOrderValue] = await Promise.all([
      this.getHistoricalConversionRate(shop, 'low_balance'),
      this.getAverageOrderValue(shop),
    ]);

    const totalDormant = customers.reduce((sum, c) => sum + Number(c.storeCredit || 0), 0);
    const avgBalance = totalDormant / customers.length;

    // Revenue = customers who convert * (their credit balance + additional spend)
    // People with small balances typically spend more than the balance value
    const avgSpendMultiplier = avgOrderValue / avgBalance;
    const potentialRevenue = customers.length * conversionData.rate * (avgBalance + avgOrderValue);

    return {
      id: 'low_balance',
      type: 'low_balance',
      priority: 'medium',
      category: 'retention',
      title: 'Low Balance Activation',
      description: 'Remind customers with small reward balances to use them before expiry',
      affectedCustomers: customers.length,
      potentialRevenue: Math.round(potentialRevenue),
      expectedResponseRate: Math.round(conversionData.rate * 100),
      segmentRules: {
        rewardBalance: { operator: 'between', value: [1, 50] }
      },
      customerIds: customers.map(c => c.shopifyCustomerId).filter(Boolean) as string[],
      metadata: {
        dormantRewards: Math.round(totalDormant),
        avgBalance: Math.round(avgBalance),
        avgOrderValue: Math.round(avgOrderValue),
        conversionRateSource: conversionData.isHistorical ? 'historical' : 'benchmark',
      }
    };
  }
}
