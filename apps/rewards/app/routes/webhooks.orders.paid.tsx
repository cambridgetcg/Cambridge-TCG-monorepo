/**
 * orders/paid (spec 6.3 rule 9): read the order from Shopify, record it and
 * its cashback, answer 200 inside Shopify's 5 s, and only then send the
 * credit and resolve the buyer's tier, under waitUntil. The hourly job is
 * the backstop for a send that never ran; an order this webhook never
 * records is found by its sweep (rule 13).
 *
 * The order's natural key makes a redelivery write nothing and send nothing
 * again. Any failure answers 500 and reaches monitoring, so Shopify delivers
 * it again and the operator hears of it. Nothing from the payload is logged
 * but the order id. It keeps authenticate.webhook: it needs the store's
 * Admin API (Ruling 42).
 */
import type { ActionFunctionArgs } from "react-router";
import { findConnection } from "~/lib/merchant.server";
import { sendPayout } from "~/lib/payouts.server";
import { recordOrder } from "~/lib/record-order.server";
import { resolveTier } from "~/lib/tiers.server";
import { waitUntil } from "~/lib/wait-until.server";
import { orderGidOf, readOr500, webhookFailed } from "~/lib/webhook-helpers.server";
import { OrderReadError, WEBHOOK_READ_DEADLINE_MS, createShopifyOrderSource } from "~/shopify/order-source.server";
import { createStoreCreditRail } from "~/shopify/store-credit-rail.server";
import { authenticate } from "../shopify.server";

const TOPIC = "orders/paid";

// The function's ceiling, which vercelPreset reads per route (OPERATIONS-5)
export const config = { maxDuration: 300 };

export const action = async ({ request }: ActionFunctionArgs) => {
  // From receipt, before authentication (which may refresh the token).
  const deadline = Date.now() + WEBHOOK_READ_DEADLINE_MS;
  // Throws a 401 Response for a delivery Shopify did not sign.
  const { topic, shop, payload, admin } = await authenticate.webhook(request);
  if (topic !== "ORDERS_PAID") return new Response(null, { status: 400 });

  const orderGid = orderGidOf(payload);
  try {
    const conn = await findConnection(shop);
    if (!conn) {
      console.log(`[orders/paid] No store connection for ${shop}; nothing to do`);
      return new Response();
    }
    if (!admin) {
      console.error(`[orders/paid] No usable session for ${shop}; Shopify will deliver it again`);
      return new Response(null, { status: 500 });
    }
    if (!orderGid) throw new Error("The delivery names no order");

    const facts = await readOr500(TOPIC, `Could not read order ${orderGid} for ${shop}`, OrderReadError, () =>
      createShopifyOrderSource(admin).readOrder(orderGid, { deadline }),
    );
    if (facts instanceof Response) return facts;
    // Shopify has no such order (deleted since)
    if (!facts) return new Response();

    const result = await recordOrder(conn, facts, "live");
    if (result.status !== "no_customer") {
      const payoutId = result.status === "recorded" ? result.payoutId : null;
      const rail = createStoreCreditRail(admin);
      waitUntil(
        (async () => {
          if (payoutId) await sendPayout(payoutId, rail);
          await resolveTier(result.customerId);
        })(),
      );
    }
    return new Response();
  } catch (error) {
    return webhookFailed(TOPIC, `Order ${orderGid ?? "(none)"} for ${shop} failed`, error);
  }
};
