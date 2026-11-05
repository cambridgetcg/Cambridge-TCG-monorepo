import type { GraphqlClient } from "./graphql";

/**
 * One Admin API call with a time limit, shared by the payout rail and the
 * order source. Never retried here: each caller decides what an unanswered
 * call means.
 */

/** Shopify gave no answer in time; the request was aborted. */
export class ShopifyTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Shopify did not answer within ${timeoutMs / 1000} s`);
    this.name = "ShopifyTimeoutError";
  }
}

/**
 * Sends one document and reads Shopify's answer, giving up after `timeoutMs`.
 * The request's signal is aborted then too, but the timer settles the call
 * even when the client doesn't honour the signal. Never retried.
 */
export async function askShopify(
  admin: GraphqlClient,
  query: string,
  variables: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ShopifyTimeoutError(timeoutMs));
      controller.abort();
    }, timeoutMs);
  });
  const call = (async () => {
    const response = await admin.graphql(query, { variables, signal: controller.signal });
    return response.json();
  })();
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
