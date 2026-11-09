import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { getCustomerAccountsVersion } from "~/services/customer-accounts-version.server";

/**
 * Shopify lets shoppers spend store credit while signed in only on shops
 * that use new customer accounts ("Store credit isn't available for legacy
 * customer accounts", help.shopify.com/en/manual/customers/store-credit).
 * The membership proxy asks Shopify which kind a shop uses, once per shop
 * per few minutes, and answers null when it can't tell.
 */

function admin(answer: () => Promise<unknown>) {
  const graphql = vi.fn(async () => ({ json: answer }));
  return { admin: { graphql } as unknown as AdminApiContext, graphql };
}

const answering = (version: unknown) => async () => ({
  data: { shop: { customerAccountsV2: { customerAccountsVersion: version } } },
});

describe("getCustomerAccountsVersion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["NEW_CUSTOMER_ACCOUNTS", "CLASSIC"])("returns %s as Shopify reports it", async (version) => {
    const { admin: client } = admin(answering(version));
    await expect(getCustomerAccountsVersion(`${version}.myshopify.com`, client)).resolves.toBe(version);
  });

  it("asks Shopify once per shop while the answer is fresh", async () => {
    const { admin: client, graphql } = admin(answering("NEW_CUSTOMER_ACCOUNTS"));
    await getCustomerAccountsVersion("cached.myshopify.com", client);
    await expect(getCustomerAccountsVersion("cached.myshopify.com", client)).resolves.toBe("NEW_CUSTOMER_ACCOUNTS");
    expect(graphql).toHaveBeenCalledTimes(1);
    expect(String((graphql.mock.calls[0] as unknown[])[0])).toContain("customerAccountsVersion");
  });

  it("asks again once the answer is five minutes old", async () => {
    vi.useFakeTimers();
    try {
      const { admin: client, graphql } = admin(answering("CLASSIC"));
      await getCustomerAccountsVersion("stale.myshopify.com", client);
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      await getCustomerAccountsVersion("stale.myshopify.com", client);
      expect(graphql).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null without an Admin API client (no offline session)", async () => {
    await expect(getCustomerAccountsVersion("no-session.myshopify.com", undefined)).resolves.toBeNull();
  });

  it("returns null, and remembers nothing, when Shopify can't be asked", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = admin(async () => {
      throw new Error("fetch failed");
    });
    await expect(getCustomerAccountsVersion("down.myshopify.com", failing.admin)).resolves.toBeNull();

    const { admin: client } = admin(answering("NEW_CUSTOMER_ACCOUNTS"));
    await expect(getCustomerAccountsVersion("down.myshopify.com", client)).resolves.toBe("NEW_CUSTOMER_ACCOUNTS");
  });

  it.each([undefined, null, "SOMETHING_NEW"])("returns null for an answer it doesn't know (%s)", async (version) => {
    const { admin: client } = admin(answering(version));
    await expect(getCustomerAccountsVersion(`unknown-${String(version)}.myshopify.com`, client)).resolves.toBeNull();
  });
});
