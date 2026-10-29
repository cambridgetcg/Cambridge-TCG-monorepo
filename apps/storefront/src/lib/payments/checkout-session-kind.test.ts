import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { DATA_API_SUBSCRIPTION_TYPE, checkoutSessionOwner, isDataApiSubscriptionObject } from "./checkout-session-kind";

const session = (metadata: Record<string, string> | null) => ({ id: "cs_test_kind", object: "checkout.session", metadata }) as unknown as Stripe.Checkout.Session;

describe("Checkout Session ownership", () => {
  it("gives data-API subscription sessions to their dedicated flow, never retail", () => {
    expect(DATA_API_SUBSCRIPTION_TYPE).toBe("data_api_subscription");
    expect(checkoutSessionOwner(session({ type: DATA_API_SUBSCRIPTION_TYPE, plan: "pro" }))).toBe("dedicated");
    expect(checkoutSessionOwner(session({ type: "market_trade_payment" }))).toBe("market_trade");
    expect(checkoutSessionOwner(session({ b2b_channel: "wholesale" }))).toBe("dedicated");
    expect(checkoutSessionOwner(session(null))).toBe("retail");
  });
});

describe("isDataApiSubscriptionObject", () => {
  it("recognises a subscription and its invoices by the subscription's type", () => {
    expect(isDataApiSubscriptionObject({ object: "subscription", metadata: { type: DATA_API_SUBSCRIPTION_TYPE } })).toBe(true);
    expect(isDataApiSubscriptionObject({ object: "invoice", metadata: {}, parent: { subscription_details: { metadata: { type: DATA_API_SUBSCRIPTION_TYPE } } } })).toBe(true);
    expect(isDataApiSubscriptionObject({ object: "invoice", subscription_details: { metadata: { type: DATA_API_SUBSCRIPTION_TYPE } } })).toBe(true);
  });

  it("leaves everything else alone, including objects that carry no copy of the type", () => {
    for (const object of [
      null, undefined, "sub_x", { metadata: null }, { metadata: { type: "platinum_subscription" } },
      { object: "invoice", parent: { subscription_details: { metadata: { type: "prism_signals_all_test_v1" } } } },
      { object: "charge", metadata: {} }, { object: "refund", metadata: {} }, { object: "dispute", metadata: {} },
    ]) {
      expect(isDataApiSubscriptionObject(object)).toBe(false);
    }
  });
});
