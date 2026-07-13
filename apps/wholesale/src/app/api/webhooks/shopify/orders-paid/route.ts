/**
 * POST /api/webhooks/shopify/orders-paid
 *
 * Shopify webhook handler for `orders/paid` topic.
 * Verifies HMAC-SHA256 signature, then decrements wholesale stock
 * for each line item by SKU.
 *
 * Environment:
 *   SHOPIFY_CLIENT_SECRET — used for HMAC verification
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards, stockAdjustments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { stock } from "@/lib/stock";
import { createHmac } from "crypto";
import { redactInternalError } from "@/lib/public-errors";

// Shopify sends the raw body, we need it for HMAC verification
export const dynamic = "force-dynamic";

interface ShopifyLineItem {
  id: number;
  title: string;
  sku: string;
  quantity: number;
  price: string;
  variant_id: number;
  product_id: number;
}

interface ShopifyOrderWebhook {
  id: number;
  order_number: number;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  currency: string;
  line_items: ShopifyLineItem[];
  customer?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
  };
}

function verifyHmac(body: string, hmacHeader: string, secret: string): boolean {
  const computed = createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");
  return computed === hmacHeader;
}

export async function POST(req: NextRequest) {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    console.error("[shopify-webhook] SHOPIFY_CLIENT_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Read raw body for HMAC verification
  const rawBody = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256") ?? "";

  if (!verifyHmac(rawBody, hmacHeader, secret)) {
    console.warn("[shopify-webhook] HMAC verification failed");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const order: ShopifyOrderWebhook = JSON.parse(rawBody);
  const orderRef = `shopify-#${order.order_number}`;

  console.log(
    `[shopify-webhook] Processing order #${order.order_number} (${order.line_items.length} items, ${order.total_price} ${order.currency})`
  );

  const results: { sku: string; prev_stock: number; new_stock: number; delta: number; deduplicated: boolean }[] = [];
  const errors: { sku: string; error: string }[] = [];

  for (const item of order.line_items) {
    const sku = item.sku?.trim();
    if (!sku) {
      errors.push({ sku: item.title, error: "No SKU on line item" });
      continue;
    }

    try {
      const [card] = await db
        .select({ id: cards.id, stock: cards.stock })
        .from(cards)
        .where(eq(cards.sku, sku))
        .limit(1);

      if (!card) {
        errors.push({ sku, error: "Card not found in wholesale DB" });
        continue;
      }

      const prevStock = card.stock;

      // Record sale via stock service — idempotent by referenceId
      // referenceId includes Shopify order ID + line item ID for exact dedup
      const movement = await db.transaction(async (tx) => {
        const m = await stock.writer.recordSale(tx, {
          cardId: card.id,
          quantity: item.quantity,
          channel: "shopify",
          referenceId: `shopify:order:${order.id}:item:${item.id}`,
          note: orderRef,
        });

        // Dual-write to stock_adjustments for syncUkStock backward compat
        if (m) {
          await tx.insert(stockAdjustments).values({
            cardId: card.id,
            delta: -item.quantity,
            reason: "count",
            channel: "shopify-cambridge",
            note: orderRef,
          });
        }

        return m;
      });

      const delta = movement ? -item.quantity : 0;
      const newStock = movement ? Math.max(0, prevStock - item.quantity) : prevStock;

      results.push({ sku, prev_stock: prevStock, new_stock: newStock, delta, deduplicated: movement === null });
    } catch (err) {
      errors.push({
        sku,
        error: redactInternalError("webhooks/shopify/orders-paid item", err),
      });
    }
  }

  console.log(
    `[shopify-webhook] Order #${order.order_number}: ${results.length} decremented, ${errors.length} errors`
  );

  if (errors.length > 0) {
    console.warn(`[shopify-webhook] Errors:`, errors);
  }

  // Shopify expects 200 — always acknowledge to prevent retries
  return NextResponse.json({
    order_number: order.order_number,
    processed: results.length,
    errors: errors.length,
    results,
    ...(errors.length > 0 && { error_details: errors }),
  });
}
