import { Decimal } from "decimal.js";
import { describe, expect, it, vi } from "vitest";
import { RewardsCredit, RewardsDebit, type GraphqlClient } from "~/shopify/graphql";
import { RAIL_CALL_TIMEOUT_MS, createStoreCreditRail } from "~/shopify/store-credit-rail.server";
import {
  GraphqlQueryError,
  HttpInternalError,
  HttpRequestError,
  HttpResponseError,
  HttpThrottlingError,
  MissingRequiredArgument,
} from "../../helpers/shopify-api-errors";

/**
 * A 200 carrying top-level GraphQL errors, as @shopify/shopify-api throws it
 * (throwFailedRequest): `body` is the client's response, with the errors
 * under `errors.graphQLErrors` and any partial `data` beside them.
 */
function graphqlErrors(errors: Array<Record<string, unknown>>, data?: Record<string, unknown>) {
  return new GraphqlQueryError({
    message: String(errors[0]?.message ?? "GraphQL operation failed"),
    response: {},
    body: {
      ...(data ? { data } : {}),
      errors: {
        networkStatusCode: 200,
        message: "GraphQL Client: An error occurred while fetching from the API. Review 'graphQLErrors' for details.",
        graphQLErrors: errors,
      },
    },
  });
}
const coded = (code: string, extra: Record<string, unknown> = {}) => ({ message: code, extensions: { code }, ...extra });
const transaction = {
  id: "gid://shopify/StoreCreditAccountCreditTransaction/1",
  amount: { amount: "5.00", currencyCode: "GBP" },
  balanceAfterTransaction: { amount: "5.00", currencyCode: "GBP" },
};

// What the Admin GraphQL client throws, and whether Shopify may have applied
// the credit or debit: GraphqlQueryError for a 200 with GraphQL errors, an
// HttpResponseError subclass for a 4xx or 5xx (or a 200 it could not read),
// HttpRequestError when no answer came. The admin and webhook contexts
// rethrow an HttpResponseError as a Response with its status; the
// unauthenticated admin throws the raw errors.
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

const GBP5 = { externalCustomerId: "100", amount: new Decimal("5.00"), currency: "GBP" };

function railThrowing(error: unknown) {
  return createStoreCreditRail({ graphql: vi.fn().mockRejectedValue(error) });
}

function railAnswering(body: unknown) {
  const graphql = vi.fn().mockResolvedValue({ json: async () => body });
  return { graphql, rail: createStoreCreditRail({ graphql }) };
}

/** A credit Shopify refused with one userError code and no transaction. */
async function answerFor(code: string) {
  const { rail } = railAnswering({
    data: { storeCreditAccountCredit: { storeCreditAccountTransaction: null, userErrors: [{ field: ["id"], message: `Refused: ${code}`, code }] } },
  });
  return rail.credit({ ...GBP5, notify: false });
}

