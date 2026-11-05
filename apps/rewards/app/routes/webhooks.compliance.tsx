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
 * The privacy topics apply to an uninstalled store's rows too, which are
 * kept until shop/redact. A store never seen answers 200. Any failure answers
 * 500, so the obligation isn't lost: Shopify delivers it again. Logs carry the
 * shop and counts only, never the buyer's ids or details.
 */
import type { ActionFunctionArgs } from "react-router";
import { eraseMerchant, openPrivacyRequest, redactCustomer } from "~/lib/erasure.server";
import { findConnection } from "~/lib/merchant.server";
import { verifyShopifyWebhook } from "~/shopify/webhook-hmac.server";

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

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const TOPICS = new Set(["CUSTOMERS_DATA_REQUEST", "CUSTOMERS_REDACT", "SHOP_REDACT"]);

export const action = async ({ request }: ActionFunctionArgs) => {
  const receivedAt = new Date();
  const webhook = await verifyShopifyWebhook(request);
  if (!webhook) return new Response(null, { status: 401 });
  const { topic, shop } = webhook;
  if (!TOPICS.has(topic)) return new Response(null, { status: 400 });
  const payload = (webhook.payload ?? {}) as PrivacyPayload;

  try {
    if (topic === "SHOP_REDACT") {
      const deleted = await eraseMerchant(shop);
      const total = Object.values(deleted).reduce((sum, n) => sum + n, 0);
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
      if (externalCustomerId === null) throw new Error("The delivery names no customer");
      const { found } = await redactCustomer(conn, externalCustomerId);
      console.log(`[compliance] customers/redact for ${shop}: ${found ? "customer erased" : "no such customer"}`);
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
    console.error(`[compliance] ${topic} for ${shop} failed; Shopify will deliver it again: ${messageOf(error)}`);
    return new Response(null, { status: 500 });
  }
};
