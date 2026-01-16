/**
 * Points Redemption API
 *
 * Handles customer points redemption for discount codes.
 * Used by both the theme widget and customer account extension.
 *
 * Endpoint: POST /api/customer-account/points/redeem
 *
 * @security Requires authenticated customer account session
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { redeemPoints, getRedemptionTier } from "~/services/points-redemption.server";
import db from "~/db.server";

// CORS headers for customer account extension
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

export async function action({ request }: ActionFunctionArgs) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json(
      { success: false, error: "Method not allowed" },
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    // Authenticate customer account session
    const { sessionToken } = await authenticate.public.customerAccount(request);

    // Extract customer info from session token
    const claims = sessionToken as { sub?: string; dest?: string };
    const shopifyCustomerGid = claims?.sub;
    const shopDomain = claims?.dest?.replace("https://", "").replace("http://", "");

    if (!shopifyCustomerGid || !shopDomain) {
      return json(
        { success: false, error: "Invalid session token" },
        { status: 401, headers: corsHeaders }
      );
    }

    // Extract Shopify customer ID from GID (e.g., "gid://shopify/Customer/123456")
    const shopifyCustomerId = shopifyCustomerGid.split("/").pop();
    if (!shopifyCustomerId) {
      return json(
        { success: false, error: "Invalid customer ID" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Parse request body
    const body = await request.json();
    const { tierId } = body as { tierId?: string };

    if (!tierId) {
      return json(
        { success: false, error: "tierId is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Find customer in database
    const customer = await db.customer.findFirst({
      where: {
        shop: shopDomain,
        shopifyCustomerId: shopifyCustomerId,
      },
      select: { id: true, pointsBalance: true, email: true, firstName: true },
    });

    if (!customer) {
      return json(
        { success: false, error: "Customer not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Get the redemption tier
    const tier = await getRedemptionTier(shopDomain, tierId);
    if (!tier) {
      return json(
        { success: false, error: "Redemption tier not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    if (!tier.isActive) {
      return json(
        { success: false, error: "Redemption tier is not active" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check customer has sufficient points
    const currentBalance = Number(customer.pointsBalance || 0);
    if (currentBalance < tier.pointsCost) {
      return json(
        {
          success: false,
          error: "Insufficient points",
          required: tier.pointsCost,
          available: currentBalance,
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Perform the redemption
    const result = await redeemPoints(shopDomain, customer.id, tierId);

    if (!result.success) {
      return json(
        { success: false, error: result.error || "Redemption failed" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Return success with discount code
    return json(
      {
        success: true,
        discountCode: result.discountCode,
        discountValue: result.discountAmount,
        discountType: result.discountType?.toLowerCase().replace("_discount", ""),
        expiresAt: result.expiresAt?.toISOString(),
        pointsSpent: result.pointsSpent,
        remainingBalance: result.remainingBalance,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("[PointsRedeem] Error:", error);

    // Handle authentication errors
    if (error.message?.includes("authentication") || error.message?.includes("token")) {
      return json(
        { success: false, error: "Authentication failed" },
        { status: 401, headers: corsHeaders }
      );
    }

    return json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Handle GET requests with an error
export async function loader() {
  return json(
    { success: false, error: "Use POST method to redeem points" },
    { status: 405, headers: corsHeaders }
  );
}
