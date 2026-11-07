import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getClient: vi.fn(),
  findCustomer: vi.fn(),
  bindCustomer: vi.fn(),
  listOpen: vi.fn(),
  createCustomer: vi.fn(),
  createSession: vi.fn(),
  retrievePrice: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
// The real configuration reader (live keys refused); Stripe and the store are injected fakes.
vi.mock("@/lib/data-api/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data-api/billing")>()),
  getDataApiStripeTestClient: mocks.getClient,
  findDataApiCustomer: mocks.findCustomer,
  bindDataApiCustomer: mocks.bindCustomer,
  listOpenDataApiSubscriptions: mocks.listOpen,
}));

import { DataApiBillingNotProvisionedError } from "@/lib/data-api/billing";
import { DATA_API_PLANS } from "@/lib/data-api/plans";
import { POST } from "./route";

const USER = "8b7f0d2e-3c1a-4f5e-9a6b-1c2d3e4f5a6b";
// Test-mode checkout admits operators only; every other role is a member here.
const OPERATOR = { user: { id: USER, role: "admin" } };
const CUSTOMER = "cus_dataapiroute001";
const CONFIG_ENV = {
  DATA_API_STRIPE_SECRET_KEY: "rk_test_fixture_dataapi_0000001",
  DATA_API_STRIPE_WEBHOOK_SECRET: "whsec_fixture_dataapi_00000001",
  DATA_API_STRIPE_PRICE_PRO: "price_dataapipro0001",
  DATA_API_STRIPE_PRICE_BUSINESS: "price_dataapibiz0001",
  DATA_API_STRIPE_PORTAL_CONFIGURATION: "bpc_dataapiportal01",
};

