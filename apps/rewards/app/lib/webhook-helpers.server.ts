/**
 * The pieces every webhook route shares (A13-F3): reading the order id from
 * a payload, and answering 500 for a failure Shopify should deliver again,
 * logged and sent to monitoring (OPERATIONS-1). The designed answers (401 for
 * a delivery Shopify didn't sign, 503 for one to try again later) are not
 * failures and never come here.
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
