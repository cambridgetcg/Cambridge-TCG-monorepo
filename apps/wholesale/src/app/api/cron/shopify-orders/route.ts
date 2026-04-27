/**
 * POST /api/cron/shopify-orders
 *
 * Pull recent Shopify orders, create wholesale order records, and decrement stock.
 * Auth: Authorization: Bearer {CRON_SECRET}  OR  Vercel Cron header
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
import { eq, sql } from "drizzle-orm";
import { ShopifyClient } from "@/lib/shopify-client";
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

function authorizeCron(req: NextRequest): boolean {
  // Vercel Cron sends this header automatically
  if (req.headers.get("x-vercel-cron") === "true") return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  // Bearer token
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  // Query param
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;

  return false;
}

export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    // Create the wholesale order record
    const [newOrder] = await db
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
        const [card] = await db
          .select({ id: cards.id, stock: cards.stock })
          .from(cards)
          .where(eq(cards.sku, sku))
          .limit(1);

        if (!card) {
          errors.push({ sku, error: "Not in wholesale DB" });
          continue;
        }

        // Create the order item
        await db.insert(orderItems).values({
          orderId: newOrder.id,
          cardId: card.id,
          quantity: item.quantity,
          unitPrice: parseFloat(item.price),
          lineTotal: parseFloat(item.price) * item.quantity,
          stockStatus: "in_stock",
        });

        // Decrement stock
        const prevStock = card.stock;
        const delta = -Math.min(item.quantity, prevStock);
        const newStock = prevStock + delta;

        await db
          .update(cards)
          .set({ stock: sql`greatest(${cards.stock} - ${item.quantity}, 0)` })
          .where(eq(cards.id, card.id));

        await db.insert(stockAdjustments).values({
          cardId: card.id,
          delta,
          reason: "count",
          channel: "shopify-cambridge",
          note: orderRef,
        });

        details.push({ sku, prev: prevStock, new: newStock, delta });
      } catch (err) {
        errors.push({ sku, error: err instanceof Error ? err.message : String(err) });
      }
    }

    allResults.push({
      order_number: order.order_number,
      status: "processed",
      items_processed: details.length,
      items_skipped: 0,
      items_errored: errors.length,
      order_id: newOrder.id,
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
