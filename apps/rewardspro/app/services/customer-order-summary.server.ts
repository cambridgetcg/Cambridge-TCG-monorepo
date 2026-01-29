/**
 * Customer Order Summary Service
 *
 * Provides aggregated order metrics for customers to facilitate
 * easier customer management in the members module.
 *
 * Key features:
 * - Order summary metrics (count, total spent, average order value)
 * - Activity status indicators (active, dormant, at-risk)
 * - RFM (Recency, Frequency, Monetary) segmentation
 * - Batch operations for efficient list views
 */

import db from "~/db.server";

const LOG_PREFIX = "[CustomerOrderSummary]";

// ============================================
// TYPES
// ============================================

export interface CustomerOrderSummary {
  customerId: string;
  orderCount: number;
  totalSpent: number;
  totalRefunded: number;
  netSpent: number;
  averageOrderValue: number;
  totalCashbackEarned: number;
  firstOrderDate: Date | null;
  lastOrderDate: Date | null;
  daysSinceLastOrder: number | null;
  activityStatus: "active" | "at_risk" | "dormant" | "new" | "never_ordered";
}

export interface DetailedOrderInfo {
  id: string;
  shopifyOrderId: string;
  shopifyOrderNumber: string;
  shopifyOrderName: string;
  createdAt: Date;
  financialStatus: string;
  fulfillmentStatus: string | null;
  totalPrice: number;
  totalRefunded: number;
  netAmount: number;
  cashbackAmount: number | null;
  cashbackPercent: number | null;
  tierNameAtOrder: string | null;
  lineItemCount: number;
  currency: string;
}

export type ActivityStatus = CustomerOrderSummary["activityStatus"];

// Activity thresholds (in days)
const ACTIVITY_THRESHOLDS = {
  ACTIVE: 30, // Ordered within 30 days
  AT_RISK: 60, // Ordered 30-60 days ago
  DORMANT: 90, // No order in 60+ days
  NEW_CUSTOMER: 7, // Joined within 7 days
};

// ============================================
// SINGLE CUSTOMER OPERATIONS
// ============================================

/**
 * Get order summary for a single customer
 */
