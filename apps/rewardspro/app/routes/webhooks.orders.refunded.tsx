/**
 * Webhook handler for order refunds
 * Implements cashback clawback and tier membership revocation
 * Based on best practices: proportional refunds, immediate membership cancellation
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { updateCustomerToEffectiveTier } from "../services/tier-resolution.server";
import TierProductCache from "../services/tier-product-cache.server";
import * as crypto from 'node:crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { v4 as uuidv4 } from 'uuid';
import { invalidateShopCache } from "~/utils/analytics-cache.server";

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

// HMAC Verification
// SECURITY FIX: Use SHOPIFY_WEBHOOK_SECRET, not SHOPIFY_API_SECRET
// These are different secrets with different purposes:
// - SHOPIFY_WEBHOOK_SECRET: For verifying webhook authenticity
// - SHOPIFY_API_SECRET: For OAuth and session management
function verifyWebhookHMAC(request: Request, rawBody: string): boolean {
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  if (!hmacHeader) {
    console.error('[OrderRefunded] Missing HMAC header');
    return false;
  }

  // CRITICAL: Use webhook secret, NOT API secret
  const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[OrderRefunded] SHOPIFY_WEBHOOK_SECRET not configured');
    return false;
  }

  const hash = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody, "utf8")
    .digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
  } catch {
    console.error('[OrderRefunded] HMAC comparison failed');
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
      const existingRefund = await prisma.webhookProcessed.findUnique({
        where: {
          webhookId
        }
      });

      if (existingRefund) {
        console.log(`[OrderRefunded] Webhook ${webhookId} already processed`);
        return json({ success: true, message: "Already processed" });
      }
    }

    // =========================================================================
    // RACE CONDITION FIX: Restructured to prevent nested transaction conflicts
    //
    // Previously: Everything was in one outer transaction, but handleRefundClawback
    // and updateCustomerToEffectiveTier create their OWN transactions internally.
    // Nested transactions don't respect outer transaction ACID properties.
    //
    // Now: Transaction ONLY handles membership cancellation (atomically).
    // Clawback and tier recalculation happen OUTSIDE with their own transaction safety.
    // =========================================================================

    // 5. STEP 1: Process membership cancellation in transaction (atomic)
    // NOTE: Webhook idempotency record is created AFTER ALL operations succeed
    const transactionResult = await prisma.$transaction(async (tx) => {
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
        return null;
      }

      // Get customer
      const customer = await tx.customer.findUnique({
        where: { id: orderRecord.customerId },
        include: { currentTier: true }
      });

      if (!customer) {
        console.log('[OrderRefunded] Customer not found');
        return null;
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

      // Return data needed for subsequent operations
      return {
        orderRecord,
        customer,
        refundAmount,
        isFullRefund,
        tierProductRefunded
      };
    });

    // Exit early if transaction returned null (order/customer not found)
    if (!transactionResult) {
      // Still return 200 to prevent Shopify from retrying for missing data
      return json({ success: true, message: "Order or customer not found" });
    }

    const { orderRecord, customer, refundAmount, isFullRefund, tierProductRefunded } = transactionResult;

    // 7. STEP 2: Process cashback clawback (has its own transaction safety)
    // CRITICAL: This runs OUTSIDE the main transaction because it creates its own
    const { handleRefundClawback } = await import('../services/refund-handler.server');

    const clawbackResult = await handleRefundClawback(
      refund.order_id.toString(),
      shopDomain,
      Number(refundAmount),
      isFullRefund,
      refund.id.toString()
    );

    if (!clawbackResult.success) {
      console.error(`[OrderRefunded] Clawback failed: ${clawbackResult.message}`);
      // Continue processing even if clawback fails - don't break the whole refund
    } else {
      console.log(`[OrderRefunded] Clawback successful: ${clawbackResult.message}`);
    }

    // 8. STEP 3: Re-evaluate tier (has its own transaction safety)
    // RACE CONDITION FIX: Use ONLY updateCustomerToEffectiveTier - it's comprehensive
    // Previously we called BOTH updateCustomerToEffectiveTier AND recalculateTierAfterRefund
    // which was redundant and could cause double-processing
    //
    // updateCustomerToEffectiveTier handles ALL tier sources:
    // - Manual override
    // - Tier subscription
    // - Tier purchase (now cancelled if refunded)
    // - Spending-based (recalculates with new netSpent)
    // - Default base tier
    await updateCustomerToEffectiveTier(shopDomain, customer.id, {
      triggeredBy: 'order_refunded',
      orderId: orderRecord.id
    });
    console.log(`[OrderRefunded] Re-evaluated tier for customer ${customer.id} after refund`);

    // Log the refund processing
    console.log(`[OrderRefunded] Successfully processed ${isFullRefund ? 'full' : 'partial'} refund:`, {
      refundId: refund.id,
      orderId: refund.order_id,
      refundAmount: refundAmount.toString(),
      cashbackClawback: clawbackResult.clawbackAmount,
      tierProductRefunded,
      customerId: customer.id
    });

    // CRITICAL FIX: Record webhook as processed AFTER all operations succeed
    // This ensures Shopify can retry if processing fails mid-way
    if (webhookId) {
      try {
        await prisma.webhookProcessed.create({
          data: {
            id: uuidv4(),
            shop: shopDomain,
            topic: 'orders/refunded',
            webhookId,
            processedAt: new Date()
          }
        });
        console.log(`[OrderRefunded] Webhook ${webhookId} marked as processed`);
      } catch (e) {
        // Duplicate or table doesn't exist - safe to ignore
        console.log(`[OrderRefunded] Could not mark webhook as processed (duplicate or table missing)`);
      }
    }

    // Invalidate analytics cache so dashboards reflect refund
    try { await invalidateShopCache(shopDomain); } catch(e) { console.warn('[OrderRefunded] Cache invalidation failed:', e); }

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
