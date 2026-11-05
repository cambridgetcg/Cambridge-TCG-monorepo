/**
 * Who is asking through the app proxy (spec 7, plan Decisions 10 and 18).
 *
 * Shopify forwards `/apps/rewardspro/*` to `/api/proxy/*` and signs every
 * request. The shop is only ever the signed `shop`, and the buyer only ever
 * the signed `logged_in_customer_id` (carried from apps/rewardspro's
 * getProxyCustomerId): a body field, `customer_id` or any other parameter
 * counts for nothing.
 *
 * The released widget appends its own `shop` and `logged_in_customer_id` to
 * the proxy URL (Review Focus 1). Where Shopify forwards both copies, the
 * library refuses the request (shopify-api 15 lets `shop` appear only once),
 * so the app checks Shopify's signature itself, with each repeated key's
 * values joined by commas as Shopify signs them. It accepts the request only
 * when every copy of `shop` is the same, and treats differing buyer ids as a
 * guest: a visitor can add a copy, but Shopify's own copy is always signed
 * with it.
 *
 * After the check, each shop and buyer (or the shop's guests together) may
 * make 30 requests a minute, counted in this instance's memory.
 */
import crypto from "node:crypto";
import { SessionNotFoundError } from "@shopify/shopify-app-react-router/server";
import { isCanonicalShop } from "~/lib/shop-domain";
import { authenticate, unauthenticated } from "~/shopify.server";
import type { GraphqlClient } from "./graphql";

export interface VerifiedProxyRequest {
  shop: string;
  /** Shopify's numeric customer id; null for a guest. */
  customerId: string | null;
  /** The store's Admin API client; undefined when it has no offline session. */
  admin: GraphqlClient | undefined;
}

/** How far a request's signed timestamp may be from now, as the library allows. */
const TIMESTAMP_TOLERANCE_SECONDS = 90;

export const RATE_LIMIT = 30;
export const RATE_WINDOW_MS = 60 * 1000;

const badRequest = () => new Response(undefined, { status: 400, statusText: "Bad Request" });

/**
 * Shopify's app proxy signature of a query: drop `signature`, write each key
 * as `key=value` with its URL-decoded values joined by `,`, sort those
 * strings and concatenate them with no separator; the signature is the hex
 * HMAC-SHA256 of that with the app's client secret.
 */
export function proxySignature(params: URLSearchParams, secret: string): string {
  const values = new Map<string, string[]>();
  for (const [key, value] of params) {
    if (key === "signature") continue;
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const message = [...values]
    .map(([key, list]) => `${key}=${list.join(",")}`)
    .sort()
    .join("");
  return crypto.createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

/**
 * Whether Shopify signed this query just now: one `signature`, equal (in
 * constant time) to proxySignature's, and one whole-second `timestamp`
 * within 90 seconds of the clock.
 */
export function proxyQueryVerified(params: URLSearchParams, secret: string): boolean {
  const signatures = params.getAll("signature");
  const timestamps = params.getAll("timestamp");
  if (signatures.length !== 1 || timestamps.length !== 1 || !/^\d+$/.test(timestamps[0])) return false;
  if (Math.abs(Math.trunc(Date.now() / 1000) - Number(timestamps[0])) > TIMESTAMP_TOLERANCE_SECONDS) return false;
  const given = Buffer.from(signatures[0], "utf8");
  const expected = Buffer.from(proxySignature(params, secret), "utf8");
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * The signed buyer: every copy of `logged_in_customer_id` the same, and not
 * empty, `null` or `undefined` (as the released widget may write for a
 * guest). Anything else is a guest.
 */
function buyerOf(params: URLSearchParams): string | null {
  const values = params.getAll("logged_in_customer_id");
  if (values.length === 0 || values.some((value) => value !== values[0])) return null;
  const [id] = values;
  if (!id || id === "null" || id === "undefined") return null;
  return id;
}

/** The store's Admin API client through its offline session, refreshed if due; undefined without one. */
async function adminFor(shop: string): Promise<GraphqlClient | undefined> {
  try {
    return (await unauthenticated.admin(shop)).admin;
  } catch (error) {
    if (error instanceof SessionNotFoundError) return undefined;
    throw error;
  }
}

/** The library refused it; was that for a `shop` or `logged_in_customer_id` sent more than once? */
function repeatsIdentity(params: URLSearchParams): boolean {
  return params.getAll("shop").length > 1 || params.getAll("logged_in_customer_id").length > 1;
}

// Each key's request times within the last minute, oldest first
const recent = new Map<string, number[]>();
// The map is swept of keys with nothing in the window once it holds this many
const SWEEP_AT = 10_000;

/** Seconds until `key` may ask again, or 0 when this request is let through (and counted). */
function waitFor(key: string, now: number): number {
  if (recent.size >= SWEEP_AT) {
    for (const [k, times] of recent) {
      if (now - times[times.length - 1] >= RATE_WINDOW_MS) recent.delete(k);
    }
  }
  const times = (recent.get(key) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  if (times.length >= RATE_LIMIT) {
    recent.set(key, times);
    return Math.max(1, Math.ceil((times[0] + RATE_WINDOW_MS - now) / 1000));
  }
  times.push(now);
  recent.set(key, times);
  return 0;
}

/**
 * The shop, buyer and Admin API client of a request Shopify forwarded, or
 * the Response to answer instead: 400 when it isn't signed, is stale, or
 * names more than one shop; 429 when this shop and buyer have made 30
 * requests in the last minute.
 *
 * authenticate.public.appProxy checks the request first. Only when it
 * answers 400 and `shop` or `logged_in_customer_id` came more than once does
 * the app's own check (proxyQueryVerified) decide instead.
 */
export async function verifyProxyRequest(request: Request): Promise<VerifiedProxyRequest | Response> {
  const params = new URL(request.url).searchParams;
  let verified: VerifiedProxyRequest;
  try {
    const { admin } = await authenticate.public.appProxy(request);
    verified = { shop: params.get("shop") ?? "", customerId: buyerOf(params), admin };
  } catch (error) {
    if (!(error instanceof Response)) throw error;
    if (error.status !== 400 || !repeatsIdentity(params)) return error;
    const secret = process.env.SHOPIFY_API_SECRET;
    if (!secret || !proxyQueryVerified(params, secret)) return badRequest();
    const shops = params.getAll("shop");
    if (shops.some((shop) => shop !== shops[0])) return badRequest();
    const shop = shops[0] ?? "";
    // Before any session is looked up for it
    if (!isCanonicalShop(shop)) return badRequest();
    verified = { shop, customerId: buyerOf(params), admin: await adminFor(shop) };
  }
  // Signed by Shopify, so always a *.myshopify.com domain; never a store no connection could have
  if (!isCanonicalShop(verified.shop)) return badRequest();

  const retryAfter = waitFor(`${verified.shop}:${verified.customerId ?? "guest"}`, Date.now());
  if (retryAfter > 0) {
    return Response.json(
      { success: false, message: "Too many requests. Try again in a minute." },
      { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } },
    );
  }
  return verified;
}
