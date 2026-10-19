import { describe, expect, it } from "vitest";
import { loader } from "~/routes/_index/route";

/** App Store requirement 2.3.1: no page asking merchants for their shop domain. */
async function locationOf(url: string): Promise<{ status: number; location: string | null }> {
  try {
    await loader({ request: new Request(url), params: {}, context: {} });
  } catch (thrown) {
    if (thrown instanceof Response) return { status: thrown.status, location: thrown.headers.get("Location") };
    throw thrown;
  }
  throw new Error("the home page must redirect");
}

describe("app host home page", () => {
  it("sends visitors to the product website", async () => {
    await expect(locationOf("https://app.example.test/")).resolves.toEqual({ status: 302, location: "https://rewardspro.io" });
  });

  it("sends Shopify's ?shop= launches into the embedded app with their parameters", async () => {
    const { location } = await locationOf("https://app.example.test/?shop=a.myshopify.com&host=abc&embedded=1");
    expect(location).toBe("/app?shop=a.myshopify.com&host=abc&embedded=1");
  });
});
