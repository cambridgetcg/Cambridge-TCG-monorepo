import prisma from "~/db.server";
import { getCachedOrCompute } from "~/utils/analytics-cache.server";

export type DateRange = { start: Date; end: Date };

function cacheKey(name: string, args: any) {
  return `analytics:${name}:${JSON.stringify(args)}`;
}

export class AnalyticsAggregator {
  async getRevenueMetrics(shopId: string, range: DateRange) {
    return getCachedOrCompute(
      cacheKey("revenue", { shopId, range }),
      async () => {
        return (await prisma.$queryRaw`
          SELECT date_trunc('day', "createdAt") AS day, SUM("netAmount")::float AS revenue
           FROM "Order"
           WHERE shop = ${shopId} AND "createdAt" BETWEEN ${range.start} AND ${range.end}
             AND "financialStatus" IN ('PAID','PARTIALLY_PAID','PARTIALLY_REFUNDED')
           GROUP BY 1
           ORDER BY 1`) as { day: string; revenue: number }[];
      },
      60_000
    );
  }

  async getTierDistribution(shopId: string) {
    return getCachedOrCompute(
      cacheKey("tierDist", { shopId }),
      async () => {
        return (await prisma.$queryRaw`
          SELECT t.name AS tier, COUNT(*)::int AS customers
           FROM "Customer" c
           LEFT JOIN "Tier" t ON c."tierId" = t.id
           WHERE c.shop = ${shopId}
           GROUP BY t.name
           ORDER BY customers DESC`) as { tier: string; customers: number }[];
      },
      300_000
    );
  }

  async getCustomerMetrics(shopId: string, range: DateRange) {
    return getCachedOrCompute(
      cacheKey("custMetrics", { shopId, range }),
      async () => {
        const results = (await prisma.$queryRaw`
          WITH active AS (
             SELECT COUNT(DISTINCT "customerId") AS active_30d
               FROM "Order"
              WHERE shop = ${shopId} AND "createdAt" >= (NOW() - INTERVAL '30 days')
           )
           SELECT (SELECT COUNT(*) FROM "Customer" WHERE shop = ${shopId}) AS total,
                  active.active_30d
             FROM active`) as { total: number; active_30d: number }[];
        return results[0];
      },
      120_000
    );
  }

  async getCohortRetention(shopId: string) {
    return getCachedOrCompute(
      cacheKey("cohort", { shopId }),
      async () => {
        return (await prisma.$queryRaw`
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
             ORDER BY 1,2`) as { cohort_month: string; month_index: number; active_users: number }[];
      },
      600_000
    );
  }

  async getCashbackMetrics(shopId: string, range: DateRange) {
    return getCachedOrCompute(
      cacheKey("cashback", { shopId, range }),
      async () => {
        return (await prisma.$queryRaw`
          SELECT
            date_trunc('day', "createdAt") AS day,
            SUM(CASE WHEN type = 'CASHBACK_EARNED' THEN amount ELSE 0 END)::float AS cashback_earned,
            SUM(CASE WHEN type = 'ORDER_PAYMENT' THEN ABS(amount) ELSE 0 END)::float AS cashback_used
           FROM "StoreCreditLedger"
           WHERE shop = ${shopId} AND "createdAt" BETWEEN ${range.start} AND ${range.end}
           GROUP BY 1
           ORDER BY 1`) as { day: string; cashback_earned: number; cashback_used: number }[];
      },
      60_000
    );
  }

  async getTopCustomers(shopId: string, limit = 10) {
    return getCachedOrCompute(
      cacheKey("topCustomers", { shopId, limit }),
      async () => {
        return (await prisma.$queryRaw`
          SELECT
            c.id AS customer_id,
            c.email,
            c."lifetimeSpent"::float AS total_spent,
            t.name AS tier
           FROM "Customer" c
           LEFT JOIN "Tier" t ON c."tierId" = t.id
           WHERE c.shop = ${shopId}
           ORDER BY c."lifetimeSpent" DESC
           LIMIT ${limit}`) as { customer_id: string; email: string; total_spent: number; tier: string }[];
      },
      300_000
    );
  }

  async getOrderTrends(shopId: string, range: DateRange) {
    return getCachedOrCompute(
      cacheKey("orderTrends", { shopId, range }),
      async () => {
        return (await prisma.$queryRaw`
          SELECT
            date_trunc('day', "createdAt") AS day,
            COUNT(*)::int AS order_count,
            AVG("netAmount")::float AS avg_order_value
           FROM "Order"
           WHERE shop = ${shopId} AND "createdAt" BETWEEN ${range.start} AND ${range.end}
             AND "financialStatus" IN ('PAID','PARTIALLY_PAID','PARTIALLY_REFUNDED')
           GROUP BY 1
           ORDER BY 1`) as { day: string; order_count: number; avg_order_value: number }[];
      },
      60_000
    );
  }
}

export const analytics = new AnalyticsAggregator();
