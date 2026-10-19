/**
 * Orders/Cancelled Webhook Handler
 *
 * This webhook triggers when an order is cancelled in Shopify.
 * It updates the order's financialStatus in our database.
 *
 * Note: This is different from refunds. A cancelled order may or may
 * not have been paid. Money returned on cancellation arrives as its own
 * refunds/create delivery (webhooks.orders.refunded.tsx), which reverses the
 * cashback, so this handler never touches cashback and the two webhooks can
 * arrive in either order.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { lockOrder } from "../services/cashback-ledger.server";
import { updateCustomerToEffectiveTier } from "../services/tier-resolution.server";

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

  // Throws a 401 Response for a delivery that Shopify did not sign
  const { topic, shop, payload } = await authenticate.webhook(request);

  try {
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

    // Map the financial status from Shopify to valid OrderFinancialStatus enum values
    // Valid values: PENDING, AUTHORIZED, PARTIALLY_PAID, PAID, PARTIALLY_REFUNDED, REFUNDED, VOIDED
    type OrderFinancialStatusType = "PENDING" | "AUTHORIZED" | "PARTIALLY_PAID" | "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED" | "VOIDED";

    let reportedFinancialStatus: OrderFinancialStatusType;
    switch (order.financial_status?.toLowerCase()) {
      case "voided":
        reportedFinancialStatus = "VOIDED";
        break;
      case "refunded":
        reportedFinancialStatus = "REFUNDED";
        break;
      case "partially_refunded":
        reportedFinancialStatus = "PARTIALLY_REFUNDED";
        break;
      case "paid":
        // Cancelled but payment was captured - will be refunded separately
        reportedFinancialStatus = "PAID";
        break;
      case "pending":
        reportedFinancialStatus = "PENDING";
        break;
      case "authorized":
        // Payment was authorized but not captured - now voided
        reportedFinancialStatus = "VOIDED";
        break;
      case "partially_paid":
        reportedFinancialStatus = "PARTIALLY_PAID";
        break;
      default:
        // For unknown statuses, default to VOIDED since order is cancelled
        reportedFinancialStatus = "VOIDED";
    }

    // Read and update the order under its row lock: refunds/create writes its
    // refund totals concurrently (services/refund-handler.server.ts)
    const cancelled = await prisma.$transaction(async (tx) => {
      const orderRef = await tx.order.findFirst({ where: { shop, shopifyOrderId }, select: { id: true } });
      if (!orderRef) return null;
      await lockOrder(tx, orderRef.id);
      const existingOrder = await tx.order.findUniqueOrThrow({
        where: { id: orderRef.id },
        select: {
          id: true,
          financialStatus: true,
          fulfillmentStatus: true,
          shopifyOrderNumber: true,
          totalPrice: true,
          totalRefunded: true,
          customerId: true,
        },
      });

      // refunds/create may have arrived first: never report less refunded than
      // the refunds already recorded against the order
      let newFinancialStatus = reportedFinancialStatus;
      if (existingOrder.totalRefunded.gt(0)) {
        if (existingOrder.totalRefunded.gte(existingOrder.totalPrice)) {
          newFinancialStatus = "REFUNDED";
        } else if (newFinancialStatus !== "REFUNDED") {
          newFinancialStatus = "PARTIALLY_REFUNDED";
        }
      }

      // Update the order - mark as cancelled
      // Note: Order model doesn't have cancelledAt/cancelReason fields
      // Those details are logged but not persisted
      await tx.order.update({
        where: { id: existingOrder.id },
        data: {
          financialStatus: newFinancialStatus,
          fulfillmentStatus: "CANCELLED",
          shopifyUpdatedAt: new Date(order.updated_at),
          updatedAt: new Date(),
        },
      });
      return { existingOrder, newFinancialStatus };
    });

    if (!cancelled) {
      // Order not in our database
      console.log(`[OrdersCancelled] Order ${shopifyOrderId} not found in database, skipping`);
      return json({
        success: true,
        message: "Order not found - may not be synced yet",
      });
    }

    const { existingOrder, newFinancialStatus } = cancelled;
    const previousFinancialStatus = existingOrder.financialStatus;
    const previousFulfillmentStatus = existingOrder.fulfillmentStatus;

    console.log(`[OrdersCancelled] Updated order #${existingOrder.shopifyOrderNumber}:`);
    console.log(`[OrdersCancelled]   Financial: ${previousFinancialStatus} -> ${newFinancialStatus}`);
    console.log(`[OrdersCancelled]   Fulfillment: ${previousFulfillmentStatus} -> CANCELLED`);

    // Re-evaluate tier to update CustomerTierState
    // This ensures the widget shows correct tier even if no refund webhook fires
    // (e.g., order cancelled before payment was captured)
    if (existingOrder.customerId) {
      try {
        await updateCustomerToEffectiveTier(shop, existingOrder.customerId, {
          triggeredBy: 'order_cancelled',
          orderId: existingOrder.id
        });
        console.log(`[OrdersCancelled] Re-evaluated tier for customer ${existingOrder.customerId}`);
      } catch (tierError) {
        // Log but don't fail the webhook - tier update is not critical
        console.error(`[OrdersCancelled] Failed to re-evaluate tier:`, tierError);
      }
    }

    console.log("=".repeat(60) + "\n");

    return json({
      success: true,
      message: "Order cancellation processed",
      orderId: existingOrder.id,
      orderNumber: existingOrder.shopifyOrderNumber,
      previousFinancialStatus,
      newFinancialStatus,
      cancelReason: order.cancel_reason,
    });
  } catch (error) {
    console.error("[OrdersCancelled] Error processing webhook:", error);

    // 5xx makes Shopify redeliver; the status update is idempotent
    return json({ success: false, error: "Cancellation processing failed" }, { status: 500 });
  }
}

// No GET method - webhooks are POST only
export async function loader() {
  return json({ message: "Webhook endpoint - POST only" }, { status: 405 });
}
