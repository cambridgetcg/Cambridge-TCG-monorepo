/**
 * Webhook handler for refunds/create (subscribed in shopify.app.toml).
 *
 * Ends refunded tier memberships, reverses the refunded share of the
 * order's cashback (services/refund-handler.server.ts) and re-evaluates the
 * customer's tier. Shopify signs the delivery with the app's client secret,
 * which authenticate.webhook verifies.
 *
 * Every step is idempotent per refund, so any failure answers 5xx and the
 * redelivery finishes the work.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { updateCustomerToEffectiveTier } from "../services/tier-resolution.server";
import TierProductCache from "../services/tier-product-cache.server";
import { recordRefund, settleRefundClawback, RefundRetryableError } from "../services/refund-handler.server";
import { clawbackPoints } from "../services/points-ledger.server";
import { isPointsEnabled } from "../services/points-config.server";
import { invalidateShopCache } from "~/utils/analytics-cache.server";

// refunds/create payload (the fields this handler reads)
interface ShopifyRefund {
  id: number;
  order_id: number;
  created_at: string;
  refund_line_items: Array<{
    line_item_id: number;
    line_item: {
      product_id?: number | null;
    };
  }>;
  transactions: Array<{
    amount: string;
    currency?: string;
    kind: string;
    status?: string;
  }>;
}

/**
 * Money this refund returns to the shopper. Pending refund transactions
 * count (Shopify sends no second webhook when they settle); failed ones do
 * not.
 */
function refundedMoney(refund: ShopifyRefund): { amount: Prisma.Decimal; currency: string | null } {
  const transactions = refund.transactions.filter(
    (t) => t.kind === "refund" && t.status !== "failure" && t.status !== "error",
  );
  const amount = transactions.reduce((sum, t) => sum.plus(t.amount), new Prisma.Decimal(0));
  return { amount, currency: transactions[0]?.currency ?? null };
}

export async function action({ request }: ActionFunctionArgs) {
  // Throws a 401 Response for a delivery that Shopify did not sign
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  if (topic !== "REFUNDS_CREATE") {
    console.log(`[OrderRefunded] Unexpected topic: ${topic}`);
    return json({ success: false, error: "Invalid topic" }, { status: 400 });
  }

  const refund = payload as ShopifyRefund;
  const shopifyOrderId = String(refund.order_id);
  const webhookId = request.headers.get("x-shopify-webhook-id");

  console.log(`[OrderRefunded] Processing refund ${refund.id} for order ${shopifyOrderId}`);

  try {
    if (webhookId) {
      const processed = await prisma.webhookProcessed.findUnique({ where: { webhookId } });
      if (processed) {
        console.log(`[OrderRefunded] Webhook ${webhookId} already processed`);
        return json({ success: true, message: "Already processed" });
      }
    }

    // Read through the global client before the transaction opens: inside it,
    // with connection_limit=1, a second query would wait on the connection the
    // transaction itself holds.
    const tierProductIds = await TierProductCache.getTierProductIds(shop);

    // End tier memberships bought on this order
    await prisma.$transaction(async (tx) => {
      const orderRecord = await tx.order.findFirst({
        where: { shop, shopifyOrderId },
        select: { customerId: true },
      });
      if (!orderRecord) return;

      const refundedTierLineItems = refund.refund_line_items
        .filter((item) => {
          const productId = item.line_item.product_id?.toString();
          return productId !== undefined && tierProductIds.has(productId);
        })
        .map((item) => String(item.line_item_id));
      if (refundedTierLineItems.length === 0) return;

      const now = new Date();
      const purchases = await tx.tierPurchase.updateMany({
        where: { shop, shopifyOrderId, shopifyLineItemId: { in: refundedTierLineItems }, status: "ACTIVE" },
        data: { status: "REFUNDED", endDate: now, updatedAt: now },
      });
      const subscription = await tx.tierSubscription.findFirst({
        where: { customerId: orderRecord.customerId, status: "ACTIVE" },
        select: { id: true },
      });
      if (subscription) {
        await tx.tierSubscription.update({
          where: { id: subscription.id },
          data: { status: "CANCELLED", endDate: now, updatedAt: now },
        });
      }
      console.log(`[OrderRefunded] Ended ${purchases.count} tier purchase(s)${subscription ? " and the active subscription" : ""}`);
    });

    const { amount, currency } = refundedMoney(refund);
    const outcome = await recordRefund({
      shop,
      shopifyOrderId,
      shopifyRefundId: String(refund.id),
      amount,
      currency,
      createdAt: new Date(refund.created_at),
    });

    if (outcome.status === "order_not_found") {
      // Orders from before install or guest checkouts were never recorded
      console.log(`[OrderRefunded] Order ${shopifyOrderId} not found; nothing to reverse`);
      return json({ success: true, message: "Order not found" });
    }

    if (outcome.pendingClawbackId) {
      const settlement = await settleRefundClawback(outcome.pendingClawbackId, { shop, admin });
      console.log(`[OrderRefunded] Debited ${settlement.debited.toFixed(2)} store credit for refund ${refund.id}`);
    }

    if (outcome.newlyRecorded && (await isPointsEnabled(shop))) {
      try {
        await clawbackPoints(shop, outcome.customerId, outcome.orderId, outcome.appliedAmount.toNumber());
      } catch (pointsError) {
        console.error("[OrderRefunded] Points clawback failed (non-fatal):", pointsError);
      }
    }

    // Tier sources: the cancelled purchase above, and spending net of refunds
    await updateCustomerToEffectiveTier(shop, outcome.customerId, {
      triggeredBy: "order_refunded",
      orderId: outcome.orderId,
    });

    if (webhookId) {
      // ON CONFLICT DO NOTHING: a concurrent duplicate may have recorded it
      await prisma.webhookProcessed.createMany({
        data: [{ shop, topic: "refunds/create", webhookId, processedAt: new Date() }],
        skipDuplicates: true,
      });
    }

    try { await invalidateShopCache(shop); } catch (e) { console.warn("[OrderRefunded] Cache invalidation failed:", e); }

    return json({
      success: true,
      refundedAmount: outcome.appliedAmount.toFixed(2),
      cashbackReversed: outcome.reversedCashback.toFixed(2),
    });
  } catch (error) {
    console.error("[OrderRefunded] Processing error:", error);
    // 5xx makes Shopify redeliver; every step above is idempotent per refund
    const status = error instanceof RefundRetryableError ? 503 : 500;
    return json({ success: false, error: "Refund processing failed" }, { status });
  }
}

// Webhooks are POST only
export async function loader() {
  return json({ message: "Webhook endpoint - POST only" }, { status: 405 });
}
