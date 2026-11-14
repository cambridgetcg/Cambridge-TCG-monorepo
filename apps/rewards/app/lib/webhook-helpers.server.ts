/**
 * The pieces every webhook route shares (A13-F3): reading the order id from
 * a payload, and answering 500 for a failure Shopify should deliver again,
 * logged and sent to monitoring (OPERATIONS-1), a 500 authenticate.webhook
 * throws included (M2b-F4). The designed answers (401 for a delivery Shopify
 * didn't sign, 503 for one to try again later) are not failures and never
 * come here.
 */
import { monitoring } from "./telemetry.server";

const ORDER_GID = /^gid:\/\/shopify\/Order\/\d+$/;

/** The order's GID from an order payload (`admin_graphql_api_id`), or null when it names none. */
export function orderGidOf(payload: unknown): string | null {
  const gid = (payload as { admin_graphql_api_id?: unknown } | null)?.admin_graphql_api_id;
  return typeof gid === "string" && ORDER_GID.test(gid) ? gid : null;
}

export const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The 500 for a delivery of `topic` (Shopify's name, e.g. `orders/paid`)
 * that failed: logged as `[topic] <what>; Shopify will deliver it again:
 * <message>` and sent to monitoring with a `webhook.topic` tag. `what` names
 * the store and the order or refund, never a buyer.
 */
export function webhookFailed(topic: string, what: string, error: unknown): Response {
  console.error(`[${topic}] ${what}; Shopify will deliver it again: ${messageOf(error)}`);
  monitoring.captureException(error, { tags: { "webhook.topic": topic } });
  return new Response(null, { status: 500 });
}

/**
 * What `authenticate()` (the route's authenticate.webhook) answers. A
 * Response of 500 or more it throws, as when the store's token refresh
 * fails (a refresh token Shopify no longer accepts gives no session instead,
 * from 4.0.3, and the route answers that itself), is logged and reported with the `webhook.topic` tag, then
 * thrown on, so the delivery is still answered with it: React Router never
 * hands a thrown Response to the server's error handler (M2b-F4). A 4xx (a
 * delivery Shopify did not sign) and a 503 (another renewal of the store's
 * token is running, so Shopify is to deliver it again: Ruling 85, reported
 * by the session storage itself) are designed answers, thrown on unreported.
 * A verified delivery's store names every failure it reports (OPERATIONS-8).
 */
export async function authenticatedWebhook<T extends { shop: string }>(topic: string, authenticate: () => Promise<T>): Promise<T> {
  try {
    const delivery = await authenticate();
    monitoring.tagShop(delivery.shop);
    return delivery;
  } catch (error) {
    if (error instanceof Response && error.status >= 500 && error.status !== 503) {
      console.error(`[${topic}] Authenticating the delivery answered HTTP ${error.status}; Shopify will deliver it again`);
      monitoring.captureException(new Error(`authenticate.webhook answered HTTP ${error.status}`), { tags: { "webhook.topic": topic } });
    }
    throw error;
  }
}

/** The error a delivery whose store has no usable offline session is reported with. */
export const NO_USABLE_SESSION = "The store has no usable offline session";

/**
 * `read()`'s result, or the 500 (webhookFailed, as `what`) when it throws a
 * `ReadError`: Shopify couldn't be read, so the delivery is to come again.
 * Any other error is thrown on, to the route's own catch.
 */
export async function readOr500<T>(
  topic: string,
  what: string,
  ReadError: abstract new (...args: never[]) => Error,
  read: () => Promise<T>,
): Promise<T | Response> {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof ReadError)) throw error;
    return webhookFailed(topic, what, error);
  }
}
