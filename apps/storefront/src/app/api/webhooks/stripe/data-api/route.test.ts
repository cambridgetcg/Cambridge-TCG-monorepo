import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getClient: vi.fn(), hasEvent: vi.fn(), record: vi.fn(), retrieveSubscription: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
// Real configuration, event planning and snapshot rules; Stripe reads and the store are injected fakes.
vi.mock("@/lib/data-api/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data-api/billing")>()),
  getDataApiStripeTestClient: mocks.getClient,
  hasDataApiStripeEvent: mocks.hasEvent,
  recordDataApiStripeEvent: mocks.record,
}));

import { DataApiBillingNotProvisionedError } from "@/lib/data-api/billing";
import { POST } from "./route";

const WEBHOOK_SECRET = "whsec_fixture_dataapi_00000001";
const CONFIG_ENV = {
  DATA_API_STRIPE_SECRET_KEY: "rk_test_fixture_dataapi_0000001",
  DATA_API_STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  DATA_API_STRIPE_PRICE_PRO: "price_dataapipro0001",
  DATA_API_STRIPE_PRICE_BUSINESS: "price_dataapibiz0001",
};
const actualStripe = new Stripe("sk_test_fixture_dataapi_01_x_x_x_x_x_x", { apiVersion: "2026-02-25.clover" });
const USER = "8b7f0d2e-3c1a-4f5e-9a6b-1c2d3e4f5a6b";
const SUB = "sub_dataapiroute0001";
const typed = { type: "data_api_subscription", plan: "pro", user_id: USER };
const T1 = 1_793_000_000;
const T2 = T1 + 60;

function payload(type: string, object: unknown, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ id: "evt_dataapiroute0001", object: "event", api_version: "2026-02-25.clover", created: T1,
    data: { object }, livemode: false, pending_webhooks: 1, request: null, type, ...overrides });
}
function signed(body: string, options: { secret?: string; signature?: string | null; signedBody?: string } = {}): Request {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  const signature = options.signature === undefined
    ? actualStripe.webhooks.generateTestHeaderString({ payload: options.signedBody ?? body, secret: options.secret ?? WEBHOOK_SECRET })
    : options.signature;
  if (signature !== null) headers.set("stripe-signature", signature);
  return new Request("https://cambridgetcg.com/api/webhooks/stripe/data-api", { method: "POST", headers, body });
}
function subscription(overrides: Record<string, unknown> = {}) {
  return { id: SUB, object: "subscription", livemode: false, customer: "cus_dataapiroute001", metadata: typed, status: "active",
    cancel_at_period_end: false, items: { object: "list", has_more: false, data: [{ quantity: 1, current_period_end: T1 + 30 * 86_400, price: { id: "price_dataapipro0001" } }] },
    ...overrides };
}
const checkoutSession = (overrides: Record<string, unknown> = {}) => ({
  id: "cs_test_dataapiroute001", object: "checkout.session", livemode: false, mode: "subscription", subscription: SUB, metadata: typed, ...overrides,
});
const receipt = (type: string, created = T1) => ({ eventId: "evt_dataapiroute0001", eventType: type, providerCreatedAt: new Date(created * 1000).toISOString() });
const sync = (snapshot: Record<string, unknown> = {}) => ({ kind: "sync", snapshot: {
  subscriptionId: SUB, customerId: "cus_dataapiroute001", userId: USER, planId: "pro", planUnresolved: null, status: "active",
  currentPeriodEnd: new Date((T1 + 30 * 86_400) * 1000).toISOString(), cancelAtPeriodEnd: false, ...snapshot,
} });
const retiredPrice = { items: { has_more: false, data: [{ quantity: 1, current_period_end: T1 + 30 * 86_400, price: { id: "price_retired000001" } }] } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  for (const [key, value] of Object.entries(CONFIG_ENV)) vi.stubEnv(key, value);
  mocks.hasEvent.mockResolvedValue(false);
  mocks.record.mockImplementation(async (_receipt, decision) => ({
    disposition: "recorded", outcome: decision.kind === "sync" ? "applied" : "ignored", code: decision.kind === "sync" ? "subscription_synced" : decision.code,
  }));
  mocks.retrieveSubscription.mockResolvedValue(subscription());
  mocks.getClient.mockReturnValue({ webhooks: actualStripe.webhooks, subscriptions: { retrieve: mocks.retrieveSubscription } });
});
afterEach(() => vi.unstubAllEnvs());

