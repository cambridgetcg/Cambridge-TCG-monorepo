/**
 * app/uninstalled: stop work and delete the store's sessions (spec 7). The
 * connection is marked uninstalled, which stops its webhooks and jobs, and
 * every other row stays: shop/redact erases them 48 h later, and a
 * reinstall before that carries on with its payouts (rule 12).
 *
 * Checked by the app's own signature check, never a session, so an expired
 * token can't make it answer 500 (plan Decision 11); the shop header must be
 * the signed payload's `myshopify_domain`, or it answers 401 (Ruling 40),
 * so a leaked delivery can't switch another store off. The uninstall is dated
 * by Shopify's X-Shopify-Triggered-At (its receipt, when that is missing or
 * doesn't read): one from before the store's last open or reactivation is
 * stale, overtaken by a reinstall, and neither marks the store nor deletes its
 * fresh session (Ruling 13). Any failure answers 500 and reaches monitoring,
 * so Shopify delivers it again.
 */
import type { ActionFunctionArgs } from "react-router";
import { markUninstalled } from "~/lib/merchant.server";
import { webhookFailed } from "~/lib/webhook-helpers.server";
import { triggeredAtOf, verifyShopifyWebhook } from "~/shopify/webhook-hmac.server";
import prisma from "../db.server";

// The function's ceiling, which vercelPreset reads per route (OPERATIONS-5)
export const config = { maxDuration: 300 };

export const action = async ({ request }: ActionFunctionArgs) => {
  const receivedAt = new Date();
  const webhook = await verifyShopifyWebhook(request);
  if (!webhook) return new Response(null, { status: 401 });
  if (webhook.topic !== "APP_UNINSTALLED") return new Response(null, { status: 400 });
  const { shop } = webhook;

  try {
    const outcome = await markUninstalled(shop, triggeredAtOf(request, receivedAt));
    if (outcome === "stale") {
      console.log(`[app/uninstalled] ${shop} has opened the app since this uninstall; it stays installed`);
      return new Response();
    }
    const { count } = await prisma.session.deleteMany({ where: { shop } });
    console.log(`[app/uninstalled] ${shop}: ${outcome}, ${count} session(s) deleted`);
    return new Response();
  } catch (error) {
    return webhookFailed("app/uninstalled", `${shop} failed`, error);
  }
};
