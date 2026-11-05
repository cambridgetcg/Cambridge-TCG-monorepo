/**
 * refunds/create, at the released URI /webhooks/orders/refunded (spec 6.3
 * rules 7 and 8): read the refund from Shopify, record it and the cashback it
 * takes back, answer, and only then send a take-back that is due and resolve
 * the buyer's tier, under waitUntil.
 *
 * - An order not recorded yet answers 503, so Shopify delivers the refund
 *   again, while orders/paid may still record it: the order has a buyer and
 *   is younger than Shopify's ~4 h of retries. Otherwise 200 (a guest's
 *   order, or one past the window, which the hourly sweep records with its
 *   refunds).
 * - A credit being sent right now answers 503 (RefundRetryLater).
 * - A redelivered refund writes nothing (its natural key).
 * Any other failure answers 500. Both reads share one deadline from receipt,
 * so the answer stays inside Shopify's 5 s.
 */
import type { ActionFunctionArgs } from "react-router";
import { findConnection } from "~/lib/merchant.server";
import { sendPayout } from "~/lib/payouts.server";
import { ORDER_RECORDING_WINDOW_MS, RefundRetryLater, recordRefund } from "~/lib/refunds.server";
import { resolveTier } from "~/lib/tiers.server";
import { waitUntil } from "~/lib/wait-until.server";
import { OrderReadError, WEBHOOK_READ_DEADLINE_MS, createShopifyOrderSource } from "~/shopify/order-source.server";
import { createStoreCreditRail } from "~/shopify/store-credit-rail.server";
import { authenticate } from "../shopify.server";

/** The refund's id from the payload, or null when it names none. */
function refundGidOf(payload: unknown): string | null {
  const id = (payload as { id?: unknown } | null)?.id;
  const digits = typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? String(id) : typeof id === "string" ? id : "";
  return /^\d+$/.test(digits) ? `gid://shopify/Refund/${digits}` : null;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

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
    let read;
    try {
      read = await orders.readRefund(refundGid, { deadline });
    } catch (error) {
      if (!(error instanceof OrderReadError)) throw error;
      console.error(`[refunds/create] Could not read refund ${refundGid} for ${shop}; Shopify will deliver it again: ${error.message}`);
      return new Response(null, { status: 500 });
    }
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
      let order;
      try {
        order = await orders.readOrder(read.orderGid, { deadline });
      } catch (error) {
        if (!(error instanceof OrderReadError)) throw error;
        console.error(`[refunds/create] Could not read order ${read.orderGid} for ${shop}; Shopify will deliver it again: ${error.message}`);
        return new Response(null, { status: 500 });
      }
      const mayStillBeRecorded =
        order !== null && order.externalCustomerId !== null && Date.now() - order.orderedAt.getTime() < ORDER_RECORDING_WINDOW_MS;
      if (mayStillBeRecorded) {
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
    console.error(`[refunds/create] Refund ${refundGid ?? "(none)"} for ${shop} failed; Shopify will deliver it again: ${messageOf(error)}`);
    return new Response(null, { status: 500 });
  }
};
