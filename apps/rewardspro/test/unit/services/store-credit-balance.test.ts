import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import type { getLiveStoreCreditBalance as GetLiveStoreCreditBalance } from "~/services/store-credit-balance.server";
import { selectedFields } from "../../helpers/graphql-fields";

/**
 * The membership widget shows a shopper's store credit. RewardsPro's own copy
 * is refreshed when the app credits or debits, on each orders/create and by
 * Sync Store Credit, so credit changed in Shopify admin, by another app or by
 * expiry would still show until then, and it adds every currency together.
 * The proxy asks Shopify for the balance in the shop's currency, the one the
 * widget formats it in, and answers null when Shopify can't say: then the
 * stored copy stands, as before.
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
  /** null: the answer has no pageInfo */
  hasNextPage?: boolean | null;
  fail?: boolean;
  /** Shopify doesn't answer until the request is aborted */
  hang?: boolean;
  /** The shop's API budget left after the call, out of 2000 */
  available?: number;
}

function admin({ currency = "GBP", accounts = {}, hasNextPage = false, fail = false, hang = false, available = 2000 }: Answers = {}) {
  const graphql = vi.fn(async (query: string, options?: { variables?: Record<string, unknown>; signal?: AbortSignal }) => {
    // Shopify answers a field its schema doesn't have with an error, not data
    if (selectedFields(query).join() !== BALANCE_FIELDS.join()) {
      throw new Error(`Shopify doesn't answer: ${selectedFields(query).join(", ")}`);
    }
    if (fail) throw new Error("fetch failed");
    if (hang) {
      // As fetch does, the request fails only when its signal aborts
      await new Promise((_, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    }
    const balances = accounts[String(options?.variables?.customerId)];
    const pageInfo = hasNextPage === null ? {} : { pageInfo: { hasNextPage } };
    return {
      json: async () => ({
        data: {
          shop: { currencyCode: currency },
          customer: balances ? { storeCreditAccounts: { nodes: balances.map((balance) => ({ balance })), ...pageInfo } } : null,
        },
        extensions: { cost: { throttleStatus: { maximumAvailable: 2000, currentlyAvailable: available, restoreRate: 100 } } },
      }),
    };
  });
  return { admin: { graphql } as unknown as AdminApiContext, graphql };
}

const SHOPPER = "gid://shopify/Customer/1";
const gbp = (amount: string): Money => ({ amount, currencyCode: "GBP" });
const usd = (amount: string): Money => ({ amount, currencyCode: "USD" });
const eur = (amount: string): Money => ({ amount, currencyCode: "EUR" });

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
    expect(graphql.mock.calls[0][1]).toEqual({ variables: { customerId: SHOPPER }, signal: expect.any(AbortSignal) });
  });

  it("returns the account in the shop's currency, the one the widget shows", async () => {
    const { admin: client } = admin({ currency: "GBP", accounts: { [SHOPPER]: [usd("40.00"), gbp("7.25")] } });
    await expect(getLiveStoreCreditBalance("two-currencies.myshopify.com", "1", client)).resolves.toBe(7.25);
  });

  it("returns 0 when the shopper has no credit", async () => {
    const none = admin({ accounts: { [SHOPPER]: [] } }).admin;
    await expect(getLiveStoreCreditBalance("no-accounts.myshopify.com", "1", none)).resolves.toBe(0);
    const spent = admin({ accounts: { [SHOPPER]: [gbp("0.00"), usd("0.00")] } }).admin;
    await expect(getLiveStoreCreditBalance("all-spent.myshopify.com", "1", spent)).resolves.toBe(0);
  });

  // RewardsPro issues cashback in Settings > Currency, which can differ from
  // the shop's: the widget can't show that credit, and mustn't say it's none
  it("returns null when the shopper's credit is only in another currency", async () => {
    const otherCurrency = admin({ accounts: { [SHOPPER]: [eur("5.00")] } }).admin;
    await expect(getLiveStoreCreditBalance("other-currency.myshopify.com", "1", otherCurrency)).resolves.toBeNull();
    const spentHere = admin({ accounts: { [SHOPPER]: [gbp("0.00"), eur("5.00")] } }).admin;
    await expect(getLiveStoreCreditBalance("spent-here.myshopify.com", "1", spentHere)).resolves.toBeNull();
  });

  it("returns null when the shopper's credit may be on a later page", async () => {
    const { admin: client } = admin({ accounts: { [SHOPPER]: [usd("0.00")] }, hasNextPage: true });
    await expect(getLiveStoreCreditBalance("more-pages.myshopify.com", "1", client)).resolves.toBeNull();
    const noPageInfo = admin({ accounts: { [SHOPPER]: [usd("0.00")] }, hasNextPage: null }).admin;
    await expect(getLiveStoreCreditBalance("no-page-info.myshopify.com", "1", noPageInfo)).resolves.toBeNull();
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

  it("drops stale answers as new ones are kept", async () => {
    vi.useFakeTimers();
    try {
      const { admin: client } = admin({ accounts: { [SHOPPER]: [gbp("5.00")], "gid://shopify/Customer/2": [gbp("9.00")] } });
      await getLiveStoreCreditBalance("pruned.myshopify.com", "1", client);
      vi.advanceTimersByTime(30 * 1000);
      const deleted = vi.spyOn(Map.prototype, "delete");
      await getLiveStoreCreditBalance("pruned.myshopify.com", "2", client);
      expect(deleted).toHaveBeenCalledWith("pruned.myshopify.com:1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null without an Admin API client (no offline session)", async () => {
    await expect(getLiveStoreCreditBalance("no-session.myshopify.com", "1", undefined)).resolves.toBeNull();
  });

  // Storefront reads give way, so the app's own credits and debits, which
  // draw on the same API budget, aren't throttled because shoppers looked
  it("returns null when Shopify can't be asked, and gives way for 10 seconds", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const failing = admin({ fail: true });
      await expect(getLiveStoreCreditBalance("down.myshopify.com", "1", failing.admin)).resolves.toBeNull();

      const { admin: client, graphql } = admin({ accounts: { [SHOPPER]: [gbp("3.00")] } });
      await expect(getLiveStoreCreditBalance("down.myshopify.com", "2", client)).resolves.toBeNull();
      expect(graphql).not.toHaveBeenCalled();
      await expect(getLiveStoreCreditBalance("up.myshopify.com", "1", client)).resolves.toBe(3);

      // The failure itself isn't remembered as a balance
      vi.advanceTimersByTime(10 * 1000);
      await expect(getLiveStoreCreditBalance("down.myshopify.com", "1", client)).resolves.toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives way while the shop's API budget is below half", async () => {
    vi.useFakeTimers();
    try {
      const accounts = { [SHOPPER]: [gbp("3.00")], "gid://shopify/Customer/2": [gbp("9.00")] };
      const low = admin({ accounts, available: 999 });
      await expect(getLiveStoreCreditBalance("busy.myshopify.com", "1", low.admin)).resolves.toBe(3);
      await expect(getLiveStoreCreditBalance("busy.myshopify.com", "2", low.admin)).resolves.toBeNull();
      expect(low.graphql).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(10 * 1000);
      await expect(getLiveStoreCreditBalance("busy.myshopify.com", "2", low.admin)).resolves.toBe(9);

      const half = admin({ accounts, available: 1000 });
      await getLiveStoreCreditBalance("half.myshopify.com", "1", half.admin);
      await expect(getLiveStoreCreditBalance("half.myshopify.com", "2", half.admin)).resolves.toBe(9);
      expect(half.graphql).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // The widget gives up after 10 seconds and shows nothing; the stored copy is better
  it("returns null when Shopify takes longer than 2.5 seconds", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { admin: client } = admin({ accounts: { [SHOPPER]: [gbp("3.00")] }, hang: true });
      let settled = false;
      const balance = getLiveStoreCreditBalance("slow.myshopify.com", "1", client).finally(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(2499);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      await expect(balance).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null for an answer it can't read", async () => {
    const unknownShopper = admin().admin;
    await expect(getLiveStoreCreditBalance("unknown-shopper.myshopify.com", "1", unknownShopper)).resolves.toBeNull();
    const badAmount = admin({ accounts: { [SHOPPER]: [gbp("not a number")] } }).admin;
    await expect(getLiveStoreCreditBalance("bad-amount.myshopify.com", "1", badAmount)).resolves.toBeNull();
  });
});
