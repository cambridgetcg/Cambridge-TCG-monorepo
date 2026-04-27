import { db } from "@/lib/db";
import { orders, orderItems, cards, clients, notifications } from "@/lib/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { resend, notificationFrom } from "./resend";
import {
  quoteReady,
  orderConfirmed,
  orderShipped,
  orderDelivered,
  newOrderAdmin,
} from "./templates";
import type { OrderData, OrderItemData, ClientData } from "./templates";

type NotificationType =
  | "quote_ready"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "new_order";

export async function sendOrderEmail(
  orderId: number,
  type: NotificationType,
): Promise<void> {
  let recipient = "";

  try {
    // 1. Fetch order
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new Error(`Order #${orderId} not found`);
    }

    // 2. Fetch client
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, order.clientId))
      .limit(1);

    if (!client) {
      throw new Error(`Client #${order.clientId} not found for order #${orderId}`);
    }

    const orderData: OrderData = {
      id: order.id,
      total: order.total,
      volumeDiscount: order.volumeDiscount,
      quotedExpiresAt: order.quotedExpiresAt,
      notes: order.notes,
    };

    const clientData: ClientData = {
      name: client.name,
      email: client.email,
      company: client.company,
    };

    // 3. Determine recipient
    if (type === "new_order") {
      const [admin] = await db
        .select()
        .from(clients)
        .where(eq(clients.role, "admin"))
        .orderBy(asc(clients.createdAt))
        .limit(1);
      recipient = admin?.email ?? client.email;
    } else {
      recipient = client.email;
    }

    // 4. Build email from the right template
    let subject: string;
    let html: string;

    switch (type) {
      case "quote_ready": {
        const items = await db
          .select({
            cardNumber: cards.cardNumber,
            cardName: cards.name,
            quantity: orderItems.quantity,
            unitPrice: orderItems.unitPrice,
            lineTotal: orderItems.lineTotal,
          })
          .from(orderItems)
          .innerJoin(cards, eq(orderItems.cardId, cards.id))
          .where(sql`${orderItems.orderId} = ${orderId} AND ${orderItems.removedAt} IS NULL`);

        const itemsData: OrderItemData[] = items.map((i) => ({
          cardNumber: i.cardNumber,
          cardName: i.cardName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
        }));

        ({ subject, html } = quoteReady(orderData, itemsData, clientData));
        break;
      }

      case "confirmed":
        ({ subject, html } = orderConfirmed(orderData, clientData));
        break;

      case "shipped":
        ({ subject, html } = orderShipped(orderData, clientData));
        break;

      case "delivered":
        ({ subject, html } = orderDelivered(orderData, clientData));
        break;

      case "new_order": {
        const orderItemRows = await db
          .select({ id: orderItems.id })
          .from(orderItems)
          .where(eq(orderItems.orderId, orderId));

        const itemCount = orderItemRows.length;

        ({ subject, html } = newOrderAdmin(orderData, clientData, itemCount));
        break;
      }

      default:
        console.warn(`[EMAIL] Unknown notification type "${type}" for order #${orderId} — skipping`);
        return;
    }

    // 5. Send via Resend or fallback to console
    if (resend) {
      await resend.emails.send({
        from: notificationFrom,
        to: recipient,
        subject,
        html,
      });
      console.log(`[EMAIL] Sent "${type}" notification for order #${orderId} to ${recipient}`);
    } else {
      console.log(`[EMAIL FALLBACK] type=${type} order=#${orderId} to=${recipient}`);
      console.log(`[EMAIL FALLBACK] subject: ${subject}`);
    }

    // 6. Log to notifications table
    await db.insert(notifications).values({
      orderId,
      type,
      recipient,
      status: "sent",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[EMAIL ERROR] Failed to send "${type}" for order #${orderId}:`, message);

    // 7. Log failure to notifications table
    try {
      await db.insert(notifications).values({
        orderId,
        type,
        recipient: recipient || "unknown",
        status: "failed",
        error: message,
      });
    } catch (logError) {
      console.error("[EMAIL ERROR] Failed to log notification failure:", logError);
    }
  }
}
