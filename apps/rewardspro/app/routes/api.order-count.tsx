/**
 * API Endpoint for Order Count
 * Uses DirectDataAPI strategy which is proven to work
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { countOrdersDirectDataAPI, countOrdersWithFallback } from "../utils/order-count-strategies";

// Helper to get current month name
const getCurrentMonthName = () => {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return months[new Date().getMonth()];
};

// Calculate projected orders
const calculateProjectedOrders = (currentOrders: number): number => {
  const now = new Date();
  const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const daysPassed = currentDay;

  if (daysPassed === 0) return currentOrders;

  const dailyRate = currentOrders / daysPassed;
  return Math.ceil(dailyRate * totalDaysInMonth);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    // Authenticate the request
    const { session } = await authenticate.admin(request);

    if (!session?.shop) {
      return json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const shop = url.searchParams.get("shop") || session.shop;

    // Ensure shop matches session for security
    if (shop !== session.shop) {
      return json({ success: false, error: "Shop mismatch" }, { status: 403 });
    }

    // Get current month for filtering
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();

    // Create UTC date range for current month
    const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

    console.log(`[API OrderCount] Counting orders for ${shop} - ${getCurrentMonthName()} ${year}`);
    console.log(`[API OrderCount] Date range: ${startOfMonth.toISOString()} to ${endOfMonth.toISOString()}`);

    let orderCount = 0;
    let strategy = "unknown";

    try {
      // Try DirectDataAPI first (since it's working in V2)
      orderCount = await countOrdersDirectDataAPI(shop, startOfMonth, endOfMonth);
      strategy = "DirectDataAPI";
      console.log(`[API OrderCount] DirectDataAPI succeeded: ${orderCount} orders`);
    } catch (error) {
      console.log("[API OrderCount] DirectDataAPI failed, trying fallback strategies");

      // Fall back to multiple strategies
      const result = await countOrdersWithFallback(shop, startOfMonth, endOfMonth);
      orderCount = result.count;
      strategy = result.strategy;
    }

    // Calculate projected orders
    const projectedOrders = calculateProjectedOrders(orderCount);

    // Determine plan limit (you may want to fetch this from database)
    const planLimit = 1000; // Default, adjust based on actual plan

    return json({
      success: true,
      orderCount,
      projectedOrders,
      planLimit,
      currentMonth: getCurrentMonthName(),
      year,
      month: month + 1, // 1-indexed for display
      strategy,
      dateRange: {
        start: startOfMonth.toISOString(),
        end: endOfMonth.toISOString()
      }
    });

  } catch (error: any) {
    console.error("[API OrderCount] Error:", error);
    return json({
      success: false,
      error: error.message || "Failed to count orders"
    }, { status: 500 });
  }
};