function request(body = '{"plan":"pro"}', options: { origin?: string | null; contentType?: string } = {}): Request {
  const headers = new Headers({ "content-type": options.contentType ?? "application/json", "sec-fetch-site": "same-origin" });
  const origin = options.origin === undefined ? "https://cambridgetcg.com" : options.origin;
  if (origin !== null) headers.set("origin", origin);
  return new Request("https://cambridgetcg.com/api/data-api/checkout", { method: "POST", headers, body });
}
function stubEnv(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}
function openIntake(extra: Record<string, string> = {}) {
  stubEnv({ ...CONFIG_ENV, DATA_API_CHECKOUT_INTAKE: "test", ...extra });
}
function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_dataapiroute001", object: "checkout.session", livemode: false, mode: "subscription",
    customer: CUSTOMER, client_reference_id: USER, metadata: { type: "data_api_subscription", plan: "pro", user_id: USER },
    url: "https://checkout.stripe.com/c/pay/cs_test_dataapiroute001", ...overrides,
  };
}
/** The configured price as Stripe returns it, its product expanded, as the setup script makes it. */
function stripePrice(id: string, overrides: Record<string, unknown> = {}) {
  const plan = id === CONFIG_ENV.DATA_API_STRIPE_PRICE_PRO ? "pro" : "business";
  return {
    id, object: "price", active: true, livemode: false, type: "recurring", currency: "gbp", unit_amount: DATA_API_PLANS[plan].price.amountPence,
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    product: { id: `ctcg_data_api_${plan}`, object: "product", active: true, livemode: false, metadata: { type: "data_api_subscription", plan } },
    ...overrides,
  };
}
const nothingReached = () => {
  expect(mocks.getClient).not.toHaveBeenCalled();
  expect(mocks.createCustomer).not.toHaveBeenCalled();
  expect(mocks.createSession).not.toHaveBeenCalled();
  expect(mocks.findCustomer).not.toHaveBeenCalled();
  expect(mocks.listOpen).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of [...Object.keys(CONFIG_ENV), "DATA_API_CHECKOUT_INTAKE"]) vi.stubEnv(key, "");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.auth.mockResolvedValue(OPERATOR);
  mocks.listOpen.mockResolvedValue([]);
  mocks.findCustomer.mockResolvedValue(null);
  mocks.bindCustomer.mockImplementation(async (_user: string, customer: string) => customer);
  mocks.createCustomer.mockResolvedValue({ id: CUSTOMER, object: "customer", livemode: false });
  mocks.createSession.mockResolvedValue(session());
  mocks.retrievePrice.mockImplementation(async (id: string) => stripePrice(id));
  mocks.getClient.mockReturnValue({ customers: { create: mocks.createCustomer }, checkout: { sessions: { create: mocks.createSession } }, prices: { retrieve: mocks.retrievePrice } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("data-API checkout admission", () => {
  it("answers 410 while intake is closed, even to an operator, before configuration, the database or Stripe", async () => {
    for (const intake of ["", "closed", "open", "TEST", "test "]) {
      stubEnv({ ...CONFIG_ENV, DATA_API_CHECKOUT_INTAKE: intake });
      const response = await POST(request());
      expect(response.status).toBe(410);
      expect(response.headers.get("cache-control")).toContain("no-store");
      await expect(response.json()).resolves.toMatchObject({ error: { code: "DATA_API_CHECKOUT_CLOSED" } });
    }
    nothingReached();
  });

  it("checks origin and body before authentication", async () => {
    expect((await POST(request('{"plan":"pro"}', { origin: "https://other.example" }))).status).toBe(403);
    expect((await POST(request('{"plan":"pro"}', { origin: null }))).status).toBe(403);
    for (const body of ["not-json", "{}", '{"plan":"free"}', '{"plan":"enterprise"}', '{"plan":"pro","price":"price_forged0001"}', '["pro"]']) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect((await POST(request('{"plan":"pro"}', { contentType: "text/plain" }))).status).toBe(400);
    expect((await POST(request(`{"plan":"pro","pad":"${"x".repeat(2000)}"}`))).status).toBe(413);
    expect(mocks.auth).not.toHaveBeenCalled();
    nothingReached();
  });

  it("admits only operators to test-mode checkout: a member is refused before configuration, the database or Stripe", async () => {
    // On production a member could otherwise pay with a Stripe test card and hold a paid plan for nothing.
    openIntake();
    for (const user of [{ id: USER, role: "user" }, { id: USER, role: "wholesale" }, { id: USER, role: "Admin" }, { id: USER, role: "" }, { id: USER }]) {
      mocks.auth.mockResolvedValue({ user });
      const response = await POST(request());
      expect(response.status).toBe(410);
      expect(response.headers.get("cache-control")).toContain("no-store");
      await expect(response.json()).resolves.toMatchObject({ error: { code: "DATA_API_CHECKOUT_CLOSED" } });
    }
    nothingReached();
    expect(mocks.bindCustomer).not.toHaveBeenCalled();
    // The same request from an operator reaches Stripe.
    mocks.auth.mockResolvedValue(OPERATOR);
    expect((await POST(request())).status).toBe(200);
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
  });

  it("requires a signed-in account before revealing whether intake is open", async () => {
    mocks.auth.mockResolvedValue(null);
    openIntake();
    expect((await POST(request())).status).toBe(401);
    nothingReached();
  });

  it("is unavailable, never live, without a test-mode configuration", async () => {
    stubEnv({ DATA_API_CHECKOUT_INTAKE: "test" });
    expect((await POST(request())).status).toBe(503);
    for (const key of ["sk_live_fixture_dataapi_0000001", "rk_live_fixture_dataapi_0000001"]) {
      openIntake({ DATA_API_STRIPE_SECRET_KEY: key });
      const response = await POST(request());
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "checkout_unavailable" } });
    }
    nothingReached();
  });

  it("sells nothing while no billing portal configuration is pinned, since a subscriber could not manage it", async () => {
    openIntake({ DATA_API_STRIPE_PORTAL_CONFIGURATION: "" });
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "checkout_unavailable" } });
    nothingReached();
  });

  it("refuses to stack a second subscription on one Stripe may still bill", async () => {
    openIntake();
    mocks.listOpen.mockResolvedValue([{ planId: "pro", status: "past_due", cancelAtPeriodEnd: false, currentPeriodEnd: null }]);
    const response = await POST(request('{"plan":"business"}'));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "subscription_exists" } });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});

