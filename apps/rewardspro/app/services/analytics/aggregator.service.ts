import prisma from "~/db.server";
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

    const rows = await prisma.$queryRaw`
      SELECT date_trunc('day', "createdAt") AS day, SUM("netAmount")::float AS revenue
       FROM "Order"
       WHERE shop = ${shopId} AND "createdAt" BETWEEN ${range.start} AND ${range.end}
         AND "financialStatus" IN ('PAID','PARTIALLY_PAID','PARTIALLY_REFUNDED')
       GROUP BY 1
       ORDER BY 1` as { day: string; revenue: number }[];
    analyticsCache.set(key, rows, 60_000);
    return rows;
  }

  async getTierDistribution(shopId: string) {
    const key = cacheKey("tierDist", { shopId });
    const cached = analyticsCache.get<any[]>(key);
    if (cached) return cached;

    const rows = await prisma.$queryRaw`
      SELECT t.name AS tier, COUNT(*)::int AS customers
       FROM "Customer" c
       LEFT JOIN "Tier" t ON c."tierId" = t.id
       WHERE c.shop = ${shopId}
       GROUP BY t.name
       ORDER BY customers DESC` as { tier: string; customers: number }[];
    analyticsCache.set(key, rows, 300_000);
    return rows;
  }

  async getCustomerMetrics(shopId: string, range: DateRange) {
    const key = cacheKey("custMetrics", { shopId, range });
    const cached = analyticsCache.get<any>(key);
    if (cached) return cached;

    const results = await prisma.$queryRaw`
      WITH active AS (
         SELECT COUNT(DISTINCT "customerId") AS active_30d
           FROM "Order"
          WHERE shop = ${shopId} AND "createdAt" >= (NOW() - INTERVAL '30 days')
       )
       SELECT (SELECT COUNT(*) FROM "Customer" WHERE shop = ${shopId}) AS total,
              active.active_30d
         FROM active` as { total: number; active_30d: number }[];

    const counts = results[0];
    analyticsCache.set(key, counts, 120_000);
    return counts;
  }

  async getCohortRetention(shopId: string) {
    const key = cacheKey("cohort", { shopId });
    const cached = analyticsCache.get<any[]>(key);
    if (cached) return cached;

    const rows = await prisma.$queryRaw`
      WITH first_order AS (
         SELECT "customerId", date_trunc('month', MIN("createdAt")) AS cohort_month
           FROM "Order" WHERE shop = ${shopId}
           GROUP BY "customerId"
       ),
       activity AS (
         SELECT o."customerId", date_trunc('month', o."createdAt") AS active_month
           FROM "Order" o WHERE o.shop = ${shopId}
           GROUP BY 1,2
       )
       SELECT fo.cohort_month,
              (EXTRACT(YEAR FROM a.active_month) - EXTRACT(YEAR FROM fo.cohort_month)) * 12
              + (EXTRACT(MONTH FROM a.active_month) - EXTRACT(MONTH FROM fo.cohort_month)) AS month_index,
              COUNT(DISTINCT a."customerId") AS active_users
         FROM first_order fo
         JOIN activity a ON a."customerId" = fo."customerId"
         GROUP BY 1,2
         ORDER BY 1,2` as { cohort_month: string; month_index: number; active_users: number }[];
    analyticsCache.set(key, rows, 600_000);
    return rows;
  }

  async getCashbackMetrics(shopId: string, range: DateRange) {
    const key = cacheKey("cashback", { shopId, range });
    const cached = analyticsCache.get<any[]>(key);
    if (cached) return cached;

    const rows = await prisma.$queryRaw`
      SELECT
        date_trunc('day', "createdAt") AS day,
        SUM(CASE WHEN type = 'CASHBACK_EARNED' THEN amount ELSE 0 END)::float AS cashback_earned,
        SUM(CASE WHEN type = 'ORDER_PAYMENT' THEN ABS(amount) ELSE 0 END)::float AS cashback_used
       FROM "StoreCreditLedger"
       WHERE shop = ${shopId} AND "createdAt" BETWEEN ${range.start} AND ${range.end}
       GROUP BY 1
       ORDER BY 1` as { day: string; cashback_earned: number; cashback_used: number }[];
    analyticsCache.set(key, rows, 60_000);
    return rows;
  }

  async getTopCustomers(shopId: string, limit = 10) {
    const key = cacheKey("topCustomers", { shopId, limit });
    const cached = analyticsCache.get<any[]>(key);
    if (cached) return cached;

    const rows = await prisma.$queryRaw`
      SELECT
        c.id AS customer_id,
        c.email,
        c."lifetimeSpent"::float AS total_spent,
        t.name AS tier
       FROM "Customer" c
       LEFT JOIN "Tier" t ON c."tierId" = t.id
       WHERE c.shop = ${shopId}
       ORDER BY c."lifetimeSpent" DESC
       LIMIT ${limit}` as { customer_id: string; email: string; total_spent: number; tier: string }[];
    analyticsCache.set(key, rows, 300_000);
    return rows;
  }

  async getOrderTrends(shopId: string, range: DateRange) {
    const key = cacheKey("orderTrends", { shopId, range });
    const cached = analyticsCache.get<any[]>(key);
    if (cached) return cached;

    const rows = await prisma.$queryRaw`
      SELECT
        date_trunc('day', "createdAt") AS day,
        COUNT(*)::int AS order_count,
        AVG("netAmount")::float AS avg_order_value
       FROM "Order"
       WHERE shop = ${shopId} AND "createdAt" BETWEEN ${range.start} AND ${range.end}
         AND "financialStatus" IN ('PAID','PARTIALLY_PAID','PARTIALLY_REFUNDED')
       GROUP BY 1
       ORDER BY 1` as { day: string; order_count: number; avg_order_value: number }[];
    analyticsCache.set(key, rows, 60_000);
    return rows;
  }
}

export const analytics = new AnalyticsAggregator();
