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
 */
export function mockStoreCredit(
  shop: string,
  balances: Record<string, number>,
  options: { failDebits?: number } = {},
): StoreCreditCall[] {
  const calls: StoreCreditCall[] = [];
  let failDebits = options.failDebits ?? 0;
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
      if (failDebits > 0) {
        failDebits--;
        return HttpResponse.json({ data: { storeCreditAccountDebit: { storeCreditAccountTransaction: null, userErrors: [{ field: null, message: "Temporarily unavailable", code: "INTERNAL" }] } } });
      }
      balances[customerId] = (balances[customerId] ?? 0) - Number(amount);
      return HttpResponse.json({ data: { storeCreditAccountDebit: { storeCreditAccountTransaction: transaction(customerId), userErrors: [] } } });
    }),
    link.mutation("IssueStoreCredit", ({ variables }) => {
      const customerId = customerOf(variables.id);
      const { amount, currencyCode } = variables.creditInput.creditAmount;
      calls.push({ operation: "credit", customerId, amount, currency: currencyCode });
      balances[customerId] = (balances[customerId] ?? 0) + Number(amount);
      return HttpResponse.json({ data: { storeCreditAccountCredit: { storeCreditAccountTransaction: transaction(customerId), userErrors: [] } } });
    }),
  );
  return calls;
}
