import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RewardsCustomerNames, type GraphqlClient } from "~/shopify/graphql";
import { customerNames } from "~/shopify/names.server";

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
}

function admin({ customers = {}, hangForever = false, fail = false }: Answers = {}) {
  const graphql = vi.fn(async (query: string, options?: { variables?: Record<string, unknown>; signal?: AbortSignal }) => {
    if (query !== RewardsCustomerNames) throw new Error("Shopify doesn't answer that document here");
    if (fail) throw new Error("fetch failed");
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
});
