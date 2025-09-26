/**
 * Alternative Strategies for Order Counting
 * Multiple approaches to work around AWS Data API date filtering issues
 */

import { db } from "../db.server";
import { getAuroraClient } from "./aurora-data-api";
import type { SqlParameter } from "@aws-sdk/client-rds-data";

/**
 * Strategy 1: Direct Aurora Data API with proper parameters
 * Bypass Prisma entirely and use Data API directly
 */
export async function countOrdersDirectDataAPI(
  shop: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const client = getAuroraClient();

  // Format dates for Data API
  const formatDate = (date: Date) => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  const sql = `
    SELECT COUNT(*) as count
    FROM "Order"
    WHERE shop = :shop
      AND "shopifyCreatedAt" >= :startDate
      AND "shopifyCreatedAt" <= :endDate
  `;

  const parameters: SqlParameter[] = [
    {
      name: "shop",
      value: { stringValue: shop }
    },
    {
      name: "startDate",
      value: { stringValue: formatDate(startDate) },
      typeHint: "TIMESTAMP"
    },
    {
      name: "endDate",
      value: { stringValue: formatDate(endDate) },
      typeHint: "TIMESTAMP"
    }
  ];

  try {
    const result = await client.executeStatement(sql, parameters);
    return result.records[0]?.count || 0;
  } catch (error) {
    console.error("[DirectDataAPI] Error:", error);
    throw error;
  }
}

/**
 * Strategy 2: String-based date comparison
 * Store and compare dates as ISO strings
 */
export async function countOrdersStringComparison(
  shop: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  // Convert dates to ISO strings for string comparison
  const startISO = startDate.toISOString();
  const endISO = endDate.toISOString();

  try {
    // Use raw SQL with string comparison
    const result = await db.$queryRaw`
      SELECT COUNT(*) as count
      FROM "Order"
      WHERE shop = ${shop}
        AND "shopifyCreatedAt"::text >= ${startISO}
        AND "shopifyCreatedAt"::text <= ${endISO}
    ` as any[];

    return Number(result[0]?.count || 0);
  } catch (error) {
    console.error("[StringComparison] Error:", error);
    throw error;
  }
}

/**
 * Strategy 3: Date extraction functions
 * Use PostgreSQL date functions to extract year/month
 */
export async function countOrdersDateExtraction(
  shop: string,
  year: number,
  month: number
): Promise<number> {
  try {
    const result = await db.$queryRaw`
      SELECT COUNT(*) as count
      FROM "Order"
      WHERE shop = ${shop}
        AND EXTRACT(YEAR FROM "shopifyCreatedAt") = ${year}
        AND EXTRACT(MONTH FROM "shopifyCreatedAt") = ${month}
    ` as any[];

    return Number(result[0]?.count || 0);
  } catch (error) {
    console.error("[DateExtraction] Error:", error);
    throw error;
  }
}

/**
 * Strategy 4: Epoch timestamp comparison
 * Convert to Unix timestamps for numeric comparison
 */
export async function countOrdersEpochComparison(
  shop: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  // Convert to epoch seconds
  const startEpoch = Math.floor(startDate.getTime() / 1000);
  const endEpoch = Math.floor(endDate.getTime() / 1000);

  try {
    const result = await db.$queryRaw`
      SELECT COUNT(*) as count
      FROM "Order"
      WHERE shop = ${shop}
        AND EXTRACT(EPOCH FROM "shopifyCreatedAt") >= ${startEpoch}
        AND EXTRACT(EPOCH FROM "shopifyCreatedAt") <= ${endEpoch}
    ` as any[];

    return Number(result[0]?.count || 0);
  } catch (error) {
    console.error("[EpochComparison] Error:", error);
    throw error;
  }
}

/**
 * Strategy 5: Pre-aggregated counts
 * Maintain a separate table with monthly counts
 */
