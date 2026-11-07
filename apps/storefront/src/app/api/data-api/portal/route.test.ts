import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), getClient: vi.fn(), findCustomer: vi.fn(), createPortal: vi.fn(), retrieveConfiguration: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/data-api/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data-api/billing")>()),
  getDataApiStripeTestClient: mocks.getClient,
  findDataApiCustomer: mocks.findCustomer,
}));

import { POST } from "./route";

const USER = "8b7f0d2e-3c1a-4f5e-9a6b-1c2d3e4f5a6b";
const CUSTOMER = "cus_dataapiportal01";
const CONFIG_ENV = {
  DATA_API_STRIPE_SECRET_KEY: "sk_test_fixture_dataapi_0000001",
  DATA_API_STRIPE_WEBHOOK_SECRET: "whsec_fixture_dataapi_00000001",
  DATA_API_STRIPE_PRICE_PRO: "price_dataapipro0001",
  DATA_API_STRIPE_PRICE_BUSINESS: "price_dataapibiz0001",
  DATA_API_STRIPE_PORTAL_CONFIGURATION: "bpc_dataapiportal01",
};
const CONFIGURATION = CONFIG_ENV.DATA_API_STRIPE_PORTAL_CONFIGURATION;

function request(body = "{}", origin: string | null = "https://cambridgetcg.com"): Request {
  const headers = new Headers({ "content-type": "application/json", "sec-fetch-site": "same-origin" });
  if (origin !== null) headers.set("origin", origin);
  return new Request("https://cambridgetcg.com/api/data-api/portal", { method: "POST", headers, body });
}
function portal(overrides: Record<string, unknown> = {}) {
  return { id: "bps_test_dataapi01", object: "billing_portal.session", livemode: false, customer: CUSTOMER, configuration: CONFIGURATION,
    return_url: "https://cambridgetcg.com/account/data", url: "https://billing.stripe.com/p/session/test_dataapi01", ...overrides };
}
/** The pinned configuration as Stripe returns it: the two plans' prices, no quantity change, cancellation at period end. */
function configuration(update: Record<string, unknown> = {}, top: Record<string, unknown> = {}) {
  return {
    id: CONFIGURATION, object: "billing_portal.configuration", active: true, livemode: false,
    features: {
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: {
        enabled: true, default_allowed_updates: ["price"],
        products: [{ product: "ctcg_data_api_pro", prices: ["price_dataapipro0001"], adjustable_quantity: { enabled: false } }, { product: "ctcg_data_api_business", prices: ["price_dataapibiz0001"], adjustable_quantity: { enabled: false } }],
        ...update,
      },
    },
    ...top,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  for (const [key, value] of Object.entries(CONFIG_ENV)) vi.stubEnv(key, value);
  // Intake stays closed throughout: cancelling must not depend on it.
  vi.stubEnv("DATA_API_CHECKOUT_INTAKE", "");
  mocks.auth.mockResolvedValue({ user: { id: USER } });
  mocks.findCustomer.mockResolvedValue(CUSTOMER);
  mocks.createPortal.mockResolvedValue(portal());
  mocks.retrieveConfiguration.mockResolvedValue(configuration());
  mocks.getClient.mockReturnValue({ billingPortal: { sessions: { create: mocks.createPortal }, configurations: { retrieve: mocks.retrieveConfiguration } } });
});
afterEach(() => vi.unstubAllEnvs());

describe("data-API billing portal", () => {
  it("rejects cross-origin or non-empty input before auth and storage", async () => {
    expect((await POST(request("{}", "https://evil.example"))).status).toBe(403);
    expect((await POST(request('{"customer":"cus_attacker0001"}'))).status).toBe(400);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.findCustomer).not.toHaveBeenCalled();
  });

  it("requires auth before configuration, lookup or Stripe", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.findCustomer).not.toHaveBeenCalled();
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it("is unavailable with a live key and never reaches Stripe", async () => {
    vi.stubEnv("DATA_API_STRIPE_SECRET_KEY", "sk_live_fixture_dataapi_0000001");
    expect((await POST(request())).status).toBe(503);
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it("needs the account's own customer", async () => {
    mocks.findCustomer.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(409);
    expect(mocks.findCustomer).toHaveBeenCalledWith(USER);
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it("opens the portal for that customer while checkout intake is closed, pinned to the checked configuration", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.retrieveConfiguration).toHaveBeenCalledWith(CONFIGURATION, { expand: ["features.subscription_update.products"] });
    expect(mocks.createPortal).toHaveBeenCalledWith({ customer: CUSTOMER, configuration: CONFIGURATION, return_url: "https://cambridgetcg.com/account/data" });
    await expect(response.json()).resolves.toEqual({
      schema: "cambridgetcg.data-api-billing-redirect/1", kind: "portal", url: "https://billing.stripe.com/p/session/test_dataapi01",
    });
  });

  it("is unavailable while no portal configuration is pinned: never the account default", async () => {
    vi.stubEnv("DATA_API_STRIPE_PORTAL_CONFIGURATION", "");
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "portal_unavailable" } });
    expect(mocks.findCustomer).not.toHaveBeenCalled();
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, unknown>, Record<string, unknown>]>([
    ["an inactive configuration", {}, { active: false }],
    ["a live configuration", {}, { livemode: true }],
    ["another configuration", {}, { id: "bpc_accountdefault1" }],
    ["a price no plan answers", { products: [{ product: "prod_other", prices: ["price_othertest0001"], adjustable_quantity: { enabled: false } }] }, {}],
    ["quantity changes", { default_allowed_updates: ["price", "quantity"] }, {}],
    ["products it could not read", { products: undefined }, {}],
  ])("refuses %s before opening a session", async (_label, update, top) => {
    mocks.retrieveConfiguration.mockResolvedValueOnce(configuration(update, top));
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "portal_configuration_mismatch" } });
    expect(mocks.createPortal).not.toHaveBeenCalled();
  });

  it("refuses immediate cancellation, which would end a paid period early", async () => {
    mocks.retrieveConfiguration.mockResolvedValueOnce({ ...configuration(), features: { ...configuration().features, subscription_cancel: { enabled: true, mode: "immediately" } } });
    expect((await POST(request())).status).toBe(503);
    expect(mocks.createPortal).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, unknown>]>([
    ["a session on another configuration", { configuration: "bpc_accountdefault1" }],
    ["a live session", { livemode: true }],
    ["another customer", { customer: "cus_someoneelse001" }],
    ["another return URL", { return_url: "https://evil.example/" }],
    ["a non-Stripe URL", { url: "https://evil.example/session" }],
  ])("refuses %s from Stripe", async (_label, overrides) => {
    mocks.createPortal.mockResolvedValueOnce(portal(overrides));
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "portal_session_mismatch" } });
  });

  it("returns a private structured failure on provider errors", async () => {
    mocks.createPortal.mockRejectedValueOnce(new Error("secret provider detail"));
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(JSON.stringify(body)).not.toContain("secret provider detail");
  });
});
