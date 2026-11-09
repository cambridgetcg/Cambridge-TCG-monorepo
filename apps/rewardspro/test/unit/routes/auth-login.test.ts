import { afterEach, describe, expect, it, vi } from "vitest";

// Vite will not serve Polaris's stylesheet URL to tests; the loader never uses it
vi.mock("@shopify/polaris/build/esm/styles.css?url", () => ({ default: "" }));

import { loader } from "~/routes/auth.login/route";

/**
 * App Store requirement 2.3.1: no page asking merchants to type their shop
 * domain. A merchant who reaches /auth/login without a session (say, by
 * opening /app outside Shopify admin) goes to the App Store listing, where
 * they can install or open the app.
 */
async function load(url: string) {
  try {
    return { data: await loader({ request: new Request(url), params: {}, context: {} }) };
  } catch (thrown) {
    if (thrown instanceof Response) return { status: thrown.status, location: thrown.headers.get("Location") };
    throw thrown;
  }
}

describe("/auth/login", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends a visitor without a shop to the App Store listing", async () => {
    await expect(load("https://app.example.test/auth/login")).resolves.toEqual({
      status: 302,
      location: "https://apps.shopify.com/rewards-pro",
    });
  });

  it("sends a request that names a shop on to Shopify to log in", async () => {
    const { status, location } = await load("https://app.example.test/auth/login?shop=a.myshopify.com");
    expect(status).toBe(302);
    expect(location).toMatch(/^https:\/\/admin\.shopify\.com\/store\/a\/oauth\/install\?client_id=/);
  });

  it("still shows the shop-domain form in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = await load("https://app.example.test/auth/login");
    expect(result).toHaveProperty("data.errors", {});
  });
});
