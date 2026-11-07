import { describe, expect, it } from "vitest";

import { loader } from "~/routes/_index";

/** Runs the loader and returns the redirect it throws. */
async function redirectFor(url: string) {
  try {
    await loader({ request: new Request(url), params: {}, context: {} } as Parameters<typeof loader>[0]);
  } catch (thrown) {
    if (thrown instanceof Response) return thrown;
    throw thrown;
  }
  throw new Error("the loader did not redirect");
}

describe("the root route", () => {
  it("sends Shopify's ?shop= request into the app, keeping every parameter", async () => {
    const response = await redirectFor("https://test.example.com/?shop=demo.myshopify.com&host=abc&embedded=1");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/app?shop=demo.myshopify.com&host=abc&embedded=1");
  });

  it("sends anyone else to the public site", async () => {
    const response = await redirectFor("https://test.example.com/");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://rewardspro.io");
  });
});
