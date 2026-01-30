/**
 * Tier Product Analytics Service
 *
 * Aggregates metrics for tier products including:
 * - Revenue from one-time purchases and subscriptions
 * - Purchase counts and conversion rates
 * - Expiration and churn metrics
 * - Product performance comparisons
 */

import db from "~/db.server";

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
// Types
// ============================================================================

export interface TierProductSummary {
  totalRevenue: number;
  purchaseRevenue: number;
  subscriptionRevenue: number;
  activePurchases: number;
  activeSubscriptions: number;
  expiredPurchases: number;
  cancelledSubscriptions: number;
  expiringIn7Days: number;
  expiringIn30Days: number;
}

export interface TierProductMetrics {
  productId: string;
  tierName: string;
  duration: string;
  totalSales: number;
  revenue: number;
  activePurchases: number;
  expiredPurchases: number;
  churnRate: number;
  avgPurchasePrice: number;
}

export interface TierProductTrend {
  date: string;
  purchases: number;
  revenue: number;
  expirations: number;
}

export interface TierProductAnalytics {
  summary: TierProductSummary;
  productMetrics: TierProductMetrics[];
  trends: TierProductTrend[];
  periodStart: Date;
  periodEnd: Date;
}

// ============================================================================
// Analytics Functions
// ============================================================================

/**
 * Get tier product analytics summary for a shop
 */
export async function getTierProductSummary(shop: string): Promise<TierProductSummary> {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Fetch all purchases and subscriptions in parallel
  const [purchases, subscriptions] = await Promise.all([
    db.tierPurchase.findMany({
      where: { shop },
      select: {
        id: true,
        purchasePrice: true,
        status: true,
        endDate: true,
      },
    }),
    db.tierSubscription.findMany({
      where: { shop },
      select: {
        id: true,
        finalPrice: true,
        status: true,
        currentPeriodEnd: true,
      },
    }),
  ]);

  // Calculate purchase metrics
  const activePurchases = purchases.filter(p => p.status === 'ACTIVE');
  const expiredPurchases = purchases.filter(p => p.status === 'EXPIRED');
  const purchaseRevenue = purchases.reduce(
    (sum, p) => sum + toNumber(p.purchasePrice),
    0
  );

  // Calculate purchases expiring soon
  const expiringIn7Days = activePurchases.filter(p => {
    if (!p.endDate) return false;
    return new Date(p.endDate) <= sevenDaysFromNow && new Date(p.endDate) > now;
  }).length;

  const expiringIn30Days = activePurchases.filter(p => {
    if (!p.endDate) return false;
    return new Date(p.endDate) <= thirtyDaysFromNow && new Date(p.endDate) > now;
  }).length;

  // Calculate subscription metrics
  const activeSubscriptions = subscriptions.filter(s => s.status === 'ACTIVE');
  const cancelledSubscriptions = subscriptions.filter(s => s.status === 'CANCELLED');

  // For subscriptions, calculate total revenue from all billing cycles
  // This is a simplified calculation - in production you'd aggregate actual payments
  const subscriptionRevenue = subscriptions.reduce(
    (sum, s) => sum + toNumber(s.finalPrice),
    0
  );

  return {
    totalRevenue: purchaseRevenue + subscriptionRevenue,
    purchaseRevenue,
    subscriptionRevenue,
    activePurchases: activePurchases.length,
    activeSubscriptions: activeSubscriptions.length,
    expiredPurchases: expiredPurchases.length,
    cancelledSubscriptions: cancelledSubscriptions.length,
    expiringIn7Days,
    expiringIn30Days,
  };
}

/**
 * Get metrics per tier product
 */
