/**
 * app/scopes_update: store the scopes the merchant has now granted on the
 * store's offline session, as the template does, by shop.
 *
 * Shopify is never called, so the delivery is checked by the app's own
 * signature check and no session is loaded (Ruling 42): a token refresh
 * Shopify refuses can't make it answer 500, and it starts no refresh. Any
 * failure answers 500 and reaches monitoring.
 */
import type { ActionFunctionArgs } from "react-router";
import { webhookFailed } from "~/lib/webhook-helpers.server";
import { verifyShopifyWebhook } from "~/shopify/webhook-hmac.server";
import prisma from "../db.server";

const TOPIC = "app/scopes_update";

// The function's ceiling, which vercelPreset reads per route (OPERATIONS-5)
export const config = { maxDuration: 300 };

export const action = async ({ request }: ActionFunctionArgs) => {
  const webhook = await verifyShopifyWebhook(request);
  if (!webhook) return new Response(null, { status: 401 });
  if (webhook.topic !== "APP_SCOPES_UPDATE") return new Response(null, { status: 400 });
  const { shop } = webhook;

  try {
    const current = (webhook.payload as { current?: unknown } | null)?.current;
    if (!Array.isArray(current) || !current.every((scope) => typeof scope === "string")) {
      throw new Error("The delivery names no granted scopes");
    }
    const { count } = await prisma.session.updateMany({ where: { shop, isOnline: false }, data: { scope: current.toString() } });
    console.log(`[app/scopes_update] ${shop}: scopes stored on ${count} session(s)`);
    return new Response();
  } catch (error) {
    return webhookFailed(TOPIC, `${shop} failed`, error);
  }
};
