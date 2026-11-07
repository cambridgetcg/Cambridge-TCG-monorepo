/**
 * orders/cancelled: mark the recorded order cancelled, answer, then resolve
 * the buyer's tier under waitUntil. A cancelled order stops counting toward
 * tier spend (plan Decision 7); no money moves here, because money returned
 * on a cancellation arrives as its own refunds/create.
 *
 * Shopify is never called, so the delivery is checked by the app's own
 * signature check and no session is loaded (Ruling 42): a token refresh
 * Shopify refuses can't make it answer 500, and it starts no refresh.
 *
 * An order not recorded yet answers 503 while orders/paid may still record
 * it (Ruling 43), judged from the signed payload alone: a buyer, not a test
 * order, `financial_status` paid or partially_refunded, and processed (else
 * created) within ORDER_RECORDING_WINDOW_MS. Shopify then delivers the
 * cancellation again, and it lands once orders/paid has committed. Any other
 * unrecorded order answers 200 (a guest's, a test order, or one never paid:
 * its later read carries the cancellation). Any failure answers 500 and
 * reaches monitoring.
 */
import type { ActionFunctionArgs } from "react-router";
import { findConnection } from "~/lib/merchant.server";
import { recordCancellation } from "~/lib/record-order.server";
import { mayStillBeRecorded } from "~/lib/refunds.server";
import { resolveTier } from "~/lib/tiers.server";
import { waitUntil } from "~/lib/wait-until.server";
import { orderGidOf, webhookFailed } from "~/lib/webhook-helpers.server";
import { verifyShopifyWebhook } from "~/shopify/webhook-hmac.server";

const TOPIC = "orders/cancelled";
/** The financial statuses of an order orders/paid has been sent for. */
const PAID = new Set(["paid", "partially_refunded"]);

// The function's ceiling, which vercelPreset reads per route (OPERATIONS-5)
export const config = { maxDuration: 300 };

type CancelledPayload = {
  cancelled_at?: unknown;
  customer?: unknown;
  test?: unknown;
  financial_status?: unknown;
  processed_at?: unknown;
  created_at?: unknown;
} | null;

const dateOf = (value: unknown): Date | null => {
  const at = typeof value === "string" ? new Date(value) : null;
  return at && !Number.isNaN(at.getTime()) ? at : null;
};

/** The cancellation time from the payload (now, when it gives none that reads). */
function cancelledAtOf(payload: CancelledPayload): Date {
  return dateOf(payload?.cancelled_at) ?? new Date();
}

/** Whether the payload's order may still be recorded by orders/paid (mayStillBeRecorded). */
function mayStillArrive(payload: CancelledPayload): boolean {
  if (!payload || typeof payload.financial_status !== "string" || !PAID.has(payload.financial_status)) return false;
  const paidAt = dateOf(payload.processed_at) ?? dateOf(payload.created_at);
  if (!paidAt) return false;
  const hasCustomer = typeof payload.customer === "object" && payload.customer !== null;
  return mayStillBeRecorded({ hasCustomer, test: payload.test === true, paidAt });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const webhook = await verifyShopifyWebhook(request);
  if (!webhook) return new Response(null, { status: 401 });
  if (webhook.topic !== "ORDERS_CANCELLED") return new Response(null, { status: 400 });
  const { shop } = webhook;
  const payload = webhook.payload as CancelledPayload;

  const orderGid = orderGidOf(payload);
  try {
    const conn = await findConnection(shop);
    if (!conn) {
      console.log(`[orders/cancelled] No store connection for ${shop}; nothing to do`);
      return new Response();
    }
    if (!orderGid) throw new Error("The delivery names no order");

    const cancelled = await recordCancellation(conn, orderGid, cancelledAtOf(payload));
    if (cancelled) {
      waitUntil(resolveTier(cancelled.customerId));
      return new Response();
    }
    if (mayStillArrive(payload)) {
      console.log(`[orders/cancelled] Order ${orderGid} for ${shop} is not recorded yet; Shopify will deliver its cancellation again`);
      return new Response(null, { status: 503 });
    }
    return new Response();
  } catch (error) {
    return webhookFailed(TOPIC, `Order ${orderGid ?? "(none)"} for ${shop} failed`, error);
  }
};
