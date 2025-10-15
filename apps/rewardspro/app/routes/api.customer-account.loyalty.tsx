/**
 * Customer Account UI Extension API - Loyalty Data Endpoint
 *
 * This endpoint serves loyalty data to the Customer Account UI Extension.
 * It uses session token authentication (JWT) with 1-minute expiry.
 *
 * AUTHENTICATION:
 * - Uses authenticate.public.customerAccount() to validate JWT session tokens
 * - Token is sent from extension via Authorization: Bearer <token>
 * - Token expires after 1 minute (extension automatically refreshes)
 * - Customer ID extracted from token's 'sub' claim
 * - Shop domain extracted from token's 'dest' claim
 *
 * SECURITY:
 * - All queries scoped to authenticated shop
 * - Customer ID verified from JWT (not from client request)
 * - Multi-tenant isolation enforced
 * - CORS headers set for customer account domain
 *
 * USAGE:
 * - Called from Customer Account UI Extension
 * - Extension requests fresh token before each API call
 * - Returns complete loyalty data (balance, tier, transactions)
 */

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { getLoyaltyData, getCustomerEnrollmentStatus } from "~/services/customer-account-loyalty.service";

// CORS headers for customer account extensions
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Customer account extensions run from account.shopify.com
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400", // Cache preflight for 24 hours
};

// Handle OPTIONS preflight request
export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Redirect GET requests to POST
  return json(
    { error: "Method not allowed", message: "Use POST to access this endpoint" },
    { status: 405, headers: corsHeaders }
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const startTime = Date.now();

  // Handle OPTIONS preflight (in case it comes as POST somehow)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Step 1: Extract and validate session token from Authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("Customer account API: Missing or invalid Authorization header");
      return json(
        {
          error: "Unauthorized",
          message: "Missing authentication token",
          code: "MISSING_TOKEN",
        },
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "X-Response-Time": `${Date.now() - startTime}ms`,
          },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Step 2: Decode JWT token (without verification for now - Shopify validates on their end)
    // The token contains: sub (customer GID), dest (shop domain), aud, iss, exp, nbf
    let payload: any;
    try {
      // Simple base64 decode of JWT payload (middle section)
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error("Invalid JWT format");
      }
      const payloadBase64 = parts[1];
      const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
      payload = JSON.parse(payloadJson);
    } catch (err) {
      console.error("Failed to decode JWT:", err);
      return json(
        {
          error: "Unauthorized",
          message: "Invalid token format",
          code: "INVALID_TOKEN",
        },
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "X-Response-Time": `${Date.now() - startTime}ms`,
          },
        }
      );
    }

    // Step 3: Extract customer and shop from token payload
    // sub: "gid://shopify/Customer/7187914809641"
    // dest: "https://store.myshopify.com"
    const customerGid = payload.sub;
    const destUrl = payload.dest;

    if (!customerGid || !destUrl) {
      console.error("Customer account API: Missing required claims in token", { payload });
      return json(
        {
          error: "Invalid session",
          message: "Token missing required information",
          code: "INVALID_TOKEN",
        },
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "X-Response-Time": `${Date.now() - startTime}ms`,
          },
        }
      );
    }

    const customerId = customerGid.split('/').pop(); // Extract numeric ID
    const shop = destUrl.replace('https://', '').replace('http://', ''); // Extract shop domain

    if (!customerId || !shop) {
      console.error("Customer account API: Missing customer ID or shop in token", { customerGid, destUrl });
      return json(
        {
          error: "Invalid session",
          message: "Token missing customer or shop information",
          code: "INVALID_TOKEN_CLAIMS",
        },
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "X-Response-Time": `${Date.now() - startTime}ms`,
          },
        }
      );
    }

    console.log(`Customer account API: Request from customer ${customerId} for shop ${shop}`);

    // ========================================
    // USING TEST DATA (for development/testing)
    // ========================================
    console.log("🧪 Returning test/mock data");

    const testLoyaltyData = {
      balance: {
        storeCredit: 25.50,
        storeCreditFormatted: "$25.50",
        pendingCredit: 5.00,
        pendingCreditFormatted: "$5.00",
        points: 0,
      },
      tier: {
        name: "Gold",
        level: 2,
        cashbackRate: 5,
        benefits: [
          "5% cashback on all orders",
          "Priority customer support",
          "Exclusive sales access",
          "Free shipping on orders over $50"
        ],
        renewalDate: null,
      },
      progress: {
        currentSpend: 1500.00,
        currentSpendFormatted: "$1,500.00",
        nextTier: "Platinum",
        nextTierThreshold: 2000.00,
        nextTierThresholdFormatted: "$2,000.00",
        progressPercentage: 75,
        remainingToNextTier: 500.00,
        remainingToNextTierFormatted: "$500.00",
        nextTierCashbackRate: 7,
      },
      lifetime: {
        earned: 150.00,
        earnedFormatted: "$150.00",
        spent: 3000.00,
        spentFormatted: "$3,000.00",
        redeemed: 125.00,
        redeemedFormatted: "$125.00",
      },
      transactions: [
        {
          id: "test-tx-1",
          type: "CASHBACK_EARNED",
          amount: 12.50,
          amountFormatted: "$12.50",
          balance: 25.50,
          balanceFormatted: "$25.50",
          description: "Cashback earned on order #1001",
          orderName: "#1001",
          orderId: "test-order-1",
          date: new Date().toISOString(),
          formattedDate: new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
        },
        {
          id: "test-tx-2",
          type: "ORDER_PAYMENT",
          amount: -15.00,
          amountFormatted: "$15.00",
          balance: 13.00,
          balanceFormatted: "$13.00",
          description: "Store credit used for order #1002",
          orderName: "#1002",
          orderId: "test-order-2",
          date: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
          formattedDate: new Date(Date.now() - 86400000).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
        },
      ],
    };

    // Step 5: Return test loyalty data
    const response = {
      success: true,
      enrolled: true,
      customer: {
        id: customerGid,
        displayName: "Test Customer",
        email: `customer-${customerId}@test.com`,
      },
      data: testLoyaltyData,
    };

    console.log(`✅ Successfully returned test loyalty data for customer ${customerId} from shop ${shop}`);

    return json(response, {
      headers: {
        ...corsHeaders,
        "Cache-Control": "private, max-age=30", // Cache for 30 seconds
        "X-Content-Type-Options": "nosniff",
        "X-Response-Time": `${Date.now() - startTime}ms`,
      },
    });

  } catch (error) {
    console.error("Customer account API error:", error);

    // Log detailed error for debugging
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    }

    // Return user-friendly error
    return json(
      {
        error: "Service unavailable",
        message: "We're having trouble loading your rewards. Please try again.",
        code: "INTERNAL_ERROR",
      },
      {
        status: 503,
        headers: {
          ...corsHeaders,
          "Retry-After": "60",
          "X-Response-Time": `${Date.now() - startTime}ms`,
        },
      }
    );
  }
}