describe("data-API checkout session", () => {
  it("creates the account's one customer, then a typed subscription Checkout", async () => {
    openIntake();
    vi.useFakeTimers({ now: new Date("2026-10-28T12:34:56Z"), toFake: ["Date"] });
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      schema: "cambridgetcg.data-api-billing-redirect/1", kind: "checkout", url: "https://checkout.stripe.com/c/pay/cs_test_dataapiroute001",
    });
    expect(mocks.createCustomer).toHaveBeenCalledWith(
      { metadata: { type: "data_api_customer", user_id: USER } },
      { idempotencyKey: `data-api:test:customer:${USER}` },
    );
    expect(mocks.bindCustomer).toHaveBeenCalledWith(USER, CUSTOMER);
    const [params, options] = mocks.createSession.mock.calls[0]!;
    const metadata = { type: "data_api_subscription", plan: "pro", user_id: USER };
    expect(params).toEqual({
      mode: "subscription", customer: CUSTOMER, client_reference_id: USER,
      line_items: [{ price: "price_dataapipro0001", quantity: 1 }],
      success_url: "https://cambridgetcg.com/account/data?billing=complete",
      cancel_url: "https://cambridgetcg.com/account/data?billing=cancelled",
      expires_at: Date.parse("2026-10-28T12:30:00Z") / 1000 + 3600,
      metadata, subscription_data: { metadata },
    });
    // Stripe needs at least thirty minutes; the window keeps it above fifty.
    expect(params.expires_at - Date.now() / 1000).toBeGreaterThanOrEqual(50 * 60);
    expect(options.idempotencyKey).toMatch(/^data-api:test:checkout:[0-9a-f]{64}$/);
  });

  it("reuses an existing customer and replays an identical request under the same key", async () => {
    openIntake();
    mocks.findCustomer.mockResolvedValue(CUSTOMER);
    vi.useFakeTimers({ now: new Date("2026-10-28T12:31:00Z"), toFake: ["Date"] });
    await POST(request());
    vi.setSystemTime(new Date("2026-10-28T12:39:59Z"));
    await POST(request());
    mocks.createSession.mockResolvedValueOnce(session({ metadata: { type: "data_api_subscription", plan: "business", user_id: USER } }));
    expect((await POST(request('{"plan":"business"}'))).status).toBe(200);
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    const keys = mocks.createSession.mock.calls.map(([, options]) => options.idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(mocks.createSession.mock.calls[2]![0].line_items).toEqual([{ price: "price_dataapibiz0001", quantity: 1 }]);
  });

  it.each<[string, Record<string, unknown>]>([
    ["a live session", { livemode: true }],
    ["an untyped session", { metadata: {} }],
    ["another customer", { customer: "cus_someoneelse001" }],
    ["another account", { client_reference_id: "someone-else" }],
    ["a payment session", { mode: "payment" }],
    ["a non-Stripe URL", { url: "https://evil.example/pay" }],
    ["a live session id", { id: "cs_live_dataapiroute001" }],
  ])("refuses %s from Stripe", async (_label, overrides) => {
    openIntake();
    mocks.createSession.mockResolvedValueOnce(session(overrides));
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "checkout_session_mismatch" } });
  });

  it("retrieves the configured price before any customer or session, and sells only the plan's own", async () => {
    openIntake();
    expect((await POST(request('{"plan":"business"}'))).status).toBe(200);
    expect(mocks.retrievePrice).toHaveBeenCalledWith("price_dataapibiz0001", { expand: ["product"] });
    expect(mocks.retrievePrice.mock.invocationCallOrder[0]).toBeLessThan(mocks.createCustomer.mock.invocationCallOrder[0]!);
  });

  it.each<[string, Record<string, string>, Record<string, unknown>]>([
    ["swapped Pro and Business variables", { DATA_API_STRIPE_PRICE_PRO: "price_dataapibiz0001", DATA_API_STRIPE_PRICE_BUSINESS: "price_dataapipro0001" }, {}],
    ["another amount", {}, { unit_amount: 1 }],
    ["another currency", {}, { currency: "usd" }],
    ["a yearly price", {}, { recurring: { interval: "year", interval_count: 1, usage_type: "licensed" } }],
    ["a metered price", {}, { recurring: { interval: "month", interval_count: 1, usage_type: "metered" } }],
    ["an archived price", {}, { active: false }],
    ["a live price", {}, { livemode: true }],
    ["another product's test price", {}, { product: { id: "prod_prismtest0001", object: "product", metadata: { type: "prism_signals_subscription" } } }],
  ])("refuses %s before creating a customer or a session", async (_label, env, overrides) => {
    openIntake(env);
    mocks.retrievePrice.mockImplementation(async (id: string) => ({ ...stripePrice(id), ...overrides }));
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "checkout_price_mismatch" } });
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(mocks.bindCustomer).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
    // The log names problem codes only, never an id or amount.
    expect(console.error).toHaveBeenCalledWith("[data-api/checkout POST] the configured price did not verify", expect.stringMatching(/^[a-z_,]+$/));
  });

  it("refuses a customer Stripe did not create in test mode", async () => {
    openIntake();
    mocks.createCustomer.mockResolvedValueOnce({ id: CUSTOMER, livemode: true });
    expect((await POST(request())).status).toBe(503);
    expect(mocks.bindCustomer).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("reports missing tables as not provisioned and hides provider detail", async () => {
    openIntake();
    mocks.listOpen.mockRejectedValueOnce(new DataApiBillingNotProvisionedError());
    let response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "billing_not_provisioned" } });
    mocks.createSession.mockRejectedValueOnce(new Error("secret provider detail"));
    response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.error.code).toBe("checkout_unavailable");
    expect(JSON.stringify(body)).not.toContain("secret provider detail");
  });
});
