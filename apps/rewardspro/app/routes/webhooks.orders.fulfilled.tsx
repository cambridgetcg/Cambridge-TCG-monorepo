/**
 * Orders/Fulfilled Webhook Handler
 *
 * This webhook triggers when an order is fulfilled in Shopify.
 * It updates the order's fulfillmentStatus in our database.
 *
 * Prevents stale data where orders show as "unfulfilled" even
 * after merchant has shipped/fulfilled them in Shopify.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

interface FulfillmentWebhook {
  id: number;
  order_id: number;
  status: string; // "pending", "open", "success", "cancelled", "error", "failure"
  shipment_status: string | null;
  created_at: string;
  updated_at: string;
  tracking_company: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  tracking_numbers: string[];
  tracking_urls: string[];
  receipt: any;
  name: string; // e.g., "#1001.1"
  line_items: Array<{
    id: number;
    variant_id: number;
    title: string;
    quantity: number;
    sku: string | null;
  }>;
}

export async function action({ request }: ActionFunctionArgs) {
  console.log("\n" + "=".repeat(60));
  console.log("WEBHOOK: ORDERS/FULFILLED");
  console.log("=".repeat(60));

  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    if (topic !== "ORDERS_FULFILLED") {
      console.log(`[OrdersFulfilled] Unexpected topic: ${topic}`);
      return json({ success: false, error: "Invalid topic" }, { status: 400 });
    }

    const fulfillment = payload as FulfillmentWebhook;
    const shopifyOrderId = String(fulfillment.order_id);

    console.log(`[OrdersFulfilled] Processing fulfillment for order ${shopifyOrderId} from ${shop}`);
    console.log(`[OrdersFulfilled] Fulfillment ID: ${fulfillment.id}`);
    console.log(`[OrdersFulfilled] Status: ${fulfillment.status}`);
    console.log(`[OrdersFulfilled] Items fulfilled: ${fulfillment.line_items?.length || 0}`);

    // Find the order in our database
    const order = await db.order.findFirst({
      where: {
        shop,
        shopifyOrderId,
      },
      select: {
        id: true,
        fulfillmentStatus: true,
        orderNumber: true,
      },
    });

    if (!order) {
      // Order not in our database yet - could be from before app install
      // or order sync hasn't processed it yet
      console.log(`[OrdersFulfilled] Order ${shopifyOrderId} not found in database, skipping`);
      return json({
        success: true,
        message: "Order not found - may not be synced yet",
      });
    }

    const previousStatus = order.fulfillmentStatus;

    // Map fulfillment status to our format
    // Shopify webhook sends fulfillment record status, we need to determine overall order status
    // For now, we'll update to the fulfillment status
    // Note: Partial fulfillments would need additional logic to track remaining items
    let newFulfillmentStatus: string;

    switch (fulfillment.status) {
      case "success":
        newFulfillmentStatus = "FULFILLED";
        break;
      case "pending":
      case "open":
        newFulfillmentStatus = "IN_PROGRESS";
        break;
      case "cancelled":
        newFulfillmentStatus = "RESTOCKED";
        break;
      case "error":
      case "failure":
        newFulfillmentStatus = "PENDING";
        break;
      default:
        newFulfillmentStatus = fulfillment.status?.toUpperCase() || "UNKNOWN";
    }

    // Update the order
    await db.order.update({
      where: { id: order.id },
      data: {
        fulfillmentStatus: newFulfillmentStatus,
        updatedAt: new Date(),
      },
    });

    console.log(`[OrdersFulfilled] Updated order #${order.orderNumber}: ${previousStatus} -> ${newFulfillmentStatus}`);

    // Optionally track tracking info if we want to store it
    if (fulfillment.tracking_number || fulfillment.tracking_url) {
      console.log(`[OrdersFulfilled] Tracking: ${fulfillment.tracking_company || "Unknown"} - ${fulfillment.tracking_number || "N/A"}`);
    }

    console.log("=".repeat(60) + "\n");

    return json({
      success: true,
      message: "Fulfillment status updated",
      orderId: order.id,
      orderNumber: order.orderNumber,
      previousStatus,
      newStatus: newFulfillmentStatus,
    });
  } catch (error) {
    console.error("[OrdersFulfilled] Error processing webhook:", error);

    // Return 200 to prevent Shopify from retrying for transient errors
    return json({
      success: true,
      warning: "Error processing webhook",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// No GET method - webhooks are POST only
export async function loader() {
  return json({ message: "Webhook endpoint - POST only" }, { status: 405 });
}
