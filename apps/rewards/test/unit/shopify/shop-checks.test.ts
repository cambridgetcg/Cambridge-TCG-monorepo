import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RewardsCustomerAccounts, RewardsStoreCreditConfig, type GraphqlClient } from "~/shopify/graphql";
import type * as ShopChecks from "~/shopify/shop-checks.server";

/**
 * Shopify lets a buyer spend store credit at checkout only when signed in
 * through new customer accounts or using Shop Pay, and only while store
 * credit is turned on (help.shopify.com/en/manual/customers/store-credit).
 * Carried from apps/rewardspro's customer-accounts-version and
 * store-credit-spend tests, on the two Rewards documents.
 */

interface Answers {
  version?: unknown;
  signInLinksShown?: unknown;
  storeCreditOn?: unknown;
  accountsFail?: boolean;
  storeCreditFail?: boolean;
  /** Shopify never answers the accounts document until the request is aborted */
  accountsHang?: boolean;
}

function admin(o: Answers = {}) {
  const { version = "NEW_CUSTOMER_ACCOUNTS", signInLinksShown = true, storeCreditOn = true } = o;
  const graphql = vi.fn(async (query: string, options?: { signal?: AbortSignal }) => {
    if (query === RewardsCustomerAccounts) {
      if (o.accountsFail) throw new Error("fetch failed");
      if (o.accountsHang) await new Promise((_, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
      const data = { shop: { customerAccountsV2: { customerAccountsVersion: version, loginLinksVisibleOnStorefrontAndCheckout: signInLinksShown } } };
      return { json: async () => ({ data }) };
    }
    if (query === RewardsStoreCreditConfig) {
      if (o.storeCreditFail) throw new Error("fetch failed");
      return { json: async () => ({ data: { storeCreditConfiguration: { storeCreditEnabled: storeCreditOn } } }) };
    }
    throw new Error("Shopify doesn't answer that document here");
  });
  return { admin: { graphql } satisfies GraphqlClient, graphql };
}

let checks: typeof ShopChecks;

beforeEach(async () => {
  // An empty cache for each test
  vi.resetModules();
  checks = await import("~/shopify/shop-checks.server");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("customerAccountsVersion", () => {
  it("returns the version Shopify reports", async () => {
    await expect(checks.customerAccountsVersion("new.myshopify.com", admin().admin)).resolves.toBe("NEW_CUSTOMER_ACCOUNTS");
    await expect(checks.customerAccountsVersion("classic.myshopify.com", admin({ version: "CLASSIC" }).admin)).resolves.toBe("CLASSIC");
  });

  it("asks once per shop for 5 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { admin: client, graphql } = admin();
    await checks.customerAccountsVersion("cached.myshopify.com", client);
    vi.advanceTimersByTime(5 * 60 * 1000 - 1);
    await expect(checks.customerAccountsVersion("cached.myshopify.com", undefined)).resolves.toBe("NEW_CUSTOMER_ACCOUNTS");
    expect(graphql).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await checks.customerAccountsVersion("cached.myshopify.com", client);
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("returns null, uncached, without a client, for an unknown answer, or when Shopify fails or takes over 2.5 s", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(checks.customerAccountsVersion("none.myshopify.com", undefined)).resolves.toBeNull();
    const unknown = admin({ version: "SOMETHING_NEW" });
    await expect(checks.customerAccountsVersion("unknown.myshopify.com", unknown.admin)).resolves.toBeNull();
    await expect(checks.customerAccountsVersion("unknown.myshopify.com", unknown.admin)).resolves.toBeNull();
    expect(unknown.graphql).toHaveBeenCalledTimes(2);
    await expect(checks.customerAccountsVersion("down.myshopify.com", admin({ accountsFail: true }).admin)).resolves.toBeNull();

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const slow = checks.customerAccountsVersion("slow.myshopify.com", admin({ accountsHang: true }).admin);
    await vi.advanceTimersByTimeAsync(checks.SHOP_CHECK_TIMEOUT_MS);
    await expect(slow).resolves.toBeNull();
    expect(checks.SHOP_CHECK_TIMEOUT_MS).toBe(2500);
    expect(console.warn).toHaveBeenCalledWith("[shop-checks] Could not read the store credit setup of slow.myshopify.com:", "Shopify did not answer within 2.5 s");
  });
});

describe("storeCreditSpendProblems", () => {
  it("reports nothing when buyers can spend store credit", async () => {
    await expect(checks.storeCreditSpendProblems(admin().admin, "fine.myshopify.com")).resolves.toEqual([]);
  });

  it("reports each problem Shopify confirms, in the order the merchant fixes them", async () => {
    const all = admin({ version: "CLASSIC", signInLinksShown: false, storeCreditOn: false });
    await expect(checks.storeCreditSpendProblems(all.admin, "all.myshopify.com")).resolves.toEqual([
      "legacy-accounts",
      "sign-in-links-hidden",
      "store-credit-off",
    ]);
    await expect(checks.storeCreditSpendProblems(admin({ storeCreditOn: false }).admin, "off.myshopify.com")).resolves.toEqual(["store-credit-off"]);
  });

  it("asks fresh on every call", async () => {
    const { admin: client, graphql } = admin();
    await checks.storeCreditSpendProblems(client, "fresh.myshopify.com");
    await checks.storeCreditSpendProblems(client, "fresh.myshopify.com");
    expect(graphql).toHaveBeenCalledTimes(4);
  });

  it("one answer Shopify can't give doesn't hide the other, and reports nothing itself", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      checks.storeCreditSpendProblems(admin({ version: "CLASSIC", storeCreditFail: true }).admin, "half.myshopify.com"),
    ).resolves.toEqual(["legacy-accounts"]);
    await expect(
      checks.storeCreditSpendProblems(admin({ accountsFail: true, storeCreditOn: false }).admin, "other-half.myshopify.com"),
    ).resolves.toEqual(["store-credit-off"]);
    // Answers this code doesn't know report nothing
    await expect(
      checks.storeCreditSpendProblems(admin({ version: null, signInLinksShown: "no", storeCreditOn: 0 }).admin, "odd.myshopify.com"),
    ).resolves.toEqual([]);
  });
});
