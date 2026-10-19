import crypto from "node:crypto";
import { Session } from "@shopify/shopify-api";
import { setAbstractFetchFunc } from "@shopify/shopify-api/runtime";
import { graphql, HttpResponse } from "msw";
import { sessionStorage } from "~/shopify.server";
import { server } from "../../mocks/server";

/**
 * The real Shopify boundary for integration tests: deliveries signed the way
 * Shopify signs them (HMAC of the body with the app's client secret, which
 * test/setup sets as SHOPIFY_API_SECRET), an offline session in Postgres,
 * and Admin GraphQL answered by MSW. Nothing here mocks authenticate.
 */

// The Shopify runtime captured the global fetch when it loaded, before MSW
// patched it; resolve it per call so Admin GraphQL reaches MSW (and nothing
// else: an unhandled request fails the test).
setAbstractFetchFunc((input, init) => globalThis.fetch(input, init));

export function signedWebhook(topic: string, shop: string, payload: unknown, webhookId = crypto.randomUUID()): Request {
  const body = JSON.stringify(payload);
  const hmac = crypto.createHmac("sha256", process.env.SHOPIFY_API_SECRET!).update(body, "utf8").digest("base64");
  return new Request(`https://test.example.com/webhooks/${topic}`, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Topic": topic,
      "X-Shopify-Shop-Domain": shop,
      "X-Shopify-Hmac-Sha256": hmac,
      "X-Shopify-Webhook-Id": webhookId,
      "X-Shopify-API-Version": "2026-01",
    },
  });
}

/** The offline session authenticate.webhook and unauthenticated.admin load. */
export async function seedOfflineSession(shop: string): Promise<void> {
  await sessionStorage.storeSession(
    new Session({
      id: `offline_${shop}`,
      shop,
      state: "state",
      isOnline: false,
      scope: "read_customers,write_store_credit_account_transactions",
      accessToken: "shpat_integration",
    }),
  );
}

export type StoreCreditCall = { operation: "credit" | "debit"; customerId: string; amount: string; currency: string };

/**
 * Answer the store-credit GraphQL the app sends for `shop`, keeping one
 * balance per customer. Returns the calls made, for assertions.
 * `duringCredit` runs while a credit is in flight, before Shopify answers.
 * The next `throttled` credits or debits are turned away with a GraphQL
 * THROTTLED error (nothing applied). The ones after that are applied, but:
 * - the next `unanswered` lose their answer, as when the connection drops;
 * - the next `internalErrors` are answered 200 with a top-level
 *   INTERNAL_SERVER_ERROR, Shopify's GraphQL form of a 500;
 * - the next `badGateways` are answered 502.
 */
