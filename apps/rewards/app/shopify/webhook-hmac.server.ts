/**
 * The app's own check of a Shopify webhook delivery, for the routes that
 * never call Shopify (plan Decision 11, Ruling 42): app/uninstalled, the
 * three compliance topics, orders/cancelled and app/scopes_update.
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
import { isCanonicalShop } from "~/lib/shop-domain";
import { monitoring } from "~/lib/telemetry.server";

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

/** A header value or field name fit for a log line: anything but letters, digits, `_./-` becomes "?". */
const safe = (value: string | null) => (value ?? "?").slice(0, 100).replace(/[^\w./-]/g, "?");

/** The body's field names (never their values), for a refusal's log line. */
const fieldsOf = (payload: Payload) => `(body fields: ${Object.keys(payload).sort().slice(0, 20).map(safe).join(", ")})`;

/**
 * Why a bound topic's payload doesn't name `shop` or lacks the topic's shape,
 * or null when it does; any other topic passes.
 */
function unboundReason(topic: string, shop: string, payload: unknown): string | null {
  const bound = BOUND_TOPICS[topic];
  if (!bound) return null;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return "the body isn't a JSON object";
  if ((payload as Payload)[bound.domain] !== shop) return `the body's ${bound.domain} isn't the header's shop ${fieldsOf(payload as Payload)}`;
  if (!bound.shaped(payload as Payload)) return `the body hasn't the topic's fields ${fieldsOf(payload as Payload)}`;
  return null;
}

/**
 * Logs why a delivery is refused, so a 401 Shopify keeps retrying can be
 * explained (production, 2026-11-07: compliance deliveries were refused with
 * no trace of which check failed). Never a body value, a signature or the
 * secret.
 */
function refuse(topic: string | null, shop: string | null, reason: string): null {
  console.warn(`[webhook] refused ${safe(topic)} from ${safe(shop)}: ${reason}`);
  return null;
}

/**
 * The delivery, if Shopify signed it: the base64 HMAC-SHA256 of the raw body
 * with the app's client secret (SHOPIFY_API_SECRET) equals
 * X-Shopify-Hmac-Sha256, X-Shopify-Shop-Domain is a canonical
 * `*.myshopify.com` domain (the connection's own rule) and, for
 * app/uninstalled and the compliance topics, the signed body names that shop
 * and has the topic's shape (BOUND_TOPICS). Null for anything else (not a
 * POST, a header missing, a body that isn't the signed one or isn't JSON, a
 * shop or topic the body doesn't bear out, or no secret set), logged with
 * the reason (refuse); the route answers 401. A verified delivery's store
 * names every failure it reports (OPERATIONS-8).
 */
export async function verifyShopifyWebhook(request: Request): Promise<VerifiedWebhook | null> {
  const secret = process.env.SHOPIFY_API_SECRET;
  const hmac = request.headers.get("X-Shopify-Hmac-Sha256");
  const shop = request.headers.get("X-Shopify-Shop-Domain");
  const topic = request.headers.get("X-Shopify-Topic");
  const webhookId = request.headers.get("X-Shopify-Webhook-Id");
  if (request.method !== "POST") return refuse(topic, shop, "it isn't a POST");
  if (!secret) return refuse(topic, shop, "the app's secret isn't set");
  const missing = Object.entries({ "X-Shopify-Hmac-Sha256": hmac, "X-Shopify-Shop-Domain": shop, "X-Shopify-Topic": topic, "X-Shopify-Webhook-Id": webhookId })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (!hmac || !shop || !topic || !webhookId) return refuse(topic, shop, `a header is missing (${missing.join(", ")})`);

  const body = await request.text();
  if (body.length === 0) return refuse(topic, shop, "the body is empty");
  if (!sameSignature(hmac, signatureOf(body, secret))) return refuse(topic, shop, "the signature doesn't match");
  if (!isCanonicalShop(shop)) return refuse(topic, shop, "the shop header isn't a myshopify.com domain");
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return refuse(topic, shop, "the body isn't JSON");
  }
  const name = topic.toUpperCase().replace(/[/.]/g, "_");
  const unbound = unboundReason(name, shop, payload);
  if (unbound) return refuse(topic, shop, unbound);
  monitoring.tagShop(shop);
  return { topic: name, shop, webhookId, payload };
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
