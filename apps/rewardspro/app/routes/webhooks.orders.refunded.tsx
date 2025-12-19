/**
 * Webhook handler for order refunds
 * Implements cashback clawback and tier membership revocation
 * Based on best practices: proportional refunds, immediate membership cancellation
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { updateCustomerToEffectiveTier } from "../services/tier-resolution.server";
import TierProductCache from "../services/tier-product-cache.server";
import * as crypto from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { v4 as uuidv4 } from 'uuid';

// Shopify Order Refund Types
interface ShopifyRefund {
  id: number;
  order_id: number;
  created_at: string;
  note?: string;
  restock: boolean;
  refund_line_items: Array<{
    id: number;
    line_item_id: number;
    quantity: number;
    line_item: {
      id: number;
      product_id?: number;
      variant_id?: number;
      price: string;
      quantity: number;
    };
    subtotal: string;
    total_tax: string;
  }>;
  transactions: Array<{
    amount: string;
    currency: string;
    kind: string;
  }>;
}

interface ShopifyOrder {
  id: number;
  name: string;
  total_price: string;
  subtotal_price: string;
  total_discounts: string;
  currency: string;
  financial_status: string;
  customer?: {
    id: number;
    email: string;
  };
}

// HMAC Verification
function verifyWebhookHMAC(request: Request, rawBody: string): boolean {
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  if (!hmacHeader) return false;

  const hash = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET!)
    .update(rawBody, "utf8")
    .digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  console.log('[OrderRefunded] Webhook received');

  // 1. Get raw body for HMAC verification
  const rawBody = await request.text();

  // 2. Verify HMAC
  if (!verifyWebhookHMAC(request, rawBody)) {
    console.error('[OrderRefunded] HMAC verification failed');
    return new Response("Unauthorized", { status: 401 });
  }

  // 3. Parse webhook payload
  const data = JSON.parse(rawBody);
  const refund: ShopifyRefund = data;
  const shopDomain = request.headers.get("x-shopify-shop-domain");

  // Get webhook ID for idempotency
  const webhookId = request.headers.get("x-shopify-webhook-id");

  if (!shopDomain) {
    return new Response("Missing shop domain", { status: 400 });
  }

  console.log(`[OrderRefunded] Processing refund ${refund.id} for order ${refund.order_id}`);

  try {
    // 4. Check idempotency - have we processed this refund webhook already?
    if (webhookId) {
      const existingRefund = await db.webhookProcessed.findUnique({
        where: {
          webhookId
        }
      });

      if (existingRefund) {
        console.log(`[OrderRefunded] Webhook ${webhookId} already processed`);
        return json({ success: true, message: "Already processed" });
      }
    }

    // 5. Process refund in transaction
    await db.$transaction(async (tx) => {
      // Record webhook as processed (without payload to avoid timeout)
      if (webhookId) {
        await tx.webhookProcessed.create({
          data: {
            id: uuidv4(),
            shop: shopDomain,
            topic: 'orders/refunded',
            webhookId: webhookId || uuidv4(),
            processedAt: new Date()
          }
        });
      }

      // Find the original order in our system
      const orderRecord = await tx.order.findFirst({
        where: {
          shop: shopDomain,
          shopifyOrderId: refund.order_id.toString()
        },
        include: {
          lineItems: true
        }
      });

      if (!orderRecord) {
        console.log(`[OrderRefunded] Order ${refund.order_id} not found in database`);
        return;
      }

      // Get customer
      const customer = await tx.customer.findUnique({
        where: { id: orderRecord.customerId },
        include: { currentTier: true }
      });

      if (!customer) {
        console.log('[OrderRefunded] Customer not found');
        return;
      }

      // Calculate refund amount and proportions
      const refundAmount = refund.transactions
        .filter(t => t.kind === 'refund')
        .reduce((sum, t) => sum.plus(t.amount), new Decimal(0));

      const isFullRefund = refundAmount.equals(orderRecord.totalPrice);

      // 6. Process tier product refunds (cancel memberships immediately)
      const tierProductIds = await TierProductCache.getTierProductIds(shopDomain);
      let tierProductRefunded = false;

      for (const refundItem of refund.refund_line_items) {
        const productId = refundItem.line_item.product_id?.toString();
        const variantId = refundItem.line_item.variant_id?.toString();

        if (productId && tierProductIds.has(productId)) {
          tierProductRefunded = true;

          // Find and cancel the tier purchase/subscription
          const tierPurchase = await tx.tierPurchase.findFirst({
            where: {
              shop: shopDomain,
              shopifyOrderId: refund.order_id.toString(),
              status: 'ACTIVE'
            }
          });

          if (tierPurchase) {
            await tx.tierPurchase.update({
              where: { id: tierPurchase.id },
              data: {
                status: 'REFUNDED',
                endDate: new Date(), // End immediately
                updatedAt: new Date()
              }
            });

            console.log(`[OrderRefunded] Cancelled tier purchase ${tierPurchase.id}`);
          }

          // Also check for subscription
          const tierSubscription = await tx.tierSubscription.findFirst({
            where: {
              customerId: customer.id,
              status: 'ACTIVE'
            }
          });

          if (tierSubscription) {
            await tx.tierSubscription.update({
              where: { id: tierSubscription.id },
              data: {
                status: 'CANCELLED',
                endDate: new Date(),
                updatedAt: new Date()
              }
            });

            console.log(`[OrderRefunded] Cancelled tier subscription ${tierSubscription.id}`);
          }
        }
      }

      // 7. Process cashback clawback using refund handler service
      const { handleRefundClawback } = await import('../services/refund-handler.server');

      const clawbackResult = await handleRefundClawback(
        refund.order_id.toString(),
        shopDomain,
        Number(refundAmount),
        isFullRefund
      );

      if (!clawbackResult.success) {
        console.error(`[OrderRefunded] Clawback failed: ${clawbackResult.message}`);
        // Continue processing even if clawback fails - don't break the whole refund
      } else {
        console.log(`[OrderRefunded] Clawback successful: ${clawbackResult.message}`);
      }

      // Customer spending totals and order updates are now handled by handleRefundClawback

      // 10. Re-evaluate tier if membership was refunded or spending changed significantly
      if (tierProductRefunded) {
        await updateCustomerToEffectiveTier(shopDomain, customer.id, {
          triggeredBy: 'order_refunded',
          orderId: orderRecord.id
        });
        console.log(`[OrderRefunded] Re-evaluated tier for customer ${customer.id} after membership refund`);
      }

      // Also recalculate tier based on new spending after refund
      const { recalculateTierAfterRefund } = await import('../services/refund-handler.server');
      await recalculateTierAfterRefund(customer.id, shopDomain);

      // Log the refund processing
      console.log(`[OrderRefunded] Successfully processed ${isFullRefund ? 'full' : 'partial'} refund:`, {
        refundId: refund.id,
        orderId: refund.order_id,
        refundAmount: refundAmount.toString(),
        cashbackRemoved: cashbackToRemove.toString(),
        tierProductRefunded,
        customerId: customer.id
      });
    });

    return json({
      success: true,
      message: "Refund processed successfully"
    });

  } catch (error: any) {
    console.error('[OrderRefunded] Processing error:', error);

    // Return 500 to trigger retry (idempotency will prevent double processing)
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

// Optional: Add a loader for GET requests (Shopify verification)
export async function loader() {
  return new Response("Refund webhook endpoint", { status: 200 });
}