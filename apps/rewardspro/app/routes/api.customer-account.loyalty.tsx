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
    // Step 1: Authenticate using session token
    // This validates the JWT token sent from the Customer Account UI Extension
    const { session } = await authenticate.public.customerAccount(request);

    if (!session) {
      console.log("Customer account API: No valid session (invalid or expired token)");
      return json(
        {
          error: "Unauthorized",
          message: "Invalid or expired session token",
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

    // Step 2: Extract customer and shop from verified token
    // session.id contains the customer's Global ID: "gid://shopify/Customer/7187914809641"
    // session.shop contains the shop domain: "test-store.myshopify.com"
    const customerGid = session.id;
    const customerId = customerGid.split('/').pop(); // Extract numeric ID
    const shop = session.shop;

    if (!customerId || !shop) {
      console.error("Customer account API: Missing customer ID or shop in session", { session });
      return json(
        {
          error: "Invalid session",
          message: "Session token missing required claims",
          code: "INVALID_SESSION",
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

    // Step 3: Check if customer is enrolled
    const enrollmentStatus = await getCustomerEnrollmentStatus({
      shop,
      customerId,
    });

    if (!enrollmentStatus.enrolled) {
      console.log(`Customer ${customerId} not enrolled in rewards for shop ${shop}`);
      return json(
        {
          success: true,
          enrolled: false,
          message: "Join our rewards program to start earning cashback!",
          benefits: [
            "Earn cashback on every purchase",
            "Unlock exclusive member tiers",
            "Get personalized rewards",
          ],
        },
        {
          headers: {
            "Cache-Control": "private, max-age=60",
            "X-Response-Time": `${Date.now() - startTime}ms`,
          },
        }
      );
    }

    // Step 4: Fetch loyalty data using shared service
    const loyaltyData = await getLoyaltyData({
      shop,
      customerId,
    });

    if (!loyaltyData) {
      console.error(`Failed to fetch loyalty data for customer ${customerId}`);
      return json(
        {
          error: "Data unavailable",
          message: "Unable to load rewards data",
          code: "DATA_ERROR",
        },
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "X-Response-Time": `${Date.now() - startTime}ms`,
          },
        }
      );
    }

    // Step 5: Return loyalty data with customer info
    const response = {
      success: true,
      enrolled: true,
      customer: {
        id: customerGid,
        displayName: enrollmentStatus.customer.displayName,
        email: enrollmentStatus.customer.email,
      },
      data: loyaltyData,
    };

    console.log(`Successfully fetched loyalty data for customer ${customerId} from shop ${shop}`);

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
