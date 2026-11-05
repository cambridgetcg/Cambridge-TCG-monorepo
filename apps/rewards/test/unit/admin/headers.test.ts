import { describe, expect, it, vi } from "vitest";

// The routes are imported for their `headers` only; nothing here reaches Shopify or the database.
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, unauthenticated: {} }));

const { privatePageHeaders } = await import("~/admin/headers");

type Args = Parameters<typeof privatePageHeaders>[0];
const args = (o: Partial<Record<"parentHeaders" | "loaderHeaders" | "actionHeaders" | "errorHeaders", Headers>>) =>
  ({ parentHeaders: new Headers(), loaderHeaders: new Headers(), actionHeaders: new Headers(), errorHeaders: undefined, ...o }) as unknown as Args;

// BOUNDARY-2: a page that shows buyers' names or balances is kept by no cache
describe("privatePageHeaders", () => {
  it("keeps Shopify's boundary headers and adds private, no-store", () => {
    const headers = new Headers(privatePageHeaders(args({ parentHeaders: new Headers({ Link: "<https://cdn.shopify.com>" }), loaderHeaders: new Headers({ "X-Loader": "1" }) })));
    expect(headers.get("Link")).toBe("<https://cdn.shopify.com>");
    expect(headers.get("X-Loader")).toBe("1");
    expect(headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("keeps a thrown response's own headers, as Shopify's boundary does, with no-store", () => {
    const headers = new Headers(
      privatePageHeaders(args({ loaderHeaders: new Headers({ "X-Loader": "1" }), errorHeaders: new Headers({ "X-Shopify-Retry-Invalid-Session-Request": "1" }) })),
    );
    expect(headers.get("X-Shopify-Retry-Invalid-Session-Request")).toBe("1");
    expect(headers.get("X-Loader")).toBeNull();
    expect(headers.get("Cache-Control")).toBe("private, no-store");
  });

  it.each([
    ["Home", () => import("~/routes/app._index")],
    ["Customers", () => import("~/routes/app.customers._index")],
    ["the buyer panel", () => import("~/routes/app.customers.$id")],
    ["Orders", () => import("~/routes/app.orders._index")],
    ["the order panel", () => import("~/routes/app.orders.$id")],
    ["Customer data requests", () => import("~/routes/app.settings.privacy")],
  ])("is what %s sends", async (_page, load) => {
    expect((await load()).headers).toBe(privatePageHeaders);
  });
});
