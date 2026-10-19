import {
  GraphqlQueryError,
  HttpInternalError,
  HttpRequestError,
  HttpResponseError,
  HttpThrottlingError,
  MissingRequiredArgument,
} from "@shopify/shopify-api";
import { describe, expect, it, vi } from "vitest";
import { ShopifyStoreCreditService } from "~/services/shopify-store-credit.service";

/**
 * A 200 carrying top-level GraphQL errors, as @shopify/shopify-api 11 throws
 * it (throwFailedRequest): `body` is the client's response, with the errors
 * under `errors.graphQLErrors` and any partial `data` beside them.
 */
function graphqlErrors(errors: Array<Record<string, unknown>>, data?: Record<string, unknown>) {
  return new GraphqlQueryError({
    message: String(errors[0]?.message ?? "GraphQL operation failed"),
    response: {},
    body: { ...(data ? { data } : {}), errors: { networkStatusCode: 200, message: "GraphQL Client: An error occurred while fetching from the API. Review 'graphQLErrors' for details.", graphQLErrors: errors } },
  });
}
const coded = (code: string, extra: Record<string, unknown> = {}) => ({ message: code, extensions: { code }, ...extra });
const transaction = { id: "gid://shopify/StoreCreditAccountTransaction/1", amount: { amount: "5.00", currencyCode: "GBP" }, balanceAfterTransaction: { amount: "5.00", currencyCode: "GBP" } };

// What the Admin GraphQL client throws, and whether Shopify may have applied
// the credit or debit: GraphqlQueryError for a 200 with GraphQL errors, an
// HttpResponseError subclass for a 4xx or 5xx (or a 200 it could not read),
// HttpRequestError when no answer came. The admin and webhook contexts
// rethrow an HttpResponseError as a Response with its status.
const thrown: Array<[string, unknown, boolean]> = [
  ["Shopify throttled the query (THROTTLED)", graphqlErrors([coded("THROTTLED")]), false],
  ["the token may not do this (ACCESS_DENIED)", graphqlErrors([coded("ACCESS_DENIED")]), false],
  ["the shop is inactive (SHOP_INACTIVE)", graphqlErrors([coded("SHOP_INACTIVE")]), false],
  ["the query costs too much (MAX_COST_EXCEEDED)", graphqlErrors([coded("MAX_COST_EXCEEDED")]), false],
  ["Shopify's 500 answered as a 200 (INTERNAL_SERVER_ERROR)", graphqlErrors([coded("INTERNAL_SERVER_ERROR", { message: "Internal error. Looks like something went wrong on our end." })]), true],
  ["an error code the docs do not list", graphqlErrors([coded("SOMETHING_NEW")]), true],
  ["a GraphQL error without a code", graphqlErrors([{ message: "Something went wrong" }]), true],
  ["THROTTLED together with INTERNAL_SERVER_ERROR", graphqlErrors([coded("THROTTLED"), coded("INTERNAL_SERVER_ERROR")]), true],
  ["THROTTLED, but the answer carries the transaction", graphqlErrors([coded("THROTTLED")], { storeCreditAccountCredit: { storeCreditAccountTransaction: transaction, userErrors: [] }, storeCreditAccountDebit: { storeCreditAccountTransaction: transaction, userErrors: [] } }), true],
  ["ACCESS_DENIED on a field inside the mutation's answer", graphqlErrors([coded("ACCESS_DENIED", { path: ["storeCreditAccountCredit", "storeCreditAccountTransaction", "balanceAfterTransaction"] })]), true],
  ["Shopify throttled the request (429)", new HttpThrottlingError({ message: "Shopify is throttling requests", code: 429, statusText: "Too Many Requests" }), false],
  ["Shopify refused the token (401)", new HttpResponseError({ message: "Unauthorized", code: 401, statusText: "Unauthorized" }), false],
  ["the admin context's copy of a 403", new Response("{}", { status: 403 }), false],
  ["the embedded admin asked to re-authenticate (401)", new Response(null, { status: 401 }), false],
  ["the embedded admin redirected to re-authenticate", new Response(null, { status: 302, headers: { Location: "/auth/session-token" } }), false],
  ["no answer came (the connection failed or dropped)", new HttpRequestError("Http request error, no response available: GraphQL Client: fetch failed"), true],
  ["Shopify answered 502", new HttpInternalError({ message: "Shopify internal error", code: 502, statusText: "Bad Gateway" }), true],
  ["the webhook context's copy of a 502", new Response("{}", { status: 502 }), true],
  ["a 200 the client could not read", new HttpResponseError({ message: "Received an error response (200 OK) from Shopify", code: 200, statusText: "OK" }), true],
  ["the request timed out", new DOMException("The operation was aborted due to timeout", "TimeoutError"), true],
];