describe("data-API Stripe webhook: verification", () => {
  it("is unavailable (and Stripe retries) without a test-mode configuration", async () => {
    vi.stubEnv("DATA_API_STRIPE_SECRET_KEY", "sk_live_fixture_dataapi_0000001");
    expect((await POST(signed(payload("customer.subscription.updated", subscription())))).status).toBe(503);
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it.each<[string, Parameters<typeof signed>[1]]>([
    ["no signature", { signature: null }],
    ["a malformed signature", { signature: "t=1,v1=00" }],
    ["another endpoint's secret", { secret: "whsec_fixture_someoneelse_00001" }],
    ["a body other than the one signed", { signedBody: payload("customer.subscription.updated", subscription({ status: "canceled" })) }],
  ])("refuses %s before recording or reading anything", async (_label, options) => {
    const response = await POST(signed(payload("customer.subscription.updated", subscription()), options));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_signature" } });
    expect(mocks.hasEvent).not.toHaveBeenCalled();
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("refuses a correctly signed live-mode event", async () => {
    const response = await POST(signed(payload("customer.subscription.updated", subscription({ livemode: true }), { livemode: true })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "live_event_refused" } });
    expect(mocks.hasEvent).not.toHaveBeenCalled();
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("refuses connected-account events", async () => {
    const response = await POST(signed(payload("customer.subscription.updated", subscription(), { account: "acct_connected0001" })));
    expect(response.status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
  });
});

describe("data-API Stripe webhook: handling", () => {
  it("answers a duplicate delivery without reading Stripe or writing again", async () => {
    mocks.hasEvent.mockResolvedValue(true);
    const response = await POST(signed(payload("checkout.session.completed", checkoutSession())));
    expect(response.status).toBe(200);
    expect(mocks.hasEvent).toHaveBeenCalledWith("evt_dataapiroute0001");
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("syncs a typed Checkout from the subscription Stripe holds now", async () => {
    const response = await POST(signed(payload("checkout.session.completed", checkoutSession())));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(mocks.retrieveSubscription).toHaveBeenCalledWith(SUB);
    expect(mocks.record).toHaveBeenCalledWith(receipt("checkout.session.completed"), sync());
  });

  it("records another flow's Checkout as ignored without reading Stripe", async () => {
    const response = await POST(signed(payload("checkout.session.completed", checkoutSession({ metadata: { type: "prism_signals_all_test_v1" } }))));
    expect(response.status).toBe(200);
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(receipt("checkout.session.completed"), { kind: "ignore", code: "not_data_api_object" });
  });

  it("takes the plan from the current price, not the event's copy or metadata", async () => {
    mocks.retrieveSubscription.mockResolvedValueOnce(subscription({ items: { has_more: false, data: [{ quantity: 1, current_period_end: T2, price: { id: "price_dataapibiz0001" } }] } }));
    await POST(signed(payload("customer.subscription.updated", subscription())));
    expect(mocks.record).toHaveBeenCalledWith(receipt("customer.subscription.updated"), sync({ planId: "business", currentPeriodEnd: new Date(T2 * 1000).toISOString() }));
  });

  it("follows a failed invoice and a deletion to the subscription's status", async () => {
    mocks.retrieveSubscription.mockResolvedValueOnce(subscription({ status: "past_due" }));
    await POST(signed(payload("invoice.payment_failed", { object: "invoice", parent: { type: "subscription_details", subscription_details: { subscription: SUB, metadata: typed } } })));
    expect(mocks.record).toHaveBeenLastCalledWith(receipt("invoice.payment_failed"), sync({ status: "past_due" }));
    mocks.retrieveSubscription.mockResolvedValueOnce(subscription({ status: "canceled" }));
    await POST(signed(payload("customer.subscription.deleted", subscription({ status: "canceled" }))));
    expect(mocks.record).toHaveBeenLastCalledWith(receipt("customer.subscription.deleted"), sync({ status: "canceled" }));
  });

  it("hands the store a subscription on a price no plan answers, and says so loudly when it is refused", async () => {
    mocks.retrieveSubscription.mockResolvedValueOnce(subscription(retiredPrice));
    mocks.record.mockResolvedValueOnce({ disposition: "recorded", outcome: "ignored", code: "subscription_price_unknown" });
    const response = await POST(signed(payload("customer.subscription.updated", subscription())));
    expect(response.status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith(receipt("customer.subscription.updated"), sync({ planId: null, planUnresolved: "subscription_price_unknown" }));
    expect(console.error).toHaveBeenCalledWith(`[webhooks/stripe/data-api] customer.subscription.updated evt_dataapiroute0001 ignored: subscription_price_unknown`);
  });

  it("passes a cancellation on a retired price through to the store, and still asks a person to look", async () => {
    mocks.retrieveSubscription.mockResolvedValueOnce(subscription({ ...retiredPrice, status: "canceled" }));
    mocks.record.mockResolvedValueOnce({ disposition: "recorded", outcome: "applied", code: "status_synced_plan_kept" });
    const response = await POST(signed(payload("customer.subscription.deleted", subscription({ status: "canceled" }))));
    expect(response.status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith(receipt("customer.subscription.deleted"), sync({ planId: null, planUnresolved: "subscription_price_unknown", status: "canceled" }));
    expect(console.error).toHaveBeenCalledWith(
      `[webhooks/stripe/data-api] customer.subscription.deleted evt_dataapiroute0001 applied: status_synced_plan_kept (plan unresolved: subscription_price_unknown)`,
    );
  });

  it("stays quiet for a subscription inside the contract", async () => {
    await POST(signed(payload("customer.subscription.updated", subscription())));
    expect(console.error).not.toHaveBeenCalled();
  });

  it("passes each event's own Stripe time, so an older event arriving late cannot win", async () => {
    mocks.record.mockResolvedValueOnce({ disposition: "recorded", outcome: "applied", code: "subscription_synced" })
      .mockResolvedValueOnce({ disposition: "recorded", outcome: "ignored", code: "older_than_recorded" });
    const newer = await POST(signed(payload("customer.subscription.updated", subscription(), { id: "evt_dataapinewer001", created: T2 })));
    const older = await POST(signed(payload("customer.subscription.created", subscription({ status: "incomplete" }), { id: "evt_dataapiolder001", created: T1 })));
    expect([newer.status, older.status]).toEqual([200, 200]);
    expect(mocks.record.mock.calls.map(([r]) => [r.eventId, r.providerCreatedAt])).toEqual([
      ["evt_dataapinewer001", new Date(T2 * 1000).toISOString()],
      ["evt_dataapiolder001", new Date(T1 * 1000).toISOString()],
    ]);
  });

  it("answers 503 so Stripe retries when Stripe or the store fails, or 0142 is missing", async () => {
    mocks.retrieveSubscription.mockRejectedValueOnce(new Error("secret provider detail"));
    let response = await POST(signed(payload("customer.subscription.updated", subscription())));
    expect(response.status).toBe(503);
    expect(mocks.record).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("secret provider detail");

    mocks.record.mockRejectedValueOnce(new Error("connection reset"));
    expect((await POST(signed(payload("customer.subscription.updated", subscription())))).status).toBe(503);

    mocks.hasEvent.mockRejectedValueOnce(new DataApiBillingNotProvisionedError());
    response = await POST(signed(payload("customer.subscription.updated", subscription())));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "billing_not_provisioned" } });
  });
});
