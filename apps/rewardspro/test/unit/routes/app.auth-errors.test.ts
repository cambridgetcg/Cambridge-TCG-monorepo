import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// /app's loader is exercised for real; only its server neighbours are stubbed.
vi.mock("@shopify/polaris/build/esm/styles.css?url", () => ({ default: "polaris.css" }));
vi.mock("~/shopify.server", () => ({
  authenticate: { admin: vi.fn() },
  FREE_PLAN: "RewardsPro Free",
  PRO_PLAN: "RewardsPro Pro",
  PRO_ANNUAL_PLAN: "RewardsPro Pro Annual",
  MAX_PLAN: "RewardsPro Max",
  MAX_ANNUAL_PLAN: "RewardsPro Max Annual",
  ULTRA_PLAN: "RewardsPro Ultra",
  ULTRA_ANNUAL_PLAN: "RewardsPro Ultra Annual",
  ENTERPRISE_PLAN: "Enterprise",
  STARTER_PLAN: "Starter",
  GROWTH_PLAN: "Growth",
  MONTHLY_PLAN: "Monthly",
  ANNUAL_PLAN: "Annual",
}));
vi.mock("~/db.server", () => ({ default: {} }));
vi.mock("~/services/entitlements.server", () => ({ getEntitlements: vi.fn() }));
vi.mock("~/services/shop-data-provider.server", () => ({ getShopSettings: vi.fn() }));
vi.mock("~/utils/request-logger", () => ({
  logRequest: vi.fn(async () => ({ startTime: 0, requestId: "test" })),
  logResponse: vi.fn(),
  logError: vi.fn(),
  logShopifyContext: vi.fn(),
  checkAuthenticationIssues: vi.fn(),
}));

import { authenticate } from "~/shopify.server";
import { loader } from "~/routes/app";

const shellSource = readFileSync(resolve(process.cwd(), "app/routes/app.tsx"), "utf8");

async function thrownBy(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (thrown) {
    return thrown;
  }
  throw new Error("the loader must throw");
}

describe("/app loader when Shopify authentication answers with a response", () => {
  beforeEach(() => {
    vi.mocked(authenticate.admin).mockReset();
  });

  it("throws a 4xx answer so Shopify's error boundary renders it, instead of handing it to the page as data", async () => {
    // authenticate.admin answers a bot user agent with 410 Gone
    vi.mocked(authenticate.admin).mockRejectedValue(new Response("", { status: 410 }));

    const thrown = await thrownBy(loader({ request: new Request("https://app.example.test/app"), params: {}, context: {} }));

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(410);
  });

  it("throws a 401 answer the same way", async () => {
    vi.mocked(authenticate.admin).mockRejectedValue(new Response("Unauthorized", { status: 401 }));

    const thrown = await thrownBy(loader({ request: new Request("https://app.example.test/app"), params: {}, context: {} }));

    expect((thrown as Response).status).toBe(401);
  });

  it("still passes a redirect (the OAuth flow) through", async () => {
    vi.mocked(authenticate.admin).mockRejectedValue(
      new Response(null, { status: 302, headers: { Location: "/auth/login" } }),
    );

    const response = await loader({ request: new Request("https://app.example.test/app"), params: {}, context: {} });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/auth/login");
  });
});

describe("/app shell", () => {
  it("never tells a merchant the API key is missing: an empty key stops the server before any page renders", () => {
    expect(shellSource).not.toContain("API key not configured");
  });
});
