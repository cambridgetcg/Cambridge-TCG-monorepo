import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { recordOrderFromStripeSession } from "@/lib/orders/record";
import { findStripeMarketCheckoutBinding, settleStripeMarketCheckout } from "@/lib/market/stripe-checkout-attempts";
import { POST } from "./route";

vi.mock("@/lib/wholesale/client", () => ({ reportSale: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/membership/db", () => ({ processOrderRewards: vi.fn(), recalculateTier: vi.fn() }));
vi.mock("@/lib/social/db", () => ({ postActivity: vi.fn(), awardAchievement: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/stock/reservations", () => ({
  commitCartToSale: vi.fn(),
  releaseHolder: vi.fn(async () => ({ ok: true, released: 0 })),
  holderForStripeSession: vi.fn((id: string) => id),
}));
vi.mock("@/lib/orders/record", () => ({ recordOrderFromStripeSession: vi.fn() }));
vi.mock("@/lib/market/stripe-checkout-attempts", () => ({
  findStripeMarketCheckoutBinding: vi.fn(),
  markStripeCheckoutAttemptTerminal: vi.fn(),
  recordStripeMarketCheckoutProcessing: vi.fn(),
  retireLegacyStripeSession: vi.fn(),
  settleStripeMarketCheckout: vi.fn(),
}));

const typed = { type: "data_api_subscription", plan: "pro", user_id: "8b7f0d2e-3c1a-4f5e-9a6b-1c2d3e4f5a6b" };
const retrievePaymentMethod = vi.fn();
const retrieveSubscription = vi.fn();

function deliver(type: string, object: unknown) {
  vi.mocked(getStripe).mockReturnValue({
    webhooks: { constructEvent: vi.fn(() => ({ id: "evt_main_dataapi", type, data: { object } })) },
    paymentMethods: { retrieve: retrievePaymentMethod },
    subscriptions: { retrieve: retrieveSubscription },
  } as never);
  return POST(new Request("https://example.test/api/webhooks/stripe", {
    method: "POST", headers: { "stripe-signature": "signed" }, body: "signed-body",
  }));
}
const subscription = (metadata: Record<string, string>) => ({
  id: "sub_dataapimain0001", object: "subscription", status: "canceled", cancel_at_period_end: false,
  default_payment_method: "pm_dataapimain0001", metadata, items: { data: [{ current_period_end: 1_795_000_000 }] },
});
const renewal = (subscriptionMetadata: Record<string, string>) => ({
  id: "in_dataapimain0001", object: "invoice", billing_reason: "subscription_cycle", metadata: {},
  parent: { type: "subscription_details", subscription_details: { subscription: "sub_dataapimain0001", metadata: subscriptionMetadata } },
  lines: { data: [{ period: { end: 1_795_000_000 } }] },
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 });
  vi.mocked(findStripeMarketCheckoutBinding).mockResolvedValue(null);
});

describe("main Stripe webhook leaves data-API objects to their own webhook", () => {
  it.each([
    ["customer.subscription.updated", subscription(typed)],
    ["customer.subscription.deleted", subscription(typed)],
    ["invoice.payment_succeeded", renewal(typed)],
  ])("ignores a typed %s without touching users or Stripe", async (type, object) => {
    const response = await deliver(type, object);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, ignored: "data_api_subscription" });
    expect(query).not.toHaveBeenCalled();
    expect(retrievePaymentMethod).not.toHaveBeenCalled();
  });

  it("still mirrors an untyped subscription onto its Platinum user row", async () => {
    await deliver("customer.subscription.updated", subscription({}));
    expect(retrievePaymentMethod).toHaveBeenCalledWith("pm_dataapimain0001");
    expect(String(vi.mocked(query).mock.calls[0]?.[0])).toContain("UPDATE users");
    vi.mocked(query).mockClear();
    await deliver("invoice.payment_succeeded", renewal({}));
    expect(String(vi.mocked(query).mock.calls[0]?.[0])).toContain("subscription_expires_at");
  });

  it("never fulfils a typed Checkout as retail, membership or market", async () => {
    const session = { id: "cs_test_dataapimain001", object: "checkout.session", mode: "subscription", status: "complete",
      payment_status: "paid", subscription: "sub_dataapimain0001", metadata: typed };
    expect((await deliver("checkout.session.completed", session)).status).toBe(200);
    expect(recordOrderFromStripeSession).not.toHaveBeenCalled();
    expect(settleStripeMarketCheckout).not.toHaveBeenCalled();
    expect(retrieveSubscription).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
