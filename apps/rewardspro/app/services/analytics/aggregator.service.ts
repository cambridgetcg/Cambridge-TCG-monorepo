import { query } from "../db/rds-data";
import { analyticsCache } from "./cache.service";

export type DateRange = { start: Date; end: Date };

function cacheKey(name: string, args: any) {
  return `analytics:${name}:${JSON.stringify(args)}`;
}

export class AnalyticsAggregator {
  async getRevenueMetrics(shopId: string, range: DateRange) {
    const key = cacheKey("revenue", { shopId, range });
    const cached = analyticsCache.get<any[]>(key);
    if (cached) return cached;

    const rows = await query<{ day: string; revenue: number }>(
      `SELECT date_trunc('day', "shopifyCreatedAt") AS day, SUM("netAmount")::float AS revenue
       FROM "Order"
       WHERE shop = :shopId AND "shopifyCreatedAt" BETWEEN :start AND :end
       GROUP BY 1
       ORDER BY 1`,
      { shopId, start: range.start, end: range.end }
    );
    analyticsCache.set(key, rows, 60_000);
    return rows;
  }

  async getTierDistribution(shopId: string) {
    const key = cacheKey("tierDist", { shopId });
    const cached = analyticsCache.get<any[]>(key);
    if (cached) return cached;

    const rows = await query<{ tier: string; customers: number }>(
      `SELECT COALESCE(t.name, 'No Tier') AS tier, COUNT(*)::int AS customers
       FROM "Customer" c
       LEFT JOIN "Tier" t ON c."currentTierId" = t.id
       WHERE c.shop = :shopId
       GROUP BY COALESCE(t.name, 'No Tier')
       ORDER BY customers DESC`,
      { shopId }
    );
    analyticsCache.set(key, rows, 300_000);
    return rows;
  }

  async getCustomerMetrics(shopId: string, range: DateRange) {
    const key = cacheKey("custMetrics", { shopId, range });
    const cached = analyticsCache.get<any>(key);
    if (cached) return cached;

    const [counts] = await query<{ total: number; active_30d: number }>(
      `WITH active AS (
         SELECT COUNT(DISTINCT "customerId") AS active_30d
           FROM "Order"
          WHERE shop = :shopId AND "shopifyCreatedAt" >= (NOW() - INTERVAL '30 days')
       )
       SELECT (SELECT COUNT(*) FROM "Customer" WHERE shop = :shopId) AS total,
              active.active_30d
         FROM active`,
      { shopId }
    );

    analyticsCache.set(key, counts, 120_000);
    return counts;
  }

  async getCohortRetention(shopId: string) {
    const key = cacheKey("cohort", { shopId });
    const cached = analyticsCache.get<any[]>(key);
    if (cached) return cached;

    const rows = await query<{ cohort_month: string; month_index: number; active_users: number }>(
      `WITH first_order AS (
         SELECT "customerId", date_trunc('month', MIN("shopifyCreatedAt")) AS cohort_month
           FROM "Order" WHERE shop = :shopId
           GROUP BY "customerId"
       ),
       activity AS (
         SELECT o."customerId", date_trunc('month', o."shopifyCreatedAt") AS active_month
           FROM "Order" o WHERE o.shop = :shopId
           GROUP BY 1,2
       )
       SELECT fo.cohort_month,
              (EXTRACT(YEAR FROM a.active_month) - EXTRACT(YEAR FROM fo.cohort_month)) * 12
              + (EXTRACT(MONTH FROM a.active_month) - EXTRACT(MONTH FROM fo.cohort_month)) AS month_index,
              COUNT(DISTINCT a."customerId") AS active_users
         FROM first_order fo
         JOIN activity a ON a."customerId" = fo."customerId"
         GROUP BY 1,2
         ORDER BY 1,2`,
      { shopId }
    );
    analyticsCache.set(key, rows, 600_000);
    return rows;
  }

  async getCashbackMetrics(shopId: string, range: DateRange) {
    const key = cacheKey("cashback", { shopId, range });
    const cached = analyticsCache.get<any[]>(key);
    if (cached) return cached;

    const rows = await query<{ day: string; cashback_earned: number; cashback_used: number }>(
      `SELECT
        date_trunc('day', "createdAt") AS day,
        SUM(CASE WHEN type = 'CASHBACK_EARNED' THEN amount ELSE 0 END)::float AS cashback_earned,
        SUM(CASE WHEN type = 'ORDER_PAYMENT' THEN ABS(amount) ELSE 0 END)::float AS cashback_used
       FROM "StoreCreditLedger"
       WHERE shop = :shopId AND "createdAt" BETWEEN :start AND :end
       GROUP BY 1
       ORDER BY 1`,
      { shopId, start: range.start, end: range.end }
    );
    analyticsCache.set(key, rows, 60_000);
    return rows;
  }

