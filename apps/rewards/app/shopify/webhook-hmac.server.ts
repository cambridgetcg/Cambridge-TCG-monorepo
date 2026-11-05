/**
 * The app's own check of a Shopify webhook delivery, for app/uninstalled and
 * the three compliance topics (plan Decision 11).
 *
 * authenticate.webhook loads the store's offline session and refreshes an
 * expired token before the route runs, and a refresh Shopify refuses (as it
 * may after an uninstall) makes the route answer 500. These topics never call
 * Shopify, so they need no session: this checks only Shopify's signature, as
 * the library does underneath (shopify-api's validateHmacFromRequest), and
 * never reads or refreshes a session.
 */
import crypto from "node:crypto";
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

/**
 * The delivery, if Shopify signed it: the base64 HMAC-SHA256 of the raw body
 * with the app's client secret (SHOPIFY_API_SECRET) equals
 * X-Shopify-Hmac-Sha256, and X-Shopify-Shop-Domain is a canonical
 * `*.myshopify.com` domain (the connection's own rule). Null for anything
 * else (not a POST, a header missing, a body that isn't the signed one or
 * isn't JSON, or no secret set); the route answers 401.
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
  return { topic: topic.toUpperCase().replace(/[/.]/g, "_"), shop, webhookId, payload };
}

/**
 * When Shopify says the event happened (X-Shopify-Triggered-At), or
 * `receivedAt` when the header is missing or doesn't read. Never later than
 * `receivedAt`: the header is not covered by the signature.
 */
export function triggeredAtOf(request: Request, receivedAt: Date): Date {
  const header = request.headers.get("X-Shopify-Triggered-At");
  const at = header ? new Date(header) : null;
  if (!at || Number.isNaN(at.getTime()) || at > receivedAt) return receivedAt;
  return at;
}
