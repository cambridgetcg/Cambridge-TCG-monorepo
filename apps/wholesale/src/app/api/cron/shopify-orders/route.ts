/**
 * POST /api/cron/shopify-orders
 *
 * Pull recent Shopify orders, create wholesale order records, and decrement stock.
 * Auth: Authorization: Bearer {CRON_SECRET}
 *
 * Query params:
 *   ?order_numbers=1186,1185  — process specific orders only
 *   ?since=2026-03-20         — orders since this date (default: 7 days)
 *
 * Deduplication: checks orders.externalOrderId for Shopify order ID
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards, clients, orders as ordersTable, orderItems, stockAdjustments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { stock } from "@/lib/stock";
import { ShopifyClient } from "@/lib/shopify-client";
import { requireCronAuth } from "@/lib/cron-auth";
import { redactInternalError } from "@/lib/public-errors";
import { hash } from "bcryptjs";
import { randomUUID } from "crypto";

/**
 * Ensure a "Shopify Cambridge" client exists in the DB.
 * Returns the client ID. Creates the client on first use.
 */
async function getOrCreateShopifyClient(): Promise<number> {
  const email = "shopify@cambridgetcg.com";

  const [existing] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.email, email))
    .limit(1);

  if (existing) return existing.id;

  const passwordHash = await hash(randomUUID(), 10);
  const [created] = await db
    .insert(clients)
    .values({
      name: "Shopify Cambridge",
      email,
      passwordHash,
      role: "client",
    })
    .returning({ id: clients.id });

  return created.id;
}

export async function POST(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const orderNumbersParam = url.searchParams.get("order_numbers");
  const sinceParam = url.searchParams.get("since");

  const client = new ShopifyClient();

  const since = sinceParam
    ? new Date(sinceParam).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const orders = await client.getOrders({
    status: "any",
    financial_status: "any",
    created_at_min: since,
    limit: 50,
  });

  // Filter to paid/authorized orders
  const processable = orders.filter(
    (o) => o.financial_status === "paid" || o.financial_status === "authorized"
  );

  // Optionally filter to specific order numbers
  const targetNumbers = orderNumbersParam
    ? orderNumbersParam.split(",").map(Number)
    : null;

  const targetOrders = targetNumbers
    ? processable.filter((o) => targetNumbers.includes(o.order_number))
    : processable;

  // Ensure the Shopify Cambridge client exists for order records
  const shopifyClientId = await getOrCreateShopifyClient();

  const allResults: Array<{
    order_number: number;
    status: string;
    items_processed: number;
    items_skipped: number;
    items_errored: number;
    order_id?: number;
    details?: Array<{ sku: string; prev: number; new: number; delta: number }>;
    errors?: Array<{ sku: string; error: string }>;
  }> = [];

  for (const order of targetOrders) {
    const externalId = String(order.id);
    const orderRef = `shopify-#${order.order_number}`;

    // Dedup: check if we already created an order for this Shopify order
    const [existingOrder] = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(eq(ordersTable.externalOrderId, externalId))
      .limit(1);

    if (existingOrder) {
      allResults.push({
        order_number: order.order_number,
        status: "already_processed",
        items_processed: 0,
        items_skipped: order.line_items.length,
        items_errored: 0,
        order_id: existingOrder.id,
      });
      continue;
    }

    // Order + items + stock commit atomically: a mid-loop crash rolls the
    // whole order back, so the dedup check above never strands a partial
    // order. Per-item failures roll back only their savepoint (nested tx)
    // so one bad line item can't poison the rest of the order.
    const { orderId, details, errors } = await db.transaction(async (tx) => {
      // Create the wholesale order record
      const [newOrder] = await tx
        .insert(ordersTable)
        .values({
          clientId: shopifyClientId,
          status: "paid",
          total: parseFloat(order.total_price),
          channel: "shopify-cambridge",
          externalOrderId: externalId,
          clientOrderNumber: `#${order.order_number}`,
        })
        .returning({ id: ordersTable.id });

      // Create order_items for line items that have matching cards
      const details: Array<{ sku: string; prev: number; new: number; delta: number }> = [];
      const errors: Array<{ sku: string; error: string }> = [];

      for (const item of order.line_items) {
        const sku = item.sku?.trim();
        if (!sku) {
          errors.push({ sku: item.title || "unknown", error: "No SKU" });
          continue;
        }

        try {
          await tx.transaction(async (itemTx) => {
            const [card] = await itemTx
              .select({ id: cards.id, stock: cards.stock })
              .from(cards)
              .where(eq(cards.sku, sku))
              .limit(1);

            if (!card) {
              errors.push({ sku, error: "Not in wholesale DB" });
              return;
            }

            // Create the order item
            await itemTx.insert(orderItems).values({
              orderId: newOrder.id,
              cardId: card.id,
              quantity: item.quantity,
              unitPrice: parseFloat(item.price),
              lineTotal: parseFloat(item.price) * item.quantity,
              stockStatus: "in_stock",
            });

            // Record sale via stock service — idempotent by referenceId
            // Uses same referenceId format as the webhook, so cron and webhook
            // naturally deduplicate against each other
            const prevStock = card.stock;

            const movement = await stock.writer.recordSale(itemTx, {
              cardId: card.id,
              quantity: item.quantity,
              channel: "shopify",
              referenceId: `shopify:order:${order.id}:item:${item.id}`,
              note: orderRef,
            });

            // Dual-write to stock_adjustments for syncUkStock backward compat
            if (movement) {
              await itemTx.insert(stockAdjustments).values({
                cardId: card.id,
                delta: -item.quantity,
                reason: "count",
                channel: "shopify-cambridge",
                note: orderRef,
              });
            }

            const delta = movement ? -item.quantity : 0;
            const newStock = movement ? Math.max(0, prevStock - item.quantity) : prevStock;

            details.push({ sku, prev: prevStock, new: newStock, delta });
          });
        } catch (err) {
          errors.push({
            sku,
            error: redactInternalError("cron/shopify-orders item", err),
          });
        }
      }

      return { orderId: newOrder.id, details, errors };
    });

    allResults.push({
      order_number: order.order_number,
      status: "processed",
      items_processed: details.length,
      items_skipped: 0,
      items_errored: errors.length,
      order_id: orderId,
      details,
      ...(errors.length > 0 && { errors }),
    });
  }

  return NextResponse.json({
    total_orders: targetOrders.length,
    results: allResults,
  });
}

// Also support GET for manual triggering / Vercel Cron
export async function GET(req: NextRequest) {
  return POST(req);
}
