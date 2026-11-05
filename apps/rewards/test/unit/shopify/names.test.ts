import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RewardsCustomerNames, RewardsCustomerSearch, type GraphqlClient } from "~/shopify/graphql";
import { customerNames, nameFallback, searchCustomers, shopifySearchText } from "~/shopify/names.server";
import { GraphqlQueryError } from "../../helpers/shopify-api-errors";

/**
 * Buyer names are read live from Shopify for display and never stored
 * (spec 4.4, 6.2). When Shopify can't say, the admin still shows the buyer,
 * as "Customer ····" and the last four digits of their id.
 */

type Customer = { firstName: string | null; lastName: string | null };

interface Answers {
  /** Each customer Shopify knows, by numeric id */
  customers?: Record<string, Customer>;
  /** Shopify never answers, and ignores the abort signal */
  hangForever?: boolean;
  fail?: boolean;
  /** The first n calls are throttled, as Shopify throws it: a 200 whose error says THROTTLED, with the cost */
  throttled?: number;
}

/**
 * A THROTTLED answer, as @shopify/shopify-api throws it (throwFailedRequest):
 * a GraphqlQueryError whose body carries the error's code and Shopify's
 * cost, here 250 asked for with 50 left, restoring 100 a second (a 2 s wait).
 */
function throttledError() {
  return new GraphqlQueryError({
    message: "Throttled",
    response: {},
    body: {
      errors: {
        networkStatusCode: 200,
        message: "GraphQL Client: An error occurred while fetching from the API. Review 'graphQLErrors' for details.",
        graphQLErrors: [{ message: "Throttled", extensions: { code: "THROTTLED", documentation: "https://shopify.dev/api/usage/rate-limits" } }],
      },
      extensions: {
        cost: { requestedQueryCost: 250, actualQueryCost: null, throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 50, restoreRate: 100 } },
      },
    },
  });
}

function admin({ customers = {}, hangForever = false, fail = false, throttled = 0 }: Answers = {}) {
  let calls = 0;
  const graphql = vi.fn(async (query: string, options?: { variables?: Record<string, unknown>; signal?: AbortSignal }) => {
    if (query !== RewardsCustomerNames) throw new Error("Shopify doesn't answer that document here");
    if (fail) throw new Error("fetch failed");
    if (calls++ < throttled) throw throttledError();
    if (hangForever) await new Promise(() => {});
    const ids = options?.variables?.ids as string[];
    return {
      json: async () => ({
        data: {
          nodes: ids.map((gid) => {
            const customer = customers[gid.replace("gid://shopify/Customer/", "")];
            return customer ? { id: gid, ...customer } : null;
          }),
        },
      }),
    };
  });
  return { admin: { graphql } satisfies GraphqlClient, graphql };
}

