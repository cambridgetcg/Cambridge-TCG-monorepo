/**
 * The three compliance topics on one URI (spec 7), carried from
 * apps/rewardspro's webhooks.compliance.tsx:
 * - customers/data_request opens a privacy request, due in 30 days, whose
 *   report the merchant downloads from Settings;
 * - customers/redact blanks the buyer's row and closes what was still to be
 *   paid to or taken from them;
 * - shop/redact erases the merchant.
 *
 * Checked by the app's own signature check, never a session (plan Decision
 * 11): these come after an uninstall, when the token may be long expired.
 * The check also holds the delivery to its signed body: the shop header must
 * be the payload's `shop_domain`, and the payload must have its topic's
 * shape, or it answers 401 (Ruling 40). The privacy topics apply to an
 * uninstalled store's rows too, which are kept until shop/redact. A store
 * never seen answers 200, and so does shop/redact for a store that is active
 * again, which erases nothing (Ruling 41). A customers/redact for a buyer not
 * seen yet answers 503 while the store's past-orders import is not done
 * (CONCURRENCY-5), so Shopify brings it again once the import has written
 * that buyer's orders. Any failure answers 500 and reaches monitoring, so the
 * obligation isn't lost: Shopify delivers it again. Logs carry the shop and
 * counts only, never the buyer's ids or details.
 */
import type { ActionFunctionArgs } from "react-router";
import { eraseMerchant, openPrivacyRequest, redactCustomer } from "~/lib/erasure.server";
import { findConnection } from "~/lib/merchant.server";
import { webhookFailed } from "~/lib/webhook-helpers.server";
import { verifyShopifyWebhook } from "~/shopify/webhook-hmac.server";

// The function's ceiling, which vercelPreset reads per route (OPERATIONS-5)
export const config = { maxDuration: 300 };

/** A Shopify numeric id from a payload (a number or a digit string), or null. */
function idOf(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  return null;
}

type PrivacyPayload = {
  customer?: { id?: unknown } | null;
  orders_requested?: unknown;
  data_request?: { id?: unknown } | null;
};

/** The topics served here, by the library's name, with Shopify's. */
const TOPICS = new Map([
  ["CUSTOMERS_DATA_REQUEST", "customers/data_request"],
  ["CUSTOMERS_REDACT", "customers/redact"],
  ["SHOP_REDACT", "shop/redact"],
]);

export const action = async ({ request }: ActionFunctionArgs) => {
  const receivedAt = new Date();
  const webhook = await verifyShopifyWebhook(request);
  if (!webhook) return new Response(null, { status: 401 });
  const { topic, shop } = webhook;
  const topicName = TOPICS.get(topic);
  if (!topicName) return new Response(null, { status: 400 });
  const payload = (webhook.payload ?? {}) as PrivacyPayload;

  try {
    if (topic === "SHOP_REDACT") {
      const erasure = await eraseMerchant(shop);
      if (erasure.status === "skipped_active") {
        console.log(`[compliance] ${shop}: shop/redact skipped: store is active`);
        return new Response();
      }
      const total = Object.values(erasure.deleted).reduce((sum, n) => sum + n, 0);
      console.log(`[compliance] shop/redact for ${shop}: ${total} row(s) erased`);
      return new Response();
    }

    const conn = await findConnection(shop, { evenUninstalled: true });
    if (!conn) {
      console.log(`[compliance] ${topic} for ${shop}, a store with no connection; nothing to do`);
      return new Response();
    }
    const externalCustomerId = idOf(payload.customer?.id);

    if (topic === "CUSTOMERS_REDACT") {
      // Nothing can be acted on, and a redelivery would name no one either
      if (externalCustomerId === null) {
        console.log(`[compliance] customers/redact for ${shop} names no customer; nothing to erase`);
        return new Response();
      }
      const redaction = await redactCustomer(conn, externalCustomerId);
      if (!redaction.found && !redaction.importDone) {
        console.log(`[compliance] customers/redact for ${shop}: no such customer while the past-orders import runs; Shopify will deliver it again`);
        return new Response(null, { status: 503 });
      }
      console.log(`[compliance] customers/redact for ${shop}: ${redaction.found ? "customer erased" : "no such customer"}`);
      return new Response();
    }

    const ordersRequested = (Array.isArray(payload.orders_requested) ? payload.orders_requested : [])
      .map(idOf)
      .filter((id): id is string => id !== null)
      .map((id) => `gid://shopify/Order/${id}`);
    await openPrivacyRequest(conn, {
      externalCustomerId,
      shopifyRequestId: idOf(payload.data_request?.id),
      ordersRequested,
      now: receivedAt,
    });
    console.log(`[compliance] customers/data_request for ${shop}: request open`);
    return new Response();
  } catch (error) {
    return webhookFailed(topicName, `${shop} failed`, error);
  }
};