export async function getOrCreateMonthlyCount(
  shop: string,
  year: number,
  month: number
): Promise<number> {
  try {
    // Check if we have a cached count
    const cached = await db.monthlyOrderUsage.findUnique({
      where: {
        shop_year_month: {
          shop,
          year,
          month
        }
      }
    });

    if (cached && cached.orderCount > 0) {
      return cached.orderCount;
    }

    // Calculate and cache the count
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    // Fallback to counting all orders and filtering in memory
    const orders = await db.order.findMany({
      where: { shop },
      select: {
        shopifyCreatedAt: true
      }
    });

    const count = orders.filter(order => {
      const orderDate = order.shopifyCreatedAt;
      return orderDate >= startDate && orderDate <= endDate;
    }).length;

    // Cache the result
    await db.monthlyOrderUsage.upsert({
      where: {
        shop_year_month: {
          shop,
          year,
          month
        }
      },
      create: {
        id: crypto.randomUUID(),
        shop,
        year,
        month,
        orderCount: count,
        planLimit: 1000,
        planName: "Current Plan",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      update: {
        orderCount: count,
        updatedAt: new Date()
      }
    });

    return count;
  } catch (error) {
    console.error("[PreAggregated] Error:", error);
    throw error;
  }
}

/**
 * Strategy 6: Fetch all and filter in memory
 * Most reliable but least efficient
 */
export async function countOrdersInMemory(
  shop: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  try {
    const orders = await db.order.findMany({
      where: { shop },
      select: {
        id: true,
        shopifyCreatedAt: true
      }
    });

    const count = orders.filter(order => {
      const orderDate = new Date(order.shopifyCreatedAt);
      return orderDate >= startDate && orderDate <= endDate;
    }).length;

    return count;
  } catch (error) {
    console.error("[InMemory] Error:", error);
    throw error;
  }
}

/**
 * Strategy 7: Use AT TIME ZONE for explicit timezone handling
 */
export async function countOrdersWithTimezone(
  shop: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  try {
    // Format dates as strings with explicit UTC timezone
    const startStr = startDate.toISOString().replace('T', ' ').replace('Z', '');
    const endStr = endDate.toISOString().replace('T', ' ').replace('Z', '');

    const result = await db.$queryRaw`
      SELECT COUNT(*) as count
      FROM "Order"
      WHERE shop = ${shop}
        AND "shopifyCreatedAt" AT TIME ZONE 'UTC' >= ${startStr}::timestamp AT TIME ZONE 'UTC'
        AND "shopifyCreatedAt" AT TIME ZONE 'UTC' <= ${endStr}::timestamp AT TIME ZONE 'UTC'
    ` as any[];

    return Number(result[0]?.count || 0);
  } catch (error) {
    console.error("[WithTimezone] Error:", error);
    throw error;
  }
}

/**
 * Strategy 8: Use BETWEEN operator
 * Sometimes BETWEEN works better than >= and <=
 */
export async function countOrdersBetween(
  shop: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  try {
    const result = await db.$queryRaw`
      SELECT COUNT(*) as count
      FROM "Order"
      WHERE shop = ${shop}
        AND "shopifyCreatedAt" BETWEEN ${startDate} AND ${endDate}
    ` as any[];

    return Number(result[0]?.count || 0);
  } catch (error) {
    console.error("[Between] Error:", error);
    throw error;
  }
}

/**
 * Master function that tries multiple strategies
 * Returns the first successful result
 */
export async function countOrdersWithFallback(
  shop: string,
  startDate: Date,
  endDate: Date
): Promise<{ count: number; strategy: string }> {
  const strategies = [
    { name: "DirectDataAPI", fn: () => countOrdersDirectDataAPI(shop, startDate, endDate) },
    { name: "DateExtraction", fn: () => countOrdersDateExtraction(shop, startDate.getUTCFullYear(), startDate.getUTCMonth() + 1) },
    { name: "EpochComparison", fn: () => countOrdersEpochComparison(shop, startDate, endDate) },
    { name: "StringComparison", fn: () => countOrdersStringComparison(shop, startDate, endDate) },
    { name: "Between", fn: () => countOrdersBetween(shop, startDate, endDate) },
    { name: "WithTimezone", fn: () => countOrdersWithTimezone(shop, startDate, endDate) },
    { name: "InMemory", fn: () => countOrdersInMemory(shop, startDate, endDate) }
  ];

  for (const strategy of strategies) {
    try {
      console.log(`[OrderCount] Trying strategy: ${strategy.name}`);
      const count = await strategy.fn();
      console.log(`[OrderCount] Strategy ${strategy.name} succeeded with count: ${count}`);
      return { count, strategy: strategy.name };
    } catch (error) {
      console.error(`[OrderCount] Strategy ${strategy.name} failed:`, error);
      continue;
    }
  }

  // If all strategies fail, return 0
  console.error("[OrderCount] All strategies failed!");
  return { count: 0, strategy: "none" };
}

// Helper for crypto
import * as crypto from 'crypto';