export async function getCustomerOrderSummary(
  shop: string,
  customerId: string
): Promise<CustomerOrderSummary | null> {
  try {
    // Get customer with their order count
    const customer = await db.customer.findFirst({
      where: { id: customerId, shop },
      select: {
        id: true,
        totalSpent: true,
        netSpent: true,
        totalRefunded: true,
        orderCount: true,
        totalCashbackEarned: true,
        firstOrderDate: true,
        lastOrderDate: true,
        createdAt: true,
      },
    });

    if (!customer) {
      return null;
    }

    const totalSpent = Number(customer.totalSpent) || 0;
    const netSpent = Number(customer.netSpent) || 0;
    const totalRefunded = Number(customer.totalRefunded) || 0;
    const orderCount = customer.orderCount || 0;
    const totalCashbackEarned = Number(customer.totalCashbackEarned) || 0;

    const daysSinceLastOrder = customer.lastOrderDate
      ? Math.floor((Date.now() - customer.lastOrderDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const daysSinceCreated = Math.floor(
      (Date.now() - customer.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      customerId: customer.id,
      orderCount,
      totalSpent,
      totalRefunded,
      netSpent,
      averageOrderValue: orderCount > 0 ? totalSpent / orderCount : 0,
      totalCashbackEarned,
      firstOrderDate: customer.firstOrderDate,
      lastOrderDate: customer.lastOrderDate,
      daysSinceLastOrder,
      activityStatus: calculateActivityStatus(daysSinceLastOrder, daysSinceCreated, orderCount),
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting order summary:`, error);
    return null;
  }
}

/**
 * Get detailed order history for a customer (from local database)
 */
export async function getCustomerDetailedOrders(
  shop: string,
  customerId: string,
  options?: {
    limit?: number;
    offset?: number;
    includeLineItems?: boolean;
  }
): Promise<{ orders: DetailedOrderInfo[]; totalCount: number }> {
  try {
    const limit = options?.limit || 25;
    const offset = options?.offset || 0;

    const [orders, totalCount] = await Promise.all([
      db.order.findMany({
        where: { shop, customerId },
        orderBy: { shopifyCreatedAt: "desc" },
        take: limit,
        skip: offset,
        include: options?.includeLineItems
          ? {
              lineItems: {
                select: {
                  id: true,
                  title: true,
                  quantity: true,
                  price: true,
                  totalPrice: true,
                  isTierProduct: true,
                },
              },
            }
          : undefined,
      }),
      db.order.count({ where: { shop, customerId } }),
    ]);

    return {
      orders: orders.map((order) => ({
        id: order.id,
        shopifyOrderId: order.shopifyOrderId,
        shopifyOrderNumber: order.shopifyOrderNumber,
        shopifyOrderName: order.shopifyOrderName,
        createdAt: order.shopifyCreatedAt,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        totalPrice: Number(order.totalPrice),
        totalRefunded: Number(order.totalRefunded),
        netAmount: Number(order.netAmount),
        cashbackAmount: order.cashbackAmount ? Number(order.cashbackAmount) : null,
        cashbackPercent: order.cashbackPercent,
        tierNameAtOrder: order.tierNameAtOrder,
        lineItemCount: (order as any).lineItems?.length || 0,
        currency: order.currency,
      })),
      totalCount,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting detailed orders:`, error);
    return { orders: [], totalCount: 0 };
  }
}

// ============================================
// BATCH OPERATIONS (for list views)
// ============================================

/**
 * Get order summaries for multiple customers efficiently
 * Used in the members list view to show order metrics
 */
export async function getCustomerOrderSummariesBatch(
  shop: string,
  customerIds: string[]
): Promise<Map<string, CustomerOrderSummary>> {
  if (customerIds.length === 0) {
    return new Map();
  }

  try {
    const customers = await db.customer.findMany({
      where: {
        id: { in: customerIds },
        shop,
      },
      select: {
        id: true,
        totalSpent: true,
        netSpent: true,
        totalRefunded: true,
        orderCount: true,
        totalCashbackEarned: true,
        firstOrderDate: true,
        lastOrderDate: true,
        createdAt: true,
      },
    });

    const summaryMap = new Map<string, CustomerOrderSummary>();

    for (const customer of customers) {
      const totalSpent = Number(customer.totalSpent) || 0;
      const netSpent = Number(customer.netSpent) || 0;
      const totalRefunded = Number(customer.totalRefunded) || 0;
      const orderCount = customer.orderCount || 0;
      const totalCashbackEarned = Number(customer.totalCashbackEarned) || 0;

      const daysSinceLastOrder = customer.lastOrderDate
        ? Math.floor((Date.now() - customer.lastOrderDate.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      const daysSinceCreated = Math.floor(
        (Date.now() - customer.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      summaryMap.set(customer.id, {
        customerId: customer.id,
        orderCount,
        totalSpent,
        totalRefunded,
        netSpent,
        averageOrderValue: orderCount > 0 ? totalSpent / orderCount : 0,
        totalCashbackEarned,
        firstOrderDate: customer.firstOrderDate,
        lastOrderDate: customer.lastOrderDate,
        daysSinceLastOrder,
        activityStatus: calculateActivityStatus(daysSinceLastOrder, daysSinceCreated, orderCount),
      });
    }

    return summaryMap;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting batch order summaries:`, error);
    return new Map();
  }
}

// ============================================
// ACTIVITY STATUS HELPERS
// ============================================

/**
 * Calculate customer activity status based on order recency
 */
function calculateActivityStatus(
  daysSinceLastOrder: number | null,
  daysSinceCreated: number,
  orderCount: number
): ActivityStatus {
  // Never ordered
  if (orderCount === 0) {
    // New customer (joined recently) vs never ordered
    if (daysSinceCreated <= ACTIVITY_THRESHOLDS.NEW_CUSTOMER) {
      return "new";
    }
    return "never_ordered";
  }

  // Has orders - check recency
  if (daysSinceLastOrder === null) {
    return "never_ordered";
  }

  if (daysSinceLastOrder <= ACTIVITY_THRESHOLDS.ACTIVE) {
    return "active";
  }

  if (daysSinceLastOrder <= ACTIVITY_THRESHOLDS.AT_RISK) {
    return "at_risk";
  }

  return "dormant";
}

/**
 * Get badge tone for activity status
 */
export function getActivityStatusBadge(status: ActivityStatus): {
  tone: "success" | "warning" | "critical" | "info" | "attention";
  label: string;
} {
  switch (status) {
    case "active":
      return { tone: "success", label: "Active" };
    case "at_risk":
      return { tone: "warning", label: "At Risk" };
    case "dormant":
      return { tone: "critical", label: "Dormant" };
    case "new":
      return { tone: "info", label: "New" };
    case "never_ordered":
      return { tone: "attention", label: "No Orders" };
    default:
      return { tone: "info", label: "Unknown" };
  }
}

// ============================================
// FILTER HELPERS
// ============================================

/**
 * Build where clause for activity-based filtering
 */
export function buildActivityFilterWhereClause(
  shop: string,
  activityFilter: ActivityStatus | "all"
): any {
  const baseWhere: any = { shop };

  if (activityFilter === "all") {
    return baseWhere;
  }

  const now = new Date();

  switch (activityFilter) {
    case "active":
      // Last order within 30 days
      baseWhere.lastOrderDate = {
        gte: new Date(now.getTime() - ACTIVITY_THRESHOLDS.ACTIVE * 24 * 60 * 60 * 1000),
      };
      break;

    case "at_risk":
      // Last order 30-60 days ago
      baseWhere.lastOrderDate = {
        lt: new Date(now.getTime() - ACTIVITY_THRESHOLDS.ACTIVE * 24 * 60 * 60 * 1000),
        gte: new Date(now.getTime() - ACTIVITY_THRESHOLDS.AT_RISK * 24 * 60 * 60 * 1000),
      };
      break;

    case "dormant":
      // Last order more than 60 days ago
      baseWhere.lastOrderDate = {
        lt: new Date(now.getTime() - ACTIVITY_THRESHOLDS.AT_RISK * 24 * 60 * 60 * 1000),
      };
      break;

    case "new":
      // Joined within 7 days, no orders
      baseWhere.orderCount = 0;
      baseWhere.createdAt = {
        gte: new Date(now.getTime() - ACTIVITY_THRESHOLDS.NEW_CUSTOMER * 24 * 60 * 60 * 1000),
      };
      break;

    case "never_ordered":
      // No orders
      baseWhere.orderCount = 0;
      break;
  }

  return baseWhere;
}

// ============================================
// ANALYTICS HELPERS
// ============================================

/**
 * Get activity distribution for shop
 */
export async function getActivityDistribution(
  shop: string
): Promise<Record<ActivityStatus, number>> {
  const now = new Date();
  const activeThreshold = new Date(now.getTime() - ACTIVITY_THRESHOLDS.ACTIVE * 24 * 60 * 60 * 1000);
  const atRiskThreshold = new Date(now.getTime() - ACTIVITY_THRESHOLDS.AT_RISK * 24 * 60 * 60 * 1000);
  const newThreshold = new Date(now.getTime() - ACTIVITY_THRESHOLDS.NEW_CUSTOMER * 24 * 60 * 60 * 1000);

  // Use parallel queries for efficiency
  const [activeCount, atRiskCount, dormantCount, newCount, neverOrderedCount] = await Promise.all([
    db.customer.count({
      where: {
        shop,
        lastOrderDate: { gte: activeThreshold },
      },
    }),
    db.customer.count({
      where: {
        shop,
        lastOrderDate: { lt: activeThreshold, gte: atRiskThreshold },
      },
    }),
    db.customer.count({
      where: {
        shop,
        lastOrderDate: { lt: atRiskThreshold },
      },
    }),
    db.customer.count({
      where: {
        shop,
        orderCount: 0,
        createdAt: { gte: newThreshold },
      },
    }),
    db.customer.count({
      where: {
        shop,
        orderCount: 0,
        createdAt: { lt: newThreshold },
      },
    }),
  ]);

  return {
    active: activeCount,
    at_risk: atRiskCount,
    dormant: dormantCount,
    new: newCount,
    never_ordered: neverOrderedCount,
  };
}
