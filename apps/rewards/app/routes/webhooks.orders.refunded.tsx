/**
 * refunds/create, at the released URI /webhooks/orders/refunded (spec 6.3
 * rules 7 and 8): read the refund from Shopify, record it and the cashback it
 * takes back, answer, and only then send a take-back that is due and resolve
 * the buyer's tier, under waitUntil.
 *
 * - An order not recorded yet answers 503, so Shopify delivers the refund
 *   again, while orders/paid may still record it: the order has a buyer, is
 *   not a test order, and became paid within Shopify's ~4 h of retries
 *   (mayStillBeRecorded, Ruling 43: from its latest successful sale or
 *   capture, which can be long after it was created). Otherwise 200 (a
 *   guest's order, or one past the window, which the hourly sweep records
 *   with its refunds).
 * - A credit being sent right now answers 503 (RefundRetryLater).
 * - A redelivered refund writes nothing (its natural key).
 * Any other failure answers 500 and reaches monitoring. Both reads share one
 * deadline from receipt, so the answer stays inside Shopify's 5 s. It keeps
 * authenticate.webhook: it needs the store's Admin API (Ruling 42).
 */
import type { ActionFunctionArgs } from "react-router";
import { findConnection } from "~/lib/merchant.server";
import { sendPayout } from "~/lib/payouts.server";
import { RefundRetryLater, mayStillBeRecorded, recordRefund } from "~/lib/refunds.server";
import { resolveTier } from "~/lib/tiers.server";
import { waitUntil } from "~/lib/wait-until.server";
import { readOr500, webhookFailed } from "~/lib/webhook-helpers.server";
import { OrderReadError, WEBHOOK_READ_DEADLINE_MS, createShopifyOrderSource } from "~/shopify/order-source.server";
import { createStoreCreditRail } from "~/shopify/store-credit-rail.server";
import { authenticate } from "../shopify.server";

const TOPIC = "refunds/create";

// The function's ceiling, which vercelPreset reads per route (OPERATIONS-5)
export const config = { maxDuration: 300 };

/** The refund's id from the payload, or null when it names none. */
function refundGidOf(payload: unknown): string | null {
  const id = (payload as { id?: unknown } | null)?.id;
  const digits = typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? String(id) : typeof id === "string" ? id : "";
  return /^\d+$/.test(digits) ? `gid://shopify/Refund/${digits}` : null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  // From receipt, before authentication (which may refresh the token).
  const deadline = Date.now() + WEBHOOK_READ_DEADLINE_MS;
  // Throws a 401 Response for a delivery Shopify did not sign.
  const { topic, shop, payload, admin } = await authenticate.webhook(request);
  if (topic !== "REFUNDS_CREATE") return new Response(null, { status: 400 });

  const refundGid = refundGidOf(payload);
  try {
    const conn = await findConnection(shop);
    if (!conn) {
      console.log(`[refunds/create] No store connection for ${shop}; nothing to do`);
      return new Response();
    }
    if (!admin) {
      console.error(`[refunds/create] No usable session for ${shop}; Shopify will deliver it again`);
      return new Response(null, { status: 500 });
    }
    if (!refundGid) throw new Error("The delivery names no refund");

    const orders = createShopifyOrderSource(admin);
    const read = await readOr500(TOPIC, `Could not read refund ${refundGid} for ${shop}`, OrderReadError, () =>
      orders.readRefund(refundGid, { deadline }),
    );
    if (read instanceof Response) return read;
    // Shopify has no such refund
    if (!read) return new Response();

    let result;
    try {
      result = await recordRefund(conn, read.orderGid, read.refund);
    } catch (error) {
      if (!(error instanceof RefundRetryLater)) throw error;
      console.log(`[refunds/create] Refund ${refundGid} for ${shop} waits for its order's credit, being sent now`);
      return new Response(null, { status: 503 });
    }

    if (result.status === "order_not_recorded") {
      const { orderGid } = read;
      const order = await readOr500(TOPIC, `Could not read order ${orderGid} for ${shop}`, OrderReadError, () =>
        orders.readOrder(orderGid, { deadline }),
      );
      if (order instanceof Response) return order;
      if (order !== null && mayStillBeRecorded({ hasCustomer: order.externalCustomerId !== null, test: order.test, paidAt: order.paidAt })) {
        console.log(`[refunds/create] Order ${read.orderGid} for ${shop} is not recorded yet; Shopify will deliver refund ${refundGid} again`);
        return new Response(null, { status: 503 });
      }
      return new Response();
    }

    if (result.status === "recorded") {
      const { reversalPayoutId, customerId } = result;
      const rail = createStoreCreditRail(admin);
      waitUntil(
        (async () => {
          // Only a take-back that is due (pending) is sent; one held or with nothing to send is skipped.
          if (reversalPayoutId) await sendPayout(reversalPayoutId, rail);
          await resolveTier(customerId);
        })(),
      );
    }
    return new Response();
  } catch (error) {
    return webhookFailed(TOPIC, `Refund ${refundGid ?? "(none)"} for ${shop} failed`, error);
  }
};