export function mockStoreCredit(
  shop: string,
  balances: Record<string, number>,
  options: { duringCredit?: () => Promise<void>; throttled?: number; unanswered?: number; internalErrors?: number; badGateways?: number } = {},
): StoreCreditCall[] {
  const calls: StoreCreditCall[] = [];
  let throttled = options.throttled ?? 0;
  let unanswered = options.unanswered ?? 0;
  let internalErrors = options.internalErrors ?? 0;
  let badGateways = options.badGateways ?? 0;
  const turnedAway = () => {
    if (throttled === 0) return null;
    throttled--;
    return HttpResponse.json({ errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] });
  };
  const answer = (body: Record<string, unknown>) => {
    if (unanswered > 0) {
      unanswered--;
      return HttpResponse.error();
    }
    if (internalErrors > 0) {
      internalErrors--;
      return HttpResponse.json({
        errors: [{ message: "Internal error. Looks like something went wrong on our end.", extensions: { code: "INTERNAL_SERVER_ERROR", requestId: "test" } }],
      });
    }
    if (badGateways > 0) {
      badGateways--;
      return HttpResponse.json({ errors: "Bad Gateway" }, { status: 502 });
    }
    return HttpResponse.json(body);
  };
  const link = graphql.link(`https://${shop}/admin/api/2025-01/graphql.json`);
  const transaction = (customerId: string) => ({
    id: `gid://shopify/StoreCreditAccountDebitTransaction/${calls.length}`,
    amount: { amount: "0.00", currencyCode: "GBP" },
    balanceAfterTransaction: { amount: balances[customerId].toFixed(2), currencyCode: "GBP" },
  });
  const customerOf = (gid: unknown) => String(gid).split("/").pop()!;

  server.use(
    link.query("GetCustomerStoreCredit", ({ variables }) => {
      const customerId = customerOf(variables.customerId);
      return HttpResponse.json({
        data: {
          customer: {
            id: variables.customerId,
            email: null,
            displayName: "Shopper",
            storeCreditAccounts: {
              edges: [{ node: { id: "gid://shopify/StoreCreditAccount/1", balance: { amount: (balances[customerId] ?? 0).toFixed(2), currencyCode: "GBP" } } }],
            },
          },
        },
      });
    }),
    link.mutation("DebitStoreCredit", ({ variables }) => {
      const customerId = customerOf(variables.id);
      const { amount, currencyCode } = variables.debitInput.debitAmount;
      calls.push({ operation: "debit", customerId, amount, currency: currencyCode });
      const away = turnedAway();
      if (away) return away;
      balances[customerId] = (balances[customerId] ?? 0) - Number(amount);
      return answer({ data: { storeCreditAccountDebit: { storeCreditAccountTransaction: transaction(customerId), userErrors: [] } } });
    }),
    link.mutation("IssueStoreCredit", async ({ variables }) => {
      const customerId = customerOf(variables.id);
      const { amount, currencyCode } = variables.creditInput.creditAmount;
      calls.push({ operation: "credit", customerId, amount, currency: currencyCode });
      const away = turnedAway();
      if (away) return away;
      await options.duringCredit?.();
      balances[customerId] = (balances[customerId] ?? 0) + Number(amount);
      return answer({ data: { storeCreditAccountCredit: { storeCreditAccountTransaction: transaction(customerId), userErrors: [] } } });
    }),
  );
  return calls;
}

/**
 * Answer refunds/create's question about an order the app has not recorded:
 * whose it is (null for a guest checkout) and when it was placed.
 */
export function mockRefundedOrder(shop: string, order: { customerId: string | null; createdAt: Date }): void {
  server.use(
    graphql.link(`https://${shop}/admin/api/2025-01/graphql.json`).query("RefundedOrderCustomer", ({ variables }) =>
      HttpResponse.json({
        data: {
          order: {
            id: variables.id,
            createdAt: order.createdAt.toISOString(),
            customer: order.customerId ? { id: `gid://shopify/Customer/${order.customerId}` } : null,
          },
        },
      }),
    ),
  );
}

/**
 * An app proxy request signed the way Shopify signs it: HMAC-SHA256 (hex,
 * client secret) of the sorted `key=value` query pairs. `extra` pairs are
 * appended as given, so repeated keys can be sent; like the verifier, the
 * signature covers the last value of a repeated key.
 */
export function signedProxyRequest(
  path: string,
  shop: string,
  loggedInCustomerId: string,
  extra: Array<[string, string]> = [],
  init: RequestInit = {},
): Request {
  const pairs: Array<[string, string]> = [
    ["shop", shop],
    ["path_prefix", "/apps/rewardspro"],
    ["timestamp", String(Math.trunc(Date.now() / 1000))],
    ["logged_in_customer_id", loggedInCustomerId],
    ...extra,
  ];
  const signed = Object.entries(Object.fromEntries(pairs))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("");
  const signature = crypto.createHmac("sha256", process.env.SHOPIFY_API_SECRET!).update(signed).digest("hex");
  const query = new URLSearchParams([...pairs, ["signature", signature]]);
  return new Request(`https://test.example.com/api/proxy/${path}?${query}`, init);
}
