/**
 * Order counting for plan usage.
 *
 * On plain Postgres a date-range count is one indexed query. (The previous
 * file tried eight strategies in turn to work around Aurora Data API
 * timestamp serialization; none of that is needed any more.)
 */

import { db } from "../db.server";
import { PRICING_PLANS } from "../constants/pricing-contract";

/**
 * Count a shop's orders created in Shopify within [startDate, endDate].
 */
export async function countOrdersInRange(
  shop: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  return db.order.count({
    where: {
      shop,
      shopifyCreatedAt: { gte: startDate, lte: endDate },
    },
  });
}

/**
 * Increment monthly order count for real-time usage tracking
 * Called after a unique, participating paid order is persisted.
 *
 * @param shop - Shop domain
 * @param orderCreatedAt - When the order was created in Shopify (from webhook payload)
 * @param planLimit - Optional plan limit to set (defaults to Free Forever)
 * @param planName - Optional plan name to set (defaults to existing or "RewardsPro Free")
 */
export async function incrementMonthlyOrderCount(
  shop: string,
  orderCreatedAt: string | Date,
  planLimit?: number,
  planName?: string
): Promise<void> {
  try {
    // Parse the order creation date
    const orderDate = new Date(orderCreatedAt);
    const year = orderDate.getUTCFullYear();
    const month = orderDate.getUTCMonth() + 1; // 1-12

    // Single atomic upsert on the (shop, year, month) unique key, so
    // concurrent webhooks can neither double-create nor lose an increment.
    const usage = await db.monthlyOrderUsage.upsert({
      where: { shop_year_month: { shop, year, month } },
      create: {
        shop,
        year,
        month,
        orderCount: 1,
        planLimit: planLimit ?? PRICING_PLANS.free.limits.orders,
        planName: planName ?? PRICING_PLANS.free.billingName,
        isLocked: false,
        lastOrderDate: orderDate,
      },
      update: {
        orderCount: { increment: 1 },
        // Optionally update plan info if provided
        ...(planLimit !== undefined && { planLimit }),
        ...(planName !== undefined && { planName }),
        isLocked: false,
        lockedAt: null,
        lockReason: null,
        lastOrderDate: orderDate,
      },
    });

    console.log(`[IncrementOrderCount] ${shop} ${year}-${String(month).padStart(2, "0")}: ${usage.orderCount} orders`);
  } catch (error) {
    console.error(`[IncrementOrderCount] ❌ Failed to increment count for ${shop}:`, error);
    // Don't throw - this is non-critical tracking that shouldn't fail webhooks
  }
}
