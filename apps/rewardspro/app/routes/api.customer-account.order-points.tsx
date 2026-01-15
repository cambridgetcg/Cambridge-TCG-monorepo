/**
 * Customer Account API - Order Points Endpoint
 *
 * Returns points earned for a specific order
 * Used by order status page extension
 *
 * Authentication: Session token from customer account extension
 *
 * SECURITY: Order ownership verification added to prevent cross-customer data access.
 * See CUSTOMER_SECURITY_AUDIT.md for vulnerability details.
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Authenticate the request (validates session token)
    const { session, sessionToken } = await authenticate.public.customerAccount(request);

    if (!session) {
      return json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const shop = session.shop;

    // SECURITY: Extract authenticated customer ID from JWT token
    // Format: gid://shopify/Customer/123456
    const shopifyCustomerGid = sessionToken?.sub;
    const shopifyCustomerId = shopifyCustomerGid?.split('/').pop();

    if (!shopifyCustomerId) {
      console.warn('[OrderPoints] Missing customer ID in session token');
      return json(
        { error: "Customer authentication failed" },
        { status: 401 }
      );
    }

    // SECURITY: Look up the authenticated customer in our database
    const authenticatedCustomer = await db.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId,
      },
      select: { id: true }
    });

    if (!authenticatedCustomer) {
      // Customer not enrolled in loyalty program
      return json({
        orderId: null,
        pointsEarned: 0,
        cashbackPercent: 0,
        orderTotal: 0,
        message: "Customer not enrolled in loyalty program"
      });
    }

    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId");

    // Validate required parameter
    if (!orderId) {
      return json(
        { error: "Missing required parameter: orderId" },
        { status: 400 }
      );
    }

    // Extract numeric order ID from Shopify GID
    // Format: gid://shopify/Order/123456
    const orderIdMatch = orderId.match(/\/Order\/(\d+)$/);
    const numericOrderId = orderIdMatch ? orderIdMatch[1] : orderId;

    // SECURITY: Find order in our database with OWNERSHIP VERIFICATION
    // Only return data if the order belongs to the authenticated customer
    const ledgerEntry = await db.storeCreditLedger.findFirst({
      where: {
        shop,
        shopifyOrderId: numericOrderId,
        type: 'CASHBACK_EARNED',
        // SECURITY: Verify order belongs to authenticated customer
        customerId: authenticatedCustomer.id,
      },
      select: {
        amount: true,
        metadata: true,
        customerId: true,
        customer: {
          select: {
            currentTier: {
              select: {
                cashbackPercent: true
              }
            }
          }
        }
      }
    });

    if (!ledgerEntry) {
      // No points recorded for this order yet
      // This could be because:
      // 1. Order not yet fulfilled
      // 2. Order total was $0
      // 3. Points not yet calculated
      return json({
        orderId,
        pointsEarned: 0,
        cashbackPercent: 0,
        orderTotal: 0,
        message: "Points will be credited once your order is fulfilled"
      });
    }

    // Convert Decimal to number
    const pointsEarned = typeof ledgerEntry.amount === 'object' && 'toNumber' in ledgerEntry.amount
      ? (ledgerEntry.amount as any).toNumber()
      : Number(ledgerEntry.amount);

    // Get cashback rate from tier or metadata
    const cashbackPercent = ledgerEntry.customer?.currentTier?.cashbackPercent || 5;

    // Calculate order total from points and cashback rate
    const orderTotal = cashbackPercent > 0 ? (pointsEarned / (cashbackPercent / 100)) : 0;

    return json({
      orderId,
      pointsEarned,
      cashbackPercent,
      orderTotal: parseFloat(orderTotal.toFixed(2))
    });

  } catch (error) {
    console.error("Error fetching order points:", error);

    return json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
