import {
  GraphqlQueryError,
  HttpInternalError,
  HttpRequestError,
  HttpResponseError,
  HttpThrottlingError,
} from "@shopify/shopify-api";
import { describe, expect, it, vi } from "vitest";
import { ShopifyStoreCreditService } from "~/services/shopify-store-credit.service";

// The errors the Admin GraphQL client throws (@shopify/shopify-api 11):
// GraphqlQueryError when Shopify answered 200 with errors, an HttpResponseError
// subclass for a 4xx or 5xx answer, HttpRequestError when no answer came.
const answers: Array<[string, unknown, boolean]> = [
  ["Shopify answered with GraphQL errors", new GraphqlQueryError({ message: "Throttled", response: {}, body: { errors: { graphQLErrors: [{ message: "Throttled" }] } } }), false],
  ["Shopify throttled the request (429)", new HttpThrottlingError({ message: "Shopify is throttling requests", code: 429, statusText: "Too Many Requests" }), false],
  ["Shopify refused the token (401)", new HttpResponseError({ message: "Unauthorized", code: 401, statusText: "Unauthorized" }), false],
  ["the embedded admin asked to re-authenticate", new Response(null, { status: 401 }), false],
  ["no answer came (the connection failed or dropped)", new HttpRequestError("Http request error, no response available: GraphQL Client: fetch failed"), true],
  ["Shopify answered 502", new HttpInternalError({ message: "Shopify internal error", code: 502, statusText: "Bad Gateway" }), true],
  ["the request timed out", new DOMException("The operation was aborted due to timeout", "TimeoutError"), true],
];

function serviceThrowing(error: unknown) {
  return new ShopifyStoreCreditService({ graphql: vi.fn().mockRejectedValue(error) }, "answers.myshopify.com");
}

describe("store credit: did Shopify apply a credit or debit that failed?", () => {
  for (const [what, error, ambiguous] of answers) {
    it(`${ambiguous ? "may have" : "did not"}: ${what}`, async () => {
      const credit = await serviceThrowing(error).issueStoreCredit("100", 5, "GBP");
      const debit = await serviceThrowing(error).debitStoreCredit("100", 5, "GBP");

      expect(credit).toMatchObject({ success: false, ambiguous });
      expect(debit).toMatchObject({ success: false, ambiguous });
    });
  }

  it("treats userErrors as nothing applied", async () => {
    const graphql = vi.fn().mockResolvedValue({
      json: async () => ({
        data: { storeCreditAccountDebit: { storeCreditAccountTransaction: null, userErrors: [{ field: null, message: "Insufficient funds", code: "INSUFFICIENT_FUNDS" }] } },
      }),
    });

    const debit = await new ShopifyStoreCreditService({ graphql }, "answers.myshopify.com").debitStoreCredit("100", 5, "GBP");

    expect(debit).toEqual({ success: false, error: "Insufficient funds" });
  });
});
