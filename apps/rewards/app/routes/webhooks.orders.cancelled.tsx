/**
 * orders/cancelled: mark the recorded order cancelled, answer, then resolve
 * the buyer's tier under waitUntil. A cancelled order stops counting toward
 * tier spend (plan Decision 7); no money moves here, because money returned
 * on a cancellation arrives as its own refunds/create. Shopify is not called,
 * so no session is needed. Any failure answers 500.
 */
import type { ActionFunctionArgs } from "react-router";
import { findConnection } from "~/lib/merchant.server";
import { recordCancellation } from "~/lib/record-order.server";
import { resolveTier } from "~/lib/tiers.server";
import { waitUntil } from "~/lib/wait-until.server";
import { authenticate } from "../shopify.server";

const ORDER_GID = /^gid:\/\/shopify\/Order\/\d+$/;

/** The order's id and cancellation time from the payload (now, when it gives none that reads). */
function cancellationOf(payload: unknown): { orderGid: string | null; cancelledAt: Date } {
  const order = payload as { admin_graphql_api_id?: unknown; cancelled_at?: unknown } | null;
  const gid = order?.admin_graphql_api_id;
  const at = typeof order?.cancelled_at === "string" ? new Date(order.cancelled_at) : null;
  return {
    orderGid: typeof gid === "string" && ORDER_GID.test(gid) ? gid : null,
    cancelledAt: at && !Number.isNaN(at.getTime()) ? at : new Date(),
  };
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const action = async ({ request }: ActionFunctionArgs) => {
  // Throws a 401 Response for a delivery Shopify did not sign.
  const { topic, shop, payload } = await authenticate.webhook(request);
  if (topic !== "ORDERS_CANCELLED") return new Response(null, { status: 400 });

  const { orderGid, cancelledAt } = cancellationOf(payload);
  try {
    const conn = await findConnection(shop);
    if (!conn) {
      console.log(`[orders/cancelled] No store connection for ${shop}; nothing to do`);
      return new Response();
    }
    if (!orderGid) throw new Error("The delivery names no order");

    const cancelled = await recordCancellation(conn, orderGid, cancelledAt);
    if (cancelled) waitUntil(resolveTier(cancelled.customerId));
    return new Response();
  } catch (error) {
    console.error(`[orders/cancelled] Order ${orderGid ?? "(none)"} for ${shop} failed; Shopify will deliver it again: ${messageOf(error)}`);
    return new Response(null, { status: 500 });
  }
};
