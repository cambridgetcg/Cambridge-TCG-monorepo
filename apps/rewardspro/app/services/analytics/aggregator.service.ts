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
      `SELECT date_trunc('day', "createdAt") AS day, SUM(total_price)::float AS revenue
       FROM "Order"
       WHERE shop = :shopId AND "createdAt" BETWEEN :start AND :end
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
      `SELECT t.name AS tier, COUNT(*)::int AS customers
       FROM "Customer" c
       LEFT JOIN "Tier" t ON c."tierId" = t.id
       WHERE c.shop = :shopId
       GROUP BY t.name
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
          WHERE shop = :shopId AND "createdAt" >= (NOW() - INTERVAL '30 days')
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
         SELECT "customerId", date_trunc('month', MIN("createdAt")) AS cohort_month
           FROM "Order" WHERE shop = :shopId
           GROUP BY "customerId"
       ),
       activity AS (
         SELECT o."customerId", date_trunc('month', o."createdAt") AS active_month
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
        c."lifetimeSpent"::float AS total_spent,
        t.name AS tier
       FROM "Customer" c
       LEFT JOIN "Tier" t ON c."tierId" = t.id
       WHERE c.shop = :shopId
       ORDER BY c."lifetimeSpent" DESC
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
        date_trunc('day', "createdAt") AS day,
        COUNT(*)::int AS order_count,
        AVG(total_price)::float AS avg_order_value
       FROM "Order"
       WHERE shop = :shopId AND "createdAt" BETWEEN :start AND :end
       GROUP BY 1
       ORDER BY 1`,
      { shopId, start: range.start, end: range.end }
    );
    analyticsCache.set(key, rows, 60_000);
    return rows;
  }
}

export const analytics = new AnalyticsAggregator();