export async function getTierProductMetrics(shop: string): Promise<TierProductMetrics[]> {
  // Fetch tier products with their purchases
  const tierProducts = await db.tierProduct.findMany({
    where: {
      shop,
      deletedAt: null, // Only active products
    },
    include: {
      tier: { select: { name: true } },
      purchases: {
        select: {
          id: true,
          purchasePrice: true,
          status: true,
        },
      },
    },
  });

  return tierProducts.map(product => {
    const totalSales = product.purchases.length;
    const revenue = product.purchases.reduce(
      (sum, p) => sum + toNumber(p.purchasePrice),
      0
    );
    const activePurchases = product.purchases.filter(p => p.status === 'ACTIVE').length;
    const expiredPurchases = product.purchases.filter(p => p.status === 'EXPIRED').length;

    // Churn rate = expired / total (if any sales)
    const churnRate = totalSales > 0 ? (expiredPurchases / totalSales) * 100 : 0;

    // Average purchase price
    const avgPurchasePrice = totalSales > 0 ? revenue / totalSales : toNumber(product.price);

    return {
      productId: product.id,
      tierName: product.tier?.name || 'Unknown Tier',
      duration: product.duration,
      totalSales,
      revenue,
      activePurchases,
      expiredPurchases,
      churnRate: Math.round(churnRate * 10) / 10, // Round to 1 decimal
      avgPurchasePrice: Math.round(avgPurchasePrice * 100) / 100, // Round to cents
    };
  });
}

/**
 * Get tier product trends over time (last 30 days by default)
 */
export async function getTierProductTrends(
  shop: string,
  days: number = 30
): Promise<TierProductTrend[]> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

  // Fetch purchases within date range
  const purchases = await db.tierPurchase.findMany({
    where: {
      shop,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      createdAt: true,
      purchasePrice: true,
      status: true,
      endDate: true,
    },
  });

  // Group by date
  const trendMap = new Map<string, TierProductTrend>();

  // Initialize all days in range
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const dateKey = date.toISOString().split('T')[0];
    trendMap.set(dateKey, {
      date: dateKey,
      purchases: 0,
      revenue: 0,
      expirations: 0,
    });
  }

  // Count purchases by date
  for (const purchase of purchases) {
    const dateKey = new Date(purchase.createdAt).toISOString().split('T')[0];
    const trend = trendMap.get(dateKey);
    if (trend) {
      trend.purchases++;
      trend.revenue += toNumber(purchase.purchasePrice);
    }
  }

  // Fetch expirations that occurred in this period
  const expirations = await db.tierPurchase.findMany({
    where: {
      shop,
      status: 'EXPIRED',
      endDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      endDate: true,
    },
  });

  // Count expirations by date
  for (const expiration of expirations) {
    if (expiration.endDate) {
      const dateKey = new Date(expiration.endDate).toISOString().split('T')[0];
      const trend = trendMap.get(dateKey);
      if (trend) {
        trend.expirations++;
      }
    }
  }

  // Convert to array and sort by date
  return Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get complete tier product analytics
 */
export async function getTierProductAnalytics(
  shop: string,
  days: number = 30
): Promise<TierProductAnalytics> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

  const [summary, productMetrics, trends] = await Promise.all([
    getTierProductSummary(shop),
    getTierProductMetrics(shop),
    getTierProductTrends(shop, days),
  ]);

  return {
    summary,
    productMetrics,
    trends,
    periodStart: startDate,
    periodEnd: endDate,
  };
}

/**
 * Get quick stats for tier products (lightweight version for dashboard)
 */
export async function getTierProductQuickStats(shop: string): Promise<{
  totalProducts: number;
  totalActiveMemberships: number;
  monthlyRevenue: number;
  expiringThisWeek: number;
}> {
  const now = new Date();
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [productCount, activePurchases, recentPurchases, expiringCount] = await Promise.all([
    // Count active tier products
    db.tierProduct.count({
      where: { shop, deletedAt: null },
    }),
    // Count active purchases
    db.tierPurchase.count({
      where: { shop, status: 'ACTIVE' },
    }),
    // Get purchases in last 30 days for revenue calculation
    db.tierPurchase.findMany({
      where: {
        shop,
        createdAt: { gte: oneMonthAgo },
      },
      select: { purchasePrice: true },
    }),
    // Count expiring in next 7 days
    db.tierPurchase.count({
      where: {
        shop,
        status: 'ACTIVE',
        endDate: {
          gte: now,
          lte: oneWeekFromNow,
        },
      },
    }),
  ]);

  const monthlyRevenue = recentPurchases.reduce(
    (sum, p) => sum + toNumber(p.purchasePrice),
    0
  );

  return {
    totalProducts: productCount,
    totalActiveMemberships: activePurchases,
    monthlyRevenue,
    expiringThisWeek: expiringCount,
  };
}
