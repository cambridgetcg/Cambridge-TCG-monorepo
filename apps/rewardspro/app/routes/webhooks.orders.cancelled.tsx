/**
 * Orders/Cancelled Webhook Handler
 *
 * This webhook triggers when an order is cancelled in Shopify.
 * It updates the order's financialStatus in our database.
 *
 * Note: This is different from refunds. A cancelled order may or may
 * not have been paid. If it was paid, a refund webhook will also fire.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

interface CancelledOrderWebhook {
  id: number;
  email?: string;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null; // "customer", "fraud", "inventory", "declined", "other"
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  currency: string;
  customer?: {
    id: number;
    email: string;
  };
}

export async function action({ request }: ActionFunctionArgs) {
  console.log("\n" + "=".repeat(60));
  console.log("WEBHOOK: ORDERS/CANCELLED");
  console.log("=".repeat(60));

  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    if (topic !== "ORDERS_CANCELLED") {
      console.log(`[OrdersCancelled] Unexpected topic: ${topic}`);
      return json({ success: false, error: "Invalid topic" }, { status: 400 });
    }

    const order = payload as CancelledOrderWebhook;
    const shopifyOrderId = String(order.id);

    console.log(`[OrdersCancelled] Processing cancellation for order ${shopifyOrderId} from ${shop}`);
    console.log(`[OrdersCancelled] Cancel reason: ${order.cancel_reason || "Not specified"}`);
    console.log(`[OrdersCancelled] Financial status: ${order.financial_status}`);
    console.log(`[OrdersCancelled] Cancelled at: ${order.cancelled_at}`);

    // Find the order in our database
    const existingOrder = await db.order.findFirst({
      where: {
        shop,
        shopifyOrderId,
      },
      select: {
        id: true,
        financialStatus: true,
        fulfillmentStatus: true,
        orderNumber: true,
        cashbackProcessed: true,
        cashbackAmount: true,
        customerId: true,
      },
    });

    if (!existingOrder) {
      // Order not in our database
      console.log(`[OrdersCancelled] Order ${shopifyOrderId} not found in database, skipping`);
      return json({
        success: true,
        message: "Order not found - may not be synced yet",
      });
    }

    const previousFinancialStatus = existingOrder.financialStatus;
    const previousFulfillmentStatus = existingOrder.fulfillmentStatus;

    // Map the financial status from Shopify to valid OrderFinancialStatus enum values
    // Valid values: PENDING, AUTHORIZED, PARTIALLY_PAID, PAID, PARTIALLY_REFUNDED, REFUNDED, VOIDED
    type OrderFinancialStatusType = "PENDING" | "AUTHORIZED" | "PARTIALLY_PAID" | "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED" | "VOIDED";

    let newFinancialStatus: OrderFinancialStatusType;
    switch (order.financial_status?.toLowerCase()) {
      case "voided":
        newFinancialStatus = "VOIDED";
        break;
      case "refunded":
        newFinancialStatus = "REFUNDED";
        break;
      case "partially_refunded":
        newFinancialStatus = "PARTIALLY_REFUNDED";
        break;
      case "paid":
        // Cancelled but payment was captured - will be refunded separately
        newFinancialStatus = "PAID";
        break;
      case "pending":
        newFinancialStatus = "PENDING";
        break;
      case "authorized":
        // Payment was authorized but not captured - now voided
        newFinancialStatus = "VOIDED";
        break;
      case "partially_paid":
        newFinancialStatus = "PARTIALLY_PAID";
        break;
      default:
        // For unknown statuses, default to VOIDED since order is cancelled
        newFinancialStatus = "VOIDED";
    }

    // Update the order - mark as cancelled
    // Note: Order model doesn't have cancelledAt/cancelReason fields
    // Those details are logged but not persisted
    await db.order.update({
      where: { id: existingOrder.id },
      data: {
        financialStatus: newFinancialStatus,
        fulfillmentStatus: "CANCELLED",
        shopifyUpdatedAt: new Date(order.updated_at),
        updatedAt: new Date(),
      },
    });

    console.log(`[OrdersCancelled] Updated order #${existingOrder.orderNumber}:`);
    console.log(`[OrdersCancelled]   Financial: ${previousFinancialStatus} -> ${newFinancialStatus}`);
    console.log(`[OrdersCancelled]   Fulfillment: ${previousFulfillmentStatus} -> CANCELLED`);

    // Note: Cashback clawback is handled by the refund webhook if a refund was issued
    // The cancelled webhook just updates the status
    if (existingOrder.cashbackProcessed && existingOrder.cashbackAmount > 0) {
      console.log(`[OrdersCancelled] Note: Order had ${existingOrder.cashbackAmount} cashback processed`);
      console.log(`[OrdersCancelled] Refund webhook will handle clawback if payment was refunded`);
    }

    console.log("=".repeat(60) + "\n");

    return json({
      success: true,
      message: "Order cancellation processed",
      orderId: existingOrder.id,
      orderNumber: existingOrder.orderNumber,
      previousFinancialStatus,
      newFinancialStatus,
      cancelReason: order.cancel_reason,
    });
  } catch (error) {
    console.error("[OrdersCancelled] Error processing webhook:", error);

    // Return 200 to prevent Shopify from retrying
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
