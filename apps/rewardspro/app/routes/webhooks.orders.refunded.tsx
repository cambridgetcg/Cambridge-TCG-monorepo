/**
 * Webhook handler for order refunds
 * Implements cashback clawback and tier membership revocation
 * Based on best practices: proportional refunds, immediate membership cancellation
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import TierResolver from "../services/tier-resolver.server";
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
      const existingRefund = await db.webhookProcess.findFirst({
        where: {
          idempotencyKey: webhookId,
          shop: shopDomain
        }
      });

      if (existingRefund) {
        console.log(`[OrderRefunded] Webhook ${webhookId} already processed`);
        return json({ success: true, message: "Already processed" });
      }
    }

    // 5. Process refund in transaction
    await db.$transaction(async (tx) => {
      // Record webhook as processed
      if (webhookId) {
        await tx.webhookProcess.create({
          data: {
            id: uuidv4(),
            shop: shopDomain,
            topic: 'orders/refunded',
            idempotencyKey: webhookId || uuidv4(),
            payload: refund,
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

      // 7. Calculate and claw back cashback
      let cashbackToRemove = new Decimal(0);

      if (isFullRefund) {
        // Full refund - remove all cashback from this order
        cashbackToRemove = orderRecord.cashbackAmount || new Decimal(0);
      } else {
        // Partial refund - calculate proportional cashback to remove
        const refundPercentage = refundAmount.div(orderRecord.totalPrice);
        cashbackToRemove = new Decimal(orderRecord.cashbackAmount || 0).mul(refundPercentage);
      }

      if (cashbackToRemove.gt(0)) {
        // Create negative ledger entry for clawback
        const currentBalance = customer.storeCredit;
        const newBalance = currentBalance.minus(cashbackToRemove);

        await tx.storeCreditLedger.create({
          data: {
            id: uuidv4(),
            customerId: customer.id,
            shop: shopDomain,
            amount: cashbackToRemove.neg(), // Negative amount for deduction
            balance: newBalance,
            type: 'REFUND_CLAWBACK',
            shopifyOrderId: refund.order_id.toString(),
            metadata: {
              refundId: refund.id,
              originalCashback: orderRecord.cashbackAmount?.toString(),
              refundAmount: refundAmount.toString(),
              isFullRefund,
              reason: isFullRefund ? 'Full order refund' : 'Partial order refund'
            },
            createdAt: new Date()
          }
        });

        // Update customer balance
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            storeCredit: newBalance,
            updatedAt: new Date()
          }
        });

        console.log(`[OrderRefunded] Clawed back ${cashbackToRemove} cashback from customer ${customer.id}`);
      }

      // 8. Update order record
      await tx.order.update({
        where: { id: orderRecord.id },
        data: {
          financialStatus: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          totalRefunded: orderRecord.totalRefunded.plus(refundAmount),
          updatedAt: new Date()
        }
      });

      // 9. Update customer spending totals
      const updatedSpending = await tx.order.aggregate({
        where: {
          shop: shopDomain,
          customerId: customer.id,
          financialStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
          cashbackEligible: true
        },
        _sum: {
          totalPrice: true,
          totalRefunded: true,
          cashbackAmount: true
        }
      });

      await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalSpent: updatedSpending._sum.totalPrice || new Decimal(0),
          totalRefunded: updatedSpending._sum.totalRefunded || new Decimal(0),
          totalCashbackEarned: updatedSpending._sum.cashbackAmount || new Decimal(0),
          netSpent: new Decimal(updatedSpending._sum.totalPrice || 0)
            .minus(updatedSpending._sum.totalRefunded || 0),
          updatedAt: new Date()
        }
      });

      // 10. Re-evaluate tier if membership was refunded or spending changed significantly
      if (tierProductRefunded) {
        await TierResolver.updateEffectiveTier(customer.id);
        console.log(`[OrderRefunded] Re-evaluated tier for customer ${customer.id} after membership refund`);
      }

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