const SHOP = "answers.myshopify.com";

function serviceThrowing(error: unknown) {
  return new ShopifyStoreCreditService({ graphql: vi.fn().mockRejectedValue(error) }, SHOP);
}

function serviceAnswering(body: unknown) {
  const graphql = vi.fn().mockResolvedValue({ json: async () => body });
  return { graphql, service: new ShopifyStoreCreditService({ graphql }, SHOP) };
}

describe("store credit: did Shopify apply a credit or debit that failed?", () => {
  for (const [what, error, ambiguous] of thrown) {
    it(`${ambiguous ? "may have" : "did not"}: ${what}`, async () => {
      const credit = await serviceThrowing(error).issueStoreCredit("100", 5, "GBP");
      const debit = await serviceThrowing(error).debitStoreCredit("100", 5, "GBP");

      expect(credit).toMatchObject({ success: false, ambiguous });
      expect(debit).toMatchObject({ success: false, ambiguous });
    });
  }

  it("did not: nothing was sent (no Admin client, the client refused to build the request, no amount)", async () => {
    const noAdmin = new ShopifyStoreCreditService(undefined, SHOP);
    await expect(noAdmin.issueStoreCredit("100", 5, "GBP")).resolves.toMatchObject({ success: false, ambiguous: false });
    await expect(noAdmin.debitStoreCredit("100", 5, "GBP")).resolves.toMatchObject({ success: false, ambiguous: false });

    const noToken = serviceThrowing(new MissingRequiredArgument("Missing access token when creating GraphQL client"));
    await expect(noToken.issueStoreCredit("100", 5, "GBP")).resolves.toMatchObject({ success: false, ambiguous: false });

    const { graphql, service } = serviceAnswering({});
    for (const amount of [0, 0.004, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(service.issueStoreCredit("100", amount, "GBP")).resolves.toMatchObject({ success: false, ambiguous: false });
    }
    expect(graphql).not.toHaveBeenCalled();
  });

  it("did not: userErrors with a code Shopify documents for the mutation", async () => {
    const { service } = serviceAnswering({
      data: { storeCreditAccountDebit: { storeCreditAccountTransaction: null, userErrors: [{ field: null, message: "Insufficient funds", code: "INSUFFICIENT_FUNDS" }] } },
    });

    await expect(service.debitStoreCredit("100", 5, "GBP")).resolves.toEqual({ success: false, error: "Insufficient funds", ambiguous: false });
  });

  it("may have: userErrors with an undocumented code or none, or beside a transaction", async () => {
    const answers = [
      { storeCreditAccountTransaction: null, userErrors: [{ field: null, message: "Temporarily unavailable", code: "INTERNAL" }] },
      { storeCreditAccountTransaction: null, userErrors: [{ field: null, message: "Something went wrong" }] },
      { storeCreditAccountTransaction: transaction, userErrors: [{ field: null, message: "Insufficient funds", code: "INSUFFICIENT_FUNDS" }] },
    ];
    for (const payload of answers) {
      const { service } = serviceAnswering({ data: { storeCreditAccountDebit: payload } });
      await expect(service.debitStoreCredit("100", 5, "GBP")).resolves.toMatchObject({ success: false, ambiguous: true });
    }
  });

  it("reads GraphQL errors in an answer that did not throw by the same rule", async () => {
    await expect(serviceAnswering({ errors: [coded("THROTTLED")] }).service.issueStoreCredit("100", 5, "GBP")).resolves.toMatchObject({ success: false, ambiguous: false });
    await expect(serviceAnswering({ errors: [coded("INTERNAL_SERVER_ERROR")] }).service.issueStoreCredit("100", 5, "GBP")).resolves.toMatchObject({ success: false, ambiguous: true });
  });

  it("may have: an answer with neither a transaction nor a reason", async () => {
    const { service } = serviceAnswering({ data: { storeCreditAccountCredit: { storeCreditAccountTransaction: null, userErrors: [] } } });

    await expect(service.issueStoreCredit("100", 5, "GBP")).resolves.toMatchObject({ success: false, ambiguous: true });
  });
});