describe("customerNames", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    warn.mockRestore();
  });

  it("reads each buyer's name from Shopify", async () => {
    const { admin: client, graphql } = admin({
      customers: { "101": { firstName: "Ada", lastName: "Lovelace" }, "202": { firstName: "Grace", lastName: null } },
    });

    const names = await customerNames(client, ["101", "202"]);

    expect(Object.fromEntries(names)).toEqual({ "101": "Ada Lovelace", "202": "Grace" });
    expect(graphql).toHaveBeenCalledTimes(1);
    expect(graphql.mock.calls[0][1]?.variables).toEqual({ ids: ["gid://shopify/Customer/101", "gid://shopify/Customer/202"] });
  });

  it("falls back for a buyer Shopify has no name for, or doesn't know", async () => {
    const { admin: client } = admin({ customers: { "7001234": { firstName: " ", lastName: null } } });

    const names = await customerNames(client, ["7001234", "88885678"]);

    expect(Object.fromEntries(names)).toEqual({ "7001234": "Customer ····1234", "88885678": "Customer ····5678" });
  });

  it("falls back for every buyer when Shopify doesn't answer within 2.5 s", async () => {
    vi.useFakeTimers();
    const { admin: client } = admin({ hangForever: true });

    const pending = customerNames(client, ["101234", "205678"]);
    await vi.advanceTimersByTimeAsync(2_499);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(Object.fromEntries(await pending)).toEqual({ "101234": "Customer ····1234", "205678": "Customer ····5678" });
    // Why, but no name and no buyer id
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0])).not.toContain("101234");
  });

  it("falls back when Shopify fails, and stops asking for the rest", async () => {
    const { admin: client, graphql } = admin({ fail: true });
    const ids = Array.from({ length: 600 }, (_, i) => String(10_000 + i));

    const names = await customerNames(client, ids);

    expect(names.size).toBe(600);
    expect(names.get("10599")).toBe("Customer ····0599");
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("asks 250 at a time, each id once", async () => {
    const ids = Array.from({ length: 300 }, (_, i) => String(1_000 + i));
    const customers = Object.fromEntries(ids.map((id) => [id, { firstName: "Buyer", lastName: id }]));
    const { admin: client, graphql } = admin({ customers });

    const names = await customerNames(client, [...ids, "1000", "1001"]);

    expect(graphql.mock.calls.map(([, options]) => (options?.variables?.ids as string[]).length)).toEqual([250, 50]);
    expect(names.size).toBe(300);
    expect(names.get("1299")).toBe("Buyer 1299");
  });

  it("asks nothing for no buyers, and never sends Shopify an id that is not one", async () => {
    const { admin: client, graphql } = admin();

    expect((await customerNames(client, [])).size).toBe(0);
    const names = await customerNames(client, ["gid://shopify/Customer/1"]);
    // A GID where a numeric id belongs would fail the whole batch
    expect(names.get("gid://shopify/Customer/1")).toMatch(/^Customer ····/);
    expect(graphql).not.toHaveBeenCalled();
  });

  // Ruling 78: a throttle waits as Shopify says, then asks again once
  it("waits out a throttle as Shopify says and asks again, within the caller's deadline", async () => {
    vi.useFakeTimers();
    const { admin: client, graphql } = admin({ throttled: 1, customers: { "101": { firstName: "Ada", lastName: null } } });

    const pending = customerNames(client, ["101"], { budgetMs: 20_000 });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(graphql).toHaveBeenCalledTimes(1);
    // (250 − 50) ÷ 100 = 2 s
    await vi.advanceTimersByTimeAsync(1);

    expect(Object.fromEntries(await pending)).toEqual({ "101": "Ada" });
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("waits at least a second when Shopify's cost says less, or nothing", async () => {
    vi.useFakeTimers();
    const error = throttledError();
    (error as unknown as { body: Record<string, unknown> }).body.extensions = undefined;
    let calls = 0;
    const graphql = vi.fn(async (_query: string, options?: { variables?: Record<string, unknown> }) => {
      if (calls++ === 0) throw error;
      return { json: async () => ({ data: { nodes: (options?.variables?.ids as string[]).map((id) => ({ id, firstName: "Ada", lastName: null })) } }) };
    });

    const pending = customerNames({ graphql }, ["101"], { budgetMs: 20_000 });
    await vi.advanceTimersByTimeAsync(999);
    expect(graphql).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(Object.fromEntries(await pending)).toEqual({ "101": "Ada" });
  });

  it("falls back for the rest when the batch is throttled twice", async () => {
    vi.useFakeTimers();
    const ids = Array.from({ length: 300 }, (_, i) => String(10_000 + i));
    const { admin: client, graphql } = admin({ throttled: 2 });

    const pending = customerNames(client, ids, { budgetMs: 60_000 });
    await vi.advanceTimersByTimeAsync(10_000);
    const names = await pending;

    expect(graphql).toHaveBeenCalledTimes(2);
    expect(names.size).toBe(300);
    expect(names.get("10299")).toBe("Customer ····0299");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("falls back without waiting when the wait would pass the deadline", async () => {
    vi.useFakeTimers();
    const { admin: client, graphql } = admin({ throttled: 1, customers: { "101": { firstName: "Ada", lastName: null } } });

    // A page's short deadline: a 2 s wait doesn't fit in what is left of 2.5 s after the ask
    vi.setSystemTime(0);
    graphql.mockImplementationOnce(async () => {
      vi.setSystemTime(1_000);
      throw throttledError();
    });
    const names = await customerNames(client, ["101"]);

    expect(graphql).toHaveBeenCalledTimes(1);
    expect(names.get("101")).toBe("Customer ····101");
  });

  it("asks no more batches once the caller's deadline has passed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const ids = Array.from({ length: 600 }, (_, i) => String(10_000 + i));
    const customers = Object.fromEntries(ids.map((id) => [id, { firstName: "Buyer", lastName: id }]));
    const { admin: client, graphql } = admin({ customers });
    // Each answer comes 2 s after the ask
    const answer = graphql.getMockImplementation()!;
    graphql.mockImplementation(async (query, options) => {
      vi.setSystemTime(Date.now() + 2_000);
      return answer(query, options);
    });

    const names = await customerNames(client, ids, { budgetMs: 3_000 });

    expect(graphql).toHaveBeenCalledTimes(2);
    expect(names.get("10000")).toBe("Buyer 10000");
    expect(names.get("10499")).toBe("Buyer 10499");
    expect(names.get("10599")).toBe("Customer ····0599");
  });

  // A18-F3: the fallback shows the id's digits only, never part of a word
  it("names a buyer by the last four digits of their id, or plain Customer when it has none", () => {
    expect(nameFallback("7001234")).toBe("Customer ····1234");
    expect(nameFallback("gid://shopify/Customer/1")).toBe("Customer ····1");
    expect(nameFallback("gid://shopify/Customer/123456")).toBe("Customer ····3456");
    expect(nameFallback("not-an-id")).toBe("Customer");
    expect(nameFallback("")).toBe("Customer");
  });
});

// BOUNDARY-5: what the merchant types is searched as words, not as Shopify's search syntax
describe("shopifySearchText", () => {
  it("escapes Shopify's special characters and drops a leading minus from each word", () => {
    expect(shopifySearchText("O'Neil")).toBe("O\\'Neil");
    expect(shopifySearchText("Smith-Jones")).toBe("Smith-Jones");
    expect(shopifySearchText("jane@example.com")).toBe("jane@example.com");
    expect(shopifySearchText("Name: Jane")).toBe("Name\\: Jane");
    expect(shopifySearchText("Jane Doe (Acme)")).toBe("Jane Doe \\(Acme\\)");
    expect(shopifySearchText('"Jane" back\\slash')).toBe('\\"Jane\\" back\\\\slash');
    expect(shopifySearchText("-smith  --jones")).toBe("smith jones");
    expect(shopifySearchText(" - ")).toBe("");
  });
});

describe("searchCustomers", () => {
  const searchAdmin = (answer: Record<string, unknown>) => {
    const graphql = vi.fn<(query: string, options?: { variables?: Record<string, unknown> }) => Promise<{ json: () => Promise<unknown> }>>(
      async (query) => {
        if (query !== RewardsCustomerSearch) throw new Error("Shopify doesn't answer that document here");
        return { json: async () => answer };
      },
    );
    return { admin: { graphql } satisfies GraphqlClient, graphql };
  };
  const found = { data: { customers: { pageInfo: { hasNextPage: false }, nodes: [{ id: "gid://shopify/Customer/101" }] } } };

  it("sends the escaped words", async () => {
    const { admin: client, graphql } = searchAdmin(found);

    expect(await searchCustomers(client, "Name: O'Neil")).toEqual({ ids: ["101"], more: false, unread: false });
    expect(graphql.mock.calls[0][1]?.variables).toEqual({ query: "Name\\: O\\'Neil" });
  });

  it("asks nothing for a search with no words left, and finds no one", async () => {
    const { admin: client, graphql } = searchAdmin(found);

    expect(await searchCustomers(client, "-")).toEqual({ ids: [], more: false, unread: false });
    expect(graphql).not.toHaveBeenCalled();
  });

  it("says when Shopify couldn't read the search", async () => {
    const { admin: client } = searchAdmin({
      ...found,
      extensions: { search: [{ path: ["customers"], query: "x", parsed: {}, warnings: [{ field: "x", message: "Invalid search field for this query." }] }] },
    });

    expect(await searchCustomers(client, "x")).toEqual({ ids: ["101"], more: false, unread: true });
  });
});
