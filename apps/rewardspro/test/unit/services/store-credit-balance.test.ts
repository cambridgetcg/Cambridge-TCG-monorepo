import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import type { getLiveStoreCreditBalance as GetLiveStoreCreditBalance } from "~/services/store-credit-balance.server";
import { selectedFields } from "../../helpers/graphql-fields";

/**
 * The membership widget shows a shopper's store credit. RewardsPro's own copy
 * changes only when the app credits or debits it, so credit the shopper spent
 * at checkout, or the merchant changed in Shopify admin, would still show.
 * The proxy asks Shopify for the balance in the shop's currency, the one the
 * widget formats it in, and answers null when Shopify can't say.
 */

// The fields the query must select, as Admin API 2026-10 names them
const BALANCE_FIELDS = [
  "customer.storeCreditAccounts.nodes.balance.amount",
  "customer.storeCreditAccounts.nodes.balance.currencyCode",
  "customer.storeCreditAccounts.pageInfo.hasNextPage",
  "shop.currencyCode",
];

type Money = { amount: string; currencyCode: string };

interface Answers {
  currency?: string;
  /** Each shopper's accounts, by customer GID; a shopper not listed is unknown to Shopify */
  accounts?: Record<string, Money[]>;
  hasNextPage?: boolean;
  fail?: boolean;
}

function admin({ currency = "GBP", accounts = {}, hasNextPage = false, fail = false }: Answers = {}) {
  const graphql = vi.fn(async (query: string, options?: { variables?: Record<string, unknown> }) => {
    // Shopify answers a field its schema doesn't have with an error, not data
    if (selectedFields(query).join() !== BALANCE_FIELDS.join()) {
      throw new Error(`Shopify doesn't answer: ${selectedFields(query).join(", ")}`);
    }
    if (fail) throw new Error("fetch failed");
    const balances = accounts[String(options?.variables?.customerId)];
    return {
      json: async () => ({
        data: {
          shop: { currencyCode: currency },
          customer: balances
            ? { storeCreditAccounts: { nodes: balances.map((balance) => ({ balance })), pageInfo: { hasNextPage } } }
            : null,
        },
      }),
    };
  });
  return { admin: { graphql } as unknown as AdminApiContext, graphql };
}

const SHOPPER = "gid://shopify/Customer/1";
const gbp = (amount: string): Money => ({ amount, currencyCode: "GBP" });
const usd = (amount: string): Money => ({ amount, currencyCode: "USD" });

describe("getLiveStoreCreditBalance", () => {
  let getLiveStoreCreditBalance: typeof GetLiveStoreCreditBalance;

  // An empty cache for each test, and for each retry of one
  beforeEach(async () => {
    vi.resetModules();
    ({ getLiveStoreCreditBalance } = await import("~/services/store-credit-balance.server"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the balance Shopify holds now", async () => {
    const { admin: client, graphql } = admin({ accounts: { [SHOPPER]: [gbp("12.50")] } });
    await expect(getLiveStoreCreditBalance("now.myshopify.com", "1", client)).resolves.toBe(12.5);
    expect(graphql.mock.calls[0][1]).toEqual({ variables: { customerId: SHOPPER } });
  });

  it("returns the account in the shop's currency, the one the widget shows", async () => {
    const { admin: client } = admin({ currency: "GBP", accounts: { [SHOPPER]: [usd("40.00"), gbp("7.25")] } });
    await expect(getLiveStoreCreditBalance("two-currencies.myshopify.com", "1", client)).resolves.toBe(7.25);
  });

  it("returns 0 when the shopper has no credit in the shop's currency", async () => {
    const none = admin({ accounts: { [SHOPPER]: [] } }).admin;
    await expect(getLiveStoreCreditBalance("no-accounts.myshopify.com", "1", none)).resolves.toBe(0);
    const otherCurrency = admin({ accounts: { [SHOPPER]: [usd("40.00")] } }).admin;
    await expect(getLiveStoreCreditBalance("other-currency.myshopify.com", "1", otherCurrency)).resolves.toBe(0);
  });

  it("returns null when the shop's account may be on a later page", async () => {
    const { admin: client } = admin({ accounts: { [SHOPPER]: [usd("40.00")] }, hasNextPage: true });
    await expect(getLiveStoreCreditBalance("more-pages.myshopify.com", "1", client)).resolves.toBeNull();
  });

  it("asks Shopify once per shopper while the answer is fresh", async () => {
    const { admin: client, graphql } = admin({ accounts: { [SHOPPER]: [gbp("5.00")], "gid://shopify/Customer/2": [gbp("9.00")] } });
    await getLiveStoreCreditBalance("cached.myshopify.com", "1", client);
    await expect(getLiveStoreCreditBalance("cached.myshopify.com", "1", client)).resolves.toBe(5);
    expect(graphql).toHaveBeenCalledTimes(1);

    await expect(getLiveStoreCreditBalance("cached.myshopify.com", "2", client)).resolves.toBe(9);
    await expect(getLiveStoreCreditBalance("other.myshopify.com", "1", client)).resolves.toBe(5);
    expect(graphql).toHaveBeenCalledTimes(3);
  });

  it("asks again once the answer is 30 seconds old", async () => {
    vi.useFakeTimers();
    try {
      const { admin: client, graphql } = admin({ accounts: { [SHOPPER]: [gbp("5.00")] } });
      await getLiveStoreCreditBalance("stale.myshopify.com", "1", client);
      vi.advanceTimersByTime(30 * 1000 + 1);
      await getLiveStoreCreditBalance("stale.myshopify.com", "1", client);
      expect(graphql).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null without an Admin API client (no offline session)", async () => {
    await expect(getLiveStoreCreditBalance("no-session.myshopify.com", "1", undefined)).resolves.toBeNull();
  });

  it("returns null, and remembers nothing, when Shopify can't be asked", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = admin({ fail: true });
    await expect(getLiveStoreCreditBalance("down.myshopify.com", "1", failing.admin)).resolves.toBeNull();

    const { admin: client } = admin({ accounts: { [SHOPPER]: [gbp("3.00")] } });
    await expect(getLiveStoreCreditBalance("down.myshopify.com", "1", client)).resolves.toBe(3);
  });

  it("returns null for an answer it can't read", async () => {
    const unknownShopper = admin().admin;
    await expect(getLiveStoreCreditBalance("unknown-shopper.myshopify.com", "1", unknownShopper)).resolves.toBeNull();
    const badAmount = admin({ accounts: { [SHOPPER]: [gbp("not a number")] } }).admin;
    await expect(getLiveStoreCreditBalance("bad-amount.myshopify.com", "1", badAmount)).resolves.toBeNull();
  });
});
