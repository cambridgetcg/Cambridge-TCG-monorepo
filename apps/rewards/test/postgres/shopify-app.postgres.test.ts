import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hasTestDatabase } from "./helpers/database";

// ~/shopify.server builds its session storage at import, and the storage
// checks the Session table at once, so it is imported only when a test
// database is there.
type ShopifyServer = typeof import("~/shopify.server");
type LoginRoute = typeof import("~/routes/auth.login");

const API_KEY = "test-api-key";

async function thrownBy(run: () => Promise<unknown>): Promise<Response> {
  try {
    await run();
  } catch (thrown) {
    if (thrown instanceof Response) return thrown;
    throw thrown;
  }
  throw new Error("nothing was thrown");
}

function loginLoader(route: LoginRoute, url: string) {
  return route.loader({ request: new Request(url), params: {}, context: {} } as Parameters<LoginRoute["loader"]>[0]);
}

describe.skipIf(!hasTestDatabase)("the Shopify app config", () => {
  let shopify: ShopifyServer;
  let loginRoute: LoginRoute;

  beforeAll(async () => {
    // The library logs its version at start and each login redirect at INFO.
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.SHOPIFY_API_KEY = API_KEY;
    shopify = await import("~/shopify.server");
    loginRoute = await import("~/routes/auth.login");
  });

  afterEach(() => {
    delete process.env.SHOP_CUSTOM_DOMAIN;
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    delete process.env.SHOPIFY_API_KEY;
    vi.restoreAllMocks();
  });

  it("talks to Admin API 2026-10", () => {
    expect(shopify.apiVersion).toBe("2026-10");
  });

  it("lets the shop's admin frame the page and preloads Polaris 2", () => {
    const headers = new Headers();
    shopify.addDocumentResponseHeaders(new Request("https://test.example.com/app?shop=demo.myshopify.com"), headers);

    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors https://demo.myshopify.com https://admin.shopify.com");
    expect(headers.get("Link")).toContain('<https://cdn.shopify.com/shopifycloud/polaris-2.js>; rel="preload"; as="script"');
  });

  it("sends a login without a shop to the App Store listing outside development", async () => {
    const response = await thrownBy(() => loginLoader(loginRoute, "https://test.example.com/auth/login"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://apps.shopify.com/rewards-pro");
  });

  it("sends a login that names a shop on to Shopify", async () => {
    const response = await thrownBy(() =>
      loginLoader(loginRoute, "https://test.example.com/auth/login?shop=demo.myshopify.com"),
    );

    expect(response.headers.get("Location")).toBe(`https://admin.shopify.com/store/demo/oauth/install?client_id=${API_KEY}`);
  });

  it("shows the login form in development", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await expect(loginLoader(loginRoute, "https://test.example.com/auth/login")).resolves.toEqual({ errors: {} });
  });

  it("accepts shops on SHOP_CUSTOM_DOMAIN, and only when it is set", async () => {
    const shop = "demo.shops.example.test";
    const request = () => new Request(`https://test.example.com/app?shop=${shop}`);
    const plain = new Headers();
    shopify.addDocumentResponseHeaders(request(), plain);
    expect(plain.get("Content-Security-Policy")).toBeNull();

    process.env.SHOP_CUSTOM_DOMAIN = "shops\\.example\\.test";
    vi.resetModules();
    const custom: ShopifyServer = await import("~/shopify.server");
    const headers = new Headers();
    custom.addDocumentResponseHeaders(request(), headers);
    expect(headers.get("Content-Security-Policy")).toContain(`frame-ancestors https://${shop} `);
  });
});
