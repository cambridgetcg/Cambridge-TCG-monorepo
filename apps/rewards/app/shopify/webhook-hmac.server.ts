/**
 * The app's own check of a Shopify webhook delivery, for the routes that
 * never call Shopify (plan Decision 11, Ruling 42): app/uninstalled, the
 * three compliance topics, orders/cancelled, app/scopes_update and the
 * ignored topics.
 *
 * authenticate.webhook loads the store's offline session and refreshes an
 * expired token before the route runs, and a refresh Shopify refuses (as it
 * may after an uninstall, or when the refresh token has died) makes the route
 * answer 500. These topics need no session: this checks only Shopify's
 * signature, as the library does underneath (shopify-api's
 * validateHmacFromRequest), and never reads or refreshes a session, so it
 * starts no refresh either.
 *
 * The signature covers the body only, not the X-Shopify-Shop-Domain and
 * X-Shopify-Topic headers. For the topics that erase or switch a store off,
 * the signed body decides (Ruling 40): the header's shop must be the
 * payload's own domain, and the payload must have its topic's shape, so a
 * leaked signed delivery can't be replayed against another store or as
 * another topic.
 */
import crypto from "node:crypto";
import type { ActionFunctionArgs } from "react-router";
import { isCanonicalShop } from "~/lib/shop-domain";

export interface VerifiedWebhook {
  /** As the library names it: `app/uninstalled` is `APP_UNINSTALLED`. */
  topic: string;
  shop: string;
  webhookId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Shopify's JSON, read field by field by each route.
  payload: any;
}

const signatureOf = (body: string, secret: string) => crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");

/** Equal in constant time: lengths first, which a signature's leaks nothing about. */
function sameSignature(given: string, expected: string): boolean {
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type Payload = Record<string, unknown>;
const has = (payload: Payload, key: string) => Object.hasOwn(payload, key);

/**
 * For each topic whose body decides (Ruling 40): the payload field holding
 * the store's domain, and whether the payload has the topic's shape.
 */
const BOUND_TOPICS: Record<string, { domain: string; shaped: (payload: Payload) => boolean }> = {
  APP_UNINSTALLED: { domain: "myshopify_domain", shaped: () => true },
  SHOP_REDACT: { domain: "shop_domain", shaped: (p) => has(p, "shop_id") && !has(p, "customer") },
  CUSTOMERS_REDACT: { domain: "shop_domain", shaped: (p) => has(p, "customer") && has(p, "orders_to_redact") },
  CUSTOMERS_DATA_REQUEST: { domain: "shop_domain", shaped: (p) => has(p, "data_request") && has(p, "orders_requested") },
};

/** Whether a bound topic's payload names `shop` and has the topic's shape; any other topic passes. */
function boundToBody(topic: string, shop: string, payload: unknown): boolean {
  const bound = BOUND_TOPICS[topic];
  if (!bound) return true;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return false;
  return (payload as Payload)[bound.domain] === shop && bound.shaped(payload as Payload);
}

/**
 * The delivery, if Shopify signed it: the base64 HMAC-SHA256 of the raw body
 * with the app's client secret (SHOPIFY_API_SECRET) equals
 * X-Shopify-Hmac-Sha256, X-Shopify-Shop-Domain is a canonical
 * `*.myshopify.com` domain (the connection's own rule) and, for
 * app/uninstalled and the compliance topics, the signed body names that shop
 * and has the topic's shape (BOUND_TOPICS). Null for anything else (not a
 * POST, a header missing, a body that isn't the signed one or isn't JSON, a
 * shop or topic the body doesn't bear out, or no secret set); the route
 * answers 401.
 */
export async function verifyShopifyWebhook(request: Request): Promise<VerifiedWebhook | null> {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (request.method !== "POST" || !secret) return null;
  const hmac = request.headers.get("X-Shopify-Hmac-Sha256");
  const shop = request.headers.get("X-Shopify-Shop-Domain");
  const topic = request.headers.get("X-Shopify-Topic");
  const webhookId = request.headers.get("X-Shopify-Webhook-Id");
  if (!hmac || !shop || !topic || !webhookId) return null;

  const body = await request.text();
  if (body.length === 0 || !sameSignature(hmac, signatureOf(body, secret))) return null;
  if (!isCanonicalShop(shop)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return null;
  }
  const name = topic.toUpperCase().replace(/[/.]/g, "_");
  if (!boundToBody(name, shop, payload)) return null;
  return { topic: name, shop, webhookId, payload };
}

/**
 * The action of a route for a topic the released app subscribed to and the
 * rebuild ignores (spec 7, until the trimmed release B3): the delivery is
 * verified (401 when Shopify didn't sign it) and answered 200, so Shopify
 * stops sending it again. Nothing is read or written, and no session is
 * loaded (Ruling 42).
 */
export async function acknowledgeIgnoredTopic({ request }: ActionFunctionArgs): Promise<Response> {
  const webhook = await verifyShopifyWebhook(request);
  return new Response(null, { status: webhook ? 200 : 401 });
}

/**
 * When Shopify says the event happened (X-Shopify-Triggered-At), or
 * `receivedAt` when the header is missing or doesn't read. Never later than
 * `receivedAt`: the header is not covered by the signature, and the cap stops
 * a forged future time. It does not stop a replay: a signed delivery replayed
 * without the header is dated at its receipt, which looks fresh. What limits
 * a replay is the signed body's binding to its own store (Ruling 40).
 */
export function triggeredAtOf(request: Request, receivedAt: Date): Date {
  const header = request.headers.get("X-Shopify-Triggered-At");
  const at = header ? new Date(header) : null;
  if (!at || Number.isNaN(at.getTime()) || at > receivedAt) return receivedAt;
  return at;
}