  async getTopCustomers(shopId: string, limit = 10) {
    const key = cacheKey("topCustomers", { shopId, limit });
    const cached = analyticsCache.get<any[]>(key);
    if (cached) return cached;

    const rows = await query<{ customer_id: string; email: string; total_spent: number; tier: string }>(
      `SELECT
        c.id AS customer_id,
        c.email,
        c."totalSpent"::float AS total_spent,
        t.name AS tier
       FROM "Customer" c
       LEFT JOIN "Tier" t ON c."currentTierId" = t.id
       WHERE c.shop = :shopId
       ORDER BY c."totalSpent" DESC
       LIMIT :limit`,
      { shopId, limit }
    );
    analyticsCache.set(key, rows, 300_000);
    return rows;
  }

  async getOrderTrends(shopId: string, range: DateRange) {
    const key = cacheKey("orderTrends", { shopId, range });
    const cached = analyticsCache.get<any[]>(key);
    if (cached) return cached;

    const rows = await query<{ day: string; order_count: number; avg_order_value: number }>(
      `SELECT
        date_trunc('day', "shopifyCreatedAt") AS day,
        COUNT(*)::int AS order_count,
        AVG("netAmount")::float AS avg_order_value
       FROM "Order"
       WHERE shop = :shopId AND "shopifyCreatedAt" BETWEEN :start AND :end
       GROUP BY 1
       ORDER BY 1`,
      { shopId, start: range.start, end: range.end }
    );
    analyticsCache.set(key, rows, 60_000);
    return rows;
  }

  async getRetentionMetrics(shopId: string, range: DateRange) {
    const key = cacheKey("retention", { shopId, range });
    const cached = analyticsCache.get<any>(key);
    if (cached) return cached;

    const end = range.end;
    const start =
      range.start ??
      new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [counts] = await query<{
      cs: number;
      ce: number;
      cn: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM "Customer" WHERE shop = :shopId AND "createdAt" < :start) AS cs,
         (SELECT COUNT(*) FROM "Customer" WHERE shop = :shopId AND "createdAt" <= :end) AS ce,
         (SELECT COUNT(*) FROM "Customer" WHERE shop = :shopId AND "createdAt" BETWEEN :start AND :end) AS cn`,
      { shopId, start, end }
    );

    const [orderStats] = await query<{
      total_orders: number;
      unique_customers: number;
      repeat_customers: number;
    }>(
      `WITH orders_in_period AS (
         SELECT "customerId"
             FROM "Order"
            WHERE shop = :shopId
              AND "financialStatus" = 'PAID'
              AND "shopifyCreatedAt" BETWEEN :start AND :end
       )
       SELECT
         (SELECT COUNT(*) FROM orders_in_period) AS total_orders,
         (SELECT COUNT(DISTINCT "customerId") FROM orders_in_period) AS unique_customers,
         (SELECT COUNT(*) FROM (
             SELECT "customerId"
               FROM "Order"
              WHERE shop = :shopId
                AND "financialStatus" = 'PAID'
                AND "shopifyCreatedAt" BETWEEN :start AND :end
              GROUP BY "customerId"
             HAVING COUNT(*) > 1
         ) repeaters) AS repeat_customers`,
      { shopId, start, end }
    );

    const cs = counts?.cs || 0;
    const ce = counts?.ce || 0;
    const cn = counts?.cn || 0;
    const retained = ce - cn;
    const crr = cs > 0 ? ((retained / cs) * 100) : 0;

    const { total_orders = 0, unique_customers = 0, repeat_customers = 0 } = orderStats || {};
    const purchaseFrequency = unique_customers > 0 ? total_orders / unique_customers : 0;
    const rpr = unique_customers > 0 ? (repeat_customers / unique_customers) * 100 : 0;

    const result = {
      crr: Number.isFinite(crr) ? Math.round(crr * 100) / 100 : 0,
      counts: { cs, ce, cn, retained },
      rpr: Number.isFinite(rpr) ? Math.round(rpr * 100) / 100 : 0,
      repeatCustomers: repeat_customers,
      uniqueCustomers: unique_customers,
      totalOrders: total_orders,
      purchaseFrequency: Number.isFinite(purchaseFrequency)
        ? Math.round(purchaseFrequency * 100) / 100
        : 0,
    };

    analyticsCache.set(key, result, 60_000);
    return result;
  }

  async getRedemptionSummary(shopId: string, range: DateRange) {
    const key = cacheKey("redemption", { shopId, range });
    const cached = analyticsCache.get<any>(key);
    if (cached) return cached;

    const end = range.end;
    const start =
      range.start ??
      new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [row] = await query<{
      issued: number | null;
      redeemed: number | null;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN type IN ('CASHBACK_EARNED', 'MANUAL_ADJUSTMENT') THEN amount ELSE 0 END), 0)::float AS issued,
         COALESCE(SUM(CASE WHEN type = 'ORDER_PAYMENT' THEN ABS(amount) ELSE 0 END), 0)::float AS redeemed
       FROM "StoreCreditLedger"
       WHERE shop = :shopId
         AND "createdAt" BETWEEN :start AND :end`,
      { shopId, start, end }
    );

    const result = {
      issued: row?.issued || 0,
      redeemed: row?.redeemed || 0,
    };

    analyticsCache.set(key, result, 60_000);
    return result;
  }
}

export const analytics = new AnalyticsAggregator();
