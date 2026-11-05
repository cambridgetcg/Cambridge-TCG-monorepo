import type { Decimal } from "decimal.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RewardsBalance, type GraphqlClient } from "~/shopify/graphql";
import type { liveBalance as LiveBalance } from "~/shopify/live-balance.server";
import { createStoreCreditRail } from "~/shopify/store-credit-rail.server";

/**
 * The widget shows a buyer's store credit as Shopify holds it now; RewardsPro
 * keeps no copy (spec 6.2). The proxy asks for the balance in one currency,
 * and gets null when Shopify can't say, so the widget says "Your store credit
 * shows at checkout" instead of a number (spec 5).
 */

type Money = { amount: string; currencyCode: string };

interface Answers {
  /** Each buyer's accounts, by customer GID; a buyer not listed is unknown to Shopify */
  accounts?: Record<string, Money[]>;
  /** null: the answer has no pageInfo */
  hasNextPage?: boolean | null;
  fail?: boolean;
  /** Shopify doesn't answer until the request is aborted */
  hang?: boolean;
  /** Shopify never answers, and ignores the abort signal */
  hangForever?: boolean;
  /** The shop's API budget left after the call, out of 2000 */
  available?: number;
}

function admin({ accounts = {}, hasNextPage = false, fail = false, hang = false, hangForever = false, available = 2000 }: Answers = {}) {
  const graphql = vi.fn(async (query: string, options?: { variables?: Record<string, unknown>; signal?: AbortSignal }) => {
    if (query !== RewardsBalance) throw new Error("Shopify doesn't answer that document here");
    if (fail) throw new Error("fetch failed");
    if (hang) {
      // As fetch does, the request fails only when its signal aborts
      await new Promise((_, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    }
    if (hangForever) await new Promise(() => {});
    const balances = accounts[String(options?.variables?.customerId)];
    const pageInfo = hasNextPage === null ? {} : { pageInfo: { hasNextPage } };
    return {
      json: async () => ({
        data: {
          customer: balances ? { storeCreditAccounts: { nodes: balances.map((balance) => ({ balance })), ...pageInfo } } : null,
        },
        extensions: { cost: { throttleStatus: { maximumAvailable: 2000, currentlyAvailable: available, restoreRate: 100 } } },
      }),
    };
  });
  return { admin: { graphql } satisfies GraphqlClient, graphql };
}

const SHOPPER = "gid://shopify/Customer/1";
const gbp = (amount: string): Money => ({ amount, currencyCode: "GBP" });
const usd = (amount: string): Money => ({ amount, currencyCode: "USD" });
const eur = (amount: string): Money => ({ amount, currencyCode: "EUR" });

/** The balance as a plain string, or null. */
async function shown(balance: Promise<Decimal | null>): Promise<string | null> {
  const value = await balance;
  return value === null ? null : value.toString();
}

describe("liveBalance", () => {
  let liveBalance: typeof LiveBalance;

  // An empty cache for each test
  beforeEach(async () => {
    vi.resetModules();
    ({ liveBalance } = await import("~/shopify/live-balance.server"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the balance Shopify holds now", async () => {
    const { admin: client, graphql } = admin({ accounts: { [SHOPPER]: [gbp("12.50")] } });
    await expect(shown(liveBalance("now.myshopify.com", "1", "GBP", client))).resolves.toBe("12.5");
    expect(graphql.mock.calls[0][1]).toEqual({ variables: { customerId: SHOPPER }, signal: expect.any(AbortSignal) });
  });

  it("returns the account in the currency asked for", async () => {
    const accounts = { [SHOPPER]: [usd("40.00"), gbp("7.25")] };
    await expect(shown(liveBalance("two-currencies.myshopify.com", "1", "GBP", admin({ accounts }).admin))).resolves.toBe("7.25");
    await expect(shown(liveBalance("two-currencies.myshopify.com", "1", "USD", admin({ accounts }).admin))).resolves.toBe("40");
  });

  it("returns 0 when the buyer has no credit", async () => {
    const none = admin({ accounts: { [SHOPPER]: [] } }).admin;
    await expect(shown(liveBalance("no-accounts.myshopify.com", "1", "GBP", none))).resolves.toBe("0");
    const spent = admin({ accounts: { [SHOPPER]: [gbp("0.00"), usd("0.00")] } }).admin;
    await expect(shown(liveBalance("all-spent.myshopify.com", "1", "GBP", spent))).resolves.toBe("0");
  });

  // The widget can't show credit held in another currency, and mustn't say it's none
  it("returns null when the buyer's credit is only in another currency", async () => {
    const otherCurrency = admin({ accounts: { [SHOPPER]: [eur("5.00")] } }).admin;
    await expect(liveBalance("other-currency.myshopify.com", "1", "GBP", otherCurrency)).resolves.toBeNull();
    const spentHere = admin({ accounts: { [SHOPPER]: [gbp("0.00"), eur("5.00")] } }).admin;
    await expect(liveBalance("spent-here.myshopify.com", "1", "GBP", spentHere)).resolves.toBeNull();
  });

  it("returns null when the buyer's credit may be on a later page", async () => {
    const { admin: client } = admin({ accounts: { [SHOPPER]: [usd("0.00")] }, hasNextPage: true });
    await expect(liveBalance("more-pages.myshopify.com", "1", "GBP", client)).resolves.toBeNull();
    const noPageInfo = admin({ accounts: { [SHOPPER]: [usd("0.00")] }, hasNextPage: null }).admin;
    await expect(liveBalance("no-page-info.myshopify.com", "1", "GBP", noPageInfo)).resolves.toBeNull();
  });

  it("asks Shopify once per buyer and currency while the answer is fresh", async () => {
    const { admin: client, graphql } = admin({ accounts: { [SHOPPER]: [gbp("5.00"), eur("2.00")], "gid://shopify/Customer/2": [gbp("9.00")] } });
    await liveBalance("cached.myshopify.com", "1", "GBP", client);
    await expect(shown(liveBalance("cached.myshopify.com", "1", "GBP", client))).resolves.toBe("5");
    expect(graphql).toHaveBeenCalledTimes(1);

    await expect(shown(liveBalance("cached.myshopify.com", "2", "GBP", client))).resolves.toBe("9");
    await expect(shown(liveBalance("other.myshopify.com", "1", "GBP", client))).resolves.toBe("5");
    await expect(shown(liveBalance("cached.myshopify.com", "1", "EUR", client))).resolves.toBe("2");
    expect(graphql).toHaveBeenCalledTimes(4);
  });

  it("asks again once the answer is 30 seconds old", async () => {
    vi.useFakeTimers();
    try {
      const { admin: client, graphql } = admin({ accounts: { [SHOPPER]: [gbp("5.00")] } });
      await liveBalance("stale.myshopify.com", "1", "GBP", client);
      vi.advanceTimersByTime(30 * 1000 + 1);
      await liveBalance("stale.myshopify.com", "1", "GBP", client);
      expect(graphql).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // A buyer's answer is kept for 30 seconds, and only that long, whoever
  // else is asked for in between
  it("keeps an answer for under 30 seconds, then asks Shopify again", async () => {
    vi.useFakeTimers();
    try {
      const { admin: client, graphql } = admin({ accounts: { [SHOPPER]: [gbp("5.00")], "gid://shopify/Customer/2": [gbp("9.00")] } });
      await liveBalance("kept.myshopify.com", "1", "GBP", client);
      vi.advanceTimersByTime(30 * 1000 - 1);
      await expect(shown(liveBalance("kept.myshopify.com", "1", "GBP", client))).resolves.toBe("5");
      expect(graphql).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      await liveBalance("kept.myshopify.com", "2", "GBP", client);
      await expect(shown(liveBalance("kept.myshopify.com", "1", "GBP", client))).resolves.toBe("5");
      expect(graphql).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null for a currency that isn't one, without asking Shopify or caching", async () => {
    const { admin: client, graphql } = admin({ accounts: { [SHOPPER]: [gbp("5.00")] } });
    await expect(liveBalance("lowercase.myshopify.com", "1", "gbp", client)).resolves.toBeNull();
    await expect(liveBalance("lowercase.myshopify.com", "1", "ZZZ", client)).resolves.toBeNull();
    await expect(liveBalance("lowercase.myshopify.com", "1", "gbp", client)).resolves.toBeNull();
    expect(graphql).not.toHaveBeenCalled();
  });

  it("returns null without an Admin API client (no offline session)", async () => {
    await expect(liveBalance("no-session.myshopify.com", "1", "GBP", undefined)).resolves.toBeNull();
  });

  // Storefront reads give way, so the app's own credits and debits, which
  // draw on the same API budget, aren't throttled because buyers looked
  it("returns null when Shopify can't be asked, and gives way for 10 seconds", async () => {
    vi.useFakeTimers();
    try {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const failing = admin({ fail: true });
      await expect(liveBalance("down.myshopify.com", "1", "GBP", failing.admin)).resolves.toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);

      const { admin: client, graphql } = admin({ accounts: { [SHOPPER]: [gbp("3.00")] } });
      await expect(liveBalance("down.myshopify.com", "2", "GBP", client)).resolves.toBeNull();
      expect(graphql).not.toHaveBeenCalled();
      await expect(shown(liveBalance("up.myshopify.com", "1", "GBP", client))).resolves.toBe("3");

      // The failure itself isn't remembered as a balance
      vi.advanceTimersByTime(10 * 1000);
      await expect(shown(liveBalance("down.myshopify.com", "1", "GBP", client))).resolves.toBe("3");
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives way while the shop's API budget is below half", async () => {
    vi.useFakeTimers();
    try {
      const accounts = { [SHOPPER]: [gbp("3.00")], "gid://shopify/Customer/2": [gbp("9.00")] };
      const low = admin({ accounts, available: 999 });
      await expect(shown(liveBalance("busy.myshopify.com", "1", "GBP", low.admin))).resolves.toBe("3");
      await expect(liveBalance("busy.myshopify.com", "2", "GBP", low.admin)).resolves.toBeNull();
      expect(low.graphql).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(10 * 1000);
      await expect(shown(liveBalance("busy.myshopify.com", "2", "GBP", low.admin))).resolves.toBe("9");

      const half = admin({ accounts, available: 1000 });
      await liveBalance("half.myshopify.com", "1", "GBP", half.admin);
      await expect(shown(liveBalance("half.myshopify.com", "2", "GBP", half.admin))).resolves.toBe("9");
      expect(half.graphql).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null when Shopify takes longer than 2.5 seconds", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      for (const answers of [{ hang: true }, { hangForever: true }]) {
        const { admin: client } = admin({ accounts: { [SHOPPER]: [gbp("3.00")] }, ...answers });
        const shop = answers.hang ? "slow.myshopify.com" : "deaf.myshopify.com";
        let settled = false;
        const balance = liveBalance(shop, "1", "GBP", client).finally(() => {
          settled = true;
        });
        await vi.advanceTimersByTimeAsync(2499);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(settled).toBe(true);
        await expect(balance).resolves.toBeNull();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null for an answer it can't read", async () => {
    const unknownShopper = admin().admin;
    await expect(liveBalance("unknown-shopper.myshopify.com", "1", "GBP", unknownShopper)).resolves.toBeNull();
    const badAmount = admin({ accounts: { [SHOPPER]: [gbp("not a number")] } }).admin;
    await expect(liveBalance("bad-amount.myshopify.com", "1", "GBP", badAmount)).resolves.toBeNull();
  });
});

describe("the rail's balance (the debit cap)", () => {
  it("reads Shopify every time, with no cache", async () => {
    const { admin: client, graphql } = admin({ accounts: { [SHOPPER]: [gbp("5.00")] } });
    const rail = createStoreCreditRail(client);
    await expect(shown(rail.balance("1", "GBP"))).resolves.toBe("5");
    await expect(shown(rail.balance("1", "GBP"))).resolves.toBe("5");
    expect(graphql).toHaveBeenCalledTimes(2);
    expect(graphql.mock.calls[0][1]).toEqual({ variables: { customerId: SHOPPER }, signal: expect.any(AbortSignal) });
  });

  // Unlike the widget's, the cap is the balance in the debit's own currency:
  // credit held in another one can't be taken back in this one
  it("is 0 when there's no credit in that currency, and null when Shopify can't say", async () => {
    const elsewhere = admin({ accounts: { [SHOPPER]: [eur("5.00")] } }).admin;
    await expect(shown(createStoreCreditRail(elsewhere).balance("1", "GBP"))).resolves.toBe("0");
    const morePages = admin({ accounts: { [SHOPPER]: [eur("5.00")] }, hasNextPage: true }).admin;
    await expect(createStoreCreditRail(morePages).balance("1", "GBP")).resolves.toBeNull();
    // A later page can't hold a second GBP account: a buyer has one per currency
    const found = admin({ accounts: { [SHOPPER]: [gbp("0.00")] }, hasNextPage: true }).admin;
    await expect(shown(createStoreCreditRail(found).balance("1", "GBP"))).resolves.toBe("0");
    await expect(createStoreCreditRail(admin().admin).balance("1", "GBP")).resolves.toBeNull();
    await expect(createStoreCreditRail(admin({ fail: true }).admin).balance("1", "GBP")).resolves.toBeNull();
    // Not a currency code: no account could match it, so it is not 0
    const { admin: client, graphql } = admin({ accounts: { [SHOPPER]: [gbp("5.00")] } });
    await expect(createStoreCreditRail(client).balance("1", "gbp")).resolves.toBeNull();
    expect(graphql).not.toHaveBeenCalled();
  });

  it("is null when Shopify takes longer than 2.5 seconds", async () => {
    vi.useFakeTimers();
    try {
      const { admin: client } = admin({ accounts: { [SHOPPER]: [gbp("3.00")] }, hangForever: true });
      const balance = createStoreCreditRail(client).balance("1", "GBP");
      await vi.advanceTimersByTimeAsync(2500);
      await expect(balance).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