describe("store credit: did Shopify apply a credit or debit that failed?", () => {
  for (const [what, error, mayHave] of thrown) {
    it(`${mayHave ? "may have" : "did not"}: ${what}`, async () => {
      const credit = await railThrowing(error).credit({ ...GBP5, notify: false });
      const debit = await railThrowing(error).debit(GBP5);

      // Every "did not" in this table is one that sending again can change (Decision 4)
      const expected = mayHave ? { outcome: "unclear" } : { outcome: "refused", permanent: false };
      expect(credit).toMatchObject(expected);
      expect(debit).toMatchObject(expected);
    });
  }

  it("did not: nothing was sent (the client refused to build the request, no amount, no currency)", async () => {
    const noToken = railThrowing(new MissingRequiredArgument("Missing access token when creating GraphQL client"));
    await expect(noToken.credit({ ...GBP5, notify: false })).resolves.toMatchObject({ outcome: "refused", permanent: false });
    await expect(noToken.debit(GBP5)).resolves.toMatchObject({ outcome: "refused", permanent: false });

    const { graphql, rail } = railAnswering({});
    for (const amount of ["0", "0.004", "-1", "NaN", "Infinity"]) {
      await expect(rail.credit({ ...GBP5, amount: new Decimal(amount), notify: false })).resolves.toMatchObject({ outcome: "refused", permanent: true });
      await expect(rail.debit({ ...GBP5, amount: new Decimal(amount) })).resolves.toMatchObject({ outcome: "refused", permanent: true });
    }
    await expect(rail.credit({ ...GBP5, currency: "gbp", notify: false })).resolves.toMatchObject({ outcome: "refused", permanent: true });
    expect(graphql).not.toHaveBeenCalled();
  });

  it("did not: userErrors with a code Shopify documents for the mutation", async () => {
    const { rail } = railAnswering({
      data: { storeCreditAccountDebit: { storeCreditAccountTransaction: null, userErrors: [{ field: null, message: "Insufficient funds", code: "INSUFFICIENT_FUNDS" }] } },
    });

    await expect(rail.debit(GBP5)).resolves.toEqual({ outcome: "refused", permanent: false, code: "INSUFFICIENT_FUNDS", message: "Insufficient funds" });
  });

  it.each(["ACCOUNT_NOT_FOUND", "CREDIT_LIMIT_EXCEEDED", "EXPIRES_AT_IN_PAST", "MISMATCHING_CURRENCY", "NEGATIVE_OR_ZERO_AMOUNT", "OWNER_NOT_FOUND", "UNSUPPORTED_CURRENCY"])(
    "a credit refused with %s is permanent",
    async (code) => {
      await expect(answerFor(code)).resolves.toMatchObject({ outcome: "refused", permanent: true, code });
    },
  );

  it("a debit refused with MISMATCHING_CURRENCY, NEGATIVE_OR_ZERO_AMOUNT or ACCOUNT_NOT_FOUND is permanent", async () => {
    for (const code of ["MISMATCHING_CURRENCY", "NEGATIVE_OR_ZERO_AMOUNT", "ACCOUNT_NOT_FOUND"]) {
      const { rail } = railAnswering({
        data: { storeCreditAccountDebit: { storeCreditAccountTransaction: null, userErrors: [{ field: null, message: code, code }] } },
      });
      await expect(rail.debit(GBP5)).resolves.toMatchObject({ outcome: "refused", permanent: true, code });
    }
  });

  it("a debit refused with INSUFFICIENT_FUNDS is not permanent", async () => {
    const { rail } = railAnswering({
      data: { storeCreditAccountDebit: { storeCreditAccountTransaction: null, userErrors: [{ field: null, message: "Insufficient funds", code: "INSUFFICIENT_FUNDS" }] } },
    });

    await expect(rail.debit(GBP5)).resolves.toMatchObject({ outcome: "refused", permanent: false, code: "INSUFFICIENT_FUNDS" });
  });

  it("a refusal with one code that won't change is permanent, whatever else came with it", async () => {
    const { rail } = railAnswering({
      data: {
        storeCreditAccountDebit: {
          storeCreditAccountTransaction: null,
          userErrors: [
            { field: null, message: "Insufficient funds", code: "INSUFFICIENT_FUNDS" },
            { field: null, message: "Currency does not match", code: "MISMATCHING_CURRENCY" },
          ],
        },
      },
    });

    await expect(rail.debit(GBP5)).resolves.toEqual({
      outcome: "refused",
      permanent: true,
      code: "MISMATCHING_CURRENCY",
      message: "Insufficient funds, Currency does not match",
    });
  });

  it("THROTTLED before running is a refusal that is not permanent", async () => {
    await expect(railThrowing(graphqlErrors([coded("THROTTLED")])).credit({ ...GBP5, notify: false })).resolves.toEqual({
      outcome: "refused",
      permanent: false,
      code: "THROTTLED",
      message: "THROTTLED",
    });
    await expect(railAnswering({ errors: [coded("THROTTLED")] }).rail.debit(GBP5)).resolves.toMatchObject({
      outcome: "refused",
      permanent: false,
      code: "THROTTLED",
    });
  });

  it("may have: userErrors with an undocumented code or none, or beside a transaction", async () => {
    const answers = [
      { storeCreditAccountTransaction: null, userErrors: [{ field: null, message: "Temporarily unavailable", code: "INTERNAL" }] },
      { storeCreditAccountTransaction: null, userErrors: [{ field: null, message: "Something went wrong" }] },
      { storeCreditAccountTransaction: transaction, userErrors: [{ field: null, message: "Insufficient funds", code: "INSUFFICIENT_FUNDS" }] },
    ];
    for (const payload of answers) {
      const { rail } = railAnswering({ data: { storeCreditAccountDebit: payload } });
      await expect(rail.debit(GBP5)).resolves.toMatchObject({ outcome: "unclear" });
    }
    // A debit-only code on a credit is not one Shopify documents for it
    const { rail } = railAnswering({
      data: { storeCreditAccountCredit: { storeCreditAccountTransaction: null, userErrors: [{ field: null, message: "Insufficient funds", code: "INSUFFICIENT_FUNDS" }] } },
    });
    await expect(rail.credit({ ...GBP5, notify: false })).resolves.toMatchObject({ outcome: "unclear" });
  });

  it("reads GraphQL errors in an answer that did not throw by the same rule", async () => {
    await expect(railAnswering({ errors: [coded("THROTTLED")] }).rail.credit({ ...GBP5, notify: false })).resolves.toMatchObject({ outcome: "refused", permanent: false });
    await expect(railAnswering({ errors: [coded("INTERNAL_SERVER_ERROR")] }).rail.credit({ ...GBP5, notify: false })).resolves.toMatchObject({ outcome: "unclear" });
  });

  it("may have: an answer with neither a transaction nor a reason, or one it can't read", async () => {
    const { rail } = railAnswering({ data: { storeCreditAccountCredit: { storeCreditAccountTransaction: null, userErrors: [] } } });
    await expect(rail.credit({ ...GBP5, notify: false })).resolves.toMatchObject({ outcome: "unclear" });

    const unreadable = createStoreCreditRail({ graphql: vi.fn().mockResolvedValue({ json: async () => { throw new SyntaxError("Unexpected token"); } }) });
    await expect(unreadable.credit({ ...GBP5, notify: false })).resolves.toMatchObject({ outcome: "unclear" });
  });

  it("applied: the transaction Shopify made, with its id", async () => {
    const { rail } = railAnswering({ data: { storeCreditAccountCredit: { storeCreditAccountTransaction: transaction, userErrors: [] } } });
    await expect(rail.credit({ ...GBP5, notify: false })).resolves.toEqual({ outcome: "applied", transactionId: transaction.id });

    const noId = railAnswering({ data: { storeCreditAccountDebit: { storeCreditAccountTransaction: { ...transaction, id: undefined }, userErrors: [] } } });
    await expect(noId.rail.debit(GBP5)).resolves.toEqual({ outcome: "applied", transactionId: null });
  });

  it("handles both thrown shapes: a Response (webhook admin) and raw HttpResponseError/GraphqlQueryError (unauthenticated admin)", async () => {
    const pairs: Array<[unknown, unknown, Record<string, unknown>]> = [
      [new Response(null, { status: 401 }), new HttpResponseError({ message: "Unauthorized", code: 401, statusText: "Unauthorized" }), { outcome: "refused", permanent: false }],
      [new Response("{}", { status: 429 }), new HttpThrottlingError({ message: "Throttled", code: 429, statusText: "Too Many Requests" }), { outcome: "refused", permanent: false }],
      [new Response("{}", { status: 503 }), new HttpInternalError({ message: "Unavailable", code: 503, statusText: "Service Unavailable" }), { outcome: "unclear" }],
    ];
    for (const [webhookShape, rawShape, expected] of pairs) {
      await expect(railThrowing(webhookShape).credit({ ...GBP5, notify: false })).resolves.toMatchObject(expected);
      await expect(railThrowing(rawShape).credit({ ...GBP5, notify: false })).resolves.toMatchObject(expected);
    }
    // The raw GraphqlQueryError reads like the same errors in an answer that did not throw
    await expect(railThrowing(graphqlErrors([coded("SHOP_INACTIVE")])).debit(GBP5)).resolves.toMatchObject({ outcome: "refused", code: "SHOP_INACTIVE" });
    await expect(railThrowing(graphqlErrors([coded("INTERNAL_SERVER_ERROR")])).debit(GBP5)).resolves.toMatchObject({ outcome: "unclear" });
  });

  it("may have: Shopify gives no answer in time, even when the abort signal is not honoured", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const graphql = vi.fn((_query: string, options?: { signal?: AbortSignal }) => {
        signal = options?.signal;
        return new Promise<never>(() => {});
      });
      const answer = createStoreCreditRail({ graphql }).credit({ ...GBP5, notify: false });
      let settled = false;
      void answer.finally(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(RAIL_CALL_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(answer).resolves.toMatchObject({ outcome: "unclear" });
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("store credit: what is sent", () => {
  type Sent = { id: string; creditInput?: Record<string, unknown>; debitInput?: Record<string, unknown> };

  function recordingRail() {
    const sent: Array<{ query: string; variables: Sent; options: Record<string, unknown> }> = [];
    const graphql = vi.fn(async (query: string, options?: { variables?: Record<string, unknown>; signal?: AbortSignal }) => {
      sent.push({ query, variables: options?.variables as Sent, options: options ?? {} });
      return {
        json: async () => ({
          data: {
            storeCreditAccountCredit: { storeCreditAccountTransaction: transaction, userErrors: [] },
            storeCreditAccountDebit: { storeCreditAccountTransaction: transaction, userErrors: [] },
          },
        }),
      };
    });
    return { sent, rail: createStoreCreditRail({ graphql } satisfies GraphqlClient) };
  }

  it("sends notify and the amount in the currency's minor unit", async () => {
    const { sent, rail } = recordingRail();

    await rail.credit({ externalCustomerId: "100", amount: new Decimal("62"), currency: "JPY", notify: true });
    await rail.credit({ externalCustomerId: "100", amount: new Decimal("2.3"), currency: "GBP", notify: false });
    await rail.credit({ externalCustomerId: "100", amount: new Decimal("0.123"), currency: "KWD", notify: false });
    await rail.debit({ externalCustomerId: "100", amount: new Decimal("1.13"), currency: "EUR" });

    expect(sent[0].query).toBe(RewardsCredit);
    expect(sent[0].variables).toEqual({
      id: "gid://shopify/Customer/100",
      creditInput: { creditAmount: { amount: "62", currencyCode: "JPY" }, notify: true },
    });
    expect(sent[0].variables.creditInput?.notify).toBe(true);
    expect(sent[1].variables.creditInput).toEqual({ creditAmount: { amount: "2.30", currencyCode: "GBP" }, notify: false });
    expect(sent[2].variables.creditInput).toEqual({ creditAmount: { amount: "0.123", currencyCode: "KWD" }, notify: false });
    expect(sent[3].query).toBe(RewardsDebit);
    expect(sent[3].variables).toEqual({ id: "gid://shopify/Customer/100", debitInput: { debitAmount: { amount: "1.13", currencyCode: "EUR" } } });
  });

  it("never asks the client to retry, and passes an abort signal", async () => {
    const { sent, rail } = recordingRail();

    await rail.credit({ ...GBP5, notify: false });
    await rail.debit(GBP5);

    for (const call of sent) {
      expect(call.options).not.toHaveProperty("tries");
      expect(call.options.signal).toBeInstanceOf(AbortSignal);
    }
  });
});
