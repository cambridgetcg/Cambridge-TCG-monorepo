import { afterEach, describe, expect, it, vi } from "vitest";
import { Kind, parse, type SelectionSetNode } from "graphql";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { getStoreCreditSpendProblems } from "~/services/store-credit-spend.server";

/**
 * Shopify lets a shopper spend store credit at checkout only when signed in
 * through new customer accounts or using Shop Pay ("Store credit isn't
 * available for legacy customer accounts"), and only while store credit is
 * turned on in Settings > Customer accounts
 * (help.shopify.com/en/manual/customers/store-credit). The dashboard warns
 * about each of these that Shopify confirms.
 */

// The fields each query must select, as Admin API 2026-10 names them
const CUSTOMER_ACCOUNTS_FIELDS = [
  "shop.customerAccountsV2.customerAccountsVersion",
  "shop.customerAccountsV2.loginLinksVisibleOnStorefrontAndCheckout",
];
const STORE_CREDIT_FIELDS = ["storeCreditConfiguration.storeCreditEnabled"];

/** Every leaf field a query selects, as a dotted path */
function selectedFields(query: string): string[] {
  const fields: string[] = [];
  const walk = (selectionSet: SelectionSetNode, prefix: string) => {
    for (const selection of selectionSet.selections) {
      if (selection.kind !== Kind.FIELD) continue;
      const path = prefix + selection.name.value;
      if (selection.selectionSet) walk(selection.selectionSet, `${path}.`);
      else fields.push(path);
    }
  };
  for (const definition of parse(query).definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) walk(definition.selectionSet, "");
  }
  return fields.sort();
}

const selects = (query: string, fields: string[]) => selectedFields(query).join() === fields.join();

interface Answers {
  version?: unknown;
  signInLinksShown?: unknown;
  storeCreditOn?: unknown;
  accountsFail?: boolean;
  storeCreditFail?: boolean;
}

function admin({
  version = "NEW_CUSTOMER_ACCOUNTS",
  signInLinksShown = true,
  storeCreditOn = true,
  accountsFail = false,
  storeCreditFail = false,
}: Answers = {}) {
  const graphql = vi.fn(async (query: string) => {
    if (selects(query, CUSTOMER_ACCOUNTS_FIELDS)) {
      if (accountsFail) throw new Error("fetch failed");
      return {
        json: async () => ({
          data: {
            shop: {
              customerAccountsV2: {
                customerAccountsVersion: version,
                loginLinksVisibleOnStorefrontAndCheckout: signInLinksShown,
              },
            },
          },
        }),
      };
    }
    if (selects(query, STORE_CREDIT_FIELDS)) {
      if (storeCreditFail) throw new Error("fetch failed");
      return { json: async () => ({ data: { storeCreditConfiguration: { storeCreditEnabled: storeCreditOn } } }) };
    }
    // Shopify answers a field its schema doesn't have with an error, not data
    throw new Error(`Shopify doesn't answer: ${selectedFields(query).join(", ")}`);
  });
  return { admin: { graphql } as unknown as AdminApiContext, graphql };
}

const SHOP = "shop.myshopify.com";

describe("getStoreCreditSpendProblems", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("finds nothing on a shop with new customer accounts, sign-in links and store credit on", async () => {
    await expect(getStoreCreditSpendProblems(admin().admin, SHOP)).resolves.toEqual([]);
  });

  it("reports legacy customer accounts", async () => {
    await expect(getStoreCreditSpendProblems(admin({ version: "CLASSIC" }).admin, SHOP)).resolves.toEqual([
      "legacy-accounts",
    ]);
  });

  it("reports hidden sign-in links, so shoppers can't sign in at checkout", async () => {
    await expect(getStoreCreditSpendProblems(admin({ signInLinksShown: false }).admin, SHOP)).resolves.toEqual([
      "sign-in-links-hidden",
    ]);
  });

  it("reports store credit turned off", async () => {
    await expect(getStoreCreditSpendProblems(admin({ storeCreditOn: false }).admin, SHOP)).resolves.toEqual([
      "store-credit-off",
    ]);
  });

  it("reports every problem at once, in the order the merchant fixes them", async () => {
    const client = admin({ version: "CLASSIC", signInLinksShown: false, storeCreditOn: false }).admin;
    await expect(getStoreCreditSpendProblems(client, SHOP)).resolves.toEqual([
      "legacy-accounts",
      "sign-in-links-hidden",
      "store-credit-off",
    ]);
  });

  it("asks Shopify on every call, so the warning goes as soon as the merchant fixes it", async () => {
    const { admin: client, graphql } = admin({ version: "CLASSIC" });
    await getStoreCreditSpendProblems(client, SHOP);
    await getStoreCreditSpendProblems(client, SHOP);
    expect(graphql).toHaveBeenCalledTimes(4);
  });

  it("still reports what one answer shows when Shopify can't give the other", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      getStoreCreditSpendProblems(admin({ version: "CLASSIC", storeCreditFail: true }).admin, SHOP),
    ).resolves.toEqual(["legacy-accounts"]);
    await expect(
      getStoreCreditSpendProblems(admin({ storeCreditOn: false, accountsFail: true }).admin, SHOP),
    ).resolves.toEqual(["store-credit-off"]);
  });

  it("reports nothing it can't confirm", async () => {
    const client = admin({ version: "SOMETHING_NEW", signInLinksShown: null, storeCreditOn: undefined }).admin;
    await expect(getStoreCreditSpendProblems(client, SHOP)).resolves.toEqual([]);
  });
});
