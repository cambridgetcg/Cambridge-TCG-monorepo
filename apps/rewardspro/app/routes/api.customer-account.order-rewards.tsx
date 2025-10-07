/**
 * Customer Account UI Extension API - Order Rewards Endpoint
 *
 * This endpoint provides order-specific reward information for display
 * on the order status page in the Customer Account UI Extension.
 *
 * Shows:
 * - Cashback earned from this order
 * - Points earned
 * - Tier upgrade if applicable
 *
 * AUTHENTICATION:
 * - Uses authenticate.public.customerAccount() for session token validation
 * - Customer ID and shop verified from JWT
 *
 * USAGE:
 * - Called from order-status.block.render extension target
 * - Displays reward summary after order is paid
 */

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { formatCurrency } from "~/utils/currency";

interface OrderRewardsResponse {
  success: boolean;
  rewards?: {
    cashbackEarned: number;
    cashbackEarnedFormatted: string;
    pointsEarned: number;
    tierUpgrade?: {
      previousTier: string;
      newTier: string;
      newCashbackRate: number;
    };
    orderTotal: number;
    orderTotalFormatted: string;
  };
  message?: string;
}

export async function action({ request }: ActionFunctionArgs) {
  const startTime = Date.now();

  try {
    // Authenticate session token
    const { session } = await authenticate.public.customerAccount(request);

    if (!session) {
      return json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const customerGid = session.id;
    const customerId = customerGid.split('/').pop();
    const shop = session.shop;

    // Parse request body
    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return json(
        { success: false, message: "Order ID required" },
        { status: 400 }
      );
    }

    console.log(`Fetching order rewards for order ${orderId}, customer ${customerId}, shop ${shop}`);

    // Get customer
    const customer = await db.customer.findFirst({
      where: {
        shopifyCustomerId: customerId,
        shop: shop,
      },
    });

    if (!customer) {
      return json({
        success: true,
        message: "Not enrolled in rewards program",
      });
    }

    // Get shop settings for currency formatting
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop },
    });

    // Extract numeric order ID from GID if needed
    const numericOrderId = orderId.includes('/')
      ? orderId.split('/').pop()
      : orderId;

    // Find cashback transaction for this order
    const cashbackTransaction = await db.storeCreditLedger.findFirst({
      where: {
        customerId: customer.id,
        shop: shop,
        type: "CASHBACK_EARNED",
        shopifyOrderId: numericOrderId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!cashbackTransaction) {
      // No cashback yet (order might not be processed yet)
      return json({
        success: true,
        message: "Reward pending processing",
      });
    }

    // Get transaction metadata
    const metadata = cashbackTransaction.metadata as any;
    const cashbackAmount = typeof cashbackTransaction.amount === 'object'
      ? cashbackTransaction.amount.toNumber()
      : Number(cashbackTransaction.amount);

    const orderTotal = metadata?.orderTotal || metadata?.orderAmount || 0;

    // Check if this order resulted in a tier upgrade
    let tierUpgrade = undefined;
    if (metadata?.tierUpgrade) {
      tierUpgrade = {
        previousTier: metadata.previousTier || 'Previous Tier',
        newTier: metadata.newTier || 'New Tier',
        newCashbackRate: metadata.newCashbackRate || 0,
      };
    }

    const response: OrderRewardsResponse = {
      success: true,
      rewards: {
        cashbackEarned: cashbackAmount,
        cashbackEarnedFormatted: formatCurrency(cashbackAmount, shopSettings),
        pointsEarned: metadata?.pointsEarned || 0,
        tierUpgrade,
        orderTotal: parseFloat(orderTotal) || 0,
        orderTotalFormatted: formatCurrency(parseFloat(orderTotal) || 0, shopSettings),
      },
    };

    console.log(`Order rewards fetched successfully for order ${orderId}`);

    return json(response, {
      headers: {
        "Cache-Control": "private, max-age=300", // Cache for 5 minutes
        "X-Response-Time": `${Date.now() - startTime}ms`,
      },
    });

  } catch (error) {
    console.error("Order rewards API error:", error);

    return json(
      {
        success: false,
        message: "Unable to load order rewards",
      },
      {
        status: 500,
        headers: {
          "X-Response-Time": `${Date.now() - startTime}ms`,
        },
      }
    );
  }
}

// Handle OPTIONS for CORS
export async function loader({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  return json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST, OPTIONS" } }
  );
}
